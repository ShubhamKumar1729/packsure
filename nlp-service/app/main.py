"""PackSure NLP service (FastAPI) — OCR + legal-metrology NER + normalization.

Endpoints:
    GET  /health     service + model + OCR engine status
    POST /ocr        image  -> word-level OCR (text, bbox, confidence)
    POST /extract    ocr_text (+ optional words) -> structured legal-metrology fields
    POST /pipeline   image  -> OCR + extraction + CV observations (used by the Node backend)

Security: optional shared-secret header (X-API-Key, env NLP_API_KEY); strict
image validation in preprocessing; request size cap; no path traversal (uploaded
filenames are ignored); no secrets in logs (Phase 28).
"""

import logging

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse

from . import cv_metrics, extractor as extractor_module
from . import config as service_config
from .config import MAX_IMAGE_BYTES, MODEL_VERSION, OCR_LANG
from .entities import FIELD_KEYS
from .inference import ModelNotAvailable, model_info, model_is_available, predict_entities
from .ocr import OcrUnavailable, run_ocr, tesseract_available
from .patterns import dedupe_entities, extract_with_patterns
from .preprocessing import ImageValidationError, load_image
from .schemas import (
    ExtractRequest,
    ExtractResponse,
    HealthResponse,
    ModelInfo,
    OcrResult,
    PipelineResponse,
    CvObservations,
)
from .spans import RawEntity, tokenize_with_offsets

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
logger = logging.getLogger("packsure-nlp")

app = FastAPI(title="PackSure NLP Service", version="1.0.0")

_MODEL_STATE = {"loaded": None}  # lazy; determined on first use


def model_state() -> bool:
    if _MODEL_STATE["loaded"] is None:
        _MODEL_STATE["loaded"] = model_is_available()
        if not _MODEL_STATE["loaded"]:
            logger.warning("No trained NER model loaded; /extract will use the transparent pattern extractor (degraded).")
    return bool(_MODEL_STATE["loaded"])


@app.middleware("http")
async def api_key_guard(request: Request, call_next):
    if service_config.NLP_API_KEY:
        provided = request.headers.get("x-api-key", "")
        if provided != service_config.NLP_API_KEY:
            return JSONResponse({"detail": "Invalid or missing X-API-Key header."}, status_code=401)
    return await call_next(request)


def _model_info(extractor_name: str, degraded: bool, detail: str | None = None) -> ModelInfo:
    info = model_info()
    return ModelInfo(
        name=info["name"],
        base_model=info["base_model"],
        version=MODEL_VERSION if extractor_name == "ner_model" else "pattern-rules",
        extractor=extractor_name,
        degraded=degraded,
        detail=detail,
    )


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    loaded = model_state()
    ocr_ok = tesseract_available()
    if loaded and ocr_ok:
        status = "ok"
    elif ocr_ok:
        status = "degraded"  # service works via pattern extractor, no trained model yet
    else:
        status = "degraded"
    detail = None
    if not loaded:
        detail = "No trained model artifact present; extractions come from the deterministic pattern extractor and are marked degraded."
    return HealthResponse(
        status=status,
        model_loaded=loaded,
        model=_model_info("ner_model" if loaded else "pattern_rules", degraded=not loaded, detail=detail),
        ocr_engine_available=ocr_ok,
    )


@app.post("/ocr", response_model=OcrResult)
async def ocr_endpoint(image: UploadFile = File(...), lang: str = Form(default=OCR_LANG)) -> OcrResult:
    try:
        data = await image.read()
        pil_image = load_image(data)
        return OcrResult(**run_ocr(pil_image, lang))
    except ImageValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except OcrUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


def run_extraction(text: str, word_entries: list[dict]) -> dict:
    """Shared extraction core used by /extract and /pipeline.

    Chooses the trained model when loaded, otherwise the transparent pattern
    extractor. Both paths produce RawEntity spans that go through the same
    reconstruction/normalization code (Phase 6), so results are comparable.
    Returns the response payload without CV observations.
    """
    tokens = tokenize_with_offsets(text)
    model_available = model_state()
    extractor_name = "ner_model" if model_available else "pattern_rules"
    detail = None
    artifact_version = MODEL_VERSION
    entities: list[RawEntity] = []

    if model_available:
        try:
            entities, artifact_version = predict_entities(text, tokens)
        except ModelNotAvailable as error:
            model_available, extractor_name, detail = False, "pattern_rules", str(error)
        except Exception:  # noqa: BLE001 - model failure degrades, never crashes (Phase 23)
            logger.exception("NER inference failed")
            model_available, extractor_name = False, "pattern_rules"
            detail = "The trained model failed on this input; the deterministic extractor was used instead."
    if not model_available:
        entities = dedupe_entities(
            extract_with_patterns(text, extractor_module.word_confidences_for_tokens(tokens, word_entries))
        )

    fields, missing = extractor_module.build_fields(entities, tokens, word_entries)
    warnings = extractor_module.warnings_for(fields)
    if extractor_name == "pattern_rules":
        warnings.insert(0, "Extracted with the deterministic pattern extractor, not the trained NER model (degraded mode).")

    model_block = _model_info(extractor_name, degraded=extractor_name != "ner_model", detail=detail)
    if extractor_name == "ner_model":
        model_block.version = artifact_version
    return {
        "fields": fields,
        "missing_fields": missing,
        "model": model_block,
        "warnings": warnings,
    }


def _extract_payload(request: ExtractRequest) -> dict:
    word_entries = [w.model_dump() for w in request.words] if request.words else []
    payload = run_extraction(request.ocr_text, word_entries)
    return {"success": True, **payload}


@app.post("/extract", response_model=ExtractResponse)
def extract_endpoint(request: ExtractRequest) -> ExtractResponse:
    return ExtractResponse(**_extract_payload(request))


@app.post("/pipeline", response_model=PipelineResponse)
async def pipeline_endpoint(image: UploadFile = File(...), lang: str = Form(default=OCR_LANG)) -> PipelineResponse:
    try:
        data = await image.read()
        if len(data) > MAX_IMAGE_BYTES:
            raise ImageValidationError(f"The uploaded image exceeds the {MAX_IMAGE_BYTES // (1024 * 1024)} MB limit.")
        pil_image = load_image(data)
        ocr = run_ocr(pil_image, lang)
    except ImageValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except OcrUnavailable as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    word_confidences = [word["confidence"] for word in ocr["words"]]
    if not ocr["text"].strip():
        return PipelineResponse(
            ocr=OcrResult(**ocr),
            fields={},
            missing_fields=list(FIELD_KEYS),
            cv=CvObservations(**cv_metrics.collect_observations(pil_image, ocr["words"])),
            model=_model_info("ner_model" if model_state() else "pattern_rules", degraded=not model_state()),
            warnings=["OCR returned no text; nothing was extracted. Verify the image quality or add clearer photos."],
        )

    extraction = run_extraction(ocr["text"], ocr["words"])
    _ = word_confidences  # confidences travel inside ocr["words"]
    return PipelineResponse(
        ocr=OcrResult(**ocr),
        fields=extraction["fields"],
        missing_fields=extraction["missing_fields"],
        cv=CvObservations(**cv_metrics.collect_observations(pil_image, ocr["words"])),
        model=extraction["model"],
        warnings=extraction["warnings"],
    )


@app.exception_handler(Exception)
async def unhandled_handler(request: Request, error: Exception) -> JSONResponse:  # pragma: no cover
    logger.exception("Unhandled service error")
    return JSONResponse({"detail": "The NLP service hit an unexpected error. Please retry."}, status_code=500)

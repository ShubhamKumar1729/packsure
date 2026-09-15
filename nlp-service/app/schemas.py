"""Stable API schemas (Pydantic v2). The Node backend depends on this contract.

Bounding boxes come back in BOTH pixel space (bbox_px) and normalized space
(bbox: x, y, width, height as fractions of image width/height, 0..1, matching
the PackSure backend's `BoundingBox` type).
"""

from pydantic import BaseModel, Field, field_validator


class BoundingBox(BaseModel):
    x: float = Field(..., ge=0, le=1, description="normalized left edge")
    y: float = Field(..., ge=0, le=1, description="normalized top edge")
    width: float = Field(..., ge=0, le=1)
    height: float = Field(..., ge=0, le=1)


class OcrWord(BaseModel):
    text: str
    confidence: float = Field(..., ge=0, le=1)
    bbox_px: tuple[int, int, int, int] = Field(..., description="left, top, width, height in pixels")
    bbox: BoundingBox | None = None
    line: int | None = Field(None, description="OCR line/block grouping id")


class OcrResult(BaseModel):
    status: str = Field(..., description="completed | empty | failed")
    text: str = ""
    confidence: float = Field(0.0, ge=0, le=1)
    words: list[OcrWord] = []
    engine: str = "tesseract"
    error: str | None = None


class InputWord(BaseModel):
    """Optional word-level OCR input to /extract so fields can carry bboxes."""

    text: str
    confidence: float = Field(1.0, ge=0, le=1)
    bbox_px: tuple[int, int, int, int] | None = None
    bbox: BoundingBox | None = None
    line: int | None = None


class ExtractRequest(BaseModel):
    ocr_text: str = Field(..., min_length=1, max_length=20000)
    words: list[InputWord] | None = None
    image_width: int | None = Field(None, ge=1)
    image_height: int | None = Field(None, ge=1)

    @field_validator("ocr_text")
    @classmethod
    def not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("ocr_text must contain non-whitespace characters")
        return value


class ModelInfo(BaseModel):
    name: str
    base_model: str
    version: str
    # Which extractor produced these fields: "ner_model" or "pattern_rules".
    extractor: str
    # True when the trained transformer was unavailable and the transparent
    # deterministic pattern extractor was used instead. Always surfaced; the
    # frontend shows a warning when true.
    degraded: bool
    detail: str | None = None


class ExtractedField(BaseModel):
    field: str = Field(..., description="snake_case field key, e.g. mrp")
    label: str = Field(..., description="entity label, e.g. MRP")
    value: str | None = Field(None, description="normalized value; null when not found")
    raw_value: str | None = Field(None, description="verbatim OCR source span; never altered")
    confidence: float = Field(..., ge=0, le=1)
    bbox: BoundingBox | None = None
    bbox_px: tuple[int, int, int, int] | None = None
    normalized: dict | None = Field(None, description="structured normalization output (magnitude/unit/iso date...)")
    ocr_word_confidences: list[float] | None = None


class ExtractResponse(BaseModel):
    success: bool = True
    fields: dict[str, ExtractedField] = Field(..., description="one entry per detected field; missing fields are absent")
    missing_fields: list[str] = Field(default_factory=list)
    model: ModelInfo
    warnings: list[str] = Field(default_factory=list)


class BarcodeInfo(BaseModel):
    text: str
    format: str
    # Human-readable GTIN validity note; we do NOT claim a product identity.
    valid_gtin_checkdigit: bool | None = None


class CvObservations(BaseModel):
    """Computer-vision observations. Every field is honest about reliability:
    values that cannot be established from the input are null, never invented."""

    # Average character height in pixels (font-size proxy). Pixel value only.
    text_char_height_px: float | None = None
    # Physical mm estimate is emitted ONLY when a scale reference (e.g. a decoded
    # barcode) exists in the image; otherwise null with a reason.
    text_char_height_mm: float | None = None
    scale_source: str | None = Field(None, description="how the px→mm scale was derived, e.g. 'ean13_barcode'")
    scale_note: str | None = Field(None, description="explicit assumptions behind the scale estimate")
    barcodes: list[BarcodeInfo] = []
    # Tampering detection is NOT implemented (no trained model); always null.
    tampering_probability: None = Field(None, description="not implemented; never fabricated")
    sticker_overlay_anomaly: None = Field(None, description="not implemented; never fabricated")


class PipelineResponse(BaseModel):
    success: bool = True
    ocr: OcrResult
    fields: dict[str, ExtractedField]
    missing_fields: list[str]
    cv: CvObservations
    model: ModelInfo
    warnings: list[str] = Field(default_factory=list)


class HealthResponse(BaseModel):
    status: str = Field(..., description="ok | degraded | error")
    service: str = "packsure-nlp"
    model_loaded: bool
    model: ModelInfo
    ocr_engine_available: bool
    version: str = "1.0.0"

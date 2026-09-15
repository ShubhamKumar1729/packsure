"""OCR module (Tesseract via pytesseract) — Phase 2.

Returns word-level results with text, pixel bbox, normalized bbox and
confidence, plus the assembled raw text. Raw OCR text is authoritative and is
NEVER cleaned before extraction (Phase 2 policy) — only layout-preserving line
grouping is applied.
"""

import logging

from PIL import Image

from .preprocessing import preprocess_for_ocr

logger = logging.getLogger("packsure-nlp")

ENGINE_NAME = "tesseract"


class OcrUnavailable(RuntimeError):
    """Raised when the Tesseract binary is not installed in this deployment."""


def tesseract_available() -> bool:
    try:
        import pytesseract

        return pytesseract.get_tesseract_version() is not None
    except Exception:  # noqa: BLE001 - missing binary/library both mean unavailable
        return False


def _word_entries(image: Image.Image, lang: str) -> tuple[list[dict], str]:
    import pytesseract

    data = pytesseract.image_to_data(image, lang=lang, output_type=pytesseract.Output.DICT)
    words: list[dict] = []
    lines: list[str] = []
    image_width, image_height = image.size

    current_block_key = None
    line_parts: list[str] = []
    for index, raw_text in enumerate(data["text"]):
        text = (raw_text or "").strip()
        conf_raw = float(data["conf"][index])
        if not text or conf_raw < 0:
            continue
        confidence = min(conf_raw / 100.0, 1.0)
        left, top, width, height = (
            int(data["left"][index]),
            int(data["top"][index]),
            int(data["width"][index]),
            int(data["height"][index]),
        )
        key = (data["block_num"][index], data["par_num"][index], data["line_num"][index])
        if current_block_key is not None and key != current_block_key:
            lines.append(" ".join(line_parts))
            line_parts = []
        current_block_key = key
        line_parts.append(text)
        words.append(
            {
                "text": text,
                "confidence": round(confidence, 4),
                "bbox_px": (left, top, width, height),
                "bbox": {
                    "x": round(left / image_width, 5),
                    "y": round(top / image_height, 5),
                    "width": round(width / image_width, 5),
                    "height": round(height / image_height, 5),
                },
                "line": int(data["line_num"][index]),
            }
        )
    if line_parts:
        lines.append(" ".join(line_parts))
    return words, "\n".join(lines)


def run_ocr(image: Image.Image, lang: str) -> dict:
    """Full-image OCR. Output shape matches the spec's Phase 2 contract:
    per-region {text, bbox, confidence} plus the assembled raw text."""
    if not tesseract_available():
        raise OcrUnavailable("The Tesseract OCR engine is not installed in this deployment.")
    processed = preprocess_for_ocr(image)
    words, text = _word_entries(processed, lang)
    confidences = [word["confidence"] for word in words]
    overall = round(sum(confidences) / len(confidences), 4) if confidences else 0.0
    return {
        "status": "completed" if words else "empty",
        "text": text,
        "confidence": overall,
        "words": words,
        "engine": ENGINE_NAME,
    }

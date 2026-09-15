"""Confidence handling (Phase 12).

Model/OCR confidences here are RAW SCORES, not calibrated probabilities — no
calibration has been performed and we never claim otherwise. The service maps
raw scores to three explicit bands consumed by the frontend:

    high   -> automatic processing
    medium -> warning shown / review recommended
    low    -> flagged for manual verification

Bands are configurable via env (see config.py).
"""

from .config import CONFIDENCE_HIGH, CONFIDENCE_MEDIUM, REVIEW_BAND


def band(confidence: float) -> str:
    if confidence >= CONFIDENCE_HIGH:
        return "high"
    if confidence >= CONFIDENCE_MEDIUM:
        return "medium"
    return "low"


def combine(ocr_confidence: float, extraction_confidence: float) -> float:
    """Geometric mean — punishes disagreement between OCR and extraction.

    Documented formula: sqrt(ocr * extraction). Not a calibrated probability.
    """
    return round((max(ocr_confidence, 0.0) * max(extraction_confidence, 0.0)) ** 0.5, 4)


def needs_manual_review(confidence: float) -> bool:
    return confidence < CONFIDENCE_MEDIUM


REVIEW_BAND_LABEL = REVIEW_BAND

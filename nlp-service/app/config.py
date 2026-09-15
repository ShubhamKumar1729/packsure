"""Service configuration. Everything is env-driven; no hardcoded hosts or secrets."""

import os
from pathlib import Path

# --- Service -----------------------------------------------------------------
NLP_API_KEY = os.environ.get("NLP_API_KEY", "").strip() or None  # optional shared-secret header
MAX_IMAGE_BYTES = int(os.environ.get("NLP_MAX_IMAGE_BYTES", str(8 * 1024 * 1024)))  # keep in sync with the Node backend (8 MiB)
ALLOWED_IMAGE_FORMATS = {"JPEG", "PNG", "WEBP"}
REQUEST_TIMEOUT_SECONDS = 90

# --- Model artifact ----------------------------------------------------------
MODEL_DIR = Path(os.environ.get("MODEL_PATH", Path(__file__).resolve().parent.parent / "model" / "legal_metrology_ner"))
# Version reported by /health and every extraction. Override after each training export.
MODEL_VERSION = os.environ.get("MODEL_VERSION", "0.0.0-untrained")

# Base-model metadata advertised with the response (what the artifact was trained from).
MODEL_BASE = os.environ.get("MODEL_BASE_MODEL", "ModernBERT")
MODEL_NAME = os.environ.get("MODEL_NAME", "Legal-Metrology-NER")

# --- Extraction behaviour ----------------------------------------------------
# Deterministic keyword/pattern extractor used when the trained model is absent
# or fails to load. Responses always name the extractor that produced the fields.
FALLBACK_EXTRACTOR_ENABLED = os.environ.get("NLP_FALLBACK_EXTRACTOR", "true").lower() != "false"

# Confidence bands exposed to the frontend (NOT calibrated probabilities — they
# are raw model/OCR scores; see docs/LEGAL_NOTES.md, Phase 12 policy).
CONFIDENCE_HIGH = float(os.environ.get("NLP_CONFIDENCE_HIGH", "0.85"))
CONFIDENCE_MEDIUM = float(os.environ.get("NLP_CONFIDENCE_MEDIUM", "0.60"))
# Fields below the medium band are flagged for manual verification.
REVIEW_BAND = "manual_verification_recommended"

# --- OCR ---------------------------------------------------------------------
# Tesseract language pack(s), e.g. "eng" or "eng+hin".
OCR_LANG = os.environ.get("NLP_OCR_LANG", "eng")
# Upscale factor applied before OCR for small label images.
OCR_UPSCALE_MIN_WIDTH = int(os.environ.get("NLP_OCR_MIN_WIDTH", "1000"))

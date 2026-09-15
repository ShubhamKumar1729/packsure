"""Computer-vision observations (Phase 13) — deliberately honest.

Implemented (labeled as PROTOTYPE where applicable):
  1. Barcode DETECTION (zxing-cpp) with decode + format. We do not claim product
     identity from a barcode; we report the decoded value and GTIN check-digit
     validity.
  2. Text character-height estimation in PIXELS (font-size proxy) from OCR word
     box heights (median). Pixel value only.
  3. Pixel-per-mm scale estimation ONLY when an EAN-13 barcode exists, using the
     standard nominal EAN-13 width (37.29 mm at 100% magnification). The 100%
     magnification assumption is EXPLICIT and often wrong (labels may print at
     80%-200%); every response carries `scale_note` saying so. When no barcode
     exists, the measurement is null — "unable to determine reliably".

NOT implemented (always null, never fabricated):
  - Tampering detection (no trained model exists in this repository).
  - Sticker/overlay anomaly detection.
"""

import statistics
from typing import Any

EAN13_NOMINAL_WIDTH_MM = 37.29  # 113 modules x 0.33 mm at 100% magnification
SCALE_NOTE = (
    "Scale derived from a detected EAN-13 barcode assuming 100% magnification "
    "(nominal width 37.29 mm). Real labels may legally print at 80%-200% "
    "magnification, so any mm estimate from this scale is approximate."
)
SCALE_UNAVAILABLE_NOTE = "No scale reference (barcode) detected in the image; physical mm measurement cannot be determined reliably and is not estimated."


def detect_barcodes(image: Any) -> list[dict]:
    """Decode barcodes. zxing-cpp is an optional dependency; missing -> []."""
    try:
        from zxingcpp import read_barcodes  # type: ignore
    except ImportError:
        return []
    try:
        results = read_barcodes(image)
    except Exception:  # noqa: BLE001 - decode failures must never break a request
        return []
    barcodes: list[dict] = []
    for result in results:
        entry = {"text": result.text, "format": str(result.format.name), "valid_gtin_checkdigit": None}
        if result.format.name in {"EAN_13", "EAN_8", "UPC_A", "UPC_E", "ITF"} and result.text.isdigit():
            entry["valid_gtin_checkdigit"] = _gtin_checkdigit_valid(result.text)
        barcodes.append(entry)
    return barcodes


def _gtin_checkdigit(digits: str) -> int:
    total = sum(int(d) * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(digits)))
    return (10 - (total % 10)) % 10


def _gtin_checkdigit_valid(digits: str) -> bool:
    if not digits.isdigit() or len(digits) < 8:
        return False
    body, provided = digits[:-1], int(digits[-1])
    return _gtin_checkdigit(body) == provided


def estimate_char_height_px(words: list[dict]) -> float | None:
    """Median OCR word-box height in pixels (font-size proxy, PROTOTYPE)."""
    heights = [word["bbox_px"][3] for word in words if word.get("bbox_px") and word["bbox_px"][3] > 0]
    if not heights:
        return None
    return round(statistics.median(heights), 2)


def estimate_scale(barcodes: list[dict], image) -> tuple[float | None, str | None, str | None]:
    """px-per-mm scale from an EAN-13 barcode, with explicit assumptions.

    Returns (px_per_mm, source, note). (None, None, note) when no reference.
    """
    from .cv_metrics import EAN13_NOMINAL_WIDTH_MM, SCALE_NOTE, SCALE_UNAVAILABLE_NOTE

    for barcode in barcodes:
        if barcode["format"] != "EAN_13":
            continue
        module_width_px = _ean13_module_width_px(image, barcode)
        if module_width_px:
            px_per_mm = module_width_px / 0.33  # 0.33 mm per module at 100%
            return round(px_per_mm, 3), "ean13_barcode", SCALE_NOTE
    return None, None, SCALE_UNAVAILABLE_NOTE


def _ean13_module_width_px(image: Any, barcode: dict) -> float | None:
    """Locate the barcode to measure its width via a 95-module span.

    Uses zxing-cpp position information when available; returns None if the
    position cannot be established (we never guess geometry).
    """
    try:
        from zxingcpp import read_barcodes  # type: ignore

        results = read_barcodes(image)
        for result in results:
            if result.text == barcode["text"] and result.position is not None:
                pos = result.position
                width_px = abs(pos.top_right.x - pos.top_left.x)
                # EAN-13 spans 95 modules (11+ quiet zones excluded by zxing).
                if width_px > 0:
                    return width_px / 95.0
    except Exception:  # noqa: BLE001
        return None
    return None


def collect_observations(image: Any, words: list[dict]) -> dict:
    barcodes = detect_barcodes(image)
    char_height_px = estimate_char_height_px(words)
    px_per_mm, scale_source, scale_note = estimate_scale(barcodes, image)
    char_height_mm: float | None = None
    if px_per_mm and char_height_px:
        char_height_mm = round(char_height_px / px_per_mm, 2)
    return {
        "text_char_height_px": char_height_px,
        "text_char_height_mm": char_height_mm,
        "scale_source": scale_source,
        "scale_note": scale_note,
        "barcodes": barcodes,
        "tampering_probability": None,
        "sticker_overlay_anomaly": None,
    }

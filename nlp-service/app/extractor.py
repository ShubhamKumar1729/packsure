"""Extraction orchestration (Phase 6): entities -> structured fields.

Both the trained model and the pattern extractor produce `RawEntity` spans;
this module reconstructs entities, associates bboxes, propagates confidence
(geometric mean of OCR and extraction scores), normalizes values, and keeps
raw_value verbatim. Missing fields are null — nothing is invented.
"""

from .confidence import band, combine
from .entities import ENTITY_LABELS, LABEL_TO_FIELD
from .normalization import normalize_field
from .spans import RawEntity, Token, bbox_for_words, tokenize_with_offsets


def build_fields(entities: list[RawEntity], tokens: list[Token], word_entries: list[dict]) -> tuple[dict, list[str]]:
    fields: dict[str, dict] = {}
    for entity in entities:
        field_key = LABEL_TO_FIELD.get(entity.label)
        if field_key is None:
            continue  # unknown label: never silently mapped to a legal field
        normalized = normalize_field(field_key, entity.text)
        bbox_data = bbox_for_words(word_entries, entity.word_indices) if word_entries else None
        ocr_confidences = [
            word_entries[i]["confidence"]
            for i in entity.word_indices
            if i < len(word_entries) and "confidence" in word_entries[i]
        ]
        mean_ocr = sum(ocr_confidences) / len(ocr_confidences) if ocr_confidences else 1.0
        confidence = combine(mean_ocr, entity.confidence)
        normalized_value = None
        unit = None
        if normalized is not None:
            normalized_value = normalized.get("value") or normalized.get("iso")
            unit = normalized.get("unit")
        field_entry = {
            "field": field_key,
            "label": entity.label,
            "value": normalized_value,
            "raw_value": entity.text,
            "confidence": confidence,
            "confidence_band": band(confidence),
            "bbox": bbox_data.get("bbox") if bbox_data else None,
            "bbox_px": bbox_data.get("bbox_px") if bbox_data else None,
            "normalized": normalized,
            "ocr_word_confidences": [round(c, 4) for c in ocr_confidences] or None,
        }
        # Keep the highest-confidence reconstruction per field.
        existing = fields.get(field_key)
        if existing is None or confidence > existing["confidence"]:
            fields[field_key] = field_entry
    missing = [key for key in (LABEL_TO_FIELD[l] for l in ENTITY_LABELS) if key not in fields]
    return fields, missing


def word_confidences_for_tokens(tokens: list[Token], word_entries: list[dict]) -> list[float]:
    """Align service-side OCR word confidences with the whitespace token list."""
    if not word_entries:
        return [1.0] * len(tokens)
    entries = list(word_entries)
    confidences: list[float] = []
    cursor = 0
    for token in tokens:
        while cursor < len(entries) and entries[cursor]["text"] != token.text:
            cursor += 1
        if cursor < len(entries):
            confidences.append(entries[cursor]["confidence"])
            cursor += 1
        else:
            confidences.append(1.0)
    return confidences


def warnings_for(fields: dict) -> list[str]:
    warnings: list[str] = []
    for field in fields.values():
        if field.get("confidence_band") == "low":
            warnings.append(f"{field['field']}: low confidence — flagged for manual verification.")
    if any(f["field"] in {"mrp", "net_quantity"} and f.get("value") is None for f in fields.values()):
        warnings.append("A critical declaration was detected but could not be normalized; verify against the raw value.")
    return warnings

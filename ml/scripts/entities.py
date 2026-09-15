"""ML-side entity configuration — MUST mirror nlp-service/app/entities.py.

A unit test in the service (nlp-service/tests/test_entities.py) asserts that
ml/config/labels.json stays in sync; this module loads the same file so the
notebooks and scripts never diverge from it either.
"""

import json
from pathlib import Path

_LABELS_PATH = Path(__file__).resolve().parent.parent / "config" / "labels.json"

with open(_LABELS_PATH, encoding="utf-8") as _handle:
    _CONFIG = json.load(_handle)

LABELS: list[str] = [entry["label"] for entry in _CONFIG["labels"]]
FIELD_KEYS: list[str] = [entry["field_key"] for entry in _CONFIG["labels"]]
LABEL_TO_FIELD: dict[str, str] = dict(zip(LABELS, FIELD_KEYS))
LABEL_DESCRIPTIONS: dict[str, str] = {entry["label"]: entry["description"] for entry in _CONFIG["labels"]}
BASE_MODEL_CANDIDATES: list[str] = _CONFIG.get("base_model_candidates", ["answerdotai/ModernBERT-base"])

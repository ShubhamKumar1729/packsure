"""Entity configuration tests — including sync with the ML pipeline's labels.json."""

import json
import sys
from pathlib import Path

from app.entities import ENTITY_LABELS, ENTITY_SPECS, FIELD_KEYS, LABEL_TO_FIELD

ROOT = Path(__file__).resolve().parent.parent.parent
LABELS_JSON = ROOT / "ml" / "config" / "labels.json"


def test_labels_are_unique_and_nonempty():
    assert len(ENTITY_LABELS) == len(set(ENTITY_LABELS))
    assert all(label == label.upper() for label in ENTITY_LABELS)
    assert len(FIELD_KEYS) == len(set(FIELD_KEYS))


def test_label_to_field_mapping_is_aligned():
    assert list(LABEL_TO_FIELD.keys()) == list(ENTITY_LABELS)
    for spec in ENTITY_SPECS:
        assert " " not in spec.field_key


def test_labels_json_mirror_matches_service_config():
    """The ML training config and the service config must never drift apart."""
    if not LABELS_JSON.exists():
        sys.exit("ml/config/labels.json is missing — it must mirror app/entities.py")
    data = json.loads(LABELS_JSON.read_text(encoding="utf-8"))
    ml_labels = [entry["label"] for entry in data["labels"]]
    ml_fields = [entry["field_key"] for entry in data["labels"]]
    assert ml_labels == list(ENTITY_LABELS)
    assert ml_fields == list(FIELD_KEYS)

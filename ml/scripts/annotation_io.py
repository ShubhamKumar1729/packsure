"""Annotation loading + validation (Phase 18).

Canonical annotation format (char-span based, one JSON per sample):

{
  "id": "optional-stable-id",
  "product_id": "product-or-image-group-id (used for leak-free splits)",
  "text": "MRP Rs.120 Net Qty 500G",
  "source_image": "optional filename this text was OCR'd from",
  "reviewed": false,
  "entities": [
    {"start": 0, "end": 11, "label": "MRP"},
    {"start": 12, "end": 25, "label": "NET_QUANTITY"}
  ]
}

`start`/`end` are CHARACTER offsets into `text` (end exclusive). Human annotators
verify OCR text first; augmentation NEVER modifies the reviewed ground truth —
it produces separate `augmented_*` records at training time.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from entities import LABELS, LABEL_TO_FIELD  # noqa: E402  (ml/scripts/entities.py)

VALID_LABELS = set(LABELS)


@dataclass
class ValidationIssue:
    sample_id: str
    kind: str
    detail: str

    def __str__(self) -> str:
        return f"[{self.kind}] {self.sample_id}: {self.detail}"


@dataclass
class Sample:
    id: str
    product_id: str
    text: str
    entities: list[dict]
    source_image: str | None = None
    reviewed: bool = False
    path: Path | None = None
    issues: list[ValidationIssue] = field(default_factory=list)

    @property
    def valid(self) -> bool:
        return all(issue.kind not in {"invalid_span", "overlap", "unknown_label", "empty_text", "malformed"} for issue in self.issues)


def load_sample(path: Path) -> Sample:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        return Sample(id=path.stem, product_id=path.stem, text="", entities=[], path=path,
                      issues=[ValidationIssue(path.stem, "malformed", f"invalid JSON: {error}")])
    sample_id = str(raw.get("id") or path.stem)
    text = raw.get("text")
    entities = raw.get("entities", [])
    issues: list[ValidationIssue] = []
    if not isinstance(text, str) or not text.strip():
        issues.append(ValidationIssue(sample_id, "empty_text", "text is empty or missing"))
    if not isinstance(entities, list):
        issues.append(ValidationIssue(sample_id, "malformed", "entities must be a list"))
        entities = []
    return Sample(
        id=sample_id,
        product_id=str(raw.get("product_id") or path.stem),
        text=text if isinstance(text, str) else "",
        entities=entities,
        source_image=raw.get("source_image"),
        reviewed=bool(raw.get("reviewed", False)),
        path=path,
        issues=issues,
    )


def validate_sample(sample: Sample) -> Sample:
    """Span/label checks (Phase 18). Adds to (never mutates) sample.issues."""
    text = sample.text
    spans: list[tuple[int, int, str]] = []
    for index, entity in enumerate(sample.entities):
        if not isinstance(entity, dict):
            sample.issues.append(ValidationIssue(sample.id, "malformed", f"entity #{index} is not an object"))
            continue
        label = entity.get("label")
        start, end = entity.get("start"), entity.get("end")
        if label not in VALID_LABELS:
            sample.issues.append(ValidationIssue(sample.id, "unknown_label", f"entity #{index} label {label!r} not in config"))
            continue
        if not isinstance(start, int) or not isinstance(end, int) or not (0 <= start < end <= len(text)):
            sample.issues.append(ValidationIssue(sample.id, "invalid_span", f"entity #{index} ({label}) span {start}:{end} invalid for text length {len(text)}"))
            continue
        if not text[start:end].strip():
            sample.issues.append(ValidationIssue(sample.id, "invalid_span", f"entity #{index} ({label}) span is whitespace"))
            continue
        for other_start, other_end, other_label in spans:
            if start < other_end and other_start < end:
                sample.issues.append(ValidationIssue(sample.id, "overlap",
                                                     f"entity #{index} ({label}) overlaps ({other_label}) {other_start}:{other_end}"))
        spans.append((start, end, str(label)))
    if sample.entities and not sample.text:
        sample.issues.append(ValidationIssue(sample.id, "malformed", "entities present without text"))
    return sample


def load_directory(directory: Path) -> list[Sample]:
    samples: list[Sample] = []
    for path in sorted(directory.glob("*.json")):
        samples.append(validate_sample(load_sample(path)))
    return samples


def dataset_report(samples: list[Sample]) -> dict:
    """Dataset health report: counts, label balance, duplicates, per-split safety."""
    issues = [issue for sample in samples for issue in sample.issues]
    label_counts: dict[str, int] = {}
    texts_seen: dict[str, str] = {}
    duplicates: list[str] = []
    for sample in samples:
        for entity in sample.entities:
            if isinstance(entity, dict) and isinstance(entity.get("label"), str):
                label_counts[entity["label"]] = label_counts.get(entity["label"], 0) + 1
        if sample.text in texts_seen and texts_seen[sample.text] != sample.id:
            duplicates.append(f"{texts_seen[sample.text]} == {sample.id}")
        else:
            texts_seen[sample.text] = sample.id
    # Fields that never occur are NORMAL (Phase 39) — surfaced, not an error.
    absent_labels = [label for label in LABELS if label not in label_counts]
    return {
        "total_samples": len(samples),
        "reviewed_samples": sum(1 for sample in samples if sample.reviewed),
        "invalid_samples": sum(1 for sample in samples if not sample.valid),
        "label_counts": dict(sorted(label_counts.items(), key=lambda item: -item[1])),
        "labels_never_annotated": absent_labels,
        "duplicate_texts": duplicates,
        "issues": [str(issue) for issue in issues],
        "empty_texts": sum(1 for sample in samples if not sample.text.strip()),
    }


def save_jsonl(samples: list[Sample], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as handle:
        for sample in samples:
            handle.write(json.dumps({
                "id": sample.id,
                "product_id": sample.product_id,
                "text": sample.text,
                "entities": sample.entities,
                "source_image": sample.source_image,
                "reviewed": sample.reviewed,
            }, ensure_ascii=False) + "\n")


__all__ = ["Sample", "load_sample", "load_directory", "validate_sample", "dataset_report", "save_jsonl", "VALID_LABELS", "LABEL_TO_FIELD"]

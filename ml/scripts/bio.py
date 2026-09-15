"""Char-span annotations -> BIO token-classification records (Phase 17/19).

Tokenization is whitespace-based (matching OCR words, which is exactly what the
serving side re-creates from Tesseract output). BIO scheme:
    B-X starts an entity, I-X continues it, O is outside.

The output records carry per-token labels ready for
`transformers.AutoTokenizer(..., with token_type/offset alignment)` alignment in
the training notebook (offset-mapping alignment happens there, where the real
model tokenizer is available).
"""

from __future__ import annotations

import re

from entities import LABELS

TOKEN_RE = re.compile(r"\S+")

#: Full BIO label list in canonical order: ["O", "B-PRODUCT_NAME", "I-PRODUCT_NAME", ...]
LABEL_LIST: list[str] = ["O"]
for _label in LABELS:
    LABEL_LIST.append(f"B-{_label}")
    LABEL_LIST.append(f"I-{_label}")
LABEL_TO_ID: dict[str, int] = {label: index for index, label in enumerate(LABEL_LIST)}


def char_span_to_token_labels(text: str, entities: list[dict]) -> list[dict]:
    """Convert char-offset entities to per-token BIO labels with char offsets.

    The first whitespace token overlapping an entity gets B-X; the remaining
    tokens of that entity get I-X. (Overlapping entities are rejected by
    validation, so each token belongs to at most one entity.)
    """
    tokens = [{"text": match.group(0), "start": match.start(), "end": match.end()} for match in TOKEN_RE.finditer(text)]
    labels: list[str] = ["O"] * len(tokens)
    for entity in sorted(entities, key=lambda item: (item["start"], item["end"])):
        label = entity["label"]
        first = True
        for index, token in enumerate(tokens):
            if token["start"] < entity["end"] and entity["start"] < token["end"]:
                labels[index] = f"{'B' if first else 'I'}-{label}"
                first = False
    # Safety: a stray I- without its B- is promoted to B-.
    previous = "O"
    for index, label in enumerate(labels):
        if label.startswith("I-") and previous not in (f"B-{label[2:]}", f"I-{label[2:]}"):
            labels[index] = f"B-{label[2:]}"
        previous = labels[index]
    return [
        {"text": token["text"], "start": token["start"], "end": token["end"], "label": label}
        for token, label in zip(tokens, labels)
    ]


def token_records_to_bio_jsonl(samples: list[dict]) -> list[dict]:
    """Whole-dataset conversion for training input (JSONL rows)."""
    rows: list[dict] = []
    for sample in samples:
        tokens = char_span_to_token_labels(sample["text"], sample["entities"])
        rows.append({
            "id": sample.get("id"),
            "product_id": sample.get("product_id"),
            "text": sample["text"],
            "tokens": [token["text"] for token in tokens],
            "labels": [token["label"] for token in tokens],
            "token_spans": [[token["start"], token["end"]] for token in tokens],
        })
    return rows

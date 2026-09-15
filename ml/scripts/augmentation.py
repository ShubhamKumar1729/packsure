"""OCR-noise augmentation (Phase 5) — token-level, span-safe.

Augmentation is a TRAINING-TIME technique only. It consumes reviewed samples and
emits NEW records (ids prefixed `augmented-`); the original ground-truth text and
entities are NEVER modified. Controlled corruptions simulate real OCR errors:

- character substitution (visually confusable pairs: O/0, I/1, S/5, B/8, ₹/Rs...)
- dropped characters
- merged tokens ("Net Qty" -> "NetQty") and split tokens ("Rs.120" -> "Rs .120")
- punctuation loss
- casing variation
- whitespace corruption (double spaces)

Correctness strategy: corruptions happen at the WHITESPACE-TOKEN level; per-token
BIO labels are computed from the ORIGINAL char spans, survive the corruption
token-by-token, and the new entity char spans are RE-DERIVED from the corrupted
token stream. A corruption that would orphan a label is skipped, so the output
is always internally consistent.
"""

from __future__ import annotations

import random
import re

from bio import char_span_to_token_labels

TOKEN_RE = re.compile(r"\S+")

CONFUSABLES: dict[str, str] = {
    "O": "0", "0": "O", "I": "1", "l": "1", "1": "l", "S": "5", "5": "S",
    "B": "8", "8": "B", "Z": "2", "2": "Z", "g": "9", "9": "g",
    "C": "G", "G": "C", "E": "F", "F": "E", "D": "O", "U": "V", "V": "U",
}
_PUNCT = ",.:;/-"


def _corrupt_token(token: str, rng: random.Random) -> str | None:
    """Return a corrupted copy of one token (or None to skip)."""
    if len(token) < 1:
        return None
    operation = rng.choice(["substitute", "drop", "case_flip", "punct_loss"])
    position = rng.randrange(len(token))
    character = token[position]
    if character.isspace():
        return None
    if operation == "substitute":
        replacement = CONFUSABLES.get(character) or CONFUSABLES.get(character.swapcase())
        if not replacement or replacement == character:
            return None
        return token[:position] + replacement + token[position + 1:]
    if operation == "drop":
        if len(token) <= 1:
            return None
        return token[:position] + token[position + 1:]
    if operation == "case_flip":
        return token[:position] + character.swapcase() + token[position + 1:]
    if operation == "punct_loss":
        if character not in _PUNCT or len(token) <= 1:
            return None
        return token[:position] + token[position + 1:]
    return None


def augment_text(text: str, entities: list[dict], rng: random.Random, max_corruptions: int = 3) -> tuple[str, list[dict]] | None:
    """Corrupt text at the token level; re-derive valid entity char spans."""
    if not text.strip():
        return None
    token_labels = char_span_to_token_labels(text, entities)
    if not token_labels:
        return None
    # Keep the O/Ocr prefix out of corruptions? No — noise can hit anything.
    tokens = [entry["text"] for entry in token_labels]
    corruptions = 0
    merge_done = split_done = spacing_done = False
    attempts = 0
    while corruptions < max_corruptions and attempts < 12:
        attempts += 1
        roll = rng.random()
        if roll < 0.15 and not merge_done and len(tokens) >= 2:
            index = rng.randrange(len(tokens) - 1)
            left, right = token_labels[index], token_labels[index + 1]
            # Never merge two tokens that carry DIFFERENT entity labels — a single
            # token can only carry one BIO label, so the merge would destroy one.
            if left["label"] != "O" and right["label"] != "O" and left["label"][2:] != right["label"][2:]:
                continue
            tokens[index] = tokens[index] + tokens[index + 1]
            if left["label"] == "O" and right["label"] != "O":
                token_labels[index] = {**left, "label": right["label"] if right["label"].startswith("B-") else f"B-{right['label'][2:]}"}
            del tokens[index + 1]
            del token_labels[index + 1]
            merge_done = True
            corruptions += 1
        elif roll < 0.30 and not split_done:
            index = rng.randrange(len(tokens))
            token = tokens[index]
            if len(token) >= 3:
                cut = rng.randrange(1, len(token) - 1)
                tokens[index] = token[cut:]
                tokens.insert(index, token[:cut])
                token_labels.insert(index, token_labels[index])
                split_done = True
                corruptions += 1
        elif roll < 0.40 and not spacing_done and len(tokens) >= 2:
            index = rng.randrange(len(tokens) - 1)
            tokens[index] = tokens[index] + "  "  # double space glued inside a line
            spacing_done = True
            corruptions += 1
        else:
            index = rng.randrange(len(tokens))
            corrupted = _corrupt_token(tokens[index], rng)
            if corrupted is None:
                continue
            tokens[index] = corrupted
            corruptions += 1

    if corruptions == 0:
        return None

    # Rebuild text with single spaces, then re-derive entity spans from the
    # surviving BIO token sequence.
    new_text = " ".join(tokens)
    new_entities: list[dict] = []
    cursor = 0
    active: dict | None = None
    for entry_token, token in zip(token_labels, tokens):
        start = new_text.index(token, cursor)
        end = start + len(token)
        cursor = end
        label = entry_token["label"]
        if label.startswith("B-"):
            if active is not None:
                new_entities.append(active)
            active = {"start": start, "end": end, "label": label[2:]}
        elif label.startswith("I-") and active is not None and active["label"] == label[2:]:
            active["end"] = end
        else:
            if active is not None:
                new_entities.append(active)
                active = None
    if active is not None:
        new_entities.append(active)

    for entity in new_entities:
        if not (0 <= entity["start"] < entity["end"] <= len(new_text)):
            return None
        if not new_text[entity["start"]:entity["end"]].strip():
            return None
    if not new_entities and entities:
        return None  # a corrupted sample that lost every entity is useless
    return new_text, new_entities


def augment_sample(sample: dict, rng: random.Random, copies: int = 1) -> list[dict]:
    """Generate OCR-noise copies of a reviewed sample. Never mutates the input."""
    augmented: list[dict] = []
    for copy_index in range(copies):
        result = augment_text(sample["text"], sample["entities"], rng)
        if result is None:
            continue
        new_text, new_entities = result
        augmented.append({
            "id": f"augmented-{copy_index + 1}-{sample.get('id', 'sample')}",
            "product_id": sample.get("product_id"),
            "text": new_text,
            "entities": new_entities,
            "source_image": sample.get("source_image"),
            "reviewed": False,
            "derived_from": sample.get("id"),
        })
    return augmented

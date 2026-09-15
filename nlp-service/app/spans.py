"""Token/span utilities shared by both extractors (Phase 5/6 helpers).

- `tokenize_with_offsets` splits OCR text into word tokens WITH char offsets,
  preserving punctuation attached to words (no aggressive cleaning: raw text is
  authoritative and OCR noise is informative).
- `decode_bio` merges BIO token predictions into entity char spans.
- `associate_words` maps char spans back to OCR word indices for bbox evidence.
"""

import re
from dataclasses import dataclass, field

_TOKEN_RE = re.compile(r"\S+")


@dataclass
class Token:
    text: str
    start: int  # char offset in the source OCR text (inclusive)
    end: int    # exclusive


@dataclass
class RawEntity:
    label: str                 # entity label without BIO prefix, e.g. MRP
    text: str                  # verbatim OCR span
    start: int
    end: int
    confidence: float
    token_confidences: list[float] = field(default_factory=list)
    word_indices: list[int] = field(default_factory=list)


def tokenize_with_offsets(text: str) -> list[Token]:
    return [Token(match.group(0), match.start(), match.end()) for match in _TOKEN_RE.finditer(text)]


def decode_bio(tokens: list[Token], label_ids: list[int], probabilities: list[list[float]], id_to_label: dict[int, str]) -> list[RawEntity]:
    """Merge BIO token predictions into entity spans (Phase 6 step 1-2).

    - A B-X token starts a new span; I-X continues it (also when the tokenizer
      split one word into subwords — subword pieces inherit the word's span).
    - A stray I-X (no preceding B-X/I-X) starts a recovery span rather than
      being dropped.
    - Span confidence = mean token probability (documented; not calibrated).
    """
    entities: list[RawEntity] = []
    current: RawEntity | None = None

    def close() -> None:
        nonlocal current
        if current is not None and current.token_confidences:
            current.confidence = sum(current.token_confidences) / len(current.token_confidences)
            entities.append(current)
        current = None

    for token, label_id, probs in zip(tokens, label_ids, probabilities):
        label = id_to_label.get(label_id, "O")
        if label == "O" or label not in id_to_label.values():
            close()
            continue
        prefix, entity = (label.split("-", 1) + [""])[:2] if "-" in label else ("B", label)
        if prefix == "B" or current is None or current.label != entity:
            close()
            current = RawEntity(
                label=entity,
                text=token.text,
                start=token.start,
                end=token.end,
                confidence=0.0,
                token_confidences=[probs[label_id]],
            )
        else:
            # Extend: include the whitespace gap so reconstructed text matches OCR.
            if token.start > current.end:
                gap = " " * min(token.start - current.end, 3)
                current.text = current.text + gap + token.text
            else:
                current.text = current.text + token.text[current.end - token.start:]
            current.end = token.end
            current.token_confidences.append(probs[label_id])
    close()
    return entities


def associate_words(entity: RawEntity, tokens: list[Token]) -> list[int]:
    """Return indices of `tokens` overlapping the entity char span (Phase 6 step 4)."""
    return [
        index
        for index, token in enumerate(tokens)
        if token.start < entity.end and token.end > entity.start
    ]


def bbox_for_words(word_entries: list[dict], indices: list[int]) -> dict | None:
    """Union of word bboxes (normalized) + pixel box for a set of word indices."""
    selected = [word_entries[i] for i in indices if i < len(word_entries)]
    boxes_norm = [w["bbox"] for w in selected if w.get("bbox")]
    boxes_px = [w["bbox_px"] for w in selected if w.get("bbox_px")]
    if not boxes_norm:
        return None
    left = min(b["x"] for b in boxes_norm)
    top = min(b["y"] for b in boxes_norm)
    right = max(b["x"] + b["width"] for b in boxes_norm)
    bottom = max(b["y"] + b["height"] for b in boxes_norm)
    result: dict = {
        "bbox": {"x": round(left, 5), "y": round(top, 5), "width": round(right - left, 5), "height": round(bottom - top, 5)},
    }
    if boxes_px:
        result["bbox_px"] = (
            min(b[0] for b in boxes_px),
            min(b[1] for b in boxes_px),
            max(b[0] + b[2] for b in boxes_px) - min(b[0] for b in boxes_px),
            max(b[1] + b[3] for b in boxes_px) - min(b[1] for b in boxes_px),
        )
    return result

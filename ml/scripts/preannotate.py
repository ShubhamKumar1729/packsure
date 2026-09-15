"""Pre-annotation booster — cuts manual labeling effort dramatically.

Runs the SAME deterministic pattern extractor the NLP service uses (degraded
mode) over your OCR drafts and pre-fills annotation skeletons with SUGGESTED
entity spans. You then VERIFY/CORRECT/DELETE each suggestion instead of drawing
spans from scratch.

Hard rule: every output stays `reviewed: false` and carries
`"pre_annotated": true`. A human must confirm each span before it becomes
training data (see ml/ANNOTATION_GUIDELINES.md). Never train on unverified
suggestions.

Usage (works locally and in Colab, from anywhere):
    python ml/scripts/preannotate.py <ocr_drafts_dir> <output_dir>
e.g.
    python ml/scripts/preannotate.py ml/dataset/annotations/ocr_drafts ml/dataset/annotations/pending
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(_REPO_ROOT / "nlp-service"))

from app.entities import LABEL_TO_FIELD  # noqa: E402
from app.extractor import word_confidences_for_tokens  # noqa: E402
from app.patterns import dedupe_entities, extract_with_patterns  # noqa: E402
from app.spans import RawEntity, tokenize_with_offsets  # noqa: E402

FIELD_TO_LABEL = {field: label for label, field in LABEL_TO_FIELD.items()}
MIN_SUGGESTION_CONFIDENCE = 0.5


def suggest_entities(text: str, word_entries: list[dict] | None = None) -> list[dict]:
    """Suggest entity char spans for one OCR text.

    Non-overlapping, confidence-ordered: overlapping suggestions keep only the
    higher-confidence one; weak suggestions (< 0.5) are dropped rather than
    planting noise in the reviewer's way.
    """
    if not text.strip():
        return []
    tokens = tokenize_with_offsets(text)
    confidences = word_confidences_for_tokens(tokens, word_entries or [])
    entities: list[RawEntity] = dedupe_entities(extract_with_patterns(text, confidences))
    accepted: list[RawEntity] = []
    for entity in sorted(entities, key=lambda item: (-item.confidence, item.start)):
        if entity.confidence < MIN_SUGGESTION_CONFIDENCE:
            continue
        if any(entity.start < other.end and other.start < entity.end for other in accepted):
            continue
        accepted.append(entity)
    return [
        {"start": entity.start, "end": entity.end, "label": entity.label, "suggested_confidence": entity.confidence}
        for entity in sorted(accepted, key=lambda item: item.start)
    ]


def preannotate_draft(draft: dict, product_id: str) -> dict:
    words = [
        {"text": word.get("text", ""), "confidence": float(word.get("confidence", 1.0))}
        for word in draft.get("words", [])
    ]
    text = draft.get("text", "") or ""
    return {
        "id": f"ann-{draft.get('image', 'draft')}",
        "product_id": product_id,
        "text": text,
        "source_image": draft.get("image"),
        "reviewed": False,
        "pre_annotated": True,
        "entities": suggest_entities(text, words),
    }


def run(drafts_dir: Path, output_dir: Path) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    written: list[Path] = []
    for path in sorted(drafts_dir.glob("*.ocr.json")):
        draft = json.loads(path.read_text(encoding="utf-8"))
        product_id = path.stem.replace(".ocr", "")
        annotation = preannotate_draft(draft, product_id)
        target = output_dir / f"ann-{draft.get('image', path.stem)}.json"
        target.write_text(json.dumps(annotation, ensure_ascii=False, indent=2), encoding="utf-8")
        written.append(target)
    return written


if __name__ == "__main__":
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    drafts_dir, output_dir = Path(sys.argv[1]), Path(sys.argv[2])
    if not drafts_dir.exists():
        print(f"Drafts directory not found: {drafts_dir}")
        sys.exit(1)
    files = run(drafts_dir, output_dir)
    total_spans = sum(len(json.loads(path.read_text(encoding="utf-8"))["entities"]) for path in files)
    print(f"Pre-annotated {len(files)} drafts with {total_spans} suggested spans -> {output_dir}")
    print("NEXT: review every suggestion (correct spans, delete wrong ones, add missed ones)")
    print("and set \"reviewed\": true ONLY on files you fully verified.")

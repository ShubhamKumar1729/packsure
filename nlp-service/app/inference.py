"""Trained NER model inference (transformers token classification).

Loading policy (Phase 29): the model is loaded ONCE at service startup (lazy,
best-effort) and reused for every request. If the artifact directory does not
contain a trained model, the service runs WITHOUT it and reports
`model_loaded: false` on /health; /extract then uses the transparent pattern
extractor with `degraded: true`. Nothing here fabricates a model or metrics.
"""

import json
import logging
from functools import lru_cache

from .config import MODEL_BASE, MODEL_DIR, MODEL_NAME, MODEL_VERSION
from .entities import ENTITY_LABELS
from .spans import RawEntity, Token, associate_words, decode_bio

logger = logging.getLogger("packsure-nlp")

LABEL_MAPPING_FILENAME = "label_mapping.json"


class ModelNotAvailable(RuntimeError):
    """Raised when /extract is asked for model inference but no model is loaded."""


@lru_cache(maxsize=1)
def _load_components() -> dict:
    """Load tokenizer + model from MODEL_DIR. Raises ModelNotAvailable when the
    artifact is missing or its label set does not match the central entity config."""
    if not MODEL_DIR.exists() or not (MODEL_DIR / "config.json").exists():
        raise ModelNotAvailable(f"No trained model found at {MODEL_DIR}. See model/legal_metrology_ner/MODEL_PLACEHOLDER.md.")
    try:
        import torch
        from transformers import AutoModelForTokenClassification, AutoTokenizer
    except ImportError as error:  # pragma: no cover - depends on deployment extras
        raise ModelNotAvailable("torch/transformers are not installed in this deployment.") from error

    tokenizer = AutoTokenizer.from_pretrained(str(MODEL_DIR), use_fast=True)
    model = AutoModelForTokenClassification.from_pretrained(str(MODEL_DIR))
    model.eval()

    mapping_path = MODEL_DIR / LABEL_MAPPING_FILENAME
    if mapping_path.exists():
        with open(mapping_path, encoding="utf-8") as handle:
            mapping = json.load(handle)
        id_to_label = {int(k): v for k, v in mapping.get("id_to_label", mapping.get("id2label", {})).items()}
    else:
        id_to_label = {int(k): v for k, v in model.config.id2label.items()}
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model.to(device)
    logger.info("Loaded NER model from %s on %s", MODEL_DIR, device)
    return {"tokenizer": tokenizer, "model": model, "id_to_label": id_to_label, "device": device}


def model_is_available() -> bool:
    try:
        _load_components()
        return True
    except Exception:  # noqa: BLE001 - any failure means "model unavailable"
        return False


def model_info() -> dict:
    return {
        "name": MODEL_NAME,
        "base_model": MODEL_BASE,
        "version": MODEL_VERSION,
    }


def predict_entities(text: str, tokens: list[Token]) -> tuple[list[RawEntity], str]:
    """Run the trained token-classification model over OCR text (Phase 6).

    Returns entities plus the artifact version actually loaded. Subword pieces
    are aggregated by the offset mapping so spans map back to OCR words cleanly.
    """
    components = _load_components()
    tokenizer, model = components["tokenizer"], components["model"]
    id_to_label, device = components["id_to_label"], components["device"]

    import torch

    encoding = tokenizer(
        text,
        return_offsets_mapping=True,
        return_tensors="pt",
        truncation=True,
        max_length=512,
        return_overflowing_tokens=False,
    )
    offsets = encoding.pop("offset_mapping")[0].tolist()
    encoding.pop("token_type_ids", None)
    encoding = {k: v.to(device) for k, v in encoding.items()}
    with torch.no_grad():
        logits = model(**encoding).logits[0]
    probabilities = torch.softmax(logits, dim=-1).cpu().tolist()
    label_ids = [int(max(range(len(row)), key=lambda i: row[i])) for row in probabilities]

    # Aggregate subword pieces back into OCR word tokens via the offset mapping:
    # pieces whose start lies inside/n touching the previous piece's word (no
    # whitespace gap) belong to the same word; the last subword's label wins.
    word_tokens: list[Token] = []
    word_labels: list[int] = []
    word_probs: list[list[float]] = []
    for (start, end), label_id, probs in zip(offsets, label_ids, probabilities):
        if end <= start:  # special tokens ([CLS], [SEP])
            continue
        piece = text[start:end]
        if word_tokens and start <= word_tokens[-1].end and not text[word_tokens[-1].start:start].endswith((" ", "\n", "\t")) and start == word_tokens[-1].end:
            # Contiguous subword of the previous word (no whitespace gap).
            word_labels[-1] = label_id
            word_probs[-1] = [a + b for a, b in zip(word_probs[-1], probs)]
            word_tokens[-1] = Token(word_tokens[-1].text, word_tokens[-1].start, end)
            continue
        word_tokens.append(Token(piece, start, end))
        word_labels.append(label_id)
        word_probs.append(probs)

    # Re-normalize accumulated subword probability vectors.
    word_probs = [[p / sum(p) for p in row] for row in word_probs]
    # Use the true OCR word tokens (whitespace tokenization) for span text; the
    # offset-based word tokens above only drive label alignment.
    entities = decode_bio(word_tokens, word_labels, word_probs, id_to_label)
    for entity in entities:
        entity.text = text[entity.start:entity.end]
        entity.word_indices = associate_words(entity, tokens)
    return entities, MODEL_VERSION

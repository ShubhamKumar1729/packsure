"""Deterministic keyword/pattern extractor.

Purpose (explicit, so nobody mistakes this for the trained model):
    This is the TRANSPARENT FALLBACK extractor used when the trained NER model
    is absent (e.g. before the first Colab training run) or fails to load. It
    extracts values from REAL OCR text using keyword anchors + deterministic
    normalization. It invents nothing: if no anchor/value pair normalizes, the
    field stays missing (null). Responses always label the extractor as
    `pattern_rules` with `degraded: true` so the UI can disclose it.

    Every confidence from this path is a fixed heuristic score multiplied by the
    mean OCR word confidence of the span — a transparent, documented formula,
    not a model probability.
"""

import re

from .entities import LABEL_TO_FIELD
from .normalization import (
    normalize_best_before,
    normalize_customer_care,
    normalize_month_year,
    normalize_mrp,
    normalize_net_quantity,
)
from .spans import RawEntity, Token, associate_words, tokenize_with_offsets

# Heuristic base scores for the pattern path (× mean OCR confidence).
BASE_CONFIDENCE = {
    "NET_QUANTITY": 0.75,
    "MRP": 0.75,
    "MFG_DATE": 0.7,
    "PKD_DATE": 0.7,
    "IMPORT_DATE": 0.7,
    "EXPIRY_DATE": 0.7,
    "BEST_BEFORE": 0.7,
    "BATCH_NUMBER": 0.6,
    "CUSTOMER_CARE": 0.7,
    "MANUFACTURER": 0.5,
    "PACKER": 0.5,
    "IMPORTER": 0.5,
    "ADDRESS": 0.5,
    "COUNTRY_OF_ORIGIN": 0.65,
    "INGREDIENTS": 0.65,
    "PRODUCT_NAME": 0.4,  # reserved; pattern path rarely claims product names
}

_ANCHORS: dict[str, str] = {
    "MRP": r"(?:m\.?\s?r\.?\s?p\.?|max(?:imum)?\.?\s*retail(?:\.|\s)*(?:price)?|retail\s*sale\s*price)",
    "NET_QUANTITY": r"(?:net\s*(?:wt\.?|weight|qty\.?|qnty\.?|quantity|content(?:s)?|vol\.?|volume)|netto)",
    "MFG_DATE": r"(?:m(?:anu)?f(?:actur)?[e]?[d]?\.?|mkd\.?|manufactured(?:\s*on)?|made(?:\s*on)?|mfg\.?)",
    "PKD_DATE": r"(?:pkd\.?|pack(?:e)?d(?:\s*on)?|pre[-\s]?packed(?:\s*on)?)",
    "IMPORT_DATE": r"imported(?:\s*on)?",
    "EXPIRY_DATE": r"(?:exp(?:iry)?\.?|use\s*by)",
    "BEST_BEFORE": r"best\s*before",
    "BATCH_NUMBER": r"(?:batch\s*(?:no\.?|number|#)?|lot\s*(?:no\.?|number|#)?|b\.?\s?no\.?)",
    "MANUFACTURER": r"(?:manufactured\s*by|mfd\s*by|made\s*by)",
    "PACKER": r"(?:packed\s*by|pkd\s*by)",
    "IMPORTER": r"(?:imported\s*by|imp\s*by)",
    "COUNTRY_OF_ORIGIN": r"(?:made\s*in|product\s*of|origin\s*[:\-]?)",
    "INGREDIENTS": r"ingredients?\s*[:\-]?",
}
_ANCHOR_COMPILED = {label: re.compile(pattern, re.IGNORECASE) for label, pattern in _ANCHORS.items()}

_CURRENCY_ANCHOR = re.compile(r"(?:₹|rs\.?\s|inr\s)", re.IGNORECASE)
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_URL_RE = re.compile(r"(?:https?://|www\.)[\w.-]+(?:/[\w./\-]*)?")
_PIN_RE = re.compile(r"\b\d{6}\b")
_NETQty_ANYWHERE_RE = re.compile(r"\b\d+(?:\.\d+)?\s*(?:kg|gm|gms|g|ml|l|ltr)\b\.?", re.IGNORECASE)
_MAX_WINDOW = 6  # tokens scanned after an anchor


def _word_confidence_span(tokens: list[Token], word_confidences: list[float], start: int, end: int) -> float:
    indices = [i for i, token in enumerate(tokens) if token.start < end and token.end > start]
    confs = [word_confidences[i] for i in indices if i < len(word_confidences)]
    return sum(confs) / len(confs) if confs else 1.0


def _make_entity(label: str, text: str, start: int, end: int, base: float, tokens: list[Token], word_confidences: list[float]) -> RawEntity:
    word_indices = associate_words(RawEntity(label, text, start, end, base), tokens)
    ocr_conf = _word_confidence_span(tokens, word_confidences, start, end)
    return RawEntity(
        label=label,
        text=text,
        start=start,
        end=end,
        confidence=round(base * ocr_conf, 4),
        token_confidences=[ocr_conf] * max(len(word_indices), 1),
        word_indices=word_indices,
    )


def _anchored_value_candidates(tokens: list[Token], anchor_end: int, limit: int = _MAX_WINDOW) -> list[tuple[int, int, str]]:
    """Candidate spans after an anchor: expanding windows on the same visual line."""
    candidates: list[tuple[int, int, str]] = []
    window: list[Token] = []
    for token in tokens:
        if token.end <= anchor_end:
            continue
        if token.start >= anchor_end + 80:  # value must sit near the anchor
            break
        window.append(token)
        if len(window) > limit:
            break
    for size in range(1, min(len(window), limit) + 1):
        span_tokens = window[:size]
        text = " ".join(t.text for t in span_tokens)
        candidates.append((span_tokens[0].start, span_tokens[-1].end, text))
    return candidates


def _extract_anchored(label: str, normalizer, text: str, tokens: list[Token], word_confidences: list[float], extra_validator=None) -> RawEntity | None:
    for match in _ANCHOR_COMPILED[label].finditer(text):
        for start, end, candidate in _anchored_value_candidates(tokens, match.end()):
            if normalizer and not normalizer(candidate):
                continue
            if extra_validator and not extra_validator(candidate):
                continue
            return _make_entity(label, candidate, start, end, BASE_CONFIDENCE[label], tokens, word_confidences)
    return None


def _extract_mrp(text: str, tokens: list[Token], word_confidences: list[float]) -> RawEntity | None:
    entity = _extract_anchored("MRP", normalize_mrp, text, tokens, word_confidences)
    if entity:
        return entity
    # Currency-anchored fallback: '₹120' or 'Rs 120' without the MRP keyword.
    for match in _CURRENCY_ANCHOR.finditer(text):
        for start, end, candidate in _anchored_value_candidates(tokens, match.start()):
            if normalize_mrp(candidate) is None:
                continue
            merged_start = min(match.start(), start)
            return _make_entity("MRP", text[merged_start:end], merged_start, end, BASE_CONFIDENCE["MRP"] - 0.1, tokens, word_confidences)
    return None


def _extract_dates(text: str, tokens: list[Token], word_confidences: list[float]) -> list[RawEntity]:
    found: list[RawEntity] = []
    for label in ("MFG_DATE", "PKD_DATE", "IMPORT_DATE", "EXPIRY_DATE"):
        entity = _extract_anchored(label, normalize_month_year, text, tokens, word_confidences)
        if entity:
            found.append(entity)
    # 'Best before' with its own normalizer (relative or absolute).
    best = _extract_anchored("BEST_BEFORE", normalize_best_before, text, tokens, word_confidences)
    if best:
        found.append(best)
    return found


def _extract_standalone(text: str, tokens: list[Token], word_confidences: list[float]) -> list[RawEntity]:
    found: list[RawEntity] = []
    # Bare net-quantity values anywhere ('500g', '1 L') at lower confidence.
    net = None
    for match in _NETQty_ANYWHERE_RE.finditer(text):
        if normalize_net_quantity(match.group(0)):
            net = _make_entity("NET_QUANTITY", match.group(0), match.start(), match.end(), BASE_CONFIDENCE["NET_QUANTITY"] - 0.25, tokens, word_confidences)
            break
    if net:
        found.append(net)

    for match in _EMAIL_RE.finditer(text):
        found.append(_make_entity("CUSTOMER_CARE", match.group(0), match.start(), match.end(), BASE_CONFIDENCE["CUSTOMER_CARE"], tokens, word_confidences))
        break
    for match in _URL_RE.finditer(text):
        found.append(_make_entity("CUSTOMER_CARE", match.group(0), match.start(), match.end(), BASE_CONFIDENCE["CUSTOMER_CARE"], tokens, word_confidences))
        break
    return found


def _extract_party_names(text: str, tokens: list[Token], word_confidences: list[float]) -> list[RawEntity]:
    """Name after 'manufactured by'/'packed by'/'imported by'; address via PIN code."""
    found: list[RawEntity] = []
    name_spans: list[tuple[int, int]] = []
    for label in ("MANUFACTURER", "PACKER", "IMPORTER"):
        for match in _ANCHOR_COMPILED[label].finditer(text):
            segment = text[match.end(): match.end() + 160]
            name = re.split(r"[,\n]|(?:plot|street|road|survey|district|dist\.?|pin\s*code|pin[:\-])", segment, maxsplit=1, flags=re.IGNORECASE)[0].strip(" :-.")
            if 2 <= len(name) <= 120:
                start = match.end() + (len(segment) - len(segment.lstrip()))
                found.append(_make_entity(label, name, start, start + len(name), BASE_CONFIDENCE[label], tokens, word_confidences))
                name_spans.append((start, start + len(name)))
            break
    pin = _PIN_RE.search(text)
    if pin:
        # Bound the address block: from the containing line (or a ~90-char window
        # back from the PIN when OCR returned one merged line), cut at the latest
        # other declaration anchor AND never start before a recognized party-name
        # end, so the address never swallows unrelated text.
        line_start = text.rfind("\n", 0, pin.start()) + 1
        window_start = max(line_start, pin.start() - 90)
        prefix = text[window_start:pin.start()]
        for marker in ("MRP", "Mfd", "MFG", "Pkd", "Net ", "Batch", "Best before", "Exp", "care@", "www."):
            cut = prefix.rfind(marker)
            if cut >= 0 and window_start < pin.start() - len(marker):
                window_start = max(window_start, window_start + cut + len(marker))
        for _, name_end in name_spans:
            if window_start < name_end <= pin.start():
                window_start = name_end
        line_end = text.find("\n", pin.end())
        line_end = len(text) if line_end == -1 else min(line_end, pin.end() + 40)
        address_text = text[window_start:line_end].strip(" ,;:-")
        if address_text:
            found.append(_make_entity("ADDRESS", address_text, window_start, line_end, BASE_CONFIDENCE["ADDRESS"], tokens, word_confidences))
    return found


def extract_with_patterns(text: str, word_confidences: list[float] | None = None) -> list[RawEntity]:
    """Run the transparent keyword/pattern extractor over REAL OCR text."""
    tokens = tokenize_with_offsets(text)
    if word_confidences is None or len(word_confidences) != len(tokens):
        word_confidences = [1.0] * len(tokens)

    found: list[RawEntity] = []
    net = _extract_anchored("NET_QUANTITY", normalize_net_quantity, text, tokens, word_confidences)
    found.append(net) if net else None
    mrp = _extract_mrp(text, tokens, word_confidences)
    found.append(mrp) if mrp else None
    found.extend(_extract_dates(text, tokens, word_confidences))
    batch = _extract_anchored("BATCH_NUMBER", None, text, tokens, word_confidences,
                              extra_validator=lambda candidate: re.match(r"^[A-Za-z0-9][A-Za-z0-9/_\-. ]{1,30}$", candidate) is not None
                              and re.search(r"\d|[A-Za-z]{3}", candidate) is not None)
    if batch:
        found.append(batch)
    care = _extract_anchored("CUSTOMER_CARE", normalize_customer_care, text, tokens, word_confidences) if "CUSTOMER_CARE" in _ANCHORS else None
    if care is None:
        found.extend(_extract_standalone(text, tokens, word_confidences))
    else:
        found.append(care)
    found.extend(_extract_party_names(text, tokens, word_confidences))
    origin = _extract_anchored("COUNTRY_OF_ORIGIN", None, text, tokens, word_confidences,
                               extra_validator=lambda candidate: re.match(r"^[A-Za-z][A-Za-z\s]{1,40}$", candidate) is not None)
    if origin:
        found.append(origin)
    ingredients = _extract_anchored("INGREDIENTS", None, text, tokens, word_confidences)
    if ingredients:
        found.append(ingredients)
    return found


def dedupe_entities(entities: list[RawEntity]) -> list[RawEntity]:
    """Keep the highest-confidence entity per label; drop overlapping duplicates."""
    best: dict[str, RawEntity] = {}
    for entity in entities:
        current = best.get(entity.label)
        if current is None or entity.confidence > current.confidence:
            best[entity.label] = entity
    return [best[label] for label in sorted(best, key=lambda l: best[l].start)]


__all__ = ["extract_with_patterns", "dedupe_entities", "LABEL_TO_FIELD"]

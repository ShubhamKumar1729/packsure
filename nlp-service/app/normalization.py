"""Deterministic normalization layer (runs AFTER entity extraction).

Rules (Phase 7 policy):
- Normalization never destroys or rewrites the raw OCR span; callers keep raw_value verbatim.
- Normalization must not change the legal meaning: ambiguous input -> return None
  and let the field keep raw_value only, rather than guessing.
- Pure functions: no I/O, no model calls, fully unit-testable.
"""

import re

# --- shared anchor stripping ----------------------------------------------------
# Declarations carry keyword anchors ("Mfd:", "Net Wt.", "MRP"). Normalization
# works on the value part; the caller always preserves the full raw span.
_ANCHOR_RE = re.compile(
    r"^\s*(?:net\s+(?:wt\.?|weight|qty\.?|quantity|content|contents|vol\.?|volume)"
    r"|m(?:anu)?f(?:actur)?[e]?[d]?\.?|mkd\.?|manufactured|made|packed|pkd\.?|imported"
    r"|use\s*by|exp\.?|expiry|best\s*before|mrp|max(?:imum)?\.?\s*retail\.?\s*price"
    r"|price|batch(?:\s*(?:no\.?|number))?|lot(?:\s*(?:no\.?|number))?"
    r"|m\.?r\.?p\.?)\s*[:\-]?\s*",
    re.IGNORECASE,
)


def strip_anchor(raw: str) -> str:
    return _ANCHOR_RE.sub("", raw.strip(), count=1).strip()

# --- Net quantity ---------------------------------------------------------------
# Units accepted per the Legal Metrology (Packaged Commodities) Rules, 2011
# Third Schedule (legal units of measurement). Canonicalized to SI symbols.
_NET_QTY_RE = re.compile(
    r"^\s*(?:(?P<count>\d{1,2})\s*(?:x|×|\*)\s*)?"
    r"(?P<value>\d+(?:[.,]\d+)?)\s*"
    r"(?P<unit>kg|kgs|k\.g\.?|g|gm|gms|gram|grams|l|ltr|ltrs|litre|litres|liter|liters|ml|cl|cm|mm|m)\b\.?\s*$",
    re.IGNORECASE,
)
_UNIT_CANON = {
    "kg": "kg", "kgs": "kg", "k.g": "kg", "k.g.": "kg",
    "g": "g", "gm": "g", "gms": "g", "gram": "g", "grams": "g",
    "l": "l", "ltr": "l", "ltrs": "l", "litre": "l", "litres": "l", "liter": "l", "liters": "l",
    "ml": "ml", "cl": "cl", "cm": "cm", "mm": "mm", "m": "m",
}


def normalize_net_quantity(raw: str) -> dict | None:
    """'500G' -> {'value': '500 g', 'magnitude': 500.0, 'unit': 'g', 'count': 1}."""
    match = _NET_QTY_RE.match(strip_anchor(raw))
    if not match:
        return None
    unit_raw = match.group("unit").lower().replace(".", "").strip()
    unit = _UNIT_CANON.get(unit_raw)
    if unit is None:
        return None
    value = float(match.group("value").replace(",", "."))
    count = int(match.group("count") or 1)
    return {
        "value": f"{value:g} {unit}",
        "magnitude": value,
        "unit": unit,
        "count": count,
        "total": value * count,
    }


# --- MRP --------------------------------------------------------------------------
# Accepts Indian digit grouping (1,20,000) and currency markers Rs / ₹ / INR.
_CURRENCY_RE = re.compile(
    r"^\s*(?:(?:rs\.?|inr|₹|rupees?)\s*)?"
    r"(?P<value>\d{1,7}(?:,\d{2,3})*(?:\.\d{1,2})?)"
    r"\s*(?:/-|-\.|/-\.|/-)?\.?\s*$",
    re.IGNORECASE,
)


def normalize_mrp(raw: str) -> dict | None:
    """'Rs.120/-' -> {'value': '₹120', 'magnitude': 120.0, 'currency': 'INR'}.

    A bare number is accepted ONLY because the caller guarantees the span came
    from an MRP entity (label context); the anchor, if present, is stripped.
    """
    text = strip_anchor(raw).replace("₹", "").strip()
    match = _CURRENCY_RE.match(text)
    if not match:
        return None
    digits = match.group("value").replace(",", "").replace(" ", "")
    magnitude = float(digits)
    return {"value": f"₹{magnitude:g}", "magnitude": magnitude, "currency": "INR"}


# --- Dates ------------------------------------------------------------------------
_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}
_NUMERIC_DATE_RE = re.compile(r"^\s*(\d{1,2})\s*[/\-.]\s*(\d{2,4})\s*$")
_TEXT_DATE_RE = re.compile(r"^\s*(\d{1,2})?\s*[/\-. ]?\s*([A-Za-z]{3,9})\.?\s*[/\-, ]?\s*(\d{2,4})\s*$")
_YEAR_MONTH_RE = re.compile(r"^\s*(\d{2,4})\s*[/\-.]\s*(\d{1,2})\s*$")


def _resolve_year(year: int) -> int | None:
    if year >= 1000:
        return year if 2010 <= year <= 2099 else None
    return 2000 + year if year <= 49 else 1900 + year


def _month_year(year: int, month: int) -> dict | None:
    if year is None or not 1 <= month <= 12:
        return None
    return {"value": f"{year:04d}-{month:02d}", "year": year, "month": month, "iso": f"{year:04d}-{month:02d}"}


def normalize_month_year(raw: str) -> dict | None:
    """Normalize a month-year declaration ('06/2026', 'Jun 2026', '06/26').

    Returns None for anything ambiguous (bare '2026', '15/2026', '2026/13'...).
    The legal declaration under the LMPC Rules is month & year only, so day-first
    ambiguity does not arise.
    """
    text = strip_anchor(raw).rstrip(".")
    numeric = _NUMERIC_DATE_RE.match(text)
    if numeric:
        month, year_raw = int(numeric.group(1)), int(numeric.group(2))
        if month > 12 and year_raw <= 31:
            # e.g. '2026/06' typed dd/mm style — swap only when unambiguous.
            month, year_raw = year_raw, month
        return _month_year(_resolve_year(year_raw), month)
    ym = _YEAR_MONTH_RE.match(text)
    if ym:
        year_raw, month = int(ym.group(1)), int(ym.group(2))
        year = year_raw if year_raw >= 1000 else _resolve_year(year_raw)
        return _month_year(year, month)
    textual = _TEXT_DATE_RE.match(text)
    if textual and textual.group(2):
        month = _MONTHS.get(textual.group(2).lower()[:3])
        year = _resolve_year(int(textual.group(3)))
        return _month_year(year, month)
    return None


def normalize_best_before(raw: str) -> dict | None:
    """Handle absolute month-years and relative declarations.

    'Best before 6 months from packaging' -> {'type': 'relative', 'months': 6, 'value': '6 months from packaging'}
    'Best Before: 09/2026'                -> {'type': 'absolute', 'value': '2026-09', ...}
    """
    text = raw.strip()
    relative = re.match(
        r"^\s*(?:best\s*before|use\s*before)\s*[:\-]?\s*(?P<months>\d{1,2})\s*(?:months?|mos?)\b",
        text,
        re.IGNORECASE,
    )
    if relative:
        months = int(relative.group("months"))
        return {"type": "relative", "months": months, "value": f"{months} months from packaging"}
    absolute = normalize_month_year(re.sub(r"^\s*(?:best\s*before|use\s*before)\s*[:\-]?\s*", "", text, flags=re.IGNORECASE))
    if absolute:
        return {"type": "absolute", **absolute}
    return None


# --- Customer care -----------------------------------------------------------------
_EMAIL_RE = re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")
_URL_RE = re.compile(r"(?:https?://|www\.)[\w.-]+(?:/[\w./\-]*)?")
_PHONE_RE = re.compile(r"(?:\+?\d[\d\s\-()]{7,16}\d)")


def normalize_customer_care(raw: str) -> dict | None:
    """Classify a contact span as email | url | phone. Keeps the raw form."""
    text = raw.strip()
    email = _EMAIL_RE.search(text)
    if email:
        return {"type": "email", "value": email.group(0).lower()}
    url = _URL_RE.search(text)
    if url:
        return {"type": "url", "value": url.group(0)}
    phone = _PHONE_RE.search(text)
    if phone:
        digits = re.sub(r"\D", "", phone.group(0))
        if 8 <= len(digits) <= 15:
            return {"type": "phone", "value": phone.group(0).strip(), "digits": digits}
    return None


def normalize_field(field_key: str, raw_value: str) -> dict | None:
    """Dispatch to the deterministic normalizer for a field key."""
    normalizers = {
        "net_quantity": normalize_net_quantity,
        "mrp": normalize_mrp,
        "mfg_date": normalize_month_year,
        "pkd_date": normalize_month_year,
        "import_date": normalize_month_year,
        "expiry_date": normalize_month_year,
        "best_before": normalize_best_before,
        "customer_care": normalize_customer_care,
    }
    normalizer = normalizers.get(field_key)
    return normalizer(raw_value) if normalizer else None

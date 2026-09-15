# Annotation guidelines — Legal Metrology NER

Annotate what is WRITTEN, not what is legally true. One span per occurrence.
Spans are character offsets (end exclusive). When unsure whether something fits
a label, leave it out and note it — a missing annotation is recoverable, a wrong
one poisons training.

## The 16 labels

| Label | Annotate | Do NOT annotate |
| --- | --- | --- |
| `PRODUCT_NAME` | The common/generic commodity name ("Biscuits", "Toilet Cleaner") — usually near the brand | Marketing flavor text ("Crunchy Delight"), brand names alone |
| `MANUFACTURER` | Company NAME after "Manufactured by"/"Mfd by" | The address block (use `ADDRESS`), "Mfd by" itself |
| `PACKER` | Name after "Packed by" when different from manufacturer | Manufacturer repeated |
| `IMPORTER` | Name after "Imported by" | Address |
| `NET_QUANTITY` | The value+unit ("500 g", "1 kg", "2 x 100 ml" — include the "2 x") | The words "Net Wt." alone |
| `MRP` | The price WITH its currency marker ("Rs.120/-", "₹ 45"); include "Max. Retail Price" only if it is the value's phrase | Bare "MRP" keyword with no price |
| `MFG_DATE` | Month-year value and its immediate label word ("Mfd: 06/2026", "Manufactured Jun 2026") | Best-before, packed-on dates |
| `PKD_DATE` | "Pkd. 07/2026", "Packed on 12/2025" | — |
| `IMPORT_DATE` | "Imported 03/2026" | — |
| `EXPIRY_DATE` | "Use by 08/2026", "Exp: 12/2026" | Best-before |
| `BEST_BEFORE` | "Best before 6 months from packaging" (relative counts!) and absolute forms | Expiry wording |
| `BATCH_NUMBER` | "Batch No. AB1234", "Lot 42B", "B-9912" — include the code only if that is clearer; be consistent | MRP, phone numbers |
| `CUSTOMER_CARE` | Phone / email / URL presented for consumer contact ("1800-123-4567", "care@brand.in") | Random phone numbers not labeled as consumer care |
| `ADDRESS` | The postal address block of the responsible party, up to and including the PIN | The company NAME |
| `COUNTRY_OF_ORIGIN` | "Made in India", "Product of Thailand", "Origin: China" | — |
| `INGREDIENTS` | The heading plus the list: "Ingredients: Wheat flour, sugar, edible oil" — up to the sentence end | Nutrition tables |

## Worked example

Text (verbatim OCR — keep OCR noise!):

```
MRP Rs.12O/- Net Qty. 500G Mfd:06/2026 BATCH NO. AB1234
Manufactured by Acme Foods Pvt Ltd, Plot 12, Mumbai 400093 care@acme.in
```

Entities (note the OCR `12O` is kept as-is; do not "fix" it):

```json
[
  {"start": 0,  "end": 12, "label": "MRP"},
  {"start": 13, "end": 26, "label": "NET_QUANTITY"},
  {"start": 27, "end": 39, "label": "MFG_DATE"},
  {"start": 40, "end": 58, "label": "BATCH_NUMBER"},
  {"start": 59, "end": 82, "label": "MANUFACTURER"},
  {"start": 84, "end": 106, "label": "ADDRESS"},
  {"start": 107, "end": 118, "label": "CUSTOMER_CARE"}
]
```

## Consistency rules

1. Decide ONCE whether label keywords ("Mfd:", "Batch No.") are inside the span — the recommendation above includes the keyword for dates/batch, excludes it for MRP ("Rs.120/-" without the "MRP" keyword) — then apply it everywhere.
2. Negative samples are essential: many products legitimately lack `IMPORTER`, `EXPIRY_DATE`, `BEST_BEFORE`. Do not invent them.
3. Do not annotate text you have not personally read (`"reviewed": false` until you do).
4. Illegible text: leave unannotated; if the whole sample is illegible, keep it with `entities: []` (it teaches the model what noise looks like).

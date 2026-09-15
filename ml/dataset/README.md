# Dataset layout

Raw photos, annotations, and generated splits live here in your Google Drive
copy of the repo. **Binary dataset files are not committed to Git** — commit
annotations (small JSON) if you want them versioned; keep images on Drive.

```
dataset/
├── raw/<product-group>/         # YOUR product photos (jpg/png/webp)
├── annotations/
│   ├── ocr_drafts/              # 01: machine OCR output — DRAFTS ONLY
│   ├── pending/                 # 01: empty annotation skeletons
│   └── approved/                # YOU move reviewed, verified annotations here
├── train/train.jsonl            # 02: generated BIO-ready rows (+ augmented copies)
├── validation/validation.jsonl  # 02: generated
├── test/test.jsonl              # 02: generated — touched ONLY by notebook 04
└── label_mapping.json           # 02: generated; consumed by trainer + service
```

## Annotation file format (one JSON per OCR text)

```json
{
  "id": "ann-front.jpg",
  "product_id": "acme-biscuits-500g",
  "text": "MRP Rs.120/- Net Qty 500G",
  "source_image": "front.jpg",
  "reviewed": true,
  "entities": [
    {"start": 0, "end": 12, "label": "MRP"},
    {"start": 13, "end": 25, "label": "NET_QUANTITY"}
  ]
}
```

- `start`/`end` are character offsets into `text` (end exclusive).
- `reviewed: true` means a HUMAN read the text and the spans. Never set it otherwise.
- `product_id` groups near-duplicate photos of the same product so splits never leak.

## Validation performed (notebook 02)

duplicate texts · missing labels · invalid spans · overlapping entities ·
unknown labels · malformed JSON · empty OCR text · product-level split checks.
All issues are reported; training refuses to start until the set is clean.

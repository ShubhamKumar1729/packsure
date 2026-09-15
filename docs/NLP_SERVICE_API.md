# NLP service — API contract

Base URL: `NLP_SERVICE_URL` (e.g. `http://localhost:8000`). Optional shared
secret: send `X-API-Key: <NLP_API_KEY>` when the service sets that env var.

## GET /health

```json
{
  "status": "ok" | "degraded",
  "service": "packsure-nlp",
  "model_loaded": false,
  "model": {
    "name": "Legal-Metrology-NER",
    "base_model": "ModernBERT",
    "version": "pattern-rules",
    "extractor": "pattern_rules",
    "degraded": true,
    "detail": "No trained model artifact present; ..."
  },
  "ocr_engine_available": true,
  "version": "1.0.0"
}
```

`degraded` means: service is usable but the trained model is absent —
extractions come from the deterministic pattern extractor and are marked as such.

## POST /extract

Request:

```json
{
  "ocr_text": "MRP Rs.120/- Net Qty 500G ...",
  "words": [
    {"text": "MRP", "confidence": 0.96, "bbox_px": [100, 200, 80, 30], "line": 1}
  ],
  "image_width": 1200,
  "image_height": 1600
}
```

`words` is optional; when provided, every extracted field carries `bbox`
(normalized) and `bbox_px`. Response:

```json
{
  "success": true,
  "fields": {
    "mrp": {
      "field": "mrp",
      "label": "MRP",
      "value": "₹120",
      "raw_value": "Rs.120/-",
      "confidence": 0.94,
      "bbox": {"x": 0.083, "y": 0.125, "width": 0.066, "height": 0.019},
      "bbox_px": [100, 200, 80, 30],
      "normalized": {"value": "₹120", "magnitude": 120.0, "currency": "INR"},
      "ocr_word_confidences": [0.96, 0.93]
    },
    "net_quantity": {"value": "500 g", "raw_value": "500G", "confidence": 0.9, "normalized": {"value": "500 g", "magnitude": 500.0, "unit": "g", "count": 1, "total": 500.0}}
  },
  "missing_fields": ["product_name", "manufacturer", "..."],
  "model": {
    "name": "Legal-Metrology-NER",
    "base_model": "ModernBERT",
    "version": "1.0.0",
    "extractor": "ner_model",
    "degraded": false
  },
  "warnings": []
}
```

Rules: missing fields are listed in `missing_fields`, never invented.
`raw_value` is the verbatim OCR span. `extractor` is `ner_model` or
`pattern_rules`; `pattern_rules` always comes with `degraded: true`.

## POST /pipeline (used by the Node backend)

`multipart/form-data`: `image` (jpeg/png/webp ≤ 8 MiB), optional `lang`.

Response: everything from `/extract` plus:

- `"ocr"`: `{status, text, confidence, words: [{text, confidence, bbox_px, bbox, line}], engine}`
- `"cv"`:
  ```json
  {
    "text_char_height_px": 24.5,
    "text_char_height_mm": null,
    "scale_source": null,
    "scale_note": "No scale reference (barcode) detected ...; not estimated.",
    "barcodes": [{"text": "8901234567890", "format": "EAN_13", "valid_gtin_checkdigit": true}],
    "tampering_probability": null,
    "sticker_overlay_anomaly": null
  }
  ```
  `text_char_height_mm` is populated ONLY when an EAN-13 barcode provides a
  scale (100%-magnification assumption stated in `scale_note`).
  `tampering_probability` and `sticker_overlay_anomaly` are always `null`
  (not implemented — never fabricated).

## POST /ocr

Image → OCR only (same `ocr` block as `/pipeline`).

## Errors

| Status | Meaning |
| --- | --- |
| 401 | Missing/invalid `X-API-Key` (only when `NLP_API_KEY` is set) |
| 422 | Image validation failure (empty, oversize, undecodable, wrong format) |
| 503 | OCR engine unavailable (tesseract missing) |
| 500 | Unexpected service error (logged server-side, generic message returned) |

## Run locally

```bash
cd nlp-service
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt            # + requirements-model.txt to serve a model
sudo apt-get install -y tesseract-ocr      # macOS: brew install tesseract
uvicorn app.main:app --host 0.0.0.0 --port 8000
curl localhost:8000/health
pytest                                      # test suite
```

Model artifact placement: `nlp-service/model/legal_metrology_ner/` (see
`MODEL_PLACEHOLDER.md`), then set `MODEL_VERSION` and restart.

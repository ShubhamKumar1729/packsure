# ML training guide — from your photos to a served model

A developer who has never touched the ML part can follow this top to bottom.
The model is **not trained yet** in this repository — this is the exact path to
train it with YOUR product images, in Google Colab (free GPU).

## What exists vs what you must do

| Exists in the repo | You must do |
| --- | --- |
| All training/evaluation notebooks | Run them in order, in Colab |
| Annotation format + validator + BIO converter | Annotate your reviewed OCR texts |
| OCR-noise augmentation, product-level splitting | Upload your product photos |
| Model-loading + inference code in the NLP service | Copy the exported artifact into `nlp-service/model/legal_metrology_ner/` |
| Honest placeholders (no fake metrics anywhere) | Train, then report ONLY notebook-04 numbers |

## Step-by-step

### 0. Prerequisites
- A Google account (Colab + Drive), your product photos (food / beverages /
  cosmetics / household — diversity beats quantity).
- The repo either cloned in Colab or the `ml/` folder uploaded to Drive.

### 1. Upload photos
Put photos in Drive:
```
/content/drive/MyDrive/packsure/ml/dataset/raw/<product-group>/*.jpg
```
Group multiple photos of the SAME product under one `product-group` folder —
splits are product-level to prevent leakage.

### 2. OCR (notebook 01)
Run `ml/notebooks/01_ocr_dataset_creation.ipynb` in Colab. It installs
Tesseract, OCRs every photo (word boxes + confidence), and writes **drafts**.
Then: **read every draft** and fix OCR mistakes in the annotation `text` field.
Unread drafts are not training data.

### 3. Annotate (guidelines: `ml/ANNOTATION_GUIDELINES.md`)
For each draft create/complete the annotation JSON (char-span entities), e.g.

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

Notebook 02 includes a span-helper (`span_for`) so you do not count characters
by hand. For bulk work, Label Studio's char-span export can be converted to this
format — the JSON format above is the single source of truth. Move verified
files into `dataset/annotations/approved/` and set `"reviewed": true` ONLY for
files you verified.

Dataset size guidance: ≥300 reviewed texts minimum, 1,000–2,000 for a solid
prototype, 200+ distinct products, all categories, fields legitimately missing
on many labels (do not force every entity everywhere).

### 4. Validate + split + augment (notebook 02)
Runs the Phase-18 checks (duplicates, invalid/overlapping spans, unknown
labels, empty texts), converts to BIO, augments the TRAIN split with OCR-noise
copies (reviewed data untouched), and splits by product into
`train/validation/test` JSONL + `label_mapping.json`.

### 5. Train (notebook 03, GPU runtime)
`Runtime → Change runtime type → T4 GPU`. Trains ModernBERT-base (primary) with
HF Trainer, early stopping, best-model selection on validation F1, per-entity
seqeval report. To benchmark DeBERTa-v3-base, change `BASE_MODEL` and rerun —
pick by validation metrics + inference needs, never by assumption.

### 6. Evaluate (notebook 04)
Held-out test only: per-entity P/R/F1, exact entity match, field-level
accuracy, missing-field performance, OCR-noise robustness, latency p50/p95.
**These are the only numbers you may quote.**

### 7. Export + connect to PackSure
Notebook 03 zips the artifact. Then:
```bash
unzip legal_metrology_ner.zip
cp -r export/* nlp-service/model/legal_metrology_ner/
# .env.local (or service env):
MODEL_VERSION=1.0.0
```
Restart the NLP service and verify:
```bash
curl localhost:8000/health          # expect "model_loaded": true
curl -X POST localhost:8000/extract -H 'content-type: application/json' \
  -d '{"ocr_text":"MRP Rs.120/- Net Qty 500G"}'
cd nlp-service && pytest            # run the service suite with the new artifact
```
In PackSure, set `AI_PROVIDER=nlp` and run an inspection end-to-end; the
analysis badge should show `Extractor: NER model (ModernBERT · v1.0.0)` and the
degraded banner disappears.

## Iteration loop

Annotate more of the failures you see in notebook 04's error analysis → re-run
02 (new split) → 03 → 04. Keep the test split honest: never tune on it.

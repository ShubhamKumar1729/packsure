# PackSure ML — Legal-Metrology NER (training pipeline)

This folder trains the domain NER model that the NLP service
(`nlp-service/`) serves. **No trained model exists in this repository yet** —
you create one from YOUR product photos through the Colab workflow below.
Nothing here fabricates data, labels, or accuracy numbers.

## Pipeline

```
PRODUCT IMAGES (yours)
  → 01_ocr_dataset_creation.ipynb   (Tesseract OCR -> reviewable text drafts)
  → human review of OCR text        (MANDATORY - drafts are not ground truth)
  → PRE-ANNOTATION (pattern extractor suggests spans, scripts/preannotate.py)
  → human verification of suggestions (02 mini-helper; reviewed=false until YOU check)
  → 02_annotation_preparation.ipynb (validate -> BIO -> augment -> product-level split)
  → 03_train_legal_metrology_ner.ipynb (ModernBERT primary / DeBERTa-v3 benchmark)
  → 04_evaluate_legal_metrology_ner.ipynb (held-out test: P/R/F1, field accuracy, latency)
  → export artifact -> nlp-service/model/legal_metrology_ner/
```

## Layout

| Path | Purpose |
| --- | --- |
| `notebooks/` | The four Colab notebooks (run in order) |
| `scripts/` | Shared Python: annotation IO + validation, BIO conversion, OCR-noise augmentation, product-level splitting, batch OCR, entity config loader |
| `config/labels.json` | Canonical entity label list — MUST mirror `nlp-service/app/entities.py` (a service test enforces this) |
| `dataset/raw/` | YOUR product photos (never committed — see dataset/README.md) |
| `dataset/annotations/` | OCR drafts + annotation JSONs |
| `dataset/train|validation|test/` | Generated JSONL splits (output of notebook 02) |
| `ANNOTATION_GUIDELINES.md` | How to annotate each entity, with examples |

## Recommended dataset size (documented target, not a guarantee)

- **Minimum to train at all:** ~300 reviewed texts (≈50 products), all 16 labels represented somewhere.
- **Reasonable prototype:** 1,000–2,000 reviewed texts from 200+ products across food / beverages / cosmetics / household categories, with natural absence of fields (not every label has every declaration).
- More diversity (fonts, lighting, angles, languages, print quality) beats more duplicates of the same product.
- Report measured metrics from notebook 04 only. Do not extrapolate.

## What YOU do (short version — full commands in docs/ML_TRAINING.md)

1. Put photos in Drive under `packsure/ml/dataset/raw/<product-group>/`.
2. Run notebook 01 → read every OCR draft.
3. Annotate entities (JSON char spans), mark `"reviewed": true` only for files you verified.
4. Run notebook 02 (validate + split) → run notebook 03 (train on GPU) → run notebook 04 (evaluate).
5. Copy the exported artifact into `nlp-service/model/legal_metrology_ner/` and set `MODEL_VERSION`.
6. Restart the NLP service; `/health` must report `"model_loaded": true`; run the service pytest suite.

## Rules this pipeline enforces on itself

- No synthetic examples pretend to be real products; augmentation is applied at
  training time only, to the train split, and never modifies reviewed data.
- Splits are by `product_id` so near-duplicate photos cannot leak between splits.
- The test split is touched only by notebook 04.
- `config/labels.json` and the service's `entities.py` are kept in sync by test.

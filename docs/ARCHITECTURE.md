# PackSure — Architecture

PackSure is an evidence-first compliance workspace for packaged-commodity
inspections under the Legal Metrology (Packaged Commodities) Rules, 2011.
This document describes the architecture after the AI/ML integration; for the
original product behavior see the root `README.md`.

## 1. What PackSure does

A user photographs a product package, the system OCRs the label, extracts the
legal declarations with a domain NER model (or a transparent fallback), runs a
**deterministic** rule engine against the Legal Metrology baseline rules, and
produces an explainable result: score, classification, violations with legal
references, remediation hints, and bounding-box evidence — reviewed by a human
who records the authoritative final decision.

## 2. Target logical architecture (as implemented)

```
                    FRONTEND (Next.js App Router, React 19, Tailwind)
                       |
                       v
            BACKEND (Next.js route handlers, MongoDB via Mongoose,
                     JWT session auth, role-based authorization)
                       |
          +------------+------------+
          v                         v
   OCR SERVICE  -----------> NLP/NER SERVICE (Python FastAPI)
   (Tesseract, inside        /pipeline: preprocess -> OCR -> token-classification
    the NLP service)         NER (ModernBERT artifact) -> normalization
          |                  -> CV observations (barcodes, char height)
          |                  -> structured fields with raw values, confidence, bboxes
          +---------+--------------+
                    v
        STRUCTURED PRODUCT FIELDS (stored as InspectionAnalysis in MongoDB)
                    v
        DETERMINISTIC RULE ENGINE (existing src/lib/compliance/engine.ts)
                    v
        COMPLIANCE RESULT (+ Legal Metrology baseline ruleset + scoring layer)
                    v
        SCORE + CLASSIFICATION + VIOLATIONS + EVIDENCE (bbox, excerpts)
                    v
        FRONTEND views + self-contained HTML report (print-to-PDF)
```

**Architectural principle (enforced):** AI/ML extracts and scores evidence; the
deterministic rule engine makes the compliance decision; the human final
decision is authoritative. No LLM decides legal compliance anywhere.

## 3. Reused existing components (unchanged or minimally changed)

| Component | Status | Notes |
| --- | --- | --- |
| Next.js 16 app shell, pages, navigation | KEEP | |
| Auth: bcrypt login, jose JWT cookie, middleware, roles | KEEP | |
| 11 Mongoose models | KEEP | `InspectionAnalysis.status` gained `unavailable`; `Rule` gained `remediation` + `definition.fieldKeys` |
| Compliance rule engine (`engine.ts`) | KEEP + MODIFY | added `any_field_presence` kind; `notApplicableWhenMissing` honored for field kinds; `remediation` passthrough |
| Human review + ReviewAuditLog workflow | KEEP | |
| Reports (persisted snapshot + self-contained HTML) | KEEP + MODIFY | raw values, extractor/model metadata, legal summary, disclaimer, print CSS |
| Products/history, dashboard, marketplace comparison | KEEP | |
| Pia assistant (Groq, RAG, tools) | KEEP | still strictly PackSure-scoped; still not a compliance engine |
| `MockAIProvider` | KEEP | explicit opt-in test seam (`AI_PROVIDER=mock`); labeled as such everywhere |
| Upload validation (8 MiB, MIME allowlist, ≤10 images) | KEEP | mirrored in the NLP service |

## 4. New components

| Component | Location |
| --- | --- |
| NLP service (FastAPI: OCR, NER, normalization, CV-lite) | `nlp-service/` |
| NLP pipeline provider (backend integration) | `src/lib/ai/nlp-provider.ts` |
| Centralized field-key/entity mapping | `src/lib/ai/field-keys.ts`, `nlp-service/app/entities.py`, `ml/config/labels.json` |
| Legal Metrology baseline ruleset | `src/lib/compliance/legal-metrology/rules.ts` |
| Deterministic scoring + classification | `src/lib/compliance/legal-metrology/scoring.ts` |
| Ruleset installer API (admin, acknowledgement-gated) | `src/app/api/rules/legal-metrology/route.ts` |
| Bounding-box evidence overlay | `src/components/evidence-overlay.tsx` |
| Colab training pipeline | `ml/` (notebooks, scripts, config, dataset layout) |
| Tests (pytest + vitest) | `nlp-service/tests/`, `tests/` |
| Docker compose (mongo + nlp + web) | `docker-compose.yml` |

## 5. OCR → NER data flow (serving)

1. Node backend loads stored image bytes from MongoDB (authenticated route only).
2. `NlpPipelineProvider` POSTs the image to the NLP service `/pipeline`
   (`NLP_SERVICE_URL`, optional `X-API-Key`, 90 s timeout).
3. Service: strict image validation → grayscale/upscale preprocessing →
   Tesseract word OCR (text + pixel + normalized bboxes + confidence) →
   extraction:
   - **ner_model** (trained artifact present): transformers token classification,
     BIO decoding, offset-mapped span reconstruction;
   - **pattern_rules** (fallback, `degraded: true`): deterministic keyword
     anchors + normalization over the real OCR text — invented nothing, always
     disclosed;
4. Normalization layer (`normalization.py`): `500G → 500 g`, `Rs.120/- → ₹120`,
   `06/2026 → 2026-06`, best-before relative forms, contact classification.
   Raw value preserved verbatim on every field.
5. Confidence: geometric mean of OCR word confidence and extraction confidence
   (raw scores, NOT calibrated probabilities — banded high/medium/low).
6. CV observations: barcode decode (zxing-cpp), pixel char-height median,
   px→mm scale ONLY from an EAN-13 reference with explicit assumptions;
   tampering/sticker fields are always `null` (not implemented, never faked).
7. Backend maps the response to `InspectionAnalysis` (fields, OCR blocks,
   measurements, provider metadata incl. extractor/degraded/model version).

## 6. Compliance decision flow

1. `POST /api/inspections/:id/compliance` loads enabled `Rule` documents and the
   latest completed analysis.
2. The existing engine evaluates every rule (field presence, any-of presence,
   numeric bounds, patterns, measurement thresholds, manual review) and stores
   the run + findings.
3. `legal-metrology/scoring.ts` derives the summary (severity-weighted score +
   classification) on every read — pure function, formula versioned.
4. UI shows: computed classification, score with formula, per-check status with
   legal reference + remediation + evidence excerpts; human review still
   produces the authoritative final decision.

## 7. Failure model (no component crashes the app)

- NLP service unreachable → analysis stored as `unavailable` with a specific
  message; UI shows an explicit banner. Timeout, HTTP errors, malformed JSON →
  `failed` with distinct messages.
- Model artifact missing → service runs degraded (pattern extractor), `/health`
  reports `model_loaded: false`, every response is marked `degraded`.
- OCR empty → fields empty, warnings explain; no placeholder values.
- Mongo down → existing live-data connection states unchanged.

## 8. Environment variables

See `.env.example` and `docs/ML_TRAINING.md`; key additions: `NLP_SERVICE_URL`,
`NLP_API_KEY` (optional), `NLP_SERVICE_TIMEOUT_MS`, `MODEL_PATH`,
`MODEL_VERSION`, `MODEL_BASE_MODEL`, `NLP_OCR_LANG`, `NLP_CONFIDENCE_HIGH/MEDIUM`.

## 9. Known limitations

- No trained NER model ships with the repo; until you train one, extraction is
  the disclosed pattern-extractor fallback (lower recall, product name and
  party names mostly missed).
- Confidence values are not calibrated probabilities.
- mm-scale font measurements require a barcode reference and are approximate.
- Exemptions and category applicability in the law are not auto-encoded;
  category-specific rules ship disabled for admin judgement.
- The Legal Metrology rule references are cited at the level verified during
  development; admins must re-verify against the current consolidated text
  (see docs/LEGAL_NOTES.md) before enforcing.

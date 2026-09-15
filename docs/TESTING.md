# Testing

## Test suites

| Suite | Location | Run | Covers |
| --- | --- | --- | --- |
| NLP service (pytest) | `nlp-service/tests/` | `cd nlp-service && pytest` | normalization, pattern extraction, span/BIO reconstruction, entity↔labels.json sync, API schema, degraded-mode honesty, upload validation, CV honesty (no fabricated values) |
| Backend (vitest) | `tests/` | `npm test` | Legal Metrology ruleset shape + deterministic evaluation, scoring/classification math, NLP provider contract (mapping + all failure modes via fetch stubs), serialization incl. `unavailable` status |
| Whole app | — | `npm run lint && npm run typecheck && npm run build` | ESLint, strict TS, production build |

The OCR end-to-end service test (`test_api.py::TestPipelineEndToEnd`) is
skipped automatically when the `tesseract` binary is missing (as in minimal CI
sandboxes); it runs where Tesseract is installed (Docker image, Colab, dev
machines) and uses a runtime-generated SYNTHETIC label image — clearly a test
fixture, not a real product.

## End-to-end pipeline check (no fabricated AI output)

`node scripts/e2e-pipeline-check.mjs` verifies the full chain
(NLP service health → OCR+extraction of a provided image → backend field
mapping contract). It requires:

1. The NLP service running (`NLP_SERVICE_URL`).
2. **A real product label image you place at `e2e/sample-label.jpg`** — the
   repo deliberately ships no fake product image and no seeded data.
3. Optional full-stack mode with the web app + MongoDB running (it then logs
   in with a provided session and drives the real API routes).

Without the image, the script exits with instructions instead of inventing a
result — matching the Phase-25 requirement.

## Frontend verification

No React unit-test framework existed in this project and none was added just
for show. The frontend is covered by: strict TypeScript, the production build,
the vitest contract tests that pin the API shapes the UI consumes, and the
manual checklist below.

### Manual regression checklist (10 minutes, after any UI change)

1. Login → dashboard renders (or honest empty/connectivity states).
2. New inspection → save with 1 image → Analyze → fields/OCR/evidence overlay render; degraded banner visible while no model is trained.
3. Install LM baseline (Rules admin, disabled) → enable with acknowledgement → Run rule checks → classification + score + references visible.
4. Violations appear in review workspace → accept one → final decision → audit trail recorded.
5. Report view → disclaimer, field raw values, print button → downloaded HTML contains the same data.
6. Stop the NLP service → Analyze → explicit "service unavailable" banner, no fabricated values.

## CI suggestion

```yaml
# .github/workflows/ci.yml (suggestion)
# - npm ci && npm run lint && npm run typecheck && npm test && npm run build
# - pip install -r nlp-service/requirements.txt && (cd nlp-service && pytest)
```

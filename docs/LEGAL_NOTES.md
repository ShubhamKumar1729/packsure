# Legal notes, rule references and disclaimers

## Legal version implemented (prototype baseline)

- **Legal Metrology Act, 2009** (Act No. 1 of 2010) — section 18(1): no
  pre-packaged commodity shall be manufactured, packed, sold, transferred,
  distributed, delivered, or imported unless the required declarations are made
  on the package per the rules.
- **Legal Metrology (Packaged Commodities) Rules, 2011** — the declarations
  catalogued in **Rule 6** (name & address of manufacturer/packer/importer,
  common or generic name of commodity, net quantity, month & year of
  manufacture/pre-packing/import, retail sale price, consumer-care contact),
  the declaration-manner provisions of **Rule 9**, the net-quantity declaration
  manner in **Rule 11**, legal units per the **Third Schedule**, and
  letter/numeral sizes per the **Second Schedule**.

### Honest caveats (documented, not silently ignored)

1. The rules were cited at the level of specificity verified during
   development. Sub-clause numbers (e.g. "Rule 6(1)(d)") are deliberately
   omitted where the exact current clause was not re-verified against the
   consolidated text, because **inventing clause numbers is worse than citing
   the parent rule**. Before enabling enforcement, an administrator MUST
   verify each rule's reference against the current official text — including
   amendments (notably the 2017 e-commerce amendments and subsequent
   notifications) — and tick the verification acknowledgement in the Rules
   admin page.
2. **Exemptions are not encoded.** The rules contain exemptions (e.g. certain
   small containers, specific product categories, institutional buyers).
   Category-dependent obligations (best-before/use-by for foods, etc.) ship as
   DISABLED manual-review templates that an administrator enables per category.
3. OCR/NER evidence is language- and print-quality-dependent; a `PASS` means
   "the declaration was detected in the submitted evidence", not that the
   physical package is legally compliant.
4. Where the system cannot determine something reliably (physical font size in
   mm, tampering, package-area classification), it returns "not determined"
   instead of guessing.

## Implemented rules (id → reference → behaviour)

| Rule key | Reference | Severity | Missing → | Notes |
| --- | --- | --- | --- | --- |
| `lmpc_r6_responsible_party_name` | Rule 6; Act s.18(1) | HIGH | VIOLATION | passes if ANY of manufacturer/packer/importer detected |
| `lmpc_r6_responsible_party_address` | Rule 6; Act s.18(1) | HIGH | VIOLATION | address association verified by human review |
| `lmpc_r6_generic_name` | Rule 6 | HIGH | REVIEW_REQUIRED | |
| `lmpc_r6_net_quantity` | Rule 6 | HIGH | VIOLATION | |
| `lmpc_r11_net_quantity_unit` | Rule 11; Third Schedule | MEDIUM | REVIEW | validates legal units |
| `lmpc_r6_month_year` | Rule 6 | HIGH | VIOLATION | ANY of mfg/packed/import date |
| `lmpc_r6_month_year_format` | Rule 6; Rule 9 | MEDIUM | REVIEW | detects non-normalized dates |
| `lmpc_r6_mrp` | Rule 6; Rule 9 | HIGH | VIOLATION | |
| `lmpc_r6_mrp_positive` | Rule 6 | MEDIUM | n/a | REVIEW on zero/unparseable MRP (OCR-safe) |
| `lmpc_r6_consumer_care` | Rule 6 | HIGH | REVIEW | format variance → human verification |
| `lmpc_r6_batch_number` | Rule 6 | MEDIUM | REVIEW | |
| `lmpc_2sched_font_size` | Second Schedule | MEDIUM | — | DISABLED manual template |
| `lmpc_r6_best_before_category` | Rule 6 (category applicability) | MEDIUM | — | DISABLED manual template |

## Scoring formula (`severity-weighted-v1`)

```
weight        = CRITICAL 25 · HIGH 15 · MEDIUM 8 · LOW 3
applicable    = results where status != NOT_APPLICABLE
penalty(r)    = weight if VIOLATION; 0.4 × weight if REVIEW_REQUIRED; 0 if PASS
score         = round(100 × (1 − Σ penalty / Σ weight))   (null if nothing applicable)
classification:
  NON_COMPLIANT     any VIOLATION with severity HIGH or CRITICAL
  PARTIAL           only LOW/MEDIUM violations, or pending reviews
  COMPLIANT         every applicable check passed
  INSUFFICIENT_DATA no applicable checks (documented extension)
```

The score is a transparent triage aid. It is not a legal conclusion.

## Disclaimers embedded in the product

- The report and the report viewer state: *"AI-assisted preliminary assessment
  — not a legal determination."*
- The compliance viewer labels the computed classification as **computed** and
  the human final decision as the authoritative outcome.
- Confidence is displayed as banded raw scores, explicitly not calibrated
  probabilities.
- Degraded extraction (pattern rules instead of the trained model) is disclosed
  on every affected screen and stored in the analysis metadata.

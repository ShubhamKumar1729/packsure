/**
 * Legal Metrology (Packaged Commodities) Rules, 2011 — baseline prototype ruleset.
 *
 * SOURCES AND VERSION (also documented in docs/LEGAL_NOTES.md — read before
 * enabling enforcement):
 * - Legal Metrology Act, 2009 (No. 1 of 2010), section 18(1): no pre-packaged
 *   commodity shall be manufactured, packed, sold, imported... unless the
 *   required declarations are made per the rules.
 * - Legal Metrology (Packaged Commodities) Rules, 2011: Rule 6 (requisite
 *   declarations on pre-packaged commodities: name & address of manufacturer/
 *   packer/importer, common/generic name of commodity, net quantity, month &
 *   year of manufacture/pre-packing/import, retail sale price, consumer-care
 *   contact); Rule 9 (manner of making declarations); Rule 11 (manner of net-
 *   quantity declaration); Third Schedule (legal units); Second Schedule
 *   (letter/numeral sizes).
 *
 * HONESTY RULES APPLIED HERE (per project policy):
 * - No clause sub-numbers are cited where verification against the current
 *   consolidated text is pending; the admin must verify each reference in the
 *   enablement dialog before rules go live (the workflow requires an explicit
 *   acknowledgement).
 * - Exemptions (small packages, certain food/other categories) are NOT encoded;
 *   category-dependent rules ship DISABLED as manual-review templates.
 * - These checks see only what OCR/NER could read from the submitted photos —
 *   a PASS means "declaration detected in the evidence", not a legal verdict.
 */

import type { ExtractedFieldKey } from '@/lib/ai/types'
import type { RuleCheckArea, RuleDefinition, RuleKind, RuleSeverity } from '@/lib/compliance/types'

export type LegalMetrologyRule = {
  key: string
  name: string
  description: string
  checkArea: RuleCheckArea
  jurisdiction: string
  reference: string
  expectedRequirement: string
  remediation: string
  severity: RuleSeverity
  version: string
  /** Ships disabled; the admin enables after verifying references. */
  defaultEnabled: boolean
  definition: RuleDefinition
}

const JURISDICTION = 'India'
const SOURCE = 'Legal Metrology (Packaged Commodities) Rules, 2011'

export const LEGAL_METROLOGY_RULESET_VERSION = '1.0.0'

/** Legal quantity units per the Third Schedule (subset validated by normalization). */
const NET_QTY_UNIT_PATTERN = '^\\d+(\\.\\d+)?\\s*([Gg]|[Kk][Gg]|[Mm][Ll]|[Ll]|[Cc][Ll]|[Cc][Mm]|[Mm][Mm]|[Mm])$'
/** Normalized month-year values look like 2026-06. */
const ISO_MONTH_YEAR_PATTERN = '^\\d{4}-(0[1-9]|1[0-2])$'

export const LEGAL_METROLOGY_RULES: LegalMetrologyRule[] = [
  {
    key: 'lmpc_r6_responsible_party_name',
    name: 'Name of manufacturer / packer / importer declared',
    description: 'Every pre-packaged commodity must bear the name of the manufacturer, and where applicable the packer or importer. Because the applicable role cannot be determined from a photo alone, this check passes when ANY responsible-party name is detected.',
    checkArea: 'manufacturer_packer_importer',
    jurisdiction: JURISDICTION,
    reference: `${SOURCE}, Rule 6; Legal Metrology Act 2009, s.18(1)`,
    expectedRequirement: 'The label must declare the name of the manufacturer or (where the goods are packed/imported) the packer or importer.',
    remediation: 'Print the responsible legal entity name on the package as required by Rule 6, then re-inspect.',
    severity: 'HIGH',
    version: LEGAL_METROLOGY_RULESET_VERSION,
    defaultEnabled: true,
    definition: {
      kind: 'any_field_presence' as RuleKind,
      checkArea: 'manufacturer_packer_importer',
      fieldKeys: ['manufacturer', 'packer', 'importer'] as ExtractedFieldKey[],
      missingOutcome: 'VIOLATION',
    },
  },
  {
    key: 'lmpc_r6_responsible_party_address',
    name: 'Address of manufacturer / packer / importer declared',
    description: 'The declarations must include the postal address of the responsible party. The detected address block is verified for association with the responsible entity during human review.',
    checkArea: 'manufacturer_packer_importer',
    jurisdiction: JURISDICTION,
    reference: `${SOURCE}, Rule 6; Legal Metrology Act 2009, s.18(1)`,
    expectedRequirement: 'A postal address for the manufacturer/packer/importer must appear on the label.',
    remediation: 'Print the complete postal address of the responsible entity on the package, then re-inspect.',
    severity: 'HIGH',
    version: LEGAL_METROLOGY_RULESET_VERSION,
    defaultEnabled: true,
    definition: {
      kind: 'any_field_presence',
      checkArea: 'manufacturer_packer_importer',
      fieldKeys: ['address'],
      missingOutcome: 'VIOLATION',
    },
  },
  {
    key: 'lmpc_r6_generic_name',
    name: 'Common/generic name of commodity declared',
    description: 'The package must declare the common or generic name of the commodity it contains.',
    checkArea: 'required_declaration',
    jurisdiction: JURISDICTION,
    reference: `${SOURCE}, Rule 6`,
    expectedRequirement: 'The common or generic name of the packaged commodity must be declared on the label.',
    remediation: 'Print the generic commodity name (what the product is) on the principal display panel.',
    severity: 'HIGH',
    version: LEGAL_METROLOGY_RULESET_VERSION,
    defaultEnabled: true,
    definition: {
      kind: 'field_presence',
      checkArea: 'required_declaration',
      fieldKey: 'product_name',
      missingOutcome: 'REVIEW_REQUIRED',
    },
  },
  {
    key: 'lmpc_r6_net_quantity',
    name: 'Net quantity declared',
    description: 'The net quantity (weight, volume or number, as applicable) must be declared on every package.',
    checkArea: 'net_quantity',
    jurisdiction: JURISDICTION,
    reference: `${SOURCE}, Rule 6`,
    expectedRequirement: 'The net quantity of the contents must be declared on the package.',
    remediation: 'Print the declared net quantity (e.g. "Net Qty. 500 g") on the package.',
    severity: 'HIGH',
    version: LEGAL_METROLOGY_RULESET_VERSION,
    defaultEnabled: true,
    definition: {
      kind: 'field_presence',
      checkArea: 'net_quantity',
      fieldKey: 'net_quantity',
      missingOutcome: 'VIOLATION',
    },
  },
  {
    key: 'lmpc_r11_net_quantity_unit',
    name: 'Net quantity uses a legal unit',
    description: 'The net-quantity declaration must use legal units of measurement (e.g. g, kg, ml, l) per the Third Schedule. This check validates the detected unit characters.',
    checkArea: 'net_quantity',
    jurisdiction: JURISDICTION,
    reference: `${SOURCE}, Rule 11; Third Schedule`,
    expectedRequirement: 'Net quantity must be declared in one of the prescribed legal units.',
    remediation: 'Declare net quantity in a Third Schedule unit (g/kg for weight, ml/l for volume, cm for length), then re-inspect.',
    severity: 'MEDIUM',
    version: LEGAL_METROLOGY_RULESET_VERSION,
    defaultEnabled: true,
    definition: {
      kind: 'field_pattern',
      checkArea: 'net_quantity',
      fieldKey: 'net_quantity',
      pattern: NET_QTY_UNIT_PATTERN,
      missingOutcome: 'REVIEW_REQUIRED',
      invalidOutcome: 'REVIEW_REQUIRED',
      notApplicableWhenMissing: true,
    },
  },
  {
    key: 'lmpc_r6_month_year',
    name: 'Month & year of manufacture / pre-packing / import declared',
    description: 'The package must declare the month & year of manufacture, pre-packing or import, as applicable. This check passes when ANY such date declaration is detected.',
    checkArea: 'required_declaration',
    jurisdiction: JURISDICTION,
    reference: `${SOURCE}, Rule 6`,
    expectedRequirement: 'The month and year of manufacture (or pre-packing or import) must be declared on the package.',
    remediation: 'Print the month & year of manufacture/pre-packing/import (e.g. "Mfd. 06/2026") on the package.',
    severity: 'HIGH',
    version: LEGAL_METROLOGY_RULESET_VERSION,
    defaultEnabled: true,
    definition: {
      kind: 'any_field_presence',
      checkArea: 'required_declaration',
      fieldKeys: ['mfg_date', 'pkd_date', 'import_date'],
      missingOutcome: 'VIOLATION',
    },
  },
  {
    key: 'lmpc_r6_month_year_format',
    name: 'Detected manufacture date parses as month & year',
    description: 'Sanity check that a detected manufacture/pre-packing date actually normalizes to a month-year value (e.g. 2026-06). A non-parsing raw value usually means OCR noise or a non-standard declaration.',
    checkArea: 'declaration_validation',
    jurisdiction: JURISDICTION,
    reference: `${SOURCE}, Rule 6; Rule 9 (manner of declaration)`,
    expectedRequirement: 'The date declaration must state month and year in a legible, standard form.',
    remediation: 'Print the date as month & year (e.g. "06/2026" or "Jun 2026") in a legible font.',
    severity: 'MEDIUM',
    version: LEGAL_METROLOGY_RULESET_VERSION,
    defaultEnabled: true,
    definition: {
      kind: 'field_pattern',
      checkArea: 'declaration_validation',
      fieldKey: 'mfg_date',
      pattern: ISO_MONTH_YEAR_PATTERN,
      missingOutcome: 'REVIEW_REQUIRED',
      invalidOutcome: 'REVIEW_REQUIRED',
      notApplicableWhenMissing: true,
    },
  },
  {
    key: 'lmpc_r6_mrp',
    name: 'Retail sale price (MRP) declared',
    description: 'Every package must bear the retail sale price (MRP) declaration, inclusive of all taxes.',
    checkArea: 'mrp',
    jurisdiction: JURISDICTION,
    reference: `${SOURCE}, Rule 6; Rule 9 (manner of declaration)`,
    expectedRequirement: 'The retail sale price (MRP) inclusive of all taxes must be declared on the package.',
    remediation: 'Print the MRP declaration (e.g. "MRP ₹ 120 (inclusive of all taxes)") on the package.',
    severity: 'HIGH',
    version: LEGAL_METROLOGY_RULESET_VERSION,
    defaultEnabled: true,
    definition: {
      kind: 'field_presence',
      checkArea: 'mrp',
      fieldKey: 'mrp',
      missingOutcome: 'VIOLATION',
    },
  },
  {
    key: 'lmpc_r6_mrp_positive',
    name: 'Detected MRP is a positive amount',
    description: 'A detected MRP must parse as a positive rupee amount. Zero or non-numeric detections are usually OCR errors and are sent to human review rather than auto-declared violations.',
    checkArea: 'mrp',
    jurisdiction: JURISDICTION,
    reference: `${SOURCE}, Rule 6`,
    expectedRequirement: 'The declared MRP must be a positive amount in Indian rupees.',
    remediation: 'Verify the printed MRP and re-print a legible declaration if the value is unreadable or wrong.',
    severity: 'MEDIUM',
    version: LEGAL_METROLOGY_RULESET_VERSION,
    defaultEnabled: true,
    definition: {
      kind: 'field_numeric',
      checkArea: 'mrp',
      fieldKey: 'mrp',
      min: 0.01,
      missingOutcome: 'REVIEW_REQUIRED',
      invalidOutcome: 'REVIEW_REQUIRED',
      notApplicableWhenMissing: true,
      minConfidence: 0.6,
    },
  },
  {
    key: 'lmpc_r6_consumer_care',
    name: 'Consumer-care contact details declared',
    description: 'Packages must declare consumer-care contact details (phone number, email, postal address or URL). Detection formats vary, so a miss sends the case to human review.',
    checkArea: 'customer_care',
    jurisdiction: JURISDICTION,
    reference: `${SOURCE}, Rule 6`,
    expectedRequirement: 'Consumer-care contact details (phone/email/address/url) must be declared for consumer complaints.',
    remediation: 'Print consumer-care contact details on the package, then re-inspect.',
    severity: 'HIGH',
    version: LEGAL_METROLOGY_RULESET_VERSION,
    defaultEnabled: true,
    definition: {
      kind: 'any_field_presence',
      checkArea: 'customer_care',
      fieldKeys: ['customer_care'],
      missingOutcome: 'REVIEW_REQUIRED',
    },
  },
  {
    key: 'lmpc_r6_batch_number',
    name: 'Batch or lot number declared',
    description: 'Packages must carry a batch or lot number for traceability. A missed detection usually means the code was not captured in the photo; verify manually.',
    checkArea: 'required_declaration',
    jurisdiction: JURISDICTION,
    reference: `${SOURCE}, Rule 6`,
    expectedRequirement: 'A batch number or lot number must be marked on the package.',
    remediation: 'Mark the batch/lot number on the package (pre-printed or at packing time).',
    severity: 'MEDIUM',
    version: LEGAL_METROLOGY_RULESET_VERSION,
    defaultEnabled: true,
    definition: {
      kind: 'field_presence',
      checkArea: 'required_declaration',
      fieldKey: 'batch_number',
      missingOutcome: 'REVIEW_REQUIRED',
    },
  },
  {
    key: 'lmpc_2sched_font_size',
    name: 'Letter/numeral size per Second Schedule (manual)',
    description: 'MANUAL REVIEW TEMPLATE. Minimum letter/numeral heights depend on the package area (Second Schedule). Reliable automated mm measurement needs a scale reference this photo workflow cannot guarantee; verify physically or with calibrated capture.',
    checkArea: 'readability_font_size',
    jurisdiction: JURISDICTION,
    reference: `${SOURCE}, Second Schedule`,
    expectedRequirement: 'Declarations must meet the minimum letter/numeral heights for the package size.',
    remediation: 'Re-measure the declaration font height physically against the Second Schedule table for the package area.',
    severity: 'MEDIUM',
    version: LEGAL_METROLOGY_RULESET_VERSION,
    defaultEnabled: false,
    definition: {
      kind: 'manual_review',
      checkArea: 'readability_font_size',
    },
  },
  {
    key: 'lmpc_r6_best_before_category',
    name: 'Best-before / use-by where category requires (manual)',
    description: 'MANUAL REVIEW TEMPLATE. Best-before/use-by declarations are mandatory only for certain product categories (e.g. edible oils, infant foods, and items covered by food-safety labelling law). Enable per category after verifying applicability.',
    checkArea: 'required_declaration',
    jurisdiction: JURISDICTION,
    reference: `${SOURCE}, Rule 6 (category-specific applicability)`,
    expectedRequirement: 'Where the product category requires it, the best-before/use-by declaration must appear on the label.',
    remediation: 'Print the best-before/use-by declaration where the applicable law requires it for this category.',
    severity: 'MEDIUM',
    version: LEGAL_METROLOGY_RULESET_VERSION,
    defaultEnabled: false,
    definition: {
      kind: 'manual_review',
      checkArea: 'required_declaration',
    },
  },
]

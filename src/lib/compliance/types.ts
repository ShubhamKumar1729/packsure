import type { ExtractedFieldKey, InspectionAnalysisResult, SourceImageReference } from '@/lib/ai/types'

export const COMPLIANCE_STATUSES = ['PASS', 'VIOLATION', 'REVIEW_REQUIRED', 'NOT_APPLICABLE'] as const
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number]

export const RULE_KINDS = ['field_presence', 'declaration_presence', 'field_numeric', 'measurement_threshold', 'field_pattern', 'manual_review'] as const
export type RuleKind = (typeof RULE_KINDS)[number]

export const RULE_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const
export type RuleSeverity = (typeof RULE_SEVERITIES)[number]

export const RULE_CHECK_AREAS = [
  'mrp',
  'net_quantity',
  'manufacturer_packer_importer',
  'customer_care',
  'required_declaration',
  'readability_font_size',
  'unit_sale_price',
  'declaration_validation',
] as const
export type RuleCheckArea = (typeof RULE_CHECK_AREAS)[number]

export type RuleOutcome = Exclude<ComplianceStatus, 'PASS' | 'NOT_APPLICABLE'>

export type RuleApplicability = {
  fieldKey?: ExtractedFieldKey
  equals?: string
}

export type RuleDefinition = {
  kind: RuleKind
  checkArea: RuleCheckArea
  fieldKey?: ExtractedFieldKey
  declarationType?: string
  measurementType?: string
  unit?: string
  min?: number
  max?: number
  pattern?: string
  missingOutcome?: RuleOutcome
  invalidOutcome?: RuleOutcome
  minConfidence?: number
  notApplicableWhenMissing?: boolean
  applicability?: RuleApplicability
}

export type ComplianceEvidence = {
  sourceImage?: SourceImageReference
  boundingBox?: { x: number; y: number; width: number; height: number }
  excerpt?: string
}

export type ComplianceResult = {
  ruleId: string
  ruleKey: string
  ruleName: string
  ruleVersion: string
  reference: string
  severity: RuleSeverity
  status: ComplianceStatus
  message: string
  detectedValue?: string
  expectedRequirement: string
  confidence: number
  evidence: ComplianceEvidence[]
  evaluatedAt: string
}

export type ComplianceRunResult = {
  id?: string
  inspectionId: string
  analysisId: string
  status: ComplianceStatus
  score: number | null
  evaluatedAt: string
  results: ComplianceResult[]
}

export type RuleEvaluationInput = {
  rule: {
    id: string
    key: string
    name: string
    version: string
    reference: string
    severity: RuleSeverity
    expectedRequirement: string
    definition: RuleDefinition
  }
  analysis: InspectionAnalysisResult
}

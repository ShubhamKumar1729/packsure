import type { RuleDefinition, RuleCheckArea, RuleKind } from '@/lib/compliance/types'

export type StoredRuleLike = {
  _id: { toString(): string }
  key: string
  name: string
  description: string
  checkArea: RuleCheckArea
  jurisdiction: string
  reference: string
  expectedRequirement: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  referenceUrl?: string
  version: string
  enabled: boolean
  definition: RuleDefinition
  supersedesRuleId?: { toString(): string }
  createdAt: Date | string
  updatedAt: Date | string
}

export function serializeRule(rule: StoredRuleLike) {
  return {
    id: rule._id.toString(),
    key: rule.key,
    name: rule.name,
    description: rule.description,
    checkArea: rule.checkArea,
    jurisdiction: rule.jurisdiction,
    reference: rule.reference,
    expectedRequirement: rule.expectedRequirement,
    severity: rule.severity,
    referenceUrl: rule.referenceUrl || '',
    version: rule.version,
    enabled: rule.enabled,
    definition: rule.definition,
    supersedesRuleId: rule.supersedesRuleId?.toString(),
    createdAt: new Date(rule.createdAt).toISOString(),
    updatedAt: new Date(rule.updatedAt).toISOString(),
  }
}

export function isRuleKind(value: unknown): value is RuleKind {
  return typeof value === 'string' && ['field_presence', 'declaration_presence', 'field_numeric', 'measurement_threshold', 'field_pattern', 'manual_review'].includes(value)
}

export function isRuleCheckArea(value: unknown): value is RuleCheckArea {
  return typeof value === 'string' && ['mrp', 'net_quantity', 'manufacturer_packer_importer', 'customer_care', 'required_declaration', 'readability_font_size', 'unit_sale_price', 'declaration_validation'].includes(value)
}

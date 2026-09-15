/**
 * Legal Metrology ruleset + engine integration tests.
 *
 * Fixtures here are SYNTHETIC ANALYSIS RESULTS used only to exercise the
 * deterministic rule engine — they never ship as runtime data.
 */

import { describe, expect, it } from 'vitest'
import { evaluateRules } from '@/lib/compliance/engine'
import { computeLegalSummary } from '@/lib/compliance/legal-metrology/scoring'
import { LEGAL_METROLOGY_RULES } from '@/lib/compliance/legal-metrology/rules'
import type { InspectionAnalysisResult, ExtractedField, SourceImageReference } from '@/lib/ai/types'

const SOURCE: SourceImageReference = { inspectionImageId: 'img1', filename: 'front.jpg', label: 'front', source: 'upload' }

function field(key: string, value: string, confidence = 0.9, normalizedValue?: string | number, unit?: string): ExtractedField {
  return { key, value, confidence, normalizedValue, unit, sourceImage: SOURCE }
}

function analysis(fields: ExtractedField[]): InspectionAnalysisResult {
  return {
    inspectionId: 'insp1',
    status: 'completed',
    provider: 'nlp',
    providerVersion: '1.0.0',
    overallConfidence: 0.9,
    images: [],
    fields,
    declarations: [],
  }
}

function ruleInputs() {
  return LEGAL_METROLOGY_RULES.map((rule) => ({
    id: rule.key,
    key: rule.key,
    name: rule.name,
    version: rule.version,
    reference: rule.reference,
    severity: rule.severity,
    expectedRequirement: rule.expectedRequirement,
    remediation: rule.remediation,
    definition: rule.definition,
  }))
}

function statusOf(results: ReturnType<typeof evaluateRules>['results'], key: string) {
  return results.find((result) => result.ruleKey === key)?.status
}

describe('legal metrology ruleset shape', () => {
  it('every rule carries a real reference, requirement, remediation and severity', () => {
    for (const rule of LEGAL_METROLOGY_RULES) {
      expect(rule.reference).toMatch(/Rule|Schedule|Act/)
      expect(rule.reference).toContain('2011')
      expect(rule.expectedRequirement.length).toBeGreaterThan(10)
      expect(rule.remediation.length).toBeGreaterThan(10)
      expect(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).toContain(rule.severity)
      expect(rule.jurisdiction).toBe('India')
    }
  })

  it('rule keys are unique and lowercase', () => {
    const keys = LEGAL_METROLOGY_RULES.map((rule) => rule.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(key).toBe(key.toLowerCase())
  })
})

describe('deterministic evaluation', () => {
  const rules = ruleInputs()

  it('a fully declared label passes the core rules', () => {
    const result = evaluateRules(rules, analysis([
      field('manufacturer', 'Acme Foods Pvt Ltd'),
      field('address', 'Plot 12, Mumbai 400093'),
      field('product_name', 'Biscuits'),
      field('net_quantity', '500 g', 0.95, 500, 'g'),
      field('mfg_date', '2026-06', 0.9, '2026-06'),
      field('mrp', '₹120', 0.95, 120),
      field('customer_care', 'care@acme.in'),
      field('batch_number', 'AB1234'),
    ]))

    expect(statusOf(result.results, 'lmpc_r6_responsible_party_name')).toBe('PASS')
    expect(statusOf(result.results, 'lmpc_r6_responsible_party_address')).toBe('PASS')
    expect(statusOf(result.results, 'lmpc_r6_generic_name')).toBe('PASS')
    expect(statusOf(result.results, 'lmpc_r6_net_quantity')).toBe('PASS')
    expect(statusOf(result.results, 'lmpc_r11_net_quantity_unit')).toBe('PASS')
    expect(statusOf(result.results, 'lmpc_r6_month_year')).toBe('PASS')
    expect(statusOf(result.results, 'lmpc_r6_month_year_format')).toBe('PASS')
    expect(statusOf(result.results, 'lmpc_r6_mrp')).toBe('PASS')
    expect(statusOf(result.results, 'lmpc_r6_mrp_positive')).toBe('PASS')
    expect(statusOf(result.results, 'lmpc_r6_consumer_care')).toBe('PASS')
    expect(statusOf(result.results, 'lmpc_r6_batch_number')).toBe('PASS')
    // Manual templates stay REVIEW_REQUIRED (they require human judgement).
    expect(statusOf(result.results, 'lmpc_2sched_font_size')).toBe('REVIEW_REQUIRED')
    // Legacy engine score is strict (null while any review is pending); the
    // severity-weighted legal summary handles pending reviews with a 40% penalty.
    expect(result.score).toBeNull()
    expect((computeLegalSummary(result.results).score ?? 0)).toBeGreaterThan(80)
  })

  it('a label missing MRP, net quantity and party violates the HIGH rules', () => {
    const result = evaluateRules(rules, analysis([
      field('product_name', 'Biscuits'),
    ]))
    expect(statusOf(result.results, 'lmpc_r6_responsible_party_name')).toBe('VIOLATION')
    expect(statusOf(result.results, 'lmpc_r6_responsible_party_address')).toBe('VIOLATION')
    expect(statusOf(result.results, 'lmpc_r6_mrp')).toBe('VIOLATION')
    expect(statusOf(result.results, 'lmpc_r6_net_quantity')).toBe('VIOLATION')
    expect(statusOf(result.results, 'lmpc_r6_month_year')).toBe('VIOLATION')
    // mrp_positive must be NOT_APPLICABLE when MRP is absent (no double-count).
    expect(statusOf(result.results, 'lmpc_r6_mrp_positive')).toBe('NOT_APPLICABLE')
  })

  it('any one responsible party satisfies the party-name rule', () => {
    const result = evaluateRules(rules, analysis([
      field('importer', 'Global Traders'),
      field('address', 'Mumbai 400001'),
      field('net_quantity', '750 ml', 0.9, 750, 'ml'),
      field('mfg_date', '2026-06'),
      field('mrp', '₹99'),
    ]))
    expect(statusOf(result.results, 'lmpc_r6_responsible_party_name')).toBe('PASS')
  })

  it('an illegal net-quantity unit is flagged', () => {
    const result = evaluateRules(rules, analysis([
      field('net_quantity', '500 furlongs', 0.9),
    ]))
    expect(statusOf(result.results, 'lmpc_r11_net_quantity_unit')).toBe('REVIEW_REQUIRED')
  })

  it('low-confidence MRP goes to review, not auto-pass', () => {
    const result = evaluateRules(rules, analysis([
      field('mrp', '₹1?0', 0.4, 10),
    ]))
    const mrpPositive = result.results.find((r) => r.ruleKey === 'lmpc_r6_mrp_positive')
    expect(mrpPositive?.status).toBe('REVIEW_REQUIRED')
  })

  it('evaluation is deterministic (same input, same output)', () => {
    const fields = analysis([field('mrp', '₹120', 0.9, 120)])
    const a = evaluateRules(rules, fields)
    const b = evaluateRules(rules, fields)
    expect(a.results.map((r) => r.status)).toEqual(b.results.map((r) => r.status))
    expect(a.score).toBe(b.score)
  })
})

describe('scoring + classification', () => {
  it('documented severity-weighted penalty math', () => {
    // 2 HIGH applicable: one PASS (15), one VIOLATION (15) -> score 50.
    const summary = computeLegalSummary([
      { ruleKey: 'a', severity: 'HIGH', status: 'PASS' },
      { ruleKey: 'b', severity: 'HIGH', status: 'VIOLATION' },
    ] as unknown as Parameters<typeof computeLegalSummary>[0])
    expect(summary.score).toBe(50)
    expect(summary.classification).toBe('NON_COMPLIANT')
  })

  it('review-required penalizes 40% and classifies PARTIAL', () => {
    const summary = computeLegalSummary([
      { ruleKey: 'a', severity: 'MEDIUM', status: 'REVIEW_REQUIRED' },
    ] as unknown as Parameters<typeof computeLegalSummary>[0])
    expect(summary.score).toBe(100 - Math.round(100 * (8 * 0.4) / 8))
    expect(summary.classification).toBe('PARTIAL')
  })

  it('no applicable checks -> INSUFFICIENT_DATA and null score', () => {
    const summary = computeLegalSummary([
      { ruleKey: 'a', severity: 'HIGH', status: 'NOT_APPLICABLE' },
    ] as unknown as Parameters<typeof computeLegalSummary>[0])
    expect(summary.score).toBeNull()
    expect(summary.classification).toBe('INSUFFICIENT_DATA')
  })

  it('all pass -> COMPLIANT with 100', () => {
    const summary = computeLegalSummary([
      { ruleKey: 'a', severity: 'LOW', status: 'PASS' },
    ] as unknown as Parameters<typeof computeLegalSummary>[0])
    expect(summary.score).toBe(100)
    expect(summary.classification).toBe('COMPLIANT')
  })
})

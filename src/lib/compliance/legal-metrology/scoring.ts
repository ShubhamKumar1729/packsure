/**
 * Deterministic scoring + classification for compliance runs (Phase 11).
 *
 * This layer is PURE and DETERMINISTIC — no LLM, no randomness. It derives a
 * transparent summary from the rule-engine results:
 *
 * Score (severity-weighted penalty model, formula version `severity-weighted-v1`):
 *   weight(s)  = { CRITICAL: 25, HIGH: 15, MEDIUM: 8, LOW: 3 }   (configurable below)
 *   applicable = results with status != NOT_APPLICABLE
 *   totalPenalty = Σ VIOLATION ? weight : REVIEW_REQUIRED ? 0.4 × weight : 0
 *   score = round(100 × (1 − totalPenalty / Σ weights of applicable checks))
 *   score = null when no check is applicable (never a fake 100).
 *
 * Classification (preliminary, computed — the HUMAN final decision recorded on
 * the inspection remains the authoritative legal outcome):
 *   NON_COMPLIANT  any VIOLATION with severity HIGH or CRITICAL
 *   PARTIAL        only LOW/MEDIUM violations, or pending reviews
 *   COMPLIANT      every applicable check passed
 *   INSUFFICIENT_DATA no applicable checks (documented extension of the
 *                  COMPLIANT/PARTIAL/NON_COMPLIANT scheme; no score is claimed)
 */

import type { ComplianceResult, ComplianceStatus, LegalSummary, RuleSeverity } from '@/lib/compliance/types'

export type { LegalSummary } from '@/lib/compliance/types'

export const SCORE_FORMULA_VERSION = 'severity-weighted-v1'
export const REVIEW_PENALTY_FACTOR = 0.4

export const DEFAULT_SEVERITY_WEIGHTS: Record<RuleSeverity, number> = {
  CRITICAL: 25,
  HIGH: 15,
  MEDIUM: 8,
  LOW: 3,
}

export type LegalClassification = LegalSummary['classification']

const HIGH_IMPACT_SEVERITIES: RuleSeverity[] = ['HIGH', 'CRITICAL']

export function computeLegalSummary(results: ComplianceResult[], weights: Record<RuleSeverity, number> = DEFAULT_SEVERITY_WEIGHTS): LegalSummary {
  const counts = { pass: 0, violation: 0, reviewRequired: 0, notApplicable: 0 }
  for (const result of results) {
    if (result.status === 'PASS') counts.pass += 1
    else if (result.status === 'VIOLATION') counts.violation += 1
    else if (result.status === 'REVIEW_REQUIRED') counts.reviewRequired += 1
    else counts.notApplicable += 1
  }

  const applicable = results.filter((result) => result.status !== 'NOT_APPLICABLE')
  const totalWeight = applicable.reduce((sum, result) => sum + (weights[result.severity] ?? 0), 0)
  const penalty = applicable.reduce((sum, result) => {
    if (result.status === 'VIOLATION') return sum + (weights[result.severity] ?? 0)
    if (result.status === 'REVIEW_REQUIRED') return sum + (weights[result.severity] ?? 0) * REVIEW_PENALTY_FACTOR
    return sum
  }, 0)

  const score = totalWeight > 0 ? Math.max(0, Math.min(100, Math.round(100 * (1 - penalty / totalWeight)))) : null

  let classification: LegalClassification
  if (applicable.length === 0) classification = 'INSUFFICIENT_DATA'
  else if (results.some((result) => result.status === 'VIOLATION' && HIGH_IMPACT_SEVERITIES.includes(result.severity))) classification = 'NON_COMPLIANT'
  else if (results.some((result) => result.status === 'VIOLATION' || result.status === 'REVIEW_REQUIRED')) classification = 'PARTIAL'
  else classification = 'COMPLIANT'

  return {
    formulaVersion: SCORE_FORMULA_VERSION,
    classification,
    score,
    counts,
    weightsApplied: weights,
    formulaDescription: `score = round(100 × (1 − Σ penalty ÷ Σ weight)) over applicable checks; VIOLATION counts its full severity weight (${weights.CRITICAL}/${weights.HIGH}/${weights.MEDIUM}/${weights.LOW} for CRITICAL/HIGH/MEDIUM/LOW), REVIEW_REQUIRED counts ${REVIEW_PENALTY_FACTOR * 100}% of it.`,
  }
}

/** Convenience for dashboards: map classification to the existing status set. */
export function classificationToStatus(classification: LegalClassification): ComplianceStatus | null {
  if (classification === 'NON_COMPLIANT') return 'VIOLATION'
  if (classification === 'PARTIAL') return 'REVIEW_REQUIRED'
  if (classification === 'COMPLIANT') return 'PASS'
  return null
}

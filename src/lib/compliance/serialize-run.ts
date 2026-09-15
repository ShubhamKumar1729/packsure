import type { ComplianceRunResult, ComplianceResult, ComplianceStatus } from '@/lib/compliance/types'
import { computeLegalSummary, type LegalSummary } from '@/lib/compliance/legal-metrology/scoring'

export type StoredComplianceLike = {
  _id: { toString(): string }
  inspectionId: { toString(): string } | string
  analysisId: { toString(): string } | string
  status: ComplianceStatus
  score: number | null
  results: unknown[]
  evaluatedAt: Date | string
}

export function serializeComplianceRun(run: StoredComplianceLike): ComplianceRunResult {
  const results = run.results as ComplianceResult[]
  // The legal summary (score + classification) is a pure derived value, so it is
  // recomputed on every read — formula improvements apply to stored runs too.
  const summary: LegalSummary = computeLegalSummary(results)
  return {
    id: run._id.toString(),
    inspectionId: typeof run.inspectionId === 'string' ? run.inspectionId : run.inspectionId.toString(),
    analysisId: typeof run.analysisId === 'string' ? run.analysisId : run.analysisId.toString(),
    status: run.status,
    score: summary.score ?? run.score ?? null,
    summary,
    evaluatedAt: new Date(run.evaluatedAt).toISOString(),
    results,
  }
}

import type { ComplianceRunResult, ComplianceResult, ComplianceStatus } from '@/lib/compliance/types'

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
  return {
    id: run._id.toString(),
    inspectionId: typeof run.inspectionId === 'string' ? run.inspectionId : run.inspectionId.toString(),
    analysisId: typeof run.analysisId === 'string' ? run.analysisId : run.analysisId.toString(),
    status: run.status,
    score: run.score ?? null,
    evaluatedAt: new Date(run.evaluatedAt).toISOString(),
    results: run.results as ComplianceResult[],
  }
}

import type { ComplianceEvidence, ComplianceRunResult, ComplianceStatus } from '@/lib/compliance/types'
import type { RuleSeverity } from '@/lib/compliance/types'

export const HUMAN_FINDING_DECISIONS = ['PENDING', 'ACCEPTED', 'REJECTED'] as const
export type HumanFindingDecision = (typeof HUMAN_FINDING_DECISIONS)[number]

export const FINAL_DECISIONS = ['PENDING', 'COMPLIANT', 'VIOLATION'] as const
export type FinalDecision = (typeof FINAL_DECISIONS)[number]

export type ReviewAction = 'ACCEPT_FINDING' | 'REJECT_FINDING' | 'CORRECT_VALUE' | 'ADD_COMMENT'

export type ReviewFinding = {
  id: string
  complianceRunId: string
  ruleId: string
  ruleKey: string
  ruleName: string
  ruleVersion: string
  ruleReference: string
  severity: RuleSeverity
  aiStatus: ComplianceStatus
  humanDecision: HumanFindingDecision
  detectedValue?: string
  correctedValue?: string
  expectedRequirement: string
  confidence: number
  evidence: ComplianceEvidence[]
  comment?: string
  reviewedBy?: string
  reviewedAt?: string
}

export type ReviewAuditEntry = {
  id: string
  findingId?: string
  actorUserId: string
  actorLabel?: string
  action: ReviewAction | 'FINAL_DECISION'
  oldDecision: string
  newDecision: string
  oldValue?: string
  newValue?: string
  comment?: string
  createdAt: string
}

export type ReviewSnapshot = {
  inspection: {
    id: string
    status: string
    finalDecision: FinalDecision
    finalComment?: string
    finalizedBy?: string
    finalizedAt?: string
  }
  compliance: ComplianceRunResult | null
  findings: ReviewFinding[]
  auditLog: ReviewAuditEntry[]
}

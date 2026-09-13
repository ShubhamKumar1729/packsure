import type { ReviewAuditEntry, ReviewFinding, ReviewSnapshot } from '@/lib/review/types'

export type StoredFindingLike = {
  _id: { toString(): string }
  complianceRunId: { toString(): string }
  ruleId: string
  ruleKey: string
  ruleName: string
  ruleVersion: string
  ruleReference: string
  severity: ReviewFinding['severity']
  aiStatus: ReviewFinding['aiStatus']
  humanDecision: ReviewFinding['humanDecision']
  detectedValue?: string
  correctedValue?: string
  expectedRequirement: string
  confidence: number
  evidence: unknown[]
  comment?: string
  reviewedBy?: { toString(): string }
  reviewedAt?: Date | string
}

export type StoredAuditLike = {
  _id: { toString(): string }
  findingId?: { toString(): string }
  actorUserId: { toString(): string } | { _id: { toString(): string }; email?: string; displayName?: string }
  action: ReviewAuditEntry['action']
  oldDecision: string
  newDecision: string
  oldValue?: string
  newValue?: string
  comment?: string
  createdAt: Date | string
}

export function serializeFinding(finding: StoredFindingLike): ReviewFinding {
  return {
    id: finding._id.toString(),
    complianceRunId: finding.complianceRunId.toString(),
    ruleId: finding.ruleId,
    ruleKey: finding.ruleKey,
    ruleName: finding.ruleName,
    ruleVersion: finding.ruleVersion,
    ruleReference: finding.ruleReference,
    severity: finding.severity,
    aiStatus: finding.aiStatus,
    humanDecision: finding.humanDecision,
    detectedValue: finding.detectedValue,
    correctedValue: finding.correctedValue,
    expectedRequirement: finding.expectedRequirement,
    confidence: finding.confidence,
    evidence: finding.evidence as ReviewFinding['evidence'],
    comment: finding.comment,
    reviewedBy: finding.reviewedBy?.toString(),
    reviewedAt: finding.reviewedAt ? new Date(finding.reviewedAt).toISOString() : undefined,
  }
}

export function serializeAuditEntry(entry: StoredAuditLike): ReviewAuditEntry {
  const actor = 'email' in entry.actorUserId ? entry.actorUserId : null
  const actorUserId = actor ? actor._id.toString() : entry.actorUserId.toString()
  return {
    id: entry._id.toString(),
    findingId: entry.findingId?.toString(),
    actorUserId,
    actorLabel: actor?.displayName || actor?.email || actorUserId,
    action: entry.action,
    oldDecision: entry.oldDecision,
    newDecision: entry.newDecision,
    oldValue: entry.oldValue,
    newValue: entry.newValue,
    comment: entry.comment,
    createdAt: new Date(entry.createdAt).toISOString(),
  }
}

export function serializeReviewSnapshot(snapshot: ReviewSnapshot): ReviewSnapshot {
  return snapshot
}

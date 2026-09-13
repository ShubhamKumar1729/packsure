import { Schema, model, models, type Model, type HydratedDocument } from 'mongoose'
import type { ComplianceStatus } from '@/lib/compliance/types'
import type { HumanFindingDecision } from '@/lib/review/types'
import type { RuleSeverity } from '@/lib/compliance/types'

export interface InspectionFindingDocument {
  inspectionId: Schema.Types.ObjectId
  complianceRunId: Schema.Types.ObjectId
  createdBy: Schema.Types.ObjectId
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
  evidence: unknown[]
  comment?: string
  reviewedBy?: Schema.Types.ObjectId
  reviewedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const InspectionFindingSchema = new Schema<InspectionFindingDocument>(
  {
    inspectionId: { type: Schema.Types.ObjectId, ref: 'Inspection', required: true, index: true },
    complianceRunId: { type: Schema.Types.ObjectId, ref: 'InspectionCompliance', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, required: true, index: true },
    ruleId: { type: String, required: true },
    ruleKey: { type: String, required: true },
    ruleName: { type: String, required: true },
    ruleVersion: { type: String, required: true },
    ruleReference: { type: String, required: true },
    severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: true },
    aiStatus: { type: String, enum: ['PASS', 'VIOLATION', 'REVIEW_REQUIRED', 'NOT_APPLICABLE'], required: true },
    humanDecision: { type: String, enum: ['PENDING', 'ACCEPTED', 'REJECTED'], required: true, default: 'PENDING', index: true },
    detectedValue: { type: String, trim: true },
    correctedValue: { type: String, trim: true },
    expectedRequirement: { type: String, required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    evidence: { type: [Schema.Types.Mixed], default: [] },
    comment: { type: String, trim: true, maxlength: 4000 },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    reviewedAt: { type: Date },
  },
  { timestamps: true },
)

InspectionFindingSchema.index({ inspectionId: 1, createdAt: -1 })

export type InspectionFindingModel = Model<InspectionFindingDocument>
export type InspectionFindingRecord = HydratedDocument<InspectionFindingDocument>

export const InspectionFinding = (models.InspectionFinding as InspectionFindingModel | undefined) ?? model<InspectionFindingDocument>('InspectionFinding', InspectionFindingSchema)

import { Schema, model, models, type Model, type HydratedDocument } from 'mongoose'
import type { ReviewAction } from '@/lib/review/types'

export interface ReviewAuditLogDocument {
  inspectionId: Schema.Types.ObjectId
  findingId?: Schema.Types.ObjectId
  actorUserId: Schema.Types.ObjectId
  action: ReviewAction | 'FINAL_DECISION'
  oldDecision: string
  newDecision: string
  oldValue?: string
  newValue?: string
  comment?: string
  createdAt: Date
  updatedAt: Date
}

const ReviewAuditLogSchema = new Schema<ReviewAuditLogDocument>(
  {
    inspectionId: { type: Schema.Types.ObjectId, ref: 'Inspection', required: true, index: true },
    findingId: { type: Schema.Types.ObjectId, ref: 'InspectionFinding', index: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, enum: ['ACCEPT_FINDING', 'REJECT_FINDING', 'CORRECT_VALUE', 'ADD_COMMENT', 'FINAL_DECISION'], required: true },
    oldDecision: { type: String, required: true },
    newDecision: { type: String, required: true },
    oldValue: { type: String },
    newValue: { type: String },
    comment: { type: String, trim: true, maxlength: 4000 },
  },
  { timestamps: true },
)

ReviewAuditLogSchema.index({ inspectionId: 1, createdAt: -1 })

export type ReviewAuditLogModel = Model<ReviewAuditLogDocument>
export type ReviewAuditLogRecord = HydratedDocument<ReviewAuditLogDocument>

export const ReviewAuditLog = (models.ReviewAuditLog as ReviewAuditLogModel | undefined) ?? model<ReviewAuditLogDocument>('ReviewAuditLog', ReviewAuditLogSchema)

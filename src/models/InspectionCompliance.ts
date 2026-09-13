import { Schema, model, models, type Model, type HydratedDocument } from 'mongoose'
import type { ComplianceStatus } from '@/lib/compliance/types'

export interface InspectionComplianceDocument {
  inspectionId: Schema.Types.ObjectId
  analysisId: Schema.Types.ObjectId
  createdBy: Schema.Types.ObjectId
  status: ComplianceStatus
  score: number | null
  results: unknown[]
  evaluatedAt: Date
  createdAt: Date
  updatedAt: Date
}

const InspectionComplianceSchema = new Schema<InspectionComplianceDocument>(
  {
    inspectionId: { type: Schema.Types.ObjectId, ref: 'Inspection', required: true, index: true },
    analysisId: { type: Schema.Types.ObjectId, ref: 'InspectionAnalysis', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, required: true, index: true },
    status: { type: String, enum: ['PASS', 'VIOLATION', 'REVIEW_REQUIRED', 'NOT_APPLICABLE'], required: true, index: true },
    score: { type: Number, min: 0, max: 100, default: null },
    results: { type: [Schema.Types.Mixed], default: [] },
    evaluatedAt: { type: Date, required: true },
  },
  { timestamps: true },
)

InspectionComplianceSchema.index({ inspectionId: 1, createdAt: -1 })

export type InspectionComplianceModel = Model<InspectionComplianceDocument>
export type InspectionComplianceRecord = HydratedDocument<InspectionComplianceDocument>

export const InspectionCompliance = (models.InspectionCompliance as InspectionComplianceModel | undefined) ?? model<InspectionComplianceDocument>('InspectionCompliance', InspectionComplianceSchema)

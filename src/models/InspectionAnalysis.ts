import { Schema, model, models, type Model, type HydratedDocument } from 'mongoose'
import type { AIAnalysisStatus } from '@/lib/ai/types'

export interface InspectionAnalysisDocument {
  inspectionId: Schema.Types.ObjectId
  createdBy: Schema.Types.ObjectId
  status: AIAnalysisStatus
  provider: string
  providerVersion: string
  overallConfidence: number
  images: unknown[]
  fields: unknown[]
  declarations: unknown[]
  error?: string
  analyzedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const InspectionAnalysisSchema = new Schema<InspectionAnalysisDocument>(
  {
    inspectionId: { type: Schema.Types.ObjectId, ref: 'Inspection', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, required: true, index: true },
    status: { type: String, enum: ['running', 'completed', 'failed', 'unavailable'], required: true, index: true },
    provider: { type: String, required: true, trim: true },
    providerVersion: { type: String, required: true, trim: true },
    overallConfidence: { type: Number, min: 0, max: 1, default: 0 },
    images: { type: [Schema.Types.Mixed], default: [] },
    fields: { type: [Schema.Types.Mixed], default: [] },
    declarations: { type: [Schema.Types.Mixed], default: [] },
    error: { type: String, trim: true, maxlength: 2000 },
    analyzedAt: { type: Date },
  },
  { timestamps: true },
)

InspectionAnalysisSchema.index({ inspectionId: 1, createdAt: -1 })

export type InspectionAnalysisModel = Model<InspectionAnalysisDocument>
export type InspectionAnalysisRecord = HydratedDocument<InspectionAnalysisDocument>

export const InspectionAnalysis = (models.InspectionAnalysis as InspectionAnalysisModel | undefined) ?? model<InspectionAnalysisDocument>('InspectionAnalysis', InspectionAnalysisSchema)

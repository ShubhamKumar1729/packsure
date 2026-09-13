import { Schema, model, models, type Model, type HydratedDocument } from 'mongoose'
import type { FinalDecision } from '@/lib/review/types'

export const INSPECTION_STATUSES = ['draft', 'submitted', 'in_review', 'closed'] as const
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number]

export interface InspectionDocument {
  productId: Schema.Types.ObjectId
  createdBy: Schema.Types.ObjectId
  status: InspectionStatus
  imageCount: number
  notes?: string
  onlineListingUrl?: string
  finalDecision: FinalDecision
  finalComment?: string
  finalizedBy?: Schema.Types.ObjectId
  finalizedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const InspectionSchema = new Schema<InspectionDocument>(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, required: true, index: true },
    status: { type: String, enum: INSPECTION_STATUSES, default: 'submitted', required: true, index: true },
    imageCount: { type: Number, min: 1, required: true },
    notes: { type: String, trim: true, maxlength: 2000 },
    onlineListingUrl: { type: String, trim: true, maxlength: 2000 },
    finalDecision: { type: String, enum: ['PENDING', 'COMPLIANT', 'VIOLATION'], default: 'PENDING', required: true, index: true },
    finalComment: { type: String, trim: true, maxlength: 4000 },
    finalizedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    finalizedAt: { type: Date },
  },
  { timestamps: true },
)

export type InspectionModel = Model<InspectionDocument>
export type InspectionRecord = HydratedDocument<InspectionDocument>

export const Inspection = (models.Inspection as InspectionModel | undefined) ?? model<InspectionDocument>('Inspection', InspectionSchema)

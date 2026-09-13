import { Schema, model, models, type HydratedDocument, type Model } from 'mongoose'

export interface ReportDocument {
  inspectionId: Schema.Types.ObjectId
  createdBy: Schema.Types.ObjectId
  reportVersion: string
  generatedAt: Date
  snapshot: unknown
  createdAt: Date
  updatedAt: Date
}

const ReportSchema = new Schema<ReportDocument>(
  {
    inspectionId: { type: Schema.Types.ObjectId, ref: 'Inspection', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    reportVersion: { type: String, required: true, default: '1.0' },
    generatedAt: { type: Date, required: true },
    snapshot: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
)

ReportSchema.index({ createdBy: 1, createdAt: -1 })

export type ReportModel = Model<ReportDocument>
export type ReportRecord = HydratedDocument<ReportDocument>

export const Report = (models.Report as ReportModel | undefined) ?? model<ReportDocument>('Report', ReportSchema)

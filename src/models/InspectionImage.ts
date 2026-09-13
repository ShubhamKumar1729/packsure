import { Schema, model, models, type Model, type HydratedDocument } from 'mongoose'

export const IMAGE_LABELS = ['front', 'back', 'side', 'top', 'bottom'] as const
export const IMAGE_SOURCES = ['camera', 'upload'] as const
export type ImageLabel = (typeof IMAGE_LABELS)[number]
export type ImageSource = (typeof IMAGE_SOURCES)[number]

export interface InspectionImageDocument {
  inspectionId: Schema.Types.ObjectId
  productId: Schema.Types.ObjectId
  createdBy: Schema.Types.ObjectId
  label: ImageLabel
  source: ImageSource
  filename: string
  mimeType: string
  sizeBytes: number
  sortOrder: number
  data: Buffer
  createdAt: Date
  updatedAt: Date
}

const InspectionImageSchema = new Schema<InspectionImageDocument>(
  {
    inspectionId: { type: Schema.Types.ObjectId, ref: 'Inspection', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, required: true, index: true },
    label: { type: String, enum: IMAGE_LABELS, required: true },
    source: { type: String, enum: IMAGE_SOURCES, required: true },
    filename: { type: String, required: true, trim: true, maxlength: 255 },
    mimeType: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] },
    sizeBytes: { type: Number, required: true, min: 1 },
    sortOrder: { type: Number, required: true, min: 0 },
    // Binary content is stored in MongoDB for this foundation. The document shape is shared by camera and upload sources.
    data: { type: Buffer, required: true, select: false },
  },
  { timestamps: true },
)

InspectionImageSchema.index({ inspectionId: 1, sortOrder: 1 })

export type InspectionImageModel = Model<InspectionImageDocument>
export type InspectionImageRecord = HydratedDocument<InspectionImageDocument>

export const InspectionImage = (models.InspectionImage as InspectionImageModel | undefined) ?? model<InspectionImageDocument>('InspectionImage', InspectionImageSchema)

import { Schema, model, models, type HydratedDocument, type Model } from 'mongoose'
import type { ListingComparisonStatus } from '@/lib/marketplace/types'

export interface MarketplaceComparisonDocument {
  inspectionId: Schema.Types.ObjectId
  productId: Schema.Types.ObjectId
  createdBy: Schema.Types.ObjectId
  sourceUrl: string
  marketplace: string
  provider: string
  providerVersion: string
  retrievedAt: Date
  overallStatus: ListingComparisonStatus
  listing: unknown
  packageSnapshot: unknown
  fields: unknown[]
  createdAt: Date
  updatedAt: Date
}

const MarketplaceComparisonSchema = new Schema<MarketplaceComparisonDocument>(
  {
    inspectionId: { type: Schema.Types.ObjectId, ref: 'Inspection', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, required: true, index: true },
    sourceUrl: { type: String, required: true, trim: true, maxlength: 2000 },
    marketplace: { type: String, required: true, trim: true, maxlength: 200 },
    provider: { type: String, required: true, trim: true, maxlength: 120 },
    providerVersion: { type: String, required: true, trim: true, maxlength: 80 },
    retrievedAt: { type: Date, required: true },
    overallStatus: { type: String, enum: ['MATCHED', 'MISMATCH', 'REVIEW_REQUIRED'], required: true, index: true },
    listing: { type: Schema.Types.Mixed, required: true },
    packageSnapshot: { type: Schema.Types.Mixed, required: true },
    fields: { type: [Schema.Types.Mixed], default: [] },
  },
  { timestamps: true },
)

MarketplaceComparisonSchema.index({ inspectionId: 1, createdAt: -1 })

export type MarketplaceComparisonModel = Model<MarketplaceComparisonDocument>
export type MarketplaceComparisonRecord = HydratedDocument<MarketplaceComparisonDocument>

export const MarketplaceComparison = (models.MarketplaceComparison as MarketplaceComparisonModel | undefined) ?? model<MarketplaceComparisonDocument>('MarketplaceComparison', MarketplaceComparisonSchema)

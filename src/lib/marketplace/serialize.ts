import type { ListingComparisonResult, MarketplaceListing } from '@/lib/marketplace/types'

export type StoredMarketplaceComparisonLike = {
  _id: { toString(): string }
  inspectionId: { toString(): string } | string
  productId: { toString(): string } | string
  sourceUrl: string
  marketplace: string
  provider: string
  providerVersion: string
  retrievedAt: Date | string
  overallStatus: ListingComparisonResult['overallStatus']
  listing: unknown
  fields: unknown[]
}

export function serializeMarketplaceComparison(comparison: StoredMarketplaceComparisonLike): ListingComparisonResult {
  return {
    id: comparison._id.toString(),
    inspectionId: typeof comparison.inspectionId === 'string' ? comparison.inspectionId : comparison.inspectionId.toString(),
    productId: typeof comparison.productId === 'string' ? comparison.productId : comparison.productId.toString(),
    sourceUrl: comparison.sourceUrl,
    marketplace: comparison.marketplace,
    provider: comparison.provider,
    providerVersion: comparison.providerVersion,
    retrievedAt: new Date(comparison.retrievedAt).toISOString(),
    overallStatus: comparison.overallStatus,
    fields: comparison.fields as ListingComparisonResult['fields'],
    listing: comparison.listing as MarketplaceListing,
  }
}

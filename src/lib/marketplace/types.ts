export const LISTING_FIELD_KEYS = ['product_name', 'brand', 'mrp', 'net_quantity', 'manufacturer', 'important_declarations'] as const
export type ListingFieldKey = (typeof LISTING_FIELD_KEYS)[number]

export const LISTING_COMPARISON_STATUSES = ['MATCHED', 'MISMATCH', 'REVIEW_REQUIRED'] as const
export type ListingComparisonStatus = (typeof LISTING_COMPARISON_STATUSES)[number]

export type ListingEvidence = {
  source: 'listing'
  locator: string
  excerpt?: string
}

export type PackageEvidence = {
  source: 'package'
  locator: string
  imageId?: string
  imageLabel?: string
  excerpt?: string
}

export type ListingFieldValue = {
  value: string | null
  values: string[]
  evidence: ListingEvidence[]
}

export type MarketplaceListing = {
  sourceUrl: string
  marketplace: string
  title: string | null
  productName: ListingFieldValue
  brand: ListingFieldValue
  mrp: ListingFieldValue
  netQuantity: ListingFieldValue
  manufacturer: ListingFieldValue
  importantDeclarations: ListingFieldValue
}

export type MarketplaceProviderResult = {
  provider: string
  providerVersion: string
  retrievedAt: string
  listing: MarketplaceListing
}

export interface MarketplaceListingProvider {
  readonly id: string
  readonly version: string
  supports(url: URL): boolean
  retrieve(url: URL): Promise<MarketplaceProviderResult>
}

export type ListingComparisonSide = {
  value: string | null
  values: string[]
  evidence: (ListingEvidence | PackageEvidence)[]
}

export type ListingComparisonField = {
  key: ListingFieldKey
  label: string
  status: ListingComparisonStatus
  package: ListingComparisonSide
  listing: ListingComparisonSide
  explanation: string
}

export type ListingComparisonResult = {
  id?: string
  inspectionId: string
  productId: string
  sourceUrl: string
  marketplace: string
  provider: string
  providerVersion: string
  retrievedAt: string
  overallStatus: ListingComparisonStatus
  fields: ListingComparisonField[]
  listing: MarketplaceListing
}

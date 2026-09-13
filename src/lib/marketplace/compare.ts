import type { ExtractedField, InspectionAnalysisResult } from '@/lib/ai/types'
import type { PackageEvidence, ListingComparisonField, ListingComparisonResult, ListingComparisonSide, ListingFieldKey, MarketplaceListing } from '@/lib/marketplace/types'

export type ComparisonProduct = {
  id: string
  name: string
  brand?: string
  manufacturer?: string
  packSize?: string
  unit?: string
  declaredRetailPrice?: number
}

type PackageSnapshot = {
  productName: ListingComparisonSide
  brand: ListingComparisonSide
  mrp: ListingComparisonSide
  netQuantity: ListingComparisonSide
  manufacturer: ListingComparisonSide
  importantDeclarations: ListingComparisonSide
}

const LABELS: Record<ListingFieldKey, string> = {
  product_name: 'Product name',
  brand: 'Brand',
  mrp: 'MRP',
  net_quantity: 'Net quantity / pack size',
  manufacturer: 'Manufacturer information',
  important_declarations: 'Important declarations',
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value).trim()
}

function recordEvidence(locator: string, value: string): PackageEvidence {
  return { source: 'package', locator, excerpt: value ? value.slice(0, 320) : undefined }
}

function analysisEvidence(field: ExtractedField): PackageEvidence {
  return {
    source: 'package',
    locator: `analysis:${field.sourceImage.filename}`,
    imageId: field.sourceImage.inspectionImageId,
    imageLabel: field.sourceImage.label,
    excerpt: field.evidence || field.value,
  }
}

function packageSide(value: string | null, locator: string, extraEvidence: PackageEvidence[] = [], values?: string[]): ListingComparisonSide {
  const cleanValue = value?.trim() || null
  return {
    value: cleanValue,
    values: values?.filter(Boolean) || (cleanValue ? [cleanValue] : []),
    evidence: [...(cleanValue ? [recordEvidence(locator, cleanValue)] : []), ...extraEvidence],
  }
}

function fieldValue(analysis: InspectionAnalysisResult | null, keys: string[]) {
  return analysis?.fields.find((field) => keys.includes(field.key)) || null
}

function packageSnapshot(product: ComparisonProduct, analysis: InspectionAnalysisResult | null): PackageSnapshot {
  const mrpField = fieldValue(analysis, ['mrp'])
  const quantityField = fieldValue(analysis, ['net_quantity'])
  const manufacturerField = fieldValue(analysis, ['manufacturer_packer_importer'])
  const brandField = fieldValue(analysis, ['product_brand'])
  const declarations = analysis?.declarations || []

  const productName = packageSide(product.name || null, 'product-record:name')
  const brandValue = text(product.brand) || text(brandField?.value) || null
  const brandEvidence = brandField ? [analysisEvidence(brandField)] : []
  const mrpValue = product.declaredRetailPrice === undefined ? text(mrpField?.value) || null : String(product.declaredRetailPrice)
  const mrpEvidence = mrpField ? [analysisEvidence(mrpField)] : []
  const quantityValue = product.packSize ? `${product.packSize}${product.unit ? ` ${product.unit}` : ''}` : text(quantityField?.value) || null
  const quantityEvidence = quantityField ? [analysisEvidence(quantityField)] : []
  const manufacturerValue = text(product.manufacturer) || text(manufacturerField?.value) || null
  const manufacturerEvidence = manufacturerField ? [analysisEvidence(manufacturerField)] : []
  const declarationValues = declarations.map((declaration) => declaration.text.trim()).filter(Boolean)
  const declarationEvidence: PackageEvidence[] = declarations.map((declaration) => ({
    source: 'package',
    locator: `analysis:${declaration.sourceImage.filename}`,
    imageId: declaration.sourceImage.inspectionImageId,
    imageLabel: declaration.sourceImage.label,
    excerpt: declaration.text,
  }))

  return {
    productName,
    brand: packageSide(brandValue, brandField ? `analysis-field:${brandField.sourceImage.filename}` : 'product-record:brand', brandEvidence),
    mrp: packageSide(mrpValue, mrpField && product.declaredRetailPrice === undefined ? `analysis-field:${mrpField.sourceImage.filename}` : 'product-record:declaredRetailPrice', mrpEvidence),
    netQuantity: packageSide(quantityValue, quantityField && !product.packSize ? `analysis-field:${quantityField.sourceImage.filename}` : 'product-record:packSize', quantityEvidence),
    manufacturer: packageSide(manufacturerValue, manufacturerField && !product.manufacturer ? `analysis-field:${manufacturerField.sourceImage.filename}` : 'product-record:manufacturer', manufacturerEvidence),
    importantDeclarations: packageSide(declarationValues[0] || null, 'analysis:declarations', declarationEvidence, declarationValues),
  }
}

function normalizeText(value: string) {
  return value.toLocaleLowerCase().replace(/[₹$€£,]/g, ' ').replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}.% ]/gu, '').trim()
}

function normalizeMoney(value: string) {
  const match = value.replace(/,/g, '').match(/(?:₹|rs\.?|inr)?\s*([0-9]+(?:\.\d{1,2})?)/i)
  return match ? Number(match[1]).toFixed(2) : normalizeText(value)
}

function normalizeQuantity(value: string) {
  const match = value.replace(/,/g, '').match(/([0-9]+(?:\.\d+)?)\s*(kg|g|mg|l|ml|cl|pcs?|pieces?|units?)\b/i)
  if (!match) return normalizeText(value)
  const number = Number(match[1])
  const unit = match[2].toLowerCase()
  if (unit === 'kg') return `${(number * 1000).toFixed(4)} g`
  if (unit === 'mg') return `${(number / 1000).toFixed(4)} g`
  if (unit === 'l') return `${(number * 1000).toFixed(4)} ml`
  if (unit === 'cl') return `${(number * 10).toFixed(4)} ml`
  if (/pcs?|pieces?|units?/.test(unit)) return `${number.toFixed(4)} units`
  return `${number.toFixed(4)} ${unit}`
}

function comparableValues(key: ListingFieldKey, side: ListingComparisonSide) {
  const values = side.values.length > 0 ? side.values : side.value ? [side.value] : []
  return values.map((value) => key === 'mrp' ? normalizeMoney(value) : key === 'net_quantity' ? normalizeQuantity(value) : normalizeText(value)).filter(Boolean)
}

function compareField(key: ListingFieldKey, packageSideValue: ListingComparisonSide, listingSideValue: ListingComparisonSide): ListingComparisonField {
  const packageValues = comparableValues(key, packageSideValue)
  const listingValues = comparableValues(key, listingSideValue)
  let status: ListingComparisonField['status'] = 'REVIEW_REQUIRED'
  let explanation = 'A comparison could not be completed because one or both sides did not provide this value.'

  if (packageValues.length > 0 && listingValues.length > 0) {
    if (key === 'important_declarations') {
      const packageSet = new Set(packageValues)
      const listingSet = new Set(listingValues)
      const same = packageSet.size === listingSet.size && Array.from(packageSet).every((value) => listingSet.has(value))
      status = same ? 'MATCHED' : 'MISMATCH'
      explanation = same ? 'The available declaration values match.' : 'The available declaration values differ; review the package and listing evidence.'
    } else {
      const same = packageValues.some((value) => listingValues.includes(value))
      status = same ? 'MATCHED' : 'MISMATCH'
      explanation = same ? 'The available values match after normalization.' : key === 'mrp' ? 'The package MRP and online listing MRP are different.' : 'The available package and listing values differ.'
    }
  }

  return { key, label: LABELS[key], status, package: packageSideValue, listing: listingSideValue, explanation }
}

export function compareListingWithPackage(input: { inspectionId: string; product: ComparisonProduct; analysis: InspectionAnalysisResult | null; providerResult: { provider: string; providerVersion: string; retrievedAt: string; listing: MarketplaceListing } }): ListingComparisonResult & { packageSnapshot: PackageSnapshot } {
  const snapshot = packageSnapshot(input.product, input.analysis)
  const listing = input.providerResult.listing
  const fields = [
    compareField('product_name', snapshot.productName, { ...listing.productName }),
    compareField('brand', snapshot.brand, { ...listing.brand }),
    compareField('mrp', snapshot.mrp, { ...listing.mrp }),
    compareField('net_quantity', snapshot.netQuantity, { ...listing.netQuantity }),
    compareField('manufacturer', snapshot.manufacturer, { ...listing.manufacturer }),
    compareField('important_declarations', snapshot.importantDeclarations, { ...listing.importantDeclarations }),
  ]
  const overallStatus = fields.some((field) => field.status === 'MISMATCH') ? 'MISMATCH' : fields.some((field) => field.status === 'REVIEW_REQUIRED') ? 'REVIEW_REQUIRED' : 'MATCHED'
  return {
    inspectionId: input.inspectionId,
    productId: input.product.id,
    sourceUrl: listing.sourceUrl,
    marketplace: listing.marketplace,
    provider: input.providerResult.provider,
    providerVersion: input.providerResult.providerVersion,
    retrievedAt: input.providerResult.retrievedAt,
    overallStatus,
    fields,
    listing,
    packageSnapshot: snapshot,
  }
}

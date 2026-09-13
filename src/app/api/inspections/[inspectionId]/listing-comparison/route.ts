import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { serializeInspectionAnalysis } from '@/lib/ai/serialize'
import { compareListingWithPackage } from '@/lib/marketplace/compare'
import { getMarketplaceProvider } from '@/lib/marketplace/generic-provider'
import { serializeMarketplaceComparison } from '@/lib/marketplace/serialize'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { Inspection } from '@/models/Inspection'
import { InspectionAnalysis } from '@/models/InspectionAnalysis'
import { MarketplaceComparison } from '@/models/MarketplaceComparison'
import { Product } from '@/models/Product'

export const runtime = 'nodejs'

const COMPARISON_ROLES = ['admin', 'inspector']

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

async function loadInspection(inspectionId: string, userId: string, role: string) {
  const inspection = await Inspection.findById(inspectionId).lean()
  if (!inspection || (inspection.createdBy.toString() !== userId && !['admin', 'reviewer'].includes(role))) return null
  return inspection
}

export async function GET(_request: Request, { params }: { params: Promise<{ inspectionId: string }> }) {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)
  const { inspectionId } = await params
  if (!Types.ObjectId.isValid(inspectionId)) return errorResponse('Inspection ID is invalid.')

  try {
    await connectToDatabase()
    const inspection = await loadInspection(inspectionId, session.userId, session.role)
    if (!inspection) return errorResponse('Inspection not found.', 404)
    const comparison = await MarketplaceComparison.findOne({ inspectionId }).sort({ createdAt: -1 })
    if (!comparison) return errorResponse('No online listing comparison has been run for this inspection.', 404)
    return NextResponse.json({ comparison: serializeMarketplaceComparison(comparison) })
  } catch (error) {
    console.error('Listing comparison read error', error)
    return errorResponse('The listing comparison could not be loaded.', 503)
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ inspectionId: string }> }) {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)
  if (!COMPARISON_ROLES.includes(session.role)) return errorResponse('Your role cannot run listing comparisons.', 403)
  const { inspectionId } = await params
  if (!Types.ObjectId.isValid(inspectionId)) return errorResponse('Inspection ID is invalid.')

  let body: { url?: unknown } = {}
  try {
    body = await request.json() as { url?: unknown }
  } catch {
    return errorResponse('A listing URL is required.')
  }

  try {
    await connectToDatabase()
    const inspection = await loadInspection(inspectionId, session.userId, session.role)
    if (!inspection) return errorResponse('Inspection not found.', 404)

    const rawUrl = typeof body.url === 'string' && body.url.trim() ? body.url.trim() : inspection.onlineListingUrl
    if (!rawUrl) return errorResponse('Enter an online product or listing URL.')

    let url: URL
    try {
      url = new URL(rawUrl)
    } catch {
      return errorResponse('Enter a valid HTTP or HTTPS listing URL.')
    }

    const provider = getMarketplaceProvider(url)
    const providerResult = await provider.retrieve(url)
    const product = await Product.findById(inspection.productId).lean()
    if (!product) return errorResponse('The inspection product could not be found.', 404)
    const analysisRecord = await InspectionAnalysis.findOne({ inspectionId, status: 'completed' }).sort({ createdAt: -1 })
    const analysis = analysisRecord ? serializeInspectionAnalysis(analysisRecord) : null
    const compared = compareListingWithPackage({
      inspectionId,
      product: {
        id: product._id.toString(),
        name: product.name,
        brand: product.brand,
        manufacturer: product.manufacturer,
        packSize: product.packSize,
        unit: product.unit,
        declaredRetailPrice: product.declaredRetailPrice,
      },
      analysis,
      providerResult,
    })

    await Inspection.updateOne({ _id: inspection._id }, { $set: { onlineListingUrl: url.toString() } })
    const saved = await MarketplaceComparison.create({
      inspectionId: inspection._id,
      productId: product._id,
      createdBy: session.userId,
      sourceUrl: compared.sourceUrl,
      marketplace: compared.marketplace,
      provider: compared.provider,
      providerVersion: compared.providerVersion,
      retrievedAt: compared.retrievedAt,
      overallStatus: compared.overallStatus,
      listing: compared.listing,
      packageSnapshot: compared.packageSnapshot,
      fields: compared.fields,
    })

    return NextResponse.json({ comparison: serializeMarketplaceComparison(saved) }, { status: 201 })
  } catch (error) {
    console.error('Listing comparison error', error)
    const message = error instanceof Error && (/listing/i.test(error.message) || /private network/i.test(error.message) || /HTTP/i.test(error.message)) ? error.message : 'The listing comparison could not be completed. Check the listing URL and database connection.'
    return errorResponse(message, 502)
  }
}

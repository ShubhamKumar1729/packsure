import { notFound } from 'next/navigation'
import { Types } from 'mongoose'
import { InspectionDetail } from '@/components/inspection-detail'
import { connectToDatabase } from '@/lib/db'
import { requireSession } from '@/lib/server-auth'
import { serializeInspectionAnalysis } from '@/lib/ai/serialize'
import { serializeComplianceRun } from '@/lib/compliance/serialize-run'
import { serializeMarketplaceComparison } from '@/lib/marketplace/serialize'
import { Inspection } from '@/models/Inspection'
import { InspectionAnalysis } from '@/models/InspectionAnalysis'
import { InspectionCompliance } from '@/models/InspectionCompliance'
import { InspectionImage } from '@/models/InspectionImage'
import { MarketplaceComparison } from '@/models/MarketplaceComparison'

export default async function InspectionDetailPage({ params }: { params: Promise<{ inspectionId: string }> }) {
  const session = await requireSession()
  const { inspectionId } = await params
  if (!Types.ObjectId.isValid(inspectionId)) notFound()

  await connectToDatabase()
  const inspection = await Inspection.findById(inspectionId)
    .populate('productId', 'name brand manufacturer category packSize unit batchNumber declaredRetailPrice')
    .lean()
  if (!inspection) notFound()
  if (inspection.createdBy.toString() !== session.userId && !['admin', 'reviewer'].includes(session.role)) notFound()

  const images = await InspectionImage.find({ inspectionId })
    .select('-data')
    .sort({ sortOrder: 1 })
    .lean()
  const latestAnalysis = await InspectionAnalysis.findOne({ inspectionId }).sort({ createdAt: -1 })
  const latestCompliance = await InspectionCompliance.findOne({ inspectionId }).sort({ createdAt: -1 })
  const latestListingComparison = await MarketplaceComparison.findOne({ inspectionId }).sort({ createdAt: -1 })

  const product = inspection.productId as unknown as {
    _id: { toString(): string }
    name: string
    brand?: string
    manufacturer?: string
    category?: string
    packSize?: string
    unit?: string
    batchNumber?: string
    declaredRetailPrice?: number
  }

  return <InspectionDetail
    sessionRole={session.role}
    inspection={{
      id: inspection._id.toString(),
      status: inspection.status,
      finalDecision: inspection.finalDecision || 'PENDING',
      imageCount: inspection.imageCount,
      onlineListingUrl: inspection.onlineListingUrl || '',
      createdAt: new Date(inspection.createdAt).toISOString(),
    }}
    product={{
      id: product._id.toString(),
      name: product.name,
      brand: product.brand || '',
      manufacturer: product.manufacturer || '',
      category: product.category || '',
      packSize: product.packSize || '',
      unit: product.unit || '',
      batchNumber: product.batchNumber || '',
      declaredRetailPrice: product.declaredRetailPrice,
    }}
    images={images.map((image) => ({
      id: image._id.toString(),
      filename: image.filename,
      label: image.label,
      source: image.source,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      url: `/api/inspections/${inspectionId}/images/${image._id.toString()}`,
    }))}
    initialAnalysis={latestAnalysis ? serializeInspectionAnalysis(latestAnalysis) : null}
    initialCompliance={latestCompliance ? serializeComplianceRun(latestCompliance) : null}
    initialListingComparison={latestListingComparison ? serializeMarketplaceComparison(latestListingComparison) : null}
  />
}

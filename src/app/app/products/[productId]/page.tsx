import { notFound } from 'next/navigation'
import { Types } from 'mongoose'
import { ProductDetail } from '@/components/product-detail'
import { connectToDatabase } from '@/lib/db'
import { serializeFinding } from '@/lib/review/serialize'
import { requireSession } from '@/lib/server-auth'
import { Inspection } from '@/models/Inspection'
import { InspectionCompliance } from '@/models/InspectionCompliance'
import { InspectionFinding } from '@/models/InspectionFinding'
import { Product } from '@/models/Product'

export default async function ProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const session = await requireSession()
  const { productId } = await params
  if (!Types.ObjectId.isValid(productId)) notFound()
  await connectToDatabase()
  const product = await Product.findById(productId).lean()
  if (!product) notFound()
  if (product.createdBy.toString() !== session.userId && !['admin', 'reviewer'].includes(session.role)) notFound()

  const inspectionScope = ['admin', 'reviewer'].includes(session.role) ? {} : { createdBy: session.userId }
  const inspections = await Inspection.find({ ...inspectionScope, productId }).sort({ createdAt: -1 }).lean()
  const complianceRuns = await InspectionCompliance.find({ inspectionId: { $in: inspections.map((inspection) => inspection._id) } }).sort({ createdAt: -1 }).lean()
  const findings = await InspectionFinding.find({ inspectionId: { $in: inspections.map((inspection) => inspection._id) } }).sort({ createdAt: -1 }).lean()
  const latestCompliance = new Map<string, (typeof complianceRuns)[number]>()
  complianceRuns.forEach((run) => { if (!latestCompliance.has(run.inspectionId.toString())) latestCompliance.set(run.inspectionId.toString(), run) })
  const findingsByInspection = new Map<string, typeof findings>()
  findings.forEach((finding) => { const key = finding.inspectionId.toString(); findingsByInspection.set(key, [...(findingsByInspection.get(key) || []), finding]) })

  return <ProductDetail sessionRole={session.role} product={{ id: product._id.toString(), name: product.name, brand: product.brand || '', manufacturer: product.manufacturer || '', category: product.category || '', packSize: product.packSize || '', unit: product.unit || '', batchNumber: product.batchNumber || '', declaredRetailPrice: product.declaredRetailPrice, createdAt: new Date(product.createdAt).toISOString() }} histories={inspections.map((inspection) => {
    const compliance = latestCompliance.get(inspection._id.toString())
    return {
      inspectionId: inspection._id.toString(),
      createdAt: new Date(inspection.createdAt).toISOString(),
      status: inspection.status,
      finalDecision: inspection.finalDecision || 'PENDING',
      compliance: compliance ? { status: compliance.status, score: compliance.score ?? null, evaluatedAt: new Date(compliance.evaluatedAt).toISOString() } : null,
      findings: (findingsByInspection.get(inspection._id.toString()) || []).map((finding) => ({ ...serializeFinding(finding), inspectionId: inspection._id.toString(), evaluatedAt: compliance && finding.complianceRunId.toString() === compliance._id.toString() ? new Date(compliance.evaluatedAt).toISOString() : new Date(finding.createdAt).toISOString() })),
    }
  })} />
}

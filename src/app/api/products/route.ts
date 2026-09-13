import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { Inspection } from '@/models/Inspection'
import { InspectionCompliance } from '@/models/InspectionCompliance'
import { Product } from '@/models/Product'

export const runtime = 'nodejs'

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function GET(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  try {
    await connectToDatabase()
    const search = new URL(request.url).searchParams.get('search')?.trim() || ''
    const ownerFilter = ['admin', 'reviewer'].includes(session.role) ? {} : { createdBy: session.userId }
    const searchFilter = search ? { $or: [{ name: { $regex: escapeRegex(search), $options: 'i' } }, { brand: { $regex: escapeRegex(search), $options: 'i' } }, { manufacturer: { $regex: escapeRegex(search), $options: 'i' } }, { batchNumber: { $regex: escapeRegex(search), $options: 'i' } }] } : {}
    const products = await Product.find({ ...ownerFilter, ...searchFilter }).sort({ updatedAt: -1 }).limit(100).lean()
    const inspectionOwnerFilter = ['admin', 'reviewer'].includes(session.role) ? {} : { createdBy: session.userId }
    const counts = await Inspection.aggregate([{ $match: { ...inspectionOwnerFilter, productId: { $in: products.map((product) => product._id) } } }, { $group: { _id: '$productId', count: { $sum: 1 }, latest: { $max: '$createdAt' } } }])
    const countMap = new Map(counts.map((item) => [item._id.toString(), item]))
    const inspectionIds = await Inspection.find({ ...inspectionOwnerFilter, productId: { $in: products.map((product) => product._id) } }).select('_id productId').lean()
    const compliance = await InspectionCompliance.find({ inspectionId: { $in: inspectionIds.map((inspection) => inspection._id) } }).sort({ createdAt: -1 }).lean()
    const latestByProduct = new Map<string, (typeof compliance)[number]>()
    compliance.forEach((run) => {
      const inspection = inspectionIds.find((item) => item._id.toString() === run.inspectionId.toString())
      if (inspection && !latestByProduct.has(inspection.productId.toString())) latestByProduct.set(inspection.productId.toString(), run)
    })

    return NextResponse.json({ products: products.map((product) => {
      const count = countMap.get(product._id.toString())
      const latest = latestByProduct.get(product._id.toString())
      return {
        id: product._id.toString(),
        name: product.name,
        brand: product.brand || '',
        manufacturer: product.manufacturer || '',
        category: product.category || '',
        packSize: product.packSize || '',
        unit: product.unit || '',
        batchNumber: product.batchNumber || '',
        inspectionCount: count?.count || 0,
        latestInspectionAt: count?.latest,
        latestComplianceStatus: latest?.status || null,
        latestComplianceScore: latest?.score ?? null,
      }
    }) })
  } catch (error) {
    console.error('Product list error', error)
    return NextResponse.json({ error: 'Products could not be loaded.' }, { status: 503 })
  }
}

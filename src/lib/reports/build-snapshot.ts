import type { SessionPayload } from '@/lib/auth-shared'
import { serializeInspectionAnalysis } from '@/lib/ai/serialize'
import { serializeComplianceRun } from '@/lib/compliance/serialize-run'
import { connectToDatabase } from '@/lib/db'
import { serializeAuditEntry, serializeFinding } from '@/lib/review/serialize'
import type { ReportSnapshot } from '@/lib/reports/types'
import { Inspection } from '@/models/Inspection'
import { InspectionAnalysis } from '@/models/InspectionAnalysis'
import { InspectionCompliance } from '@/models/InspectionCompliance'
import { InspectionFinding } from '@/models/InspectionFinding'
import { InspectionImage } from '@/models/InspectionImage'
import { Product } from '@/models/Product'
import { ReviewAuditLog } from '@/models/ReviewAuditLog'
import { Types } from 'mongoose'

export async function buildReportSnapshot(inspectionId: string, session: SessionPayload): Promise<ReportSnapshot | null> {
  if (!Types.ObjectId.isValid(inspectionId)) return null
  await connectToDatabase()
  const inspection = await Inspection.findById(inspectionId)
  if (!inspection) return null
  const canAccess = inspection.createdBy.toString() === session.userId || ['admin', 'reviewer'].includes(session.role)
  if (!canAccess) return null

  const product = await Product.findById(inspection.productId).lean()
  if (!product) return null
  const images = await InspectionImage.find({ inspectionId }).select('-data').sort({ sortOrder: 1 }).lean()
  const compliance = await InspectionCompliance.findOne({ inspectionId }).sort({ createdAt: -1 })
  const analysis = compliance ? await InspectionAnalysis.findById(compliance.analysisId) : await InspectionAnalysis.findOne({ inspectionId }).sort({ createdAt: -1 })
  const findings = compliance ? await InspectionFinding.find({ inspectionId, complianceRunId: compliance._id }).sort({ createdAt: 1 }) : []
  const auditLog = await ReviewAuditLog.find({ inspectionId }).sort({ createdAt: 1 }).populate('actorUserId', 'email displayName')

  return {
    reportVersion: '1.0',
    generatedAt: new Date().toISOString(),
    product: {
      id: product._id.toString(),
      name: product.name,
      brand: product.brand,
      manufacturer: product.manufacturer,
      category: product.category,
      packSize: product.packSize,
      unit: product.unit,
      batchNumber: product.batchNumber,
      declaredRetailPrice: product.declaredRetailPrice,
    },
    inspection: {
      id: inspection._id.toString(),
      status: inspection.status,
      finalDecision: inspection.finalDecision || 'PENDING',
      finalComment: inspection.finalComment,
      finalizedBy: inspection.finalizedBy?.toString(),
      finalizedAt: inspection.finalizedAt?.toISOString(),
      createdAt: inspection.createdAt.toISOString(),
      imageCount: inspection.imageCount,
    },
    images: images.map((image) => ({ id: image._id.toString(), inspectionId: inspection._id.toString(), filename: image.filename, label: image.label, source: image.source, mimeType: image.mimeType, sizeBytes: image.sizeBytes })),
    analysis: analysis ? serializeInspectionAnalysis(analysis) : null,
    compliance: compliance ? serializeComplianceRun(compliance) : null,
    findings: findings.map(serializeFinding),
    auditLog: auditLog.map(serializeAuditEntry),
  }
}

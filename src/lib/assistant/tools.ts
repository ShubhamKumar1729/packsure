import { Types } from 'mongoose'
import { connectToDatabase } from '@/lib/db'
import { Inspection } from '@/models/Inspection'
import { InspectionCompliance } from '@/models/InspectionCompliance'
import { InspectionFinding } from '@/models/InspectionFinding'
import { InspectionImage } from '@/models/InspectionImage'
import { Product } from '@/models/Product'
import { Report } from '@/models/Report'
import { Rule } from '@/models/Rule'
import type { AssistantContext, AssistantEvidence, AssistantFinding, AssistantInspection, AssistantProductHistory, AssistantReport, AssistantRule, AssistantSession, AssistantToolContext } from '@/lib/assistant/types'

type RawImage = {
  _id: { toString(): string }
  inspectionId: { toString(): string }
  filename: string
  label: string
  source: string
}

type RawFinding = {
  _id: { toString(): string }
  inspectionId: { toString(): string }
  ruleId: string
  ruleKey: string
  ruleName: string
  ruleVersion: string
  ruleReference: string
  severity: string
  aiStatus: string
  humanDecision: string
  detectedValue?: string
  correctedValue?: string
  expectedRequirement: string
  confidence: number
  evidence: unknown[]
  comment?: string
  reviewedAt?: Date
  createdAt: Date
}

function invalid(message: string): never {
  throw new Error(message)
}

function assertId(value: string, label: string) {
  if (!Types.ObjectId.isValid(value)) invalid(`${label} is invalid.`)
}

function canRead(createdBy: { toString(): string }, session: AssistantSession) {
  return createdBy.toString() === session.userId || ['admin', 'reviewer'].includes(session.role)
}

async function authorizedInspection(session: AssistantSession, inspectionId: string) {
  assertId(inspectionId, 'Inspection ID')
  const inspection = await Inspection.findById(inspectionId).lean()
  if (!inspection || !canRead(inspection.createdBy, session)) invalid('The requested inspection is not available in your access scope.')
  return inspection
}

async function authorizedProduct(session: AssistantSession, productId: string) {
  assertId(productId, 'Product ID')
  const product = await Product.findById(productId).lean()
  if (!product || !canRead(product.createdBy, session)) invalid('The requested product is not available in your access scope.')
  return product
}

function evidenceSource(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const sourceImage = (value as { sourceImage?: unknown }).sourceImage
  if (!sourceImage || typeof sourceImage !== 'object') return null
  const image = sourceImage as { inspectionImageId?: unknown; filename?: unknown; label?: unknown }
  if (typeof image.inspectionImageId !== 'string') return null
  return { inspectionImageId: image.inspectionImageId, filename: typeof image.filename === 'string' ? image.filename : '', label: typeof image.label === 'string' ? image.label : 'package', boundingBox: (value as { boundingBox?: AssistantEvidence['boundingBox'] }).boundingBox, excerpt: typeof (value as { excerpt?: unknown }).excerpt === 'string' ? (value as { excerpt: string }).excerpt : undefined }
}

function mapEvidence(inspectionId: string, rawEvidence: unknown[], images: Map<string, RawImage>, findingId: string): AssistantEvidence[] {
  const results: AssistantEvidence[] = []
  rawEvidence.forEach((raw, index) => {
    const source = evidenceSource(raw)
    if (!source) return
    const image = images.get(source.inspectionImageId)
    if (!image) return
    results.push({
      id: `${findingId}-${index}`,
      inspectionId,
      imageId: image._id.toString(),
      imageUrl: `/api/inspections/${inspectionId}/images/${image._id.toString()}`,
      label: `${image.label} · ${image.filename}`,
      source: 'finding_evidence',
      excerpt: source.excerpt,
      boundingBox: source.boundingBox,
    })
  })
  return results
}

function mapFinding(finding: RawFinding, images: Map<string, RawImage>): AssistantFinding {
  const inspectionId = finding.inspectionId.toString()
  return {
    id: finding._id.toString(),
    inspectionId,
    ruleId: finding.ruleId,
    ruleKey: finding.ruleKey,
    ruleName: finding.ruleName,
    ruleVersion: finding.ruleVersion,
    ruleReference: finding.ruleReference,
    severity: finding.severity,
    aiStatus: finding.aiStatus,
    humanDecision: finding.humanDecision,
    detectedValue: finding.detectedValue,
    correctedValue: finding.correctedValue,
    expectedRequirement: finding.expectedRequirement,
    confidence: finding.confidence,
    comment: finding.comment,
    reviewedAt: finding.reviewedAt ? new Date(finding.reviewedAt).toISOString() : undefined,
    evidence: mapEvidence(inspectionId, finding.evidence || [], images, finding._id.toString()),
  }
}

function mapInspection(inspection: { _id: { toString(): string }; productId: { toString(): string }; status: string; finalDecision: string; finalComment?: string; createdAt: Date; imageCount: number }, product: { name: string; brand?: string; manufacturer?: string; packSize?: string; unit?: string; declaredRetailPrice?: number }, compliance: { status: string; score: number | null; evaluatedAt: Date } | null): AssistantInspection {
  return {
    id: inspection._id.toString(),
    productId: inspection.productId.toString(),
    productName: product.name,
    brand: product.brand,
    manufacturer: product.manufacturer,
    packSize: product.packSize,
    unit: product.unit,
    declaredRetailPrice: product.declaredRetailPrice,
    status: inspection.status,
    finalDecision: inspection.finalDecision || 'PENDING',
    finalComment: inspection.finalComment,
    createdAt: new Date(inspection.createdAt).toISOString(),
    imageCount: inspection.imageCount,
    compliance: compliance ? { status: compliance.status, score: compliance.score ?? null, evaluatedAt: new Date(compliance.evaluatedAt).toISOString() } : null,
  }
}

async function latestCompliance(inspectionId: string) {
  return InspectionCompliance.findOne({ inspectionId }).sort({ createdAt: -1 }).lean()
}

export async function getInspection(session: AssistantSession, inspectionId: string): Promise<AssistantInspection> {
  const inspection = await authorizedInspection(session, inspectionId)
  const product = await Product.findById(inspection.productId).lean()
  if (!product) invalid('The product linked to this inspection is not available.')
  const compliance = await latestCompliance(inspectionId)
  return mapInspection(inspection, product, compliance)
}

export async function getFindings(session: AssistantSession, args: { inspectionId: string; findingId?: string }): Promise<AssistantFinding[]> {
  await authorizedInspection(session, args.inspectionId)
  if (args.findingId) assertId(args.findingId, 'Finding ID')
  const latest = await latestCompliance(args.inspectionId)
  const filter = args.findingId ? { _id: args.findingId, inspectionId: args.inspectionId } : latest ? { inspectionId: args.inspectionId, complianceRunId: latest._id } : { inspectionId: args.inspectionId }
  const [findings, images] = await Promise.all([
    InspectionFinding.find(filter).sort({ severity: -1, createdAt: -1 }).lean(),
    InspectionImage.find({ inspectionId: args.inspectionId }).select('_id inspectionId filename label source').lean(),
  ])
  const imageMap = new Map(images.map((image) => [image._id.toString(), image as unknown as RawImage]))
  return findings.map((finding) => mapFinding(finding as unknown as RawFinding, imageMap))
}

export async function getProductHistory(session: AssistantSession, productId: string): Promise<AssistantProductHistory> {
  const product = await authorizedProduct(session, productId)
  const scope = ['admin', 'reviewer'].includes(session.role) ? {} : { createdBy: session.userId }
  const inspections = await Inspection.find({ ...scope, productId: product._id }).sort({ createdAt: -1 }).lean()
  const inspectionIds = inspections.map((inspection) => inspection._id)
  const [runs, findings, images] = await Promise.all([
    InspectionCompliance.find({ inspectionId: { $in: inspectionIds } }).sort({ createdAt: -1 }).lean(),
    InspectionFinding.find({ inspectionId: { $in: inspectionIds } }).sort({ createdAt: -1 }).lean(),
    InspectionImage.find({ inspectionId: { $in: inspectionIds } }).select('_id inspectionId filename label source').lean(),
  ])
  const latestByInspection = new Map<string, (typeof runs)[number]>()
  runs.forEach((run) => { if (!latestByInspection.has(run.inspectionId.toString())) latestByInspection.set(run.inspectionId.toString(), run) })
  const imageMapByInspection = new Map<string, Map<string, RawImage>>()
  images.forEach((image) => {
    const inspectionKey = image.inspectionId.toString()
    const imageMap = imageMapByInspection.get(inspectionKey) || new Map<string, RawImage>()
    imageMap.set(image._id.toString(), image as unknown as RawImage)
    imageMapByInspection.set(inspectionKey, imageMap)
  })
  const history = inspections.map((inspection) => mapInspection(inspection, product, latestByInspection.get(inspection._id.toString()) || null))
  const historyFindings = findings.map((finding) => mapFinding(finding as unknown as RawFinding, imageMapByInspection.get(finding.inspectionId.toString()) || new Map<string, RawImage>()))
  return {
    product: { id: product._id.toString(), name: product.name, brand: product.brand, manufacturer: product.manufacturer, packSize: product.packSize, unit: product.unit, declaredRetailPrice: product.declaredRetailPrice },
    inspections: history,
    findings: historyFindings,
  }
}

export async function getEvidence(session: AssistantSession, args: { inspectionId?: string; productId?: string; findingId?: string }): Promise<AssistantEvidence[]> {
  let inspectionIds: string[] = []
  if (args.inspectionId) {
    await authorizedInspection(session, args.inspectionId)
    inspectionIds = [args.inspectionId]
  } else if (args.productId) {
    const history = await getProductHistory(session, args.productId)
    inspectionIds = history.inspections.map((inspection) => inspection.id)
  } else invalid('An inspection or product context is required for evidence retrieval.')

  const findingFilter = args.findingId ? { _id: args.findingId, inspectionId: { $in: inspectionIds } } : { inspectionId: { $in: inspectionIds } }
  const [images, findings] = await Promise.all([
    InspectionImage.find({ inspectionId: { $in: inspectionIds } }).select('_id inspectionId filename label source').sort({ sortOrder: 1 }).lean(),
    InspectionFinding.find(findingFilter).lean(),
  ])
  const imageMap = new Map(images.map((image) => [image._id.toString(), image as unknown as RawImage]))
  const evidence: AssistantEvidence[] = images.map((image) => ({ id: `image-${image._id.toString()}`, inspectionId: image.inspectionId.toString(), imageId: image._id.toString(), imageUrl: `/api/inspections/${image.inspectionId.toString()}/images/${image._id.toString()}`, label: `${image.label} · ${image.filename}`, source: 'stored_package_image' }))
  findings.forEach((finding) => evidence.push(...mapEvidence(finding.inspectionId.toString(), finding.evidence || [], imageMap, finding._id.toString())))
  const seen = new Set<string>()
  return evidence.filter((item) => { const key = `${item.inspectionId}:${item.imageId}:${item.source}:${item.id}`; if (seen.has(key)) return false; seen.add(key); return true })
}

export async function getRules(session: AssistantSession, ruleKeys: string[]): Promise<AssistantRule[]> {
  if (ruleKeys.length === 0) return []
  const rules = await Rule.find({ key: { $in: Array.from(new Set(ruleKeys)) } }).sort({ key: 1, createdAt: -1 }).lean()
  const latest = new Map<string, (typeof rules)[number]>()
  rules.forEach((rule) => { if (!latest.has(rule.key)) latest.set(rule.key, rule) })
  return Array.from(latest.values()).map((rule) => ({ id: rule._id.toString(), key: rule.key, name: rule.name, description: rule.description, checkArea: rule.checkArea, jurisdiction: rule.jurisdiction, reference: rule.reference, expectedRequirement: rule.expectedRequirement, severity: rule.severity, version: rule.version, enabled: rule.enabled, referenceUrl: rule.referenceUrl }))
}

function reportSummary(report: { _id: { toString(): string }; inspectionId: { toString(): string }; reportVersion: string; generatedAt: Date; snapshot: unknown }): AssistantReport {
  const snapshot = report.snapshot && typeof report.snapshot === 'object' ? report.snapshot as { product?: { name?: string }; inspection?: { finalDecision?: string }; compliance?: { status?: string; score?: number | null }; findings?: unknown[] } : {}
  return { id: report._id.toString(), inspectionId: report.inspectionId.toString(), reportVersion: report.reportVersion, generatedAt: new Date(report.generatedAt).toISOString(), productName: snapshot.product?.name || 'Product name not stored in report snapshot', finalDecision: snapshot.inspection?.finalDecision || 'PENDING', complianceStatus: snapshot.compliance?.status, complianceScore: snapshot.compliance?.score, findingCount: Array.isArray(snapshot.findings) ? snapshot.findings.length : 0 }
}

async function authorizedReport(session: AssistantSession, reportId: string) {
  assertId(reportId, 'Report ID')
  const report = await Report.findById(reportId).lean()
  if (!report || !canRead(report.createdBy, session)) invalid('The requested report is not available in your access scope.')
  return report
}

export async function getReports(session: AssistantSession, args: { inspectionId?: string; reportId?: string }): Promise<AssistantReport[]> {
  if (args.reportId) return [reportSummary(await authorizedReport(session, args.reportId))]
  if (!args.inspectionId) invalid('An inspection or report context is required for report retrieval.')
  await authorizedInspection(session, args.inspectionId)
  const reportScope = ['admin', 'reviewer'].includes(session.role) ? {} : { createdBy: session.userId }
  const reports = await Report.find({ ...reportScope, inspectionId: args.inspectionId }).sort({ createdAt: -1 }).lean()
  return reports.map(reportSummary)
}

export async function collectAssistantContext(session: AssistantSession, context: AssistantContext): Promise<AssistantToolContext> {
  await connectToDatabase()
  let inspection: AssistantInspection | null = null
  let findings: AssistantFinding[] = []
  let productHistory: AssistantProductHistory | null = null
  let evidence: AssistantEvidence[] = []
  let reports: AssistantReport[] = []

  if (context.type === 'inspection') {
    inspection = await getInspection(session, context.id)
    findings = await getFindings(session, { inspectionId: context.id })
    evidence = await getEvidence(session, { inspectionId: context.id })
    productHistory = await getProductHistory(session, inspection.productId)
    reports = await getReports(session, { inspectionId: context.id })
  } else if (context.type === 'finding') {
    inspection = await getInspection(session, context.inspectionId)
    findings = await getFindings(session, { inspectionId: context.inspectionId, findingId: context.id })
    evidence = await getEvidence(session, { inspectionId: context.inspectionId, findingId: context.id })
    productHistory = await getProductHistory(session, inspection.productId)
    reports = await getReports(session, { inspectionId: context.inspectionId })
  } else if (context.type === 'product') {
    productHistory = await getProductHistory(session, context.id)
    findings = productHistory.findings
    evidence = await getEvidence(session, { productId: context.id })
    const latestInspection = productHistory.inspections[0]
    if (latestInspection) reports = await getReports(session, { inspectionId: latestInspection.id })
  } else {
    reports = await getReports(session, { reportId: context.id })
    const report = reports[0]
    if (report) {
      inspection = await getInspection(session, report.inspectionId)
      findings = await getFindings(session, { inspectionId: report.inspectionId })
      evidence = await getEvidence(session, { inspectionId: report.inspectionId })
      productHistory = await getProductHistory(session, inspection.productId)
      reports = await getReports(session, { inspectionId: report.inspectionId })
    }
  }

  const rules = await getRules(session, Array.from(new Set(findings.map((finding) => finding.ruleKey))))
  return { inspection, findings, productHistory, evidence, rules, reports, context }
}

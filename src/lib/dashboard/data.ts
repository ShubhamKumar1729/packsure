import type { SessionPayload } from '@/lib/auth-shared'
import { connectToDatabase } from '@/lib/db'
import { Inspection } from '@/models/Inspection'
import { InspectionCompliance } from '@/models/InspectionCompliance'
import { InspectionFinding } from '@/models/InspectionFinding'
import { Product } from '@/models/Product'
import type { DashboardComplianceStatus, DashboardData, DashboardInspection, DashboardRepeatViolation, DashboardRisk, DashboardTrendPoint, DashboardViolation } from '@/lib/dashboard/types'

const RISK_SEVERITY_POINTS: Record<string, number> = { LOW: 4, MEDIUM: 10, HIGH: 18, CRITICAL: 25 }

function emptyDashboard(): DashboardData {
  return {
    totalInspections: 0,
    complianceRate: null,
    compliancePassCount: 0,
    applicableEvaluations: 0,
    violations: 0,
    reviewRequired: 0,
    recentInspections: [],
    trend: [],
    commonViolations: [],
    repeatViolations: [],
    risk: { available: false, score: null, level: null, evaluatedInspections: 0, factors: [] },
  }
}

function monthKey(value: Date | string) {
  const date = new Date(value)
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, 1)))
}

function statusOf(value: unknown): DashboardComplianceStatus | null {
  return value === 'PASS' || value === 'VIOLATION' || value === 'REVIEW_REQUIRED' || value === 'NOT_APPLICABLE' ? value : null
}

function maxSeverity(current: string, next: string) {
  const order: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }
  return (order[next] || 0) > (order[current] || 0) ? next : current
}

export async function loadDashboardData(session: SessionPayload): Promise<DashboardData> {
  await connectToDatabase()
  const inspectionScope = ['admin', 'reviewer'].includes(session.role) ? {} : { createdBy: session.userId }
  const inspections = await Inspection.find(inspectionScope).sort({ createdAt: -1 }).lean()
  if (inspections.length === 0) return emptyDashboard()

  const inspectionIds = inspections.map((inspection) => inspection._id)
  const productIds = Array.from(new Set(inspections.map((inspection) => inspection.productId.toString())))
  const [products, complianceRuns, allFindings] = await Promise.all([
    Product.find({ _id: { $in: productIds } }).lean(),
    InspectionCompliance.find({ inspectionId: { $in: inspectionIds } }).sort({ createdAt: -1 }).lean(),
    InspectionFinding.find({ inspectionId: { $in: inspectionIds }, aiStatus: { $in: ['VIOLATION', 'REVIEW_REQUIRED'] } }).sort({ createdAt: -1 }).lean(),
  ])

  const productRecords = new Map(products.map((product) => [product._id.toString(), { name: product.name, brand: product.brand || '' }]))
  const inspectionById = new Map(inspections.map((inspection) => [inspection._id.toString(), inspection]))
  const latestRunByInspection = new Map<string, (typeof complianceRuns)[number]>()
  complianceRuns.forEach((run) => {
    const key = run.inspectionId.toString()
    if (!latestRunByInspection.has(key)) latestRunByInspection.set(key, run)
  })
  const latestRuns = Array.from(latestRunByInspection.values())
  const latestRunIds = latestRuns.map((run) => run._id)
  const latestFindings = allFindings.filter((finding) => latestRunIds.some((runId) => runId.toString() === finding.complianceRunId.toString()))

  const complianceStatuses = latestRuns.map((run) => statusOf(run.status)).filter((status): status is DashboardComplianceStatus => status !== null)
  const applicableStatuses = complianceStatuses.filter((status) => status !== 'NOT_APPLICABLE')
  const compliancePassCount = applicableStatuses.filter((status) => status === 'PASS').length
  const violations = applicableStatuses.filter((status) => status === 'VIOLATION').length
  const reviewRequired = applicableStatuses.filter((status) => status === 'REVIEW_REQUIRED').length

  const recentInspections: DashboardInspection[] = inspections.slice(0, 8).map((inspection) => {
    const run = latestRunByInspection.get(inspection._id.toString())
    const product = productRecords.get(inspection.productId.toString())
    return {
      id: inspection._id.toString(),
      productName: product?.name || 'Product record unavailable',
      brand: product?.brand || '',
      status: inspection.status,
      finalDecision: inspection.finalDecision || 'PENDING',
      complianceStatus: run ? statusOf(run.status) : null,
      complianceScore: run?.score ?? null,
      imageCount: inspection.imageCount,
      createdAt: new Date(inspection.createdAt).toISOString(),
    }
  })

  const trendMap = new Map<string, DashboardTrendPoint>()
  latestRuns.forEach((run) => {
    const key = monthKey(run.evaluatedAt)
    const point = trendMap.get(key) || { key, label: monthLabel(key), pass: 0, violations: 0, reviewRequired: 0, notApplicable: 0, total: 0 }
    point.total += 1
    if (run.status === 'PASS') point.pass += 1
    if (run.status === 'VIOLATION') point.violations += 1
    if (run.status === 'REVIEW_REQUIRED') point.reviewRequired += 1
    if (run.status === 'NOT_APPLICABLE') point.notApplicable += 1
    trendMap.set(key, point)
  })
  const trend = Array.from(trendMap.values()).sort((a, b) => a.key.localeCompare(b.key))

  const violationMap = new Map<string, DashboardViolation & { inspectionIds: Set<string> }>()
  latestFindings.filter((finding) => finding.aiStatus === 'VIOLATION').forEach((finding) => {
    const key = finding.ruleKey
    const current = violationMap.get(key) || { ruleKey: finding.ruleKey, ruleName: finding.ruleName, severity: finding.severity, count: 0, inspections: 0, inspectionIds: new Set<string>() }
    current.count += 1
    current.severity = maxSeverity(current.severity, finding.severity)
    current.inspectionIds.add(finding.inspectionId.toString())
    current.inspections = current.inspectionIds.size
    violationMap.set(key, current)
  })
  const commonViolations = Array.from(violationMap.values()).map((violation) => ({ ruleKey: violation.ruleKey, ruleName: violation.ruleName, severity: violation.severity, count: violation.count, inspections: violation.inspectionIds.size })).sort((a, b) => b.count - a.count || b.inspections - a.inspections).slice(0, 8)

  const repeatMap = new Map<string, { productId: string; productName: string; ruleKey: string; ruleName: string; inspectionIds: Set<string>; latestAt: string }>()
  allFindings.filter((finding) => finding.aiStatus === 'VIOLATION').forEach((finding) => {
    const inspection = inspectionById.get(finding.inspectionId.toString())
    if (!inspection) return
    const productId = inspection.productId.toString()
    const key = `${productId}:${finding.ruleKey}`
    const current = repeatMap.get(key) || { productId, productName: productRecords.get(productId)?.name || 'Product record unavailable', ruleKey: finding.ruleKey, ruleName: finding.ruleName, inspectionIds: new Set<string>(), latestAt: new Date(finding.createdAt).toISOString() }
    current.inspectionIds.add(finding.inspectionId.toString())
    if (new Date(finding.createdAt) > new Date(current.latestAt)) current.latestAt = new Date(finding.createdAt).toISOString()
    repeatMap.set(key, current)
  })
  const repeatViolations: DashboardRepeatViolation[] = Array.from(repeatMap.values())
    .filter((item) => item.inspectionIds.size > 1)
    .map((item) => ({ productId: item.productId, productName: item.productName, ruleKey: item.ruleKey, ruleName: item.ruleName, count: item.inspectionIds.size, inspectionCount: item.inspectionIds.size, latestAt: item.latestAt }))
    .sort((a, b) => b.count - a.count || new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime())
    .slice(0, 8)

  const recentCutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const recentViolationKeys = new Set<string>()
  latestFindings.filter((finding) => finding.aiStatus === 'VIOLATION' && new Date(finding.createdAt).getTime() >= recentCutoff).forEach((finding) => recentViolationKeys.add(`${finding.inspectionId.toString()}:${finding.ruleKey}`))
  const repeatedViolationEvents = Array.from(repeatMap.values()).reduce((sum, item) => sum + Math.max(0, item.inspectionIds.size - 1), 0)
  const recentViolationCount = recentViolationKeys.size
  const severityPoints = latestFindings.filter((finding) => finding.aiStatus === 'VIOLATION').reduce((sum, finding) => sum + (RISK_SEVERITY_POINTS[finding.severity] || 0), 0)
  const unresolvedCount = latestFindings.filter((finding) => finding.humanDecision === 'PENDING').length
  const riskFactors = [
    { label: 'Repeated violations', points: Math.min(30, repeatedViolationEvents * 10), detail: `${repeatedViolationEvents} repeated violation event${repeatedViolationEvents === 1 ? '' : 's'} across product history.` },
    { label: 'Recent violations', points: Math.min(25, recentViolationCount * 5), detail: `${recentViolationCount} violation finding${recentViolationCount === 1 ? '' : 's'} in the last 30 days.` },
    { label: 'Finding severity', points: Math.min(30, severityPoints), detail: 'Latest violation findings weighted LOW 4, MEDIUM 10, HIGH 18, CRITICAL 25 points, capped at 30.' },
    { label: 'Unresolved findings', points: Math.min(20, unresolvedCount * 5), detail: `${unresolvedCount} latest violation or review finding${unresolvedCount === 1 ? '' : 's'} still marked PENDING.` },
  ]
  const riskScore = Math.min(100, riskFactors.reduce((sum, factor) => sum + factor.points, 0))
  const riskAvailable = applicableStatuses.length > 0
  const risk: DashboardRisk = {
    available: riskAvailable,
    score: riskAvailable ? riskScore : null,
    level: !riskAvailable ? null : riskScore >= 75 ? 'CRITICAL' : riskScore >= 50 ? 'HIGH' : riskScore >= 25 ? 'MODERATE' : 'LOW',
    evaluatedInspections: applicableStatuses.length,
    factors: riskFactors,
  }

  return {
    totalInspections: inspections.length,
    complianceRate: applicableStatuses.length > 0 ? Math.round((compliancePassCount / applicableStatuses.length) * 100) : null,
    compliancePassCount,
    applicableEvaluations: applicableStatuses.length,
    violations,
    reviewRequired,
    recentInspections,
    trend,
    commonViolations,
    repeatViolations,
    risk,
  }
}

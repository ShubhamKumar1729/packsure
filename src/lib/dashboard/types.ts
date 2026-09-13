export type DashboardComplianceStatus = 'PASS' | 'VIOLATION' | 'REVIEW_REQUIRED' | 'NOT_APPLICABLE'

export type DashboardInspection = {
  id: string
  productName: string
  brand: string
  status: string
  finalDecision: string
  complianceStatus: DashboardComplianceStatus | null
  complianceScore: number | null
  imageCount: number
  createdAt: string
}

export type DashboardTrendPoint = {
  key: string
  label: string
  pass: number
  violations: number
  reviewRequired: number
  notApplicable: number
  total: number
}

export type DashboardViolation = {
  ruleKey: string
  ruleName: string
  severity: string
  count: number
  inspections: number
}

export type DashboardRepeatViolation = {
  productId: string
  productName: string
  ruleKey: string
  ruleName: string
  count: number
  inspectionCount: number
  latestAt: string
}

export type DashboardRiskFactor = {
  label: string
  points: number
  detail: string
}

export type DashboardRisk = {
  available: boolean
  score: number | null
  level: 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL' | null
  evaluatedInspections: number
  factors: DashboardRiskFactor[]
}

export type DashboardData = {
  totalInspections: number
  complianceRate: number | null
  compliancePassCount: number
  applicableEvaluations: number
  violations: number
  reviewRequired: number
  recentInspections: DashboardInspection[]
  trend: DashboardTrendPoint[]
  commonViolations: DashboardViolation[]
  repeatViolations: DashboardRepeatViolation[]
  risk: DashboardRisk
}

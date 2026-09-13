import type { InspectionAnalysisResult } from '@/lib/ai/types'
import type { ComplianceRunResult } from '@/lib/compliance/types'
import type { ReviewAuditEntry, ReviewFinding } from '@/lib/review/types'

export type ReportSnapshot = {
  reportVersion: string
  generatedAt: string
  product: {
    id: string
    name: string
    brand?: string
    manufacturer?: string
    category?: string
    packSize?: string
    unit?: string
    batchNumber?: string
    declaredRetailPrice?: number
  }
  inspection: {
    id: string
    status: string
    finalDecision: string
    finalComment?: string
    finalizedBy?: string
    finalizedAt?: string
    createdAt: string
    imageCount: number
  }
  images: {
    id: string
    inspectionId: string
    filename: string
    label: string
    source: string
    mimeType: string
    sizeBytes: number
  }[]
  analysis: InspectionAnalysisResult | null
  compliance: ComplianceRunResult | null
  findings: ReviewFinding[]
  auditLog: ReviewAuditEntry[]
}

export type ReportListItem = {
  id: string
  inspectionId: string
  productName: string
  finalDecision: string
  complianceStatus: string | null
  complianceScore: number | null
  generatedAt: string
  reportVersion: string
}

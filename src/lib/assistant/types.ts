import type { UserRole } from '@/lib/auth-shared'

export type AssistantContext =
  | { type: 'inspection'; id: string }
  | { type: 'finding'; id: string; inspectionId: string }
  | { type: 'product'; id: string }
  | { type: 'report'; id: string }

export type AssistantEvidence = {
  id: string
  inspectionId: string
  imageId?: string
  imageUrl?: string
  label: string
  source: 'stored_package_image' | 'finding_evidence'
  excerpt?: string
  boundingBox?: { x: number; y: number; width: number; height: number }
}

export type AssistantFinding = {
  id: string
  inspectionId: string
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
  comment?: string
  reviewedAt?: string
  evidence: AssistantEvidence[]
}

export type AssistantRule = {
  id: string
  key: string
  name: string
  description: string
  checkArea: string
  jurisdiction: string
  reference: string
  expectedRequirement: string
  severity: string
  version: string
  enabled: boolean
  referenceUrl?: string
}

export type AssistantInspection = {
  id: string
  productId: string
  productName: string
  brand?: string
  manufacturer?: string
  packSize?: string
  unit?: string
  declaredRetailPrice?: number
  status: string
  finalDecision: string
  finalComment?: string
  createdAt: string
  imageCount: number
  compliance: {
    status: string
    score: number | null
    evaluatedAt: string
  } | null
}

export type AssistantProductHistory = {
  product: {
    id: string
    name: string
    brand?: string
    manufacturer?: string
    packSize?: string
    unit?: string
    declaredRetailPrice?: number
  }
  inspections: AssistantInspection[]
  findings: AssistantFinding[]
}

export type AssistantReport = {
  id: string
  inspectionId: string
  reportVersion: string
  generatedAt: string
  productName: string
  finalDecision: string
  complianceStatus?: string
  complianceScore?: number | null
  findingCount: number
}

export type AssistantToolContext = {
  inspection: AssistantInspection | null
  findings: AssistantFinding[]
  productHistory: AssistantProductHistory | null
  evidence: AssistantEvidence[]
  rules: AssistantRule[]
  reports: AssistantReport[]
  context: AssistantContext
}

export type AssistantCitation = {
  type: 'inspection' | 'finding' | 'product_history' | 'evidence' | 'rule' | 'report'
  id: string
  label: string
  href?: string
}

export type AssistantAnswer = {
  provider: string
  providerVersion: string
  assessmentType: 'AI_ASSESSMENT'
  text: string
  citations: AssistantCitation[]
  evidence: AssistantEvidence[]
  boundary: string
}

export type AssistantRequest = {
  question: string
  context: AssistantContext
}

export type AssistantSession = {
  userId: string
  role: UserRole
}

export type AssistantProviderInput = {
  question: string
  context: AssistantContext
  tools: AssistantToolContext
}

export interface AssistantProvider {
  readonly id: string
  readonly version: string
  answer(input: AssistantProviderInput): Promise<AssistantAnswer>
}

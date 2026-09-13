import type { ImageAnalysis, InspectionAnalysisResult, ExtractedField, DetectedDeclaration } from '@/lib/ai/types'
import type { AIAnalysisStatus } from '@/lib/ai/types'

export type StoredAnalysisLike = {
  _id: { toString(): string }
  inspectionId: { toString(): string } | string
  status: AIAnalysisStatus
  provider: string
  providerVersion: string
  analyzedAt?: Date | string
  overallConfidence: number
  images: unknown[]
  fields: unknown[]
  declarations: unknown[]
  error?: string
}

export function serializeInspectionAnalysis(analysis: StoredAnalysisLike): InspectionAnalysisResult {
  return {
    id: analysis._id.toString(),
    inspectionId: typeof analysis.inspectionId === 'string' ? analysis.inspectionId : analysis.inspectionId.toString(),
    status: analysis.status,
    provider: analysis.provider,
    providerVersion: analysis.providerVersion,
    analyzedAt: analysis.analyzedAt ? new Date(analysis.analyzedAt).toISOString() : undefined,
    overallConfidence: analysis.overallConfidence,
    images: analysis.images as ImageAnalysis[],
    fields: analysis.fields as ExtractedField[],
    declarations: analysis.declarations as DetectedDeclaration[],
    error: analysis.error,
  }
}

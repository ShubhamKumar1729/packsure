import type { AIProvider, ImageAnalysis, InspectionAnalysisResult, ProviderImageInput } from '@/lib/ai/types'

export async function analyzeInspectionImages(provider: AIProvider, inputs: ProviderImageInput[], inspectionId: string): Promise<InspectionAnalysisResult> {
  const results = await Promise.all(inputs.map(async (input): Promise<ImageAnalysis> => {
    const result = await provider.analyzeImage(input)
    const sourceImage = {
      inspectionImageId: input.imageId,
      filename: input.filename,
      label: input.label,
      source: input.source,
    }

    return {
      sourceImage,
      ocr: result.ocr,
      fields: result.fields.map((field) => ({ ...field, sourceImage })),
      declarations: result.declarations.map((declaration) => ({ ...declaration, sourceImage })),
      measurements: result.measurements.map((measurement) => ({ ...measurement, sourceImage })),
      confidence: result.confidence,
      providerMetadata: result.providerMetadata,
    }
  }))

  const fields = results.flatMap((result) => result.fields)
  const declarations = results.flatMap((result) => result.declarations)
  const overallConfidence = results.length === 0 ? 0 : results.reduce((sum, result) => sum + result.confidence, 0) / results.length

  return {
    inspectionId,
    status: 'completed',
    provider: provider.id,
    providerVersion: provider.version,
    analyzedAt: new Date().toISOString(),
    overallConfidence,
    images: results,
    fields,
    declarations,
  }
}

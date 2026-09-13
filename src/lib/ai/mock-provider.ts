import type { AIProvider, ProviderImageInput, ProviderImageResult } from '@/lib/ai/types'

/**
 * A safe test provider. It consumes the actual image bytes supplied by an
 * inspection, but deliberately does not invent OCR text or business values.
 * Replace it with a real provider without changing the API or data contract.
 */
export class MockAIProvider implements AIProvider {
  readonly id = 'mock'
  readonly version = '0.1.0'

  async analyzeImage(input: ProviderImageInput): Promise<ProviderImageResult> {
    return {
      ocr: {
        status: 'not_configured',
        text: '',
        confidence: 0,
        blocks: [],
      },
      fields: [],
      declarations: [],
      measurements: [],
      confidence: 0,
      providerMetadata: {
        inputBytes: input.data.byteLength,
        inputMimeType: input.mimeType,
        sourceLabel: input.label,
        sourceType: input.source,
        note: 'MockAIProvider processed the supplied image bytes without inferring business values.',
      },
    }
  }
}

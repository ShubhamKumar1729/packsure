import { MockAIProvider } from '@/lib/ai/mock-provider'
import { NlpPipelineProvider } from '@/lib/ai/nlp-provider'
import type { AIProvider } from '@/lib/ai/types'

/**
 * Provider registry.
 *
 * - `nlp`  — the REAL pipeline (OCR + legal-metrology NER + normalization) served
 *            by the Python NLP service (NLP_SERVICE_URL). This is the production
 *            provider.
 * - `mock` — a safe, clearly-labeled test provider that processes real image
 *            bytes but invents no values. Opt-in for local testing only
 *            (AI_PROVIDER=mock); never the production default.
 */
export function getAIProvider(): AIProvider {
  const configuredProvider = process.env.AI_PROVIDER?.trim().toLowerCase()
  const providerId = configuredProvider || (process.env.NODE_ENV === 'production' ? '' : 'mock')

  if (providerId === 'nlp' || providerId === 'nlp_pipeline') return new NlpPipelineProvider()
  if (providerId === 'mock') return new MockAIProvider()

  throw new Error('AI_PROVIDER is not configured with a supported provider. Use "nlp" (real pipeline) or "mock" (local test seam).')
}

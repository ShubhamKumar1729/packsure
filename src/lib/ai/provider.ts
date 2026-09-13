import { MockAIProvider } from '@/lib/ai/mock-provider'
import type { AIProvider } from '@/lib/ai/types'

export function getAIProvider(): AIProvider {
  const configuredProvider = process.env.AI_PROVIDER?.trim().toLowerCase()
  const providerId = configuredProvider || (process.env.NODE_ENV === 'production' ? '' : 'mock')

  if (providerId === 'mock') return new MockAIProvider()

  throw new Error('AI_PROVIDER is not configured with a supported provider.')
}

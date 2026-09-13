import type { AssistantProvider } from '@/lib/assistant/types'
import { MockAssistantProvider } from '@/lib/assistant/mock-provider'

/**
 * Provider selection stays server-side. Every provider receives tool results,
 * never a database handle or a Mongoose model.
 */
export function getAssistantProvider(): AssistantProvider {
  return new MockAssistantProvider()
}

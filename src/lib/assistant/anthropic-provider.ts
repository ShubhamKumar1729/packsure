import { AssistantModelError, describeModelFailure } from '@/lib/assistant/model-error'
import { ASSISTANT_BOUNDARY, buildMessages, buildReferences, type ChatMessage } from '@/lib/assistant/prompt'
import type { AssistantAnswer, AssistantProvider, AssistantProviderInput } from '@/lib/assistant/types'

const REQUEST_TIMEOUT_MS = 45_000
const MAX_OUTPUT_TOKENS = 900
const ANTHROPIC_VERSION = '2023-06-01'

export type AnthropicConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

type AnthropicResponse = {
  content?: { type?: string; text?: unknown }[]
  error?: { message?: unknown }
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const data = payload as AnthropicResponse
  const blocks = Array.isArray(data.content) ? data.content : []
  return blocks
    .filter((block) => block && (block.type === 'text' || block.type === undefined))
    .map((block) => (typeof block.text === 'string' ? block.text : ''))
    .join('')
    .trim()
}

function errorDetail(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const message = (payload as AnthropicResponse).error?.message
  return typeof message === 'string' ? message : ''
}

/**
 * Anthropic separates the system prompt from the turn list and requires the first turn to be a user
 * turn, so both are normalized here rather than leaking that shape into the shared prompt builder.
 */
export class AnthropicAssistantProvider implements AssistantProvider {
  readonly id = 'anthropic'
  readonly version = '1.0.0'
  readonly model: string
  private readonly config: AnthropicConfig

  constructor(config: AnthropicConfig) {
    this.config = config
    this.model = config.model
  }

  async answer(input: AssistantProviderInput): Promise<AssistantAnswer> {
    const messages = buildMessages(input)
    const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n')
    // Drop any leading assistant turns: the API rejects a conversation that does not start with a user.
    const turns = messages.filter((message): message is ChatMessage & { role: 'user' | 'assistant' } => message.role !== 'system')
    while (turns.length > 0 && turns[0].role !== 'user') turns.shift()
    if (turns.length === 0) throw new AssistantModelError('There was no question to send to Anthropic.')

    const endpoint = `${this.config.baseUrl.replace(/\/+$/, '')}/v1/messages`
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: MAX_OUTPUT_TOKENS,
          temperature: 0.2,
          system,
          messages: turns.map((turn) => ({ role: turn.role, content: turn.content })),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new AssistantModelError(`Anthropic did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds.`)
      }
      throw new AssistantModelError('Anthropic could not be reached. Check the network and ANTHROPIC_API_KEY.')
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      let parsed: unknown = null
      try { parsed = JSON.parse(detail) as unknown } catch { parsed = null }
      throw new AssistantModelError(describeModelFailure('Anthropic', response.status, errorDetail(parsed) || detail, this.model), response.status)
    }

    const payload = (await response.json().catch(() => null)) as unknown
    const text = extractText(payload)
    if (!text) throw new AssistantModelError(`Anthropic returned an empty answer for model "${this.model}".`)

    const { citations, evidence } = buildReferences(input.tools)
    return {
      provider: this.id,
      providerVersion: this.version,
      model: this.model,
      assessmentType: 'AI_ASSESSMENT',
      mode: 'model',
      text,
      citations,
      evidence,
      boundary: ASSISTANT_BOUNDARY,
    }
  }
}

import { AssistantModelError, describeModelFailure } from '@/lib/assistant/model-error'
import { ASSISTANT_BOUNDARY, buildMessages, buildReferences, type ChatMessage } from '@/lib/assistant/prompt'
import type { AssistantAnswer, AssistantProvider, AssistantProviderInput } from '@/lib/assistant/types'

const REQUEST_TIMEOUT_MS = 45_000
const MAX_OUTPUT_TOKENS = 900

export type OpenAICompatibleConfig = {
  /** Identifier reported back to the UI, e.g. 'openai', 'groq', 'ollama'. */
  id: string
  /** Human-readable label used in failure messages. */
  label: string
  baseUrl: string
  apiKey: string
  model: string
  extraHeaders?: Record<string, string>
}

type ChatCompletionResponse = {
  choices?: { message?: { content?: unknown } }[]
  error?: { message?: unknown }
}

function trimBase(url: string) {
  return url.replace(/\/+$/, '')
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const data = payload as ChatCompletionResponse
  const content = data.choices?.[0]?.message?.content
  return typeof content === 'string' ? content.trim() : ''
}

function errorDetail(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const message = (payload as ChatCompletionResponse).error?.message
  return typeof message === 'string' ? message : ''
}

/**
 * Speaks the OpenAI chat-completions shape. That one contract covers OpenAI itself plus Groq,
 * OpenRouter, Together, DeepInfra, LM Studio, llama.cpp servers, and Ollama's OpenAI-compatible
 * endpoint — each only needs a different base URL and key.
 */
export class OpenAICompatibleProvider implements AssistantProvider {
  readonly id: string
  readonly version = '1.0.0'
  readonly model: string
  private readonly config: OpenAICompatibleConfig

  constructor(config: OpenAICompatibleConfig) {
    this.config = config
    this.id = config.id
    this.model = config.model
  }

  async answer(input: AssistantProviderInput): Promise<AssistantAnswer> {
    const text = await this.complete(buildMessages(input))
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

  private async complete(messages: ChatMessage[]): Promise<string> {
    const endpoint = `${trimBase(this.config.baseUrl)}/chat/completions`
    const shared = { model: this.model, messages, temperature: 0.2 }

    let response = await this.post(endpoint, { ...shared, max_tokens: MAX_OUTPUT_TOKENS })

    if (response.status === 400) {
      // Newer OpenAI models reject max_tokens and require max_completion_tokens instead. Retry once
      // with the modern field rather than failing on a naming difference.
      const detail = await response.text().catch(() => '')
      if (/max_tokens|max_completion_tokens/i.test(detail)) {
        response = await this.post(endpoint, { ...shared, max_completion_tokens: MAX_OUTPUT_TOKENS })
      } else {
        throw new AssistantModelError(describeModelFailure(this.config.label, 400, errorDetail(await safeJson(detail)) || detail, this.model), 400)
      }
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new AssistantModelError(describeModelFailure(this.config.label, response.status, errorDetail(await safeJson(detail)) || detail, this.model), response.status)
    }

    const payload = await response.json().catch(() => null)
    const text = extractText(payload)
    if (!text) throw new AssistantModelError(`${this.config.label} returned an empty answer for model "${this.model}".`)
    return text
  }

  private async post(endpoint: string, body: unknown): Promise<Response> {
    try {
      return await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.apiKey}`,
          ...this.config.extraHeaders,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new AssistantModelError(`${this.config.label} did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds.`)
      }
      throw new AssistantModelError(`${this.config.label} could not be reached. Check the network and the configured base URL.`)
    }
  }
}

async function safeJson(text: string): Promise<unknown> {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

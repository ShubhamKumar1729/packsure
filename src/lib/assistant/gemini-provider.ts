import { AssistantModelError, describeModelFailure } from '@/lib/assistant/model-error'
import { ASSISTANT_BOUNDARY, buildMessages, buildReferences } from '@/lib/assistant/prompt'
import type { AssistantAnswer, AssistantProvider, AssistantProviderInput } from '@/lib/assistant/types'

const REQUEST_TIMEOUT_MS = 45_000
const MAX_OUTPUT_TOKENS = 900

export type GeminiConfig = {
  baseUrl: string
  apiKey: string
  model: string
}

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: unknown }[] } }[]
  error?: { message?: unknown }
}

function extractText(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return ''
  const data = payload as GeminiResponse
  const parts = data.candidates?.[0]?.content?.parts
  if (!Array.isArray(parts)) return ''
  return parts.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('').trim()
}

function errorDetail(payload: unknown) {
  if (!payload || typeof payload !== 'object') return ''
  const message = (payload as GeminiResponse).error?.message
  return typeof message === 'string' ? message : ''
}

/** Google Gemini. The key travels in a header rather than the query string so it never lands in a URL log. */
export class GeminiAssistantProvider implements AssistantProvider {
  readonly id = 'gemini'
  readonly version = '1.0.0'
  readonly model: string
  private readonly config: GeminiConfig

  constructor(config: GeminiConfig) {
    this.config = config
    this.model = config.model
  }

  async answer(input: AssistantProviderInput): Promise<AssistantAnswer> {
    const messages = buildMessages(input)
    const system = messages.filter((message) => message.role === 'system').map((message) => message.content).join('\n\n')
    const contents = messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({ role: message.role === 'assistant' ? 'model' : 'user', parts: [{ text: message.content }] }))
    if (contents.length === 0) throw new AssistantModelError('There was no question to send to Gemini.')

    const endpoint = `${this.config.baseUrl.replace(/\/+$/, '')}/models/${encodeURIComponent(this.model)}:generateContent`
    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.config.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          generationConfig: { temperature: 0.2, maxOutputTokens: MAX_OUTPUT_TOKENS },
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (error) {
      if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
        throw new AssistantModelError(`Gemini did not respond within ${REQUEST_TIMEOUT_MS / 1000} seconds.`)
      }
      throw new AssistantModelError('Gemini could not be reached. Check the network and GEMINI_API_KEY.')
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      let parsed: unknown = null
      try { parsed = JSON.parse(detail) as unknown } catch { parsed = null }
      throw new AssistantModelError(describeModelFailure('Gemini', response.status, errorDetail(parsed) || detail, this.model), response.status)
    }

    const payload = (await response.json().catch(() => null)) as unknown
    const text = extractText(payload)
    if (!text) throw new AssistantModelError(`Gemini returned an empty answer for model "${this.model}". The response may have been blocked by a safety filter.`)

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

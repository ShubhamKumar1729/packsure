/**
 * Server-side Groq client. The API key lives only in process.env on the server and is sent only to
 * the Groq endpoint in an Authorization header. It is never imported by client code, never placed
 * in NEXT_PUBLIC_*, never returned in an API response, and never written to logs.
 */

export type GroqToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type GroqMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | null
  tool_calls?: GroqToolCall[]
  tool_call_id?: string
  name?: string
}

export type GroqErrorKind = 'missing_key' | 'auth' | 'rate_limit' | 'timeout' | 'server' | 'bad_request' | 'network' | 'malformed'

export class GroqError extends Error {
  readonly kind: GroqErrorKind
  readonly friendly: string

  constructor(kind: GroqErrorKind, friendly: string, detail?: string) {
    super(detail || friendly)
    this.name = 'GroqError'
    this.kind = kind
    this.friendly = friendly
  }
}

const REQUEST_TIMEOUT_MS = 45_000

function baseUrl() {
  // Optional override for self-hosted Groq-compatible gateways and integration tests.
  return (process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/+$/, '')
}

/** Groq retired llama-3.3-70b-versatile in August 2026; gpt-oss-120b is the recommended successor. */
export const DEFAULT_GROQ_MODEL = 'openai/gpt-oss-120b'
export const DEFAULT_GROQ_RETRIEVAL_MODEL = 'openai/gpt-oss-20b'

export function groqModel() {
  return process.env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL
}

export function groqRetrievalModel() {
  return process.env.GROQ_RETRIEVAL_MODEL?.trim() || DEFAULT_GROQ_RETRIEVAL_MODEL
}

export function groqKey(): string | null {
  const key = process.env.GROQ_API_KEY?.trim()
  return key ? key : null
}

type ChatResponse = {
  choices?: { message?: { role?: string; content?: string | null; tool_calls?: GroqToolCall[] } }[]
  error?: { message?: unknown }
}

function errorSnippet(payload: unknown) {
  const message = (payload as ChatResponse | null)?.error?.message
  return typeof message === 'string' ? message.replace(/\s+/g, ' ').trim().slice(0, 160) : ''
}

export type GroqChatOptions = {
  model?: string
  tools?: unknown[]
  temperature?: number
  maxTokens?: number
  jsonObject?: boolean
}

/**
 * One chat completion against Groq. Throws GroqError with a user-friendly message for every
 * failure class Pia must survive: missing key, bad key, rate limit, timeout, upstream outage,
 * rejected request, network failure, or an unusable response shape.
 */
export async function groqChat(messages: GroqMessage[], options: GroqChatOptions = {}): Promise<GroqMessage> {
  const key = groqKey()
  if (!key) {
    throw new GroqError(
      'missing_key',
      'Pia is not configured yet: the server is missing GROQ_API_KEY. Add it to .env.local and restart the server — the key stays server-side and is never sent to browsers.',
    )
  }

  const body: Record<string, unknown> = {
    model: options.model || groqModel(),
    messages,
    temperature: options.temperature ?? 0.4,
    max_tokens: options.maxTokens ?? 700,
  }
  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools
    body.tool_choice = 'auto'
    body.parallel_tool_calls = false
  }
  if (options.jsonObject) body.response_format = { type: 'json_object' }

  let response: Response
  try {
    response = await fetch(`${baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new GroqError('timeout', 'Groq took too long to answer. Please try again in a moment.', String(error))
    }
    throw new GroqError('network', 'Pia could not reach the Groq API. Check the server network connection and try again.', String(error))
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    let parsed: unknown = null
    try { parsed = JSON.parse(detail) as unknown } catch { parsed = null }
    const snippet = errorSnippet(parsed) || detail.replace(/\s+/g, ' ').trim().slice(0, 160)
    if (response.status === 401 || response.status === 403) {
      throw new GroqError('auth', 'Groq rejected the configured API key. Check GROQ_API_KEY in .env.local.', snippet)
    }
    if (response.status === 429) {
      throw new GroqError('rate_limit', 'Groq rate limit reached. Please wait a few seconds and ask again.', snippet)
    }
    if (response.status >= 500) {
      throw new GroqError('server', 'Groq is temporarily unavailable. Please try again shortly.', snippet)
    }
    throw new GroqError('bad_request', `Groq rejected the request (${response.status}).${snippet ? ` ${snippet}` : ''}`, snippet)
  }

  const payload = (await response.json().catch(() => null)) as ChatResponse | null
  const message = payload?.choices?.[0]?.message
  if (!message || (typeof message.content !== 'string' && !message.tool_calls)) {
    throw new GroqError('malformed', 'Groq returned an unusable response. Please try again.')
  }
  return {
    role: 'assistant',
    content: typeof message.content === 'string' ? message.content : null,
    tool_calls: message.tool_calls,
  }
}

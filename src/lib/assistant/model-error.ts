/**
 * A failure inside a language-model call. The assistant pipeline catches this and degrades to the
 * built-in offline responder, so a bad key, a rate limit, or an unreachable model never breaks the
 * workspace — but the reason is always reported back to the user.
 */
export class AssistantModelError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AssistantModelError'
    this.status = status
  }
}

/** Turns an HTTP status plus a snippet of the provider's error body into something a user can act on. */
export function describeModelFailure(label: string, status: number, detail: string, model: string) {
  const snippet = detail.replace(/\s+/g, ' ').trim().slice(0, 180)
  if (status === 401 || status === 403) return `${label} rejected the API key (${status}). Check the key in .env.local.`
  if (status === 404) return `${label} does not know the model "${model}" (${status}). Set ASSISTANT_MODEL to a model your account can use.`
  if (status === 429) return `${label} rate limit reached (${status}). Try again shortly or set ASSISTANT_MODEL to a cheaper model.`
  if (status === 400 || status === 422) return `${label} rejected the request (${status}).${snippet ? ` ${snippet}` : ''}`
  if (status >= 500) return `${label} is unavailable right now (${status}).`
  return `${label} returned an unexpected response (${status}).${snippet ? ` ${snippet}` : ''}`
}

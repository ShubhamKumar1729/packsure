import { NextResponse } from 'next/server'
import { parseAssistantContext } from '@/lib/assistant/context'
import { GroqError } from '@/lib/assistant/groq'
import { friendlyGroqError, piaTurn, sanitizeHistory } from '@/lib/assistant/pia'
import { getCurrentSession } from '@/lib/server-auth'

export const runtime = 'nodejs'

const MAX_QUESTION_LENGTH = 1500

const STATUS_BY_KIND: Record<string, number> = {
  missing_key: 503,
  auth: 503,
  rate_limit: 429,
  timeout: 504,
  server: 503,
  network: 503,
  bad_request: 502,
  malformed: 502,
}

/**
 * Pia's only generation endpoint. The Groq key is read from process.env here (server-side) and is
 * never included in the response, logs, or any client bundle.
 */
export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  let body: { question?: unknown; history?: unknown; context?: unknown }
  try {
    body = await request.json() as { question?: unknown; history?: unknown; context?: unknown }
  } catch {
    return NextResponse.json({ error: 'Pia could not read that request.' }, { status: 400 })
  }

  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION_LENGTH) : ''
  if (!question) return NextResponse.json({ error: 'Ask Pia anything about PackSure, or just say hello.' }, { status: 400 })

  const history = sanitizeHistory(body.history)
  const context = parseAssistantContext(body.context)
  const toolContext = { baseUrl: new URL(request.url).origin, cookie: request.headers.get('cookie') }

  try {
    const reply = await piaTurn({ question, history, context, toolContext })
    return NextResponse.json({ reply })
  } catch (error) {
    // Friendly, actionable messaging for every failure class; never the key, never a stack trace.
    const kind = error instanceof GroqError ? error.kind : 'unexpected'
    console.error('Pia turn failed', { kind, message: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: friendlyGroqError(error) }, { status: STATUS_BY_KIND[kind] || 500 })
  }
}

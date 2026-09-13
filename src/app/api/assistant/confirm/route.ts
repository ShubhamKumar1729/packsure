import { NextResponse } from 'next/server'
import { verifyOperation } from '@/lib/assistant/confirm-token'
import { parseAssistantContext } from '@/lib/assistant/context'
import { GroqError } from '@/lib/assistant/groq'
import { friendlyGroqError, piaExplainOutcome, sanitizeHistory } from '@/lib/assistant/pia'
import { OPERATION_LABELS } from '@/lib/assistant/tools-server'
import { getCurrentSession } from '@/lib/server-auth'

export const runtime = 'nodejs'

/**
 * Executes a user-confirmed operation through the existing PackSure endpoint and asks Groq to
 * explain the outcome. The signed token binds operation + inspection id; label and endpoint are
 * re-derived server-side and never trusted from the client.
 */
export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  let body: { token?: unknown; confirmed?: unknown; question?: unknown; history?: unknown; context?: unknown }
  try {
    body = await request.json() as typeof body
  } catch {
    return NextResponse.json({ error: 'Pia could not read that confirmation.' }, { status: 400 })
  }

  const token = typeof body.token === 'string' ? body.token : ''
  const confirmed = body.confirmed === true
  const payload = await verifyOperation(token)
  if (!payload) return NextResponse.json({ error: 'That confirmation expired or is invalid. Ask Pia again and confirm within 10 minutes.' }, { status: 400 })

  const question = typeof body.question === 'string' && body.question.trim() ? body.question.trim().slice(0, 1500) : `Run ${OPERATION_LABELS[payload.operation]} on inspection ${payload.inspectionId}.`
  const history = sanitizeHistory(body.history)
  const context = parseAssistantContext(body.context)

  const endpoint = payload.operation === 'generate_report'
    ? '/api/reports'
    : `/api/inspections/${payload.inspectionId}/${payload.operation === 'analyze' ? 'analyze' : payload.operation === 'run_compliance' ? 'compliance' : 'listing-comparison'}`

  const pending = { operation: payload.operation, inspectionId: payload.inspectionId, label: OPERATION_LABELS[payload.operation], endpoint, token }
  const toolContext = { baseUrl: new URL(request.url).origin, cookie: request.headers.get('cookie') }

  try {
    const reply = await piaExplainOutcome({ question, history, context, toolContext, pending, confirmed })
    return NextResponse.json({ reply })
  } catch (error) {
    const kind = error instanceof GroqError ? error.kind : 'unexpected'
    console.error('Pia confirmation failed', { kind, message: error instanceof Error ? error.message : String(error) })
    return NextResponse.json({ error: friendlyGroqError(error) }, { status: kind === 'rate_limit' ? 429 : 503 })
  }
}

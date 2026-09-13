import { NextResponse } from 'next/server'
import { collectAssistantContext } from '@/lib/assistant/tools'
import { getAssistantProvider } from '@/lib/assistant/provider'
import { asAssistantHistory } from '@/lib/assistant/prompt'
import type { AssistantContext } from '@/lib/assistant/types'
import { getCurrentSession } from '@/lib/server-auth'

export const runtime = 'nodejs'

const MAX_QUESTION_LENGTH = 1200

function parseContext(value: unknown): AssistantContext | null | undefined {
  // Absent context means a general conversation about the platform rather than an error.
  if (value === undefined || value === null) return { type: 'workspace' }
  if (typeof value !== 'object') return undefined
  const context = value as Record<string, unknown>
  if (context.type === 'workspace') return { type: 'workspace' }
  if (context.type === 'inspection' && typeof context.id === 'string') return { type: 'inspection', id: context.id }
  if (context.type === 'product' && typeof context.id === 'string') return { type: 'product', id: context.id }
  if (context.type === 'report' && typeof context.id === 'string') return { type: 'report', id: context.id }
  if (context.type === 'finding' && typeof context.id === 'string' && typeof context.inspectionId === 'string') return { type: 'finding', id: context.id, inspectionId: context.inspectionId }
  return undefined
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  let body: { question?: unknown; context?: unknown; history?: unknown }
  try {
    body = await request.json() as { question?: unknown; context?: unknown; history?: unknown }
  } catch {
    return NextResponse.json({ error: 'The assistant request could not be read.' }, { status: 400 })
  }

  const question = typeof body.question === 'string' ? body.question.trim().slice(0, MAX_QUESTION_LENGTH) : ''
  if (!question) return NextResponse.json({ error: 'Ask a question about PackSure or the current compliance record.' }, { status: 400 })

  const context = parseContext(body.context)
  if (!context) return NextResponse.json({ error: 'A valid inspection, finding, product, report, or workspace context is required.' }, { status: 400 })

  // Prior turns are supplied by the client and re-validated here. They are conversation text only;
  // record data is always re-fetched server-side from the authorized tools on every request.
  const history = asAssistantHistory(body.history)

  try {
    const tools = await collectAssistantContext({ userId: session.userId, role: session.role }, context)
    const provider = getAssistantProvider()
    const answer = await provider.answer({ question, context, tools, history })
    return NextResponse.json({ answer })
  } catch (error) {
    console.error('Compliance assistant error', error)
    const message = error instanceof Error ? error.message : ''
    const isAuthorizationFailure = /not available|invalid|required|not found/i.test(message)
    return NextResponse.json(
      { error: isAuthorizationFailure ? message : 'The assistant could not answer. No response was generated.' },
      { status: isAuthorizationFailure ? 404 : 503 },
    )
  }
}

import { NextResponse } from 'next/server'
import { collectAssistantContext } from '@/lib/assistant/tools'
import { getAssistantProvider } from '@/lib/assistant/provider'
import type { AssistantContext } from '@/lib/assistant/types'
import { getCurrentSession } from '@/lib/server-auth'

export const runtime = 'nodejs'

function parseContext(value: unknown): AssistantContext | null {
  if (!value || typeof value !== 'object') return null
  const context = value as Record<string, unknown>
  if (context.type === 'inspection' && typeof context.id === 'string') return { type: 'inspection', id: context.id }
  if (context.type === 'product' && typeof context.id === 'string') return { type: 'product', id: context.id }
  if (context.type === 'report' && typeof context.id === 'string') return { type: 'report', id: context.id }
  if (context.type === 'finding' && typeof context.id === 'string' && typeof context.inspectionId === 'string') return { type: 'finding', id: context.id, inspectionId: context.inspectionId }
  return null
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  let body: { question?: unknown; context?: unknown }
  try {
    body = await request.json() as { question?: unknown; context?: unknown }
  } catch {
    return NextResponse.json({ error: 'The assistant request could not be read.' }, { status: 400 })
  }

  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 1200) : ''
  const context = parseContext(body.context)
  if (!question) return NextResponse.json({ error: 'Ask a question about the current compliance record.' }, { status: 400 })
  if (!context) return NextResponse.json({ error: 'A valid inspection, finding, product, or report context is required.' }, { status: 400 })

  try {
    const tools = await collectAssistantContext({ userId: session.userId, role: session.role }, context)
    const provider = getAssistantProvider()
    const answer = await provider.answer({ question, context, tools })
    return NextResponse.json({ answer })
  } catch (error) {
    console.error('Compliance assistant error', error)
    const message = error instanceof Error && /not available|invalid|required/i.test(error.message) ? error.message : 'The Compliance AI context could not be loaded. No answer was generated.'
    return NextResponse.json({ error: message }, { status: /not available|invalid|required/i.test(message) ? 404 : 503 })
  }
}

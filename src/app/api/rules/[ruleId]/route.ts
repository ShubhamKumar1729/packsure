import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { Rule } from '@/models/Rule'
import { serializeRule } from '@/lib/compliance/serialize'

export const runtime = 'nodejs'

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)
  if (session.role !== 'admin') return errorResponse('Only administrators can change rules.', 403)

  const { ruleId } = await params
  if (!Types.ObjectId.isValid(ruleId)) return errorResponse('Rule ID is invalid.')

  try {
    const body = await request.json() as { enabled?: boolean }
    if (typeof body.enabled !== 'boolean') return errorResponse('Provide an enabled boolean.')
    await connectToDatabase()
    const rule = await Rule.findOneAndUpdate({ _id: ruleId }, { enabled: body.enabled, updatedBy: session.userId }, { new: true })
    if (!rule) return errorResponse('Rule not found.', 404)
    return NextResponse.json({ rule: serializeRule(rule) })
  } catch (error) {
    console.error('Rule update error', error)
    return errorResponse('The rule could not be updated.', 400)
  }
}

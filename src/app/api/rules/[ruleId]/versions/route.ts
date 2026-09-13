import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { isRuleCheckArea, isRuleKind, serializeRule } from '@/lib/compliance/serialize'
import { Rule } from '@/models/Rule'

export const runtime = 'nodejs'

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request, { params }: { params: Promise<{ ruleId: string }> }) {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)
  if (session.role !== 'admin') return errorResponse('Only administrators can create rule versions.', 403)

  const { ruleId } = await params
  if (!Types.ObjectId.isValid(ruleId)) return errorResponse('Rule ID is invalid.')

  try {
    await connectToDatabase()
    const current = await Rule.findById(ruleId)
    if (!current) return errorResponse('Rule not found.', 404)

    const body = await request.json() as Record<string, unknown>
    const version = clean(body.version, 40)
    const reference = clean(body.reference, 500)
    const definitionInput = body.definition && typeof body.definition === 'object' ? body.definition as Record<string, unknown> : current.definition
    const definitionKind = definitionInput.kind
    const definitionArea = definitionInput.checkArea
    if (!version || !reference || !isRuleKind(definitionKind) || !isRuleCheckArea(definitionArea) || definitionArea !== current.checkArea) return errorResponse('Provide a version, verified reference, and valid definition for the same check area.')

    const nextRule = await Rule.create({
      key: current.key,
      name: clean(body.name, 200) || current.name,
      description: clean(body.description, 1000) || current.description,
      checkArea: current.checkArea,
      jurisdiction: clean(body.jurisdiction, 80) || current.jurisdiction,
      reference,
      expectedRequirement: clean(body.expectedRequirement, 1000) || current.expectedRequirement,
      severity: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(body.severity)) ? body.severity : current.severity,
      referenceUrl: clean(body.referenceUrl, 500) || current.referenceUrl,
      version,
      enabled: false,
      definition: definitionInput,
      supersedesRuleId: current._id,
      createdBy: session.userId,
      updatedBy: session.userId,
    })

    return NextResponse.json({ rule: serializeRule(nextRule) }, { status: 201 })
  } catch (error) {
    console.error('Rule version error', error)
    return errorResponse('The rule version could not be created. The key and version must be unique.', 400)
  }
}

import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { isRuleCheckArea, isRuleKind, serializeRule } from '@/lib/compliance/serialize'
import { RULE_SEVERITIES, type RuleSeverity } from '@/lib/compliance/types'
import { Rule } from '@/models/Rule'

export const runtime = 'nodejs'

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function clean(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

function normalizeDefinition(value: unknown) {
  if (!value || typeof value !== 'object') return null
  const definition = value as Record<string, unknown>
  const kind = definition.kind
  const checkArea = definition.checkArea
  if (!isRuleKind(kind) || !isRuleCheckArea(checkArea)) return null

  return {
    kind,
    checkArea,
    fieldKey: clean(definition.fieldKey, 100) || undefined,
    declarationType: clean(definition.declarationType, 120) || undefined,
    measurementType: clean(definition.measurementType, 120) || undefined,
    unit: clean(definition.unit, 40) || undefined,
    min: typeof definition.min === 'number' && Number.isFinite(definition.min) ? definition.min : undefined,
    max: typeof definition.max === 'number' && Number.isFinite(definition.max) ? definition.max : undefined,
    pattern: clean(definition.pattern, 500) || undefined,
    missingOutcome: definition.missingOutcome === 'VIOLATION' || definition.missingOutcome === 'REVIEW_REQUIRED' ? definition.missingOutcome : undefined,
    invalidOutcome: definition.invalidOutcome === 'VIOLATION' || definition.invalidOutcome === 'REVIEW_REQUIRED' ? definition.invalidOutcome : undefined,
    minConfidence: typeof definition.minConfidence === 'number' && definition.minConfidence >= 0 && definition.minConfidence <= 1 ? definition.minConfidence : undefined,
    notApplicableWhenMissing: typeof definition.notApplicableWhenMissing === 'boolean' ? definition.notApplicableWhenMissing : undefined,
    applicability: definition.applicability && typeof definition.applicability === 'object' ? {
      fieldKey: clean((definition.applicability as Record<string, unknown>).fieldKey, 100) || undefined,
      equals: clean((definition.applicability as Record<string, unknown>).equals, 200) || undefined,
    } : undefined,
  }
}

function normalizeRuleBody(body: Record<string, unknown>) {
  const key = clean(body.key, 120).toLowerCase().replace(/[^a-z0-9_\-]/g, '_')
  const name = clean(body.name, 200)
  const description = clean(body.description, 1000)
  const checkArea = body.checkArea
  const jurisdiction = clean(body.jurisdiction, 80)
  const reference = clean(body.reference, 500)
  const expectedRequirement = clean(body.expectedRequirement, 1000)
  const severity = body.severity
  const version = clean(body.version, 40)
  const definition = normalizeDefinition(body.definition)

  if (!key || !name || !description || !isRuleCheckArea(checkArea) || !jurisdiction || !reference || !expectedRequirement || !RULE_SEVERITIES.includes(severity as RuleSeverity) || !version || !definition) return null
  if (definition.checkArea !== checkArea) return null

  return {
    key,
    name,
    description,
    checkArea,
    jurisdiction,
    reference,
    expectedRequirement,
    severity: severity as RuleSeverity,
    referenceUrl: clean(body.referenceUrl, 500) || undefined,
    version,
    enabled: body.enabled === true,
    definition,
  }
}

export async function GET() {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)
  if (!['admin', 'reviewer'].includes(session.role)) return errorResponse('Your role cannot view rules.', 403)

  try {
    await connectToDatabase()
    const rules = await Rule.find({}).sort({ checkArea: 1, key: 1, createdAt: -1 }).lean()
    return NextResponse.json({ rules: rules.map(serializeRule) })
  } catch (error) {
    console.error('Rules list error', error)
    return errorResponse('Rules could not be loaded.', 503)
  }
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)
  if (session.role !== 'admin') return errorResponse('Only administrators can create rules.', 403)

  try {
    const body = await request.json() as Record<string, unknown>
    const normalized = normalizeRuleBody(body)
    if (!normalized) return errorResponse('Provide a complete rule definition, verified reference, and matching check area.')

    await connectToDatabase()
    const rule = await Rule.create({ ...normalized, createdBy: session.userId, updatedBy: session.userId })
    return NextResponse.json({ rule: serializeRule(rule) }, { status: 201 })
  } catch (error) {
    console.error('Rule create error', error)
    return errorResponse('The rule could not be created. The key and version must be unique.', 400)
  }
}

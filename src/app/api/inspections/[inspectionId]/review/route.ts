import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { serializeInspectionAnalysis } from '@/lib/ai/serialize'
import { serializeComplianceRun } from '@/lib/compliance/serialize-run'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { serializeAuditEntry, serializeFinding } from '@/lib/review/serialize'
import { Inspection } from '@/models/Inspection'
import { InspectionAnalysis } from '@/models/InspectionAnalysis'
import { InspectionCompliance } from '@/models/InspectionCompliance'
import { InspectionFinding } from '@/models/InspectionFinding'
import { ReviewAuditLog } from '@/models/ReviewAuditLog'

export const runtime = 'nodejs'

const REVIEW_ROLES = ['admin', 'reviewer']
const REVIEW_ACTIONS = ['ACCEPT_FINDING', 'REJECT_FINDING', 'CORRECT_VALUE', 'ADD_COMMENT'] as const

type ReviewAction = (typeof REVIEW_ACTIONS)[number]

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

function canAccessInspection(session: { userId: string; role: string }, createdBy: { toString(): string }) {
  return createdBy.toString() === session.userId || ['admin', 'reviewer'].includes(session.role)
}

async function loadInspection(inspectionId: string, session: { userId: string; role: string }) {
  if (!Types.ObjectId.isValid(inspectionId)) return null
  const inspection = await Inspection.findById(inspectionId)
  if (!inspection || !canAccessInspection(session, inspection.createdBy)) return null
  return inspection
}

export async function GET(_request: Request, { params }: { params: Promise<{ inspectionId: string }> }) {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)
  const { inspectionId } = await params

  try {
    await connectToDatabase()
    const inspection = await loadInspection(inspectionId, session)
    if (!inspection) return errorResponse('Inspection not found.', 404)

    const compliance = await InspectionCompliance.findOne({ inspectionId: inspection._id }).sort({ createdAt: -1 })
    const findings = compliance ? await InspectionFinding.find({ inspectionId: inspection._id, complianceRunId: compliance._id }).sort({ severity: -1, createdAt: 1 }) : []
    const auditLog = await ReviewAuditLog.find({ inspectionId: inspection._id }).sort({ createdAt: -1 }).limit(200).populate('actorUserId', 'email displayName')
    const analysis = compliance ? await InspectionAnalysis.findById(compliance.analysisId) : null

    return NextResponse.json({
      inspection: {
        id: inspection._id.toString(),
        status: inspection.status,
        finalDecision: inspection.finalDecision || 'PENDING',
        finalComment: inspection.finalComment,
        finalizedBy: inspection.finalizedBy?.toString(),
        finalizedAt: inspection.finalizedAt?.toISOString(),
      },
      analysis: analysis ? serializeInspectionAnalysis(analysis) : null,
      compliance: compliance ? serializeComplianceRun(compliance) : null,
      findings: findings.map(serializeFinding),
      auditLog: auditLog.map(serializeAuditEntry),
    })
  } catch (error) {
    console.error('Review snapshot error', error)
    return errorResponse('The review workspace could not be loaded.', 503)
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ inspectionId: string }> }) {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)
  if (!REVIEW_ROLES.includes(session.role)) return errorResponse('Only authorized reviewers can change findings.', 403)
  const { inspectionId } = await params

  try {
    await connectToDatabase()
    const inspection = await loadInspection(inspectionId, session)
    if (!inspection) return errorResponse('Inspection not found.', 404)

    const body = await request.json() as { findingId?: string; action?: string; correctedValue?: string; comment?: string }
    const action = body.action as ReviewAction
    if (!body.findingId || !Types.ObjectId.isValid(body.findingId) || !REVIEW_ACTIONS.includes(action)) return errorResponse('Provide a valid finding and review action.')

    const finding = await InspectionFinding.findOne({ _id: body.findingId, inspectionId: inspection._id })
    if (!finding) return errorResponse('Finding not found.', 404)

    const oldDecision = finding.humanDecision
    const oldValue = finding.correctedValue ?? finding.detectedValue
    const update: Record<string, unknown> = { reviewedBy: session.userId, reviewedAt: new Date() }
    let newDecision = oldDecision

    if (action === 'ACCEPT_FINDING') {
      newDecision = 'ACCEPTED'
      update.humanDecision = newDecision
    } else if (action === 'REJECT_FINDING') {
      newDecision = 'REJECTED'
      update.humanDecision = newDecision
    } else if (action === 'CORRECT_VALUE') {
      if (typeof body.correctedValue !== 'string') return errorResponse('Provide a corrected value.')
      update.correctedValue = body.correctedValue.trim().slice(0, 1000)
    } else if (action === 'ADD_COMMENT') {
      if (typeof body.comment !== 'string' || !body.comment.trim()) return errorResponse('Provide a comment.')
      update.comment = body.comment.trim().slice(0, 4000)
    }

    const updatedFinding = await InspectionFinding.findOneAndUpdate({ _id: finding._id }, update, { new: true })
    if (!updatedFinding) return errorResponse('The finding could not be updated.', 503)

    await ReviewAuditLog.create({
      inspectionId: inspection._id,
      findingId: finding._id,
      actorUserId: session.userId,
      action,
      oldDecision,
      newDecision,
      oldValue,
      newValue: action === 'CORRECT_VALUE' ? String(update.correctedValue || '') : oldValue,
      comment: action === 'ADD_COMMENT' ? String(update.comment || '') : undefined,
    })

    if (inspection.finalDecision && inspection.finalDecision !== 'PENDING') {
      const oldFinalDecision = inspection.finalDecision
      await Inspection.updateOne({ _id: inspection._id }, { finalDecision: 'PENDING', status: 'in_review', $unset: { finalizedBy: 1, finalizedAt: 1, finalComment: 1 } })
      await ReviewAuditLog.create({ inspectionId: inspection._id, actorUserId: session.userId, action: 'FINAL_DECISION', oldDecision: oldFinalDecision, newDecision: 'PENDING', comment: 'Final decision reopened because a finding changed.' })
    }

    return NextResponse.json({ finding: serializeFinding(updatedFinding) })
  } catch (error) {
    console.error('Review finding update error', error)
    return errorResponse('The finding could not be updated.', 503)
  }
}

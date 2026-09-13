import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { serializeAuditEntry } from '@/lib/review/serialize'
import { Inspection } from '@/models/Inspection'
import { InspectionCompliance } from '@/models/InspectionCompliance'
import { InspectionFinding } from '@/models/InspectionFinding'
import { ReviewAuditLog } from '@/models/ReviewAuditLog'

export const runtime = 'nodejs'

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(request: Request, { params }: { params: Promise<{ inspectionId: string }> }) {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)
  if (!['admin', 'reviewer'].includes(session.role)) return errorResponse('Only authorized reviewers can set a final decision.', 403)

  const { inspectionId } = await params
  if (!Types.ObjectId.isValid(inspectionId)) return errorResponse('Inspection ID is invalid.')

  try {
    await connectToDatabase()
    const inspection = await Inspection.findOne({ _id: inspectionId, createdBy: session.userId })
    if (!inspection && !['admin', 'reviewer'].includes(session.role)) return errorResponse('Inspection not found.', 404)
    const accessibleInspection = inspection || await Inspection.findById(inspectionId)
    if (!accessibleInspection) return errorResponse('Inspection not found.', 404)

    const compliance = await InspectionCompliance.findOne({ inspectionId: accessibleInspection._id }).sort({ createdAt: -1 })
    if (!compliance) return errorResponse('Run compliance checks before setting a final decision.')

    const pendingFindings = await InspectionFinding.countDocuments({ inspectionId: accessibleInspection._id, complianceRunId: compliance._id, humanDecision: 'PENDING' })
    if (pendingFindings > 0) return errorResponse(`Resolve ${pendingFindings} finding${pendingFindings === 1 ? '' : 's'} before setting a final decision.`)

    const body = await request.json() as { decision?: string; comment?: string }
    if (body.decision !== 'COMPLIANT' && body.decision !== 'VIOLATION') return errorResponse('Final decision must be COMPLIANT or VIOLATION.')
    const comment = typeof body.comment === 'string' ? body.comment.trim().slice(0, 4000) : undefined
    const oldDecision = accessibleInspection.finalDecision || 'PENDING'

    const updatedInspection = await Inspection.findByIdAndUpdate(accessibleInspection._id, {
      finalDecision: body.decision,
      finalComment: comment,
      finalizedBy: session.userId,
      finalizedAt: new Date(),
      status: 'closed',
    }, { new: true })
    if (!updatedInspection) return errorResponse('The final decision could not be stored.', 503)

    const audit = await ReviewAuditLog.create({
      inspectionId: accessibleInspection._id,
      actorUserId: session.userId,
      action: 'FINAL_DECISION',
      oldDecision,
      newDecision: body.decision,
      comment,
    })

    return NextResponse.json({
      inspection: {
        id: updatedInspection._id.toString(),
        status: updatedInspection.status,
        finalDecision: updatedInspection.finalDecision,
        finalComment: updatedInspection.finalComment,
        finalizedBy: updatedInspection.finalizedBy?.toString(),
        finalizedAt: updatedInspection.finalizedAt?.toISOString(),
      },
      audit: serializeAuditEntry(audit),
    })
  } catch (error) {
    console.error('Final decision error', error)
    return errorResponse('The final decision could not be stored.', 503)
  }
}

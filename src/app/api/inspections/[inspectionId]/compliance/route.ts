import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { serializeInspectionAnalysis } from '@/lib/ai/serialize'
import { evaluateRules } from '@/lib/compliance/engine'
import { serializeComplianceRun } from '@/lib/compliance/serialize-run'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { Inspection } from '@/models/Inspection'
import { InspectionAnalysis } from '@/models/InspectionAnalysis'
import { InspectionCompliance } from '@/models/InspectionCompliance'
import { InspectionFinding } from '@/models/InspectionFinding'
import { ReviewAuditLog } from '@/models/ReviewAuditLog'
import { Rule } from '@/models/Rule'

export const runtime = 'nodejs'

const COMPLIANCE_ROLES = ['admin', 'inspector', 'reviewer']

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(_request: Request, { params }: { params: Promise<{ inspectionId: string }> }) {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)
  if (!COMPLIANCE_ROLES.includes(session.role)) return errorResponse('Your role cannot run compliance checks.', 403)

  const { inspectionId } = await params
  if (!Types.ObjectId.isValid(inspectionId)) return errorResponse('Inspection ID is invalid.')

  try {
    await connectToDatabase()
    const inspection = await Inspection.findById(inspectionId)
    if (!inspection || (inspection.createdBy.toString() !== session.userId && !['admin', 'reviewer'].includes(session.role))) return errorResponse('Inspection not found.', 404)

    const analysis = await InspectionAnalysis.findOne({ inspectionId, status: 'completed' }).sort({ createdAt: -1 })
    if (!analysis) return errorResponse('Run a completed AI analysis before evaluating rules.', 400)

    const rules = await Rule.find({ enabled: true }).sort({ key: 1, createdAt: -1 }).lean()
    const uniqueRules = new Map<string, (typeof rules)[number]>()
    rules.forEach((rule) => {
      if (!uniqueRules.has(rule.key)) uniqueRules.set(rule.key, rule)
    })

    const analysisResult = serializeInspectionAnalysis(analysis)
    const evaluated = evaluateRules(
      Array.from(uniqueRules.values()).map((rule) => ({
        id: rule._id.toString(),
        key: rule.key,
        name: rule.name,
        version: rule.version,
        reference: rule.reference,
        severity: rule.severity,
        expectedRequirement: rule.expectedRequirement,
        remediation: rule.remediation,
        definition: rule.definition,
      })),
      analysisResult,
    )

    const evaluatedAt = new Date()
    const complianceRun = await InspectionCompliance.create({
      inspectionId: inspection._id,
      analysisId: analysis._id,
      createdBy: session.userId,
      status: evaluated.status,
      score: evaluated.score,
      results: evaluated.results,
      evaluatedAt,
    })

    try {
      const findingResults = evaluated.results.filter((result) => result.status === 'VIOLATION' || result.status === 'REVIEW_REQUIRED')
      if (findingResults.length > 0) {
        await InspectionFinding.insertMany(findingResults.map((result) => ({
          inspectionId: inspection._id,
          complianceRunId: complianceRun._id,
          createdBy: session.userId,
          ruleId: result.ruleId,
          ruleKey: result.ruleKey,
          ruleName: result.ruleName,
          ruleVersion: result.ruleVersion,
          ruleReference: result.reference,
          severity: result.severity,
          aiStatus: result.status,
          humanDecision: 'PENDING',
          detectedValue: result.detectedValue,
          expectedRequirement: result.expectedRequirement,
          confidence: result.confidence,
          evidence: result.evidence,
        })))
      }
    } catch (findingError) {
      await InspectionCompliance.deleteOne({ _id: complianceRun._id })
      throw findingError
    }

    if (inspection.finalDecision && inspection.finalDecision !== 'PENDING') {
      const oldFinalDecision = inspection.finalDecision
      await Inspection.updateOne({ _id: inspection._id }, { finalDecision: 'PENDING', status: 'in_review', $unset: { finalizedBy: 1, finalizedAt: 1, finalComment: 1 } })
      await ReviewAuditLog.create({ inspectionId: inspection._id, actorUserId: session.userId, action: 'FINAL_DECISION', oldDecision: oldFinalDecision, newDecision: 'PENDING', comment: 'Final decision reopened because compliance was re-evaluated.' })
    }

    return NextResponse.json({ compliance: serializeComplianceRun(complianceRun) }, { status: 201 })
  } catch (error) {
    console.error('Compliance evaluation error', error)
    return errorResponse('The compliance engine is unavailable.', 503)
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ inspectionId: string }> }) {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)

  const { inspectionId } = await params
  if (!Types.ObjectId.isValid(inspectionId)) return errorResponse('Inspection ID is invalid.')

  try {
    await connectToDatabase()
    const inspection = await Inspection.findById(inspectionId).select('createdBy')
    if (!inspection || (inspection.createdBy.toString() !== session.userId && !['admin', 'reviewer'].includes(session.role))) return errorResponse('Inspection not found.', 404)
    const run = await InspectionCompliance.findOne({ inspectionId }).sort({ createdAt: -1 })
    if (!run) return errorResponse('No compliance evaluation has been run for this inspection.', 404)
    return NextResponse.json({ compliance: serializeComplianceRun(run) })
  } catch (error) {
    console.error('Compliance result read error', error)
    return errorResponse('Compliance results could not be loaded.', 503)
  }
}

import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { analyzeInspectionImages } from '@/lib/ai/inspection-analysis'
import { getAIProvider } from '@/lib/ai/provider'
import { serializeInspectionAnalysis } from '@/lib/ai/serialize'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { ReviewAuditLog } from '@/models/ReviewAuditLog'
import { Inspection } from '@/models/Inspection'
import { InspectionAnalysis } from '@/models/InspectionAnalysis'
import { InspectionImage } from '@/models/InspectionImage'

export const runtime = 'nodejs'

const ANALYSIS_ROLES = ['admin', 'inspector', 'reviewer']

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function POST(_request: Request, { params }: { params: Promise<{ inspectionId: string }> }) {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)
  if (!ANALYSIS_ROLES.includes(session.role)) return errorResponse('Your role cannot run analysis.', 403)

  const { inspectionId } = await params
  if (!Types.ObjectId.isValid(inspectionId)) return errorResponse('Inspection ID is invalid.', 400)

  try {
    await connectToDatabase()
    const inspection = await Inspection.findById(inspectionId)
    if (!inspection || (inspection.createdBy.toString() !== session.userId && !['admin', 'reviewer'].includes(session.role))) return errorResponse('Inspection not found.', 404)

    const images = await InspectionImage.find({ inspectionId })
      .select('+data')
      .sort({ sortOrder: 1 })

    if (images.length === 0) return errorResponse('This inspection has no images to analyze.', 400)

    let provider
    try {
      provider = getAIProvider()
    } catch (providerError) {
      console.error('AI provider configuration error', providerError)
      return errorResponse('No supported AI provider is configured.', 503)
    }

    const pendingAnalysis = await InspectionAnalysis.create({
      inspectionId: inspection._id,
      createdBy: session.userId,
      status: 'running',
      provider: provider.id,
      providerVersion: provider.version,
      overallConfidence: 0,
      images: [],
      fields: [],
      declarations: [],
    })

    try {
      const result = await analyzeInspectionImages(
        provider,
        images.map((image) => ({
          imageId: image._id.toString(),
          filename: image.filename,
          label: image.label,
          source: image.source,
          mimeType: image.mimeType,
          data: image.data,
        })),
        inspection._id.toString(),
      )

      const completed = await InspectionAnalysis.findByIdAndUpdate(
        pendingAnalysis._id,
        {
          status: result.status,
          overallConfidence: result.overallConfidence,
          images: result.images,
          fields: result.fields,
          declarations: result.declarations,
          analyzedAt: result.analyzedAt,
          error: undefined,
        },
        { new: true },
      )

      if (!completed) return errorResponse('The analysis result could not be stored.', 503)
      if (inspection.finalDecision && inspection.finalDecision !== 'PENDING') {
        const oldFinalDecision = inspection.finalDecision
        await Inspection.updateOne({ _id: inspection._id }, { finalDecision: 'PENDING', status: 'in_review', $unset: { finalizedBy: 1, finalizedAt: 1, finalComment: 1 } })
        await ReviewAuditLog.create({ inspectionId: inspection._id, actorUserId: session.userId, action: 'FINAL_DECISION', oldDecision: oldFinalDecision, newDecision: 'PENDING', comment: 'Final decision reopened because AI assessment was re-run.' })
      }
      return NextResponse.json({ analysis: serializeInspectionAnalysis(completed) }, { status: 201 })
    } catch (analysisError) {
      console.error('Inspection analysis error', analysisError)
      await InspectionAnalysis.findByIdAndUpdate(pendingAnalysis._id, {
        status: 'failed',
        error: 'The provider could not complete this analysis.',
      })
      return errorResponse('The analysis could not be completed.', 503)
    }
  } catch (error) {
    console.error('Analyze inspection error', error)
    return errorResponse('The inspection analysis service is unavailable.', 503)
  }
}

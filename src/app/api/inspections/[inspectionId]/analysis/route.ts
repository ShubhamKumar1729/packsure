import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { serializeInspectionAnalysis } from '@/lib/ai/serialize'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { Inspection } from '@/models/Inspection'
import { InspectionAnalysis } from '@/models/InspectionAnalysis'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ inspectionId: string }> }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })

  const { inspectionId } = await params
  if (!Types.ObjectId.isValid(inspectionId)) return NextResponse.json({ error: 'Inspection ID is invalid.' }, { status: 400 })

  try {
    await connectToDatabase()
    const inspection = await Inspection.findById(inspectionId).select('createdBy')
    if (inspection && inspection.createdBy.toString() !== session.userId && !['admin', 'reviewer'].includes(session.role)) return NextResponse.json({ error: 'Inspection not found.' }, { status: 404 })
    if (!inspection) return NextResponse.json({ error: 'Inspection not found.' }, { status: 404 })

    const analysis = await InspectionAnalysis.findOne({ inspectionId }).sort({ createdAt: -1 })
    if (!analysis) return NextResponse.json({ error: 'No analysis has been run for this inspection.' }, { status: 404 })

    return NextResponse.json({ analysis: serializeInspectionAnalysis(analysis) })
  } catch (error) {
    console.error('View analysis error', error)
    return NextResponse.json({ error: 'The analysis could not be loaded.' }, { status: 503 })
  }
}

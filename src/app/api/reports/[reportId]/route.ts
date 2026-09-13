import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { Report } from '@/models/Report'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const session = await getCurrentSession()
  if (!session) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 })
  const { reportId } = await params
  if (!Types.ObjectId.isValid(reportId)) return NextResponse.json({ error: 'Report ID is invalid.' }, { status: 400 })
  try {
    await connectToDatabase()
    const report = await Report.findById(reportId).lean()
    if (!report || (report.createdBy.toString() !== session.userId && !['admin', 'reviewer'].includes(session.role))) return NextResponse.json({ error: 'Report not found.' }, { status: 404 })
    return NextResponse.json({ report: { id: report._id.toString(), reportVersion: report.reportVersion, generatedAt: report.generatedAt, snapshot: report.snapshot } })
  } catch (error) {
    console.error('Report read error', error)
    return NextResponse.json({ error: 'The report could not be loaded.' }, { status: 503 })
  }
}

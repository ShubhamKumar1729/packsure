import { NextResponse } from 'next/server'
import { Types } from 'mongoose'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { renderReportHtml } from '@/lib/reports/render-html'
import type { ReportSnapshot } from '@/lib/reports/types'
import { InspectionImage } from '@/models/InspectionImage'
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
    const snapshot = report.snapshot as ReportSnapshot
    const imageIds = snapshot.images.map((image) => image.id)
    const images = await InspectionImage.find({ _id: { $in: imageIds }, inspectionId: snapshot.inspection.id }).select('+data').lean()
    if (images.length !== imageIds.length) return NextResponse.json({ error: 'Stored evidence images are unavailable; the report was not downloaded.' }, { status: 503 })
    const imageData = new Map(images.map((image) => [image._id.toString(), { mimeType: image.mimeType, data: Buffer.from(image.data as unknown as Uint8Array) }]))
    const html = renderReportHtml(snapshot, imageData)
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': `attachment; filename="packsure-report-${report._id.toString()}.html"`, 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Report download error', error)
    return NextResponse.json({ error: 'The report could not be downloaded.' }, { status: 503 })
  }
}

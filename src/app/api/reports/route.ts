import { NextResponse } from 'next/server'
import { buildReportSnapshot } from '@/lib/reports/build-snapshot'
import type { ReportListItem } from '@/lib/reports/types'
import { connectToDatabase } from '@/lib/db'
import { getCurrentSession } from '@/lib/server-auth'
import { Report } from '@/models/Report'

export const runtime = 'nodejs'

function errorResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status })
}

export async function GET() {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)
  try {
    await connectToDatabase()
    const reports = await Report.find(['admin', 'reviewer'].includes(session.role) ? {} : { createdBy: session.userId }).sort({ createdAt: -1 }).limit(100).lean()
    const list: ReportListItem[] = reports.map((report) => {
      const snapshot = report.snapshot as { inspection: { id: string; finalDecision: string }; product: { name: string }; compliance?: { status: string; score: number | null }; generatedAt: string; reportVersion: string }
      return { id: report._id.toString(), inspectionId: snapshot.inspection.id, productName: snapshot.product.name, finalDecision: snapshot.inspection.finalDecision, complianceStatus: snapshot.compliance?.status || null, complianceScore: snapshot.compliance?.score ?? null, generatedAt: report.generatedAt.toISOString(), reportVersion: report.reportVersion }
    })
    return NextResponse.json({ reports: list })
  } catch (error) {
    console.error('Report list error', error)
    return errorResponse('Reports could not be loaded.', 503)
  }
}

export async function POST(request: Request) {
  const session = await getCurrentSession()
  if (!session) return errorResponse('Authentication required.', 401)
  if (!['admin', 'inspector', 'reviewer'].includes(session.role)) return errorResponse('Your role cannot generate reports.', 403)
  try {
    const body = await request.json() as { inspectionId?: string }
    if (!body.inspectionId) return errorResponse('Inspection ID is required.')
    const snapshot = await buildReportSnapshot(body.inspectionId, session)
    if (!snapshot) return errorResponse('Inspection not found or unavailable.', 404)
    if (!snapshot.compliance) return errorResponse('Run compliance checks before generating a report.', 400)
    const report = await Report.create({ inspectionId: body.inspectionId, createdBy: session.userId, reportVersion: snapshot.reportVersion, generatedAt: new Date(snapshot.generatedAt), snapshot })
    return NextResponse.json({ report: { id: report._id.toString(), inspectionId: body.inspectionId, productName: snapshot.product.name, generatedAt: snapshot.generatedAt, reportVersion: report.reportVersion } }, { status: 201 })
  } catch (error) {
    console.error('Report generation error', error)
    return errorResponse('The report could not be generated.', 503)
  }
}

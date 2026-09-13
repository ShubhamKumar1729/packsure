import { notFound } from 'next/navigation'
import { Types } from 'mongoose'
import { ReportView } from '@/components/report-view'
import { connectToDatabase } from '@/lib/db'
import { requireSession } from '@/lib/server-auth'
import type { ReportSnapshot } from '@/lib/reports/types'
import { Report } from '@/models/Report'

export default async function ReportDetailPage({ params }: { params: Promise<{ reportId: string }> }) {
  const session = await requireSession()
  const { reportId } = await params
  if (!Types.ObjectId.isValid(reportId)) notFound()
  await connectToDatabase()
  const report = await Report.findById(reportId).lean()
  if (!report || (report.createdBy.toString() !== session.userId && !['admin', 'reviewer'].includes(session.role))) notFound()
  return <ReportView reportId={report._id.toString()} snapshot={report.snapshot as ReportSnapshot} />
}

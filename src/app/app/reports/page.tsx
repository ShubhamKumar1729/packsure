import { ReportsWorkspace } from '@/components/reports-workspace'
import { requireRole } from '@/lib/server-auth'

export default async function ReportsPage() {
  await requireRole(['admin', 'inspector', 'reviewer'])
  return <div><div><p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-moss" />Decision records</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-ink">Reports</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Generate, view, and download reports built from actual inspection, evidence, AI, compliance, and review records.</p></div><ReportsWorkspace /></div>
}

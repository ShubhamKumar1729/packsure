import { Database, RefreshCw } from 'lucide-react'
import { DashboardOverview } from '@/components/dashboard-overview'
import { loadDashboardData } from '@/lib/dashboard/data'
import { requireSession } from '@/lib/server-auth'
import type { DashboardData } from '@/lib/dashboard/types'

export default async function DashboardPage() {
  const session = await requireSession()
  let data: DashboardData | null = null
  try {
    data = await loadDashboardData(session)
  } catch (error) {
    console.error('Dashboard data error', error)
  }

  if (data) return <DashboardOverview data={data} />

  return <div><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-danger" />Workspace overview</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-ink">Dashboard data is unavailable.</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted">PackSure does not substitute sample statistics when the database cannot be reached. Reconnect the configured MongoDB service and refresh this page.</p></div></div><div className="surface mt-8 flex min-h-[300px] flex-col items-center justify-center px-6 py-12 text-center"><span className="grid h-14 w-14 place-items-center rounded-2xl border border-danger/20 bg-danger-soft text-danger"><Database size={25} /></span><p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-danger">Live data connection required</p><h3 className="mt-3 text-xl font-semibold tracking-[-0.03em] text-ink">No dashboard figures were generated.</h3><p className="mt-2 max-w-md text-sm leading-6 text-muted">The dashboard reads inspections, compliance runs, findings, products, and review state directly from MongoDB.</p><span className="mt-6 inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-4 py-2.5 text-xs font-semibold text-muted"><RefreshCw size={14} /> Refresh after reconnecting</span></div></div>
}

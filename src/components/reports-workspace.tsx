'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowUpRight, FileBarChart, LoaderCircle, Plus, RefreshCw, ShieldAlert } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import type { ReportListItem } from '@/lib/reports/types'

type InspectionOption = { id: string; productName: string; complianceStatus: string | null; complianceScore: number | null; finalDecision: string }

export function ReportsWorkspace() {
  const router = useRouter()
  const [reports, setReports] = useState<ReportListItem[]>([])
  const [inspections, setInspections] = useState<InspectionOption[]>([])
  const [selectedInspection, setSelectedInspection] = useState('')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const [reportsResponse, inspectionsResponse] = await Promise.all([fetch('/api/reports', { cache: 'no-store' }), fetch('/api/inspections', { cache: 'no-store' })])
      const reportsData = await reportsResponse.json() as { reports?: ReportListItem[]; error?: string }
      const inspectionsData = await inspectionsResponse.json() as { inspections?: (InspectionOption & { id: string })[]; error?: string }
      if (!reportsResponse.ok) throw new Error(reportsData.error || 'Reports could not be loaded.')
      if (!inspectionsResponse.ok) throw new Error(inspectionsData.error || 'Inspections could not be loaded.')
      setReports(reportsData.reports || [])
      setInspections((inspectionsData.inspections || []).filter((inspection) => inspection.complianceStatus))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Reports could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  const generate = async () => {
    if (!selectedInspection) return
    setGenerating(true)
    setError('')
    try {
      const response = await fetch('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inspectionId: selectedInspection }) })
      const data = await response.json() as { report?: { id: string }; error?: string }
      if (!response.ok || !data.report) throw new Error(data.error || 'The report could not be generated.')
      router.push(`/app/reports/${data.report.id}`)
    } catch (generateError) {
      setError(generateError instanceof Error ? generateError.message : 'The report could not be generated.')
      setGenerating(false)
    }
  }

  return <div><div className="surface mt-8 p-5 sm:p-6"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-leaf text-moss"><Plus size={18} /></span><div><p className="text-sm font-semibold text-ink">Generate from a real inspection</p><p className="mt-1 text-xs leading-5 text-muted">Reports are snapshots of actual product, evidence, AI, compliance, and review records. A compliance evaluation is required.</p></div></div><div className="mt-5 flex flex-col gap-3 sm:flex-row"><select value={selectedInspection} onChange={(event) => setSelectedInspection(event.target.value)} className="focus-ring h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3.5 text-sm outline-none focus:border-moss"><option value="">Select an evaluated inspection</option>{inspections.map((inspection) => <option key={inspection.id} value={inspection.id}>{inspection.productName} · {inspection.id.slice(-8)} · {inspection.complianceScore === null ? 'Score pending' : `${inspection.complianceScore}%`}</option>)}</select><button type="button" disabled={!selectedInspection || generating} onClick={() => void generate()} className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-moss px-4 text-xs font-semibold text-white hover:bg-[#174a37] disabled:cursor-not-allowed disabled:opacity-50">{generating ? <LoaderCircle size={15} className="animate-spin" /> : <FileBarChart size={15} />} {generating ? 'Generating…' : 'Generate report'}</button></div>{inspections.length === 0 ? <p className="mt-3 text-[11px] text-muted">No compliance-evaluated inspections are available yet.</p> : null}</div>{error ? <div role="alert" className="mt-5 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-xs text-danger">{error}</div> : null}<div className="mt-8 flex items-center justify-between"><div><p className="text-sm font-semibold text-ink">Generated reports</p><p className="mt-1 text-xs text-muted">Stored snapshots of real database records</p></div><button type="button" onClick={() => void load()} className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2 text-xs font-semibold text-muted hover:bg-white"><RefreshCw size={14} /> Refresh</button></div>{loading ? <div className="mt-4 flex min-h-[260px] items-center justify-center rounded-2xl border border-line bg-paper"><LoaderCircle size={22} className="animate-spin text-moss" /></div> : reports.length === 0 ? <div className="mt-4"><EmptyState icon={FileBarChart} eyebrow="No reports generated" title="Reports will appear after a real compliance evaluation." description="No report records have been created. Generate a report from an evaluated inspection above." /></div> : <div className="mt-4 space-y-3">{reports.map((report) => <Link key={report.id} href={`/app/reports/${report.id}`} className="focus-ring block rounded-2xl border border-line bg-paper p-5 transition hover:-translate-y-0.5 hover:shadow-soft"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-leaf text-moss"><FileBarChart size={18} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{report.productName}</p><p className="mt-1 text-xs text-muted">Report v{report.reportVersion} · {new Date(report.generatedAt).toLocaleString()}</p></div></div><div className="flex items-center gap-3 pl-[52px] sm:pl-0"><span className="inline-flex items-center gap-1.5 text-xs text-muted"><ShieldAlert size={14} /> {report.complianceStatus?.replace('_', ' ') || 'Not evaluated'}</span><span className="text-xs font-semibold text-ink">{report.complianceScore === null ? '—' : `${report.complianceScore}%`}</span><ArrowUpRight size={16} className="text-muted" /></div></div></Link>)}</div>}</div>
}

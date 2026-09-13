'use client'

import { useEffect, useState } from 'react'
import { ArrowUpRight, ClipboardCheck, ImageIcon, LoaderCircle, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { EmptyState } from '@/components/empty-state'

type InspectionListItem = {
  id: string
  productName: string
  brand: string
  status: string
  finalDecision: string
  complianceStatus: string | null
  complianceScore: number | null
  imageCount: number
  createdAt: string
}

export function InspectionList() {
  const [records, setRecords] = useState<InspectionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const loadRecords = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/inspections', { cache: 'no-store' })
      const data = (await response.json()) as { inspections?: InspectionListItem[]; error?: string }
      if (!response.ok) throw new Error(data.error || 'Inspections could not be loaded.')
      setRecords(data.inspections || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Inspections could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadRecords() }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  if (loading) {
    return <div className="flex min-h-[280px] items-center justify-center rounded-2xl border border-line bg-paper"><LoaderCircle size={22} className="animate-spin text-moss" aria-label="Loading inspections" /></div>
  }

  if (error) {
    return <div className="flex min-h-[280px] flex-col items-center justify-center rounded-2xl border border-danger/20 bg-danger-soft px-6 text-center"><p className="text-sm font-semibold text-danger">{error}</p><button type="button" onClick={() => void loadRecords()} className="focus-ring mt-4 inline-flex items-center gap-2 rounded-xl border border-danger/20 bg-paper px-4 py-2.5 text-xs font-semibold text-danger hover:bg-white"><RefreshCw size={14} /> Try again</button></div>
  }

  if (records.length === 0) {
    return <EmptyState icon={ClipboardCheck} eyebrow="No inspections yet" title="Your review queue is empty." description="Submitted inspection records will appear here with their evidence, status, assigned reviewer, and decision history." />
  }

  return <div className="space-y-3">{records.map((record) => <Link key={record.id} href={`/app/inspections/${record.id}`} className="focus-ring flex flex-col gap-4 rounded-2xl border border-line bg-paper p-4 transition hover:-translate-y-0.5 hover:shadow-soft sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-center gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-leaf text-moss"><ClipboardCheck size={18} /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{record.productName}</p><p className="mt-1 truncate text-xs text-muted">{record.brand || 'Product record'} · {new Date(record.createdAt).toLocaleString()}</p></div></div><div className="flex items-center gap-4 pl-[52px] sm:pl-0"><span className="inline-flex items-center gap-1.5 text-xs text-muted"><ImageIcon size={14} /> {record.imageCount} {record.imageCount === 1 ? 'image' : 'images'}</span><span className="rounded-full bg-amber-soft px-2.5 py-1 text-[10px] font-semibold capitalize text-amber">{(record.finalDecision !== 'PENDING' ? record.finalDecision : record.complianceStatus || record.status).replace('_', ' ')}</span><span className="text-xs font-semibold text-ink">{record.complianceScore === null ? '—' : `${record.complianceScore}%`}</span><ArrowUpRight size={16} className="text-muted" /></div></Link>)}</div>
}

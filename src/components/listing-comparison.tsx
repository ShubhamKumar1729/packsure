'use client'

/* Package evidence thumbnails use authenticated image endpoints. */
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'
import { AlertCircle, ArrowUpRight, Check, ExternalLink, Globe2, LoaderCircle, SearchCheck, ShieldAlert } from 'lucide-react'
import type { ListingComparisonField, ListingComparisonResult, ListingComparisonSide } from '@/lib/marketplace/types'

function statusStyle(status: string) {
  if (status === 'MATCHED') return 'bg-leaf text-moss'
  if (status === 'MISMATCH') return 'bg-danger-soft text-danger'
  return 'bg-amber-soft text-amber'
}

function statusLabel(status: string) {
  return status.replaceAll('_', ' ')
}

function sideValue(side: ListingComparisonSide) {
  if (side.values.length > 1) return side.values.join(' · ')
  return side.value || 'Not available'
}

function Evidence({ side, inspectionId }: { side: ListingComparisonSide; inspectionId: string }) {
  if (side.evidence.length === 0) return <p className="mt-2 text-[11px] text-muted">No evidence recorded.</p>
  return <div className="mt-3 space-y-2">{side.evidence.map((item, index) => item.source === 'package' && item.imageId ? <div key={`${item.locator}-${index}`} className="flex items-center gap-2 rounded-lg bg-canvas p-2"><img src={`/api/inspections/${inspectionId}/images/${item.imageId}`} alt={`${item.imageLabel || 'Package'} evidence`} className="h-10 w-10 rounded-md object-cover" /><div className="min-w-0"><p className="truncate text-[10px] font-semibold text-ink">Package image · {item.imageLabel || 'evidence'}</p><p className="truncate text-[10px] text-muted">{item.excerpt || item.locator}</p></div></div> : <div key={`${item.locator}-${index}`} className="rounded-lg bg-canvas px-2.5 py-2"><p className="text-[10px] font-semibold text-muted">{item.source === 'listing' ? 'Online listing evidence' : 'Package record evidence'}</p><p className="mt-1 break-words text-[10px] leading-4 text-ink">{item.excerpt || item.locator}</p><p className="mt-1 break-all text-[10px] text-muted">{item.locator}</p></div>)}</div>
}

function FieldComparison({ field, inspectionId }: { field: ListingComparisonField; inspectionId: string }) {
  const emphasized = field.key === 'mrp'
  return <article className={`rounded-2xl border bg-paper p-4 ${emphasized ? 'border-amber/50 shadow-[0_4px_18px_rgba(202,135,49,0.09)]' : 'border-line'}`}><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-semibold text-ink">{field.label}</p>{emphasized ? <p className="mt-1 text-[11px] font-medium text-amber">Priority check: package MRP vs online listing MRP</p> : null}</div><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusStyle(field.status)}`}>{field.status === 'MATCHED' ? <Check size={12} /> : field.status === 'MISMATCH' ? <ShieldAlert size={12} /> : <AlertCircle size={12} />}{statusLabel(field.status)}</span></div><div className="mt-4 grid gap-3 md:grid-cols-2"><div className={`rounded-xl border p-3 ${field.status === 'MISMATCH' && emphasized ? 'border-danger/30 bg-danger-soft/40' : 'border-line bg-canvas'}`}><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">Physical package</p><p className="mt-2 break-words text-sm font-semibold text-ink">{sideValue(field.package)}</p><Evidence side={field.package} inspectionId={inspectionId} /></div><div className={`rounded-xl border p-3 ${field.status === 'MISMATCH' && emphasized ? 'border-danger/30 bg-danger-soft/40' : 'border-line bg-canvas'}`}><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">Online listing</p><p className="mt-2 break-words text-sm font-semibold text-ink">{sideValue(field.listing)}</p><Evidence side={field.listing} inspectionId={inspectionId} /></div></div><p className="mt-3 border-l-2 border-amber pl-2 text-[11px] leading-5 text-muted">{field.explanation}</p></article>
}

export function ListingComparison({ inspectionId, initialUrl = '', initialComparison = null, canCompare }: { inspectionId: string; initialUrl?: string; initialComparison?: ListingComparisonResult | null; canCompare: boolean }) {
  const [url, setUrl] = useState(initialUrl || initialComparison?.sourceUrl || '')
  const [comparison, setComparison] = useState<ListingComparisonResult | null>(initialComparison)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const runComparison = async () => {
    setError('')
    setLoading(true)
    try {
      const response = await fetch(`/api/inspections/${inspectionId}/listing-comparison`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) })
      const data = await response.json() as { comparison?: ListingComparisonResult; error?: string }
      if (!response.ok || !data.comparison) throw new Error(data.error || 'The listing comparison could not be completed.')
      setComparison(data.comparison)
      setUrl(data.comparison.sourceUrl)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The listing comparison could not be completed.')
    } finally {
      setLoading(false)
    }
  }

  return <section className="surface mt-5 p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber"><Globe2 size={19} /></span><div><p className="text-sm font-semibold text-ink">Online listing comparison</p><p className="mt-1 max-w-2xl text-xs leading-5 text-muted">Retrieve the available listing data server-side and compare it with the stored package inspection. The marketplace provider never runs in the browser.</p></div></div>{comparison ? <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusStyle(comparison.overallStatus)}`}>{comparison.overallStatus === 'MATCHED' ? <Check size={12} /> : comparison.overallStatus === 'MISMATCH' ? <ShieldAlert size={12} /> : <AlertCircle size={12} />}{statusLabel(comparison.overallStatus)}</span> : null}</div><div className="mt-5 flex flex-col gap-2 sm:flex-row"><input type="url" value={url} onChange={(event) => setUrl(event.target.value)} disabled={!canCompare || loading} placeholder="https://marketplace.example/product" className="focus-ring h-11 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3.5 text-sm text-ink outline-none transition placeholder:text-[#aaa79e] focus:border-moss disabled:bg-canvas disabled:text-muted" aria-label="Online product or listing URL" />{canCompare ? <button type="button" onClick={() => void runComparison()} disabled={loading || !url.trim()} className="focus-ring inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-moss px-4 text-xs font-semibold text-white transition hover:bg-[#174a37] disabled:cursor-wait disabled:opacity-60">{loading ? <LoaderCircle size={15} className="animate-spin" /> : <SearchCheck size={15} />}{loading ? 'Retrieving…' : comparison ? 'Run comparison again' : 'Retrieve & compare'}</button> : null}</div><div className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-muted"><ExternalLink size={14} className="mt-0.5 shrink-0 text-moss" />Only explicitly available listing information is used. An online selling price is not treated as MRP unless the source labels it as MRP or maximum retail price.</div>{error ? <div role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-xs leading-5 text-danger"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</div> : null}{!comparison ? <div className="mt-5 rounded-2xl border border-dashed border-line bg-canvas px-5 py-8 text-center"><Globe2 size={23} className="mx-auto text-muted" /><p className="mt-3 text-sm font-semibold text-ink">No listing comparison recorded</p><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted">Enter a listing URL to create a comparison from the retrieved page. Missing package or listing values will be marked REVIEW_REQUIRED.</p></div> : <div className="mt-6 space-y-3"><div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-4 py-3"><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">Retrieved listing</p><a href={comparison.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex max-w-full items-center gap-1 text-xs font-semibold text-moss hover:text-ink"><span className="truncate">{comparison.listing.title || comparison.marketplace}</span><ArrowUpRight size={13} /></a></div><span className="text-[10px] text-muted">{new Date(comparison.retrievedAt).toLocaleString()} · {comparison.provider} v{comparison.providerVersion}</span></div>{comparison.fields.map((field) => <FieldComparison key={field.key} field={field} inspectionId={inspectionId} />)}</div>}</section>
}

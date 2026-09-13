'use client'

/* Native img is used for authenticated image endpoints and local previews. */
/* eslint-disable @next/next/no-img-element */

import { useState } from 'react'
import {
  AlertCircle,
  BrainCircuit,
  Check,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  ScanText,
  ShieldCheck,
} from 'lucide-react'
import type { InspectionAnalysisResult } from '@/lib/ai/types'

function confidenceLabel(value: number) {
  return `${Math.round(value * 100)}% confidence`
}

function labelTitle(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

export function AnalysisViewer({ inspectionId, initialAnalysis = null, canAnalyze = true }: { inspectionId: string; initialAnalysis?: InspectionAnalysisResult | null; canAnalyze?: boolean }) {
  const [analysis, setAnalysis] = useState<InspectionAnalysisResult | null>(initialAnalysis)
  const [loadingAction, setLoadingAction] = useState<'analyze' | 'view' | null>(null)
  const [error, setError] = useState('')

  const analyze = async () => {
    setLoadingAction('analyze')
    setError('')
    try {
      const response = await fetch(`/api/inspections/${inspectionId}/analyze`, { method: 'POST' })
      const data = (await response.json()) as { analysis?: InspectionAnalysisResult; error?: string }
      if (!response.ok || !data.analysis) throw new Error(data.error || 'The analysis could not be completed.')
      setAnalysis(data.analysis)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The analysis could not be completed.')
    } finally {
      setLoadingAction(null)
    }
  }

  const viewAnalysis = async () => {
    setLoadingAction('view')
    setError('')
    try {
      const response = await fetch(`/api/inspections/${inspectionId}/analysis`, { cache: 'no-store' })
      const data = (await response.json()) as { analysis?: InspectionAnalysisResult; error?: string }
      if (response.status === 404) {
        setAnalysis(null)
        setError('No analysis has been run for this inspection yet.')
        return
      }
      if (!response.ok || !data.analysis) throw new Error(data.error || 'The analysis could not be loaded.')
      setAnalysis(data.analysis)
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The analysis could not be loaded.')
    } finally {
      setLoadingAction(null)
    }
  }

  const hasResults = Boolean(analysis && analysis.status === 'completed')
  const isMock = analysis?.provider === 'mock'

  return <section className="surface p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber"><BrainCircuit size={19} /></span><div><p className="text-sm font-semibold text-ink">AI analysis</p><p className="mt-1 text-xs leading-5 text-muted">Images → OCR → field extraction → declarations</p></div></div><div className="flex flex-wrap items-center gap-2">{canAnalyze ? <button type="button" onClick={() => void analyze()} disabled={loadingAction !== null} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-moss px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#174a37] disabled:cursor-wait disabled:opacity-60">{loadingAction === 'analyze' ? <LoaderCircle size={14} className="animate-spin" /> : <ScanText size={14} />} {loadingAction === 'analyze' ? 'Analyzing…' : 'Analyze inspection'}</button> : null}<button type="button" onClick={() => void viewAnalysis()} disabled={loadingAction !== null} className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2.5 text-xs font-semibold text-ink transition hover:bg-[#efede7] disabled:cursor-wait disabled:opacity-60">{loadingAction === 'view' ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} View analysis</button></div></div>
    {error ? <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-amber/25 bg-amber-soft px-4 py-3 text-xs leading-5 text-[#8a5a20]"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</div> : null}
    {!analysis ? <div className="mt-6 rounded-2xl border border-dashed border-line bg-canvas px-5 py-8 text-center"><FileSearch size={23} className="mx-auto text-muted" /><p className="mt-3 text-sm font-semibold text-ink">Analysis has not been run</p><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted">Run the server-side analysis pipeline when a provider is configured. The frontend never calls an AI provider directly.</p></div> : null}
    {analysis && hasResults ? <div className="mt-6 space-y-6"><div className="flex flex-wrap items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-leaf px-2.5 py-1 text-[10px] font-semibold text-moss"><Check size={12} /> Completed</span><span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold text-muted">Provider: {analysis.provider} · v{analysis.providerVersion}</span><span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold text-muted">{confidenceLabel(analysis.overallConfidence)}</span></div>{isMock ? <div className="flex items-start gap-2 rounded-xl border border-line bg-canvas px-4 py-3 text-xs leading-5 text-muted"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-moss" />MockAIProvider processed the stored image bytes and returned no inferred business values. Replace the provider on the server to populate OCR, fields, declarations, and evidence.</div> : null}<div className="grid gap-5 lg:grid-cols-2"><div><div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Extracted fields</p><span className="text-[11px] text-muted">{analysis.fields.length} found</span></div>{analysis.fields.length === 0 ? <div className="rounded-xl border border-dashed border-line bg-canvas px-4 py-7 text-center text-xs leading-5 text-muted">No fields returned by this provider.</div> : <div className="space-y-2">{analysis.fields.map((field, index) => <div key={`${field.key}-${index}`} className="rounded-xl border border-line bg-paper p-3"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-ink">{labelTitle(field.key.replaceAll('_', ' '))}</p><p className="mt-1 text-sm text-ink">{field.value}{field.unit ? ` ${field.unit}` : ''}</p></div><span className="text-[10px] font-semibold text-moss">{confidenceLabel(field.confidence)}</span></div><p className="mt-2 text-[10px] text-muted">Source: {field.sourceImage.filename} · {labelTitle(field.sourceImage.label)}{field.boundingBox ? ' · Evidence bounds available' : ''}</p>{field.evidence ? <p className="mt-2 border-l-2 border-amber pl-2 text-xs italic leading-5 text-muted">{field.evidence}</p> : null}</div>)}</div>}</div><div><div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Detected declarations</p><span className="text-[11px] text-muted">{analysis.declarations.length} found</span></div>{analysis.declarations.length === 0 ? <div className="rounded-xl border border-dashed border-line bg-canvas px-4 py-7 text-center text-xs leading-5 text-muted">No declarations returned by this provider.</div> : <div className="space-y-2">{analysis.declarations.map((declaration, index) => <div key={`${declaration.type}-${index}`} className="rounded-xl border border-line bg-paper p-3"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-ink">{labelTitle(declaration.type.replaceAll('_', ' '))}</p><span className="text-[10px] font-semibold text-moss">{confidenceLabel(declaration.confidence)}</span></div><p className="mt-1 text-sm text-ink">{declaration.text}</p><p className="mt-2 text-[10px] text-muted">Source: {declaration.sourceImage.filename}{declaration.boundingBox ? ' · Evidence bounds available' : ''}</p></div>)}</div>}</div></div><div><div className="mb-3 flex items-center justify-between"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Image analysis</p><span className="text-[11px] text-muted">{analysis.images.length} processed</span></div><div className="grid gap-3 sm:grid-cols-2">{analysis.images.map((image) => <div key={image.sourceImage.inspectionImageId} className="overflow-hidden rounded-xl border border-line bg-canvas"><div className="flex gap-3 p-3"><img src={`/api/inspections/${inspectionId}/images/${image.sourceImage.inspectionImageId}`} alt={`${labelTitle(image.sourceImage.label)} package view`} className="h-16 w-16 shrink-0 rounded-lg object-cover" /><div className="min-w-0"><p className="truncate text-xs font-semibold text-ink">{labelTitle(image.sourceImage.label)} · {image.sourceImage.source}</p><p className="mt-1 truncate text-[10px] text-muted">{image.sourceImage.filename}</p><p className="mt-2 text-[10px] text-muted">OCR: {image.ocr.status.replaceAll('_', ' ')} · {confidenceLabel(image.confidence)}</p></div></div></div>)}</div></div></div> : null}
    {analysis && analysis.status === 'failed' ? <div className="mt-6 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-xs leading-5 text-danger">This analysis failed before completion. Run the analysis again after checking the configured provider.</div> : null}
  </section>
}

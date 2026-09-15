'use client'

import { useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  BrainCircuit,
  Check,
  FileSearch,
  LoaderCircle,
  RefreshCw,
  ScanText,
} from 'lucide-react'
import type { InspectionAnalysisResult } from '@/lib/ai/types'
import { fieldKeyTitle } from '@/lib/ai/field-keys'
import { EvidenceOverlay, type OverlayRegion } from '@/components/evidence-overlay'

function confidenceLabel(value: number) {
  return `${Math.round(value * 100)}% confidence`
}

/** Same bands as the NLP service (Phase 12): >=0.85 high, >=0.6 medium, else low. */
export function confidenceBand(value: number): 'high' | 'medium' | 'low' {
  if (value >= 0.85) return 'high'
  if (value >= 0.6) return 'medium'
  return 'low'
}

const BAND_STYLES: Record<'high' | 'medium' | 'low', string> = {
  high: 'bg-leaf text-moss',
  medium: 'bg-amber-soft text-amber',
  low: 'bg-danger-soft text-danger',
}

function metadataValue(analysis: InspectionAnalysisResult, key: string): string | number | boolean | undefined {
  for (const image of analysis.images) {
    const metadata = image.providerMetadata as Record<string, string | number | boolean> | undefined
    const value = metadata?.[key]
    if (value !== undefined && value !== '') return value
  }
  return undefined
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
  const isUnavailable = analysis?.status === 'unavailable'
  const extractor = String(metadataValue(analysis as InspectionAnalysisResult, 'extractor') ?? '')
  const degraded = extractor === 'pattern_rules' || metadataValue(analysis as InspectionAnalysisResult, 'degraded') === true || isMock
  const degradedDetail = String(metadataValue(analysis as InspectionAnalysisResult, 'degradedDetail') ?? '')
  const nlpVersion = String(metadataValue(analysis as InspectionAnalysisResult, 'nlpModelVersion') ?? '')
  const baseModel = String(metadataValue(analysis as InspectionAnalysisResult, 'nlpBaseModel') ?? '')

  // Evidence regions per image: detected fields (tone by confidence band).
  const regionsByImage = useMemo(() => {
    const map = new Map<string, OverlayRegion[]>()
    if (!analysis) return map
    for (const image of analysis.images) {
      const regions: OverlayRegion[] = image.fields.map((field, index) => ({
        id: `${image.sourceImage.inspectionImageId}-${field.key}-${index}`,
        box: field.boundingBox ?? { x: 0, y: 0, width: 0, height: 0 },
        title: `${fieldKeyTitle(field.key)}: ${field.value}`,
        tone: field.boundingBox ? (confidenceBand(field.confidence) === 'low' ? 'review' : 'info') : 'review',
        confidence: field.confidence,
      }))
      map.set(image.sourceImage.inspectionImageId, regions.filter((region) => region.box.width > 0))
    }
    return map
  }, [analysis])

  return (
    <section className="surface p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-soft text-amber"><BrainCircuit size={19} /></span>
          <div>
            <p className="text-sm font-semibold text-ink">AI analysis</p>
            <p className="mt-1 text-xs leading-5 text-muted">Image → OCR → NER → normalization → structured fields</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canAnalyze ? <button type="button" onClick={() => void analyze()} disabled={loadingAction !== null} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-moss px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#174a37] disabled:cursor-wait disabled:opacity-60">{loadingAction === 'analyze' ? <LoaderCircle size={14} className="animate-spin" /> : <ScanText size={14} />} {loadingAction === 'analyze' ? 'Analyzing…' : 'Analyze inspection'}</button> : null}
          <button type="button" onClick={() => void viewAnalysis()} disabled={loadingAction !== null} className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2.5 text-xs font-semibold text-ink transition hover:bg-[#efede7] disabled:cursor-wait disabled:opacity-60">{loadingAction === 'view' ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} View analysis</button>
        </div>
      </div>

      {error ? <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-amber/25 bg-amber-soft px-4 py-3 text-xs leading-5 text-[#8a5a20]"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</div> : null}

      {!analysis ? (
        <div className="mt-6 rounded-2xl border border-dashed border-line bg-canvas px-5 py-8 text-center">
          <FileSearch size={23} className="mx-auto text-muted" />
          <p className="mt-3 text-sm font-semibold text-ink">Analysis has not been run</p>
          <p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted">Run the server-side pipeline (OCR → legal-metrology NER → normalization). The frontend never calls an AI provider directly.</p>
        </div>
      ) : null}

      {analysis && isUnavailable ? (
        <div className="mt-6 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-xs leading-5 text-danger">
          <span className="font-semibold">Analysis service unavailable.</span> The NLP service could not be reached, so no values were produced. Start the NLP service (see docs) and run the analysis again — nothing was fabricated in the meantime.
        </div>
      ) : null}

      {analysis && analysis.status === 'failed' ? (
        <div className="mt-6 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-xs leading-5 text-danger">This analysis failed before completion{analysis.error ? `: ${analysis.error}` : '. Run the analysis again after checking the configured provider.'}</div>
      ) : null}

      {analysis && hasResults ? (
        <div className="mt-6 space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-leaf px-2.5 py-1 text-[10px] font-semibold text-moss"><Check size={12} /> Completed</span>
            <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold text-muted">Provider: {analysis.provider} · v{analysis.providerVersion}</span>
            {extractor ? <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold text-muted">Extractor: {extractor === 'ner_model' ? `NER model (${baseModel}${nlpVersion ? ` · v${nlpVersion}` : ''})` : 'pattern rules'}</span> : null}
            <span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold text-muted">{confidenceLabel(analysis.overallConfidence)}</span>
          </div>

          {degraded ? (
            <div className="flex items-start gap-2 rounded-xl border border-amber/25 bg-amber-soft px-4 py-3 text-xs leading-5 text-[#8a5a20]">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                {isMock
                  ? 'MockAIProvider processed the stored image bytes and returned no inferred values by design. Configure the NLP service (AI_PROVIDER=nlp) for real extraction.'
                  : 'Degraded extraction: the trained NER model is not available yet, so fields come from the transparent keyword/pattern extractor over real OCR text. Values are traceable, but expect lower recall until the model is trained.'}
                {degradedDetail ? ` ${degradedDetail}` : ''}
              </span>
            </div>
          ) : null}

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Extracted fields</p>
                <span className="text-[11px] text-muted">{analysis.fields.length} found</span>
              </div>
              {analysis.fields.length === 0 ? (
                <div className="rounded-xl border border-dashed border-line bg-canvas px-4 py-7 text-center text-xs leading-5 text-muted">No fields were detected in this evidence. Missing fields are reported as missing — never filled with placeholder values.</div>
              ) : (
                <div className="space-y-2">
                  {analysis.fields.map((field, index) => {
                    const band = confidenceBand(field.confidence)
                    return (
                      <div key={`${field.key}-${index}`} className="rounded-xl border border-line bg-paper p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink">{fieldKeyTitle(field.key)}</p>
                            <p className="mt-1 break-words text-sm text-ink">{field.value}{field.unit ? ` ${field.unit}` : ''}</p>
                          </div>
                          <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${BAND_STYLES[band]}`}>{confidenceLabel(field.confidence)}</span>
                        </div>
                        <p className="mt-2 text-[10px] text-muted">Source: {field.sourceImage.filename} · {field.sourceImage.label}{field.boundingBox ? ' · evidence region available' : ''}</p>
                        {field.evidence ? <p className="mt-2 border-l-2 border-amber pl-2 text-xs italic leading-5 text-muted">raw OCR: {field.evidence}</p> : null}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Evidence with bounding boxes</p>
                <span className="text-[11px] text-muted">{analysis.images.length} processed</span>
              </div>
              <div className="space-y-3">
                {analysis.images.map((image) => {
                  const regions = regionsByImage.get(image.sourceImage.inspectionImageId) ?? []
                  return (
                    <div key={image.sourceImage.inspectionImageId} className="rounded-xl border border-line bg-canvas p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="truncate text-xs font-semibold text-ink">{image.sourceImage.label.toUpperCase()} · {image.sourceImage.filename}</p>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${BAND_STYLES[confidenceBand(image.confidence)]}`}>OCR {image.ocr.status.replaceAll('_', ' ')} · {confidenceLabel(image.confidence)}</span>
                      </div>
                      <EvidenceOverlay
                        imageUrl={`/api/inspections/${inspectionId}/images/${image.sourceImage.inspectionImageId}`}
                        alt={`${image.sourceImage.label} package view with extracted-field evidence regions`}
                        regions={regions}
                      />
                      {image.ocr.text ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-[11px] font-semibold text-muted">Raw OCR text (preserve-first, never cleaned)</summary>
                          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-line bg-paper p-2 text-[10px] leading-4 text-muted">{image.ocr.text}</pre>
                        </details>
                      ) : (
                        <p className="mt-2 text-[11px] text-muted">OCR returned no text for this image.</p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}

'use client'

import { useState } from 'react'
import { AlertCircle, BookOpenCheck, Check, CircleHelp, LoaderCircle, RefreshCw, ShieldAlert, Wrench } from 'lucide-react'
import type { ComplianceRunResult, ComplianceStatus } from '@/lib/compliance/types'

function statusStyles(status: ComplianceStatus) {
  if (status === 'PASS') return 'bg-leaf text-moss'
  if (status === 'VIOLATION') return 'bg-danger-soft text-danger'
  if (status === 'REVIEW_REQUIRED') return 'bg-amber-soft text-amber'
  return 'bg-[#efede7] text-muted'
}

function statusIcon(status: ComplianceStatus) {
  if (status === 'PASS') return <Check size={12} />
  if (status === 'VIOLATION') return <ShieldAlert size={12} />
  if (status === 'REVIEW_REQUIRED') return <CircleHelp size={12} />
  return <BookOpenCheck size={12} />
}

const CLASSIFICATION_STYLES: Record<string, string> = {
  COMPLIANT: 'bg-leaf text-moss',
  PARTIAL: 'bg-amber-soft text-amber',
  NON_COMPLIANT: 'bg-danger-soft text-danger',
  INSUFFICIENT_DATA: 'bg-[#efede7] text-muted',
}

export function ComplianceViewer({ inspectionId, initialCompliance = null, canEvaluate = true }: { inspectionId: string; initialCompliance?: ComplianceRunResult | null; canEvaluate?: boolean }) {
  const [compliance, setCompliance] = useState<ComplianceRunResult | null>(initialCompliance)
  const [loadingAction, setLoadingAction] = useState<'evaluate' | 'view' | null>(null)
  const [error, setError] = useState('')

  const evaluate = async () => {
    setLoadingAction('evaluate')
    setError('')
    try {
      const response = await fetch(`/api/inspections/${inspectionId}/compliance`, { method: 'POST' })
      const data = (await response.json()) as { compliance?: ComplianceRunResult; error?: string }
      if (!response.ok || !data.compliance) throw new Error(data.error || 'Compliance checks could not be run.')
      setCompliance(data.compliance)
    } catch (evaluateError) {
      setError(evaluateError instanceof Error ? evaluateError.message : 'Compliance checks could not be run.')
    } finally {
      setLoadingAction(null)
    }
  }

  const viewResults = async () => {
    setLoadingAction('view')
    setError('')
    try {
      const response = await fetch(`/api/inspections/${inspectionId}/compliance`, { cache: 'no-store' })
      const data = (await response.json()) as { compliance?: ComplianceRunResult; error?: string }
      if (response.status === 404) {
        setCompliance(null)
        setError('No compliance evaluation has been run for this inspection yet.')
        return
      }
      if (!response.ok || !data.compliance) throw new Error(data.error || 'Compliance results could not be loaded.')
      setCompliance(data.compliance)
    } catch (viewError) {
      setError(viewError instanceof Error ? viewError.message : 'Compliance results could not be loaded.')
    } finally {
      setLoadingAction(null)
    }
  }

  const summary = compliance?.summary

  return <section className="surface p-5 sm:p-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="flex items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-danger-soft text-danger"><ShieldAlert size={19} /></span><div><p className="text-sm font-semibold text-ink">Rule engine decision</p><p className="mt-1 text-xs leading-5 text-muted">AI supplies evidence; the deterministic rule engine decides compliance.</p></div></div><div className="flex flex-wrap items-center gap-2">{canEvaluate ? <button type="button" onClick={() => void evaluate()} disabled={loadingAction !== null} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-moss px-3.5 py-2.5 text-xs font-semibold text-white transition hover:bg-[#174a37] disabled:cursor-wait disabled:opacity-60">{loadingAction === 'evaluate' ? <LoaderCircle size={14} className="animate-spin" /> : <ShieldAlert size={14} />} {loadingAction === 'evaluate' ? 'Evaluating…' : 'Run rule checks'}</button> : null}<button type="button" onClick={() => void viewResults()} disabled={loadingAction !== null} className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-3.5 py-2.5 text-xs font-semibold text-ink transition hover:bg-[#efede7] disabled:cursor-wait disabled:opacity-60">{loadingAction === 'view' ? <LoaderCircle size={14} className="animate-spin" /> : <RefreshCw size={14} />} View results</button></div></div>
    {error ? <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-amber/25 bg-amber-soft px-4 py-3 text-xs leading-5 text-[#8a5a20]"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</div> : null}
    {!compliance ? <div className="mt-6 rounded-2xl border border-dashed border-line bg-canvas px-5 py-8 text-center"><BookOpenCheck size={23} className="mx-auto text-muted" /><p className="mt-3 text-sm font-semibold text-ink">No compliance evaluation yet</p><p className="mx-auto mt-2 max-w-md text-xs leading-5 text-muted">Run AI analysis first, then evaluate the enabled rules. Install the Legal Metrology baseline from the Rules admin page if no rules exist yet.</p></div> : null}
    {compliance ? <div className="mt-6"><div className="flex flex-wrap items-center gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusStyles(compliance.status)}`}>{statusIcon(compliance.status)} {compliance.status.replace('_', ' ')}</span><span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold text-muted">{compliance.results.length} configured {compliance.results.length === 1 ? 'rule' : 'rules'} evaluated</span><span className="rounded-full border border-line px-2.5 py-1 text-[10px] font-semibold text-muted">{new Date(compliance.evaluatedAt).toLocaleString()}</span></div>
      {summary ? <div className="mt-4 rounded-xl border border-line bg-paper p-4"><div className="flex flex-wrap items-center gap-3"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${CLASSIFICATION_STYLES[summary.classification] ?? 'bg-[#efede7] text-muted'}`}>Computed: {summary.classification.replaceAll('_', ' ')}</span>{summary.score !== null ? <span className="text-sm font-semibold text-ink">Score {summary.score}/100</span> : <span className="text-xs text-muted">No score — no applicable checks</span>}<span className="text-[10px] text-muted">{summary.counts.pass} pass · {summary.counts.violation} violation · {summary.counts.reviewRequired} review · {summary.counts.notApplicable} n/a</span></div><details className="mt-2"><summary className="cursor-pointer text-[10px] font-semibold text-muted">Scoring formula ({summary.formulaVersion})</summary><p className="mt-1.5 text-[10px] leading-4 text-muted">{summary.formulaDescription} Not-applicable checks are excluded. This computed assessment is preliminary — the human final decision on this inspection remains the authoritative outcome.</p></details></div> : null}
      {compliance.results.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-line bg-canvas px-4 py-7 text-center text-xs leading-5 text-muted">No enabled rules were available for this evaluation. An administrator can install the Legal Metrology baseline from the Rules page.</div> : <div className="mt-5 space-y-3">{compliance.results.map((result) => <div key={`${result.ruleId}-${result.ruleVersion}`} className="rounded-xl border border-line bg-paper p-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-ink">{result.ruleName}</p><span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyles(result.status)}`}>{statusIcon(result.status)} {result.status.replace('_', ' ')}</span></div><p className="mt-2 text-xs leading-5 text-muted">{result.message}</p>{result.detectedValue ? <p className="mt-1 text-[10px] text-muted">Detected: {result.detectedValue}</p> : null}{result.remediation ? <p className="mt-2 inline-flex items-start gap-1.5 rounded-lg bg-canvas px-2.5 py-1.5 text-[10px] leading-4 text-muted"><Wrench size={12} className="mt-0.5 shrink-0" />{result.remediation}</p> : null}</div><div className="shrink-0 text-right text-[10px] text-muted"><p>Rule v{result.ruleVersion}</p><p className="mt-1 max-w-[230px]">{result.reference}</p></div></div>{result.evidence.length > 0 ? <div className="mt-3 flex flex-wrap gap-2">{result.evidence.map((evidence, index) => <span key={`${result.ruleId}-evidence-${index}`} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-[10px] text-muted">{evidence.sourceImage ? `${evidence.sourceImage.filename} · ${evidence.sourceImage.label}` : 'Configured evidence'}{evidence.boundingBox ? ' · bounds' : ''}{evidence.excerpt ? ` · ${evidence.excerpt}` : ''}</span>)}</div> : null}</div>)}</div>}</div> : null}
  </section>
}

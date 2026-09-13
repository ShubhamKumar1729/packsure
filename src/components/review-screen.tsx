'use client'

/* Enforcement evidence uses native img so authenticated image endpoints and evidence overlays remain exact. */
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, Check, CircleAlert, Clock3, Gavel, LoaderCircle, MessageSquare, RotateCcw, ShieldAlert, ShieldCheck, Sparkles, UserCheck, X } from 'lucide-react'
import type { ComplianceStatus } from '@/lib/compliance/types'
import type { FinalDecision, ReviewFinding, ReviewSnapshot } from '@/lib/review/types'

function statusStyle(status: ComplianceStatus | FinalDecision | 'ACCEPTED' | 'REJECTED') {
  if (status === 'PASS' || status === 'COMPLIANT' || status === 'ACCEPTED') return 'bg-leaf text-moss'
  if (status === 'VIOLATION' || status === 'REJECTED') return 'bg-danger-soft text-danger'
  if (status === 'REVIEW_REQUIRED' || status === 'PENDING') return 'bg-amber-soft text-amber'
  return 'bg-[#efede7] text-muted'
}

function severityStyle(severity: ReviewFinding['severity']) {
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'bg-danger-soft text-danger'
  if (severity === 'MEDIUM') return 'bg-amber-soft text-amber'
  return 'bg-[#efede7] text-muted'
}

function formatStatus(value: string) {
  return value.replaceAll('_', ' ')
}

function askPia(inspectionId: string, findingId: string) {
  window.dispatchEvent(new CustomEvent('packsure-assistant-context', { detail: { context: { type: 'finding', id: findingId, inspectionId } } }))
  window.dispatchEvent(new Event('packsure-assistant-open'))
}

function EvidenceView({ inspectionId, finding }: { inspectionId: string; finding: ReviewFinding }) {
  if (finding.evidence.length === 0) return <div className="rounded-xl border border-dashed border-line bg-canvas px-4 py-6 text-center text-xs leading-5 text-muted">No source crop was returned. Review the full package image set manually.</div>
  return <div className="grid gap-3 sm:grid-cols-2">{finding.evidence.map((evidence, index) => evidence.sourceImage ? <div key={`${finding.id}-evidence-${index}`} className="overflow-hidden rounded-xl border border-line bg-ink"><div className="relative"><img src={`/api/inspections/${inspectionId}/images/${evidence.sourceImage.inspectionImageId}`} alt={`Evidence for ${finding.ruleName}`} className="block h-auto w-full" />{evidence.boundingBox ? <span className="pointer-events-none absolute border-2 border-amber bg-amber/10" style={{ left: `${evidence.boundingBox.x * 100}%`, top: `${evidence.boundingBox.y * 100}%`, width: `${evidence.boundingBox.width * 100}%`, height: `${evidence.boundingBox.height * 100}%` }} /> : null}</div><div className="flex items-center justify-between gap-2 bg-paper px-3 py-2.5"><span className="text-[10px] font-semibold capitalize text-ink">{evidence.sourceImage.label} · {evidence.sourceImage.source}</span><span className="text-[10px] text-muted">{evidence.boundingBox ? 'Evidence bounds' : 'Full image'}</span></div>{evidence.excerpt ? <p className="border-t border-line bg-paper px-3 pb-3 text-[11px] leading-5 text-muted">“{evidence.excerpt}”</p> : null}</div> : <div key={`${finding.id}-evidence-${index}`} className="rounded-xl border border-dashed border-line bg-canvas px-4 py-6 text-center text-xs text-muted">Evidence reference unavailable.</div>)}</div>
}

function FindingCard({ inspectionId, finding, onAction, busy }: { inspectionId: string; finding: ReviewFinding; onAction: (findingId: string, action: 'ACCEPT_FINDING' | 'REJECT_FINDING' | 'CORRECT_VALUE' | 'ADD_COMMENT', payload?: { correctedValue?: string; comment?: string }) => Promise<void>; busy: boolean }) {
  const [correctedValue, setCorrectedValue] = useState(finding.correctedValue ?? finding.detectedValue ?? '')
  const [comment, setComment] = useState(finding.comment ?? '')
  const [editingValue, setEditingValue] = useState(false)
  const [editingComment, setEditingComment] = useState(false)
  const displayedValue = finding.correctedValue ?? finding.detectedValue
  return <article className="overflow-hidden rounded-2xl border border-line bg-paper"><div className="border-b border-line bg-[#efede7] p-5"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${severityStyle(finding.severity)}`}>{finding.severity} severity</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusStyle(finding.humanDecision)}`}>Human: {formatStatus(finding.humanDecision)}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${statusStyle(finding.aiStatus)}`}>AI: {formatStatus(finding.aiStatus)}</span></div><h3 className="mt-3 text-base font-semibold tracking-[-0.02em] text-ink">{finding.ruleName}</h3><p className="mt-1 text-xs text-muted">Failed rule: {finding.ruleKey} · version {finding.ruleVersion}</p></div><div className="text-left lg:max-w-[310px] lg:text-right"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Rule reference</p><p className="mt-1 text-xs leading-5 text-ink">{finding.ruleReference}</p><button type="button" onClick={() => askPia(inspectionId, finding.id)} className="focus-ring mt-3 inline-flex items-center gap-1.5 rounded-lg border border-moss/20 bg-leaf px-2.5 py-1.5 text-[10px] font-semibold text-moss hover:bg-white"><Sparkles size={12} /> Ask Pia</button></div></div></div><div className="grid gap-5 p-5 lg:grid-cols-[0.78fr_1.22fr]"><div className="space-y-4"><div className="rounded-xl border border-line bg-canvas p-4"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Detected value</p><p className="mt-2 break-words text-sm font-semibold text-ink">{displayedValue || 'No value detected'}</p>{finding.correctedValue !== undefined ? <p className="mt-1 text-[10px] font-medium text-moss">Corrected by reviewer</p> : null}</div><span className="text-[11px] font-semibold text-moss">{Math.round(finding.confidence * 100)}% confidence</span></div>{editingValue ? <div className="mt-4 flex gap-2"><input value={correctedValue} onChange={(event) => setCorrectedValue(event.target.value)} className="focus-ring h-10 min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 text-sm text-ink outline-none focus:border-moss" /><button type="button" disabled={busy} onClick={() => { void onAction(finding.id, 'CORRECT_VALUE', { correctedValue }).then(() => setEditingValue(false)) }} className="focus-ring rounded-xl bg-moss px-3 text-xs font-semibold text-white disabled:opacity-60">Save</button></div> : <button type="button" onClick={() => setEditingValue(true)} className="focus-ring mt-4 inline-flex items-center gap-2 text-xs font-semibold text-moss hover:text-ink">Correct extracted value <RotateCcw size={13} /></button>}</div><div className="rounded-xl border border-line bg-paper p-4"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Expected requirement</p><p className="mt-2 text-sm leading-6 text-ink">{finding.expectedRequirement}</p></div><div><div className="flex items-center justify-between"><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Reviewer comment</p>{finding.comment ? <span className="text-[10px] text-moss">Saved</span> : null}</div>{editingComment ? <div className="mt-2 space-y-2"><textarea value={comment} onChange={(event) => setComment(event.target.value)} rows={3} placeholder="Explain the review decision" className="focus-ring w-full rounded-xl border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-moss" /><div className="flex gap-2"><button type="button" disabled={busy} onClick={() => { void onAction(finding.id, 'ADD_COMMENT', { comment }).then(() => setEditingComment(false)) }} className="focus-ring rounded-xl bg-moss px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">Save comment</button><button type="button" onClick={() => setEditingComment(false)} className="focus-ring rounded-xl border border-line px-3 py-2 text-xs font-semibold text-muted">Cancel</button></div></div> : <><p className="mt-2 text-xs leading-5 text-muted">{finding.comment || 'No reviewer comment added.'}</p><button type="button" onClick={() => setEditingComment(true)} className="focus-ring mt-3 inline-flex items-center gap-2 text-xs font-semibold text-moss hover:text-ink"><MessageSquare size={13} /> {finding.comment ? 'Edit comment' : 'Add comment'}</button></>}</div></div><div><p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Evidence image / crop</p><EvidenceView inspectionId={inspectionId} finding={finding} /></div></div><div className="flex flex-col justify-between gap-3 border-t border-line bg-[#fbfaf7] p-4 sm:flex-row sm:items-center"><p className="text-xs text-muted">{finding.reviewedAt ? `Reviewed ${new Date(finding.reviewedAt).toLocaleString()}` : 'Awaiting reviewer decision'}</p><div className="flex flex-wrap gap-2"><button type="button" disabled={busy || finding.humanDecision === 'ACCEPTED'} onClick={() => void onAction(finding.id, 'ACCEPT_FINDING')} className="focus-ring inline-flex items-center gap-2 rounded-xl border border-moss/20 bg-leaf px-3.5 py-2.5 text-xs font-semibold text-moss disabled:cursor-not-allowed disabled:opacity-50"><Check size={14} /> Accept finding</button><button type="button" disabled={busy || finding.humanDecision === 'REJECTED'} onClick={() => void onAction(finding.id, 'REJECT_FINDING')} className="focus-ring inline-flex items-center gap-2 rounded-xl border border-danger/20 bg-danger-soft px-3.5 py-2.5 text-xs font-semibold text-danger disabled:cursor-not-allowed disabled:opacity-50"><X size={14} /> Reject finding</button></div></div></article>
}

export function ReviewScreen({ inspectionId }: { inspectionId: string }) {
  const [snapshot, setSnapshot] = useState<ReviewSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [finalComment, setFinalComment] = useState('')

  const loadSnapshot = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(`/api/inspections/${inspectionId}/review`, { cache: 'no-store' })
      const data = (await response.json()) as ReviewSnapshot & { error?: string }
      if (!response.ok) throw new Error(data.error || 'The review workspace could not be loaded.')
      setSnapshot(data)
      setFinalComment(data.inspection.finalComment || '')
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The review workspace could not be loaded.')
    } finally {
      setLoading(false)
    }
  }, [inspectionId])

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadSnapshot() }, 0)
    return () => window.clearTimeout(timer)
  }, [loadSnapshot])

  const updateFinding = async (findingId: string, action: 'ACCEPT_FINDING' | 'REJECT_FINDING' | 'CORRECT_VALUE' | 'ADD_COMMENT', payload?: { correctedValue?: string; comment?: string }) => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/inspections/${inspectionId}/review`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ findingId, action, ...payload }) })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'The finding could not be updated.')
      await loadSnapshot()
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'The finding could not be updated.')
    } finally {
      setBusy(false)
    }
  }

  const setFinalDecision = async (decision: 'COMPLIANT' | 'VIOLATION') => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/inspections/${inspectionId}/review/final-decision`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision, comment: finalComment }) })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'The final decision could not be stored.')
      await loadSnapshot()
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'The final decision could not be stored.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-line bg-paper"><LoaderCircle size={24} className="animate-spin text-moss" /></div>
  if (!snapshot) return <div className="rounded-2xl border border-danger/20 bg-danger-soft p-6 text-sm text-danger">{error || 'The review workspace could not be loaded.'}</div>

  const pendingCount = snapshot.findings.filter((finding) => finding.humanDecision === 'PENDING').length
  const passCount = snapshot.compliance?.results.filter((result) => result.status === 'PASS').length || 0
  const violationCount = snapshot.compliance?.results.filter((result) => result.status === 'VIOLATION').length || 0
  const reviewCount = snapshot.compliance?.results.filter((result) => result.status === 'REVIEW_REQUIRED').length || 0

  return <div><Link href={`/app/inspections/${inspectionId}`} className="focus-ring inline-flex items-center gap-2 text-xs font-semibold text-muted transition hover:text-ink"><ArrowLeft size={14} /> Inspection detail</Link><div className="mt-5 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-amber" />Human review</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-ink">Review inspection findings</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-muted">Inspect the AI evidence, record your decision on every finding, then publish the final compliance decision.</p></div><span className="inline-flex items-center gap-2 self-start rounded-full border border-line bg-paper px-3 py-1.5 text-[11px] font-medium text-muted sm:self-auto"><UserCheck size={14} className="text-moss" /> Enforcement review workspace</span></div>{error ? <div role="alert" className="mt-6 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-xs leading-5 text-danger"><CircleAlert size={16} className="mt-0.5 shrink-0" />{error}</div> : null}<div className="mt-8 grid gap-5 lg:grid-cols-3"><section className="surface border-t-4 border-t-moss p-5 lg:col-span-2"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-leaf text-moss"><ShieldCheck size={17} /></span><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-moss">1 · AI assessment</p><p className="mt-1 text-sm font-semibold text-ink">Detection and rule evaluation</p></div></div>{snapshot.compliance ? <><div className="mt-6 flex flex-wrap items-end gap-x-10 gap-y-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">Compliance score</p><p className="mt-1 text-3xl font-semibold tracking-[-0.05em] text-ink">{snapshot.compliance.score === null ? '—' : `${snapshot.compliance.score}%`}</p><p className="mt-1 text-[11px] text-muted">{snapshot.compliance.score === null ? 'Pending human review' : 'Based on applicable rule results'}</p></div><div><p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">AI status</p><span className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(snapshot.compliance.status)}`}>{snapshot.compliance.status === 'PASS' ? <Check size={13} /> : <ShieldAlert size={13} />}{formatStatus(snapshot.compliance.status)}</span></div><div className="flex gap-2 text-[11px] text-muted"><span className="rounded-lg bg-leaf px-2 py-1 text-moss">{passCount} pass</span><span className="rounded-lg bg-danger-soft px-2 py-1 text-danger">{violationCount} violation</span><span className="rounded-lg bg-amber-soft px-2 py-1 text-amber">{reviewCount} review</span></div></div><div className="mt-5 flex items-start gap-2 rounded-xl border border-line bg-canvas px-4 py-3 text-xs leading-5 text-muted"><Gavel size={15} className="mt-0.5 shrink-0 text-moss" />This section reports machine detection and configured rule results only. It is not the final enforcement decision.</div></> : <div className="mt-5 rounded-xl border border-dashed border-line bg-canvas px-4 py-7 text-center text-xs leading-5 text-muted">No compliance evaluation is available yet. Run AI analysis and then the rule engine before reviewing findings.</div>}</section><section className="surface p-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Review status</p><p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-ink">{pendingCount} pending</p><p className="mt-1 text-xs leading-5 text-muted">{snapshot.findings.length === 0 ? 'No actionable findings were created.' : 'Every finding must be accepted or rejected before finalization.'}</p><div className="mt-5 h-px bg-line" /><p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">Current final decision</p><span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyle(snapshot.inspection.finalDecision)}`}>{formatStatus(snapshot.inspection.finalDecision)}</span></section></div><section className="mt-6 border-t-4 border-t-amber rounded-2xl bg-[#efede7] p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-amber-soft text-amber"><UserCheck size={17} /></span><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber">2 · Human review</p><p className="mt-1 text-sm font-semibold text-ink">Confirm, reject, or correct each finding</p></div></div>{snapshot.findings.length === 0 ? <div className="mt-5 rounded-xl border border-dashed border-line bg-paper px-5 py-8 text-center text-xs leading-5 text-muted">No violation or review-required findings are present for this compliance run.</div> : <div className="mt-5 space-y-4">{snapshot.findings.map((finding) => <FindingCard key={finding.id} inspectionId={inspectionId} finding={finding} onAction={updateFinding} busy={busy} />)}</div>}</section><section className="mt-6 border-t-4 border-t-danger rounded-2xl bg-[#244936] p-5 text-white sm:p-6"><div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start"><div className="flex items-start gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-amber"><Gavel size={17} /></span><div><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#b9e3c5]">3 · Final decision</p><p className="mt-1 text-sm font-semibold">Publish the human-reviewed outcome</p><p className="mt-2 max-w-xl text-xs leading-5 text-white/65">The final decision is recorded separately from AI assessment and every change is added to the audit log.</p></div></div><span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[10px] font-semibold capitalize text-white/75">{formatStatus(snapshot.inspection.finalDecision)}</span></div><div className="mt-6 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end"><label className="block"><span className="mb-2 block text-xs font-semibold text-white/80">Decision comment</span><textarea value={finalComment} onChange={(event) => setFinalComment(event.target.value)} rows={3} placeholder="State the basis for the final decision" className="focus-ring w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 focus:border-amber" /></label><div className="flex flex-wrap gap-2"><button type="button" disabled={busy || pendingCount > 0 || !snapshot.compliance} onClick={() => void setFinalDecision('COMPLIANT')} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-moss disabled:cursor-not-allowed disabled:opacity-40"><Check size={14} /> Mark compliant</button><button type="button" disabled={busy || pendingCount > 0 || !snapshot.compliance} onClick={() => void setFinalDecision('VIOLATION')} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-danger px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><ShieldAlert size={14} /> Mark violation</button></div></div>{pendingCount > 0 ? <p className="mt-4 text-xs text-amber-100">Resolve all {pendingCount} pending finding{pendingCount === 1 ? '' : 's'} before publishing a final decision.</p> : null}</section><section className="surface mt-6 p-5 sm:p-6"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#efede7] text-ink"><Clock3 size={17} /></span><div><p className="text-sm font-semibold text-ink">Audit trail</p><p className="mt-1 text-xs text-muted">Every finding and decision change is recorded with user and time.</p></div></div>{snapshot.auditLog.length === 0 ? <p className="mt-5 text-xs text-muted">No review changes recorded yet.</p> : <div className="mt-5 divide-y divide-line">{snapshot.auditLog.map((entry) => <div key={entry.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold text-ink">{formatStatus(entry.action)} · {entry.oldDecision} → {entry.newDecision}</p><p className="mt-1 text-[11px] text-muted">{entry.actorLabel || entry.actorUserId}{entry.comment ? ` · ${entry.comment}` : ''}</p></div><span className="shrink-0 text-[10px] text-muted">{new Date(entry.createdAt).toLocaleString()}</span></div>)}</div>}</section></div>
}

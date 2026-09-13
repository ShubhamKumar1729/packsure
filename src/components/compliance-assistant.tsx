'use client'

/* Evidence previews use authenticated image endpoints. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react'
import { Bot, ChevronDown, ExternalLink, LoaderCircle, MessageCircle, Minimize2, Send, ShieldAlert, Sparkles } from 'lucide-react'
import type { AssistantAnswer, AssistantContext } from '@/lib/assistant/types'

type Message = { id: string; question: string; answer?: AssistantAnswer; error?: string }

type ContextEvent = { context?: AssistantContext }

const suggestions = [
  { match: 'inspection', items: ['Why did this inspection fail?', 'Which finding is more serious?', 'Show the evidence.'] },
  { match: 'finding', items: ['Explain this violation.', 'Which rule caused this result?', 'Show the evidence.'] },
  { match: 'product', items: ['What happened in the previous inspection?', 'Which finding is more serious?', 'Show the evidence.'] },
  { match: 'report', items: ['Why did this inspection fail?', 'Which rule caused this result?', 'Show the evidence.'] },
]

function contextLabel(context: AssistantContext | null) {
  if (!context) return 'No compliance record selected'
  return context.type === 'finding' ? `Finding ${context.id}` : `${context.type.charAt(0).toUpperCase()}${context.type.slice(1)} ${context.id}`
}

function currentSuggestions(context: AssistantContext | null) {
  return suggestions.find((item) => item.match === context?.type)?.items || []
}

function EvidenceCard({ evidence }: { evidence: AssistantAnswer['evidence'][number] }) {
  if (!evidence.imageUrl) return <div className="rounded-lg border border-dashed border-line px-3 py-2 text-[10px] text-muted">{evidence.label}</div>
  return <a href={evidence.imageUrl} target="_blank" rel="noreferrer" className="group flex items-center gap-2 overflow-hidden rounded-lg border border-line bg-canvas p-2 transition hover:border-moss/40"><img src={evidence.imageUrl} alt={evidence.label} className="h-12 w-12 shrink-0 rounded-md object-cover" /><span className="min-w-0"><span className="block truncate text-[10px] font-semibold text-ink">{evidence.label}</span><span className="mt-0.5 block truncate text-[10px] text-muted">{evidence.source === 'finding_evidence' ? 'Finding-linked evidence' : 'Stored package image'}</span></span><ExternalLink size={12} className="ml-auto shrink-0 text-muted group-hover:text-moss" /></a>
}

export function ComplianceAssistant({ baseContext }: { baseContext: AssistantContext | null }) {
  const [context, setContext] = useState<AssistantContext | null>(baseContext)
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setContext(baseContext)
  }, [baseContext])

  useEffect(() => {
    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<ContextEvent>).detail
      if (detail?.context) {
        setContext(detail.context)
        setOpen(true)
      }
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('packsure-assistant-context', onContext)
    window.addEventListener('packsure-assistant-open', onOpen)
    return () => {
      window.removeEventListener('packsure-assistant-context', onContext)
      window.removeEventListener('packsure-assistant-open', onOpen)
    }
  }, [])

  const asks = useMemo(() => currentSuggestions(context), [context])

  const ask = async (value = question) => {
    const trimmed = value.trim()
    if (!trimmed || !context || loading) return
    setQuestion('')
    setLoading(true)
    const id = `${Date.now()}-${messages.length}`
    try {
      const response = await fetch('/api/assistant', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: trimmed, context }) })
      const data = await response.json() as { answer?: AssistantAnswer; error?: string }
      if (!response.ok || !data.answer) throw new Error(data.error || 'The assistant could not answer from the current records.')
      setMessages((current) => [...current, { id, question: trimmed, answer: data.answer }].slice(-6))
    } catch (error) {
      setMessages((current) => [...current, { id, question: trimmed, error: error instanceof Error ? error.message : 'The assistant could not answer from the current records.' }].slice(-6))
    } finally {
      setLoading(false)
    }
  }

  return <div className="fixed bottom-5 right-5 z-40 sm:bottom-7 sm:right-7">{open ? <section className="mb-3 flex w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_18px_50px_rgba(32,37,33,0.18)]"><header className="flex items-start justify-between gap-3 bg-[#244936] p-4 text-white"><div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10 text-amber"><Sparkles size={17} /></span><div><p className="text-sm font-semibold">Compliance AI</p><p className="mt-1 text-[10px] text-white/65">Context: {contextLabel(context)}</p></div></div><button type="button" onClick={() => setOpen(false)} className="focus-ring rounded-lg p-1.5 text-white/65 hover:bg-white/10 hover:text-white" aria-label="Minimize Compliance AI"><Minimize2 size={15} /></button></header><div className="max-h-[min(560px,65vh)] space-y-4 overflow-y-auto p-4">{!context ? <div className="rounded-xl border border-dashed border-line bg-canvas px-4 py-6 text-center"><ShieldAlert size={21} className="mx-auto text-muted" /><p className="mt-3 text-xs font-semibold text-ink">Open a compliance record to begin.</p><p className="mt-2 text-[11px] leading-5 text-muted">This assistant answers from the current inspection, finding, product history, evidence, rules, or report. It is not a general FAQ bot.</p></div> : messages.length === 0 ? <div><div className="rounded-xl border border-line bg-canvas px-4 py-4"><p className="text-xs font-semibold text-ink">Ask about this record</p><p className="mt-1 text-[11px] leading-5 text-muted">The server will retrieve authorized records before the assistant responds.</p></div><div className="mt-3 flex flex-wrap gap-2">{asks.map((item) => <button key={item} type="button" onClick={() => void ask(item)} className="focus-ring rounded-full border border-line bg-paper px-2.5 py-1.5 text-left text-[10px] font-semibold text-moss transition hover:border-moss/30 hover:bg-leaf">{item}</button>)}</div></div> : messages.map((message) => <div key={message.id} className="space-y-2"><div className="rounded-xl bg-[#efede7] px-3 py-2.5 text-xs font-medium text-ink">{message.question}</div>{message.error ? <div className="rounded-xl border border-danger/20 bg-danger-soft px-3 py-2.5 text-[11px] leading-5 text-danger">{message.error}</div> : message.answer ? <div className="rounded-xl border border-line bg-canvas p-3"><div className="flex items-center justify-between gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-amber-soft px-2 py-1 text-[9px] font-semibold text-amber"><Bot size={11} /> AI assessment</span><span className="text-[9px] text-muted">{message.answer.provider}</span></div><p className="mt-3 whitespace-pre-wrap text-[11px] leading-5 text-ink">{message.answer.text}</p>{message.answer.evidence.length > 0 ? <div className="mt-3 border-t border-line pt-3"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">Evidence available</p><div className="mt-2 space-y-2">{message.answer.evidence.slice(0, 4).map((evidence) => <EvidenceCard key={evidence.id} evidence={evidence} />)}</div></div> : null}{message.answer.citations.length > 0 ? <div className="mt-3 border-t border-line pt-3"><p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">Record references</p><div className="mt-2 flex flex-wrap gap-1.5">{message.answer.citations.slice(0, 6).map((citation) => citation.href ? <a key={`${citation.type}-${citation.id}`} href={citation.href} className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-2 py-1 text-[9px] font-semibold text-moss hover:text-ink">{citation.label}<ExternalLink size={10} /></a> : <span key={`${citation.type}-${citation.id}`} className="rounded-full border border-line bg-paper px-2 py-1 text-[9px] font-semibold text-muted">{citation.label}</span>)}</div></div> : null}<p className="mt-3 border-t border-line pt-2 text-[9px] leading-4 text-muted">{message.answer.boundary}</p></div> : null}</div>)}{loading ? <div className="flex items-center gap-2 text-[11px] text-muted"><LoaderCircle size={14} className="animate-spin text-moss" /> Retrieving authorized records…</div> : null}</div>{context ? <form onSubmit={(event) => { event.preventDefault(); void ask() }} className="border-t border-line bg-[#fbfaf7] p-3"><div className="flex items-end gap-2"><textarea value={question} onChange={(event) => setQuestion(event.target.value)} rows={2} placeholder="Ask about this compliance record…" className="focus-ring min-h-[58px] min-w-0 flex-1 resize-none rounded-xl border border-line bg-paper px-3 py-2.5 text-xs text-ink outline-none placeholder:text-[#aaa79e] focus:border-moss" /><button type="submit" disabled={loading || !question.trim()} className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-moss text-white transition hover:bg-[#174a37] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Ask Compliance AI"><Send size={15} /></button></div></form> : null}</section> : null}<button type="button" onClick={() => setOpen((current) => !current)} className="focus-ring ml-auto flex items-center gap-2 rounded-full border border-line bg-[#244936] px-4 py-3 text-xs font-semibold text-white shadow-[0_8px_24px_rgba(32,37,33,0.2)] transition hover:-translate-y-0.5 hover:bg-[#174a37]" aria-label={open ? 'Close Compliance AI' : 'Open Compliance AI'}><span className="grid h-6 w-6 place-items-center rounded-full bg-amber text-ink"><MessageCircle size={14} /></span>Compliance AI<ChevronDown size={14} className={open ? 'rotate-180 transition' : 'transition'} /></button></div>
}

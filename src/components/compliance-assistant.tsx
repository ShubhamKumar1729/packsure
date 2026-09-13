'use client'

/* Evidence previews use authenticated image endpoints, not static assets. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Eraser, ExternalLink, Minimize2, Send, ShieldAlert, Sparkles } from 'lucide-react'
import { LauncherRing, RobotAvatar, ThinkingDots, type RobotState } from '@/components/robot-avatar'
import type { AssistantAnswer, AssistantContext, AssistantMessage } from '@/lib/assistant/types'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  answer?: AssistantAnswer
  error?: string
}

type ContextEvent = { context?: AssistantContext }

const WORKSPACE_CONTEXT: AssistantContext = { type: 'workspace' }
const HISTORY_TURNS = 10

const RECORD_SUGGESTIONS: Record<string, string[]> = {
  inspection: ['Why did this inspection fail?', 'Which finding is more serious?', 'Show me the evidence.', 'Which rule caused this result?'],
  finding: ['Explain this violation.', 'Which rule caused this result?', 'Show me the evidence.', 'How serious is this finding?'],
  product: ['What happened in the previous inspection?', 'Which finding is more serious?', 'Are there repeated violations?', 'Show me the evidence.'],
  report: ['Summarize this report.', 'Why did this inspection fail?', 'Which rule caused this result?', 'Who reviewed this and when?'],
  workspace: ['How does the inspection workflow work?', 'What does REVIEW_REQUIRED mean?', 'Who can publish a final decision?', 'How is MRP compared against a listing?'],
}

function newId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `m-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

/**
 * Value identity for a context. The route-derived context is a fresh object on every render, so
 * comparing it by reference would loop; comparing by key lets us react only to real navigations.
 */
function contextKey(context: AssistantContext | null) {
  if (!context) return 'workspace'
  return context.type === 'workspace' ? 'workspace' : `${context.type}:${context.id}`
}

function contextLabel(context: AssistantContext) {
  switch (context.type) {
    case 'inspection': return `Inspection ${context.id.slice(-6)}`
    case 'finding': return `Finding ${context.id.slice(-6)}`
    case 'product': return `Product ${context.id.slice(-6)}`
    case 'report': return `Report ${context.id.slice(-6)}`
    default: return 'General · whole platform'
  }
}

function robotState(loading: boolean, open: boolean, offline: boolean): RobotState {
  if (offline) return 'offline'
  if (loading) return 'thinking'
  return open ? 'speaking' : 'idle'
}

function EvidenceCard({ evidence }: { evidence: AssistantAnswer['evidence'][number] }) {
  if (!evidence.imageUrl) {
    return <div className="rounded-lg border border-dashed border-line px-3 py-2 text-[10px] text-muted">{evidence.label}</div>
  }
  return (
    <a href={evidence.imageUrl} target="_blank" rel="noreferrer" className="group flex items-center gap-2 overflow-hidden rounded-lg border border-line bg-canvas p-2 transition hover:border-moss/40">
      <img src={evidence.imageUrl} alt={evidence.label} className="h-12 w-12 shrink-0 rounded-md object-cover" />
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-semibold text-ink">{evidence.label}</span>
        <span className="mt-0.5 block truncate text-[10px] text-muted">{evidence.source === 'finding_evidence' ? 'Finding-linked evidence' : 'Stored package image'}</span>
      </span>
      <ExternalLink size={12} className="ml-auto shrink-0 text-muted group-hover:text-moss" />
    </a>
  )
}

function AssistantBubble({ message }: { message: ChatMessage }) {
  const answer = message.answer
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0"><RobotAvatar state={answer?.mode === 'offline' ? 'offline' : 'idle'} size={26} label="Assistant" /></span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-line bg-canvas p-3">
        {message.error ? (
          <div className="flex items-start gap-2 text-[11px] leading-5 text-danger"><ShieldAlert size={14} className="mt-0.5 shrink-0" />{message.error}</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-soft px-2 py-1 text-[9px] font-semibold text-amber"><Bot size={11} /> AI assessment</span>
              <span className="text-[9px] text-muted">{answer?.mode === 'model' ? `${answer.provider}${answer.model ? ` · ${answer.model}` : ''}` : 'offline responder'}</span>
            </div>
            <p className="mt-2.5 whitespace-pre-wrap text-[11.5px] leading-[1.65] text-ink">{message.content}</p>
            {answer && answer.evidence.length > 0 ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">Evidence</p>
                <div className="mt-2 space-y-2">{answer.evidence.slice(0, 4).map((item) => <EvidenceCard key={item.id} evidence={item} />)}</div>
              </div>
            ) : null}
            {answer && answer.citations.length > 0 ? (
              <div className="mt-3 border-t border-line pt-3">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">Record references</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {answer.citations.slice(0, 6).map((citation) => citation.href
                    ? <a key={`${citation.type}-${citation.id}`} href={citation.href} className="inline-flex items-center gap-1 rounded-full border border-line bg-paper px-2 py-1 text-[9px] font-semibold text-moss transition hover:text-ink">{citation.label}<ExternalLink size={10} /></a>
                    : <span key={`${citation.type}-${citation.id}`} className="rounded-full border border-line bg-paper px-2 py-1 text-[9px] font-semibold text-muted">{citation.label}</span>)}
                </div>
              </div>
            ) : null}
            {answer ? <p className="mt-3 border-t border-line pt-2 text-[9px] leading-4 text-muted">{answer.boundary}</p> : null}
          </>
        )}
      </div>
    </div>
  )
}

export function ComplianceAssistant({ baseContext }: { baseContext: AssistantContext | null }) {
  const [context, setContext] = useState<AssistantContext>(baseContext ?? WORKSPACE_CONTEXT)
  const [routeKey, setRouteKey] = useState(() => contextKey(baseContext))
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Navigating to a different record replaces the topic. Done during render (the documented way to
  // adjust state for a changed prop) rather than in an effect, so there is no extra render pass and
  // a pinned finding can never be silently kept while the route moved on.
  const key = contextKey(baseContext)
  if (key !== routeKey) {
    setRouteKey(key)
    setContext(baseContext ?? WORKSPACE_CONTEXT)
  }

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

  // Keep the newest reply in view as the conversation grows.
  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [loading, messages, open])

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 60)
  }, [open])

  const suggestions = useMemo(() => RECORD_SUGGESTIONS[context.type] || RECORD_SUGGESTIONS.workspace, [context.type])
  const offline = messages.some((message) => message.answer?.mode === 'offline')
  const notice = [...messages].reverse().find((message) => message.answer?.notice)?.answer?.notice

  const ask = useCallback(async (value = question) => {
    const trimmed = value.trim()
    if (!trimmed || loading) return

    // Only completed, successful turns are replayed; failed attempts are not fed back to the model.
    const history: AssistantMessage[] = messages
      .filter((message) => !message.error && message.content)
      .slice(-HISTORY_TURNS)
      .map((message) => ({ role: message.role, content: message.content }))

    setQuestion('')
    setMessages((current) => [...current, { id: newId(), role: 'user', content: trimmed }])
    setLoading(true)

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: trimmed, context, history }),
      })
      const data = await response.json() as { answer?: AssistantAnswer; error?: string }
      if (!response.ok || !data.answer) throw new Error(data.error || 'The assistant could not answer that.')
      const answer = data.answer
      setMessages((current) => [...current, { id: newId(), role: 'assistant', content: answer.text, answer }])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The assistant could not answer that.'
      setMessages((current) => [...current, { id: newId(), role: 'assistant', content: '', error: message }])
    } finally {
      setLoading(false)
    }
  }, [context, loading, messages, question])

  const clearConversation = () => {
    setMessages([])
    setQuestion('')
  }

  const state = robotState(loading, open, offline)

  return (
    <div className="fixed bottom-5 right-5 z-40 sm:bottom-7 sm:right-7">
      {open ? (
        <section className="mb-3 flex w-[min(420px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_18px_50px_rgba(32,37,33,0.2)]">
          <header className="flex items-start justify-between gap-3 bg-[#244936] p-4 text-white">
            <div className="flex min-w-0 items-start gap-3">
              <RobotAvatar state={state} size={38} />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Compliance AI</p>
                <p className="mt-1 truncate text-[10px] text-white/65">{contextLabel(context)}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {messages.length > 0 ? (
                <button type="button" onClick={clearConversation} className="focus-ring rounded-lg p-1.5 text-white/65 transition hover:bg-white/10 hover:text-white" aria-label="Clear conversation" title="Clear conversation"><Eraser size={15} /></button>
              ) : null}
              <button type="button" onClick={() => setOpen(false)} className="focus-ring rounded-lg p-1.5 text-white/65 transition hover:bg-white/10 hover:text-white" aria-label="Minimize Compliance AI"><Minimize2 size={15} /></button>
            </div>
          </header>

          {notice ? (
            <div className="flex items-start gap-2 border-b border-line bg-amber-soft px-4 py-2.5 text-[10px] leading-4 text-[#8a5a20]">
              <Sparkles size={13} className="mt-0.5 shrink-0" />
              <span>{notice}</span>
            </div>
          ) : null}

          <div ref={scrollRef} className="max-h-[min(560px,62vh)] min-h-[240px] space-y-4 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div>
                <div className="flex items-start gap-3 rounded-2xl border border-line bg-canvas p-4">
                  <RobotAvatar state="idle" size={34} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink">Hi, I know this whole platform.</p>
                    <p className="mt-1.5 text-[11px] leading-5 text-muted">
                      Ask me about the workflow, what any status means, who can do what, or how rules and findings behave.
                      {context.type === 'workspace' ? ' Open an inspection, product, or report and I can also read that record for you.' : ' I can also read the record you have open.'}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {suggestions.map((item) => (
                    <button key={item} type="button" onClick={() => void ask(item)} className="focus-ring rounded-full border border-line bg-paper px-2.5 py-1.5 text-left text-[10px] font-semibold text-moss transition hover:border-moss/30 hover:bg-leaf">{item}</button>
                  ))}
                </div>
              </div>
            ) : messages.map((message) => message.role === 'user'
              ? <div key={message.id} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#dfeee4] px-3 py-2.5 text-[11.5px] leading-5 font-medium text-[#1b3d2e]">{message.content}</div></div>
              : <AssistantBubble key={message.id} message={message} />)}

            {loading ? (
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0"><RobotAvatar state="thinking" size={26} label="Thinking" /></span>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-line bg-canvas px-3 py-2.5 text-[11px] text-muted">
                  <ThinkingDots /> Reading authorized records…
                </div>
              </div>
            ) : null}
          </div>

          <form onSubmit={(event) => { event.preventDefault(); void ask() }} className="border-t border-line bg-[#fbfaf7] p-3">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void ask()
                  }
                }}
                rows={2}
                placeholder="Ask me anything about PackSure…"
                aria-label="Message Compliance AI"
                className="focus-ring min-h-[58px] min-w-0 flex-1 resize-none rounded-xl border border-line bg-paper px-3 py-2.5 text-xs text-ink outline-none placeholder:text-[#aaa79e] focus:border-moss"
              />
              <button type="submit" disabled={loading || !question.trim()} className="focus-ring grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-moss text-white transition hover:bg-[#174a37] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Send message"><Send size={15} /></button>
            </div>
            <p className="mt-2 text-[9px] leading-4 text-muted">Enter to send · Shift + Enter for a new line. Answers are AI assessment and never change a review or final decision.</p>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="focus-ring group relative ml-auto grid h-[60px] w-[60px] place-items-center rounded-full border border-white/15 bg-[#244936] shadow-[0_10px_30px_rgba(32,37,33,0.32)] transition hover:-translate-y-0.5 hover:bg-[#174a37]"
        aria-label={open ? 'Close Compliance AI' : 'Open Compliance AI'}
        aria-expanded={open}
      >
        {!open && messages.length === 0 ? <LauncherRing /> : null}
        <RobotAvatar state={state} size={44} />
        {messages.length > 0 && !open ? <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-[#244936] bg-amber px-1 text-[9px] font-bold text-ink">{messages.length}</span> : null}
      </button>
    </div>
  )
}

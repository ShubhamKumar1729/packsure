'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, Cpu, Eraser, Minimize2, Send, ShieldAlert, Sparkles } from 'lucide-react'
import { LauncherRing, RobotAvatar, ThinkingDots, type RobotState } from '@/components/robot-avatar'
import { askAssistant, type AssistantReply } from '@/lib/assistant/agent'
import { runConfirmedOperation, type PendingOperation } from '@/lib/assistant/agent-tools'
import { contextKey, contextLabel, WORKSPACE_CONTEXT, type AssistantContext } from '@/lib/assistant/context'
import type { ProtocolMessage } from '@/lib/assistant/agent-protocol'

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  reply?: AssistantReply
  error?: string
  pending?: PendingOperation | null
  pendingResult?: { ok: boolean; message: string } | null
}

type ContextEvent = { context?: AssistantContext }

type LoadState =
  | { phase: 'idle' }
  | { phase: 'working'; stage: string; progress: number; detail: string }
  | { phase: 'ready'; device: string }
  | { phase: 'error'; error: string }

const SUGGESTIONS_BY_CONTEXT: Record<string, string[]> = {
  inspection: ['Why did this inspection fail?', 'What did the AI analysis find here?', 'Start a compliance run on this inspection', 'Take me to the review screen'],
  workspace: ['How does the inspection workflow work?', 'What does REVIEW_REQUIRED mean?', 'Who can publish a final decision?', 'Show me my inspections'],
}
const GENERAL_SUGGESTIONS = ['Hello! What can you do?', 'How does the inspection workflow work?', 'What does REVIEW_REQUIRED mean?', 'Who can publish a final decision?', 'Take me to the reports', 'Show me my inspections']

function newId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `m-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function robotState(loading: boolean, open: boolean): RobotState {
  if (loading) return 'thinking'
  return open ? 'speaking' : 'idle'
}

function PendingCard({ message, onConfirm, busy }: { message: ChatMessage; onConfirm: (message: ChatMessage) => void; busy: boolean }) {
  const pending = message.pending
  if (!pending) return null
  if (message.pendingResult) {
    return (
      <div className={`mt-2 rounded-lg border px-2.5 py-2 text-[10px] font-semibold ${message.pendingResult.ok ? 'border-moss/25 bg-leaf text-moss' : 'border-danger/25 bg-danger-soft text-danger'}`}>
        {message.pendingResult.message}
      </div>
    )
  }
  return (
    <div className="mt-2.5 rounded-lg border border-amber/40 bg-amber-soft p-2.5">
      <p className="text-[10px] font-semibold text-[#8a5a20]">{pending.label}</p>
      <p className="mt-1 text-[9px] leading-4 text-[#8a5a20]/80">This uses the same endpoint as the button in the app UI. Nothing runs until you confirm.</p>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={() => onConfirm(message)} className="focus-ring rounded-lg bg-moss px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:opacity-60">Confirm and run</button>
        <span className="rounded-lg border border-line bg-paper px-2.5 py-1.5 text-[10px] font-semibold text-muted">Dismiss</span>
      </div>
    </div>
  )
}

function AssistantBubble({ message, onConfirm, busy }: { message: ChatMessage; onConfirm: (message: ChatMessage) => void; busy: boolean }) {
  const reply = message.reply
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0"><RobotAvatar size={26} label="Assistant" /></span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-line bg-canvas p-3">
        {message.error ? (
          <div className="flex items-start gap-2 text-[11px] leading-5 text-danger"><ShieldAlert size={14} className="mt-0.5 shrink-0" />{message.error}</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-soft px-2 py-1 text-[9px] font-semibold text-amber"><Sparkles size={11} /> On-device AI</span>
              {reply ? <span className="inline-flex items-center gap-1 text-[9px] text-muted"><Cpu size={10} /> {reply.meta.device} · {reply.meta.millis} ms</span> : null}
            </div>
            <p className="mt-2.5 whitespace-pre-wrap text-[11.5px] leading-[1.65] text-ink">{message.content}</p>
            {message.pending ? <PendingCard message={message} onConfirm={onConfirm} busy={busy} /> : null}
            {reply && reply.navigations.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {reply.navigations.map((item) => (
                  <span key={item.href} className="inline-flex items-center gap-1 rounded-full border border-moss/25 bg-leaf px-2 py-1 text-[9px] font-semibold text-moss"><ArrowRight size={10} /> {item.label}</span>
                ))}
              </div>
            ) : null}
            {reply && reply.citations.length > 0 ? (
              <div className="mt-3 border-t border-line pt-2.5">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">Retrieved from platform docs</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {reply.citations.map((citation) => (
                    <span key={citation.title} className="rounded-full border border-line bg-paper px-2 py-1 text-[9px] font-semibold text-muted" title={`${citation.category} · score ${citation.score}`}>{citation.title}</span>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="mt-2.5 border-t border-line pt-2 text-[9px] leading-4 text-muted">Advisory only. I never change compliance results, review decisions, final decisions, or audit entries.</p>
          </>
        )}
      </div>
    </div>
  )
}

export function ComplianceAssistant({ baseContext }: { baseContext: AssistantContext | null }) {
  const router = useRouter()
  const [context, setContext] = useState<AssistantContext>(baseContext ?? WORKSPACE_CONTEXT)
  const [routeKey, setRouteKey] = useState(() => contextKey(baseContext))
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [load, setLoad] = useState<LoadState>({ phase: 'idle' })
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

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

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [loading, messages, open, load])

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 60)
  }, [open])

  const suggestions = useMemo(() => SUGGESTIONS_BY_CONTEXT[context.type] || GENERAL_SUGGESTIONS, [context.type])

  const ask = useCallback(async (value = question) => {
    const trimmed = value.trim()
    if (!trimmed || loading) return

    const history: ProtocolMessage[] = messages
      .filter((message) => !message.error && message.content)
      .slice(-8)
      .map((message) => ({ role: message.role, content: message.content }))

    setQuestion('')
    setMessages((current) => [...current, { id: newId(), role: 'user', content: trimmed }])
    setLoading(true)
    setLoad({ phase: 'working', stage: 'retrieval', progress: 0, detail: 'Searching platform documentation' })

    try {
      const reply = await askAssistant({
        question: trimmed,
        history,
        context,
        navigate: (href) => router.push(href),
        onProgress: (info) => setLoad({ phase: 'working', stage: info.stage, progress: info.progress, detail: info.detail }),
      })
      setLoad({ phase: 'ready', device: reply.meta.device })
      setMessages((current) => [...current, { id: newId(), role: 'assistant', content: reply.text, reply, pending: reply.pending }])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The assistant could not answer.'
      setLoad({ phase: 'error', error: message })
      setMessages((current) => [...current, {
        id: newId(),
        role: 'assistant',
        content: '',
        error: `I could not start my on-device model: ${message} The model downloads once from the open Hugging Face repository and is then cached in this browser; a blocked network or an offline machine stops that first download. Everything else in PackSure still works.`,
      }])
    } finally {
      setLoading(false)
    }
  }, [context, loading, messages, question, router])

  const confirmOperation = useCallback(async (message: ChatMessage) => {
    if (!message.pending || message.pendingResult) return
    setLoading(true)
    const result = await runConfirmedOperation(message.pending)
    setMessages((current) => current.map((item) => (item.id === message.id ? { ...item, pendingResult: result } : item)))
    setMessages((current) => [...current, {
      id: newId(),
      role: 'assistant',
      content: result.ok ? `${result.message} You can see the updated record on its page, or ask me to read the new results.` : result.message,
    }])
    setLoading(false)
  }, [])

  const clearConversation = () => {
    setMessages([])
    setQuestion('')
  }

  const state = robotState(loading, open)
  const working = load.phase === 'working'

  return (
    <div className="fixed bottom-5 right-5 z-40 sm:bottom-7 sm:right-7">
      {open ? (
        <section className="mb-3 flex w-[min(420px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_18px_50px_rgba(32,37,33,0.2)]">
          <header className="flex items-start justify-between gap-3 bg-[#244936] p-4 text-white">
            <div className="flex min-w-0 items-start gap-3">
              <RobotAvatar state={state} size={38} />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Compliance AI</p>
                <p className="mt-1 truncate text-[10px] text-white/65">{contextLabel(context)} · runs on this device</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {messages.length > 0 ? (
                <button type="button" onClick={clearConversation} className="focus-ring rounded-lg p-1.5 text-white/65 transition hover:bg-white/10 hover:text-white" aria-label="Clear conversation" title="Clear conversation"><Eraser size={15} /></button>
              ) : null}
              <button type="button" onClick={() => setOpen(false)} className="focus-ring rounded-lg p-1.5 text-white/65 transition hover:bg-white/10 hover:text-white" aria-label="Minimize Compliance AI"><Minimize2 size={15} /></button>
            </div>
          </header>

          {working ? (
            <div className="border-b border-line bg-amber-soft px-4 py-2.5">
              <div className="flex items-center justify-between gap-3 text-[10px] font-semibold text-[#8a5a20]">
                <span className="truncate">{load.detail}</span>
                {load.stage === 'model' || load.stage === 'retrieval' ? <span>{Math.round(load.progress)}%</span> : null}
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#8a5a20]/15">
                <div className="h-full rounded-full bg-amber transition-all" style={{ width: `${Math.max(4, Math.round(load.progress))}%` }} />
              </div>
              <p className="mt-1.5 text-[9px] leading-4 text-[#8a5a20]/80">One-time download of the open-source model; it is cached in this browser afterwards.</p>
            </div>
          ) : null}
          {load.phase === 'ready' ? (
            <div className="flex items-center gap-1.5 border-b border-line bg-leaf/60 px-4 py-1.5 text-[9px] font-semibold text-moss"><Cpu size={11} /> On-device model ready · {load.device === 'webgpu' ? 'WebGPU' : 'WebAssembly'} · no API key, no external AI service</div>
          ) : null}
          {load.phase === 'error' ? (
            <div className="flex items-start gap-2 border-b border-line bg-danger-soft px-4 py-2 text-[10px] leading-4 text-danger"><ShieldAlert size={13} className="mt-0.5 shrink-0" /><span>{load.error}</span></div>
          ) : null}

          <div ref={scrollRef} className="max-h-[min(560px,62vh)] min-h-[240px] space-y-4 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div>
                <div className="flex items-start gap-3 rounded-2xl border border-line bg-canvas p-4">
                  <RobotAvatar state="idle" size={34} />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-ink">Hi, I am your on-device compliance guide.</p>
                    <p className="mt-1.5 text-[11px] leading-5 text-muted">
                      I run a small open-source language model right here in your browser — no API key, no external AI service, nothing to install.
                      I answer from PackSure&apos;s own documentation, can read your records, navigate for you, and start existing operations with your confirmation.
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
              : <AssistantBubble key={message.id} message={message} onConfirm={confirmOperation} busy={loading} />)}

            {loading ? (
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0"><RobotAvatar state="thinking" size={26} label="Thinking" /></span>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-line bg-canvas px-3 py-2.5 text-[11px] text-muted">
                  <ThinkingDots /> {working ? load.detail : 'Thinking'}
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
            <p className="mt-2 text-[9px] leading-4 text-muted">Enter to send · Shift + Enter for a new line. Answers are advisory and never change a review or final decision.</p>
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

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight, BookOpen, Eraser, Minimize2, Send, ShieldAlert, Sparkles } from 'lucide-react'
import { LauncherRing, RobotAvatar, ThinkingDots, type RobotState } from '@/components/robot-avatar'
import { contextKey, contextLabel, WORKSPACE_CONTEXT, type AssistantContext } from '@/lib/assistant/context'

type PiaCitation = { id: string; title: string; category: string; via: 'semantic' | 'lexical' }
type PendingOperation = { operation: string; inspectionId: string; label: string; endpoint: string; token: string }

type PiaReply = {
  text: string
  citations: PiaCitation[]
  navigations: { href: string; label: string }[]
  pending: PendingOperation | null
  model: string
  retrievalUsed: boolean
  toolTrace: string[]
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  reply?: PiaReply
  error?: string
  pendingResult?: { ok: boolean; message: string } | null
  confirmation?: { token: string; question: string; history: { role: 'user' | 'assistant'; content: string }[] } | null
}

type ContextEvent = { context?: AssistantContext }

const PIA_GREETING = 'Hey! 👋 I\'m Pia. How can I help you with PackSure today?'

const SUGGESTIONS = [
  'What can I do here?',
  'How does the inspection workflow work?',
  'Who can publish a final decision?',
  'Show me my inspections',
  'Take me to the reports',
]

function newId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `m-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function robotState(loading: boolean, open: boolean): RobotState {
  if (loading) return 'thinking'
  return open ? 'speaking' : 'idle'
}

function historyFrom(messages: ChatMessage[]) {
  return messages
    .filter((message) => !message.error && message.content)
    .slice(-8)
    .map((message) => ({ role: message.role, content: message.content }))
}

function ConfirmationCard({ message, busy, onResolve }: { message: ChatMessage; busy: boolean; onResolve: (message: ChatMessage, confirmed: boolean) => void }) {
  const pending = message.reply?.pending
  if (!pending) return null
  if (message.pendingResult) {
    return (
      <div className={`mt-2 rounded-lg border px-2 py-1.5 text-[9.5px] font-semibold ${message.pendingResult.ok ? 'border-moss/25 bg-leaf text-moss' : 'border-line bg-canvas text-muted'}`}>
        {message.pendingResult.message}
      </div>
    )
  }
  return (
    <div className="mt-2 rounded-lg border border-amber/40 bg-amber-soft p-2">
      <p className="text-[9.5px] font-semibold text-[#8a5a20]">{pending.label}</p>
      <p className="mt-0.5 text-[9px] leading-4 text-[#8a5a20]/80">Inspection …{pending.inspectionId.slice(-6)} · runs the same endpoint as the button in the app UI. Nothing happens until you confirm.</p>
      <div className="mt-2 flex gap-2">
        <button type="button" disabled={busy} onClick={() => onResolve(message, true)} className="focus-ring rounded-lg bg-moss px-2 py-1 text-[9.5px] font-semibold text-white disabled:opacity-60">Confirm</button>
        <button type="button" disabled={busy} onClick={() => onResolve(message, false)} className="focus-ring rounded-lg border border-line bg-paper px-2 py-1 text-[9.5px] font-semibold text-muted disabled:opacity-60">Cancel</button>
      </div>
    </div>
  )
}

function AssistantBubble({ message, busy, onResolve }: { message: ChatMessage; busy: boolean; onResolve: (message: ChatMessage, confirmed: boolean) => void }) {
  const reply = message.reply
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0"><RobotAvatar size={20} label="Pia" /></span>
      <div className="min-w-0 flex-1 rounded-2xl rounded-tl-sm border border-line bg-canvas p-2.5">
        {message.error ? (
          <div className="flex items-start gap-2 text-[10.5px] leading-[1.45] text-danger"><ShieldAlert size={12} className="mt-0.5 shrink-0" />{message.error}</div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-soft px-1.5 py-0.5 text-[9px] font-semibold text-amber"><Sparkles size={11} /> Pia · AI assistant</span>
              {reply?.retrievalUsed ? <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-moss"><BookOpen size={10} /> Using PackSure knowledge</span> : null}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-[11px] leading-[1.6] text-ink">{message.content}</p>
            {reply?.pending ? <ConfirmationCard message={message} busy={busy} onResolve={onResolve} /> : null}
            {reply && reply.navigations.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {reply.navigations.map((item) => (
                  <span key={item.href} className="inline-flex items-center gap-1 rounded-full border border-moss/25 bg-leaf px-1.5 py-0.5 text-[9px] font-semibold text-moss"><ArrowRight size={10} /> {item.label}</span>
                ))}
              </div>
            ) : null}
            {reply && reply.citations.length > 0 ? (
              <div className="mt-2.5 border-t border-line pt-2">
                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">Knowledge sources</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {reply.citations.map((citation) => (
                    <span key={citation.id} className="rounded-full border border-line bg-paper px-1.5 py-0.5 text-[9px] font-semibold text-muted" title={`${citation.category} · retrieved via ${citation.via} search`}>{citation.title}</span>
                  ))}
                </div>
              </div>
            ) : null}
            <p className="mt-2 border-t border-line pt-1.5 text-[9px] leading-4 text-muted">Advisory only. Pia never changes compliance results, review decisions, final decisions, or audit entries.</p>
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const key = contextKey(baseContext)
  if (key !== routeKey) {
    setRouteKey(key)
    setContext(baseContext ?? WORKSPACE_CONTEXT)
  }

  // Opening Pia (or clearing the chat) starts with a friendly greeting. Seeded from user events
  // (click / clear), never from an effect, so there is no cascading render.
  const seedGreeting = useCallback(() => {
    setMessages((current) => (current.length === 0 ? [{ id: newId(), role: 'assistant', content: PIA_GREETING }] : current))
  }, [])

  useEffect(() => {
    const onContext = (event: Event) => {
      const detail = (event as CustomEvent<ContextEvent>).detail
      if (detail?.context) {
        setContext(detail.context)
        setOpen(true)
        seedGreeting()
      }
    }
    const onOpen = () => {
      setOpen(true)
      seedGreeting()
    }
    window.addEventListener('packsure-assistant-context', onContext)
    window.addEventListener('packsure-assistant-open', onOpen)
    return () => {
      window.removeEventListener('packsure-assistant-context', onContext)
      window.removeEventListener('packsure-assistant-open', onOpen)
    }
  }, [seedGreeting])

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [loading, messages, open])

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 60)
  }, [open])


  const suggestions = useMemo(() => (context.type === 'workspace' ? SUGGESTIONS : ['Why did this inspection fail?', 'What did the AI analysis find here?', 'Run compliance checks on this inspection', ...SUGGESTIONS.slice(1, 4)]), [context.type])

  const ask = useCallback(async (value = question) => {
    const trimmed = value.trim()
    if (!trimmed || loading) return

    const history = historyFrom(messages)
    setQuestion('')
    setMessages((current) => [...current, { id: newId(), role: 'user', content: trimmed }])
    setLoading(true)

    try {
      const response = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: trimmed, history, context }),
      })
      const data = (await response.json()) as { reply?: PiaReply; error?: string }
      if (!response.ok || !data.reply) throw new Error(data.error || 'Pia could not answer that.')
      const reply = data.reply
      for (const navigation of reply.navigations) router.push(navigation.href)
      setMessages((current) => [...current, {
        id: newId(),
        role: 'assistant',
        content: reply.text,
        reply,
        confirmation: reply.pending ? { token: reply.pending.token, question: trimmed, history } : null,
      }])
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Pia could not answer that.'
      setMessages((current) => [...current, { id: newId(), role: 'assistant', content: '', error: message }])
    } finally {
      setLoading(false)
    }
  }, [context, loading, messages, question, router])

  const resolveConfirmation = useCallback(async (message: ChatMessage, confirmed: boolean) => {
    const confirmation = message.confirmation
    if (!confirmation || message.pendingResult) return
    setLoading(true)
    setMessages((current) => current.map((item) => (item.id === message.id ? { ...item, pendingResult: { ok: confirmed, message: confirmed ? 'Confirmed — running the operation…' : 'Cancelled — nothing ran.' } } : item)))
    try {
      const response = await fetch('/api/assistant/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: confirmation.token, confirmed, question: confirmation.question, history: confirmation.history, context }),
      })
      const data = (await response.json()) as { reply?: PiaReply; error?: string }
      if (!response.ok || !data.reply) throw new Error(data.error || 'The operation result could not be explained.')
      const reply = data.reply
      setMessages((current) => current.map((item) => (item.id === message.id ? { ...item, pendingResult: { ok: confirmed, message: confirmed ? 'Confirmed — operation finished.' : 'Cancelled — nothing ran.' } } : item)))
      setMessages((current) => [...current, { id: newId(), role: 'assistant', content: reply.text, reply }])
    } catch (error) {
      const text = error instanceof Error ? error.message : 'The operation result could not be explained.'
      setMessages((current) => [...current, { id: newId(), role: 'assistant', content: '', error: text }])
    } finally {
      setLoading(false)
    }
  }, [context])

  const clearConversation = () => {
    setMessages([{ id: newId(), role: 'assistant', content: PIA_GREETING }])
    setQuestion('')
  }

  const state = robotState(loading, open)

  return (
    <div className="fixed bottom-5 right-5 z-40 sm:bottom-7 sm:right-7">
      {open ? (
        <section className="mb-3 flex w-[min(315px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-2xl border border-line bg-paper shadow-[0_18px_50px_rgba(32,37,33,0.2)]">
          <header className="flex items-start justify-between gap-3 bg-[#244936] p-3 text-white">
            <div className="flex min-w-0 items-start gap-2.5">
              <RobotAvatar state={state} size={28} />
              <div className="min-w-0">
                <p className="text-xs font-semibold">Pia</p>
                <p className="mt-0.5 truncate text-[9px] text-white/65">PackSure assistant · {contextLabel(context)}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              {messages.length > 0 ? (
                <button type="button" onClick={clearConversation} className="focus-ring rounded-lg p-1 text-white/65 transition hover:bg-white/10 hover:text-white" aria-label="Clear conversation" title="Clear conversation"><Eraser size={13} /></button>
              ) : null}
              <button type="button" onClick={() => setOpen(false)} className="focus-ring rounded-lg p-1 text-white/65 transition hover:bg-white/10 hover:text-white" aria-label="Minimize Pia"><Minimize2 size={13} /></button>
            </div>
          </header>

          <div ref={scrollRef} className="max-h-[min(378px,41vh)] min-h-[162px] space-y-3 overflow-y-auto p-3">
            {messages.map((message) => message.role === 'user'
              ? <div key={message.id} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#dfeee4] px-2.5 py-2 text-[11px] leading-[1.45] font-medium text-[#1b3d2e]">{message.content}</div></div>
              : <AssistantBubble key={message.id} message={message} busy={loading} onResolve={resolveConfirmation} />)}

            {messages.length <= 1 && !loading ? (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((item) => (
                  <button key={item} type="button" onClick={() => void ask(item)} className="focus-ring rounded-full border border-line bg-paper px-2 py-1 text-left text-[9.5px] font-semibold text-moss transition hover:border-moss/30 hover:bg-leaf">{item}</button>
                ))}
              </div>
            ) : null}

            {loading ? (
              <div className="flex items-start gap-2">
                <span className="mt-0.5 shrink-0"><RobotAvatar state="thinking" size={20} label="Pia is thinking" /></span>
                <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-line bg-canvas px-2.5 py-2 text-[10.5px] text-muted">
                  <ThinkingDots /> Pia is thinking…
                </div>
              </div>
            ) : null}
          </div>

          <form onSubmit={(event) => { event.preventDefault(); void ask() }} className="border-t border-line bg-[#fbfaf7] p-2.5">
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
                placeholder="Message Pia…"
                aria-label="Message Pia"
                className="focus-ring min-h-[44px] min-w-0 flex-1 resize-none rounded-xl border border-line bg-paper px-2.5 py-2 text-[11px] text-ink outline-none placeholder:text-[#aaa79e] focus:border-moss"
              />
              <button type="submit" disabled={loading || !question.trim()} className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-moss text-white transition hover:bg-[#174a37] disabled:cursor-not-allowed disabled:opacity-50" aria-label="Send message"><Send size={13} /></button>
            </div>
            <p className="mt-1.5 text-[9px] leading-4 text-muted">Enter to send · Shift + Enter for a new line. Pia&apos;s answers are advisory and never change a review or final decision.</p>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) seedGreeting()
        }}
        className="focus-ring group relative ml-auto grid h-[60px] w-[60px] place-items-center rounded-full border border-white/15 bg-[#244936] shadow-[0_10px_30px_rgba(32,37,33,0.32)] transition hover:-translate-y-0.5 hover:bg-[#174a37]"
        aria-label={open ? 'Close Pia' : 'Open Pia'}
        aria-expanded={open}
      >
        {!open && messages.length === 0 ? <LauncherRing /> : null}
        <RobotAvatar state={state} size={44} />
        {messages.length > 0 && !open ? <span className="absolute -right-0.5 -top-0.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-[#244936] bg-amber px-1 text-[9px] font-bold text-ink">{messages.length}</span> : null}
      </button>
    </div>
  )
}

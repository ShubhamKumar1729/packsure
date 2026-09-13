/**
 * Pia: the PackSure assistant orchestrator.
 *
 *   user message -> retrieve PackSure knowledge (RAG) -> Groq (server-side, with tool schemas)
 *                -> Groq decides: answer directly, or call a PackSure tool
 *                -> tool executes against the existing PackSure APIs
 *                -> tool result returns to Groq -> natural-language final response
 *
 * State-changing operations stop the loop and come back to the client as a confirmation card; the
 * confirm endpoint executes them and asks Groq to explain the result.
 */

import { describeContext, type AssistantContext } from '@/lib/assistant/context'
import { groqChat, groqModel, GroqError, type GroqMessage } from '@/lib/assistant/groq'
import { retrieveKnowledge, type RetrievedDoc } from '@/lib/assistant/retrieval'
import { executePiaTool, PIA_TOOLS, runConfirmedOperation, type ToolContext } from '@/lib/assistant/tools-server'
import type { PendingOperation } from '@/lib/assistant/confirm-token'

export type PiaCitation = { id: string; title: string; category: string; via: 'semantic' | 'lexical' }

export type PiaReply = {
  text: string
  citations: PiaCitation[]
  navigations: { href: string; label: string }[]
  pending: PendingOperation | null
  model: string
  retrievalUsed: boolean
  toolTrace: string[]
}

export type PiaHistoryTurn = { role: 'user' | 'assistant'; content: string }

const MAX_TOOL_ROUNDS = 4
const HISTORY_TURNS = 8
const HISTORY_CHARS = 6000

const PERSONA = `You are Pia, the friendly, professional AI assistant built into PackSure, an evidence-first compliance workspace for packaged commodity inspections.
You help with normal conversation as naturally as with work: greet users warmly when greeted, accept thanks graciously, reassure confused users, and answer small talk briefly and kindly.
For PackSure questions you answer from the retrieved documentation below and from tool results. Keep replies concise and natural: two to six sentences, or a short list when enumerating records or steps.`

const GROUNDING = `Grounding rules, in order of importance:
1. Use the retrieved PackSure documentation and tool results as your source of truth.
2. If the documentation does not cover a capability, say plainly that PackSure does not implement it. Never invent features, pages, buttons, settings, ids, or numbers.
3. Never guess record ids: call list_documents or list_reports to retrieve them first.
4. You are advisory. You never change compliance results, human review decisions, final decisions, or audit entries, and review/final-decision actions are human-only in the UI.
5. Call at most one tool per reply, and only when it genuinely helps. Simple conversation, greetings, thanks, and explanations need no tool.`

function buildSystemPrompt(retrieved: RetrievedDoc[], context: AssistantContext): string {
  const docs = retrieved.length > 0
    ? retrieved.map((result, index) => `[${index + 1}] (${result.doc.category}) ${result.doc.title}\n${result.doc.text}`).join('\n\n')
    : '(No documentation matched this question. Answer conversationally if it is small talk; otherwise say the capability is not documented and likely not implemented, or ask a clarifying question.)'
  const focus = describeContext(context)
  return `${PERSONA}

${GROUNDING}

Retrieved PackSure documentation for this question:
${docs}
${focus ? `\nContext hint: ${focus} Use it to resolve words like "this inspection" or "it", and prefer it when choosing an inspectionId.\n` : ''}
When you need live PackSure data or an action, use the provided tools. For start_operation the platform shows the user a confirmation card; ask for it naturally and wait — never claim the operation already ran.`
}

export function sanitizeHistory(value: unknown): PiaHistoryTurn[] {
  if (!Array.isArray(value)) return []
  const turns: PiaHistoryTurn[] = []
  for (const turn of value.slice(-40)) {
    if (!turn || typeof turn !== 'object') continue
    const candidate = turn as { role?: unknown; content?: unknown }
    if (candidate.role !== 'user' && candidate.role !== 'assistant') continue
    if (typeof candidate.content !== 'string' || !candidate.content.trim()) continue
    turns.push({ role: candidate.role, content: candidate.content.slice(0, 2000) })
  }
  const recent = turns.slice(-HISTORY_TURNS)
  let budget = HISTORY_CHARS
  const kept: PiaHistoryTurn[] = []
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const cost = Math.min(recent[index].content.length, 2000)
    if (budget - cost < 0 && kept.length > 0) break
    kept.unshift(recent[index])
    budget -= cost
  }
  return kept
}

function parseArguments(raw: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(raw) as unknown
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export type PiaTurnInput = {
  question: string
  history: PiaHistoryTurn[]
  context: AssistantContext
  toolContext: ToolContext
}

/** One user turn: retrieval, Groq reasoning with tools, tool execution, grounded final answer. */
export async function piaTurn(input: PiaTurnInput): Promise<PiaReply> {
  const { docs, selectorUsed } = await retrieveKnowledge(input.question)
  const messages: GroqMessage[] = [
    { role: 'system', content: buildSystemPrompt(docs, input.context) },
    ...input.history.map((turn) => ({ role: turn.role, content: turn.content } as GroqMessage)),
    { role: 'user', content: input.question },
  ]

  const navigations: { href: string; label: string }[] = []
  const toolTrace: string[] = []

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    const reply = await groqChat(messages, { tools: PIA_TOOLS })
    const call = reply.tool_calls?.[0]

    if (!call) {
      const text = (reply.content || '').trim()
      return {
        text: text || 'I lost my train of thought — could you ask that again?',
        citations: docs.map((result) => ({ id: result.doc.id, title: result.doc.title, category: result.doc.category, via: result.via })),
        navigations,
        pending: null,
        model: groqModel(),
        retrievalUsed: selectorUsed && docs.length > 0,
        toolTrace,
      }
    }

    const args = parseArguments(call.function.arguments || '{}')
    if (!args) {
      toolTrace.push(`${call.function.name}: invalid arguments`)
      messages.push({ role: 'assistant', content: reply.content, tool_calls: [call] })
      messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: 'The tool call arguments were not valid JSON. Re-emit the call with correct arguments, or answer without a tool.' })
      continue
    }

    toolTrace.push(call.function.name)
    const outcome = await executePiaTool(call.function.name, args, input.toolContext)

    if (outcome.kind === 'pending') {
      const provisional = (reply.content || '').trim() || outcome.provisional
      return {
        text: provisional,
        citations: docs.map((result) => ({ id: result.doc.id, title: result.doc.title, category: result.doc.category, via: result.via })),
        navigations,
        pending: outcome.pending,
        model: groqModel(),
        retrievalUsed: selectorUsed && docs.length > 0,
        toolTrace,
      }
    }

    navigations.push(...outcome.navigations)
    messages.push({ role: 'assistant', content: reply.content, tool_calls: [call] })
    messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: outcome.toolResult })
  }

  // The model kept calling tools beyond the budget: ask once for a plain answer.
  const finalReply = await groqChat([...messages, { role: 'user', content: 'Summarize now in plain prose for the user, without further tool calls.' }], { maxTokens: 400 })
  return {
    text: (finalReply.content || '').trim() || 'I gathered the information but could not summarize it — please try again.',
    citations: docs.map((result) => ({ id: result.doc.id, title: result.doc.title, category: result.doc.category, via: result.via })),
    navigations,
    pending: null,
    model: groqModel(),
    retrievalUsed: selectorUsed && docs.length > 0,
    toolTrace,
  }
}

/** After the user confirms or cancels an operation, Groq explains the outcome in plain language. */
export async function piaExplainOutcome(input: {
  question: string
  history: PiaHistoryTurn[]
  context: AssistantContext
  toolContext: ToolContext
  pending: PendingOperation
  confirmed: boolean
}): Promise<PiaReply> {
  const outcome = input.confirmed
    ? await runConfirmedOperation(input.pending, input.toolContext)
    : { ok: false, summary: 'The user cancelled the operation in the confirmation card. Nothing ran.' }

  const messages: GroqMessage[] = [
    { role: 'system', content: `${PERSONA}\n\n${GROUNDING}\n\nThe user previously asked for an operation. It has now ${input.confirmed ? (outcome.ok ? 'completed' : 'failed') : 'been cancelled by the user'}. Explain the outcome naturally and briefly, and suggest a sensible next step.` },
    ...input.history.map((turn) => ({ role: turn.role, content: turn.content } as GroqMessage)),
    { role: 'user', content: input.question },
    { role: 'assistant', content: `I can ${input.pending.label.toLowerCase()} for inspection ${input.pending.inspectionId.slice(-6)}. Shall I proceed?` },
    { role: 'tool', tool_call_id: 'confirmation', name: 'start_operation', content: outcome.summary },
  ]

  const reply = await groqChat(messages, { maxTokens: 400 })
  return {
    text: (reply.content || '').trim() || outcome.summary,
    citations: [],
    navigations: [],
    pending: null,
    model: groqModel(),
    retrievalUsed: false,
    toolTrace: ['start_operation:confirmed'],
  }
}

export function friendlyGroqError(error: unknown): string {
  if (error instanceof GroqError) return error.friendly
  if (error instanceof Error) return `Pia hit an unexpected error: ${error.message}`
  return 'Pia hit an unexpected error.'
}

/**
 * Pure conversation protocol for the on-device assistant: prompt construction, tool specification,
 * tool-call parsing, and history budgeting. Kept free of DOM, network, and model imports so it can
 * be unit-tested in plain Node and reused by any future backend.
 *
 * The language model — not keyword matching — decides whether a tool is appropriate. These helpers
 * only describe the tools and interpret what the model emits.
 */

import { KNOWLEDGE_CATEGORIES } from '@/lib/assistant/knowledge'

export type AssistantToolName =
  | 'navigate_to'
  | 'open_record'
  | 'list_documents'
  | 'list_reports'
  | 'get_analysis'
  | 'get_listing_comparison'
  | 'start_operation'

export type ToolSpec = {
  name: AssistantToolName
  description: string
  args: string
  /** Read tools run immediately; navigation runs immediately; operations require user confirmation. */
  kind: 'read' | 'navigate' | 'operation'
}

export const TOOL_SPECS: ToolSpec[] = [
  { name: 'navigate_to', kind: 'navigate', description: 'Navigate the user to a top-level section of PackSure. Use when the user asks to go somewhere or open a page.', args: '{"section": "dashboard"|"new-inspection"|"inspections"|"products"|"reports"|"rules"}' },
  { name: 'open_record', kind: 'navigate', description: 'Open one specific record the user identified by id. Use only when an id is known from context or a previous tool result.', args: '{"type": "inspection"|"product"|"report", "id": "<mongo id>"}' },
  { name: 'list_documents', kind: 'read', description: 'Retrieve the user\'s stored documents: their inspections and products, with statuses. Use for "my inspections", "what documents do I have", "which products".', args: '{}' },
  { name: 'list_reports', kind: 'read', description: 'Retrieve the stored compliance reports the user can see. Use for questions about reports or downloads.', args: '{}' },
  { name: 'get_analysis', kind: 'read', description: 'Retrieve the stored AI analysis and compliance result of one inspection. Use for "what did the AI find", "analysis results", "compliance result" about a known inspection id.', args: '{"inspectionId": "<mongo id>"}' },
  { name: 'get_listing_comparison', kind: 'read', description: 'Retrieve the stored online listing / MRP comparison of one inspection.', args: '{"inspectionId": "<mongo id>"}' },
  { name: 'start_operation', kind: 'operation', description: 'Offer to start an operation that already exists in PackSure. Never use for review decisions or final decisions, which are human-only. The user must confirm before anything runs.', args: '{"operation": "analyze"|"run_compliance"|"listing_comparison"|"generate_report", "inspectionId": "<mongo id>"}' },
]

export const NAV_SECTIONS: Record<string, { href: string; label: string }> = {
  dashboard: { href: '/app', label: 'Dashboard' },
  'new-inspection': { href: '/app/new-inspection', label: 'New inspection' },
  inspections: { href: '/app/inspections', label: 'Inspections' },
  products: { href: '/app/products', label: 'Products' },
  reports: { href: '/app/reports', label: 'Reports' },
  rules: { href: '/app/rules', label: 'Rules' },
}

export const OPERATION_LABELS: Record<string, string> = {
  analyze: 'Run AI analysis on the stored images',
  run_compliance: 'Evaluate the enabled compliance rules',
  listing_comparison: 'Compare the declared price with the online listing',
  generate_report: 'Generate a compliance report snapshot',
}

const PERSONA = `You are the Compliance AI assistant inside PackSure, an evidence-first compliance workspace for packaged commodity inspections.
Personality: warm, friendly, and professional. Greet users naturally when they greet you, accept thanks graciously, and reassure confused users before guiding them. Keep replies concise: two to six sentences for normal questions, a short list only when enumerating steps or records.
You run entirely on the user's own device and you read only records their role allows.`

const GROUNDING = `Grounding rules, in order of importance:
1. Answer from the retrieved PackSure documentation quoted below and from tool results. Prefer them over anything you might assume.
2. If the documentation does not cover a capability, say plainly that PackSure does not implement it. Never invent features, pages, buttons, settings, or numbers.
3. Never guess record ids. Use a tool to retrieve them first.
4. Your answers are advisory. You never change a compliance result, a human review decision, a final decision, or the audit log, and you must say so if asked whether you can.
5. For small talk, greetings, thanks, or feelings, respond naturally and briefly without tools.`

export function buildSystemPrompt(retrieved: { title: string; category: string; text: string }[]): string {
  const tools = TOOL_SPECS.map((tool) => `- ${tool.name} ${tool.args}\n  ${tool.description}`).join('\n')
  const docs = retrieved.length > 0
    ? retrieved.map((doc, index) => `[${index + 1}] (${doc.category}) ${doc.title}\n${doc.text}`).join('\n\n')
    : '(No document matched closely. Rely on your general knowledge of PackSure only if absolutely certain, otherwise say the feature is not implemented or that you do not know.)'
  return `${PERSONA}

${GROUNDING}

PackSure documentation retrieved for this question:
${docs}

Platform tools you may call. Call at most one tool per reply, and only when it genuinely helps:
${tools}

Reply format:
- Normal answer: plain prose only, no JSON.
- Tool call: emit exactly one line, nothing else: TOOL {"name": "<tool>", "args": { ... }}
Knowledge areas covered by the documentation corpus: ${KNOWLEDGE_CATEGORIES.map((category) => category.label).join(', ')}.`
}

export type ProtocolMessage = { role: 'user' | 'assistant'; content: string }

const HISTORY_TURNS = 6
const HISTORY_CHARS = 2400

/** Keeps the conversation inside the small model's context window while preserving recency. */
export function trimHistory(history: ProtocolMessage[]): ProtocolMessage[] {
  const clean = history.filter((turn) => (turn.role === 'user' || turn.role === 'assistant') && typeof turn.content === 'string' && turn.content.trim())
  const recent = clean.slice(-HISTORY_TURNS)
  let budget = HISTORY_CHARS
  const kept: ProtocolMessage[] = []
  for (let index = recent.length - 1; index >= 0; index -= 1) {
    const turn = recent[index]
    const cost = turn.content.length
    if (budget - cost < 0 && kept.length > 0) break
    kept.unshift({ role: turn.role, content: cost > 900 ? `${turn.content.slice(0, 900)}…` : turn.content })
    budget -= Math.min(cost, 900)
  }
  return kept
}

export type ParsedReply =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; name: AssistantToolName; args: Record<string, unknown> }

const TOOL_LINE = /^\s*TOOL\s*(\{[\s\S]*\})\s*$/

/**
 * Interprets one model reply. Accepts the documented `TOOL {...}` line, and tolerates a bare JSON
 * object with a known tool name, so a slightly off-format model still works. Anything else is text.
 */
export function parseModelReply(raw: string): ParsedReply {
  const trimmed = raw.trim()
  if (!trimmed) return { kind: 'text', text: '' }

  const candidates: string[] = []
  const lineMatch = trimmed.match(TOOL_LINE)
  if (lineMatch) candidates.push(lineMatch[1])
  const fenced = trimmed.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  if (fenced) candidates.push(fenced[1])
  if (trimmed.startsWith('{')) candidates.push(trimmed)
  const anywhere = trimmed.match(/\{[\s\S]*"name"[\s\S]*\}/)
  if (anywhere) candidates.push(anywhere[0])

  for (const candidate of candidates) {
    const parsed = safeJson(candidate)
    if (!parsed) continue
    const name = typeof parsed.name === 'string' ? parsed.name : typeof parsed.tool === 'string' ? parsed.tool : ''
    const spec = TOOL_SPECS.find((tool) => tool.name === name)
    if (!spec) continue
    const args = parsed.args && typeof parsed.args === 'object' ? (parsed.args as Record<string, unknown>) : {}
    return { kind: 'tool', name: spec.name, args }
  }

  return { kind: 'text', text: stripToolArtifacts(trimmed) }
}

function stripToolArtifacts(text: string) {
  return text.replace(/^\s*TOOL\s*\{[\s\S]*?\}\s*$/m, '').trim() || text.trim()
}

function safeJson(candidate: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(candidate) as unknown
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** One-line descriptions used when a tool result is fed back into the conversation. */
export function describeToolResult(name: AssistantToolName, ok: boolean, summary: string) {
  return `Tool ${name} ${ok ? 'returned' : 'failed'}: ${summary}`
}

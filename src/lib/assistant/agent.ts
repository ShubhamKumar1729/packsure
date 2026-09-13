/**
 * The assistant agent loop, entirely on-device:
 *
 *   question -> retrieval over the local knowledge base -> prompt (persona + docs + tools)
 *            -> local LLM decides: answer in prose, or call one platform tool
 *            -> tool executes against existing app APIs / router
 *            -> tool result goes back to the LLM for a natural-language reply
 *
 * Nothing here is keyword matching: the model chooses whether a tool is appropriate, and retrieval
 * grounds every platform answer in the bundled documentation.
 */

import { buildSystemPrompt, describeToolResult, parseModelReply, trimHistory, type ProtocolMessage } from '@/lib/assistant/agent-protocol'
import { executeTool, type PendingOperation, type ToolExecution } from '@/lib/assistant/agent-tools'
import { describeContext, type AssistantContext } from '@/lib/assistant/context'
import { generateReply, LOCAL_MODEL, modelDevice, type ChatTurn } from '@/lib/assistant/local-model'
import { searchKnowledge, type RetrievedDoc } from '@/lib/assistant/rag'

export type AssistantCitation = { title: string; category: string; score: number }

export type AssistantReply = {
  text: string
  citations: AssistantCitation[]
  navigations: { href: string; label: string }[]
  pending: PendingOperation | null
  toolUsed: string | null
  meta: { model: string; device: string; retrieved: number; millis: number }
}

export type AgentProgress = (info: { stage: 'retrieval' | 'model' | 'thinking' | 'tool'; progress: number; detail: string }) => void

const noop: AgentProgress = () => {}

export async function askAssistant(input: {
  question: string
  history: ProtocolMessage[]
  context: AssistantContext
  navigate: (href: string) => void
  onProgress?: AgentProgress
}): Promise<AssistantReply> {
  const started = Date.now()
  const onProgress = input.onProgress || noop

  onProgress({ stage: 'retrieval', progress: 0, detail: 'Searching platform documentation' })
  const retrieved: RetrievedDoc[] = await searchKnowledge(input.question, 3, (info) => {
    onProgress({ stage: 'retrieval', progress: info.progress, detail: info.detail })
  })

  onProgress({ stage: 'model', progress: 0, detail: 'Starting on-device model' })
  const { ensureLocalModel } = await import('@/lib/assistant/local-model')
  await ensureLocalModel((info) => onProgress({ stage: 'model', progress: info.progress, detail: info.detail }))

  const messages: ChatTurn[] = [
    { role: 'system', content: buildSystemPrompt(retrieved.map((result) => ({ title: result.doc.title, category: result.doc.category, text: result.doc.text }))) },
    ...trimHistory(input.history).map((turn) => ({ role: turn.role, content: turn.content })),
  ]
  const focus = describeContext(input.context)
  const question = focus ? `${input.question}\n(Context hint: ${focus} You may use it with record tools, but verify with a tool before quoting ids.)` : input.question
  messages.push({ role: 'user', content: question })

  onProgress({ stage: 'thinking', progress: 0, detail: 'Thinking' })
  let reply = await generateReply(messages)

  const navigations: { href: string; label: string }[] = []
  let pending: PendingOperation | null = null
  let toolUsed: string | null = null

  const parsed = parseModelReply(reply)
  if (parsed.kind === 'tool') {
    toolUsed = parsed.name
    onProgress({ stage: 'tool', progress: 0, detail: `Running ${parsed.name}` })
    const execution: ToolExecution = await executeTool(parsed.name, parsed.args, input.navigate)
    if (execution.navigatedTo) navigations.push(execution.navigatedTo)
    if (execution.pending) pending = execution.pending

    // Let the model turn the raw tool result into a friendly, grounded reply.
    messages.push({ role: 'assistant', content: reply.trim() })
    messages.push({ role: 'user', content: describeToolResult(parsed.name, execution.ok, execution.summary) + (execution.pending ? ' Tell the user you have prepared it and that they can confirm with the button in the chat.' : '') })
    onProgress({ stage: 'thinking', progress: 0, detail: 'Writing the answer' })
    const second = await generateReply(messages, { maxNewTokens: 200 })
    const secondParsed = parseModelReply(second)
    reply = secondParsed.kind === 'text' && secondParsed.text ? secondParsed.text : execution.summary
  } else {
    reply = parsed.text
  }

  return {
    text: reply || 'I could not put an answer together. Could you rephrase that?',
    citations: retrieved.map((result) => ({ title: result.doc.title, category: result.doc.category, score: Math.round(result.score * 100) / 100 })),
    navigations,
    pending,
    toolUsed,
    meta: { model: LOCAL_MODEL.id.split('/').pop() || LOCAL_MODEL.id, device: modelDevice(), retrieved: retrieved.length, millis: Date.now() - started },
  }
}

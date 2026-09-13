import type {
  AssistantCitation,
  AssistantContext,
  AssistantEvidence,
  AssistantMessage,
  AssistantProviderInput,
  AssistantToolContext,
} from '@/lib/assistant/types'
import { SYSTEM_PROMPT } from '@/lib/assistant/platform-knowledge'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

const MAX_FINDINGS = 12
const MAX_HISTORY_INSPECTIONS = 8
const MAX_EVIDENCE = 8
const MAX_REPORTS = 5

function percent(value: number | null | undefined) {
  return value === null || value === undefined ? 'not available' : `${Math.round(value * 100)}%`
}

function money(value: number | undefined) {
  return value === undefined ? 'not stored' : String(value)
}

function quantity(packSize?: string, unit?: string) {
  if (!packSize && !unit) return 'not stored'
  return [packSize, unit].filter(Boolean).join(' ')
}

function describeContext(context: AssistantContext) {
  switch (context.type) {
    case 'inspection':
      return `The user is looking at inspection ${context.id}.`
    case 'finding':
      return `The user is looking at finding ${context.id} on inspection ${context.inspectionId}.`
    case 'product':
      return `The user is looking at the product record ${context.id} and its inspection history.`
    case 'report':
      return `The user is looking at report ${context.id}.`
    default:
      return 'The user is on a workspace page with no single record selected, so answer from platform knowledge and from whatever records are available below.'
  }
}

function inspectionLine(inspection: AssistantToolContext['inspection']) {
  if (!inspection) return 'No inspection record is available in this context.'
  return [
    `Inspection ${inspection.id}`,
    `product "${inspection.productName}"`,
    inspection.brand ? `brand ${inspection.brand}` : 'brand not stored',
    inspection.manufacturer ? `manufacturer ${inspection.manufacturer}` : 'manufacturer not stored',
    `pack size ${quantity(inspection.packSize, inspection.unit)}`,
    `declared retail price ${money(inspection.declaredRetailPrice)}`,
    `lifecycle status ${inspection.status}`,
    `final decision ${inspection.finalDecision}`,
    inspection.finalComment ? `final comment "${inspection.finalComment}"` : 'no final decision comment',
    `${inspection.imageCount} stored image(s)`,
    `created ${inspection.createdAt}`,
    inspection.compliance
      ? `latest compliance ${inspection.compliance.status} with score ${inspection.compliance.score === null ? 'null (pending human review or nothing applicable)' : `${inspection.compliance.score}%`} evaluated ${inspection.compliance.evaluatedAt}`
      : 'no compliance evaluation has been run',
  ].join('; ')
}

function findingLines(findings: AssistantToolContext['findings']) {
  if (findings.length === 0) return 'No findings are stored for this context. That means either no rule produced a violation or review-required result, or no compliance run exists yet.'
  return findings.slice(0, MAX_FINDINGS).map((finding) => [
    `Finding ${finding.id}`,
    `rule "${finding.ruleName}" (key ${finding.ruleKey}, version ${finding.ruleVersion})`,
    `check reference "${finding.ruleReference}"`,
    `severity ${finding.severity}`,
    `AI status ${finding.aiStatus}`,
    `human decision ${finding.humanDecision}`,
    `detected value ${finding.correctedValue ? `${finding.correctedValue} (corrected by a reviewer from ${finding.detectedValue || 'nothing detected'})` : finding.detectedValue || 'nothing detected'}`,
    `expected requirement "${finding.expectedRequirement}"`,
    `confidence ${percent(finding.confidence)}`,
    finding.comment ? `reviewer comment "${finding.comment}"` : 'no reviewer comment',
    `${finding.evidence.length} linked evidence item(s)`,
  ].join('; ')).join('\n')
}

function ruleLines(rules: AssistantToolContext['rules']) {
  if (rules.length === 0) return 'No rule records were returned for the findings in this context.'
  return rules.map((rule) => `Rule ${rule.key} v${rule.version} "${rule.name}": ${rule.description} Check area ${rule.checkArea}. Jurisdiction ${rule.jurisdiction}. Reference "${rule.reference}". Expected "${rule.expectedRequirement}". Severity ${rule.severity}. Currently ${rule.enabled ? 'enabled' : 'DISABLED, so it is not evaluated'}.`).join('\n')
}

function historyLines(history: AssistantToolContext['productHistory']) {
  if (!history) return 'No product history is available in this context.'
  const product = history.product
  const inspections = history.inspections.slice(0, MAX_HISTORY_INSPECTIONS)
  const header = `Product "${product.name}" (${product.id}); brand ${product.brand || 'not stored'}; manufacturer ${product.manufacturer || 'not stored'}; pack size ${quantity(product.packSize, product.unit)}; declared retail price ${money(product.declaredRetailPrice)}. ${history.inspections.length} stored inspection(s), ${history.findings.length} stored finding(s) across all of them.`
  const lines = inspections.map((inspection, index) => `${index === 0 ? 'Most recent' : 'Previous'}: inspection ${inspection.id}, created ${inspection.createdAt}, compliance ${inspection.compliance ? `${inspection.compliance.status}${inspection.compliance.score === null ? '' : ` (${inspection.compliance.score}%)`}` : 'not evaluated'}, final decision ${inspection.finalDecision}.`)
  const repeats = new Map<string, number>()
  history.findings.filter((finding) => finding.aiStatus === 'VIOLATION').forEach((finding) => repeats.set(finding.ruleKey, (repeats.get(finding.ruleKey) || 0) + 1))
  const repeated = Array.from(repeats.entries()).filter(([, count]) => count > 1).map(([key, count]) => `${key} (${count} times)`).join(', ')
  return [header, ...lines, repeated ? `Repeated violation signals across this product's history: ${repeated}.` : 'No rule has violated more than once for this product.'].join('\n')
}

function evidenceLines(evidence: AssistantToolContext['evidence']) {
  const usable = evidence.slice(0, MAX_EVIDENCE)
  if (usable.length === 0) return 'No stored package-image evidence is available for this context.'
  return usable.map((item) => `${item.id}: ${item.label} (${item.source === 'finding_evidence' ? 'linked to a finding' : 'stored package image'})${item.excerpt ? ` excerpt "${item.excerpt}"` : ''}`).join('\n')
}

function reportLines(reports: AssistantToolContext['reports']) {
  if (reports.length === 0) return 'No reports have been generated for this context.'
  return reports.slice(0, MAX_REPORTS).map((report) => `Report ${report.id} v${report.reportVersion} generated ${report.generatedAt} for "${report.productName}"; final decision ${report.finalDecision}; compliance ${report.complianceStatus || 'not recorded'}${report.complianceScore === null || report.complianceScore === undefined ? '' : ` (${report.complianceScore}%)`}; ${report.findingCount} finding(s).`).join('\n')
}

/** Renders the authorized records as plain text for the model. The model never sees a database handle. */
export function serializeRecordContext(tools: AssistantToolContext) {
  return [
    `## Authorized records retrieved for this request`,
    describeContext(tools.context),
    ``,
    `### Current inspection`,
    inspectionLine(tools.inspection),
    ``,
    `### Findings`,
    findingLines(tools.findings),
    ``,
    `### Rule records behind those findings`,
    ruleLines(tools.rules),
    ``,
    `### Product history`,
    historyLines(tools.productHistory),
    ``,
    `### Evidence`,
    evidenceLines(tools.evidence),
    ``,
    `### Reports`,
    reportLines(tools.reports),
  ].join('\n')
}

export function buildMessages(input: AssistantProviderInput): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM_PROMPT }]
  for (const turn of input.history) {
    messages.push({ role: turn.role, content: turn.content })
  }
  messages.push({
    role: 'user',
    content: `${input.question.trim()}\n\n${serializeRecordContext(input.tools)}`,
  })
  return messages
}

function uniqueCitations(citations: AssistantCitation[]) {
  const seen = new Set<string>()
  return citations.filter((citation) => {
    const key = `${citation.type}:${citation.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/**
 * Citations and evidence are derived server-side from the authorized records rather than asking the
 * model to emit them. A model can hallucinate an ID or a link; this cannot.
 */
export function buildReferences(tools: AssistantToolContext): { citations: AssistantCitation[]; evidence: AssistantEvidence[] } {
  const citations: AssistantCitation[] = []

  if (tools.inspection) {
    citations.push({ type: 'inspection', id: tools.inspection.id, label: `Inspection ${tools.inspection.productName}`, href: `/app/inspections/${tools.inspection.id}` })
  }
  if (tools.productHistory) {
    citations.push({ type: 'product_history', id: tools.productHistory.product.id, label: `${tools.productHistory.product.name} history`, href: `/app/products/${tools.productHistory.product.id}` })
  }
  for (const finding of tools.findings.slice(0, MAX_FINDINGS)) {
    citations.push({ type: 'finding', id: finding.id, label: `${finding.ruleName} · ${finding.severity}`, href: `/app/inspections/${finding.inspectionId}/review` })
  }
  for (const rule of tools.rules) {
    citations.push({ type: 'rule', id: rule.id, label: `${rule.key} v${rule.version}${rule.enabled ? '' : ' (disabled)'}`, href: rule.referenceUrl || '/app/rules' })
  }
  for (const report of tools.reports.slice(0, 3)) {
    citations.push({ type: 'report', id: report.id, label: `Report v${report.reportVersion}`, href: `/app/reports/${report.id}` })
  }

  const evidence = tools.evidence.filter((item) => item.imageUrl).slice(0, 6)
  for (const item of evidence) {
    citations.push({ type: 'evidence', id: item.id, label: item.label, href: item.imageUrl })
  }

  return { citations: uniqueCitations(citations).slice(0, 10), evidence }
}

export const ASSISTANT_BOUNDARY = 'AI assessment only. This answer explains stored records and platform behaviour. It does not change any compliance result, human review decision, final decision, or audit entry.'

export function asAssistantHistory(value: unknown): AssistantMessage[] {
  if (!Array.isArray(value)) return []
  const history: AssistantMessage[] = []
  for (const turn of value.slice(-20)) {
    if (!turn || typeof turn !== 'object') continue
    const candidate = turn as { role?: unknown; content?: unknown }
    if (candidate.role !== 'user' && candidate.role !== 'assistant') continue
    if (typeof candidate.content !== 'string' || !candidate.content.trim()) continue
    history.push({ role: candidate.role, content: candidate.content.slice(0, 4000) })
  }
  return history
}

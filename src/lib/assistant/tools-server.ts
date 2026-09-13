/**
 * Pia's platform tools. These are declared to Groq as structured function tools, and Groq — not a
 * keyword matcher — decides when each one is appropriate.
 *
 * Every executor reuses the existing PackSure surface: reads and operations are dispatched to the
 * same authenticated API routes the UI uses, via an internal loopback call that forwards the
 * caller's session cookie. Nothing here reimplements PackSure business logic, and nothing here is
 * reachable without a valid session because the loopback request carries the user's own cookie
 * through the normal authorization path.
 */

import { signOperation, type OperationName, type PendingOperation } from '@/lib/assistant/confirm-token'

export const NAV_SECTIONS: Record<string, { href: string; label: string }> = {
  dashboard: { href: '/app', label: 'Dashboard' },
  'new-inspection': { href: '/app/new-inspection', label: 'New inspection' },
  inspections: { href: '/app/inspections', label: 'Inspections' },
  products: { href: '/app/products', label: 'Products' },
  reports: { href: '/app/reports', label: 'Reports' },
  rules: { href: '/app/rules', label: 'Rules' },
}

export const OPERATION_LABELS: Record<OperationName, string> = {
  analyze: 'Run AI analysis on the stored images',
  run_compliance: 'Evaluate the enabled compliance rules',
  listing_comparison: 'Compare the declared price with the online listing',
  generate_report: 'Generate a compliance report snapshot',
}

const OPERATION_ROUTES: Record<OperationName, (inspectionId: string) => { endpoint: string; body: Record<string, unknown> | null }> = {
  analyze: (id) => ({ endpoint: `/api/inspections/${id}/analyze`, body: null }),
  run_compliance: (id) => ({ endpoint: `/api/inspections/${id}/compliance`, body: null }),
  listing_comparison: (id) => ({ endpoint: `/api/inspections/${id}/listing-comparison`, body: null }),
  generate_report: () => ({ endpoint: '/api/reports', body: null }), // body filled at execution time
}

/** OpenAI-style tool schemas, which Groq's chat completions API speaks natively. */
export const PIA_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'navigate_to',
      description: 'Navigate the user to a top-level PackSure section. Use when the user asks to go somewhere or open a page.',
      parameters: {
        type: 'object',
        properties: { section: { type: 'string', enum: Object.keys(NAV_SECTIONS) } },
        required: ['section'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_documents',
      description: "Retrieve the user's stored PackSure documents: inspections and products with their statuses. Use for questions about what documents, inspections, or products exist.",
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'list_reports',
      description: 'Retrieve the compliance reports the user can see. Use for questions about reports or downloads.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_analysis',
      description: 'Retrieve the stored AI analysis and compliance result of one inspection. Requires an inspectionId known from context or a previous tool result.',
      parameters: {
        type: 'object',
        properties: { inspectionId: { type: 'string', description: 'Mongo id of the inspection' } },
        required: ['inspectionId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_listing_comparison',
      description: 'Retrieve the stored online listing / MRP comparison of one inspection.',
      parameters: {
        type: 'object',
        properties: { inspectionId: { type: 'string', description: 'Mongo id of the inspection' } },
        required: ['inspectionId'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'start_operation',
      description: 'Propose starting an existing PackSure operation. The user must confirm in the UI before anything runs. Never use this for review decisions or final decisions, which are human-only.',
      parameters: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: ['analyze', 'run_compliance', 'listing_comparison', 'generate_report'] },
          inspectionId: { type: 'string', description: 'Mongo id of the inspection the operation targets' },
        },
        required: ['operation', 'inspectionId'],
      },
    },
  },
]

export type ToolOutcome =
  | { kind: 'result'; toolResult: string; navigations: { href: string; label: string }[] }
  | { kind: 'pending'; pending: PendingOperation; provisional: string }

export type ToolContext = { baseUrl: string; cookie: string | null }

const ID_PATTERN = /^[0-9a-fA-F]{24}$/

type JsonObject = Record<string, unknown>

async function callExistingApi(path: string, ctx: ToolContext, init?: { method: 'POST'; body?: Record<string, unknown> | null }): Promise<{ ok: boolean; status: number; data: JsonObject | null }> {
  try {
    const response = await fetch(`${ctx.baseUrl}${path}`, {
      method: init?.method || 'GET',
      headers: {
        accept: 'application/json',
        ...(ctx.cookie ? { cookie: ctx.cookie } : {}),
        ...(init?.method === 'POST' ? { 'content-type': 'application/json' } : {}),
      },
      body: init?.method === 'POST' && init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(60_000),
    })
    const data = (await response.json().catch(() => null)) as JsonObject | null
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

function asList(data: JsonObject | null, key: string): JsonObject[] {
  const value = data?.[key]
  return Array.isArray(value) ? (value as JsonObject[]) : []
}

function text(value: unknown, fallback = 'unknown') {
  if (typeof value === 'string' && value.trim()) return value
  if (typeof value === 'number') return String(value)
  return fallback
}

function strArg(args: JsonObject, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/**
 * Executes one model-requested tool. Read tools and navigation complete immediately; the single
 * state-changing tool returns a signed pending operation for the confirmation card instead of
 * running anything.
 */
export async function executePiaTool(name: string, rawArgs: JsonObject, ctx: ToolContext): Promise<ToolOutcome> {
  switch (name) {
    case 'navigate_to': {
      const target = NAV_SECTIONS[strArg(rawArgs, 'section') || '']
      if (!target) return { kind: 'result', toolResult: `Unknown section. Known sections: ${Object.keys(NAV_SECTIONS).join(', ')}.`, navigations: [] }
      return {
        kind: 'result',
        toolResult: `Navigated the user to ${target.label} (${target.href}). Their screen now shows that section.`,
        navigations: [{ href: target.href, label: target.label }],
      }
    }

    case 'list_documents': {
      const [inspections, products] = await Promise.all([callExistingApi('/api/inspections', ctx), callExistingApi('/api/products', ctx)])
      if (!inspections.ok && !products.ok) {
        return { kind: 'result', toolResult: inspections.status === 401 ? 'The documents API rejected the session.' : 'The PackSure documents API is currently unavailable (database may be unreachable). Tell the user their documents could not be loaded right now.', navigations: [] }
      }
      const inspectionList = asList(inspections.data, 'inspections')
      const productList = asList(products.data, 'products')
      const inspectionLines = inspectionList.slice(0, 8).map((item) => `"${text(item.productName, text(item.name))}" id=${text(item.id)} compliance=${text(item.complianceStatus, 'not evaluated')} final=${text(item.finalDecision, 'PENDING')} created=${String(text(item.createdAt)).slice(0, 10)}`)
      const productLines = productList.slice(0, 8).map((item) => `"${text(item.name)}" id=${text(item.id)} brand=${text(item.brand, 'none')}`)
      return {
        kind: 'result',
        toolResult: [
          `${inspectionList.length} inspection(s), ${productList.length} product(s).`,
          inspectionLines.length ? `Inspections: ${inspectionLines.join(' | ')}` : 'No inspections stored.',
          productLines.length ? `Products: ${productLines.join(' | ')}` : 'No products stored.',
        ].join(' '),
        navigations: [],
      }
    }

    case 'list_reports': {
      const reports = await callExistingApi('/api/reports', ctx)
      if (!reports.ok) return { kind: 'result', toolResult: 'The reports API is currently unavailable or rejected the session. Tell the user reports could not be loaded right now.', navigations: [] }
      const list = asList(reports.data, 'reports')
      const lines = list.slice(0, 8).map((item) => `report id=${text(item.id)} v${text(item.reportVersion)} "${text(item.productName)}" final=${text(item.finalDecision)} compliance=${text(item.complianceStatus, 'none')} generated=${String(text(item.generatedAt)).slice(0, 10)}`)
      return { kind: 'result', toolResult: list.length ? `${list.length} report(s): ${lines.join(' | ')}` : 'No reports have been generated yet. Reports require an inspection with a compliance run.', navigations: [] }
    }

    case 'get_analysis': {
      const inspectionId = strArg(rawArgs, 'inspectionId') || ''
      if (!ID_PATTERN.test(inspectionId)) return { kind: 'result', toolResult: 'A valid 24-character inspectionId is required. Retrieve ids with list_documents first.', navigations: [] }
      const [analysis, compliance] = await Promise.all([callExistingApi(`/api/inspections/${inspectionId}/analysis`, ctx), callExistingApi(`/api/inspections/${inspectionId}/compliance`, ctx)])
      if (!analysis.ok && !compliance.ok) {
        return { kind: 'result', toolResult: analysis.status === 404 ? `No stored analysis exists for inspection ${inspectionId} yet.` : `The analysis API is currently unavailable for inspection ${inspectionId}.`, navigations: [] }
      }
      const analysisData = analysis.data?.analysis as JsonObject | undefined
      const complianceData = compliance.data?.compliance as JsonObject | undefined
      const fields = Array.isArray(analysisData?.fields) ? (analysisData.fields as JsonObject[]).length : 0
      const declarations = Array.isArray(analysisData?.declarations) ? (analysisData.declarations as JsonObject[]).length : 0
      const ocr = typeof analysisData?.ocrText === 'string' && analysisData.ocrText.trim() ? analysisData.ocrText.slice(0, 160) : ''
      return {
        kind: 'result',
        toolResult: [
          analysis.ok ? `Analysis ${text(analysisData?.status)}: ${fields} field(s), ${declarations} declaration(s).${ocr ? ` OCR excerpt: "${ocr}"` : ' No OCR text stored (expected with the mock AI provider).'}` : 'No analysis run stored for this inspection.',
          compliance.ok ? `Compliance ${text(complianceData?.status)}, score ${complianceData?.score === null || complianceData?.score === undefined ? 'null' : complianceData.score}.` : 'No compliance run stored.',
        ].join(' '),
        navigations: [],
      }
    }

    case 'get_listing_comparison': {
      const inspectionId = strArg(rawArgs, 'inspectionId') || ''
      if (!ID_PATTERN.test(inspectionId)) return { kind: 'result', toolResult: 'A valid 24-character inspectionId is required.', navigations: [] }
      const comparison = await callExistingApi(`/api/inspections/${inspectionId}/listing-comparison`, ctx)
      const data = comparison.data?.comparison as JsonObject | undefined
      if (!comparison.ok || !data) return { kind: 'result', toolResult: `No stored listing comparison for inspection ${inspectionId}. It can be proposed with start_operation(operation="listing_comparison").`, navigations: [] }
      return { kind: 'result', toolResult: `Listing comparison ${text(data.status)}: declared ${text(data.declaredPrice, 'n/a')} vs listed ${text(data.listedPrice, 'n/a')} from ${text(data.sourceUrl, 'unknown source')}.`, navigations: [] }
    }

    case 'start_operation': {
      const operation = strArg(rawArgs, 'operation') as OperationName | undefined
      const inspectionId = strArg(rawArgs, 'inspectionId') || ''
      if (!operation || !OPERATION_LABELS[operation]) return { kind: 'result', toolResult: `Unknown operation. Supported: ${Object.keys(OPERATION_LABELS).join(', ')}.`, navigations: [] }
      if (!ID_PATTERN.test(inspectionId)) return { kind: 'result', toolResult: 'A valid 24-character inspectionId is required. Retrieve ids with list_documents first.', navigations: [] }
      const token = await signOperation({ operation, inspectionId })
      const route = OPERATION_ROUTES[operation](inspectionId)
      return {
        kind: 'pending',
        pending: { operation, inspectionId, label: OPERATION_LABELS[operation], endpoint: route.endpoint, token },
        provisional: `I can ${OPERATION_LABELS[operation].toLowerCase()} for inspection ${inspectionId.slice(-6)}. Shall I proceed?`,
      }
    }

    default:
      return { kind: 'result', toolResult: `Unsupported tool "${name}". Available: navigate_to, list_documents, list_reports, get_analysis, get_listing_comparison, start_operation.`, navigations: [] }
  }
}

/** Runs a user-confirmed operation through the exact endpoint the app UI already uses. */
export async function runConfirmedOperation(pending: { endpoint: string; operation: OperationName; inspectionId: string }, ctx: ToolContext): Promise<{ ok: boolean; summary: string }> {
  const body = pending.operation === 'generate_report' ? { inspectionId: pending.inspectionId } : null
  const result = await callExistingApi(pending.endpoint, ctx, { method: 'POST', body })
  if (!result.ok) {
    const reason = text(result.data?.error, `status ${result.status}`)
    return { ok: false, summary: `The operation failed: ${reason}` }
  }
  return { ok: true, summary: `The operation completed successfully (${pending.endpoint}). ${result.data ? JSON.stringify(result.data).slice(0, 400) : ''}` }
}

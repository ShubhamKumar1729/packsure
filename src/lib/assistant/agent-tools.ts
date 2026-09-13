/**
 * Platform tools the assistant may call. Every tool maps onto something that already exists in the
 * application: authenticated GET endpoints for reading, the client router for navigation, and the
 * existing POST endpoints for operations (which the UI only runs after explicit user confirmation).
 * The assistant never touches the database and never mutates anything by itself.
 */

import { NAV_SECTIONS, OPERATION_LABELS, type AssistantToolName } from '@/lib/assistant/agent-protocol'

export type PendingOperation = {
  operation: 'analyze' | 'run_compliance' | 'listing_comparison' | 'generate_report'
  inspectionId: string
  label: string
  endpoint: string
  method: 'POST'
  body: Record<string, unknown> | null
}

export type ToolExecution = {
  ok: boolean
  summary: string
  navigatedTo?: { href: string; label: string }
  pending?: PendingOperation
}

type JsonObject = Record<string, unknown>

async function getJson(url: string): Promise<{ ok: boolean; status: number; data: JsonObject | null }> {
  try {
    const response = await fetch(url, { headers: { accept: 'application/json' } })
    const data = (await response.json().catch(() => null)) as JsonObject | null
    return { ok: response.ok, status: response.status, data }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

function asList(data: JsonObject | null, key: string): JsonObject[] {
  const value = data?.[key]
  if (Array.isArray(value)) return value as JsonObject[]
  if (Array.isArray(data)) return data as unknown as JsonObject[]
  return []
}

function text(value: unknown, fallback = 'unknown') {
  return typeof value === 'string' && value.trim() ? value : typeof value === 'number' ? String(value) : fallback
}

function strArg(args: JsonObject, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

const ID_PATTERN = /^[0-9a-fA-F]{24}$/

export async function executeTool(
  name: AssistantToolName,
  args: JsonObject,
  navigate: (href: string) => void,
): Promise<ToolExecution> {
  switch (name) {
    case 'navigate_to': {
      const section = strArg(args, 'section') || ''
      const target = NAV_SECTIONS[section]
      if (!target) return { ok: false, summary: `Unknown section "${section}". Known sections: ${Object.keys(NAV_SECTIONS).join(', ')}.` }
      navigate(target.href)
      return { ok: true, summary: `Navigated the user to ${target.label} (${target.href}).`, navigatedTo: { href: target.href, label: target.label } }
    }

    case 'open_record': {
      const type = strArg(args, 'type') || ''
      const id = strArg(args, 'id') || ''
      if (!ID_PATTERN.test(id)) return { ok: false, summary: 'No valid record id was provided, so nothing was opened. Retrieve ids with list_documents or list_reports first.' }
      const href = type === 'inspection' ? `/app/inspections/${id}` : type === 'product' ? `/app/products/${id}` : type === 'report' ? `/app/reports/${id}` : ''
      if (!href) return { ok: false, summary: `Unknown record type "${type}".` }
      navigate(href)
      return { ok: true, summary: `Opened the ${type} record ${id}.`, navigatedTo: { href, label: `${type} ${id.slice(-6)}` } }
    }

    case 'list_documents': {
      const [inspections, products] = await Promise.all([getJson('/api/inspections'), getJson('/api/products')])
      if (!inspections.ok && !products.ok) return { ok: false, summary: 'The documents API did not respond. The database may be unreachable.' }
      const inspectionList = asList(inspections.data, 'inspections')
      const productList = asList(products.data, 'products')
      const inspectionLines = inspectionList.slice(0, 6).map((item) => `${text(item.productName, text(item.name))}: compliance ${text(item.complianceStatus, 'not evaluated')}, final ${text(item.finalDecision, 'PENDING')}, id ${text(item.id)}`)
      const productLines = productList.slice(0, 6).map((item) => `${text(item.name)}: ${text(item.brand, 'no brand')}, id ${text(item.id)}`)
      const summary = [
        `${inspectionList.length} inspection(s) and ${productList.length} product(s) are stored for this user.`,
        inspectionLines.length ? `Inspections: ${inspectionLines.join(' | ')}` : 'No inspections stored yet.',
        productLines.length ? `Products: ${productLines.join(' | ')}` : 'No products stored yet.',
      ].join(' ')
      return { ok: true, summary }
    }

    case 'list_reports': {
      const reports = await getJson('/api/reports')
      if (!reports.ok) return { ok: false, summary: 'The reports API did not respond.' }
      const list = asList(reports.data, 'reports')
      const lines = list.slice(0, 6).map((item) => `report ${text(item.id)} v${text(item.reportVersion)} for "${text(item.productName)}" (${text(item.finalDecision)}, ${text(item.complianceStatus, 'no compliance')}, generated ${text(item.generatedAt).slice(0, 10)})`)
      return { ok: true, summary: list.length ? `${list.length} report(s) stored: ${lines.join(' | ')}` : 'No reports have been generated yet. A report requires an inspection with a compliance run.' }
    }

    case 'get_analysis': {
      const inspectionId = strArg(args, 'inspectionId') || ''
      if (!ID_PATTERN.test(inspectionId)) return { ok: false, summary: 'A valid inspectionId is required to read an analysis.' }
      const [analysis, compliance] = await Promise.all([getJson(`/api/inspections/${inspectionId}/analysis`), getJson(`/api/inspections/${inspectionId}/compliance`)])
      if (!analysis.ok && !compliance.ok) return { ok: false, summary: `No stored analysis or compliance result is available for inspection ${inspectionId} (status ${analysis.status}).` }
      const analysisData = analysis.data?.analysis as JsonObject | undefined
      const complianceData = compliance.data?.compliance as JsonObject | undefined
      const fields = Array.isArray(analysisData?.fields) ? (analysisData.fields as JsonObject[]).length : 0
      const declarations = Array.isArray(analysisData?.declarations) ? (analysisData.declarations as JsonObject[]).length : 0
      const ocr = typeof analysisData?.ocrText === 'string' ? analysisData.ocrText.slice(0, 140) : ''
      const summary = [
        analysis.ok ? `Analysis status ${text(analysisData?.status)}: ${fields} extracted field(s), ${declarations} declaration(s).${ocr ? ` OCR excerpt: "${ocr}"` : ' No OCR text stored.'}` : 'No analysis has been run for this inspection.',
        compliance.ok ? `Compliance: ${text(complianceData?.status)} with score ${complianceData?.score === null || complianceData?.score === undefined ? 'null' : complianceData.score}.` : 'No compliance run stored.',
      ].join(' ')
      return { ok: true, summary }
    }

    case 'get_listing_comparison': {
      const inspectionId = strArg(args, 'inspectionId') || ''
      if (!ID_PATTERN.test(inspectionId)) return { ok: false, summary: 'A valid inspectionId is required to read a listing comparison.' }
      const comparison = await getJson(`/api/inspections/${inspectionId}/listing-comparison`)
      const data = comparison.data?.comparison as JsonObject | undefined
      if (!comparison.ok || !data) return { ok: false, summary: 'No listing comparison is stored for this inspection. It can be started from the inspection page or offered as an operation.' }
      return { ok: true, summary: `Listing comparison status ${text(data.status)}: declared ${text(data.declaredPrice, 'n/a')} versus listed ${text(data.listedPrice, 'n/a')} from ${text(data.sourceUrl, 'unknown source')}.` }
    }

    case 'start_operation': {
      const operation = strArg(args, 'operation') || ''
      const inspectionId = strArg(args, 'inspectionId') || ''
      if (!ID_PATTERN.test(inspectionId)) return { ok: false, summary: 'A valid inspectionId is required to start an operation.' }
      const routes: Record<string, { endpoint: string; body: Record<string, unknown> | null }> = {
        analyze: { endpoint: `/api/inspections/${inspectionId}/analyze`, body: null },
        run_compliance: { endpoint: `/api/inspections/${inspectionId}/compliance`, body: null },
        listing_comparison: { endpoint: `/api/inspections/${inspectionId}/listing-comparison`, body: null },
        generate_report: { endpoint: '/api/reports', body: { inspectionId } },
      }
      const route = routes[operation]
      const label = OPERATION_LABELS[operation]
      if (!route || !label) return { ok: false, summary: `Unknown operation "${operation}". Supported: analyze, run_compliance, listing_comparison, generate_report.` }
      return {
        ok: true,
        summary: `Prepared "${label}" for inspection ${inspectionId}. The user must confirm before it runs.`,
        pending: { operation: operation as PendingOperation['operation'], inspectionId, label, endpoint: route.endpoint, method: 'POST', body: route.body },
      }
    }

    default:
      return { ok: false, summary: `Unsupported tool "${String(name)}".` }
  }
}

/** Runs a user-confirmed operation through the exact endpoint the app UI already uses. */
export async function runConfirmedOperation(pending: PendingOperation): Promise<{ ok: boolean; message: string }> {
  try {
    const response = await fetch(pending.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: pending.body ? JSON.stringify(pending.body) : undefined,
    })
    const data = (await response.json().catch(() => null)) as JsonObject | null
    if (!response.ok) return { ok: false, message: text(data?.error, `The operation failed with status ${response.status}.`) }
    return { ok: true, message: `"${pending.label}" completed.` }
  } catch {
    return { ok: false, message: 'The operation could not be reached.' }
  }
}

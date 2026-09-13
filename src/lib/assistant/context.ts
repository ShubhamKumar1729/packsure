/**
 * Which part of the app the user is looking at. The assistant uses it only as a hint (so it can
 * offer record tools for the record on screen); actual record access always goes through the
 * authenticated platform tools and the user's own role scope.
 */

export type AssistantContext =
  | { type: 'inspection'; id: string }
  | { type: 'finding'; id: string; inspectionId: string }
  | { type: 'product'; id: string }
  | { type: 'report'; id: string }
  | { type: 'workspace' }

export const WORKSPACE_CONTEXT: AssistantContext = { type: 'workspace' }

export function contextKey(context: AssistantContext | null): string {
  if (!context) return 'workspace'
  return context.type === 'workspace' ? 'workspace' : `${context.type}:${context.id}`
}

export function describeContext(context: AssistantContext): string | null {
  switch (context.type) {
    case 'inspection': return `The user currently has inspection ${context.id} open.`
    case 'finding': return `The user currently has finding ${context.id} of inspection ${context.inspectionId} open on the review screen.`
    case 'product': return `The user currently has product ${context.id} open with its inspection history.`
    case 'report': return `The user currently has report ${context.id} open.`
    default: return null
  }
}

export function contextLabel(context: AssistantContext): string {
  switch (context.type) {
    case 'inspection': return `Inspection …${context.id.slice(-6)}`
    case 'finding': return `Finding …${context.id.slice(-6)}`
    case 'product': return `Product …${context.id.slice(-6)}`
    case 'report': return `Report …${context.id.slice(-6)}`
    default: return 'General · whole platform'
  }
}

/** Server-side validation of the client-supplied context hint. */
export function parseAssistantContext(value: unknown): AssistantContext {
  if (!value || typeof value !== 'object') return { type: 'workspace' }
  const context = value as Record<string, unknown>
  if (context.type === 'inspection' && typeof context.id === 'string') return { type: 'inspection', id: context.id }
  if (context.type === 'product' && typeof context.id === 'string') return { type: 'product', id: context.id }
  if (context.type === 'report' && typeof context.id === 'string') return { type: 'report', id: context.id }
  if (context.type === 'finding' && typeof context.id === 'string' && typeof context.inspectionId === 'string') return { type: 'finding', id: context.id, inspectionId: context.inspectionId }
  return { type: 'workspace' }
}

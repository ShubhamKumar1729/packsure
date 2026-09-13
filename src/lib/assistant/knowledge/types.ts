/**
 * Shape of one retrieval document. The corpus is modular: each category lives in its own module
 * under src/lib/assistant/knowledge/, and adding knowledge means appending a document object (or a
 * whole new category module) without touching retrieval, prompts, or the UI.
 */

export type KnowledgeCategory = 'overview' | 'feature' | 'faq' | 'navigation' | 'workflow' | 'troubleshooting'

export type KnowledgeDoc = {
  id: string
  title: string
  category: KnowledgeCategory
  text: string
}

export const KNOWLEDGE_CATEGORIES: { id: KnowledgeCategory; label: string }[] = [
  { id: 'overview', label: 'platform overview and roles' },
  { id: 'feature', label: 'feature explanations' },
  { id: 'faq', label: 'frequently asked questions' },
  { id: 'navigation', label: 'navigation instructions' },
  { id: 'workflow', label: 'user workflows and operations' },
  { id: 'troubleshooting', label: 'troubleshooting and help' },
]

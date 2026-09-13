/**
 * The PackSure knowledge corpus Pia retrieves from (RAG). Modular by category: overview, features,
 * FAQs, navigation, workflows, and troubleshooting each live in their own module; this index merely
 * concatenates them, so expanding the corpus never requires changing retrieval or prompt code.
 */

import { FAQ_DOCS } from './faq'
import { FEATURE_DOCS } from './feature'
import { NAVIGATION_DOCS } from './navigation'
import { OVERVIEW_DOCS } from './overview'
import { TROUBLESHOOTING_DOCS } from './troubleshooting'
import { WORKFLOW_DOCS } from './workflow'
import type { KnowledgeDoc } from './types'

export const KNOWLEDGE: KnowledgeDoc[] = [
  ...OVERVIEW_DOCS,
  ...FEATURE_DOCS,
  ...FAQ_DOCS,
  ...NAVIGATION_DOCS,
  ...WORKFLOW_DOCS,
  ...TROUBLESHOOTING_DOCS,
]

export * from './types'

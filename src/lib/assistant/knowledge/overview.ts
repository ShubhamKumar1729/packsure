/**
 * Platform overview, roles, and security model.
 */

import type { KnowledgeDoc } from './types'

export const OVERVIEW_DOCS: KnowledgeDoc[] = [
  {
    id: 'overview-platform',
    title: 'What PackSure is',
    category: 'overview',
    text: 'PackSure is an evidence-first, GovTech-oriented compliance workspace for packaged commodity inspections. It connects real package evidence (photos captured with the camera or uploaded), provider-independent AI assessment, administrator-configured legal rules, human review, final decisions, and downloadable compliance reports. Three layers are kept strictly separate: AI assessment only extracts evidence from images; the rule engine is the only component that produces a compliance status; and human reviewers make the binding decisions, every one of which is written to an audit log.',
  },
  {
    id: 'overview-roles',
    title: 'Roles and who can do what',
    category: 'overview',
    text: 'There are four roles: admin, inspector, reviewer, and viewer. Inspectors and admins can create inspections. Admins, inspectors, and reviewers can run AI analysis and the rule engine. Admins and inspectors can run an online listing comparison. Only admins and reviewers can accept or reject findings, correct extracted values, add review comments, and publish the final decision. Admins, inspectors, and reviewers can generate reports. Admins and reviewers can view rule configuration, but only admins can create, enable, disable, or version rules. Each user sees the records they created; admins and reviewers see all records. There is no public signup and no default account: an administrator provisions users.',
  },
  {
    id: 'overview-auth',
    title: 'Login, sessions, and security',
    category: 'overview',
    text: 'Authentication uses an email and password stored as a bcrypt hash. A successful login sets an HTTP-only signed JWT session cookie named packsure_session with an eight-hour lifetime; logout clears it. There is no password reset flow and no public registration in the application itself. API routes verify the session server-side before touching any data.',
  },
]

/**
 * Frequently asked questions and their grounded answers.
 */

import type { KnowledgeDoc } from './types'

export const FAQ_DOCS: KnowledgeDoc[] = [
  {
    id: 'faq-status-meanings',
    title: 'What each status value means',
    category: 'faq',
    text: 'Compliance status, produced only by the rule engine: PASS means the applicable rules were satisfied; VIOLATION means at least one rule was violated; REVIEW_REQUIRED means evidence was insufficient, confidence was below the configured threshold, or a rule explicitly needs a human; NOT_APPLICABLE means no enabled rule applied. Human finding decision: PENDING, ACCEPTED, REJECTED. Final decision: PENDING, COMPLIANT, VIOLATION. Inspection lifecycle: submitted, in_review, closed; publishing a final decision closes the inspection. Analysis status: running, completed, failed. Listing comparison: MATCHED, MISMATCH, REVIEW_REQUIRED.',
  },
  {
    id: 'faq-why-null-score',
    title: 'Why is my compliance score empty or null?',
    category: 'faq',
    text: 'The compliance score is null in two deliberate cases: when no rule was applicable at all, and when any single result is REVIEW_REQUIRED. In the second case a human still has to resolve the uncertain result, so publishing a percentage would be misleading. Once reviewers accept or reject the pending findings and compliance is re-run, the score becomes meaningful again.',
  },
  {
    id: 'faq-no-fields',
    title: 'Analysis completed but extracted nothing',
    category: 'faq',
    text: 'With AI_PROVIDER=mock this is expected, not a bug: the mock provider processes the real stored image bytes but intentionally returns no OCR text, no fields, no declarations, and no business values, because it must never invent an MRP or a net quantity. Compliance then usually reports NOT_APPLICABLE because there were no fields for the rules to test. To get real extraction an administrator implements the AIProvider interface server-side and registers it.',
  },
  {
    id: 'faq-empty-database',
    title: 'Everything is empty on first run',
    category: 'faq',
    text: 'A fresh database is intentionally empty: no seed products, no sample inspections, no demo users, no fake statistics, and no preloaded legal rules. Empty lists show professional empty states, and the dashboard shows a live-data connection state when MongoDB is unreachable instead of inventing numbers. An administrator must create user accounts and verified rule definitions before meaningful compliance results can appear.',
  },
  {
    id: 'faq-camera-permission',
    title: 'Camera asks for permission or stays unavailable',
    category: 'faq',
    text: 'Camera access requires a secure context: HTTPS in production, or localhost in development. Inside an iframe the embedding page must also grant the camera permission. If the device has no camera or denies permission, the capture step offers an upload fallback that stores images through exactly the same pipeline. Leaving the capture step releases the device; returning resumes it automatically. If a preview ever appears live but produces no capture, selecting Capture photo reports that the preview is not live and resets the panel instead of failing silently.',
  },
  {
    id: 'faq-who-can-publish',
    title: 'Who can publish a final decision and when',
    category: 'faq',
    text: 'Only admins and reviewers can publish a final decision, and only after a compliance run exists and every finding from that run has been accepted or rejected, so nothing is left PENDING. The decision is COMPLIANT or VIOLATION. Publishing closes the inspection; re-running analysis or compliance reopens it and logs the reopening.',
  },
  {
    id: 'faq-assistant-privacy',
    title: 'Where Pia runs and what she can see',
    category: 'faq',
    text: 'Pia reasons server-side through the Groq API: your question, the relevant PackSure documentation, and the conversation history are sent to Groq from the PackSure server, and the Groq API key never leaves the server. Record lookups happen through the same authenticated PackSure APIs your own session uses, so Pia only ever sees records your role allows, and operations she proposes run only after you confirm them. Nothing is downloaded to your browser and no model runs on your device.',
  },
  {
    id: 'faq-assistant-limits',
    title: 'What the assistant will not do',
    category: 'faq',
    text: 'The assistant explains and retrieves; it never mutates compliance data by itself. It does not change a compliance result, a human review decision, a final decision, or an audit entry, and it does not create rules or users. When you ask it to start an operation such as analysis, a compliance run, a listing comparison, or a report, it presents a confirmation control and only proceeds if you approve. If a capability does not exist in PackSure, the assistant says it is not implemented instead of pretending otherwise.',
  },
]

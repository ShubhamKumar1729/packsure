/**
 * End-to-end user workflows, including inspection and compliance.
 */

import type { KnowledgeDoc } from './types'

export const WORKFLOW_DOCS: KnowledgeDoc[] = [
  {
    id: 'workflow-end-to-end',
    title: 'The end-to-end inspection workflow',
    category: 'workflow',
    text: 'The full journey is: Dashboard, New inspection, Product information, Camera or upload capture, Review of captures, Save, Analyze inspection (AI), Run rule checks (compliance), Human review of findings, Final decision, Generate report. Each stage writes real records: saving creates one Product, one Inspection, and one InspectionImage per image; analysis stores extracted evidence; the rule engine stores a compliance result; review stores findings with human decisions and audit entries; the report stores an immutable snapshot.',
  },
  {
    id: 'workflow-capture',
    title: 'Capture step: camera and upload',
    category: 'workflow',
    text: 'The capture wizard has four steps: product information, capture, review, and save. Only the product name is required to continue; brand, manufacturer, pack size, unit, batch number, declared retail price, and online listing URL are optional and stored exactly as entered. Capture uses the real browser camera through navigator.mediaDevices.getUserMedia with a rear-camera preference on mobile, plus an upload fallback. Up to ten images per inspection, each labelled front, back, side, top, or bottom, each at most 8 MB. Before saving you can relabel, reorder, remove, or retake any image. Camera captures become JPEGs and use exactly the same stored structure as uploads, with the source preserved as camera or upload. The camera is released whenever you leave the capture step and resumes automatically when you return, without asking for permission again.',
  },
  {
    id: 'workflow-analysis',
    title: 'AI analysis stage',
    category: 'workflow',
    text: 'Analyze inspection runs the server-side AI provider over the stored image bytes and stores an InspectionAnalysis with OCR text, extracted fields, declarations, and measurements, each linked back to its source image and optionally a normalized bounding box. The AI layer is a provider abstraction: with the built-in mock provider configured, analysis completes successfully but stores no extracted values, because the mock deliberately never invents an MRP, net quantity, manufacturer, or any other business value. Real extraction requires an administrator to register a real provider implementation. AI output is evidence only; it never decides compliance.',
  },
  {
    id: 'workflow-compliance',
    title: 'Rule engine and compliance evaluation',
    category: 'workflow',
    text: 'Run rule checks evaluates every enabled administrator-configured rule against the stored analysis and produces one compliance run: a status, an optional score, and per-rule results. The statuses are PASS, VIOLATION, REVIEW_REQUIRED, and NOT_APPLICABLE. Aggregation is worst-case: any VIOLATION makes the run VIOLATION; otherwise any REVIEW_REQUIRED makes it REVIEW_REQUIRED; otherwise any PASS makes it PASS; otherwise NOT_APPLICABLE. The score is the percentage of applicable results that passed, and it is deliberately null whenever any result is REVIEW_REQUIRED or nothing was applicable, because the number would not be meaningful. A finding is created for every VIOLATION or REVIEW_REQUIRED result.',
  },
  {
    id: 'workflow-review',
    title: 'Human review of findings',
    category: 'workflow',
    text: 'On the review screen a reviewer sees each finding with its rule name, rule key and version, legal reference, severity, AI status, detected value, expected requirement, confidence, reviewer comment, and the evidence image with any bounding box drawn over it. Reviewers can accept a finding, reject it, correct an extracted value, and add or edit a comment. Every action is written to the review audit log with the actor, timestamp, previous and new decision, previous and new value, and comment. Changing a finding after the inspection was finalized reopens the final decision and logs the reopening.',
  },
  {
    id: 'workflow-final-decision',
    title: 'Publishing the final decision',
    category: 'workflow',
    text: 'Only admins and reviewers can publish a final decision, and only COMPLIANT or VIOLATION can be chosen. Two conditions must hold: a compliance run must exist, and no finding from that run may still be PENDING, meaning every finding was explicitly accepted or rejected. Publishing closes the inspection. Re-running analysis or compliance afterwards reopens the decision back to PENDING and records that in the audit log, so nothing is silently overwritten.',
  },
  {
    id: 'workflow-reports',
    title: 'Report generation and download',
    category: 'workflow',
    text: 'Reports are generated only from persisted inspection records and require a compliance run to exist. A report is an immutable snapshot containing the product, the inspection, stored image metadata, the AI analysis, the compliance results, the findings with their human decisions, and the full audit history. Reports can be viewed in the app or downloaded as a single self-contained HTML file with the evidence images embedded as base64. A download refuses to generate if any stored evidence image is unavailable rather than inserting a blank placeholder. Admins, inspectors, and reviewers can generate reports; each user sees their own unless they are an admin or reviewer.',
  },
  {
    id: 'workflow-operations',
    title: 'Operations a user can trigger, per record',
    category: 'workflow',
    text: 'On an inspection page the existing operations are: Analyze inspection (POST analyze) runs the AI provider over stored images; Run rule checks (POST compliance) evaluates enabled rules; listing comparison (POST listing-comparison) compares the declared price with an online listing; and Generate report (POST reports) snapshots the inspection into a report. Each is also available as a button in the app UI, and the assistant can offer to start any of them with your confirmation. Review actions (accept, reject, correct value, comment) and the final decision remain manual, human-only controls on the review screen.',
  },
]

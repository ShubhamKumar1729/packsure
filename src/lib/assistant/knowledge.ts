/**
 * The assistant's local platform knowledge base.
 *
 * These documents are the retrieval corpus for the Compliance AI assistant. They are bundled with
 * the app (no network fetch, no database) and embedded on-device the first time the assistant is
 * opened, so answers are grounded in real documentation instead of hardcoded if/else responses.
 *
 * Every statement here describes behaviour that actually exists in this codebase. If a feature is
 * not described here, the assistant must say it is not implemented rather than invent it.
 */

export type KnowledgeCategory = 'overview' | 'feature' | 'faq' | 'navigation' | 'workflow' | 'troubleshooting'

export type KnowledgeDoc = {
  id: string
  title: string
  category: KnowledgeCategory
  text: string
}

export const KNOWLEDGE: KnowledgeDoc[] = [
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
    id: 'feature-rules-admin',
    title: 'Rules administration',
    category: 'feature',
    text: 'Administrators configure the compliance rules on the Rules page. A rule stores a key, name, description, check area, jurisdiction, a verified legal reference, an expected requirement, a severity, a version, an enabled flag, and a machine-readable definition. The six rule kinds are field_presence, declaration_presence, field_numeric, measurement_threshold, field_pattern, and manual_review. Check areas cover MRP, net quantity, manufacturer or packer or importer, customer care details, required declarations, readability and font size, unit sale price, and declaration validation. Rules are created disabled and the database starts empty: the platform ships no legal thresholds and invents none. Key plus version is unique; publishing a new version creates it disabled and links it to the rule it supersedes.',
  },
  {
    id: 'feature-products',
    title: 'Products and inspection history',
    category: 'feature',
    text: 'Every saved inspection belongs to a Product record holding the package identity: name, brand, manufacturer, pack size, unit, batch number, and declared retail price. The product detail page lists all inspections of that product with their compliance status, score, final decision, and creation date, plus every finding across those inspections. This makes repeat violations visible: the same rule key violating on more than one inspection of the same product.',
  },
  {
    id: 'feature-listing-comparison',
    title: 'Online listing and MRP comparison',
    category: 'feature',
    text: 'A listing comparison checks the declared retail price against an online marketplace listing for the same product. It is a marketplace provider abstraction with a generic HTTP provider and server-side URL safety checks; with no provider configured the comparison reports that no live marketplace data is connected instead of fabricating a price. Results are stored per inspection with a status of MATCHED, MISMATCH, or REVIEW_REQUIRED, together with the compared prices and the source URL. Admins and inspectors can trigger it from an inspection.',
  },
  {
    id: 'feature-dashboard',
    title: 'Dashboard and risk score',
    category: 'feature',
    text: 'The dashboard shows total inspections, violations, review-required counts, recent inspections, a compliance trend grouped by evaluation month, the most common violations, repeat violations, and a risk indicator. The compliance rate excludes NOT_APPLICABLE evaluations because they say nothing about compliance. Risk is a transparent 0 to 100 score from four capped factors: repeated violations (10 each, cap 30), violations in the last 30 days (5 each, cap 25), severity of the latest violation findings (LOW 4, MEDIUM 10, HIGH 18, CRITICAL 25, cap 30), and unresolved PENDING findings (5 each, cap 20). Levels are LOW 0-24, MODERATE 25-49, HIGH 50-74, CRITICAL 75-100. It is a prioritization aid, not a legal determination. If MongoDB is unreachable the dashboard shows a live-data connection state instead of making up values.',
  },
  {
    id: 'feature-evidence',
    title: 'Evidence images and bounding boxes',
    category: 'feature',
    text: 'Image bytes are stored in MongoDB and served only through an authenticated endpoint scoped to their inspection; nothing is hosted on a public CDN. Every extracted field, declaration, and finding can carry a link back to its source image with an optional normalized bounding box where each of x, y, width, and height runs from 0 to 1, plus a text excerpt. The review screen draws that box over the stored image so a reviewer can see exactly where the AI looked.',
  },
  {
    id: 'feature-assistant',
    title: 'The Compliance AI assistant itself',
    category: 'feature',
    text: 'The Compliance AI assistant is the floating robot in the bottom-right corner of every authenticated page, also reachable from the Ask Compliance AI button in the header. It runs a small open-source language model entirely on your own device through WebGPU or WebAssembly, with no API key, no external AI service, and no separate application to install. It answers from this local knowledge base using retrieval, can read your authorized records through the same APIs the app uses, can navigate you to any section, and can offer to start operations that already exist, always with your confirmation. It keeps the conversation history so follow-up questions work. Its answers are advisory: it never changes a compliance result, a human review decision, a final decision, or the audit log.',
  },
  {
    id: 'navigation-sections',
    title: 'Where everything is: sections and routes',
    category: 'navigation',
    text: 'The workspace sidebar and these routes cover the whole app: /app is the dashboard; /app/new-inspection starts the capture wizard; /app/inspections lists inspections and /app/inspections/<id> opens one; /app/inspections/<id>/review is the human review screen; /app/products lists products and /app/products/<id> shows a product with its inspection history; /app/reports lists reports and /app/reports/<id> opens one; /app/rules is rule administration (admins). The login page is /login. The sidebar shows only the entries your role can access.',
  },
  {
    id: 'navigation-howto',
    title: 'How to navigate and ask the assistant to navigate',
    category: 'navigation',
    text: 'Use the sidebar on the left (or the menu button on small screens) to switch sections; the header shows the current page title. You can also simply tell the assistant where you want to go, for example "take me to the reports" or "open the rules page", and it will navigate for you. To look at a specific record, open it from its list page, or ask the assistant to open a record whose ID you mention.',
  },
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
    title: 'Where does the assistant run and what does it see?',
    category: 'faq',
    text: 'The assistant model runs locally in your browser on your own device; no question, record, or answer ever leaves the application except the normal authenticated API calls the app itself makes to read your records. The model and its index are downloaded once from the open model repository and cached in your browser, so later visits start instantly and work without re-downloading. The assistant only reads records your role is allowed to see, and it can only offer to trigger operations that already exist in the app, with your explicit confirmation.',
  },
  {
    id: 'troubleshooting-login',
    title: 'Login says authentication is not configured',
    category: 'troubleshooting',
    text: 'That message means AUTH_SECRET is missing from .env.local. Copy .env.example to .env.local, set AUTH_SECRET to a long random value (openssl rand -base64 32 works), and restart the dev server, because environment variables are read only at startup.',
  },
  {
    id: 'troubleshooting-mongodb',
    title: 'MongoDB connection errors',
    category: 'troubleshooting',
    text: 'Start MongoDB locally or point MONGODB_URI at an Atlas cluster, then restart the dev server. While MongoDB is unreachable the dashboard shows a live-data connection state, lists stay empty, and record pages report that data could not be loaded; nothing is fabricated in place of real records.',
  },
  {
    id: 'troubleshooting-assistant-model',
    title: 'The assistant cannot download its model',
    category: 'troubleshooting',
    text: 'On first use the assistant downloads its small open-source model and embedding index from the open Hugging Face repository and caches them in the browser. If that download is blocked by a corporate proxy or an offline network, the assistant says so plainly and still offers retrieval-based document answers where possible. Connecting to a network that can reach huggingface.co once is enough; after that the cached model works offline.',
  },
  {
    id: 'troubleshooting-not-applicable',
    title: 'Compliance is NOT_APPLICABLE',
    category: 'troubleshooting',
    text: 'NOT_APPLICABLE means no enabled rule applied to the stored analysis. Either no rules are enabled yet (an administrator must add verified rule definitions and enable them on the Rules page), or the analysis returned no fields for the rules to test, which is the expected outcome with the mock AI provider.',
  },
  {
    id: 'troubleshooting-blank-preview',
    title: 'Camera preview went blank after moving between steps',
    category: 'troubleshooting',
    text: 'Leaving the capture step intentionally releases the camera device, and the panel returns to its off state with the enable control visible. Returning to the capture step resumes the camera automatically without a new permission prompt. A blank preview with a live indicator should not happen anymore; if a capture is attempted while the preview is not live, the app reports it and resets the panel.',
  },
  {
    id: 'faq-assistant-limits',
    title: 'What the assistant will not do',
    category: 'faq',
    text: 'The assistant explains and retrieves; it never mutates compliance data by itself. It does not change a compliance result, a human review decision, a final decision, or an audit entry, and it does not create rules or users. When you ask it to start an operation such as analysis, a compliance run, a listing comparison, or a report, it presents a confirmation control and only proceeds if you approve. If a capability does not exist in PackSure, the assistant says it is not implemented instead of pretending otherwise.',
  },
  {
    id: 'workflow-operations',
    title: 'Operations a user can trigger, per record',
    category: 'workflow',
    text: 'On an inspection page the existing operations are: Analyze inspection (POST analyze) runs the AI provider over stored images; Run rule checks (POST compliance) evaluates enabled rules; listing comparison (POST listing-comparison) compares the declared price with an online listing; and Generate report (POST reports) snapshots the inspection into a report. Each is also available as a button in the app UI, and the assistant can offer to start any of them with your confirmation. Review actions (accept, reject, correct value, comment) and the final decision remain manual, human-only controls on the review screen.',
  },
]

/** Rendered into the system prompt so the model knows the corpus exists and stays humble about gaps. */
export const KNOWLEDGE_CATEGORIES: { id: KnowledgeCategory; label: string }[] = [
  { id: 'overview', label: 'platform overview and roles' },
  { id: 'feature', label: 'feature explanations' },
  { id: 'faq', label: 'frequently asked questions' },
  { id: 'navigation', label: 'navigation instructions' },
  { id: 'workflow', label: 'user workflows and operations' },
  { id: 'troubleshooting', label: 'troubleshooting and help' },
]

/**
 * Feature explanations for every PackSure capability.
 */

import type { KnowledgeDoc } from './types'

export const FEATURE_DOCS: KnowledgeDoc[] = [
  {
    id: 'feature-ai-analysis-pipeline',
    title: 'AI analysis pipeline (OCR, NER, evidence)',
    category: 'feature',
    text: 'Analysis runs server-side through the Python NLP service: image preprocessing, Tesseract OCR with per-word bounding boxes and confidence, legal-metrology named-entity recognition over the OCR text, deterministic normalization (500G becomes 500 g, Rs.120/- becomes the rupee-120 form, dates become year-month), and computer-vision observations such as barcode decoding and pixel character-height estimation. Every extracted field keeps its raw OCR value, a confidence score banded high or medium or low, and a bounding box that the inspection page overlays on the stored image as evidence. When the trained model artifact is absent the service uses a transparent keyword pattern extractor and every response is flagged degraded, which the analysis viewer discloses. Missing fields are never invented; an unreachable service is reported as unavailable instead of producing fake results.',
  },
  {
    id: 'feature-rules-admin',
    title: 'Rules administration',
    category: 'feature',
    text: 'Administrators configure the compliance rules on the Rules page. A rule stores a key, name, description, check area, jurisdiction, a verified legal reference, an expected requirement, an optional remediation hint, a severity, a version, an enabled flag, and a machine-readable definition. The seven rule kinds are field_presence, any_field_presence (passes when any of several fields exists), declaration_presence, field_numeric, measurement_threshold, field_pattern, and manual_review. Check areas cover MRP, net quantity, manufacturer or packer or importer, customer care details, required declarations, readability and font size, unit sale price, and declaration validation. Rules are created disabled and the database starts empty: the platform ships no legal thresholds and invents none. The Rules page can also install the built-in Legal Metrology (Packaged Commodities) Rules 2011 baseline ruleset, which installs disabled unless the admin acknowledges having verified the references. Key plus version is unique; publishing a new version creates it disabled and links it to the rule it supersedes.',
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
    title: 'Pia, the PackSure AI assistant',
    category: 'feature',
    text: 'Pia is the floating robot assistant in the bottom-right corner of every authenticated page, also reachable from the Ask Pia button in the header. All of Pia\'s reasoning runs server-side on the Groq API (model configurable via GROQ_MODEL, default openai/gpt-oss-120b); the GROQ_API_KEY secret stays on the server and never reaches browsers. Pia answers from this local PackSure knowledge base using retrieval (BM25 candidates plus a semantic selection pass), keeps the conversation history so follow-up questions work, and can call structured tools: navigate to a section, list your documents or reports, read an inspection\'s analysis or listing comparison, and propose existing operations (analysis, compliance run, listing comparison, report generation) which only execute after you confirm in a confirmation card. Pia is advisory: she never changes a compliance result, a human review decision, a final decision, or the audit log, and review and final-decision actions remain human-only.',
  },
]

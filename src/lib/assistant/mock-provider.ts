import { ASSISTANT_BOUNDARY, buildReferences } from '@/lib/assistant/prompt'
import type {
  AssistantAnswer,
  AssistantFinding,
  AssistantProvider,
  AssistantProviderInput,
} from '@/lib/assistant/types'

const severityOrder: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }

const OFFLINE_NOTICE = 'No language model is configured, so this is PackSure\'s built-in offline responder. It answers from the platform knowledge base and your authorized records, but it cannot hold an open-ended conversation. Set ASSISTANT_PROVIDER and an API key in .env.local for full conversational answers.'

function strongest(findings: AssistantFinding[]) {
  return [...findings].sort((a, b) => (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0))[0]
}

function findingLabel(finding: AssistantFinding) {
  return `${finding.ruleName} (${finding.severity})`
}

function findingText(finding: AssistantFinding) {
  const detected = finding.correctedValue || finding.detectedValue || 'no detected value stored'
  return `${finding.ruleName} is marked ${finding.aiStatus} at ${finding.severity} severity. Rule ${finding.ruleKey} v${finding.ruleVersion} expected "${finding.expectedRequirement}" and the stored value was "${detected}" at ${Math.round(finding.confidence * 100)}% confidence. Reference: ${finding.ruleReference}. Human review is ${finding.humanDecision}.`
}

type Topic = { test: RegExp; answer: string }

/**
 * Offline platform answers. These are curated rather than generated so the assistant is still
 * accurate and useful before anyone configures a model, and so it never invents a fact.
 */
const TOPICS: Topic[] = [
  {
    test: /\b(workflow|how (does|do) (it|this|packsure) work|steps|process|pipeline|journey|flow)\b/,
    answer: 'The full journey is: Dashboard → New inspection → Product information → Camera or upload → Review → Save → Analyze inspection → Run rule checks → Human review → Final decision → Generate report. The capture wizard has four steps, and only the product name is required to continue. Saving creates one Product, one Inspection, and one InspectionImage per image. After that the AI analysis extracts evidence, the rule engine turns that evidence into a compliance status, a reviewer adjudicates each finding, and only then can a final decision be published.',
  },
  {
    test: /\b(role|permission|who can|allowed|access|admin|inspector|reviewer|viewer|authoriz)\w*\b/,
    answer: 'There are four roles. Inspectors and admins can create inspections; admins, inspectors, and reviewers can run AI analysis and the rule engine; admins and inspectors can run a listing comparison; only admins and reviewers can accept or reject findings and publish a final decision; admins, inspectors, and reviewers can generate reports; admins and reviewers can view rules, but only admins can create, enable, disable, or version them. Everyone sees the records they created, while admins and reviewers see all records. There is no public signup and no default user.',
  },
  {
    test: /\b(status|pass|violation|review_required|not_applicable|what does .* mean|compliance rate|score)\b/,
    answer: 'Compliance statuses come only from the rule engine: PASS means the applicable rules were satisfied, VIOLATION means at least one rule was violated, REVIEW_REQUIRED means evidence was insufficient or confidence was below the configured threshold, and NOT_APPLICABLE means no enabled rule applied. Aggregation is worst-case, so any VIOLATION makes the whole run a VIOLATION. The score is the percentage of applicable results that passed, and it is deliberately null whenever anything is REVIEW_REQUIRED, because the number would not be meaningful until a human resolves it.',
  },
  {
    test: /\b(rule|rules|rule kind|check area|severity|version|enable|disable|threshold|legal reference)\b/,
    answer: 'Rules are configured by administrators and are the only thing that decides compliance. Each rule has a key, name, description, check area, jurisdiction, a verified legal reference, an expected requirement, a severity, a version, an enabled flag, and a machine-readable definition. The six rule kinds are field_presence, declaration_presence, field_numeric, measurement_threshold, field_pattern, and manual_review. Check areas cover MRP, net quantity, manufacturer or packer or importer, customer care, required declarations, readability and font size, unit sale price, and declaration validation. Rules are created disabled and the database starts empty — the platform ships no legal thresholds and invents none. Key plus version is unique, and a new version is always created disabled and linked to the rule it supersedes.',
  },
  {
    test: /\b(finding|findings|accept|reject|correct|comment|human review|audit)\b/,
    answer: 'A finding is created for every rule result that is VIOLATION or REVIEW_REQUIRED. It carries the rule identity and version, the legal reference, severity, the AI status, the detected value, any reviewer-corrected value, the expected requirement, confidence, evidence links back to the source image, and the reviewer comment. Reviewers accept or reject each finding, and every action is written to the audit log with the actor, timestamp, previous and new decision, previous and new value, and comment. Changing a finding after finalization reopens the final decision and logs that reopening.',
  },
  {
    test: /\b(final decision|finalize|compliant|publish|close|pending findings)\b/,
    answer: 'Only admins and reviewers can publish a final decision, and it can only be set to COMPLIANT or VIOLATION. Two conditions must hold first: a compliance run must exist, and no finding from that run may still be PENDING — every finding has to be explicitly accepted or rejected. Publishing closes the inspection. Re-running analysis or compliance afterwards reopens the decision back to PENDING and records that in the audit log, so nothing is silently overwritten.',
  },
  {
    test: /\b(report|reports|download|export|pdf|html)\b/,
    answer: 'Reports are generated only from persisted inspection records and require a compliance run to exist. A report is an immutable snapshot holding the product, the inspection, stored image metadata, the AI analysis, the compliance results, the findings with their human decisions, and the full audit history. You can view it in the app or download a single self-contained HTML file with the evidence images embedded as base64. A download refuses to generate if any stored evidence image is unavailable rather than inserting a blank placeholder.',
  },
  {
    test: /\b(listing|marketplace|online|mrp|selling price|amazon|flipkart|compare|comparison)\b/,
    answer: 'Officers can supply an online listing URL at capture time or later on the inspection detail page. A server-side provider retrieves the page and extracts product name, brand, MRP, net quantity, manufacturer, and important declarations from HTML, JSON-LD, and meta tags. The critical rule is that MRP is used only when the source explicitly labels it as MRP, maximum retail price, list price, or MSRP — an online selling price is never treated as MRP, because a discount below MRP is normal and is not a violation. Values are normalized before comparison, quantities are converted to a common unit, and each field becomes MATCHED, MISMATCH, or REVIEW_REQUIRED when one side is missing a value.',
  },
  {
    test: /\b(dashboard|risk|trend|metric|statistic|repeat|analytics)\b/,
    answer: 'The dashboard reads directly from the database: total inspections, compliance rate, violations, review required, recent inspections, a compliance trend grouped by evaluation month, the most common violations, repeat violations, and a risk indicator. The compliance rate excludes NOT_APPLICABLE evaluations because they say nothing about compliance. Repeat violations are the same product and rule key violating across more than one inspection. Risk is a transparent 0 to 100 score from four capped factors: repeated violations (10 each, cap 30), violations in the last 30 days (5 each, cap 25), severity of the latest violation findings (LOW 4, MEDIUM 10, HIGH 18, CRITICAL 25, cap 30), and unresolved PENDING findings (5 each, cap 20). Levels are LOW 0-24, MODERATE 25-49, HIGH 50-74, CRITICAL 75-100. It is a prioritization aid, not a legal determination.',
  },
  {
    test: /\b(ai|ocr|extract|mock|provider|no fields|empty analysis|confidence|model)\b/,
    answer: 'The AI layer is a server-side provider abstraction; the browser never calls a model directly. The built-in MockAIProvider consumes the real stored image bytes but intentionally returns no OCR text, no fields, no declarations, and no business values — it cannot invent an MRP, a net quantity, or a manufacturer. So with it configured, analysis completes successfully but yields zero extracted values, which is expected and not a bug. To get real extraction an administrator implements the AIProvider interface, registers it, and sets AI_PROVIDER. A NOT_APPLICABLE compliance result usually means either no rules are enabled, or the analysis returned no fields for the rules to test.',
  },
  {
    test: /\b(camera|photo|capture|upload|image|images|webcam|picture)\b/,
    answer: 'Capture uses the real browser camera through navigator.mediaDevices.getUserMedia with a rear-camera preference on mobile, and there is always an upload fallback. Camera captures become JPEG files and use exactly the same stored structure as uploads, with the source preserved as camera or upload. You can add up to 10 images per inspection, each labelled front, back, side, top, or bottom, each at most 8 MB, and you can relabel, reorder, remove, or retake before saving. Image bytes are stored in MongoDB and served only through an authenticated endpoint scoped to the inspection. The camera is released when you leave the capture step and resumes automatically when you return. Camera access needs a secure context, and inside an iframe the embedding page must permit it.',
  },
  {
    test: /\b(evidence|show me|proof|where|source|bounding box)\b/,
    answer: 'Evidence points back at the exact source image, optionally with a normalized bounding box where each of x, y, width, and height runs from 0 to 1, plus a text excerpt. Every extracted field, declaration, and finding carries that link, and the review screen draws the box over the stored image. Nothing is hosted on a public CDN — image bytes live in MongoDB and are served through an authenticated route.',
  },
  {
    test: /\b(what can you do|help|capabilit|who are you|what are you|assistant|features)\b/,
    answer: 'I know this whole platform and I can read your authorized records. Ask me why an inspection failed, which rule caused a result, which finding is more serious, what a status means, who is allowed to do something, how the workflow runs, what happened in a previous inspection of the same product, how MRP comparison works, or how the risk score is calculated. I can also show the stored evidence images behind a finding. What I cannot do is change anything — I never alter a compliance result, a review decision, a final decision, or the audit log.',
  },
]

const SMALL_TALK: Topic[] = [
  { test: /^(hi|hey|hello|yo|good (morning|afternoon|evening))\b/, answer: 'Hello. I am the PackSure assistant. Ask me about a specific inspection, finding, product, or report, or about how any part of this platform works.' },
  { test: /\b(thanks|thank you|cheers|appreciate)\b/, answer: 'You are welcome. Ask me anything else about this record or about how PackSure works.' },
  { test: /\b(bye|goodbye|see you)\b/, answer: 'Goodbye. I will be here whenever you open another compliance record.' },
]

/**
 * The built-in responder. It is a real, useful assistant — it answers platform questions from a
 * curated knowledge base and record questions from the authorized tool results — but it is not a
 * language model, so it always reports mode 'offline' and says so.
 */
export class MockAssistantProvider implements AssistantProvider {
  readonly id = 'packsure-offline'
  readonly version = '2.0.0'
  private readonly notice: string

  constructor(notice: string = OFFLINE_NOTICE) {
    this.notice = notice
  }

  async answer(input: AssistantProviderInput): Promise<AssistantAnswer> {
    const question = input.question.trim().toLowerCase()
    const { tools } = input
    const { citations, evidence } = buildReferences(tools)
    const actionable = [
      ...tools.findings.filter((finding) => finding.aiStatus === 'VIOLATION'),
      ...tools.findings.filter((finding) => finding.aiStatus === 'REVIEW_REQUIRED'),
    ]
    const inspection = tools.inspection

    let text = ''

    if (/evidence|show (me )?(the )?(image|photo|proof)|photo|image/.test(question) && tools.evidence.length > 0) {
      const withImages = evidence.filter((item) => item.imageUrl)
      text = `There ${withImages.length === 1 ? 'is' : 'are'} ${withImages.length} stored package image${withImages.length === 1 ? '' : 's'} available for this context, shown below. ${withImages.some((item) => item.source === 'finding_evidence') ? 'Finding-linked evidence is marked separately from the full image set. ' : ''}Images are served from MongoDB through an authenticated endpoint, never from a public CDN.`
    } else if (/more serious|serious|severity|priority|which (one|finding) is worse|rank/.test(question) && actionable.length > 0) {
      text = actionable.length === 1
        ? `Only one actionable finding is stored here: ${findingLabel(actionable[0])}. There is no second finding to rank against it.`
        : `Ranking by stored severity, ${findingLabel(strongest(actionable))} is the most serious. ${actionable.map(findingText).join(' ')}`
    } else if (/previous|prior|history|earlier|last inspection|before/.test(question) && tools.productHistory) {
      const list = tools.productHistory.inspections
      const previous = list.slice(1, 4)
      text = previous.length === 0
        ? `Only one inspection is stored for "${tools.productHistory.product.name}", so there is no earlier inspection to compare against.`
        : `Earlier stored inspections for "${tools.productHistory.product.name}": ${previous.map((item) => `${new Date(item.createdAt).toLocaleDateString()} — ${item.compliance?.status || 'not evaluated'}${item.compliance && item.compliance.score !== null ? ` (${item.compliance.score}%)` : ''}`).join('; ')}.`
    } else if (/why|fail|failed|violation|explain|wrong|issue|problem/.test(question) && (actionable.length > 0 || inspection)) {
      text = actionable.length === 0
        ? `This inspection is stored with compliance ${inspection?.compliance?.status || 'not evaluated'} and final decision ${inspection?.finalDecision || 'PENDING'}. No violation or review-required finding is stored for this context, so there is nothing to explain as a failure.`
        : `${inspection ? `Compliance is ${inspection.compliance?.status || 'not evaluated'} and the stored final decision is ${inspection.finalDecision}. ` : ''}${actionable.map(findingText).join(' ')}`
    } else if (/which rule|what rule|caused|rule reference|under which/.test(question) && actionable.length > 0) {
      text = actionable.map((finding) => {
        const rule = tools.rules.find((candidate) => candidate.key === finding.ruleKey)
        return rule
          ? `${finding.ruleName} was produced by rule ${finding.ruleKey} v${finding.ruleVersion}, check area ${rule.checkArea}, jurisdiction ${rule.jurisdiction}. Reference: "${finding.ruleReference}". Expected: "${finding.expectedRequirement}". The rule is currently ${rule.enabled ? 'enabled' : 'disabled'}.`
          : `${finding.ruleName} was recorded under rule ${finding.ruleKey} v${finding.ruleVersion} with reference "${finding.ruleReference}". The current rule record was not returned by the authorized rule tool, so I cannot confirm whether it is still enabled.`
      }).join(' ')
    } else {
      for (const topic of SMALL_TALK) {
        if (topic.test.test(question)) { text = topic.answer; break }
      }
      if (!text) {
        for (const topic of TOPICS) {
          if (topic.test.test(question)) { text = topic.answer; break }
        }
      }
      if (!text) {
        text = inspection
          ? `Inspection ${inspection.id} for "${inspection.productName}" is stored with compliance ${inspection.compliance?.status || 'not evaluated'} and final decision ${inspection.finalDecision}. I can explain why it failed, name the rule behind a finding, rank findings by severity, summarize previous inspections of this product, or explain any part of how PackSure works.`
          : tools.productHistory
            ? `"${tools.productHistory.product.name}" has ${tools.productHistory.inspections.length} stored inspection(s) and ${tools.productHistory.findings.length} stored finding(s). Ask me about a specific one, or about how any part of PackSure works.`
            : 'I can explain how PackSure works — the workflow, roles and permissions, what each status means, how rules and findings behave, how listing comparison and MRP are handled, how reports are built, or how the dashboard risk score is calculated. Open an inspection, product, or report and I can also read that specific record for you.'
      }
    }

    return {
      provider: this.id,
      providerVersion: this.version,
      assessmentType: 'AI_ASSESSMENT',
      mode: 'offline',
      text,
      citations,
      evidence,
      boundary: ASSISTANT_BOUNDARY,
      notice: this.notice,
    }
  }
}

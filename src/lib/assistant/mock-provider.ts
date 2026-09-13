import type { AssistantAnswer, AssistantCitation, AssistantEvidence, AssistantFinding, AssistantProvider, AssistantProviderInput } from '@/lib/assistant/types'

const severityOrder: Record<string, number> = { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }

function uniqueCitations(citations: AssistantCitation[]) {
  const seen = new Set<string>()
  return citations.filter((citation) => {
    const key = `${citation.type}:${citation.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function findingLabel(finding: AssistantFinding) {
  return `${finding.ruleName} (${finding.severity})`
}

function strongest(findings: AssistantFinding[]) {
  return [...findings].sort((a, b) => (severityOrder[b.severity] || 0) - (severityOrder[a.severity] || 0))[0]
}

function findingText(finding: AssistantFinding) {
  const detected = finding.correctedValue || finding.detectedValue || 'no detected value stored'
  return `${finding.ruleName} is marked ${finding.aiStatus} at ${finding.severity} severity. The stored value is ${detected}; the rule expected ${finding.expectedRequirement}. Human review is ${finding.humanDecision}.`
}

function evidenceText(evidence: AssistantEvidence[]) {
  if (evidence.length === 0) return 'No stored package-image evidence is available for this context.'
  const imageEvidence = evidence.filter((item) => item.imageUrl)
  return `I found ${imageEvidence.length} stored package image${imageEvidence.length === 1 ? '' : 's'} that can be opened below. ${imageEvidence.some((item) => item.source === 'finding_evidence') ? 'Finding-linked evidence is marked separately from the full package image set.' : ''}`
}

function decisionBoundary(inspection: AssistantProviderInput['tools']['inspection']) {
  return inspection ? ` AI assessment status is ${inspection.compliance?.status || 'not evaluated'}; human review remains separate, and the stored final decision is ${inspection.finalDecision}.` : ''
}

export class MockAssistantProvider implements AssistantProvider {
  readonly id = 'mock-compliance-assistant'
  readonly version = '0.1.0'

  async answer(input: AssistantProviderInput): Promise<AssistantAnswer> {
    const question = input.question.trim().toLowerCase()
    const { tools } = input
    const citations: AssistantCitation[] = []
    const violationFindings = tools.findings.filter((finding) => finding.aiStatus === 'VIOLATION')
    const reviewFindings = tools.findings.filter((finding) => finding.aiStatus === 'REVIEW_REQUIRED')
    const actionableFindings = [...violationFindings, ...reviewFindings]
    const strongestFinding = strongest(actionableFindings)
    const inspection = tools.inspection

    if (inspection) citations.push({ type: 'inspection', id: inspection.id, label: `Inspection ${inspection.id}`, href: `/app/inspections/${inspection.id}` })
    if (tools.productHistory) citations.push({ type: 'product_history', id: tools.productHistory.product.id, label: `${tools.productHistory.product.name} history`, href: `/app/products/${tools.productHistory.product.id}` })

    let text: string
    if (/evidence|image|photo|proof|show/.test(question)) {
      text = evidenceText(tools.evidence)
      tools.evidence.slice(0, 6).forEach((item) => citations.push({ type: 'evidence', id: item.id, label: item.label, href: item.imageUrl }))
    } else if (/previous|prior|history|last inspection|earlier/.test(question)) {
      const history = tools.productHistory?.inspections || []
      if (history.length <= 1) text = history.length === 0 ? 'No product inspection history is available in the authorized records.' : 'Only the current inspection is available for this product; no previous inspection is stored.'
      else {
        const previous = history.slice(1, 4)
        text = `The previous stored inspection${previous.length === 1 ? '' : 's'} for ${tools.productHistory?.product.name || 'this product'} ${previous.length === 1 ? 'was' : 'were'}: ${previous.map((item) => `${new Date(item.createdAt).toLocaleDateString()} — ${item.compliance?.status || 'not evaluated'}${item.compliance?.score === null || !item.compliance ? '' : ` (${item.compliance.score}%)`}`).join('; ')}.`
        previous.forEach((item) => citations.push({ type: 'inspection', id: item.id, label: `Previous inspection ${item.id}`, href: `/app/inspections/${item.id}` }))
      }
    } else if (/more serious|serious|severity|priority/.test(question)) {
      if (actionableFindings.length === 0) text = 'No violation or review-required finding is available in the authorized records, so I cannot rank findings by seriousness.'
      else if (actionableFindings.length === 1) text = `Only one actionable finding is available: ${findingLabel(actionableFindings[0])}. There is no second finding to compare.`
      else text = `The more serious stored finding is ${findingLabel(strongestFinding)} based on the configured finding severity. ${actionableFindings.map(findingText).join(' ')}`
      actionableFindings.forEach((finding) => citations.push({ type: 'finding', id: finding.id, label: findingLabel(finding), href: `/app/inspections/${finding.inspectionId}/review` }))
    } else if (/rule|caused|reference|requirement/.test(question)) {
      if (actionableFindings.length === 0) text = 'No violation or review-required finding is available in the authorized records, so no causing rule can be identified.'
      else {
        text = actionableFindings.map((finding) => {
          const rule = tools.rules.find((candidate) => candidate.key === finding.ruleKey)
          citations.push({ type: 'finding', id: finding.id, label: findingLabel(finding), href: `/app/inspections/${finding.inspectionId}/review` })
          if (rule) {
            citations.push({ type: 'rule', id: rule.id, label: `${rule.name} · v${rule.version}`, href: '/app/rules' })
            return `${finding.ruleName} was caused by rule ${finding.ruleKey}, version ${finding.ruleVersion}. Reference: ${finding.ruleReference}. Expected requirement: ${finding.expectedRequirement}.`
          }
          return `${finding.ruleName} was recorded under rule ${finding.ruleKey}, version ${finding.ruleVersion}, with reference ${finding.ruleReference}. The current rule record was not returned in the authorized rule tool result.`
        }).join(' ')
      }
    } else if (/fail|failed|violation|explain|why/.test(question)) {
      if (!inspection) text = actionableFindings.length === 0 ? 'No inspection failure is available in the authorized context.' : actionableFindings.map(findingText).join(' ')
      else if (actionableFindings.length === 0) text = `This inspection is stored with final decision ${inspection.finalDecision} and compliance status ${inspection.compliance?.status || 'not evaluated'}. No violation or review-required finding was returned for the current context.`
      else text = `The inspection is ${inspection.compliance?.status || inspection.finalDecision}. ${actionableFindings.map(findingText).join(' ')}${decisionBoundary(inspection)}`
      actionableFindings.forEach((finding) => citations.push({ type: 'finding', id: finding.id, label: findingLabel(finding), href: `/app/inspections/${finding.inspectionId}/review` }))
    } else if (/report/.test(question) && tools.reports.length > 0) {
      text = `The authorized records contain ${tools.reports.length} generated report${tools.reports.length === 1 ? '' : 's'}. The latest is version ${tools.reports[0].reportVersion}, generated ${new Date(tools.reports[0].generatedAt).toLocaleString()}, with ${tools.reports[0].findingCount} finding${tools.reports[0].findingCount === 1 ? '' : 's'}.`
      tools.reports.slice(0, 3).forEach((report) => citations.push({ type: 'report', id: report.id, label: `Report ${report.reportVersion}`, href: `/app/reports/${report.id}` }))
    } else {
      const subject = inspection ? `Inspection ${inspection.id} is stored with ${inspection.compliance?.status || 'no compliance evaluation'}` : tools.productHistory ? `${tools.productHistory.product.name} has ${tools.productHistory.inspections.length} stored inspection${tools.productHistory.inspections.length === 1 ? '' : 's'}` : 'The authorized context does not contain an inspection or product summary'
      text = `${subject}. I can explain stored violations, identify the rule and reference, compare finding severity, show stored evidence, or summarize previous inspections. I will not infer information that is not present in the records.`
    }

    return {
      provider: this.id,
      providerVersion: this.version,
      assessmentType: 'AI_ASSESSMENT',
      text,
      citations: uniqueCitations(citations),
      evidence: tools.evidence.slice(0, 6),
      boundary: 'AI assessment only. This response does not change the server-side compliance result, human review decision, or final decision.',
    }
  }
}

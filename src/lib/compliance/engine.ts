import type { ExtractedField, ImageAnalysis, InspectionAnalysisResult, MeasuredValue } from '@/lib/ai/types'
import type { ComplianceEvidence, ComplianceResult, ComplianceStatus, RuleDefinition, RuleEvaluationInput } from '@/lib/compliance/types'

const noEvidence = { evidence: [] as ComplianceEvidence[], confidence: 0 }

type Evaluation = {
  status: ComplianceStatus
  message: string
  evidence: ComplianceEvidence[]
  detectedValue?: string
  confidence: number
}

function evidenceFromField(field: ExtractedField): ComplianceEvidence {
  return { sourceImage: field.sourceImage, boundingBox: field.boundingBox, excerpt: field.evidence || field.value }
}

function evidenceFromDeclaration(declaration: { sourceImage: ComplianceEvidence['sourceImage']; boundingBox?: ComplianceEvidence['boundingBox']; text: string }): ComplianceEvidence {
  return { sourceImage: declaration.sourceImage, boundingBox: declaration.boundingBox, excerpt: declaration.text }
}

function missingStatus(definition: RuleDefinition, kind: 'field' | 'declaration' | 'measurement'): ComplianceStatus {
  if (kind === 'measurement' && definition.notApplicableWhenMissing !== false) return 'NOT_APPLICABLE'
  return definition.missingOutcome || 'REVIEW_REQUIRED'
}

function confidenceStatus(confidence: number, definition: RuleDefinition) {
  if (definition.minConfidence !== undefined && confidence < definition.minConfidence) return 'REVIEW_REQUIRED' as const
  return null
}

function matchingField(analysis: InspectionAnalysisResult, definition: RuleDefinition) {
  return definition.fieldKey ? analysis.fields.filter((field) => field.key === definition.fieldKey) : []
}

function matchingDeclarations(analysis: InspectionAnalysisResult, definition: RuleDefinition) {
  return definition.declarationType ? analysis.declarations.filter((declaration) => declaration.type === definition.declarationType) : []
}

function matchingMeasurements(analysis: InspectionAnalysisResult, definition: RuleDefinition) {
  return analysis.images.flatMap((image: ImageAnalysis) => (image.measurements || []).filter((measurement: MeasuredValue) => !definition.measurementType || measurement.type === definition.measurementType))
}

function isApplicable(analysis: InspectionAnalysisResult, definition: RuleDefinition) {
  if (!definition.applicability?.fieldKey) return true
  const values = analysis.fields.filter((field) => field.key === definition.applicability?.fieldKey)
  if (values.length === 0) return false
  if (definition.applicability.equals === undefined) return true
  return values.some((field) => field.value.trim().toLowerCase() === definition.applicability?.equals?.trim().toLowerCase())
}

function evaluateDefinition(analysis: InspectionAnalysisResult, definition: RuleDefinition): Evaluation {
  if (!isApplicable(analysis, definition)) return { status: 'NOT_APPLICABLE', message: 'The configured applicability condition was not met.', ...noEvidence }

  if (definition.kind === 'manual_review') {
    return { status: 'REVIEW_REQUIRED', message: 'This configured check requires a human reviewer.', ...noEvidence }
  }

  if (definition.kind === 'field_presence') {
    const fields = matchingField(analysis, definition)
    if (fields.length === 0) return { status: missingStatus(definition, 'field'), message: 'The configured field was not detected.', ...noEvidence }
    const confidence = Math.max(...fields.map((field) => field.confidence))
    const evidence = fields.map(evidenceFromField)
    const confidenceResult = confidenceStatus(confidence, definition)
    if (confidenceResult) return { status: confidenceResult, message: 'A field was detected, but confidence is below the configured threshold.', evidence, detectedValue: fields.map((field) => field.value).join(' | '), confidence }
    return { status: 'PASS', message: 'The configured field was detected.', evidence, detectedValue: fields.map((field) => field.value).join(' | '), confidence }
  }

  if (definition.kind === 'declaration_presence') {
    const declarations = matchingDeclarations(analysis, definition)
    if (declarations.length === 0) return { status: missingStatus(definition, 'declaration'), message: 'The configured declaration was not detected.', ...noEvidence }
    const confidence = Math.max(...declarations.map((declaration) => declaration.confidence))
    const evidence = declarations.map((declaration) => evidenceFromDeclaration(declaration))
    const confidenceResult = confidenceStatus(confidence, definition)
    if (confidenceResult) return { status: confidenceResult, message: 'A declaration was detected, but confidence is below the configured threshold.', evidence, detectedValue: declarations.map((declaration) => declaration.text).join(' | '), confidence }
    return { status: 'PASS', message: 'The configured declaration was detected.', evidence, detectedValue: declarations.map((declaration) => declaration.text).join(' | '), confidence }
  }

  if (definition.kind === 'field_numeric') {
    const fields = matchingField(analysis, definition)
    if (fields.length === 0) return { status: missingStatus(definition, 'field'), message: 'The configured numeric field was not detected.', ...noEvidence }
    const field = fields[0]
    const evidence = [evidenceFromField(field)]
    const confidenceResult = confidenceStatus(field.confidence, definition)
    if (confidenceResult) return { status: confidenceResult, message: 'The numeric field was detected, but confidence is below the configured threshold.', evidence, detectedValue: field.value, confidence: field.confidence }
    if (definition.unit && field.unit !== definition.unit) return { status: definition.invalidOutcome || 'REVIEW_REQUIRED', message: 'The detected unit does not match the configured rule unit.', evidence, detectedValue: field.value, confidence: field.confidence }
    const numericValue = typeof field.normalizedValue === 'number' ? field.normalizedValue : Number(field.normalizedValue ?? field.value)
    if (!Number.isFinite(numericValue)) return { status: definition.invalidOutcome || 'REVIEW_REQUIRED', message: 'The detected value could not be evaluated as a number.', evidence, detectedValue: field.value, confidence: field.confidence }
    if (definition.min !== undefined && numericValue < definition.min) return { status: 'VIOLATION', message: `The detected value is below the configured minimum of ${definition.min}.`, evidence, detectedValue: field.value, confidence: field.confidence }
    if (definition.max !== undefined && numericValue > definition.max) return { status: 'VIOLATION', message: `The detected value is above the configured maximum of ${definition.max}.`, evidence, detectedValue: field.value, confidence: field.confidence }
    return { status: 'PASS', message: 'The detected numeric value met the configured bounds.', evidence, detectedValue: field.value, confidence: field.confidence }
  }

  if (definition.kind === 'measurement_threshold') {
    const measurements = matchingMeasurements(analysis, definition)
    if (measurements.length === 0) return { status: missingStatus(definition, 'measurement'), message: 'No measurement was available for this check.', ...noEvidence }
    const measurement = measurements[0]
    const detectedValue = `${measurement.value}${measurement.unit ? ` ${measurement.unit}` : ''}`
    const evidence: ComplianceEvidence[] = [{ sourceImage: measurement.sourceImage, boundingBox: measurement.boundingBox, excerpt: detectedValue }]
    const confidenceResult = confidenceStatus(measurement.confidence, definition)
    if (confidenceResult) return { status: confidenceResult, message: 'A measurement was available, but confidence is below the configured threshold.', evidence, detectedValue, confidence: measurement.confidence }
    if (definition.unit && measurement.unit !== definition.unit) return { status: definition.invalidOutcome || 'REVIEW_REQUIRED', message: 'The measured unit does not match the configured rule unit.', evidence, detectedValue, confidence: measurement.confidence }
    if (definition.min !== undefined && measurement.value < definition.min) return { status: 'VIOLATION', message: `The measurement is below the configured minimum of ${definition.min}.`, evidence, detectedValue, confidence: measurement.confidence }
    if (definition.max !== undefined && measurement.value > definition.max) return { status: 'VIOLATION', message: `The measurement is above the configured maximum of ${definition.max}.`, evidence, detectedValue, confidence: measurement.confidence }
    return { status: 'PASS', message: 'The measured value met the configured bounds.', evidence, detectedValue, confidence: measurement.confidence }
  }

  if (definition.kind === 'field_pattern') {
    const fields = matchingField(analysis, definition)
    if (fields.length === 0) return { status: missingStatus(definition, 'field'), message: 'The configured field was not detected.', ...noEvidence }
    const field = fields[0]
    const evidence = [evidenceFromField(field)]
    const confidenceResult = confidenceStatus(field.confidence, definition)
    if (confidenceResult) return { status: confidenceResult, message: 'A value was detected, but confidence is below the configured threshold.', evidence, detectedValue: field.value, confidence: field.confidence }
    if (!definition.pattern) return { status: 'REVIEW_REQUIRED', message: 'This rule has no validation pattern configured.', evidence, detectedValue: field.value, confidence: field.confidence }
    let matches = false
    try { matches = new RegExp(definition.pattern).test(field.value) } catch { return { status: 'REVIEW_REQUIRED', message: 'The configured validation pattern is invalid.', evidence, detectedValue: field.value, confidence: field.confidence } }
    return matches ? { status: 'PASS', message: 'The detected value matched the configured validation pattern.', evidence, detectedValue: field.value, confidence: field.confidence } : { status: definition.invalidOutcome || 'VIOLATION', message: 'The detected value did not match the configured validation pattern.', evidence, detectedValue: field.value, confidence: field.confidence }
  }

  return { status: 'REVIEW_REQUIRED', message: 'The rule definition needs review before it can be evaluated.', ...noEvidence }
}

export function evaluateRule(input: RuleEvaluationInput): ComplianceResult {
  const evaluated = evaluateDefinition(input.analysis, input.rule.definition)
  return {
    ruleId: input.rule.id,
    ruleKey: input.rule.key,
    ruleName: input.rule.name,
    ruleVersion: input.rule.version,
    reference: input.rule.reference,
    severity: input.rule.severity,
    status: evaluated.status,
    message: evaluated.message,
    detectedValue: evaluated.detectedValue,
    expectedRequirement: input.rule.expectedRequirement,
    confidence: evaluated.confidence,
    evidence: evaluated.evidence,
    evaluatedAt: new Date().toISOString(),
  }
}

export function aggregateComplianceStatus(results: ComplianceResult[]): ComplianceStatus {
  if (results.some((result) => result.status === 'VIOLATION')) return 'VIOLATION'
  if (results.some((result) => result.status === 'REVIEW_REQUIRED')) return 'REVIEW_REQUIRED'
  if (results.some((result) => result.status === 'PASS')) return 'PASS'
  return 'NOT_APPLICABLE'
}

export function complianceScore(results: ComplianceResult[]) {
  const applicable = results.filter((result) => result.status !== 'NOT_APPLICABLE')
  if (applicable.length === 0 || applicable.some((result) => result.status === 'REVIEW_REQUIRED')) return null
  return Math.round((applicable.filter((result) => result.status === 'PASS').length / applicable.length) * 100)
}

export function evaluateRules(rules: RuleEvaluationInput['rule'][], analysis: InspectionAnalysisResult) {
  const results = rules.map((rule) => evaluateRule({ rule, analysis }))
  return { status: aggregateComplianceStatus(results), score: complianceScore(results), results }
}

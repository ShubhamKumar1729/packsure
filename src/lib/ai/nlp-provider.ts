/**
 * NLP pipeline provider — the REAL analysis implementation.
 *
 * Flow (matches the target architecture):
 *   stored image bytes -> NLP service (/pipeline: preprocess -> OCR -> NER ->
 *   normalization -> CV observations) -> ProviderImageResult -> InspectionAnalysis
 *
 * The browser never talks to the NLP service; only this server-side provider
 * does, via NLP_SERVICE_URL. Failures are specific and surfaced: connection
 * refused/timeout maps to analysis status `unavailable`, everything else to
 * `failed` with a meaningful message. No fabricated values at any point.
 */

import type { AIProvider, ExtractedField, ExtractedFieldKey, ProviderImageInput, ProviderImageResult } from '@/lib/ai/types'
import { LEGAL_METROLOGY_FIELD_KEYS } from '@/lib/ai/field-keys'

const KNOWN_FIELD_KEYS = new Set<string>(LEGAL_METROLOGY_FIELD_KEYS)

/** Map a service field key to the typed union; unknown future labels fall back
 * to `other` instead of breaking ingestion (documented in field-keys.ts). */
function toFieldKey(key: string): ExtractedFieldKey {
  return (KNOWN_FIELD_KEYS.has(key) ? key : 'other') as ExtractedFieldKey
}

/** providerMetadata is persisted as string|number|boolean — drop empties. */
function compact(metadata: Record<string, string | number | boolean | undefined | null>): Record<string, string | number | boolean> {
  return Object.fromEntries(Object.entries(metadata).filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined && entry[1] !== null))
}

const SERVICE_TIMEOUT_MS = Number(process.env.NLP_SERVICE_TIMEOUT_MS || 90_000)

export type NlpServiceErrorKind = 'unreachable' | 'timeout' | 'rejected' | 'malformed'

export class NlpServiceError extends Error {
  readonly kind: NlpServiceErrorKind
  constructor(kind: NlpServiceErrorKind, message: string) {
    super(message)
    this.name = 'NlpServiceError'
    this.kind = kind
  }
}

export function serviceUrl(): string {
  const url = process.env.NLP_SERVICE_URL?.trim()
  if (!url) throw new NlpServiceError('unreachable', 'NLP_SERVICE_URL is not configured.')
  return url.replace(/\/+$/, '')
}

/** Model/extractor metadata block returned by the service. */
export type PipelineModelInfo = {
  name: string
  base_model: string
  version: string
  extractor: 'ner_model' | 'pattern_rules' | string
  degraded: boolean
  detail?: string | null
}

type PipelineWord = {
  text: string
  confidence: number
  bbox: { x: number; y: number; width: number; height: number }
}

type PipelineField = {
  field: string
  label: string
  value: string | null
  raw_value: string | null
  confidence: number
  bbox: { x: number; y: number; width: number; height: number } | null
  normalized?: Record<string, unknown> | null
}

type PipelineResponse = {
  success: boolean
  ocr: { status: string; text: string; confidence: number; words: PipelineWord[]; engine: string }
  fields: Record<string, PipelineField>
  missing_fields: string[]
  cv: {
    text_char_height_px: number | null
    text_char_height_mm: number | null
    scale_source: string | null
    scale_note: string | null
    barcodes: { text: string; format: string; valid_gtin_checkdigit: boolean | null }[]
  }
  model: PipelineModelInfo
  warnings: string[]
}

async function callPipeline(input: ProviderImageInput): Promise<PipelineResponse> {
  const base = serviceUrl()
  const apiKey = process.env.NLP_API_KEY?.trim()

  const form = new FormData()
  form.append('image', new Blob([new Uint8Array(input.data)], { type: input.mimeType }), 'image')

  let response: Response
  try {
    response = await fetch(`${base}/pipeline`, {
      method: 'POST',
      headers: apiKey ? { 'x-api-key': apiKey } : undefined,
      body: form,
      signal: AbortSignal.timeout(SERVICE_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
      throw new NlpServiceError('timeout', 'The NLP service took too long to process this image. Try again or use a smaller image.')
    }
    throw new NlpServiceError('unreachable', 'The NLP analysis service is unreachable. Confirm it is running (NLP_SERVICE_URL).')
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 300)
    throw new NlpServiceError('rejected', `The NLP service rejected this image (${response.status}). ${detail}`)
  }

  const contentType = response.headers.get('content-type') || ''
  if (!contentType.includes('application/json')) {
    throw new NlpServiceError('malformed', 'The NLP service returned a non-JSON response.')
  }
  const payload = (await response.json().catch(() => null)) as PipelineResponse | null
  if (!payload || typeof payload !== 'object' || !payload.ocr || typeof payload.fields !== 'object' || !payload.model) {
    throw new NlpServiceError('malformed', 'The NLP service returned an unusable response shape.')
  }
  return payload
}

function mapOcrStatus(status: string): ProviderImageResult['ocr']['status'] {
  if (status === 'completed') return 'completed'
  if (status === 'empty') return 'empty'
  return 'failed'
}

function normalizedPieces(field: PipelineField): { normalizedValue?: string | number; unit?: string } {
  const normalized = field.normalized
  if (!normalized || typeof normalized !== 'object') return {}
  const out: { normalizedValue?: string | number; unit?: string } = {}
  if (typeof normalized.magnitude === 'number') out.normalizedValue = normalized.magnitude
  else if (typeof normalized.iso === 'string') out.normalizedValue = normalized.iso
  else if (typeof normalized.value === 'string' || typeof normalized.value === 'number') out.normalizedValue = normalized.value
  if (typeof normalized.unit === 'string') out.unit = normalized.unit
  return out
}

/**
 * The registered provider. One service call per image; images are processed
 * concurrently by the existing orchestration layer (analyzeInspectionImages).
 */
export class NlpPipelineProvider implements AIProvider {
  readonly id = 'nlp'
  readonly version = '1.0.0'

  async analyzeImage(input: ProviderImageInput): Promise<ProviderImageResult> {
    const payload = await callPipeline(input)
    const sourceImage = { inspectionImageId: input.imageId, filename: input.filename, label: input.label, source: input.source }

    const fields: ExtractedField[] = Object.values(payload.fields).map((field) => ({
      key: toFieldKey(field.field),
      // Display value: normalized form when available, otherwise the raw OCR span.
      value: field.value ?? field.raw_value ?? '',
      normalizedValue: normalizedPieces(field).normalizedValue,
      unit: normalizedPieces(field).unit,
      confidence: field.confidence,
      sourceImage,
      boundingBox: field.bbox ?? undefined,
      // Evidence preserves the verbatim OCR span (raw_value) — never altered.
      evidence: field.raw_value ?? undefined,
    }))

    // Pixel character-height is reported as a measurement (font-size proxy).
    // mm is only asserted when the service had a barcode scale reference.
    const measurements: ProviderImageResult['measurements'] = []
    if (payload.cv.text_char_height_px !== null) {
      measurements.push({
        type: 'text_char_height_px',
        value: payload.cv.text_char_height_px,
        unit: 'px',
        confidence: 0.5,
        evidence: payload.cv.scale_source
          ? `mm estimate via ${payload.cv.scale_source}: ${payload.cv.text_char_height_mm ?? 'n/a'} mm`
          : payload.cv.scale_note ?? undefined,
      })
    }

    const confidenceParts = [payload.ocr.confidence]
    if (fields.length > 0) confidenceParts.push(Math.max(...fields.map((field) => field.confidence)))
    const confidence = confidenceParts.length > 0 ? confidenceParts.reduce((sum, value) => sum + value, 0) / confidenceParts.length : 0

    return {
      ocr: {
        status: mapOcrStatus(payload.ocr.status),
        text: payload.ocr.text,
        confidence: payload.ocr.confidence,
        blocks: payload.ocr.words.map((word) => ({
          text: word.text,
          confidence: word.confidence,
          boundingBox: word.bbox,
        })),
      },
      fields,
      declarations: [],
      measurements,
      confidence,
      providerMetadata: compact({
        ocrEngine: payload.ocr.engine,
        nlpModelName: payload.model.name,
        nlpBaseModel: payload.model.base_model,
        nlpModelVersion: payload.model.version,
        extractor: payload.model.extractor,
        degraded: payload.model.degraded,
        degradedDetail: payload.model.detail,
        barcodesFound: payload.cv.barcodes.length,
        barcodePrimary: payload.cv.barcodes[0]?.text,
        barcodeFormat: payload.cv.barcodes[0]?.format,
        barcodeCheckdigitValid: payload.cv.barcodes[0]?.valid_gtin_checkdigit == null ? undefined : String(payload.cv.barcodes[0].valid_gtin_checkdigit),
        cvScaleSource: payload.cv.scale_source ?? 'not_determinable',
        cvScaleNote: payload.cv.scale_note,
        textCharHeightPx: payload.cv.text_char_height_px,
        pipelineWarnings: (payload.warnings ?? []).join(' | ') || undefined,
      }),
    }
  }
}

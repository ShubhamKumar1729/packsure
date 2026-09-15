/**
 * NLP provider contract tests: mapping, error classes, and graceful failure.
 * fetch is stubbed — no live service is needed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NlpPipelineProvider, NlpServiceError, serviceUrl } from '@/lib/ai/nlp-provider'
import type { ProviderImageInput } from '@/lib/ai/types'

const INPUT: ProviderImageInput = {
  imageId: 'img1',
  filename: 'front.jpg',
  label: 'front',
  source: 'upload',
  mimeType: 'image/jpeg',
  data: new Uint8Array([1, 2, 3]),
}

const PIPELINE_RESPONSE = {
  success: true,
  ocr: {
    status: 'completed',
    text: 'MRP Rs.120/- Net Qty 500G',
    confidence: 0.93,
    words: [
      { text: 'MRP', confidence: 0.95, bbox_px: [0, 0, 10, 10], bbox: { x: 0.0, y: 0.0, width: 0.1, height: 0.1 } },
      { text: 'Rs.120/-', confidence: 0.91, bbox_px: [10, 0, 30, 10], bbox: { x: 0.1, y: 0.0, width: 0.3, height: 0.1 } },
    ],
    engine: 'tesseract',
  },
  fields: {
    mrp: {
      field: 'mrp',
      label: 'MRP',
      value: '₹120',
      raw_value: 'Rs.120/-',
      confidence: 0.9,
      bbox: { x: 0.1, y: 0.0, width: 0.3, height: 0.1 },
      bbox_px: [10, 0, 30, 10],
      normalized: { value: '₹120', magnitude: 120, currency: 'INR' },
    },
    net_quantity: {
      field: 'net_quantity',
      label: 'NET_QUANTITY',
      value: '500 g',
      raw_value: '500G',
      confidence: 0.8,
      bbox: null,
      bbox_px: null,
      normalized: { value: '500 g', magnitude: 500, unit: 'g' },
    },
  },
  missing_fields: ['manufacturer'],
  cv: {
    text_char_height_px: 18.0,
    text_char_height_mm: null,
    scale_source: null,
    scale_note: 'No scale reference (barcode) detected in the image.',
    barcodes: [],
    tampering_probability: null,
    sticker_overlay_anomaly: null,
  },
  model: { name: 'Legal-Metrology-NER', base_model: 'ModernBERT', version: 'pattern-rules', extractor: 'pattern_rules', degraded: true, detail: null },
  warnings: ['Extracted with the deterministic pattern extractor, not the trained NER model (degraded mode).'],
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  vi.stubEnv('NLP_SERVICE_URL', 'http://test-nlp:8000')
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('provider mapping', () => {
  it('maps pipeline fields preserving raw evidence, normalized values and bboxes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(PIPELINE_RESPONSE)))
    const result = await new NlpPipelineProvider().analyzeImage(INPUT)

    expect(result.ocr.status).toBe('completed')
    expect(result.ocr.blocks).toHaveLength(2)
    expect(result.ocr.blocks[0].boundingBox).toEqual({ x: 0.0, y: 0.0, width: 0.1, height: 0.1 })

    const mrp = result.fields.find((field) => field.key === 'mrp')
    expect(mrp?.value).toBe('₹120')
    expect(mrp?.normalizedValue).toBe(120)
    expect(mrp?.evidence).toBe('Rs.120/-') // raw preserved verbatim
    expect(mrp?.boundingBox).toBeDefined()

    const net = result.fields.find((field) => field.key === 'net_quantity')
    expect(net?.value).toBe('500 g')
    expect(net?.unit).toBe('g')
    expect(net?.boundingBox).toBeUndefined()

    expect(result.providerMetadata?.degraded).toBe(true)
    expect(result.providerMetadata?.extractor).toBe('pattern_rules')
  })

  it('carries the char-height measurement and honest scale metadata', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(PIPELINE_RESPONSE)))
    const result = await new NlpPipelineProvider().analyzeImage(INPUT)
    expect(result.measurements).toHaveLength(1)
    expect(result.measurements[0]).toMatchObject({ type: 'text_char_height_px', value: 18, unit: 'px' })
  })
})

describe('failure handling (Phase 23)', () => {
  it('connection refused -> unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed') }))
    await expect(new NlpPipelineProvider().analyzeImage(INPUT)).rejects.toMatchObject({ kind: 'unreachable' })
  })

  it('abort -> timeout', async () => {
    const abortError = new Error('The operation was aborted.')
    abortError.name = 'TimeoutError'
    vi.stubGlobal('fetch', vi.fn(async () => { throw abortError }))
    await expect(new NlpPipelineProvider().analyzeImage(INPUT)).rejects.toMatchObject({ kind: 'timeout' })
  })

  it('http 500 -> rejected with status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })))
    await expect(new NlpPipelineProvider().analyzeImage(INPUT)).rejects.toMatchObject({ kind: 'rejected' })
  })

  it('non-json -> malformed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html/>', { status: 200, headers: { 'content-type': 'text/html' } })))
    await expect(new NlpPipelineProvider().analyzeImage(INPUT)).rejects.toMatchObject({ kind: 'malformed' })
  })

  it('wrong shape -> malformed', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ unexpected: true })))
    await expect(new NlpPipelineProvider().analyzeImage(INPUT)).rejects.toMatchObject({ kind: 'malformed' })
  })
})

describe('configuration', () => {
  it('serviceUrl trims trailing slashes and errors when unset', () => {
    vi.stubEnv('NLP_SERVICE_URL', 'http://localhost:8000/')
    expect(serviceUrl()).toBe('http://localhost:8000')
    vi.stubEnv('NLP_SERVICE_URL', '')
    expect(() => serviceUrl()).toThrow(NlpServiceError)
  })
})

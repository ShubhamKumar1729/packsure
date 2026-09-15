#!/usr/bin/env node
/**
 * End-to-end pipeline check (Phase 25).
 *
 * Verifies: NLP service health -> OCR + extraction over a REAL label image ->
 * backend field-mapping contract. It does NOT fabricate results: without a real
 * sample image the script exits with instructions.
 *
 * Usage:
 *   node scripts/e2e-pipeline-check.mjs
 *
 * Environment:
 *   NLP_SERVICE_URL   (default http://localhost:8000)
 *   NLP_API_KEY       (optional, when the service requires it)
 *
 * Place a real product label photo at e2e/sample-label.jpg (git-ignored).
 * Optional full-stack mode:
 *   FULLSTACK=http://localhost:3000 E2E_EMAIL=... E2E_PASSWORD=... node scripts/e2e-pipeline-check.mjs
 * (requires the Next app + MongoDB running and a provisioned inspector/admin user;
 *  creates a REAL inspection through the public API routes — no seeded data.)
 */

import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'

const SAMPLE = new URL('../e2e/sample-label.jpg', import.meta.url)
const SERVICE = (process.env.NLP_SERVICE_URL || 'http://localhost:8000').replace(/\/+$/, '')
const API_KEY = process.env.NLP_API_KEY || ''
const FULLSTACK = process.env.FULLSTACK || ''

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures += 1
}

async function main() {
  // 1. Service health
  let health = null
  try {
    const response = await fetch(`${SERVICE}/health`, { headers: API_KEY ? { 'x-api-key': API_KEY } : {}, signal: AbortSignal.timeout(10_000) })
    health = await response.json()
    check('NLP service /health', response.ok, `status=${health?.status} model_loaded=${health?.model_loaded}`)
  } catch (error) {
    check('NLP service /health', false, `unreachable at ${SERVICE} (${error.message}). Start it: cd nlp-service && uvicorn app.main:app --port 8000`)
    process.exit(1)
  }
  if (health?.model_loaded === false) {
    console.log('NOTE  No trained model loaded — extraction runs in disclosed degraded mode (pattern_rules). This is expected until you train the model (ml/).')
  }

  // 2. Real image through the pipeline
  if (!existsSync(SAMPLE)) {
    check('sample label image', false, `place a REAL product label photo at e2e/sample-label.jpg (git-ignored) and re-run. The repo ships no fake product image.`)
  } else {
    const bytes = await readFile(SAMPLE)
    const form = new FormData()
    form.append('image', new Blob([bytes], { type: 'image/jpeg' }), 'sample-label.jpg')
    const response = await fetch(`${SERVICE}/pipeline`, { method: 'POST', body: form, headers: API_KEY ? { 'x-api-key': API_KEY } : {}, signal: AbortSignal.timeout(120_000) })
    const payload = await response.json()
    check('pipeline accepted the image', response.ok, response.ok ? `ocr status=${payload.ocr?.status}, words=${payload.ocr?.words?.length}` : `HTTP ${response.status}: ${JSON.stringify(payload).slice(0, 200)}`)
    if (response.ok) {
      const ocrHasText = (payload.ocr?.text || '').trim().length > 0
      check('OCR produced text', ocrHasText, ocrHasText ? 'raw OCR preserved' : 'OCR empty — check image quality')
      const fieldCount = Object.keys(payload.fields || {}).length
      const missing = payload.missing_fields?.length ?? 'n/a'
      check('extraction ran', true, `${fieldCount} fields extracted, ${missing} missing (missing is normal)`)
      for (const [key, field] of Object.entries(payload.fields || {})) {
        const raw = field.raw_value === null || field.raw_value === undefined ? 'NO RAW VALUE (bug)' : 'raw kept'
        const bbox = field.bbox ? 'bbox' : 'no bbox (words input not provided)'
        console.log(`      · ${key}: value=${JSON.stringify(field.value)} conf=${field.confidence} [${raw}, ${bbox}]`)
      }
      check('every field preserves raw_value', Object.values(payload.fields || {}).every((field) => typeof field.raw_value === 'string' || field.value === null))
      check('cv honesty (no fabricated tampering)', payload.cv?.tampering_probability === null)
    }
  }

  // 3. Optional full-stack pass through the real backend
  if (FULLSTACK) {
    if (!process.env.E2E_EMAIL || !process.env.E2E_PASSWORD) {
      console.log('NOTE  FULLSTACK set but E2E_EMAIL/E2E_PASSWORD missing — skipping backend pass.')
    } else if (!existsSync(SAMPLE)) {
      console.log('NOTE  Full-stack pass needs e2e/sample-label.jpg — skipping.')
    } else {
      const base = FULLSTACK.replace(/\/+$/, '')
      const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD }) })
      const cookie = (login.headers.get('set-cookie') || '').split(';')[0]
      check('backend login', login.ok && Boolean(cookie))
      if (login.ok) {
        const bytes = await readFile(SAMPLE)
        const product = { name: `E2E label check ${new Date().toISOString()}` }
        const form = new FormData()
        form.append('product', JSON.stringify(product))
        form.append('images', JSON.stringify([{ label: 'front', source: 'upload', sortOrder: 0 }]))
        form.append('file', new Blob([bytes], { type: 'image/jpeg' }), 'sample-label.jpg')
        const created = await fetch(`${base}/api/inspections`, { method: 'POST', body: form, headers: { cookie } })
        const createdData = await created.json()
        check('inspection created', created.ok, createdData?.inspection?.id || '')
        const inspectionId = createdData?.inspection?.id
        if (inspectionId) {
          const analysis = await fetch(`${base}/api/inspections/${inspectionId}/analyze`, { method: 'POST', headers: { cookie } })
          const analysisData = await analysis.json()
          check('analysis via backend', analysis.ok, analysis.ok ? `provider=${analysisData.analysis?.provider}, fields=${analysisData.analysis?.fields?.length}` : String(analysisData?.error).slice(0, 160))
          const compliance = await fetch(`${base}/api/inspections/${inspectionId}/compliance`, { method: 'POST', headers: { cookie } })
          const complianceData = await compliance.json()
          check('compliance via backend', compliance.ok, compliance.ok ? `status=${complianceData.compliance?.status}, score=${complianceData.compliance?.score}, classification=${complianceData.compliance?.summary?.classification}` : String(complianceData?.error).slice(0, 160))
        }
      }
    }
  }

  console.log(failures === 0 ? '\nE2E CHECK: ALL PASS' : `\nE2E CHECK: ${failures} FAILURE(S)`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error('E2E check crashed:', error)
  process.exit(1)
})

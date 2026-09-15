/** Serialization + summary derivation tests. */

import { describe, expect, it } from 'vitest'
import { serializeComplianceRun } from '@/lib/compliance/serialize-run'
import { serializeInspectionAnalysis } from '@/lib/ai/serialize'
import { fieldKeyTitle, PARTY_FIELD_KEYS, DATE_FIELD_KEYS } from '@/lib/ai/field-keys'

describe('compliance run serialization', () => {
  it('derives the legal summary from stored results on read', () => {
    const run = {
      _id: { toString: () => 'run1' },
      inspectionId: 'insp1',
      analysisId: 'an1',
      status: 'VIOLATION' as const,
      score: null, // legacy stored score (null when review pending) — summary recomputes
      results: [
        { ruleKey: 'a', severity: 'HIGH', status: 'PASS' },
        { ruleKey: 'b', severity: 'HIGH', status: 'VIOLATION' },
      ],
      evaluatedAt: new Date('2026-01-01T00:00:00Z'),
    }
    const serialized = serializeComplianceRun(run)
    expect(serialized.summary).toBeDefined()
    expect(serialized.summary?.classification).toBe('NON_COMPLIANT')
    expect(serialized.summary?.score).toBe(50)
    expect(serialized.summary?.formulaVersion).toBe('severity-weighted-v1')
    expect(serialized.score).toBe(50)
  })
})

describe('analysis serialization', () => {
  it('passes through the unavailable status untouched', () => {
    const analysis = {
      _id: { toString: () => 'an1' },
      inspectionId: 'insp1',
      status: 'unavailable' as const,
      provider: 'nlp',
      providerVersion: '1.0.0',
      overallConfidence: 0,
      images: [],
      fields: [],
      declarations: [],
      error: 'The NLP analysis service is unreachable.',
    }
    expect(serializeInspectionAnalysis(analysis).status).toBe('unavailable')
  })
})

describe('field key configuration', () => {
  it('party and date groups match the legal rule expectations', () => {
    expect(PARTY_FIELD_KEYS).toEqual(['manufacturer', 'packer', 'importer'])
    expect(DATE_FIELD_KEYS).toEqual(['mfg_date', 'pkd_date', 'import_date'])
  })

  it('titles exist for every legal field key and fall back cleanly', () => {
    expect(fieldKeyTitle('mrp')).toContain('MRP')
    expect(fieldKeyTitle('unknown_key_xyz')).toBe('Unknown Key Xyz')
  })
})

'use client'

/* Native img is used for authenticated image endpoints. */
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react'

import type { BoundingBox } from '@/lib/ai/types'

export type OverlayRegion = {
  id: string
  box: BoundingBox
  title: string
  /** Drives the frame color: PASS/green, review/amber, violation/red, info/slate. */
  tone: 'pass' | 'review' | 'violation' | 'info'
  confidence?: number
}

const TONE_STYLES: Record<OverlayRegion['tone'], string> = {
  pass: 'border-emerald-400 bg-emerald-400/10',
  review: 'border-amber-400 bg-amber-400/10',
  violation: 'border-red-400 bg-red-400/10',
  info: 'border-sky-400 bg-sky-400/10',
}

const TONE_LEGEND: Record<OverlayRegion['tone'], string> = {
  pass: 'Passed check',
  review: 'Needs review / low confidence',
  violation: 'Violation evidence',
  info: 'Detected value',
}

/**
 * Bounding-box evidence overlay (Phase 14): draws normalized OCR/NER regions on
 * top of the stored inspection image so a reviewer can see exactly where each
 * declaration was read. Hovering/clicking a chip highlights its region.
 */
export function EvidenceOverlay({ imageUrl, alt, regions }: { imageUrl: string; alt: string; regions: OverlayRegion[] }) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(true)
  const tonesUsed = useMemo(() => Array.from(new Set(regions.map((region) => region.tone))), [regions])

  return (
    <figure className="space-y-2">
      <div className="relative overflow-hidden rounded-xl border border-line bg-black">
        <img src={imageUrl} alt={alt} className="block max-h-[420px] w-full object-contain" />
        {showAll
          ? regions.map((region) => (
              <button
                key={region.id}
                type="button"
                title={`${region.title}${region.confidence !== undefined ? ` · ${Math.round(region.confidence * 100)}%` : ''}`}
                onMouseEnter={() => setActiveId(region.id)}
                onFocus={() => setActiveId(region.id)}
                onClick={() => setActiveId(region.id === activeId ? null : region.id)}
                className={`absolute rounded-md border-2 transition ${TONE_STYLES[region.tone]} ${activeId && activeId !== region.id ? 'opacity-35' : 'opacity-100'}`}
                style={{
                  left: `${region.box.x * 100}%`,
                  top: `${region.box.y * 100}%`,
                  width: `${region.box.width * 100}%`,
                  height: `${region.box.height * 100}%`,
                }}
              >
                <span className="sr-only">{region.title}</span>
              </button>
            ))
          : null}
      </div>
      <figcaption className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted">
        <button type="button" onClick={() => setShowAll((value) => !value)} className="focus-ring rounded-md border border-line px-2 py-1 font-semibold text-ink transition hover:bg-[#efede7]">
          {showAll ? 'Hide regions' : 'Show regions'}
        </button>
        {tonesUsed.map((tone) => (
          <span key={tone} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-4 rounded-sm border-2 ${TONE_STYLES[tone]}`} /> {TONE_LEGEND[tone]}
          </span>
        ))}
        {activeId ? <span className="font-semibold text-ink">{regions.find((region) => region.id === activeId)?.title}</span> : null}
      </figcaption>
    </figure>
  )
}

/* Authenticated image endpoints are rendered with native img elements. */
/* eslint-disable @next/next/no-img-element */

import Link from 'next/link'
import { ArrowLeft, Boxes, CalendarClock, Check, FileImage, Package, ShieldCheck, UserCheck } from 'lucide-react'
import { AnalysisViewer } from '@/components/analysis-viewer'
import { ComplianceViewer } from '@/components/compliance-viewer'
import { ListingComparison } from '@/components/listing-comparison'
import type { InspectionAnalysisResult } from '@/lib/ai/types'
import type { ComplianceRunResult } from '@/lib/compliance/types'
import type { UserRole } from '@/lib/auth-shared'
import type { ListingComparisonResult } from '@/lib/marketplace/types'

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

type DetailProps = {
  sessionRole: UserRole
  inspection: { id: string; status: string; finalDecision: string; imageCount: number; onlineListingUrl: string; createdAt: string }
  product: { id: string; name: string; brand: string; manufacturer: string; category: string; packSize: string; unit: string; batchNumber: string; declaredRetailPrice?: number }
  images: { id: string; filename: string; label: string; source: string; mimeType: string; sizeBytes: number; url: string }[]
  initialAnalysis: InspectionAnalysisResult | null
  initialCompliance: ComplianceRunResult | null
  initialListingComparison: ListingComparisonResult | null
}

export function InspectionDetail({ sessionRole, inspection, product, images, initialAnalysis, initialCompliance, initialListingComparison }: DetailProps) {
  const canAnalyze = ['admin', 'inspector', 'reviewer'].includes(sessionRole)
  const canReview = ['admin', 'reviewer'].includes(sessionRole)
  const fields = [['Brand', product.brand], ['Manufacturer / packer', product.manufacturer], ['Category', product.category], ['Pack size', product.packSize && product.unit ? `${product.packSize} ${product.unit}` : product.packSize || product.unit], ['Batch / lot', product.batchNumber], ['Declared retail price', product.declaredRetailPrice === undefined ? '' : String(product.declaredRetailPrice)]]

  return <div><Link href="/app/inspections" className="focus-ring inline-flex items-center gap-2 text-xs font-semibold text-muted transition hover:text-ink"><ArrowLeft size={14} /> Inspections</Link><div className="mt-5 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-moss" />Inspection record</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-ink">{product.name}</h2><p className="mt-2 text-sm text-muted">Inspection {inspection.id}</p></div><div className="flex flex-wrap items-center gap-2">{canReview ? <Link href={`/app/inspections/${inspection.id}/review`} className="focus-ring inline-flex items-center gap-2 rounded-xl bg-moss px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-[#174a37]"><UserCheck size={14} /> Open review</Link> : null}<span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold capitalize ${inspection.finalDecision === 'COMPLIANT' ? 'bg-leaf text-moss' : inspection.finalDecision === 'VIOLATION' ? 'bg-danger-soft text-danger' : 'bg-amber-soft text-amber'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{inspection.finalDecision === 'PENDING' ? inspection.status.replace('_', ' ') : inspection.finalDecision.replace('_', ' ')}</span><span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-muted"><CalendarClock size={13} />{new Date(inspection.createdAt).toLocaleString()}</span></div></div><div className="mt-8 grid gap-5 lg:grid-cols-[0.72fr_1.28fr]"><div className="space-y-5"><div className="surface p-5"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-leaf text-moss"><Package size={17} /></span><div><p className="text-sm font-semibold text-ink">Product information</p><p className="mt-1 text-xs text-muted">Stored with this inspection</p></div></div><dl className="mt-5 space-y-3"><div className="border-b border-line pb-3"><dt className="text-xs text-muted">Product name</dt><dd className="mt-1 text-sm font-semibold text-ink">{product.name}</dd></div>{fields.map(([label, value]) => value ? <div key={label} className="flex justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0"><dt className="text-xs text-muted">{label}</dt><dd className="max-w-[58%] text-right text-xs font-semibold text-ink">{value}</dd></div> : null)}</dl></div><div className="surface p-5"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#efede7] text-ink"><FileImage size={17} /></span><div><p className="text-sm font-semibold text-ink">Evidence count</p><p className="mt-1 text-xs text-muted">{inspection.imageCount} stored package {inspection.imageCount === 1 ? 'image' : 'images'}</p></div></div><div className="mt-5 flex items-center gap-2 text-xs text-muted"><Check size={15} className="text-moss" /> Camera and upload sources use one image structure</div></div></div><div className="surface p-5 sm:p-6"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-ink">Package evidence</p><p className="mt-1 text-xs text-muted">Original stored images, ordered for review</p></div><Boxes size={18} className="text-moss" /></div><div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">{images.map((image) => <div key={image.id} className="overflow-hidden rounded-xl border border-line bg-canvas"><img src={image.url} alt={`${titleCase(image.label)} package view`} className="aspect-square w-full object-cover" /><div className="flex items-center justify-between gap-2 p-2.5"><span className="text-[11px] font-semibold text-ink">{titleCase(image.label)}</span><span className="text-[10px] capitalize text-muted">{image.source}</span></div></div>)}</div></div></div><ListingComparison inspectionId={inspection.id} initialUrl={inspection.onlineListingUrl} initialComparison={initialListingComparison} canCompare={['admin', 'inspector'].includes(sessionRole)} /><div className="mt-5"><AnalysisViewer inspectionId={inspection.id} initialAnalysis={initialAnalysis} canAnalyze={canAnalyze} /></div><div className="mt-5"><ComplianceViewer inspectionId={inspection.id} initialCompliance={initialCompliance} canEvaluate={canAnalyze} /></div><div className="mt-5 flex gap-3 rounded-2xl border border-leaf bg-leaf/50 p-4 text-xs leading-5 text-[#4f6e5c]"><ShieldCheck size={16} className="mt-0.5 shrink-0 text-moss" />Analysis results are stored separately from the original evidence and can be replaced by a later provider run.</div></div>
}

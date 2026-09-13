'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { ArrowUpRight, Boxes, CircleAlert, LoaderCircle, Search, ShieldCheck } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'

type ProductListItem = {
  id: string
  name: string
  brand: string
  manufacturer: string
  category: string
  packSize: string
  unit: string
  batchNumber: string
  inspectionCount: number
  latestInspectionAt?: string
  latestComplianceStatus: string | null
  latestComplianceScore: number | null
}

export function ProductList() {
  const [products, setProducts] = useState<ProductListItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setLoading(true)
      void fetch(`/api/products?search=${encodeURIComponent(search)}`, { cache: 'no-store' })
        .then(async (response) => {
          const data = await response.json() as { products?: ProductListItem[]; error?: string }
          if (!response.ok) throw new Error(data.error || 'Products could not be loaded.')
          setProducts(data.products || [])
          setError('')
        })
        .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Products could not be loaded.'))
        .finally(() => setLoading(false))
    }, 180)
    return () => window.clearTimeout(timer)
  }, [search])

  return <div><div className="relative mt-7 max-w-xl"><Search size={17} className="pointer-events-none absolute left-3.5 top-3.5 text-muted" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search product, brand, manufacturer, or batch" className="focus-ring h-12 w-full rounded-xl border border-line bg-paper pl-10 pr-4 text-sm outline-none focus:border-moss" /></div>{error ? <div role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-xs text-danger"><CircleAlert size={16} className="mt-0.5 shrink-0" />{error}</div> : null}{loading ? <div className="mt-6 flex min-h-[280px] items-center justify-center rounded-2xl border border-line bg-paper"><LoaderCircle size={22} className="animate-spin text-moss" /></div> : products.length === 0 ? <div className="mt-6"><EmptyState icon={Boxes} eyebrow={search ? 'No matching products' : 'No products registered'} title={search ? 'No product matched your search.' : 'Your product library is empty.'} description={search ? 'Try a different product name, brand, manufacturer, or batch value.' : 'Product records will appear here after real inspections are saved. Nothing has been preloaded.'} /></div> : <div className="mt-6 space-y-3">{products.map((product) => <Link key={product.id} href={`/app/products/${product.id}`} className="focus-ring block rounded-2xl border border-line bg-paper p-5 transition hover:-translate-y-0.5 hover:shadow-soft"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div className="flex min-w-0 items-start gap-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-leaf text-moss"><Boxes size={18} /></span><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-ink">{product.name}</h3><p className="mt-1 truncate text-xs text-muted">{product.brand || 'No brand recorded'}{product.manufacturer ? ` · ${product.manufacturer}` : ''}</p><p className="mt-2 text-[11px] text-muted">{product.category || 'Uncategorized'}{product.packSize || product.unit ? ` · ${product.packSize || ''} ${product.unit || ''}` : ''}{product.batchNumber ? ` · Batch ${product.batchNumber}` : ''}</p></div></div><div className="flex shrink-0 items-center gap-4 pl-[52px] sm:pl-0"><div className="text-right"><p className="text-xs font-semibold text-ink">{product.inspectionCount} {product.inspectionCount === 1 ? 'inspection' : 'inspections'}</p><p className="mt-1 text-[10px] text-muted">{product.latestInspectionAt ? new Date(product.latestInspectionAt).toLocaleDateString() : 'No history'}</p></div><span className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted"><ArrowUpRight size={15} /></span></div></div><div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3"><span className="inline-flex items-center gap-1.5 text-[11px] text-muted"><ShieldCheck size={13} className="text-moss" /> Latest compliance</span><span className="rounded-full bg-amber-soft px-2.5 py-1 text-[10px] font-semibold capitalize text-amber">{product.latestComplianceStatus ? product.latestComplianceStatus.replace('_', ' ') : 'Not evaluated'}</span><span className="text-[11px] font-semibold text-ink">{product.latestComplianceScore === null ? 'Score pending' : `${product.latestComplianceScore}%`}</span></div></Link>)}</div>}</div>
}

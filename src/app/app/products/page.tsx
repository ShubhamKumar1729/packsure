import { ProductList } from '@/components/product-list'

export default function ProductsPage() {
  return <div><div><p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-amber" />Reference data</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-ink">Products</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted">Search product records and inspect their complete compliance history. Products are created from real saved inspections.</p></div><ProductList /></div>
}

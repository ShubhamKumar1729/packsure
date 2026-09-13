import { Filter, Search } from 'lucide-react'
import { InspectionList } from '@/components/inspection-list'

export default function InspectionsPage() {
  return <div><div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-moss" />Review queue</p><h2 className="mt-3 text-3xl font-semibold tracking-[-0.05em] text-ink">Inspections</h2><p className="mt-3 max-w-xl text-sm leading-6 text-muted">Review, assign, and close inspection records when your intake connection is ready.</p></div><div className="flex items-center gap-2"><button disabled className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-paper px-3.5 text-xs font-semibold text-muted opacity-70"><Filter size={15} /> Filter</button><button disabled className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-paper px-3.5 text-xs font-semibold text-muted opacity-70"><Search size={15} /> Search</button></div></div><div className="mt-8"><InspectionList /></div></div>
}

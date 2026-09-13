import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { ArrowUpRight, ClipboardPlus } from 'lucide-react'

export function EmptyState({
  icon: Icon = ClipboardPlus,
  eyebrow = 'Nothing here yet',
  title,
  description,
  action,
}: {
  icon?: LucideIcon
  eyebrow?: string
  title: string
  description: string
  action?: { label: string; href: string }
}) {
  return (
    <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-paper/70 px-6 py-12 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl border border-leaf bg-leaf/60 text-moss">
        <Icon size={24} strokeWidth={1.8} />
      </span>
      <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.18em] text-moss">{eyebrow}</p>
      <h2 className="mt-3 max-w-md text-xl font-semibold tracking-[-0.03em] text-ink">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-muted">{description}</p>
      {action ? (
        <Link href={action.href} className="focus-ring mt-6 inline-flex items-center gap-2 rounded-xl bg-moss px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#174a37]">
          {action.label}
          <ArrowUpRight size={16} />
        </Link>
      ) : null}
    </div>
  )
}

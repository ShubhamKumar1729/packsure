import Link from 'next/link'

export function Brand({ dark = false, href = '/' }: { dark?: boolean; href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-3 focus-ring" aria-label="PackSure home">
      <span className={`grid h-9 w-9 place-items-center rounded-xl border ${dark ? 'border-white/20 bg-white/10' : 'border-moss/20 bg-leaf'}`}>
        <svg viewBox="0 0 26 26" className={`h-5 w-5 ${dark ? 'text-amber' : 'text-moss'}`} aria-hidden="true">
          <path d="M5.5 8.1 13 4.4l7.5 3.7v9.8L13 21.6l-7.5-3.7V8.1Z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="m5.9 8.2 7.1 3.6 7.1-3.6M13 11.8v9.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          <path d="m10.1 6 7.3 3.7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </span>
      <span className={`text-[17px] font-semibold tracking-[-0.04em] ${dark ? 'text-white' : 'text-ink'}`}>Pack<span className="text-moss">Sure</span></span>
    </Link>
  )
}

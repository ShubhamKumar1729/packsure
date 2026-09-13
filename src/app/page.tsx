import Link from 'next/link'
import { ArrowRight, ArrowUpRight, Check, FileCheck2, Gavel, ScanLine, ShieldCheck, Sparkles } from 'lucide-react'
import { Brand } from '@/components/brand'

function WorkflowCard() {
  return (
    <div className="relative overflow-hidden rounded-[28px] bg-ink p-5 text-white shadow-card sm:p-7">
      <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-moss/30 blur-2xl" />
      <div className="relative">
        <div className="flex items-center justify-between border-b border-white/10 pb-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">PackSure foundation</p>
            <p className="mt-1.5 text-sm font-medium text-white/85">A clear path from package to decision</p>
          </div>
          <span className="grid h-9 w-9 place-items-center rounded-xl border border-white/10 bg-white/5 text-amber"><ShieldCheck size={17} /></span>
        </div>
        <div className="relative mt-7 space-y-3">
          <div className="absolute left-[17px] top-5 h-[calc(100%-40px)] w-px bg-gradient-to-b from-amber via-white/20 to-moss" />
          {[
            { icon: ScanLine, label: 'Capture', copy: 'OCR-ready intake for package details', color: 'text-amber', bg: 'bg-amber/15' },
            { icon: Gavel, label: 'Assess', copy: 'Rules and review paths in one workspace', color: 'text-[#b9e3c5]', bg: 'bg-moss/40' },
            { icon: FileCheck2, label: 'Act', copy: 'Traceable outcomes and exportable reports', color: 'text-white', bg: 'bg-white/10' },
          ].map((item) => {
            const Icon = item.icon
            return (
              <div key={item.label} className="relative flex items-center gap-4 rounded-2xl border border-white/10 bg-white/[0.045] p-4">
                <span className={`relative z-10 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${item.bg} ${item.color}`}><Icon size={17} /></span>
                <div>
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="mt-0.5 text-xs text-white/45">{item.copy}</p>
                </div>
                <Check className="ml-auto text-white/35" size={16} />
              </div>
            )
          })}
        </div>
        <div className="mt-6 flex items-center gap-2 rounded-xl border border-amber/20 bg-amber/10 px-3.5 py-3 text-xs text-amber-100">
          <Sparkles size={15} className="text-amber" />
          Built to add intelligence without hiding the evidence.
        </div>
      </div>
    </div>
  )
}

export default function LandingPage() {
  return (
    <main className="min-h-screen overflow-hidden bg-canvas">
      <header className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Brand />
        <nav className="hidden items-center gap-8 md:flex" aria-label="Marketing navigation">
          <a href="#approach" className="focus-ring text-sm font-medium text-muted transition hover:text-ink">Approach</a>
          <a href="#built-for" className="focus-ring text-sm font-medium text-muted transition hover:text-ink">Built for compliance</a>
          <Link href="/login" className="focus-ring text-sm font-semibold text-ink transition hover:text-moss">Sign in <span aria-hidden="true">↗</span></Link>
        </nav>
        <Link href="/login" className="focus-ring inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#354039] md:hidden">Access platform <ArrowUpRight size={15} /></Link>
      </header>

      <section className="mx-auto max-w-7xl px-5 pb-20 pt-12 sm:px-8 sm:pt-20 lg:px-10 lg:pb-28 lg:pt-28">
        <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <div>
            <p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-amber" />AI-powered packaged commodity compliance</p>
            <h1 className="mt-6 max-w-3xl text-[clamp(2.8rem,7vw,5.75rem)] font-semibold leading-[0.98] tracking-[-0.075em] text-ink">Confidence at <span className="text-moss">every package.</span></h1>
            <p className="mt-7 max-w-xl text-base leading-7 text-muted sm:text-lg sm:leading-8">PackSure brings inspection intake, product records, rules, and reporting into one evidence-first workspace for modern compliance teams.</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/login" className="focus-ring inline-flex items-center gap-2 rounded-xl bg-moss px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#174a37]">Access the workspace <ArrowRight size={16} /></Link>
              <a href="#approach" className="focus-ring inline-flex items-center gap-2 rounded-xl border border-line bg-paper px-5 py-3 text-sm font-semibold text-ink transition hover:border-moss/30 hover:bg-white">See the approach <ArrowUpRight size={16} /></a>
            </div>
            <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-xs font-medium text-muted">
              <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-moss" />Evidence-first workflows</span>
              <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-amber" />Role-aware access</span>
              <span className="inline-flex items-center gap-2"><span className="h-1.5 w-1.5 rounded-full bg-danger" />Audit-ready by design</span>
            </div>
          </div>
          <WorkflowCard />
        </div>
      </section>

      <section id="approach" className="border-y border-line bg-[#efede7]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
          <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
            <div>
              <p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-moss" />One source of truth</p>
              <h2 className="mt-4 max-w-md text-3xl font-semibold tracking-[-0.05em] text-ink sm:text-4xl">Compliance work, without the scattered trail.</h2>
            </div>
            <div className="grid gap-x-8 gap-y-10 sm:grid-cols-3">
              {[
                { number: '01', title: 'Collect clearly', body: 'Bring package evidence and context into a structured inspection record.', icon: ScanLine },
                { number: '02', title: 'Apply consistently', body: 'Keep rules, review steps, and role permissions visible to the team.', icon: Gavel },
                { number: '03', title: 'Close the loop', body: 'Turn decisions into traceable reports that stand up to scrutiny.', icon: FileCheck2 },
              ].map((item) => {
                const Icon = item.icon
                return <div key={item.number}>
                  <div className="flex items-center gap-3"><span className="text-xs font-semibold text-amber">{item.number}</span><Icon size={17} className="text-moss" /></div>
                  <h3 className="mt-4 text-base font-semibold text-ink">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">{item.body}</p>
                </div>
              })}
            </div>
          </div>
        </div>
      </section>

      <section id="built-for" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-24">
        <div className="rounded-[28px] bg-[#244936] px-6 py-10 text-white sm:px-10 sm:py-12 lg:flex lg:items-end lg:justify-between lg:px-14">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#b9e3c5]"><ShieldCheck size={15} />Designed for accountable teams</p>
            <h2 className="mt-5 text-3xl font-semibold tracking-[-0.05em] sm:text-4xl">Start with a clean foundation. Add intelligence when you are ready.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-white/65">PackSure is structured for OCR, AI-assisted review, configurable rules, and reporting—without making any of them a black box.</p>
          </div>
          <Link href="/login" className="focus-ring mt-8 inline-flex shrink-0 items-center gap-2 rounded-xl bg-amber px-5 py-3 text-sm font-semibold text-ink transition hover:bg-[#e69d47] lg:mb-1 lg:mt-0">Enter PackSure <ArrowUpRight size={16} /></Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-4 border-t border-line px-5 py-7 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <Brand />
        <p>© {new Date().getFullYear()} PackSure. Compliance, made clear.</p>
      </footer>
    </main>
  )
}

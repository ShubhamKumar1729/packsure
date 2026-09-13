'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ArrowRight, Eye, EyeOff, LockKeyhole, ShieldCheck } from 'lucide-react'
import { Brand } from '@/components/brand'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const router = useRouter()

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = (await response.json()) as { error?: string }
      if (!response.ok) throw new Error(data.error || 'Unable to sign in.')
      router.push('/app')
      router.refresh()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to sign in.')
      setIsSubmitting(false)
    }
  }

  return (
    <main className="min-h-screen bg-canvas">
      <div className="mx-auto grid min-h-screen max-w-[1500px] lg:grid-cols-[0.85fr_1.15fr]">
        <section className="relative hidden overflow-hidden bg-ink p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
          <div className="absolute -bottom-32 -left-32 h-[420px] w-[420px] rounded-full bg-moss/35 blur-3xl" />
          <div className="relative"><Brand dark /></div>
          <div className="relative max-w-md">
            <p className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber"><span className="h-1.5 w-1.5 rounded-full bg-amber" />Secure operations</p>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.03] tracking-[-0.06em] xl:text-5xl">A clearer view of every compliance decision.</h1>
            <p className="mt-5 text-sm leading-6 text-white/55">Access the PackSure workspace to manage role-scoped inspection workflows and the evidence behind them.</p>
          </div>
          <div className="relative flex items-center gap-2 text-xs text-white/45"><ShieldCheck size={16} className="text-[#b9e3c5]" /> Built for accountable teams</div>
        </section>

        <section className="flex flex-col px-5 py-6 sm:px-10 lg:px-16 lg:py-10 xl:px-24">
          <div className="flex items-center justify-between lg:justify-end"><div className="lg:hidden"><Brand /></div><Link href="/" className="focus-ring inline-flex items-center gap-2 text-xs font-semibold text-muted transition hover:text-ink"><ArrowLeft size={15} /> Back to home</Link></div>
          <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-center py-14">
            <div className="mb-8 lg:hidden"><p className="eyebrow"><span className="h-1.5 w-1.5 rounded-full bg-amber" />Secure operations</p></div>
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-leaf bg-leaf text-moss"><LockKeyhole size={21} /></div>
            <h2 className="mt-6 text-3xl font-semibold tracking-[-0.05em] text-ink">Welcome back</h2>
            <p className="mt-2 text-sm leading-6 text-muted">Sign in to your PackSure workspace.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-xs font-semibold text-ink">Work email</label>
                <input id="email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@agency.gov" className="focus-ring h-12 w-full rounded-xl border border-line bg-paper px-4 text-sm text-ink outline-none transition placeholder:text-[#aaa79e] focus:border-moss" />
              </div>
              <div>
                <label htmlFor="password" className="mb-2 block text-xs font-semibold text-ink">Password</label>
                <div className="relative">
                  <input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" className="focus-ring h-12 w-full rounded-xl border border-line bg-paper px-4 pr-12 text-sm text-ink outline-none transition placeholder:text-[#aaa79e] focus:border-moss" />
                  <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="focus-ring absolute right-2 top-2 rounded-lg p-2 text-muted hover:text-ink" aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
                </div>
              </div>
              {error ? <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft px-4 py-3 text-xs leading-5 text-danger">{error}</div> : null}
              <button type="submit" disabled={isSubmitting} className="focus-ring flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-moss text-sm font-semibold text-white transition hover:bg-[#174a37] disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? 'Verifying…' : 'Sign in'}{!isSubmitting ? <ArrowRight size={16} /> : null}</button>
            </form>
            <p className="mt-6 text-center text-xs leading-5 text-muted">Access is provisioned by your workspace administrator.<br />Need access? Contact your administrator.</p>
          </div>
          <p className="text-center text-[11px] text-muted lg:text-right">PackSure foundation · Secure by default</p>
        </section>
      </div>
    </main>
  )
}

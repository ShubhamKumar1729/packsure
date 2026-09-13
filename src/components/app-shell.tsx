'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  Boxes,
  ClipboardCheck,
  FileBarChart,
  FilePlus2,
  Gavel,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  X,
} from 'lucide-react'
import { Brand } from '@/components/brand'
import { ComplianceAssistant } from '@/components/compliance-assistant'
import { canAccess, type SessionPayload, type UserRole } from '@/lib/auth-shared'
import type { AssistantContext } from '@/lib/assistant/types'

const navigation: { label: string; href: string; icon: typeof LayoutDashboard; roles?: UserRole[] }[] = [
  { label: 'Dashboard', href: '/app', icon: LayoutDashboard },
  { label: 'New inspection', href: '/app/new-inspection', icon: FilePlus2, roles: ['admin', 'inspector'] },
  { label: 'Inspections', href: '/app/inspections', icon: ClipboardCheck },
  { label: 'Products', href: '/app/products', icon: Boxes },
  { label: 'Reports', href: '/app/reports', icon: FileBarChart, roles: ['admin', 'inspector', 'reviewer'] },
  { label: 'Rules', href: '/app/rules', icon: Gavel, roles: ['admin'] },
]

const pageTitles: Record<string, string> = {
  '/app': 'Dashboard',
  '/app/new-inspection': 'New inspection',
  '/app/inspections': 'Inspections',
  '/app/products': 'Products',
  '/app/reports': 'Reports',
  '/app/rules': 'Rules',
}

function initials(session: SessionPayload) {
  if (session.displayName) return session.displayName.slice(0, 2).toUpperCase()
  return session.email.slice(0, 2).toUpperCase()
}

function roleLabel(role: UserRole) {
  return role.charAt(0).toUpperCase() + role.slice(1)
}

function assistantContext(pathname: string): AssistantContext | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts[0] !== 'app') return null
  if (parts[1] === 'inspections' && parts[2] && parts[2] !== 'review') return { type: 'inspection', id: parts[2] }
  if (parts[1] === 'products' && parts[2]) return { type: 'product', id: parts[2] }
  if (parts[1] === 'reports' && parts[2]) return { type: 'report', id: parts[2] }
  return null
}

export function AppShell({ session, children }: { session: SessionPayload; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const visibleNavigation = navigation.filter((item) => canAccess(session.role, item.roles))
  const title = pageTitles[pathname] ?? 'Workspace'
  const currentAssistantContext = assistantContext(pathname)

  const sidebar = (
    <aside className="flex h-full w-[250px] shrink-0 flex-col border-r border-line bg-[#f4f2ec] px-4 py-5">
      <div className="flex items-center justify-between px-2">
        <Brand href="/app" />
        <button type="button" onClick={() => setMobileOpen(false)} className="focus-ring rounded-lg p-2 text-muted hover:bg-black/5 lg:hidden" aria-label="Close menu">
          <X size={18} />
        </button>
      </div>

      <div className="mt-10 px-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">Workspace</p>
        <nav className="mt-3 space-y-1" aria-label="Primary navigation">
          {visibleNavigation.map((item) => {
            const active = item.href === '/app' ? pathname === '/app' : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={`focus-ring group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition ${active ? 'bg-white text-moss shadow-[0_2px_10px_rgba(32,37,33,0.05)]' : 'text-muted hover:bg-white/70 hover:text-ink'}`}
              >
                <Icon size={17} strokeWidth={active ? 2 : 1.8} className={active ? 'text-moss' : 'text-[#929087] group-hover:text-ink'} />
                {item.label}
                {active ? <span className="ml-auto h-1.5 w-1.5 rounded-full bg-amber" /> : null}
              </Link>
            )
          })}
        </nav>
      </div>

      <div className="mt-auto space-y-3">
        <div className="rounded-2xl border border-leaf bg-leaf/55 p-4">
          <div className="flex items-center gap-2 text-moss">
            <ShieldCheck size={17} />
            <span className="text-xs font-semibold">Secure workspace</span>
          </div>
          <p className="mt-2 text-[11px] leading-5 text-[#4f6e5c]">Access is scoped by your assigned role. New records will appear here when connected.</p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-line bg-paper p-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-[11px] font-semibold text-white">{initials(session)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-ink">{session.displayName || session.email}</p>
            <p className="mt-0.5 text-[10px] text-muted">{roleLabel(session.role)}</p>
          </div>
        </div>
      </div>
    </aside>
  )

  return (
    <div className="min-h-screen bg-canvas lg:flex">
      <div className="hidden lg:block">{sidebar}</div>
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <button type="button" aria-label="Close navigation" onClick={() => setMobileOpen(false)} className="absolute inset-0 bg-ink/35" />
          <div className="relative h-full">{sidebar}</div>
        </div>
      ) : null}

      <main className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex h-[76px] items-center justify-between border-b border-line bg-canvas/90 px-5 backdrop-blur-md sm:px-8 lg:px-10">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setMobileOpen(true)} className="focus-ring rounded-xl border border-line bg-paper p-2.5 text-ink lg:hidden" aria-label="Open menu">
              <Menu size={18} />
            </button>
            <div>
              <p className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-muted sm:block">PackSure workspace</p>
              <h1 className="text-lg font-semibold tracking-[-0.03em] text-ink">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 rounded-full border border-line bg-paper px-3 py-1.5 text-[11px] font-medium text-muted sm:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-moss" />
              No live data connected
            </div>
            <button type="button" onClick={handleLogout} disabled={loggingOut} className="focus-ring inline-flex items-center gap-2 rounded-xl px-2 py-2 text-xs font-semibold text-muted transition hover:bg-paper hover:text-ink disabled:opacity-60" title="Sign out">
              <LogOut size={16} />
              <span className="hidden md:inline">{loggingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
        </header>
        <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">{children}</div>
      </main>
      <ComplianceAssistant baseContext={currentAssistantContext} />
    </div>
  )
}

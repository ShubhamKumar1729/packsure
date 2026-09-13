import { AppShell } from '@/components/app-shell'
import { requireSession } from '@/lib/server-auth'

export default async function ProtectedLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await requireSession()
  return <AppShell session={session}>{children}</AppShell>
}

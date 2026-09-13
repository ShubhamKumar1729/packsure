import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { SESSION_COOKIE, verifySessionToken } from '@/lib/auth'
import type { SessionPayload, UserRole } from '@/lib/auth-shared'

export async function getCurrentSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  return token ? verifySessionToken(token) : null
}

export async function requireSession() {
  const session = await getCurrentSession()
  if (!session) redirect('/login')
  return session
}

export async function requireRole(roles: UserRole[]) {
  const session = await requireSession()
  if (!roles.includes(session.role)) redirect('/app?error=forbidden')
  return session
}

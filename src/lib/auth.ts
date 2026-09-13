import { jwtVerify, SignJWT, type JWTPayload } from 'jose'
import { SESSION_TTL_SECONDS, type SessionPayload, USER_ROLES } from '@/lib/auth-shared'

export { SESSION_COOKIE, SESSION_TTL_SECONDS, USER_ROLES } from '@/lib/auth-shared'
export type { SessionPayload, UserRole } from '@/lib/auth-shared'

type SessionClaims = JWTPayload & SessionPayload

function getAuthSecret() {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is not configured.')
  return new TextEncoder().encode(secret)
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload as unknown as JWTPayload)
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getAuthSecret())
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify<SessionClaims>(token, getAuthSecret(), {
      algorithms: ['HS256'],
    })

    if (!payload.userId || !payload.email || !payload.role || !USER_ROLES.includes(payload.role)) {
      return null
    }

    return {
      userId: payload.userId,
      email: payload.email,
      role: payload.role,
      displayName: payload.displayName,
    }
  } catch {
    return null
  }
}

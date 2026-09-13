export const SESSION_COOKIE = 'packsure_session'
export const SESSION_TTL_SECONDS = 60 * 60 * 8

export const USER_ROLES = ['admin', 'inspector', 'reviewer', 'viewer'] as const
export type UserRole = (typeof USER_ROLES)[number]

export type SessionPayload = {
  userId: string
  email: string
  role: UserRole
  displayName?: string
}

export function canAccess(role: UserRole, allowedRoles?: UserRole[]) {
  return !allowedRoles || allowedRoles.includes(role)
}

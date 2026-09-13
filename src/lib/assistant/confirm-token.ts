/**
 * Signed confirmation tokens for state-changing operations. The token binds the exact operation and
 * inspection id the model proposed, so the confirm endpoint can never be tricked into running
 * something the model (or a client) did not declare. Signed with AUTH_SECRET via jose HS256.
 */

import { jwtVerify, SignJWT } from 'jose'

export type OperationName = 'analyze' | 'run_compliance' | 'listing_comparison' | 'generate_report'

export type PendingOperation = {
  operation: OperationName
  inspectionId: string
  label: string
  endpoint: string
  token: string
}

const TTL_SECONDS = 600

function secret() {
  const value = process.env.AUTH_SECRET?.trim()
  if (!value) throw new Error('AUTH_SECRET is required to sign operation confirmations.')
  return new TextEncoder().encode(value)
}

export async function signOperation(payload: { operation: OperationName; inspectionId: string }): Promise<string> {
  return new SignJWT({ op: payload.operation, ins: payload.inspectionId })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime(`${TTL_SECONDS}s`)
    .sign(secret())
}

export async function verifyOperation(token: string): Promise<{ operation: OperationName; inspectionId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    const operation = payload.op
    const inspectionId = payload.ins
    if (typeof operation !== 'string' || typeof inspectionId !== 'string') return null
    const allowed: OperationName[] = ['analyze', 'run_compliance', 'listing_comparison', 'generate_report']
    if (!allowed.includes(operation as OperationName)) return null
    return { operation: operation as OperationName, inspectionId }
  } catch {
    return null
  }
}

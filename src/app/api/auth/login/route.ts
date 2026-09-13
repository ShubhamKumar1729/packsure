import { NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { connectToDatabase } from '@/lib/db'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { User } from '@/models/User'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    let body: { email?: unknown; password?: unknown }
    try {
      body = await request.json() as { email?: unknown; password?: unknown }
    } catch {
      return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 })
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''

    if (!email || !password || email.length > 254 || password.length > 1000) {
      return NextResponse.json({ error: 'Enter your email and password.' }, { status: 400 })
    }

    await connectToDatabase()
    const user = await User.findOne({ email, isActive: true }).select('+passwordHash')

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return NextResponse.json({ error: 'We could not verify those credentials.' }, { status: 401 })
    }

    const token = await createSessionToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
      displayName: user.displayName,
    })

    const response = NextResponse.json({ ok: true })
    response.cookies.set({
      name: SESSION_COOKIE,
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 8,
    })
    return response
  } catch (error) {
    console.error('Authentication error', error)
    return NextResponse.json({ error: 'Authentication is not configured yet. Contact your workspace administrator.' }, { status: 503 })
  }
}

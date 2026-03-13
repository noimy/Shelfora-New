// src/lib/auth.ts
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { db } from './db'

const JWT_SECRET = process.env.JWT_SECRET || 'shelfora-dev-secret-change-in-production'
const COOKIE_NAME = 'shelfora_session'
const SESSION_DAYS = 30

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function signToken(payload: Record<string, unknown>, expiresIn = `${SESSION_DAYS}d`): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions)
}

export function verifyToken(token: string): Record<string, unknown> | null {
  try {
    return jwt.verify(token, JWT_SECRET) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function getCurrentUser() {
  const cookieStore = cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  const payload = verifyToken(token)
  if (!payload?.userId) return null

  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          businesses: {
            include: {
              notifSettings: true,
            },
          },
        },
      },
    },
  })

  if (!session || session.expiresAt < new Date()) {
    return null
  }

  return session.user
}

export async function getAuthContext(request: Request) {
  // Try cookie first
  const cookieHeader = request.headers.get('cookie') || ''
  const cookieToken = parseCookies(cookieHeader)[COOKIE_NAME]

  // Fallback to Authorization header (for API clients)
  const authHeader = request.headers.get('authorization')
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  const token = cookieToken || bearerToken
  if (!token) return { user: null, business: null }

  const payload = verifyToken(token)
  if (!payload?.userId) return { user: null, business: null }

  const session = await db.session.findUnique({
    where: { token },
    include: {
      user: {
        include: {
          businesses: {
            include: { notifSettings: true },
            take: 1,
          },
        },
      },
    },
  })

  if (!session || session.expiresAt < new Date()) {
    return { user: null, business: null }
  }

  const user = session.user
  const business = user.businesses[0] || null

  return { user, business }
}

function parseCookies(cookieHeader: string): Record<string, string> {
  return Object.fromEntries(
    cookieHeader.split(';').map((c) => {
      const [k, ...v] = c.trim().split('=')
      return [k, v.join('=')]
    })
  )
}

export function setSessionCookie(token: string) {
  const cookieStore = cookies()
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * SESSION_DAYS,
    path: '/',
  })
}

export function clearSessionCookie() {
  const cookieStore = cookies()
  cookieStore.delete(COOKIE_NAME)
}

export async function createSession(userId: string): Promise<string> {
  const token = signToken({ userId })
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + SESSION_DAYS)

  await db.session.create({
    data: { userId, token, expiresAt },
  })

  return token
}

// src/app/api/auth/login/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { verifyPassword, createSession, setSessionCookie } from '@/lib/auth'
import { authLimiter, getClientIp } from '@/lib/rateLimit'

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export async function POST(request: Request) {
  const { success } = authLimiter.check(getClientIp(request))
  if (!success) return NextResponse.json({ error: 'Too many login attempts. Please wait and try again.' }, { status: 429 })

  try {
    const body = await request.json()
    const data = schema.parse(body)

    const user = await db.user.findUnique({
      where: { email: data.email },
      include: {
        businesses: {
          include: { notifSettings: true },
          take: 1,
        },
      },
    })

    if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const business = user.businesses[0]

    // Log the login
    if (business) {
      await db.auditLog.create({
        data: {
          businessId: business.id,
          action: 'USER_LOGIN',
          source: 'manual',
          detail: `User logged in: ${user.email}`,
          performedBy: user.name,
        },
      })
    }

    const token = await createSession(user.id)
    setSessionCookie(token)

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        emailVerified: user.emailVerified,
      },
      business: business
        ? {
            id: business.id,
            name: business.name,
            type: business.type,
          }
        : null,
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error('Login error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

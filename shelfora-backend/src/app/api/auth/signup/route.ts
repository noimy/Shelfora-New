// src/app/api/auth/signup/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword, createSession, setSessionCookie } from '@/lib/auth'
import { sendVerificationEmail } from '@/lib/email'
import { signupLimiter, getClientIp } from '@/lib/rateLimit'
import { randomBytes } from 'crypto'

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  businessName: z.string().min(1).max(200),
  businessType: z.string().optional(),
})

export async function POST(request: Request) {
  const { success: ok } = signupLimiter.check(getClientIp(request))
  if (!ok) return NextResponse.json({ error: 'Too many signups from this IP. Try again later.' }, { status: 429 })

  try {
    const body = await request.json()
    const data = schema.parse(body)

    // Check if email already exists
    const existing = await db.user.findUnique({ where: { email: data.email } })
    if (existing) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    const passwordHash = await hashPassword(data.password)
    const emailVerifyToken = randomBytes(32).toString('hex')

    // Create user + business + notification settings in a transaction
    const user = await db.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          name: data.name,
          email: data.email,
          passwordHash,
          emailVerifyToken,
          // 14-day trial
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      })

      const business = await tx.business.create({
        data: {
          userId: u.id,
          name: data.businessName,
          type: (data.businessType as any) || 'OTHER',
        },
      })

      await tx.notificationSettings.create({
        data: { businessId: business.id },
      })

      await tx.auditLog.create({
        data: {
          businessId: business.id,
          action: 'USER_LOGIN',
          source: 'manual',
          detail: `Account created for ${data.email}`,
          performedBy: u.name,
        },
      })

      return u
    })

    // Send verification email (non-blocking)
    sendVerificationEmail({
      to: data.email,
      name: data.name,
      token: emailVerifyToken,
    }).catch(console.error)

    // Create session
    const token = await createSession(user.id)
    setSessionCookie(token)

    return NextResponse.json({
      success: true,
      user: { id: user.id, name: user.name, email: user.email },
    })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error('Signup error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

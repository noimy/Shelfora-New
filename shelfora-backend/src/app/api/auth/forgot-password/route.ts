// src/app/api/auth/forgot-password/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { randomBytes } from 'crypto'

const schema = z.object({ email: z.string().email() })

export async function POST(request: Request) {
  try {
    const { email } = schema.parse(await request.json())
    const user = await db.user.findUnique({ where: { email } })

    // Always return success to prevent email enumeration
    if (!user) return NextResponse.json({ success: true })

    const resetToken = randomBytes(32).toString('hex')
    const resetTokenExpiry = new Date(Date.now() + 60 * 60 * 1000) // 1 hour

    await db.user.update({
      where: { id: user.id },
      data: { resetToken, resetTokenExpiry },
    })

    await sendPasswordResetEmail({ to: email, name: user.name, token: resetToken })

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

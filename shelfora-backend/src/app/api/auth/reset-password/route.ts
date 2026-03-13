// src/app/api/auth/reset-password/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'

const schema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128),
})

export async function POST(request: Request) {
  try {
    const { token, password } = schema.parse(await request.json())

    const user = await db.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    })

    if (!user) {
      return NextResponse.json(
        { error: 'Reset link is invalid or has expired' },
        { status: 400 }
      )
    }

    const passwordHash = await hashPassword(password)

    await db.user.update({
      where: { id: user.id },
      data: { passwordHash, resetToken: null, resetTokenExpiry: null },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

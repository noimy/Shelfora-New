// src/app/api/auth/verify-email/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { token } = await request.json()
    if (!token) return NextResponse.json({ error: 'Token required' }, { status: 400 })

    const user = await db.user.findFirst({ where: { emailVerifyToken: token } })

    if (!user) {
      return NextResponse.json({ error: 'Invalid or already used verification link' }, { status: 400 })
    }

    await db.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null },
    })

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// src/app/api/auth/logout/route.ts
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'

export async function POST() {
  const cookieStore = cookies()
  const token = cookieStore.get('shelfora_session')?.value

  if (token) {
    await db.session.deleteMany({ where: { token } }).catch(() => {})
    cookieStore.delete('shelfora_session')
  }

  return NextResponse.json({ success: true })
}

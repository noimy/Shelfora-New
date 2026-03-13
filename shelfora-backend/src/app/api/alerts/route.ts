// src/app/api/alerts/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/auth'

// GET /api/alerts — get all unread alerts
export async function GET(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const alerts = await db.alert.findMany({
    where: { businessId: business.id },
    include: {
      product: { select: { id: true, name: true, category: true } },
    },
    orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
    take: 50,
  })

  const unreadCount = alerts.filter((a) => !a.isRead).length

  return NextResponse.json({ alerts, unreadCount })
}

// PATCH /api/alerts — mark alerts as read
export async function PATCH(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const ids: string[] = body.ids || []

  if (ids.length === 0) {
    // Mark all as read
    await db.alert.updateMany({
      where: { businessId: business.id, isRead: false },
      data: { isRead: true },
    })
  } else {
    await db.alert.updateMany({
      where: { id: { in: ids }, businessId: business.id },
      data: { isRead: true },
    })
  }

  return NextResponse.json({ success: true })
}

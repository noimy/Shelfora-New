// src/app/api/audit/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/auth'

// GET /api/audit — fetch audit log with filtering
export async function GET(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''
  const action = searchParams.get('action') || ''
  const source = searchParams.get('source') || ''
  const limit = parseInt(searchParams.get('limit') || '100')
  const page = parseInt(searchParams.get('page') || '1')
  const skip = (page - 1) * limit

  const logs = await db.auditLog.findMany({
    where: {
      businessId: business.id,
      ...(action ? { action: action as any } : {}),
      ...(source ? { source } : {}),
      ...(search
        ? {
            OR: [
              { detail: { contains: search, mode: 'insensitive' } },
              { performedBy: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: {
      product: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip,
  })

  const total = await db.auditLog.count({ where: { businessId: business.id } })

  return NextResponse.json({ logs, total, page, limit })
}

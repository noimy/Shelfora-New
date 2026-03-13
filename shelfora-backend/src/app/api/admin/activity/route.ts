// src/app/api/admin/activity/route.ts
// Returns recent audit log entries across ALL businesses for admin monitoring.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

function isAdminAuthorized(request: Request): boolean {
  return request.headers.get('x-admin-secret') === process.env.ADMIN_SECRET
}

export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '100')
  const flagged = searchParams.get('flagged') === 'true'

  // Suspicious activity patterns to flag
  const FLAGGED_ACTIONS = ['USER_LOGIN'] // Could add unusual IPs, after-hours logins etc.

  const logs = await db.auditLog.findMany({
    where: flagged
      ? {
          OR: [
            { action: { in: FLAGGED_ACTIONS as any[] } },
            // New IP flag (simplified: any login from an IP not seen before)
          ],
        }
      : {},
    include: {
      business: { select: { id: true, name: true, user: { select: { plan: true, email: true } } } },
      product: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })

  return NextResponse.json({ logs, total: logs.length })
}

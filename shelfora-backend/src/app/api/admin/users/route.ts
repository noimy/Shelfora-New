// src/app/api/admin/users/route.ts
// Admin-only endpoint. Protected by ADMIN_SECRET header.
// Returns all users, businesses, plan info, and recent activity.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { subDays } from 'date-fns'

function isAdminAuthorized(request: Request): boolean {
  const secret = request.headers.get('x-admin-secret')
  return secret === process.env.ADMIN_SECRET
}

export async function GET(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const users = await db.user.findMany({
    include: {
      businesses: {
        include: {
          _count: { select: { products: true, auditLogs: true } },
          integrations: { where: { isActive: true }, select: { provider: true } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  const since7d = subDays(new Date(), 7)

  const enriched = await Promise.all(
    users.map(async (user) => {
      const business = user.businesses[0]
      if (!business) return { ...user, stats: null }

      const sales7d = await db.sale.aggregate({
        where: { businessId: business.id, saleDate: { gte: since7d } },
        _sum: { quantitySold: true },
      })

      const lastAudit = await db.auditLog.findFirst({
        where: { businessId: business.id },
        orderBy: { createdAt: 'desc' },
      })

      const openAlerts = await db.alert.count({
        where: { businessId: business.id, isRead: false },
      })

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        plan: user.plan,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        stripeCustomerId: user.stripeCustomerId,
        business: business
          ? {
              id: business.id,
              name: business.name,
              type: business.type,
              productCount: business._count.products,
              integrations: business.integrations.map((i) => i.provider),
            }
          : null,
        stats: {
          sales7d: sales7d._sum.quantitySold ?? 0,
          lastActive: lastAudit?.createdAt ?? null,
          openAlerts,
        },
      }
    })
  )

  return NextResponse.json({ users: enriched, total: users.length })
}

// PATCH /api/admin/users — update user status/plan (admin override)
export async function PATCH(request: Request) {
  if (!isAdminAuthorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId, plan, action } = await request.json()

  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

  if (plan) {
    await db.user.update({ where: { id: userId }, data: { plan } })
  }

  // action: 'suspend' deletes all sessions (forces logout)
  if (action === 'suspend') {
    await db.session.deleteMany({ where: { userId } })
  }

  return NextResponse.json({ success: true })
}

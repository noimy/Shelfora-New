// src/app/api/auth/me/route.ts
import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth'

export async function GET(request: Request) {
  const { user, business } = await getAuthContext(request)

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      plan: user.plan,
      emailVerified: user.emailVerified,
      trialEndsAt: user.trialEndsAt,
    },
    business: business
      ? {
          id: business.id,
          name: business.name,
          type: business.type,
          timezone: business.timezone,
          defaultLeadTime: business.defaultLeadTime,
          safetyStockMult: business.safetyStockMult,
          notifSettings: business.notifSettings,
        }
      : null,
  })
}

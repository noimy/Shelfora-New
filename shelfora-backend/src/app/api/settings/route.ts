// src/app/api/settings/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/auth'

const businessSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.string().optional(),
  timezone: z.string().optional(),
  defaultLeadTime: z.number().int().min(1).max(365).optional(),
  safetyStockMult: z.number().min(1).max(10).optional(),
})

const notifSchema = z.object({
  emailAlerts: z.boolean().optional(),
  smsAlerts: z.boolean().optional(),
  smsPhone: z.string().optional(),
  dashboardAlerts: z.boolean().optional(),
  criticalAlerts: z.boolean().optional(),
  reorderDayAlert: z.boolean().optional(),
  weeklyDigest: z.boolean().optional(),
  alertThresholdDays: z.number().int().min(1).max(30).optional(),
})

const userSchema = z.object({
  name: z.string().min(1).max(100).optional(),
})

const schema = z.object({
  business: businessSchema.optional(),
  notifications: notifSchema.optional(),
  user: userSchema.optional(),
})

// GET /api/settings
export async function GET(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const notifSettings = await db.notificationSettings.findUnique({
    where: { businessId: business.id },
  })

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan },
    business: {
      id: business.id,
      name: business.name,
      type: business.type,
      timezone: business.timezone,
      defaultLeadTime: business.defaultLeadTime,
      safetyStockMult: business.safetyStockMult,
    },
    notifications: notifSettings,
  })
}

// PATCH /api/settings
export async function PATCH(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = schema.parse(await request.json())

    await db.$transaction(async (tx) => {
      if (data.business) {
        await tx.business.update({ where: { id: business.id }, data: data.business })
      }

      if (data.user) {
        await tx.user.update({ where: { id: user.id }, data: data.user })
      }

      if (data.notifications) {
        await tx.notificationSettings.upsert({
          where: { businessId: business.id },
          update: data.notifications,
          create: { businessId: business.id, ...data.notifications },
        })
      }

      await tx.auditLog.create({
        data: {
          businessId: business.id,
          action: 'SETTINGS_UPDATED',
          source: 'manual',
          detail: 'Settings updated',
          performedBy: user.name,
        },
      })
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

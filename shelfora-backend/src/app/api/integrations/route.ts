// src/app/api/integrations/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/auth'
import { canUsePOS } from '@/lib/plans'
import { IntegrationProvider } from '@prisma/client'

const connectSchema = z.object({
  provider: z.enum(['SQUARE', 'SHOPIFY', 'CLOVER', 'TOAST', 'LIGHTSPEED']),
  storeId: z.string().min(1),
  accessToken: z.string().min(1),
  syncMode: z.enum(['webhook', 'daily', 'hourly']).default('webhook'),
})

// GET /api/integrations — list all integrations for business
export async function GET(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const integrations = await db.integration.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: 'desc' },
  })

  return NextResponse.json({ integrations })
}

// POST /api/integrations — connect a POS
export async function POST(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!canUsePOS(user.plan)) {
    return NextResponse.json(
      { error: 'POS integrations require a Pro or Enterprise plan.', code: 'PLAN_LIMIT' },
      { status: 403 }
    )
  }

  try {
    const data = connectSchema.parse(await request.json())

    const integration = await db.integration.upsert({
      where: {
        businessId_provider: {
          businessId: business.id,
          provider: data.provider as IntegrationProvider,
        },
      },
      update: {
        accessToken: data.accessToken,
        storeId: data.storeId,
        syncMode: data.syncMode,
        isActive: true,
        updatedAt: new Date(),
      },
      create: {
        businessId: business.id,
        provider: data.provider as IntegrationProvider,
        accessToken: data.accessToken,
        storeId: data.storeId,
        syncMode: data.syncMode,
        isActive: true,
      },
    })

    await db.auditLog.create({
      data: {
        businessId: business.id,
        action: 'INTEGRATION_CONNECTED',
        source: data.provider.toLowerCase(),
        detail: `POS integration connected: ${data.provider} (store: ${data.storeId})`,
        performedBy: user.name,
      },
    })

    return NextResponse.json({ integration })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// DELETE /api/integrations?provider=SQUARE — disconnect
export async function DELETE(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const provider = searchParams.get('provider')?.toUpperCase()

  if (!provider) return NextResponse.json({ error: 'Provider required' }, { status: 400 })

  await db.integration.updateMany({
    where: { businessId: business.id, provider: provider as IntegrationProvider },
    data: { isActive: false },
  })

  await db.auditLog.create({
    data: {
      businessId: business.id,
      action: 'INTEGRATION_DISCONNECTED',
      source: provider.toLowerCase(),
      detail: `POS integration disconnected: ${provider}`,
      performedBy: user.name,
    },
  })

  return NextResponse.json({ success: true })
}

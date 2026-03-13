// src/app/api/products/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/auth'
import { savePrediction } from '@/lib/predictions'
import { isAtProductLimit, getPlan } from '@/lib/plans'

const createSchema = z.object({
  name: z.string().min(1).max(200),
  category: z.string().default('Other'),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  supplier: z.string().optional(),
  supplierEmail: z.string().email().optional().or(z.literal('')),
  currentStock: z.number().min(0),
  reorderLevel: z.number().min(0).default(0),
  leadTimeDays: z.number().int().min(1).default(5),
  costPerUnit: z.number().min(0).default(0),
  notes: z.string().optional(),
})

// GET /api/products — list all products with latest predictions
export async function GET(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const search = searchParams.get('search') || ''
  const category = searchParams.get('category') || ''
  const status = searchParams.get('status') || ''

  const products = await db.product.findMany({
    where: {
      businessId: business.id,
      status: 'ACTIVE',
      ...(search ? { name: { contains: search, mode: 'insensitive' } } : {}),
      ...(category ? { category } : {}),
    },
    include: {
      predictions: {
        orderBy: { calculatedAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { name: 'asc' },
  })

  // Filter by prediction status if requested
  const filtered = status
    ? products.filter((p) => p.predictions[0]?.status === status)
    : products

  return NextResponse.json({ products: filtered })
}

// POST /api/products — create product
export async function POST(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const data = createSchema.parse(body)

    // Check plan product limits
    const count = await db.product.count({ where: { businessId: business.id, status: 'ACTIVE' } })
    if (isAtProductLimit(user.plan, count)) {
      return NextResponse.json(
        {
          error: `Your ${getPlan(user.plan).name} plan supports up to ${getPlan(user.plan).limits.products} products. Upgrade to add more.`,
          code: 'PLAN_LIMIT',
        },
        { status: 403 }
      )
    }

    const product = await db.$transaction(async (tx) => {
      const p = await tx.product.create({
        data: { businessId: business.id, ...data },
      })

      await tx.auditLog.create({
        data: {
          businessId: business.id,
          productId: p.id,
          action: 'PRODUCT_CREATED',
          source: 'manual',
          detail: `Created product: ${p.name} (stock: ${p.currentStock})`,
          performedBy: user.name,
        },
      })

      return p
    })

    // Run initial prediction
    await savePrediction(product.id, business.id, business.safetyStockMult)

    return NextResponse.json({ product }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error('Create product error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

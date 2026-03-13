// src/app/api/products/[id]/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/auth'
import { savePrediction, getSalesByDay } from '@/lib/predictions'

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  category: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  supplier: z.string().optional(),
  supplierEmail: z.string().email().optional().or(z.literal('')),
  currentStock: z.number().min(0).optional(),
  reorderLevel: z.number().min(0).optional(),
  leadTimeDays: z.number().int().min(1).optional(),
  costPerUnit: z.number().min(0).optional(),
  notes: z.string().optional(),
})

// GET /api/products/:id
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const product = await db.product.findFirst({
    where: { id: params.id, businessId: business.id },
    include: {
      predictions: { orderBy: { calculatedAt: 'desc' }, take: 1 },
    },
  })

  if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  // Get sales history for chart
  const salesByDay = await getSalesByDay(product.id, 14)

  // Get recent transactions
  const recentSales = await db.sale.findMany({
    where: { productId: product.id },
    orderBy: { saleDate: 'desc' },
    take: 20,
  })

  const recentAdjustments = await db.inventoryAdjustment.findMany({
    where: { productId: product.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  })

  return NextResponse.json({ product, salesByDay, recentSales, recentAdjustments })
}

// PUT /api/products/:id
export async function PUT(request: Request, { params }: { params: { id: string } }) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()
    const data = updateSchema.parse(body)

    const existing = await db.product.findFirst({
      where: { id: params.id, businessId: business.id },
    })
    if (!existing) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const product = await db.$transaction(async (tx) => {
      const p = await tx.product.update({ where: { id: params.id }, data })
      await tx.auditLog.create({
        data: {
          businessId: business.id,
          productId: p.id,
          action: 'PRODUCT_UPDATED',
          source: 'manual',
          detail: `Updated product: ${p.name}`,
          performedBy: user.name,
        },
      })
      return p
    })

    // Recalculate prediction with updated data
    await savePrediction(product.id, business.id, business.safetyStockMult)

    return NextResponse.json({ product })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// DELETE /api/products/:id — soft delete (archive)
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const existing = await db.product.findFirst({
    where: { id: params.id, businessId: business.id },
  })
  if (!existing) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

  await db.$transaction(async (tx) => {
    await tx.product.update({ where: { id: params.id }, data: { status: 'ARCHIVED' } })
    await tx.auditLog.create({
      data: {
        businessId: business.id,
        productId: params.id,
        action: 'PRODUCT_DELETED',
        source: 'manual',
        detail: `Archived product: ${existing.name}`,
        performedBy: user.name,
      },
    })
  })

  return NextResponse.json({ success: true })
}

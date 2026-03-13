// src/app/api/sales/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/auth'
import { savePrediction, recalculateAllPredictions } from '@/lib/predictions'
import { SaleSource } from '@prisma/client'

const singleSaleSchema = z.object({
  productId: z.string(),
  quantity: z.number().int().min(1),
  source: z.enum(['MANUAL', 'BARCODE', 'POS', 'CSV_IMPORT']).default('MANUAL'),
  saleDate: z.string().optional(), // ISO date string
  notes: z.string().optional(),
  posRefId: z.string().optional(),
})

const bulkSaleSchema = z.object({
  sales: z.array(
    z.object({
      productId: z.string(),
      quantity: z.number().min(0),
    })
  ),
  source: z.enum(['MANUAL', 'BARCODE', 'POS', 'CSV_IMPORT']).default('MANUAL'),
  saleDate: z.string().optional(),
})

// GET /api/sales — recent sales history
export async function GET(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const productId = searchParams.get('productId')
  const source = searchParams.get('source')
  const limit = parseInt(searchParams.get('limit') || '100')
  const days = parseInt(searchParams.get('days') || '30')

  const since = new Date()
  since.setDate(since.getDate() - days)

  const sales = await db.sale.findMany({
    where: {
      businessId: business.id,
      ...(productId ? { productId } : {}),
      ...(source ? { source: source as SaleSource } : {}),
      saleDate: { gte: since },
    },
    include: { product: { select: { name: true, category: true } } },
    orderBy: { saleDate: 'desc' },
    take: limit,
  })

  return NextResponse.json({ sales })
}

// POST /api/sales — record a single sale
export async function POST(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await request.json()

    // Handle bulk mode
    if (body.sales) {
      return handleBulkSales(body, user, business)
    }

    const data = singleSaleSchema.parse(body)

    const product = await db.product.findFirst({
      where: { id: data.productId, businessId: business.id },
    })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    if (product.currentStock < data.quantity) {
      return NextResponse.json(
        { error: `Insufficient stock. Available: ${product.currentStock} units` },
        { status: 400 }
      )
    }

    const saleDate = data.saleDate ? new Date(data.saleDate) : new Date()

    const result = await db.$transaction(async (tx) => {
      // Deduct stock
      const updated = await tx.product.update({
        where: { id: data.productId },
        data: { currentStock: { decrement: data.quantity } },
      })

      // Record sale
      const sale = await tx.sale.create({
        data: {
          productId: data.productId,
          businessId: business.id,
          quantitySold: data.quantity,
          source: data.source as SaleSource,
          saleDate,
          notes: data.notes,
          posRefId: data.posRefId,
          createdBy: user.name,
        },
      })

      // Audit log
      await tx.auditLog.create({
        data: {
          businessId: business.id,
          productId: data.productId,
          saleId: sale.id,
          action: 'SALE_RECORDED',
          source: data.source.toLowerCase(),
          detail: `Sold ${data.quantity} units of ${product.name}`,
          quantity: data.quantity,
          performedBy: user.name,
        },
      })

      return { sale, updatedStock: updated.currentStock }
    })

    // Recalculate prediction for this product only
    await savePrediction(data.productId, business.id, business.safetyStockMult)

    return NextResponse.json({ success: true, ...result }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    console.error('Record sale error:', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

async function handleBulkSales(
  body: unknown,
  user: { id: string; name: string },
  business: { id: string; safetyStockMult: number }
) {
  try {
    const data = bulkSaleSchema.parse(body)
    const saleDate = data.saleDate ? new Date(data.saleDate) : new Date()
    const salesWithQty = data.sales.filter((s) => s.quantity > 0)

    if (salesWithQty.length === 0) {
      return NextResponse.json({ error: 'No quantities entered' }, { status: 400 })
    }

    // Validate all products exist and have sufficient stock
    const products = await db.product.findMany({
      where: { id: { in: salesWithQty.map((s) => s.productId) }, businessId: business.id },
    })

    const errors: string[] = []
    for (const s of salesWithQty) {
      const p = products.find((x) => x.id === s.productId)
      if (!p) { errors.push(`Product not found: ${s.productId}`); continue }
      if (p.currentStock < s.quantity) {
        errors.push(`${p.name}: only ${p.currentStock} in stock, tried to sell ${s.quantity}`)
      }
    }
    if (errors.length) {
      return NextResponse.json({ error: errors[0], errors }, { status: 400 })
    }

    // Execute all sales in one transaction
    const results = await db.$transaction(async (tx) => {
      const saved = []
      for (const s of salesWithQty) {
        const p = products.find((x) => x.id === s.productId)!

        await tx.product.update({
          where: { id: s.productId },
          data: { currentStock: { decrement: s.quantity } },
        })

        const sale = await tx.sale.create({
          data: {
            productId: s.productId,
            businessId: business.id,
            quantitySold: s.quantity,
            source: (data.source as SaleSource) || SaleSource.MANUAL,
            saleDate,
            createdBy: user.name,
          },
        })

        await tx.auditLog.create({
          data: {
            businessId: business.id,
            productId: s.productId,
            saleId: sale.id,
            action: 'SALE_RECORDED',
            source: data.source.toLowerCase(),
            detail: `Bulk entry: ${s.quantity} units of ${p.name}`,
            quantity: s.quantity,
            performedBy: user.name,
          },
        })

        saved.push(sale)
      }
      return saved
    })

    // Recalculate all predictions after bulk save
    await recalculateAllPredictions(business.id)

    return NextResponse.json({ success: true, count: results.length, sales: results }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    throw err
  }
}

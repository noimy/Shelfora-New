// src/app/api/sales/barcode-scan/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/auth'
import { savePrediction } from '@/lib/predictions'
import { canUseBarcode } from '@/lib/plans'

const schema = z.object({
  barcode: z.string().min(1),
  quantity: z.number().int().min(1).default(1),
})

export async function POST(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Plan gate — barcode scanning is Pro+
  if (!canUseBarcode(user.plan)) {
    return NextResponse.json(
      { error: 'Barcode scanning requires a Pro or Enterprise plan.', code: 'PLAN_LIMIT' },
      { status: 403 }
    )
  }

  try {
    const { barcode, quantity } = schema.parse(await request.json())

    // Look up product by barcode
    const product = await db.product.findFirst({
      where: { barcode, businessId: business.id, status: 'ACTIVE' },
    })

    if (!product) {
      return NextResponse.json(
        { error: `No product found with barcode: ${barcode}` },
        { status: 404 }
      )
    }

    if (product.currentStock < quantity) {
      return NextResponse.json(
        { error: `Insufficient stock. Available: ${product.currentStock} units` },
        { status: 400 }
      )
    }

    const result = await db.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: product.id },
        data: { currentStock: { decrement: quantity } },
      })

      const sale = await tx.sale.create({
        data: {
          productId: product.id,
          businessId: business.id,
          quantitySold: quantity,
          source: 'BARCODE',
          saleDate: new Date(),
          createdBy: user.name,
        },
      })

      await tx.auditLog.create({
        data: {
          businessId: business.id,
          productId: product.id,
          saleId: sale.id,
          action: 'SALE_RECORDED',
          source: 'barcode',
          detail: `Barcode scan: ${quantity}× ${product.name} (${barcode})`,
          quantity,
          performedBy: user.name,
        },
      })

      return { sale, updatedStock: updated.currentStock, product: { id: product.id, name: product.name } }
    })

    await savePrediction(product.id, business.id, business.safetyStockMult)

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

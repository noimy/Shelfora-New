// src/app/api/products/[id]/adjust/route.ts
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/auth'
import { savePrediction } from '@/lib/predictions'

const schema = z.object({
  newStock: z.number().min(0),
  reason: z.enum(['STOCK_COUNT', 'DAMAGE', 'THEFT', 'RECEIVING', 'RETURN', 'EXPIRY', 'OTHER']),
  notes: z.string().optional(),
})

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const data = schema.parse(await request.json())

    const product = await db.product.findFirst({
      where: { id: params.id, businessId: business.id },
    })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const diff = data.newStock - product.currentStock

    const result = await db.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: params.id },
        data: { currentStock: data.newStock },
      })

      const adjustment = await tx.inventoryAdjustment.create({
        data: {
          productId: params.id,
          businessId: business.id,
          previousStock: product.currentStock,
          newStock: data.newStock,
          reason: data.reason,
          notes: data.notes,
          adjustedBy: user.name,
        },
      })

      await tx.auditLog.create({
        data: {
          businessId: business.id,
          productId: params.id,
          adjustmentId: adjustment.id,
          action: 'STOCK_ADJUSTED',
          source: 'manual',
          detail: `Stock adjusted: ${product.currentStock} → ${data.newStock} (${diff >= 0 ? '+' : ''}${diff}) — ${data.reason.toLowerCase().replace('_', ' ')}`,
          quantity: Math.abs(diff),
          performedBy: user.name,
        },
      })

      return { adjustment, updatedStock: updated.currentStock }
    })

    await savePrediction(params.id, business.id, business.safetyStockMult)

    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.errors[0].message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

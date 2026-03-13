// src/app/api/webhooks/sale/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { savePrediction } from '@/lib/predictions'
import { createHmac } from 'crypto'

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'whsec_shelfora_dev'

/**
 * Verify the webhook signature sent by the POS system.
 * Each POS uses slightly different signing schemes — this handles Square style.
 */
function verifySignature(body: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(body).digest('hex')
  return signature === expected || signature === `sha256=${expected}`
}

/**
 * POST /api/webhooks/sale
 * Receives sale events from POS systems.
 * 
 * Expected payload:
 * {
 *   transaction_id: string,
 *   business_id: string,      // Shelfora business ID
 *   timestamp: string,
 *   items: [{ product_id: string, quantity: number }]
 * }
 */
export async function POST(request: Request) {
  const rawBody = await request.text()
  const signature = request.headers.get('x-shelfora-signature') ||
    request.headers.get('x-square-hmacsha256-signature') ||
    request.headers.get('x-shopify-hmac-sha256')

  // Verify signature (skip in development)
  if (process.env.NODE_ENV === 'production') {
    if (!verifySignature(rawBody, signature, WEBHOOK_SECRET)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  let payload: {
    transaction_id: string
    business_id: string
    timestamp: string
    items: Array<{ product_id: string; quantity: number }>
    provider?: string
  }

  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { transaction_id, business_id, timestamp, items, provider } = payload

  if (!business_id || !items?.length) {
    return NextResponse.json({ error: 'Missing business_id or items' }, { status: 400 })
  }

  // Check the integration is active
  const business = await db.business.findUnique({ where: { id: business_id } })
  if (!business) return NextResponse.json({ error: 'Business not found' }, { status: 404 })

  const saleDate = timestamp ? new Date(timestamp) : new Date()
  const processed = []
  const errors = []

  for (const item of items) {
    if (!item.product_id || item.quantity <= 0) continue

    // Match by posProductId first, then by barcode as fallback
    const product = await db.product.findFirst({
      where: {
        businessId: business_id,
        status: 'ACTIVE',
        OR: [
          { posProductId: item.product_id },
          { barcode: item.product_id },
        ],
      },
    })

    if (!product) {
      errors.push(`No product matched for POS ID: ${item.product_id}`)
      continue
    }

    // Check for duplicate transaction
    if (transaction_id) {
      const duplicate = await db.sale.findFirst({
        where: { posRefId: transaction_id, productId: product.id },
      })
      if (duplicate) {
        errors.push(`Duplicate transaction: ${transaction_id} for ${product.name}`)
        continue
      }
    }

    try {
      await db.$transaction(async (tx) => {
        await tx.product.update({
          where: { id: product.id },
          data: { currentStock: { decrement: item.quantity } },
        })

        const sale = await tx.sale.create({
          data: {
            productId: product.id,
            businessId: business_id,
            quantitySold: item.quantity,
            source: 'WEBHOOK',
            saleDate,
            posRefId: transaction_id,
            createdBy: `POS Webhook (${provider || 'unknown'})`,
          },
        })

        await tx.auditLog.create({
          data: {
            businessId: business_id,
            productId: product.id,
            saleId: sale.id,
            action: 'SALE_RECORDED',
            source: 'pos',
            detail: `POS webhook: ${item.quantity}× ${product.name} (txn: ${transaction_id})`,
            quantity: item.quantity,
            performedBy: `POS (${provider || 'webhook'})`,
          },
        })

        processed.push({ productId: product.id, name: product.name, qty: item.quantity })
      })

      // Update prediction for this product
      await savePrediction(product.id, business_id, business.safetyStockMult)
    } catch (err) {
      errors.push(`Failed to process ${product.name}: ${err}`)
    }
  }

  // Update last sync time for the integration
  if (provider) {
    await db.integration.updateMany({
      where: {
        businessId: business_id,
        provider: provider.toUpperCase() as any,
        isActive: true,
      },
      data: { lastSyncAt: new Date() },
    })
  }

  return NextResponse.json({
    success: true,
    processed: processed.length,
    errors,
    results: processed,
  })
}

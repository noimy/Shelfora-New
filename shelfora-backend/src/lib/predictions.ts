// src/lib/predictions.ts
// Core prediction engine — mirrors the frontend logic but runs server-side
// and stores results in the DB for fast reads.

import { db } from './db'
import { subDays, addDays, differenceInDays } from 'date-fns'

export interface PredictionResult {
  productId: string
  avgDailySales: number
  daysUntilStockout: number
  stockoutDate: Date | null
  reorderDate: Date | null
  recommendedQty: number
  safetyStock: number
  status: 'green' | 'amber' | 'red'
}

/**
 * Calculate average daily sales for a product over the last N days.
 */
export async function getAvgDailySales(
  productId: string,
  days = 14,
  upToDate = new Date()
): Promise<number> {
  const since = subDays(upToDate, days)

  const result = await db.sale.aggregate({
    where: {
      productId,
      saleDate: { gte: since, lt: upToDate },
    },
    _sum: { quantitySold: true },
  })

  const total = result._sum.quantitySold ?? 0
  return Math.round((total / days) * 10) / 10
}

/**
 * Run full prediction for a single product.
 */
export async function calculatePrediction(
  productId: string,
  safetyStockMult = 2.0
): Promise<PredictionResult> {
  const product = await db.product.findUnique({ where: { id: productId } })
  if (!product) throw new Error(`Product ${productId} not found`)

  const avg = await getAvgDailySales(productId)
  const today = new Date()

  if (avg === 0) {
    return {
      productId,
      avgDailySales: 0,
      daysUntilStockout: Infinity,
      stockoutDate: null,
      reorderDate: null,
      recommendedQty: 0,
      safetyStock: 0,
      status: 'green',
    }
  }

  const daysUntilStockout = Math.floor(product.currentStock / avg)
  const stockoutDate = addDays(today, daysUntilStockout)
  const reorderDate = addDays(stockoutDate, -product.leadTimeDays)
  const safetyStock = Math.round(avg * safetyStockMult)
  const recommendedQty = Math.round(avg * product.leadTimeDays) + safetyStock

  let status: 'green' | 'amber' | 'red' = 'green'
  if (daysUntilStockout <= 3) status = 'red'
  else if (daysUntilStockout <= 10) status = 'amber'

  return {
    productId,
    avgDailySales: avg,
    daysUntilStockout,
    stockoutDate,
    reorderDate,
    recommendedQty,
    safetyStock,
    status,
  }
}

/**
 * Calculate and PERSIST prediction for one product.
 */
export async function savePrediction(
  productId: string,
  businessId: string,
  safetyStockMult = 2.0
) {
  const result = await calculatePrediction(productId, safetyStockMult)

  await db.prediction.upsert({
    where: { id: `pred-${productId}` },
    update: {
      avgDailySales: result.avgDailySales,
      daysUntilStockout: result.daysUntilStockout === Infinity ? 9999 : result.daysUntilStockout,
      stockoutDate: result.stockoutDate,
      reorderDate: result.reorderDate,
      recommendedQty: result.recommendedQty,
      safetyStock: result.safetyStock,
      status: result.status,
      calculatedAt: new Date(),
    },
    create: {
      id: `pred-${productId}`,
      productId,
      businessId,
      avgDailySales: result.avgDailySales,
      daysUntilStockout: result.daysUntilStockout === Infinity ? 9999 : result.daysUntilStockout,
      stockoutDate: result.stockoutDate,
      reorderDate: result.reorderDate,
      recommendedQty: result.recommendedQty,
      safetyStock: result.safetyStock,
      status: result.status,
    },
  })

  return result
}

/**
 * Recalculate all predictions for a business.
 * Called after bulk sales saves or on the nightly cron.
 */
export async function recalculateAllPredictions(businessId: string) {
  const business = await db.business.findUnique({ where: { id: businessId } })
  if (!business) return

  const products = await db.product.findMany({
    where: { businessId, status: 'ACTIVE' },
  })

  const results = await Promise.all(
    products.map((p) => savePrediction(p.id, businessId, business.safetyStockMult))
  )

  // Generate alerts for products needing action
  await generateAlerts(businessId, products, results)

  return results
}

/**
 * Generate (or update) alerts for products that need reordering.
 */
async function generateAlerts(
  businessId: string,
  products: Array<{ id: string; name: string; leadTimeDays: number }>,
  predictions: PredictionResult[]
) {
  const notifSettings = await db.notificationSettings.findUnique({ where: { businessId } })
  if (!notifSettings?.criticalAlerts) return

  // Delete stale unread alerts older than 24h
  await db.alert.deleteMany({
    where: {
      businessId,
      isRead: false,
      createdAt: { lt: subDays(new Date(), 1) },
    },
  })

  for (const pred of predictions) {
    if (pred.status === 'green') continue

    const product = products.find((p) => p.id === pred.productId)
    if (!product) continue

    const alertType =
      pred.daysUntilStockout <= 0
        ? 'OUT_OF_STOCK'
        : pred.daysUntilStockout <= 3
        ? 'STOCKOUT_IMMINENT'
        : pred.daysUntilStockout <= product.leadTimeDays
        ? 'REORDER_DUE'
        : 'LOW_STOCK'

    const message =
      pred.daysUntilStockout <= 0
        ? `${product.name} is out of stock. Order ${pred.recommendedQty} units immediately.`
        : `${product.name} runs out in ${pred.daysUntilStockout} day(s). Reorder ${pred.recommendedQty} units by ${pred.reorderDate?.toLocaleDateString() ?? 'soon'}.`

    await db.alert.upsert({
      where: { id: `alert-${pred.productId}-${alertType}` },
      update: { message, daysLeft: pred.daysUntilStockout, reorderQty: pred.recommendedQty, isRead: false },
      create: {
        id: `alert-${pred.productId}-${alertType}`,
        businessId,
        productId: pred.productId,
        type: alertType as any,
        message,
        daysLeft: pred.daysUntilStockout,
        reorderQty: pred.recommendedQty,
      },
    })
  }
}

/**
 * Get sales data for a product grouped by day (for charts).
 */
export async function getSalesByDay(productId: string, days = 14) {
  const since = subDays(new Date(), days)
  const sales = await db.sale.findMany({
    where: { productId, saleDate: { gte: since } },
    orderBy: { saleDate: 'asc' },
  })

  // Group by date string
  const grouped: Record<string, number> = {}
  for (const sale of sales) {
    const key = sale.saleDate.toISOString().split('T')[0]
    grouped[key] = (grouped[key] ?? 0) + sale.quantitySold
  }
  return grouped
}

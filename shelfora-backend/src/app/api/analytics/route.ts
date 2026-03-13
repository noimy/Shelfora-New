// src/app/api/analytics/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/auth'
import { subDays } from 'date-fns'

// GET /api/analytics — aggregated analytics data
export async function GET(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const days = parseInt(searchParams.get('days') || '30')
  const since = subDays(new Date(), days)

  // Total sales in period
  const salesAgg = await db.sale.aggregate({
    where: { businessId: business.id, saleDate: { gte: since } },
    _sum: { quantitySold: true },
    _count: true,
  })

  // Sales by product (top 10)
  const salesByProduct = await db.sale.groupBy({
    by: ['productId'],
    where: { businessId: business.id, saleDate: { gte: since } },
    _sum: { quantitySold: true },
    orderBy: { _sum: { quantitySold: 'desc' } },
    take: 10,
  })

  // Enrich with product names
  const productIds = salesByProduct.map((s) => s.productId)
  const products = await db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, category: true },
  })
  const topProducts = salesByProduct.map((s) => ({
    ...s,
    product: products.find((p) => p.id === s.productId),
  }))

  // Sales by day (for charts)
  const salesByDay = await db.sale.groupBy({
    by: ['saleDate'],
    where: { businessId: business.id, saleDate: { gte: since } },
    _sum: { quantitySold: true },
    orderBy: { saleDate: 'asc' },
  })

  // Sales by source
  const salesBySource = await db.sale.groupBy({
    by: ['source'],
    where: { businessId: business.id, saleDate: { gte: since } },
    _sum: { quantitySold: true },
  })

  // Sales by category
  const allSales = await db.sale.findMany({
    where: { businessId: business.id, saleDate: { gte: since } },
    include: { product: { select: { category: true } } },
  })
  const byCategory: Record<string, number> = {}
  allSales.forEach((s) => {
    const cat = s.product?.category || 'Other'
    byCategory[cat] = (byCategory[cat] ?? 0) + s.quantitySold
  })

  // Inventory value
  const allProducts = await db.product.findMany({
    where: { businessId: business.id, status: 'ACTIVE' },
    select: { currentStock: true, costPerUnit: true },
  })
  const inventoryValue = allProducts.reduce((sum, p) => sum + p.currentStock * p.costPerUnit, 0)

  // Prediction stats
  const predictions = await db.prediction.findMany({
    where: { businessId: business.id },
  })
  const criticalCount = predictions.filter((p) => p.status === 'red').length
  const lowCount = predictions.filter((p) => p.status === 'amber').length
  const avgDaysLeft =
    predictions.length > 0
      ? predictions.reduce((sum, p) => sum + Math.min(p.daysUntilStockout, 30), 0) / predictions.length
      : 0

  return NextResponse.json({
    period: { days, since },
    overview: {
      totalUnitsSold: salesAgg._sum.quantitySold ?? 0,
      totalTransactions: salesAgg._count,
      inventoryValue: Math.round(inventoryValue * 100) / 100,
      criticalProducts: criticalCount,
      lowStockProducts: lowCount,
      avgDaysLeft: Math.round(avgDaysLeft),
    },
    topProducts,
    salesByDay,
    salesBySource,
    salesByCategory: byCategory,
  })
}

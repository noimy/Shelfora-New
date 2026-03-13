// src/app/api/predictions/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/auth'
import { recalculateAllPredictions, calculatePrediction } from '@/lib/predictions'

// GET /api/predictions — all predictions for the business
export async function GET(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const predictions = await db.prediction.findMany({
    where: { businessId: business.id },
    include: {
      product: {
        select: {
          id: true, name: true, category: true, currentStock: true,
          leadTimeDays: true, supplier: true, costPerUnit: true,
        },
      },
    },
    orderBy: { daysUntilStockout: 'asc' },
  })

  // Group by status for easy consumption
  const critical = predictions.filter((p) => p.status === 'red')
  const low = predictions.filter((p) => p.status === 'amber')
  const healthy = predictions.filter((p) => p.status === 'green')

  return NextResponse.json({ predictions, critical, low, healthy })
}

// POST /api/predictions — force recalculate all
export async function POST(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const results = await recalculateAllPredictions(business.id)
  return NextResponse.json({ success: true, count: results?.length ?? 0 })
}

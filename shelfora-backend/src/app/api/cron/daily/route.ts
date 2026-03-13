// src/app/api/cron/daily/route.ts
/**
 * Nightly cron job — runs at midnight via Vercel Cron.
 * 1. Recalculates all predictions for every business
 * 2. Sends email alerts for critical/low-stock items
 * 3. Sends weekly digest on Mondays
 *
 * Configure in vercel.json:
 * { "crons": [{ "path": "/api/cron/daily", "schedule": "0 6 * * *" }] }
 * (runs at 6 AM UTC daily)
 */
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { recalculateAllPredictions } from '@/lib/predictions'
import { sendReorderAlert, sendWeeklyDigest } from '@/lib/email'
import { sendCriticalAlertSms } from '@/lib/sms'
import { format, isMonday } from 'date-fns'

// Vercel Cron secret protects this endpoint from public access
function isAuthorized(request: Request): boolean {
  const authHeader = request.headers.get('authorization')
  return (
    authHeader === `Bearer ${process.env.CRON_SECRET}` ||
    process.env.NODE_ENV === 'development'
  )
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('[Cron] Starting nightly job at', new Date().toISOString())

  const businesses = await db.business.findMany({
    include: {
      user: { select: { email: true, name: true, plan: true } },
      notifSettings: true,
    },
  })

  const results = {
    businessesProcessed: 0,
    alertEmailsSent: 0,
    digestEmailsSent: 0,
    errors: [] as string[],
  }

  for (const business of businesses) {
    try {
      // 1. Recalculate all predictions
      const predictions = await recalculateAllPredictions(business.id)
      results.businessesProcessed++

      if (!predictions) continue

      // 2. Send email alerts if enabled
      const notif = business.notifSettings
      if (!notif?.emailAlerts) continue

      const critical = predictions.filter((p) => p.status === 'red')
      const low = predictions.filter((p) => p.status === 'amber')

      if (critical.length > 0 || low.length > 0) {
        const alertItems = [...critical, ...low]

        // Fetch product names for alert items
        const productIds = alertItems.map((p) => p.productId)
        const products = await db.product.findMany({ where: { id: { in: productIds } } })

        const alerts = alertItems.map((pred) => {
          const product = products.find((p) => p.id === pred.productId)!
          return {
            productName: product?.name ?? 'Unknown',
            daysLeft: pred.daysUntilStockout,
            reorderQty: pred.recommendedQty,
            reorderBy: pred.reorderDate ? format(pred.reorderDate, 'MMM d') : 'ASAP',
          }
        })

        await sendReorderAlert({
          to: business.user.email,
          businessName: business.name,
          alerts,
        })
        results.alertEmailsSent++
      }

      // 3. SMS alerts for critical items
      if (notif?.smsAlerts && notif?.smsPhone && critical.length > 0) {
        await sendCriticalAlertSms({
          to: notif.smsPhone,
          businessName: business.name,
          criticalCount: critical.length,
          lowCount: low.length,
        })
      }

      // 3. Weekly digest (Mondays only)
      if (isMonday(new Date()) && notif?.weeklyDigest) {
        const weekSales = await db.sale.aggregate({
          where: {
            businessId: business.id,
            saleDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
          _sum: { quantitySold: true },
        })

        const topSaleResult = await db.sale.groupBy({
          by: ['productId'],
          where: {
            businessId: business.id,
            saleDate: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
          _sum: { quantitySold: true },
          orderBy: { _sum: { quantitySold: 'desc' } },
          take: 1,
        })

        let topProductName = '—'
        if (topSaleResult[0]) {
          const topProd = await db.product.findUnique({ where: { id: topSaleResult[0].productId } })
          topProductName = topProd?.name ?? '—'
        }

        await sendWeeklyDigest({
          to: business.user.email,
          businessName: business.name,
          totalSales: weekSales._sum.quantitySold ?? 0,
          topProduct: topProductName,
          criticalCount: predictions.filter((p) => p.status === 'red').length,
          lowCount: predictions.filter((p) => p.status === 'amber').length,
        })
        results.digestEmailsSent++
      }
    } catch (err) {
      console.error(`[Cron] Error processing business ${business.id}:`, err)
      results.errors.push(`Business ${business.id}: ${err}`)
    }
  }

  console.log('[Cron] Completed:', results)
  return NextResponse.json({ success: true, ...results })
}

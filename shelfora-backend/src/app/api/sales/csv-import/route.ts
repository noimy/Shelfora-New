// src/app/api/sales/csv-import/route.ts
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getAuthContext } from '@/lib/auth'
import { recalculateAllPredictions } from '@/lib/predictions'

/**
 * POST /api/sales/csv-import
 * Accepts a CSV file upload with columns: product_name, quantity_sold, date (optional)
 * Returns counts of imported and skipped rows.
 */
export async function POST(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) return NextResponse.json({ error: 'No file uploaded' }, { status: 400 })
    if (!file.name.endsWith('.csv')) {
      return NextResponse.json({ error: 'File must be a .csv' }, { status: 400 })
    }

    const text = await file.text()
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)

    if (lines.length < 2) {
      return NextResponse.json({ error: 'CSV must have a header row and at least one data row' }, { status: 400 })
    }

    const header = lines[0].toLowerCase()
    if (!header.includes('product') || !header.includes('quantity')) {
      return NextResponse.json(
        { error: 'CSV must have columns: product_name, quantity_sold, date (optional)' },
        { status: 400 }
      )
    }

    // Load all products for this business (for name matching)
    const products = await db.product.findMany({
      where: { businessId: business.id, status: 'ACTIVE' },
    })

    const today = new Date().toISOString().split('T')[0]
    let imported = 0
    const skipped: string[] = []

    const salesToCreate = []

    for (const line of lines.slice(1)) {
      const parts = line.split(',').map((p) => p.trim().replace(/^"|"$/g, ''))
      if (parts.length < 2) { skipped.push(`Invalid row: ${line}`); continue }

      const productName = parts[0]
      const quantity = parseFloat(parts[1])
      const dateStr = parts[2] || today

      if (!productName || isNaN(quantity) || quantity <= 0) {
        skipped.push(`Invalid data: ${line}`)
        continue
      }

      // Match product by name (case-insensitive)
      const product = products.find(
        (p) => p.name.toLowerCase() === productName.toLowerCase()
      )

      if (!product) {
        skipped.push(`Product not found: "${productName}"`)
        continue
      }

      let saleDate: Date
      try {
        saleDate = new Date(dateStr)
        if (isNaN(saleDate.getTime())) throw new Error('invalid date')
      } catch {
        skipped.push(`Invalid date "${dateStr}" for "${productName}"`)
        continue
      }

      salesToCreate.push({ product, quantity, saleDate })
    }

    // Execute all valid sales in a transaction
    if (salesToCreate.length > 0) {
      await db.$transaction(async (tx) => {
        for (const { product, quantity, saleDate } of salesToCreate) {
          // Soft clamp — we allow CSV imports even if stock goes negative (common in bulk imports)
          await tx.product.update({
            where: { id: product.id },
            data: { currentStock: { decrement: quantity } },
          })

          const sale = await tx.sale.create({
            data: {
              productId: product.id,
              businessId: business.id,
              quantitySold: quantity,
              source: 'CSV_IMPORT',
              saleDate,
              createdBy: user.name,
            },
          })

          await tx.auditLog.create({
            data: {
              businessId: business.id,
              productId: product.id,
              saleId: sale.id,
              action: 'SALE_RECORDED',
              source: 'csv_import',
              detail: `CSV import: ${quantity}× ${product.name} (${saleDate.toISOString().split('T')[0]})`,
              quantity,
              performedBy: user.name,
            },
          })

          imported++
        }
      })

      // Recalculate all predictions after import
      await recalculateAllPredictions(business.id)
    }

    return NextResponse.json({ success: true, imported, skipped: skipped.length, skippedDetails: skipped })
  } catch (err) {
    console.error('CSV import error:', err)
    return NextResponse.json({ error: 'Something went wrong during import' }, { status: 500 })
  }
}

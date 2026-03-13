// prisma/seed.ts
import { PrismaClient, PlanType, BusinessType, SaleSource, AdjustmentReason, AuditAction } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Create demo user
  const passwordHash = await bcrypt.hash('demo123456', 12)
  const user = await prisma.user.upsert({
    where: { email: 'demo@greenleafcafe.com' },
    update: {},
    create: {
      name: 'Jane Smith',
      email: 'demo@greenleafcafe.com',
      passwordHash,
      emailVerified: true,
      plan: PlanType.PRO,
    },
  })

  // Create business
  const business = await prisma.business.upsert({
    where: { id: 'seed-business-1' },
    update: {},
    create: {
      id: 'seed-business-1',
      userId: user.id,
      name: 'Green Leaf Cafe',
      type: BusinessType.COFFEE_SHOP,
      timezone: 'America/Chicago',
      defaultLeadTime: 5,
      safetyStockMult: 2.0,
    },
  })

  // Create notification settings
  await prisma.notificationSettings.upsert({
    where: { businessId: business.id },
    update: {},
    create: {
      businessId: business.id,
      emailAlerts: true,
      smsAlerts: false,
      dashboardAlerts: true,
      criticalAlerts: true,
    },
  })

  // Create products
  const productsData = [
    { name: 'Whole Milk',       category: 'Dairy',     sku: 'MILK-001', barcode: '012938472001', supplier: 'City Dairy Co',      currentStock: 14,  reorderLevel: 20, leadTimeDays: 5, costPerUnit: 2.40 },
    { name: 'Coffee Beans',     category: 'Beverages', sku: 'COF-001',  barcode: '012938472938', supplier: 'Metro Coffee Supply', currentStock: 50,  reorderLevel: 20, leadTimeDays: 5, costPerUnit: 18.00 },
    { name: 'Croissants',       category: 'Bakery',    sku: 'BAK-001',  barcode: '401234500010', supplier: 'Local Bakehouse',     currentStock: 38,  reorderLevel: 15, leadTimeDays: 2, costPerUnit: 1.20 },
    { name: 'Espresso Pods',    category: 'Beverages', sku: 'ESP-001',  barcode: '401234500011', supplier: 'Metro Coffee Supply', currentStock: 22,  reorderLevel: 10, leadTimeDays: 5, costPerUnit: 0.80 },
    { name: 'Oat Milk',         category: 'Dairy',     sku: 'OAT-001',  barcode: '401234500012', supplier: 'City Dairy Co',      currentStock: 110, reorderLevel: 30, leadTimeDays: 5, costPerUnit: 3.20 },
    { name: 'Butter',           category: 'Dairy',     sku: 'BUT-001',  barcode: '401234500013', supplier: 'City Dairy Co',      currentStock: 40,  reorderLevel: 10, leadTimeDays: 5, costPerUnit: 3.50 },
    { name: 'Paper Cups (12oz)',category: 'Supplies',  sku: 'CUP-001',  barcode: '401234500014', supplier: 'PackagePro',         currentStock: 500, reorderLevel: 100,leadTimeDays: 7, costPerUnit: 0.08 },
    { name: 'Napkins',          category: 'Supplies',  sku: 'NAP-001',  barcode: '401234500015', supplier: 'PackagePro',         currentStock: 800, reorderLevel: 150,leadTimeDays: 7, costPerUnit: 0.03 },
    { name: 'Almond Milk',      category: 'Dairy',     sku: 'ALM-001',  barcode: '401234500016', supplier: 'City Dairy Co',      currentStock: 45,  reorderLevel: 20, leadTimeDays: 5, costPerUnit: 3.80 },
    { name: 'Muffins',          category: 'Bakery',    sku: 'MUF-001',  barcode: '401234500017', supplier: 'Local Bakehouse',    currentStock: 30,  reorderLevel: 12, leadTimeDays: 2, costPerUnit: 1.50 },
  ]

  const products = []
  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where: { id: `seed-product-${p.sku}` },
      update: {},
      create: { id: `seed-product-${p.sku}`, businessId: business.id, ...p },
    })
    products.push(product)
  }

  // Seed 14 days of sales history
  const bases: Record<string, number> = {
    'seed-product-MILK-001': 6.8, 'seed-product-COF-001': 7.4, 'seed-product-BAK-001': 4.2,
    'seed-product-ESP-001': 2.8, 'seed-product-OAT-001': 5.1, 'seed-product-BUT-001': 1.8,
    'seed-product-CUP-001': 16, 'seed-product-NAP-001': 20, 'seed-product-ALM-001': 3.2, 'seed-product-MUF-001': 3.5,
  }
  const today = new Date('2026-03-13')
  for (let d = 13; d >= 1; d--) {
    const saleDate = new Date(today)
    saleDate.setDate(saleDate.getDate() - d)
    for (const product of products) {
      const base = bases[product.id] || 2
      const qty = Math.max(0, Math.round(base + (Math.random() - 0.5) * base * 0.5))
      if (qty > 0) {
        await prisma.sale.create({
          data: {
            productId: product.id,
            businessId: business.id,
            quantitySold: qty,
            source: SaleSource.MANUAL,
            saleDate,
            createdBy: user.name,
          },
        })
      }
    }
  }

  console.log('✅ Seed complete!')
  console.log('   Demo login: demo@greenleafcafe.com / demo123456')
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())

// src/lib/plans.ts
// Plan definitions, limits, and feature gating

export type Plan = 'BASIC' | 'PRO' | 'ENTERPRISE'

export const PLANS = {
  BASIC: {
    name: 'Basic',
    price: 19.99,
    priceId: process.env.STRIPE_BASIC_PRICE_ID || '',
    tagline: 'For solo operators just getting started',
    features: [
      'Up to 50 products',
      'Daily stockout predictions',
      'Reorder date recommendations',
      'Email alerts',
      'Manual sales entry',
      'CSV import',
      'Full audit log',
      '1 business location',
      '14-day sales history',
      'Standard support',
    ],
    limits: {
      products: 50,
      locations: 1,
      salesHistoryDays: 14,
      csvImport: true,
      posIntegrations: false,
      barcodeScanning: false,
      smsAlerts: false,
      analyticsAdvanced: false,
      apiAccess: false,
      multiUser: false,
      weeklyDigest: false,
      autoReorderDrafts: false,
      customReports: false,
      prioritySupport: false,
      whiteLabel: false,
    },
  },

  PRO: {
    name: 'Pro',
    price: 79.99,
    priceId: process.env.STRIPE_PRO_PRICE_ID || '',
    tagline: 'For growing businesses with more complex needs',
    features: [
      'Up to 500 products',
      'Everything in Basic',
      'POS integrations (Square, Shopify, Clover, Toast, Lightspeed)',
      'Barcode scanning (camera + USB)',
      'SMS alerts',
      'Advanced analytics',
      'Webhook endpoint for custom integrations',
      'API access',
      '3 business locations',
      '90-day sales history',
      'Weekly digest emails',
      'Up to 3 team members',
      'Priority email support',
    ],
    limits: {
      products: 500,
      locations: 3,
      salesHistoryDays: 90,
      csvImport: true,
      posIntegrations: true,
      barcodeScanning: true,
      smsAlerts: true,
      analyticsAdvanced: true,
      apiAccess: true,
      multiUser: true,
      maxUsers: 3,
      weeklyDigest: true,
      autoReorderDrafts: false,
      customReports: false,
      prioritySupport: true,
      whiteLabel: false,
    },
  },

  ENTERPRISE: {
    name: 'Enterprise',
    price: 169.99,
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
    tagline: 'For multi-location businesses that need everything',
    features: [
      'Unlimited products',
      'Everything in Pro',
      'Unlimited business locations',
      'Unlimited team members',
      'Auto purchase order drafting',
      'Custom analytics reports',
      'Supplier email automation',
      '2-year sales history',
      'Custom reorder rules per product',
      'Dedicated account manager',
      'SLA-backed priority support',
      'White-label option',
      'Custom integrations on request',
      'SSO / SAML login',
      'Audit log export + compliance tools',
      'API rate limits removed',
    ],
    limits: {
      products: Infinity,
      locations: Infinity,
      salesHistoryDays: 730,
      csvImport: true,
      posIntegrations: true,
      barcodeScanning: true,
      smsAlerts: true,
      analyticsAdvanced: true,
      apiAccess: true,
      multiUser: true,
      maxUsers: Infinity,
      weeklyDigest: true,
      autoReorderDrafts: true,
      customReports: true,
      prioritySupport: true,
      whiteLabel: true,
      supplierAutomation: true,
      ssoSaml: true,
    },
  },
} as const

export function getPlan(plan: Plan) {
  return PLANS[plan]
}

export function canUsePOS(plan: Plan): boolean {
  return PLANS[plan].limits.posIntegrations
}

export function canUseSMS(plan: Plan): boolean {
  return PLANS[plan].limits.smsAlerts
}

export function canUseBarcode(plan: Plan): boolean {
  return PLANS[plan].limits.barcodeScanning
}

export function canUseAPI(plan: Plan): boolean {
  return PLANS[plan].limits.apiAccess
}

export function getProductLimit(plan: Plan): number {
  return PLANS[plan].limits.products
}

export function isAtProductLimit(plan: Plan, currentCount: number): boolean {
  const limit = getProductLimit(plan)
  return limit !== Infinity && currentCount >= limit
}

export function requiresPlan(plan: Plan, requiredPlan: Plan): boolean {
  const order: Plan[] = ['BASIC', 'PRO', 'ENTERPRISE']
  return order.indexOf(plan) >= order.indexOf(requiredPlan)
}

// src/app/api/billing/checkout/route.ts
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthContext } from '@/lib/auth'
import { db } from '@/lib/db'
import { PLANS } from '@/lib/plans'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

export async function POST(request: Request) {
  const { user, business } = await getAuthContext(request)
  if (!user || !business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { plan } = await request.json()
  if (!plan || !PLANS[plan as keyof typeof PLANS]) {
    return NextResponse.json({ error: 'Invalid plan' }, { status: 400 })
  }

  const planConfig = PLANS[plan as keyof typeof PLANS]

  // Get or create Stripe customer
  let customerId = user.stripeCustomerId
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { userId: user.id, businessId: business.id },
    })
    customerId = customer.id
    await db.user.update({ where: { id: user.id }, data: { stripeCustomerId: customerId } })
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: planConfig.priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_URL}/dashboard?upgraded=1`,
    cancel_url: `${process.env.NEXT_PUBLIC_URL}/settings?tab=billing`,
    metadata: { userId: user.id, plan },
    subscription_data: {
      metadata: { userId: user.id, plan },
    },
  })

  return NextResponse.json({ url: session.url })
}

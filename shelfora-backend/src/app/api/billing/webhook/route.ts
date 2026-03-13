// src/app/api/billing/webhook/route.ts
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { db } from '@/lib/db'
import { PlanType } from '@prisma/client'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!

// Map Stripe price IDs to plan types
function getPlanFromPriceId(priceId: string): PlanType {
  if (priceId === process.env.STRIPE_BASIC_PRICE_ID) return PlanType.BASIC
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return PlanType.PRO
  if (priceId === process.env.STRIPE_ENTERPRISE_PRICE_ID) return PlanType.ENTERPRISE
  return PlanType.BASIC
}

export async function POST(request: Request) {
  const body = await request.text()
  const sig = request.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET)
  } catch (err) {
    console.error('Stripe webhook signature error:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.CheckoutSession
      const userId = session.metadata?.userId
      const plan = session.metadata?.plan as PlanType
      if (userId && plan) {
        await db.user.update({
          where: { id: userId },
          data: {
            plan,
            stripeSubId: session.subscription as string,
            stripeCustomerId: session.customer as string,
          },
        })
      }
      break
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.userId
      if (!userId) break
      const priceId = sub.items.data[0]?.price?.id
      const plan = getPlanFromPriceId(priceId)
      await db.user.update({ where: { id: userId }, data: { plan, stripeSubId: sub.id } })
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const userId = sub.metadata?.userId
      if (userId) {
        await db.user.update({ where: { id: userId }, data: { plan: PlanType.BASIC, stripeSubId: null } })
      }
      break
    }

    case 'invoice.payment_failed': {
      // Could send an email here via resend
      const invoice = event.data.object as Stripe.Invoice
      console.warn('Payment failed for customer:', invoice.customer)
      break
    }
  }

  return NextResponse.json({ received: true })
}

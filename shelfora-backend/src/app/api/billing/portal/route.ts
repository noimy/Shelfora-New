// src/app/api/billing/portal/route.ts
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { getAuthContext } from '@/lib/auth'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' })

export async function POST(request: Request) {
  const { user } = await getAuthContext(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!user.stripeCustomerId) {
    return NextResponse.json({ error: 'No billing account found' }, { status: 400 })
  }

  const session = await stripe.billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_URL}/settings?tab=billing`,
  })

  return NextResponse.json({ url: session.url })
}

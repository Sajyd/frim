import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import Stripe from 'stripe'
import { authOptions } from '@/lib/auth'
import { stripe, PLANS, safeReturnPath, stripeErrorMessage, type PaidPlanType } from '@/lib/stripe'
import prisma from '@/lib/prisma'
import { publicAppUrl } from '@/lib/app-url'

function isLiveSub(status: Stripe.Subscription.Status) {
  return status === 'active' || status === 'trialing' || status === 'past_due'
}

async function findLiveSubscription(customerId: string, knownId?: string | null) {
  if (knownId) {
    try {
      const sub = await stripe.subscriptions.retrieve(knownId)
      if (isLiveSub(sub.status)) return sub
    } catch (err) {
      console.error('Stored subscription lookup failed:', err)
    }
  }

  const listed = await stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
  })
  return listed.data.find(sub => isLiveSub(sub.status)) ?? null
}

async function assertRecurringPrice(priceId: string) {
  const price = await stripe.prices.retrieve(priceId)
  if (price.type !== 'recurring' || !price.recurring) {
    throw new Error(`Stripe price ${priceId} is not a recurring subscription price`)
  }
  return price
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const planId: PaidPlanType = body.planId === 'studio' ? 'studio' : 'pro'
    const returnPath = safeReturnPath(body.returnUrl, '/dashboard')
    const target = PLANS[planId]

    if (!target.priceId) {
      return NextResponse.json(
        { error: `Missing Stripe price for ${planId}. Set STRIPE_${planId.toUpperCase()}_PRICE_ID.` },
        { status: 500 }
      )
    }

    await assertRecurringPrice(target.priceId)

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const origin = publicAppUrl()
    const joiner = returnPath.includes('?') ? '&' : '?'
    const successUrl = `${origin}${returnPath}${joiner}upgraded=${planId}`
    const cancelUrl = `${origin}${returnPath}${joiner}canceled=true`

    if (user.plan === planId && user.stripeSubscriptionId) {
      return NextResponse.json({ url: `${origin}${returnPath}` })
    }

    let customerId = user.stripeCustomerId

    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email!,
        name: user.name || undefined,
        metadata: {
          userId: user.id,
        },
      })

      customerId = customer.id

      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      })
    }

    const liveSub = await findLiveSubscription(customerId, user.stripeSubscriptionId)

    if (liveSub) {
      const itemId = liveSub.items.data[0]?.id
      const currentPrice = liveSub.items.data[0]?.price?.id
      if (!itemId) {
        return NextResponse.json(
          { error: 'Your subscription has no billable item. Contact support@frim.app' },
          { status: 500 }
        )
      }

      if (currentPrice !== target.priceId) {
        await stripe.subscriptions.update(liveSub.id, {
          items: [{ id: itemId, price: target.priceId }],
          proration_behavior: 'create_prorations',
          metadata: { userId: user.id, planId },
        })
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          plan: planId,
          stripeSubscriptionId: liveSub.id,
          stripePriceId: target.priceId,
          ...(planId === 'studio' && user.plan !== 'studio' ? { gpuCapturesUsed: 0 } : {}),
        },
      })
      return NextResponse.json({ upgraded: true, planId })
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [
        {
          price: target.priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        planId,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          planId,
        },
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Checkout error:', error)
    return NextResponse.json(
      { error: stripeErrorMessage(error, 'Failed to create checkout session') },
      { status: 500 }
    )
  }
}

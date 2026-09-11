import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe, PLANS, safeReturnPath, type PaidPlanType } from '@/lib/stripe'
import prisma from '@/lib/prisma'

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

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const origin = process.env.NEXTAUTH_URL || 'http://localhost:3000'
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

    if (user.stripeSubscriptionId) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId)
        if (subscription.status === 'active' || subscription.status === 'trialing') {
          const itemId = subscription.items.data[0]?.id
          const currentPrice = subscription.items.data[0]?.price?.id
          if (itemId && currentPrice !== target.priceId) {
            await stripe.subscriptions.update(user.stripeSubscriptionId, {
              items: [{ id: itemId, price: target.priceId }],
              proration_behavior: 'create_prorations',
              metadata: { userId: user.id, planId },
            })
          }
          await prisma.user.update({
            where: { id: user.id },
            data: {
              plan: planId,
              stripePriceId: target.priceId,
              ...(planId === 'studio' && user.plan !== 'studio' ? { gpuCapturesUsed: 0 } : {}),
            },
          })
          return NextResponse.json({ upgraded: true, planId })
        }
      } catch (err) {
        console.error('Subscription update failed, falling back to checkout:', err)
      }
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: target.priceId,
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
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
      { error: 'Failed to create checkout session' },
      { status: 500 }
    )
  }
}

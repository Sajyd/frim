import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe, planFromPriceId, isPaidPlan } from '@/lib/stripe'
import prisma from '@/lib/prisma'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'

function priceIdFromSubscription(subscription: Stripe.Subscription) {
  return subscription.items.data[0]?.price?.id ?? null
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const headersList = await headers()
  const signature = headersList.get('stripe-signature')

  if (!signature) {
    console.error('Missing stripe-signature header')
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  console.log('Webhook event received:', event.type)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        console.log('Checkout session completed:', session.id, 'Mode:', session.mode)

        if (session.mode === 'subscription' && session.subscription) {
          const subscriptionId = typeof session.subscription === 'string'
            ? session.subscription
            : session.subscription.id

          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const periodEnd = (subscription as any).current_period_end
          const priceId = priceIdFromSubscription(subscription)
          const plan = planFromPriceId(priceId)

          const updatedUser = await prisma.user.update({
            where: { stripeCustomerId: session.customer as string },
            data: {
              plan,
              stripeSubscriptionId: subscription.id,
              stripePriceId: priceId,
              stripeCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
              gpuCapturesUsed: 0,
            },
          })

          console.log('User updated to', plan, updatedUser.id, updatedUser.email)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('Subscription updated:', subscription.id, 'Status:', subscription.status)

        const periodEnd = (subscription as any).current_period_end
        const priceId = priceIdFromSubscription(subscription)
        const plan = subscription.status === 'active' || subscription.status === 'trialing'
          ? planFromPriceId(priceId)
          : 'free'

        await prisma.user.update({
          where: { stripeCustomerId: subscription.customer as string },
          data: {
            plan,
            stripePriceId: priceId,
            stripeCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
          },
        })
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('Subscription deleted:', subscription.id)

        await prisma.user.update({
          where: { stripeCustomerId: subscription.customer as string },
          data: {
            plan: 'free',
            stripeSubscriptionId: null,
            stripePriceId: null,
            stripeCurrentPeriodEnd: null,
            gpuCapturesUsed: 0,
          },
        })
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        console.log('Invoice payment succeeded:', invoice.id)

        const invoiceSubscription = (invoice as any).subscription

        if (invoiceSubscription) {
          const subscriptionId = typeof invoiceSubscription === 'string'
            ? invoiceSubscription
            : invoiceSubscription.id

          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          const periodEnd = (subscription as any).current_period_end
          const priceId = priceIdFromSubscription(subscription)
          const plan = planFromPriceId(priceId)
          const billingReason = (invoice as any).billing_reason as string | undefined
          const resetQuota = billingReason === 'subscription_cycle' || billingReason === 'subscription_create'

          await prisma.user.update({
            where: { stripeCustomerId: invoice.customer as string },
            data: {
              plan: isPaidPlan(plan) ? plan : 'pro',
              stripeCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
              ...(resetQuota ? { gpuCapturesUsed: 0 } : {}),
            },
          })
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        console.log('Payment failed for customer:', invoice.customer)
        break
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook handler error:', error)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }
}

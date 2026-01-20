import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { stripe } from '@/lib/stripe'
import prisma from '@/lib/prisma'
import Stripe from 'stripe'

// Allow raw body for webhook verification
export const dynamic = 'force-dynamic'

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
          
          console.log('Subscription retrieved:', subscription.id, 'Status:', subscription.status)
          console.log('Customer ID:', session.customer)
          
          // Get current period end from subscription
          const periodEnd = (subscription as any).current_period_end
          
          // Update user with subscription details
          const updatedUser = await prisma.user.update({
            where: { stripeCustomerId: session.customer as string },
            data: {
              plan: 'pro',
              stripeSubscriptionId: subscription.id,
              stripePriceId: subscription.items.data[0].price.id,
              stripeCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
            },
          })
          
          console.log('User updated to pro:', updatedUser.id, updatedUser.email)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        console.log('Subscription updated:', subscription.id, 'Status:', subscription.status)
        
        // Get current period end from subscription
        const periodEnd = (subscription as any).current_period_end
        
        await prisma.user.update({
          where: { stripeCustomerId: subscription.customer as string },
          data: {
            plan: subscription.status === 'active' ? 'pro' : 'free',
            stripePriceId: subscription.items.data[0].price.id,
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
          },
        })
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as Stripe.Invoice
        console.log('Invoice payment succeeded:', invoice.id)
        
        // Get subscription from the invoice - handle both string and object
        const invoiceSubscription = (invoice as any).subscription
        
        if (invoiceSubscription) {
          const subscriptionId = typeof invoiceSubscription === 'string' 
            ? invoiceSubscription 
            : invoiceSubscription.id
          
          const subscription = await stripe.subscriptions.retrieve(subscriptionId)
          
          // Get current period end from subscription
          const periodEnd = (subscription as any).current_period_end
          
          await prisma.user.update({
            where: { stripeCustomerId: invoice.customer as string },
            data: {
              plan: 'pro',
              stripeCurrentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
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
    return NextResponse.json(
      { error: 'Webhook handler failed' },
      { status: 500 }
    )
  }
}

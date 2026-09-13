import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { stripe, GPU_OVERAGE_CENTS, isStudioPlan, safeReturnPath } from '@/lib/stripe'
import prisma from '@/lib/prisma'
import { publicAppUrl } from '@/lib/app-url'

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const quantity = Math.min(100, Math.max(1, Math.round(Number(body.quantity) || 1)))
    const returnPath = safeReturnPath(body.returnUrl, '/dashboard')

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
    })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (!isStudioPlan(user.plan)) {
      return NextResponse.json(
        { error: 'Extra captures are available on the Studio plan' },
        { status: 403 }
      )
    }

    let customerId = user.stripeCustomerId
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email!,
        name: user.name || undefined,
        metadata: { userId: user.id },
      })
      customerId = customer.id
      await prisma.user.update({
        where: { id: user.id },
        data: { stripeCustomerId: customerId },
      })
    }

    const origin = publicAppUrl()
    const joiner = returnPath.includes('?') ? '&' : '?'

    const checkoutSession = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            unit_amount: GPU_OVERAGE_CENTS,
            product_data: {
              name: 'Studio 3D extra capture',
              description: 'One GPU motion capture applied to your GLB',
            },
          },
          quantity,
        },
      ],
      success_url: `${origin}${returnPath}${joiner}credits=${quantity}`,
      cancel_url: `${origin}${returnPath}${joiner}canceled=true`,
      metadata: {
        userId: user.id,
        type: 'gpu_credits',
        quantity: String(quantity),
      },
    })

    return NextResponse.json({ url: checkoutSession.url })
  } catch (error) {
    console.error('Credit checkout error:', error)
    return NextResponse.json({ error: 'Failed to start payment' }, { status: 500 })
  }
}

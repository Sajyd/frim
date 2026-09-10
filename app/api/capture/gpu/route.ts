import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { PLANS, isStudioPlan } from '@/lib/stripe'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, gpuCapturesUsed: true },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (!isStudioPlan(user.plan)) {
      return NextResponse.json(
        { error: 'Studio 3D capture requires the Studio plan', code: 'STUDIO_REQUIRED' },
        { status: 403 }
      )
    }

    const limit = PLANS.studio.limits.gpuCapturesPerMonth
    const used = user.gpuCapturesUsed ?? 0
    if (used >= limit) {
      return NextResponse.json(
        { error: `You've used all ${limit} GPU captures this billing period.`, code: 'QUOTA_EXCEEDED' },
        { status: 429 }
      )
    }

    if (!process.env.GPU_CAPTURE_URL) {
      return NextResponse.json(
        {
          error: 'Studio 3D GPU worker is not connected yet. Fast capture is still available.',
          code: 'WORKER_NOT_CONFIGURED',
        },
        { status: 503 }
      )
    }

    return NextResponse.json({
      ok: true,
      remaining: limit - used,
    })
  } catch (error) {
    console.error('GPU capture error:', error)
    return NextResponse.json({ error: 'GPU capture failed' }, { status: 500 })
  }
}

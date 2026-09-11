import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { PLANS, isStudioPlan, studioGpuQuota } from '@/lib/stripe'

export async function POST() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { plan: true, gpuCapturesUsed: true, gpuCapturesBonus: true },
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

    const quota = studioGpuQuota(
      user.gpuCapturesUsed ?? 0,
      user.gpuCapturesBonus ?? 0,
      PLANS.studio.limits.gpuCapturesPerMonth,
    )

    if (quota.remaining <= 0) {
      return NextResponse.json(
        {
          error: `You've used all ${quota.limit} GPU captures. Buy more at $1 each.`,
          code: 'QUOTA_EXCEEDED',
          used: quota.used,
          limit: quota.limit,
          remaining: 0,
        },
        { status: 429 }
      )
    }

    if (!process.env.GPU_CAPTURE_URL) {
      return NextResponse.json(
        {
          error: 'Studio 3D GPU worker is not connected yet. Fast capture is still available.',
          code: 'WORKER_NOT_CONFIGURED',
          remaining: quota.remaining,
        },
        { status: 503 }
      )
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { gpuCapturesUsed: { increment: 1 } },
      select: { gpuCapturesUsed: true, gpuCapturesBonus: true },
    })
    const next = studioGpuQuota(
      updated.gpuCapturesUsed,
      updated.gpuCapturesBonus,
      PLANS.studio.limits.gpuCapturesPerMonth,
    )

    return NextResponse.json({
      ok: true,
      remaining: next.remaining,
      used: next.used,
      limit: next.limit,
    })
  } catch (error) {
    console.error('GPU capture error:', error)
    return NextResponse.json({ error: 'GPU capture failed' }, { status: 500 })
  }
}

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { PLANS } from '@/lib/stripe'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        plan: true,
        stripeCurrentPeriodEnd: true,
        gpuCapturesUsed: true,
        _count: {
          select: { projects: true }
        }
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const plan = PLANS[user.plan as keyof typeof PLANS] || PLANS.free
    const projectCount = user._count.projects
    const projectLimit = plan.limits.projects
    const animationLimit = plan.limits.animationsPerProject
    const canCreateProject = projectCount < projectLimit
    const gpuCapturesUsed = user.gpuCapturesUsed ?? 0
    const gpuCapturesLimit = plan.limits.gpuCapturesPerMonth
    const gpuCapturesRemaining = Math.max(0, gpuCapturesLimit - gpuCapturesUsed)

    return NextResponse.json({
      plan: user.plan,
      planDetails: plan,
      currentPeriodEnd: user.stripeCurrentPeriodEnd,
      usage: {
        projects: projectCount,
        projectLimit: projectLimit === Infinity ? 'unlimited' : projectLimit,
        canCreateProject,
        gpuCapturesUsed,
        gpuCapturesLimit,
        gpuCapturesRemaining,
      },
      limits: {
        animationsPerProject: animationLimit === Infinity ? 'unlimited' : animationLimit,
        videoAnalysis: plan.limits.videoAnalysis,
        gpuCapture: plan.limits.gpuCapture,
        gpuCapturesPerMonth: gpuCapturesLimit,
      },
    })
  } catch (error) {
    console.error('Subscription fetch error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch subscription' },
      { status: 500 }
    )
  }
}

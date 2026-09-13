import prisma from '@/lib/prisma'
import { PLANS, isStudioPlan, studioGpuQuota } from '@/lib/stripe'

export const GPU_JOB_TIMEOUT_MS = 40 * 60 * 1000
export const GPU_MAX_UPLOAD_BYTES = 80 * 1024 * 1024
export const GPU_MAX_DURATION_SEC = 90

export async function loadStudioQuota(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, gpuCapturesUsed: true, gpuCapturesBonus: true },
  })
  if (!user) return null
  const quota = studioGpuQuota(
    user.gpuCapturesUsed ?? 0,
    user.gpuCapturesBonus ?? 0,
    PLANS.studio.limits.gpuCapturesPerMonth,
  )
  return { user, quota, isStudio: isStudioPlan(user.plan) }
}

export async function chargeGpuQuota(userId: string, jobId: string) {
  const loaded = await loadStudioQuota(userId)
  if (!loaded?.isStudio) throw new Error('STUDIO_REQUIRED')
  if (loaded.quota.remaining <= 0) throw new Error('QUOTA_EXCEEDED')

  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { gpuCapturesUsed: { increment: 1 } },
    }),
    prisma.gpuJob.update({
      where: { id: jobId },
      data: { quotaCharged: true },
    }),
  ])
}

export async function refundGpuQuota(jobId: string) {
  const job = await prisma.gpuJob.findUnique({ where: { id: jobId } })
  if (!job?.quotaCharged) return
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: job.userId }, select: { gpuCapturesUsed: true } })
    await tx.user.update({
      where: { id: job.userId },
      data: { gpuCapturesUsed: Math.max(0, (user?.gpuCapturesUsed ?? 1) - 1) },
    })
    await tx.gpuJob.update({
      where: { id: jobId },
      data: { quotaCharged: false },
    })
  })
}

export async function failTimedOutJobs() {
  const cutoff = new Date(Date.now() - GPU_JOB_TIMEOUT_MS)
  const stale = await prisma.gpuJob.findMany({
    where: {
      status: { in: ['queued', 'waking', 'running'] },
      updatedAt: { lt: cutoff },
    },
    take: 20,
  })
  for (const job of stale) {
    await prisma.gpuJob.update({
      where: { id: job.id },
      data: {
        status: 'failed',
        error: 'GPU capture timed out. The instance was stopped to protect AWS credits.',
        completedAt: new Date(),
      },
    })
    await refundGpuQuota(job.id)
  }
}

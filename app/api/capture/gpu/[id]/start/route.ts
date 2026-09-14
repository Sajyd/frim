import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { chargeGpuQuota, refundGpuQuota } from '@/lib/gpu-jobs'
import {
  enqueueGpuJob,
  ensureGpuCapacity,
  GPU_POOL_FULL_MESSAGE,
  isGpuAwsConfigured,
  putGpuMetric,
} from '@/lib/aws-gpu'

function capacityLabel(cap: { launchedId: string | null; reused: boolean }) {
  if (cap.launchedId) return 'Starting a Spot GPU for this capture…'
  if (cap.reused) return 'Warm GPU is picking up your capture…'
  return 'Starting GPU…'
}

async function failPoolFull(jobId: string) {
  await prisma.gpuJob.update({
    where: { id: jobId },
    data: { status: 'failed', error: GPU_POOL_FULL_MESSAGE, completedAt: new Date() },
  })
  await refundGpuQuota(jobId)
  return NextResponse.json(
    { error: GPU_POOL_FULL_MESSAGE, code: 'GPU_POOL_FULL' },
    { status: 503 },
  )
}

export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!isGpuAwsConfigured()) {
      return NextResponse.json({ error: 'GPU worker is not configured', code: 'WORKER_NOT_CONFIGURED' }, { status: 503 })
    }

    const job = await prisma.gpuJob.findUnique({ where: { id: params.id } })
    if (!job || job.userId !== session.user.id) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    if (['complete', 'running', 'queued', 'waking'].includes(job.status)) {
      return NextResponse.json({ ok: true, jobId: job.id, status: job.status, progress: job.progress })
    }
    if (job.status === 'failed') {
      return NextResponse.json({ error: job.error || 'Job already failed' }, { status: 409 })
    }

    if (!job.quotaCharged) {
      try {
        await chargeGpuQuota(session.user.id, job.id)
      } catch (err: any) {
        if (String(err?.message) === 'QUOTA_EXCEEDED') {
          return NextResponse.json({ error: 'GPU capture quota reached', code: 'QUOTA_EXCEEDED' }, { status: 429 })
        }
        if (String(err?.message) === 'STUDIO_REQUIRED') {
          return NextResponse.json({ error: 'Studio plan required', code: 'STUDIO_REQUIRED' }, { status: 403 })
        }
        throw err
      }
    }

    let cap = {
      launchedId: null as string | null,
      reused: false,
      atCap: false,
      running: 0,
      waiting: 1,
    }
    try {
      cap = await ensureGpuCapacity({ queuedJustNow: true })
      await putGpuMetric('GpuInstancesRunning', cap.running)
    } catch (err) {
      console.error('ensure GPU capacity failed:', err)
      return failPoolFull(job.id)
    }

    await enqueueGpuJob({
      jobId: job.id,
      inputKey: job.s3InputKey,
      resultKey: job.s3ResultKey || `results/${job.id}.json`,
    })

    const claimed = await prisma.gpuJob.findUnique({ where: { id: job.id } })
    if (claimed && ['running', 'complete', 'failed'].includes(claimed.status)) {
      return NextResponse.json({
        ok: true,
        jobId: job.id,
        status: claimed.status,
        instanceId: claimed.instanceId,
        progress: claimed.progress,
        label: claimed.status === 'running' ? 'Warm GPU is picking up your capture…' : claimed.status,
      })
    }

    const status = cap.launchedId ? 'waking' : 'queued'
    await prisma.gpuJob.updateMany({
      where: { id: job.id, status: { notIn: ['running', 'complete', 'failed'] } },
      data: {
        status,
        progress: 5,
        instanceId: cap.launchedId || undefined,
        error: null,
      },
    })
    await putGpuMetric('JobsQueued', 1)

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      status,
      instanceId: cap.launchedId,
      progress: 5,
      running: cap.running,
      label: capacityLabel(cap),
    })
  } catch (error) {
    console.error('GPU start error:', error)
    return NextResponse.json({ error: 'Failed to start GPU capture' }, { status: 500 })
  }
}

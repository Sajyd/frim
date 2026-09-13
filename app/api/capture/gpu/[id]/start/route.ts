import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { chargeGpuQuota } from '@/lib/gpu-jobs'
import { enqueueGpuJob, ensureGpuCapacity, gpuMaxInstances, isGpuAwsConfigured, putGpuMetric } from '@/lib/aws-gpu'

function capacityLabel(cap: { launchedId: string | null; reused: boolean; atCap: boolean; waiting: number }) {
  if (cap.atCap) {
    return `All ${gpuMaxInstances()} GPUs are busy — you are in the queue (one GPU per capture)`
  }
  if (cap.launchedId) return 'Starting a Spot GPU for this capture…'
  if (cap.reused) return 'Warm GPU is picking up your capture…'
  return 'Queued — waiting for a GPU…'
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
      const message = err instanceof Error ? err.message : 'Could not start a GPU'
      await prisma.gpuJob.update({
        where: { id: job.id },
        data: { status: 'failed', error: message, completedAt: new Date() },
      })
      return NextResponse.json({ error: message, code: 'GPU_LAUNCH_FAILED' }, { status: 503 })
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
      atCap: cap.atCap,
      running: cap.running,
      label: capacityLabel(cap),
    })
  } catch (error) {
    console.error('GPU start error:', error)
    return NextResponse.json({ error: 'Failed to start GPU capture' }, { status: 500 })
  }
}

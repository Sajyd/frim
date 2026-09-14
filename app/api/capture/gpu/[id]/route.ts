import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { failTimedOutJobs, refundGpuQuota } from '@/lib/gpu-jobs'
import {
  getGpuResultJson,
  gpuResultExists,
  isGpuAwsConfigured,
  describeGpuInstance,
  isGpuInstanceLive,
  wakingLabel,
  wakingProgress,
  GPU_POOL_FULL_MESSAGE,
} from '@/lib/aws-gpu'

const LABELS: Record<string, string> = {
  uploading: 'Waiting for upload…',
  queued: 'Queued — waiting for a free GPU…',
  waking: 'Starting a Spot GPU for this capture…',
  running: 'Reconstructing 3D pose on GPU…',
  complete: 'Building animation on your model…',
  failed: 'GPU capture failed',
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await failTimedOutJobs()

    let job = await prisma.gpuJob.findUnique({ where: { id: params.id } })
    if (!job || job.userId !== session.user.id) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    let instanceState: string | null = null
    if (['queued', 'waking'].includes(job.status) && isGpuAwsConfigured() && job.instanceId) {
      const inst = await describeGpuInstance(job.instanceId)
      instanceState = inst?.state || null
      const live = isGpuInstanceLive(instanceState)
      const ageMs = Date.now() - job.updatedAt.getTime()
      if (!live && ageMs > 25_000) {
        await prisma.gpuJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            error: GPU_POOL_FULL_MESSAGE,
            completedAt: new Date(),
          },
        })
        await refundGpuQuota(job.id)
        job = (await prisma.gpuJob.findUnique({ where: { id: job.id } })) || job
      }
    }

    if (job.status !== 'complete' && job.s3ResultKey && isGpuAwsConfigured()) {
      const exists = await gpuResultExists(job.s3ResultKey)
      if (exists) {
        job = await prisma.gpuJob.update({
          where: { id: job.id },
          data: { status: 'complete', progress: 100, completedAt: job.completedAt ?? new Date() },
        })
      }
    }

    let result = null
    if (job.status === 'complete' && job.s3ResultKey) {
      try {
        result = await getGpuResultJson(job.s3ResultKey)
      } catch (err) {
        console.error('read GPU result failed:', err)
      }
    }

    const waking = job.status === 'waking' || (job.status === 'queued' && Boolean(job.instanceId))
    const progress = waking ? Math.max(job.progress, wakingProgress(job.updatedAt)) : job.progress
    const label = waking
      ? wakingLabel(instanceState)
      : (LABELS[job.status] || job.status)

    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      progress,
      error: job.error,
      instanceId: job.instanceId,
      billedUsd: job.billedUsd,
      durationMs: job.durationMs,
      label,
      result,
    })
  } catch (error) {
    console.error('GPU job poll error:', error)
    return NextResponse.json({ error: 'Failed to load job' }, { status: 500 })
  }
}

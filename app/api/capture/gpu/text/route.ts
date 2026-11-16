import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { chargeGpuQuota, loadStudioQuota, refundGpuQuota } from '@/lib/gpu-jobs'
import { motionFrameCount } from '@/lib/text-to-motion'
import {
  enqueueGpuJob,
  ensureGpuCapacity,
  GPU_POOL_FULL_MESSAGE,
  isGpuAwsConfigured,
  putGpuJson,
  putGpuMetric,
} from '@/lib/aws-gpu'

function capacityLabel(cap: { launchedId: string | null; reused: boolean }) {
  if (cap.launchedId) return 'Starting a Spot GPU for MotionLCM…'
  if (cap.reused) return 'Warm GPU is generating your motion…'
  return 'Starting GPU…'
}

export async function POST(request: NextRequest) {
  let jobId: string | null = null
  let charged = false
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const loaded = await loadStudioQuota(session.user.id)
    if (!loaded) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (!loaded.isStudio) {
      return NextResponse.json(
        { error: 'Text to motion runs on the Studio GPU', code: 'STUDIO_REQUIRED' },
        { status: 403 },
      )
    }
    if (loaded.quota.remaining <= 0) {
      return NextResponse.json(
        {
          error: `You've used all ${loaded.quota.limit} GPU jobs. Buy more at $1 each.`,
          code: 'QUOTA_EXCEEDED',
          used: loaded.quota.used,
          limit: loaded.quota.limit,
          remaining: 0,
        },
        { status: 429 },
      )
    }
    if (!isGpuAwsConfigured()) {
      return NextResponse.json(
        { error: 'GPU worker is not configured', code: 'WORKER_NOT_CONFIGURED' },
        { status: 503 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const prompt = String(body.prompt || '').replace(/\s+/g, ' ').trim()
    if (prompt.length < 2 || prompt.length > 400) {
      return NextResponse.json({ error: 'Describe a motion in a sentence or two.' }, { status: 400 })
    }
    const frames = motionFrameCount(prompt)
    const seed = Math.floor(Math.random() * 2_147_483_647)

    const job = await prisma.gpuJob.create({
      data: {
        userId: session.user.id,
        status: 'uploading',
        progress: 0,
        s3InputKey: 'pending',
      },
    })
    jobId = job.id
    const inputKey = `prompts/${session.user.id}/${job.id}.json`
    const resultKey = `results/${job.id}.json`
    await putGpuJson(inputKey, { kind: 't2m', prompt, frames, seed, model: 'MotionLCM' })
    await prisma.gpuJob.update({
      where: { id: job.id },
      data: {
        s3InputKey: inputKey,
        s3ResultKey: resultKey,
        kind: 't2m',
        model: 'MotionLCM',
        prompt: prompt.slice(0, 400),
      },
    })

    try {
      await chargeGpuQuota(session.user.id, job.id)
      charged = true
    } catch (err: any) {
      const code = String(err?.message)
      await prisma.gpuJob.update({
        where: { id: job.id },
        data: { status: 'failed', error: code || 'Could not charge GPU quota', completedAt: new Date() },
      })
      if (code === 'QUOTA_EXCEEDED') {
        return NextResponse.json({ error: 'GPU capture quota reached', code: 'QUOTA_EXCEEDED' }, { status: 429 })
      }
      if (code === 'STUDIO_REQUIRED') {
        return NextResponse.json({ error: 'Studio plan required', code: 'STUDIO_REQUIRED' }, { status: 403 })
      }
      throw err
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
      await prisma.gpuJob.update({
        where: { id: job.id },
        data: { status: 'failed', error: GPU_POOL_FULL_MESSAGE, completedAt: new Date() },
      })
      await refundGpuQuota(job.id)
      charged = false
      return NextResponse.json(
        { error: GPU_POOL_FULL_MESSAGE, code: 'GPU_POOL_FULL' },
        { status: 503 },
      )
    }

    await enqueueGpuJob({
      jobId: job.id,
      kind: 't2m',
      prompt,
      frames,
      seed,
      inputKey,
      resultKey,
    })

    const status = cap.launchedId ? 'waking' : 'queued'
    await prisma.gpuJob.updateMany({
      where: { id: job.id, status: { notIn: ['running', 'complete', 'failed', 'cancelled'] } },
      data: {
        status,
        progress: 5,
        instanceId: cap.launchedId || undefined,
        error: null,
      },
    })
    await putGpuMetric('JobsQueued', 1)
    await putGpuMetric('TextJobsCreated', 1)

    return NextResponse.json({
      ok: true,
      jobId: job.id,
      status,
      frames,
      instanceId: cap.launchedId,
      progress: 5,
      label: capacityLabel(cap),
      remaining: Math.max(0, loaded.quota.remaining - 1),
    })
  } catch (error) {
    console.error('text-to-motion GPU error:', error)
    if (jobId) {
      await prisma.gpuJob.update({
        where: { id: jobId },
        data: { status: 'failed', error: 'Failed to start text to motion', completedAt: new Date() },
      }).catch(() => undefined)
      if (charged) await refundGpuQuota(jobId).catch(() => undefined)
    }
    return NextResponse.json({ error: 'Failed to start text to motion' }, { status: 500 })
  }
}

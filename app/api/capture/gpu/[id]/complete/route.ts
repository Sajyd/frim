import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { refundGpuQuota } from '@/lib/gpu-jobs'
import { getGpuResultMeta, isGpuAwsConfigured, putGpuMetric } from '@/lib/aws-gpu'
import { gpuModelName } from '@/lib/gpu-model'
import { sendGpuAlert } from '@/lib/email'
import { getGpuWorkerSecret } from '@/lib/gpu-secret'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  try {
    const secret = await getGpuWorkerSecret()
    if (!secret) {
      return NextResponse.json({ error: 'Worker secret not configured' }, { status: 503 })
    }

    const body = await request.json().catch(() => ({}))
    const headerSecret = request.headers.get('x-gpu-worker-secret') || ''
    if (headerSecret !== secret && body.secret !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const job = await prisma.gpuJob.findUnique({ where: { id: params.id } })
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    if (job.status === 'cancelled') {
      return NextResponse.json({ ok: true, ignored: true })
    }

    const status = String(body.status || 'running')
    const progress = Math.max(0, Math.min(100, Math.round(Number(body.progress) || job.progress)))
    const instanceId = body.instanceId ? String(body.instanceId) : job.instanceId

    if (status === 'failed') {
      await prisma.gpuJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: String(body.error || 'Worker failed').slice(0, 1000),
          progress,
          instanceId,
          completedAt: new Date(),
        },
      })
      await refundGpuQuota(job.id)
      if (body.notify !== false) {
        await putGpuMetric('JobsFailed', 1)
        await sendGpuAlert(
          'Frim GPU capture failed',
          `Job ${job.id} failed.\n${String(body.error || 'Worker failed').slice(0, 1000)}\nInstance: ${instanceId || 'unknown'}`,
        )
      }
      return NextResponse.json({ ok: true })
    }

    if (status === 'complete') {
      const resultKey = body.resultKey ? String(body.resultKey) : job.s3ResultKey
      let meta: { model?: string; lift?: string; device?: string } | null = null
      if (!body.model && resultKey && isGpuAwsConfigured()) {
        try {
          meta = await getGpuResultMeta(resultKey)
        } catch (err) {
          console.error('GPU result meta failed:', err)
        }
      }
      const model = gpuModelName({
        model: body.model || meta?.model,
        lift: body.lift || meta?.lift,
        kind: job.kind,
        s3InputKey: job.s3InputKey,
      })
      const device = body.device || meta?.device
      await prisma.gpuJob.update({
        where: { id: job.id },
        data: {
          status: 'complete',
          progress: 100,
          instanceId,
          s3ResultKey: resultKey,
          durationMs: body.durationMs != null ? Math.round(Number(body.durationMs)) : job.durationMs,
          billedUsd: body.billedUsd != null ? Number(body.billedUsd) : job.billedUsd,
          model: model || job.model,
          device: device ? String(device).slice(0, 40) : job.device,
          completedAt: new Date(),
          error: null,
        },
      })
      await putGpuMetric('JobsCompleted', 1)
      if (body.durationMs) {
        await putGpuMetric('JobDurationSeconds', Number(body.durationMs) / 1000, 'Seconds')
      }
      return NextResponse.json({ ok: true })
    }

    await prisma.gpuJob.update({
      where: { id: job.id },
      data: {
        status: status === 'running' ? 'running' : job.status,
        progress,
        instanceId,
      },
    })
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('GPU complete error:', error)
    return NextResponse.json({ error: 'Callback failed' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { isGpuAwsConfigured, presignGpuUpload, putGpuMetric } from '@/lib/aws-gpu'
import { GPU_MAX_UPLOAD_BYTES, loadStudioQuota } from '@/lib/gpu-jobs'

const ALLOWED_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
])

export async function POST(request: NextRequest) {
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
        { error: 'Studio 3D capture requires the Studio plan', code: 'STUDIO_REQUIRED' },
        { status: 403 },
      )
    }
    if (loaded.quota.remaining <= 0) {
      return NextResponse.json(
        {
          error: `You've used all ${loaded.quota.limit} GPU captures. Buy more at $1 each.`,
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
        {
          error: 'Studio 3D GPU worker is not connected yet. Fast capture is still available.',
          code: 'WORKER_NOT_CONFIGURED',
          remaining: loaded.quota.remaining,
        },
        { status: 503 },
      )
    }

    const body = await request.json().catch(() => ({}))
    const size = Number(body.size || 0)
    if (size > GPU_MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: 'Video is too large for GPU capture (max 80 MB). Trim the clip or use Fast capture.' },
        { status: 413 },
      )
    }
    const contentType = String(body.contentType || 'video/mp4').split(';')[0].trim()
    if (contentType && !ALLOWED_TYPES.has(contentType) && !contentType.startsWith('video/')) {
      return NextResponse.json({ error: 'Unsupported video type' }, { status: 400 })
    }

    const ext = String(body.filename || 'capture.mp4').split('.').pop()?.toLowerCase() || 'mp4'
    const safeExt = ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(ext) ? ext : 'mp4'

    const job = await prisma.gpuJob.create({
      data: {
        userId: session.user.id,
        status: 'uploading',
        progress: 0,
        s3InputKey: 'pending',
      },
    })

    const inputKey = `uploads/${session.user.id}/${job.id}.${safeExt}`
    await prisma.gpuJob.update({
      where: { id: job.id },
      data: { s3InputKey: inputKey, s3ResultKey: `results/${job.id}.json` },
    })

    const uploadUrl = await presignGpuUpload(inputKey, contentType || 'video/mp4')
    await putGpuMetric('JobsCreated', 1)

    return NextResponse.json({
      jobId: job.id,
      uploadUrl,
      remaining: loaded.quota.remaining,
      used: loaded.quota.used,
      limit: loaded.quota.limit,
    })
  } catch (error) {
    console.error('GPU capture create error:', error)
    return NextResponse.json({ error: 'GPU capture failed' }, { status: 500 })
  }
}

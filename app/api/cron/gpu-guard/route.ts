import { NextRequest, NextResponse } from 'next/server'
import { runGpuGuard } from '@/lib/gpu-guard'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization') || ''
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!process.env.GPU_S3_BUCKET) {
    return NextResponse.json({ skipped: true })
  }
  try {
    const result = await runGpuGuard()
    return NextResponse.json(result)
  } catch (error) {
    console.error('gpu-guard cron failed:', error)
    return NextResponse.json({ error: 'gpu-guard failed' }, { status: 500 })
  }
}

import { NextRequest, NextResponse } from 'next/server'
import { sendGpuAlert } from '@/lib/email'
import { getGpuWorkerSecret } from '@/lib/gpu-secret'

export async function POST(request: NextRequest) {
  const secret = await getGpuWorkerSecret()
  if (!secret) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 })
  }
  const body = await request.json().catch(() => ({}))
  const headerSecret = request.headers.get('x-gpu-worker-secret') || ''
  if (headerSecret !== secret && body.secret !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const type = String(body.type || 'alert')
  const reason = String(body.reason || 'GPU event')
  const ids = Array.isArray(body.instanceIds) ? body.instanceIds.map(String) : []
  const subject = type === 'gpu_terminated'
    ? `Frim GPU terminated (${ids.length || 1})`
    : `Frim GPU: ${type}`

  await sendGpuAlert(subject, [reason, ids.length ? `Instances: ${ids.join(', ')}` : ''].filter(Boolean).join('\n'))
  return NextResponse.json({ ok: true })
}

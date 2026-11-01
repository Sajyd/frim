import prisma from '@/lib/prisma'
import { getGpuResultMeta, isGpuAwsConfigured } from '@/lib/aws-gpu'

const NAMED: Record<string, string> = {
  rtmw3d: 'RTMW3D-x',
  'rtmw3d-x': 'RTMW3D-x',
  motionbert: 'MotionBERT',
  motiongpt: 'MotionGPT',
  'rtmw + motionbert': 'RTMW + MotionBERT',
  'rtmpose + motionbert': 'RTMPose + MotionBERT',
}

export function gpuModelName(input: {
  model?: unknown
  lift?: unknown
  kind?: string | null
  s3InputKey?: string | null
}): string | null {
  const rawModel = typeof input.model === 'string' ? input.model.trim() : ''
  const rawLift = typeof input.lift === 'string' ? input.lift.trim() : ''
  const known = NAMED[rawModel.toLowerCase()] || NAMED[rawLift.toLowerCase()]
  if (known) return known
  if (rawModel) return rawModel.slice(0, 80)
  if (input.kind === 't2m' || input.s3InputKey?.startsWith('prompts/')) return 'MotionGPT'
  return null
}

type ModelJob = {
  id: string
  model: string | null
  device: string | null
  kind: string | null
  s3InputKey: string
}

export async function rememberGpuModel<T extends ModelJob>(
  job: T,
  source: { model?: unknown; lift?: unknown; device?: unknown },
): Promise<T> {
  const model = gpuModelName({
    model: source.model,
    lift: source.lift,
    kind: job.kind,
    s3InputKey: job.s3InputKey,
  })
  const device = typeof source.device === 'string' && source.device.trim()
    ? source.device.trim().slice(0, 40)
    : null
  const nextModel = model || job.model
  const nextDevice = device || job.device
  if (nextModel === job.model && nextDevice === job.device) return job
  const updated = await prisma.gpuJob.update({
    where: { id: job.id },
    data: {
      model: nextModel,
      device: nextDevice,
      kind: job.kind || (job.s3InputKey.startsWith('prompts/') ? 't2m' : 'video'),
    },
  })
  return updated as unknown as T
}

/** Fill completed jobs whose result is in S3 but whose model was never stored. */
export async function backfillGpuModels() {
  if (!isGpuAwsConfigured()) return
  const missing = await prisma.gpuJob.findMany({
    where: {
      status: 'complete',
      s3ResultKey: { not: null },
      OR: [{ model: null }, { model: '' }],
    },
    orderBy: { createdAt: 'desc' },
    take: 40,
    select: { id: true, s3ResultKey: true, s3InputKey: true, kind: true, model: true, device: true },
  })
  await Promise.all(missing.map(async (job) => {
    if (!job.s3ResultKey) return
    try {
      const meta = await getGpuResultMeta(job.s3ResultKey)
      const model = gpuModelName({
        model: meta.model,
        lift: meta.lift,
        kind: job.kind,
        s3InputKey: job.s3InputKey,
      })
      await prisma.gpuJob.update({
        where: { id: job.id },
        data: {
          model: model || 'Not recorded',
          device: meta.device ? meta.device.slice(0, 40) : job.device,
          kind: job.kind || (job.s3InputKey.startsWith('prompts/') ? 't2m' : 'video'),
        },
      })
    } catch (error) {
      console.error('record GPU model failed:', job.id, error)
    }
  }))
}

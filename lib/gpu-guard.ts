import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3'
import { awsClientConfig } from '@/lib/aws-config'
import {
  countLiveGpuInstances,
  gpuQueueDepth,
  putGpuMetric,
  terminateGpuInstances,
} from '@/lib/aws-gpu'
import { sendGpuAlert } from '@/lib/email'

const ALERT_KEY = 'ops/alert-state.json'
const SPEND_KEY = 'ops/eu-north-1-spend.json'
const IDLE_MAX_SEC = 300

type AlertState = {
  budgetPctNotified: number
  lastRunningEmailAt?: string
}

function s3() {
  return new S3Client(awsClientConfig())
}

async function loadState(): Promise<AlertState> {
  try {
    const res = await s3().send(new GetObjectCommand({
      Bucket: process.env.GPU_S3_BUCKET!,
      Key: ALERT_KEY,
    }))
    return JSON.parse(await res.Body!.transformToString()) as AlertState
  } catch {
    return { budgetPctNotified: 0 }
  }
}

async function saveState(state: AlertState) {
  await s3().send(new PutObjectCommand({
    Bucket: process.env.GPU_S3_BUCKET!,
    Key: ALERT_KEY,
    Body: JSON.stringify(state),
    ContentType: 'application/json',
  }))
}

export async function monthlyGpuSpend() {
  const limit = Number(process.env.AWS_BUDGET_LIMIT || 80)
  try {
    const res = await s3().send(new GetObjectCommand({
      Bucket: process.env.GPU_S3_BUCKET!,
      Key: SPEND_KEY,
    }))
    const body = JSON.parse(await res.Body!.transformToString()) as { month?: string; usd?: number }
    const month = new Date().toISOString().slice(0, 7)
    const actual = body.month === month ? Number(body.usd || 0) : 0
    return { actual, limit, pct: limit > 0 ? (actual / limit) * 100 : 0 }
  } catch {
    return { actual: 0, limit, pct: 0 }
  }
}

export async function runGpuGuard() {
  if (!process.env.GPU_S3_BUCKET) {
    return { skipped: true as const }
  }

  const [live, depth, spend, state] = await Promise.all([
    countLiveGpuInstances(),
    gpuQueueDepth(),
    monthlyGpuSpend().catch((err) => {
      console.error('budget read failed:', err)
      return { actual: 0, limit: Number(process.env.AWS_BUDGET_LIMIT || 80), pct: 0 }
    }),
    loadState(),
  ])

  await putGpuMetric('GpuInstancesRunning', live.length)
  const pending = depth.total
  const now = Date.now()
  const ids = live.map(i => i.InstanceId!).filter(Boolean)
  const actions: string[] = []

  if (spend.pct >= 100 && ids.length) {
    await terminateGpuInstances(ids)
    actions.push(`halted ${ids.length} GPU(s) at ${spend.pct.toFixed(0)}% of $${spend.limit}`)
    await sendGpuAlert(
      `Frim GPU HALT — $${spend.actual.toFixed(2)} / $${spend.limit}`,
      `Monthly GPU spend hit the $${spend.limit} cap.\nTerminated: ${ids.join(', ')}\nQueue depth: ${pending}`,
    )
    state.budgetPctNotified = 100
    await saveState(state)
    return { spend, running: 0, terminated: ids, actions }
  }

  const idleIds = live.filter(i => {
    const launch = i.LaunchTime ? new Date(i.LaunchTime).getTime() : now
    const ageSec = (now - launch) / 1000
    return pending === 0 && ageSec >= IDLE_MAX_SEC
  }).map(i => i.InstanceId!).filter(Boolean)

  if (idleIds.length) {
    await terminateGpuInstances(idleIds)
    actions.push(`terminated ${idleIds.length} idle GPU(s) after 300s`)
    await sendGpuAlert(
      `Frim GPU terminated (${idleIds.length} idle)`,
      `Idle > 300s with an empty queue. Terminated so disks are not billed.\n${idleIds.join(', ')}`,
    )
  }

  const thresholds = [25, 50, 80]
  const crossed = thresholds.filter(t => spend.pct >= t && state.budgetPctNotified < t).pop()
  if (crossed) {
    state.budgetPctNotified = crossed
    await sendGpuAlert(
      `Frim GPU spend ${crossed}% — $${spend.actual.toFixed(2)} / $${spend.limit}`,
      `Tagged GPU mocap spend is ${spend.pct.toFixed(1)}% of the $${spend.limit} monthly cap.\n${live.length} instance(s) running. Queue: ${pending}.\nAt 100% remaining GPUs are terminated.`,
    )
    actions.push(`budget email ${crossed}%`)
  }

  await saveState(state)
  return {
    spend,
    running: live.length - idleIds.length,
    terminated: idleIds,
    actions,
  }
}

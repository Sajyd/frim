import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { SQSClient, SendMessageCommand, GetQueueAttributesCommand } from '@aws-sdk/client-sqs'
import {
  EC2Client,
  DescribeInstancesCommand,
  RunInstancesCommand,
  TerminateInstancesCommand,
} from '@aws-sdk/client-ec2'
import {
  CloudWatchClient,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch'

import { awsClientConfig, isGpuAwsConfigured } from '@/lib/aws-config'

export { isGpuAwsConfigured }

const TAG_KEY = 'Application'
const TAG_VAL = 'frim-gpu-mocap'

export function gpuMaxInstances() {
  const n = Number(process.env.GPU_MAX_INSTANCES || 100)
  return Number.isFinite(n) ? Math.max(1, Math.min(100, Math.floor(n))) : 100
}

function s3() {
  return new S3Client(awsClientConfig())
}
function sqs() {
  return new SQSClient(awsClientConfig())
}
function ec2() {
  return new EC2Client(awsClientConfig())
}
function cw() {
  return new CloudWatchClient(awsClientConfig())
}

export async function presignGpuUpload(key: string, contentType: string) {
  const bucket = process.env.GPU_S3_BUCKET!
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType,
    }),
    { expiresIn: 60 * 10 },
  )
}

export async function presignGpuDownload(key: string) {
  const bucket = process.env.GPU_S3_BUCKET!
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 60 * 10 },
  )
}

export async function getGpuResultJson(key: string) {
  const res = await s3().send(new GetObjectCommand({
    Bucket: process.env.GPU_S3_BUCKET!,
    Key: key,
  }))
  const text = await res.Body!.transformToString()
  return JSON.parse(text)
}

export async function gpuResultExists(key: string) {
  try {
    await s3().send(new HeadObjectCommand({
      Bucket: process.env.GPU_S3_BUCKET!,
      Key: key,
    }))
    return true
  } catch {
    return false
  }
}

export async function enqueueGpuJob(payload: Record<string, unknown>) {
  await sqs().send(new SendMessageCommand({
    QueueUrl: process.env.GPU_SQS_QUEUE_URL!,
    MessageBody: JSON.stringify(payload),
  }))
}

export async function gpuQueueDepth() {
  const res = await sqs().send(new GetQueueAttributesCommand({
    QueueUrl: process.env.GPU_SQS_QUEUE_URL!,
    AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesNotVisible'],
  }))
  const visible = Number(res.Attributes?.ApproximateNumberOfMessages || 0)
  const inFlight = Number(res.Attributes?.ApproximateNumberOfMessagesNotVisible || 0)
  return { visible, inFlight, total: visible + inFlight }
}

export async function countLiveGpuInstances() {
  const listed = await ec2().send(new DescribeInstancesCommand({
    Filters: [
      { Name: `tag:${TAG_KEY}`, Values: [TAG_VAL] },
      { Name: 'instance-state-name', Values: ['pending', 'running'] },
    ],
  }))
  return (listed.Reservations || []).flatMap(r => r.Instances || [])
}

export type GpuInstanceView = {
  id: string
  state: string
  launchTime: Date | null
}

const DEAD_STATES = new Set(['terminated', 'stopped', 'stopping', 'shutting-down'])

export async function describeGpuInstance(instanceId: string): Promise<GpuInstanceView | null> {
  if (!instanceId) return null
  try {
    const listed = await ec2().send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }))
    const inst = listed.Reservations?.flatMap(r => r.Instances || [])[0]
    if (!inst?.InstanceId) return null
    return {
      id: inst.InstanceId,
      state: inst.State?.Name || 'unknown',
      launchTime: inst.LaunchTime ?? null,
    }
  } catch (err) {
    console.error('describe GPU instance failed:', err)
    return null
  }
}

export function isGpuInstanceLive(state?: string | null) {
  return Boolean(state) && !DEAD_STATES.has(state!)
}

export function wakingLabel(state?: string | null) {
  if (state === 'pending') return 'Waiting for a Spot GPU to come online…'
  if (state === 'running') return 'GPU is booting — installing the capture worker…'
  if (state && DEAD_STATES.has(state)) return 'GPU stopped — starting another…'
  return 'Starting a Spot GPU for this capture…'
}

/** Crawl 12% → ~30% while the instance is still booting so the UI does not look frozen. */
export function wakingProgress(updatedAt: Date) {
  const elapsed = Math.max(0, (Date.now() - updatedAt.getTime()) / 1000)
  return Math.min(30, 12 + Math.floor(elapsed / 15))
}

async function launchOneGpu(): Promise<string | null> {
  const templateId = process.env.GPU_EC2_LAUNCH_TEMPLATE_ID
  if (!templateId) {
    throw new Error('GPU_EC2_LAUNCH_TEMPLATE_ID is not set')
  }
  const base = {
    MinCount: 1,
    MaxCount: 1,
    LaunchTemplate: { LaunchTemplateId: templateId, Version: '$Latest' as const },
  }
  try {
    const spot = await ec2().send(new RunInstancesCommand({
      ...base,
      InstanceMarketOptions: {
        MarketType: 'spot',
        SpotOptions: {
          SpotInstanceType: 'one-time',
          InstanceInterruptionBehavior: 'terminate',
        },
      },
    }))
    const id = spot.Instances?.[0]?.InstanceId
    if (id) return id
  } catch (err: any) {
    const code = err?.name || err?.Code || err?.code
    const msg = String(err?.message || err)
    const spotBlocked =
      code === 'MaxSpotInstanceCountExceeded' ||
      code === 'InsufficientInstanceCapacity' ||
      /spot/i.test(msg)
    if (!spotBlocked) throw err
    console.warn('Spot GPU unavailable, falling back to on-demand:', msg)
  }
  const onDemand = await ec2().send(new RunInstancesCommand(base))
  const id = onDemand.Instances?.[0]?.InstanceId
  if (!id) throw new Error('RunInstances returned no instance')
  return id
}

export type GpuCapacity = {
  launchedId: string | null
  reused: boolean
  atCap: boolean
  running: number
  waiting: number
}

/**
 * One Spot GPU per in-flight capture, shared across users.
 * Reuses a warm instance if one is polling the queue; otherwise launches
 * another up to GPU_MAX_INSTANCES. Never keeps stopped disks.
 */
export async function ensureGpuCapacity(opts?: { queuedJustNow?: boolean }): Promise<GpuCapacity> {
  const max = gpuMaxInstances()
  const depth = await gpuQueueDepth()
  const live = await countLiveGpuInstances()
  const running = live.length
  const busy = Math.min(running, depth.inFlight)
  const idle = Math.max(0, running - busy)
  const waiting = Math.max(depth.visible, opts?.queuedJustNow ? 1 : 0)

  if (waiting <= idle) {
    return { launchedId: null, reused: running > 0, atCap: false, running, waiting }
  }
  if (running >= max) {
    return { launchedId: null, reused: false, atCap: true, running, waiting }
  }

  const launchedId = await launchOneGpu()
  return {
    launchedId,
    reused: false,
    atCap: false,
    running: running + (launchedId ? 1 : 0),
    waiting,
  }
}

export async function terminateGpuInstances(instanceIds: string[]) {
  const ids = instanceIds.filter(Boolean)
  if (!ids.length) return
  await ec2().send(new TerminateInstancesCommand({ InstanceIds: ids }))
}

export async function putGpuMetric(name: string, value: number, unit: 'Count' | 'Seconds' | 'None' = 'Count') {
  try {
    await cw().send(new PutMetricDataCommand({
      Namespace: 'Frim/GpuMocap',
      MetricData: [{
        MetricName: name,
        Value: value,
        Unit: unit,
        Timestamp: new Date(),
      }],
    }))
  } catch (err) {
    console.error('CloudWatch metric failed:', err)
  }
}

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
  DescribeAvailabilityZonesCommand,
  DescribeInstancesCommand,
  DescribeLaunchTemplateVersionsCommand,
  RunInstancesCommand,
  TerminateInstancesCommand,
  type RunInstancesCommandInput,
} from '@aws-sdk/client-ec2'
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm'
import {
  CloudWatchClient,
  PutMetricDataCommand,
} from '@aws-sdk/client-cloudwatch'

import { awsClientConfig, isGpuAwsConfigured } from '@/lib/aws-config'

export { isGpuAwsConfigured }

const TAG_KEY = 'Application'
const TAG_VAL = 'frim-gpu-mocap'
const DLAMI_PARAM = '/aws/service/deeplearning/ami/x86_64/base-oss-nvidia-driver-gpu-ubuntu-22.04/latest/ami-id'

/** 64 G/VT Spot vCPUs ÷ 4 vCPU g4dn.xlarge = 16 concurrent GPUs. */
export function gpuMaxInstances() {
  const n = Number(process.env.GPU_MAX_INSTANCES || 16)
  return Number.isFinite(n) ? Math.max(1, Math.min(16, Math.floor(n))) : 16
}

export function gpuInstanceTypes() {
  const raw = process.env.GPU_INSTANCE_TYPES || process.env.GPU_INSTANCE_TYPE || 'g4dn.xlarge'
  const types = raw.split(',').map(s => s.trim()).filter(Boolean)
  return types.length ? types : ['g4dn.xlarge']
}

export const GPU_POOL_FULL_MESSAGE = 'gpu pool is full retry later'

function homeRegion() {
  return process.env.AWS_REGION || 'eu-north-1'
}

function errorCode(err: unknown) {
  const e = err as { name?: string; Code?: string; code?: string; message?: string }
  return String(e?.name || e?.Code || e?.code || '')
}

function errorMessage(err: unknown) {
  const e = err as { message?: string }
  return String(e?.message || err)
}

function isGpuRetryable(err: unknown) {
  const code = errorCode(err)
  const msg = errorMessage(err)
  return (
    code === 'InsufficientInstanceCapacity' ||
    code === 'MaxSpotInstanceCountExceeded' ||
    code === 'SpotMaxPriceTooLow' ||
    code === 'Unsupported' ||
    code === 'VPCIdNotSpecified' ||
    code === 'InvalidParameterCombination' ||
    /insufficient .*capacity|max spot instance count exceeded|availability zone you requested|not available in the requested|no default VPC|default subnet/i.test(msg)
  )
}

function s3() {
  return new S3Client(awsClientConfig())
}
function sqs() {
  return new SQSClient(awsClientConfig())
}
function ec2For(region: string) {
  return new EC2Client({ ...awsClientConfig(), region })
}
function ec2() {
  return ec2For(homeRegion())
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

export async function putGpuCancelFlag(jobId: string) {
  await s3().send(new PutObjectCommand({
    Bucket: process.env.GPU_S3_BUCKET!,
    Key: `cancels/${jobId}`,
    Body: '1',
    ContentType: 'text/plain',
  }))
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
    if (inst?.InstanceId) {
      return {
        id: inst.InstanceId,
        state: inst.State?.Name || 'unknown',
        launchTime: inst.LaunchTime ?? null,
      }
    }
  } catch {
    return null
  }
  return null
}

export function isGpuInstanceLive(state?: string | null) {
  return Boolean(state) && !DEAD_STATES.has(state!)
}

export function wakingLabel(state?: string | null) {
  if (state === 'pending') return 'Waiting for a Spot GPU to come online…'
  if (state === 'running') return 'GPU is booting — installing the capture worker…'
  if (state && DEAD_STATES.has(state)) return 'GPU stopped'
  return 'Starting a Spot GPU for this capture…'
}

/** Crawl 12% → ~30% while the instance is still booting so the UI does not look frozen. */
export function wakingProgress(updatedAt: Date) {
  const elapsed = Math.max(0, (Date.now() - updatedAt.getTime()) / 1000)
  return Math.min(30, 12 + Math.floor(elapsed / 15))
}

async function orderedAzs(region: string) {
  const listed = await ec2For(region).send(new DescribeAvailabilityZonesCommand({
    Filters: [{ Name: 'state', Values: ['available'] }],
  }))
  const names = (listed.AvailabilityZones || []).map(z => z.ZoneName).filter((z): z is string => Boolean(z))
  const preferred = ['b', 'c', 'a', 'd', 'e', 'f'].map(letter => `${region}${letter}`)
  return [...preferred.filter(az => names.includes(az)), ...names.filter(az => !preferred.includes(az))]
}

async function gpuAmi(region: string) {
  const ssm = new SSMClient({ ...awsClientConfig(), region })
  const res = await ssm.send(new GetParameterCommand({ Name: DLAMI_PARAM }))
  return res.Parameter?.Value
}

type TemplateBits = {
  userData?: string
  instanceProfileArn?: string
}

async function homeTemplateBits(): Promise<TemplateBits> {
  const templateId = process.env.GPU_EC2_LAUNCH_TEMPLATE_ID
  if (!templateId) return {}
  const res = await ec2().send(new DescribeLaunchTemplateVersionsCommand({
    LaunchTemplateId: templateId,
    Versions: ['$Latest'],
  }))
  const data = res.LaunchTemplateVersions?.[0]?.LaunchTemplateData
  return {
    userData: data?.UserData,
    instanceProfileArn: data?.IamInstanceProfile?.Arn,
  }
}

async function runSpot(opts: {
  region: string
  instanceType: string
  az?: string
  templateId?: string
  bits: TemplateBits
}) {
  const params: RunInstancesCommandInput = {
    MinCount: 1,
    MaxCount: 1,
    InstanceType: opts.instanceType as RunInstancesCommandInput['InstanceType'],
    InstanceMarketOptions: {
      MarketType: 'spot',
      SpotOptions: {
        SpotInstanceType: 'one-time',
        InstanceInterruptionBehavior: 'terminate',
      },
    },
    TagSpecifications: [
      {
        ResourceType: 'instance',
        Tags: [
          { Key: TAG_KEY, Value: TAG_VAL },
          { Key: 'Name', Value: 'frim-gpu-mocap-worker' },
        ],
      },
      {
        ResourceType: 'volume',
        Tags: [{ Key: TAG_KEY, Value: TAG_VAL }],
      },
    ],
  }
  if (opts.az) {
    params.Placement = { AvailabilityZone: opts.az }
  }
  if (opts.templateId && opts.region === homeRegion()) {
    params.LaunchTemplate = { LaunchTemplateId: opts.templateId, Version: '$Latest' }
  } else {
    const imageId = await gpuAmi(opts.region)
    if (!imageId) throw new Error(`No GPU AMI in ${opts.region}`)
    params.ImageId = imageId
    if (opts.bits.userData) params.UserData = opts.bits.userData
    if (opts.bits.instanceProfileArn) {
      params.IamInstanceProfile = { Arn: opts.bits.instanceProfileArn }
    }
    params.InstanceInitiatedShutdownBehavior = 'terminate'
    params.BlockDeviceMappings = [{
      DeviceName: '/dev/sda1',
      Ebs: { VolumeSize: 100, VolumeType: 'gp3', DeleteOnTermination: true },
    }]
  }

  const launched = await ec2For(opts.region).send(new RunInstancesCommand(params))
  const id = launched.Instances?.[0]?.InstanceId
  if (!id) return null
  console.log(`launched GPU ${opts.instanceType} ${opts.region} az=${opts.az || 'aws-pick'} ${id}`)
  return id
}

async function launchOneGpu(): Promise<string> {
  const templateId = process.env.GPU_EC2_LAUNCH_TEMPLATE_ID
  const bits = await homeTemplateBits()
  const types = gpuInstanceTypes()
  const region = homeRegion()
  const azs = await orderedAzs(region).catch(() => [] as string[])
  const preferred = [`${region}b`, `${region}c`, `${region}a`]
  const attempts = preferred.filter(az => !azs.length || azs.includes(az))
  let lastErr: unknown

  for (const instanceType of types) {
    for (const az of attempts) {
      try {
        const id = await runSpot({
          region,
          instanceType,
          az,
          templateId,
          bits,
        })
        if (id) return id
      } catch (err) {
        lastErr = err
        if (!isGpuRetryable(err)) throw err
        console.warn(`GPU launch skipped ${instanceType} ${az}:`, err)
      }
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(GPU_POOL_FULL_MESSAGE)
}

export type GpuCapacity = {
  launchedId: string | null
  reused: boolean
  atCap: boolean
  running: number
  waiting: number
}

/**
 * Reuse a warm Stockholm GPU when one is idle. Otherwise launch one Spot T4
 * in eu-north-1b, then 1c, then 1a. Pool full / no capacity fails immediately
 * so we do not keep billed instances or retry loops.
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
    throw new Error(GPU_POOL_FULL_MESSAGE)
  }

  const launchedId = await launchOneGpu()
  return {
    launchedId,
    reused: false,
    atCap: false,
    running: running + 1,
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

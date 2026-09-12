import { GetSecretValueCommand, SecretsManagerClient } from '@aws-sdk/client-secrets-manager'
import { awsClientConfig } from '@/lib/aws-config'

let cached: string | null = null

export async function getGpuWorkerSecret() {
  if (cached) return cached
  const arn = process.env.GPU_WORKER_SECRET_ARN
  if (!arn) return null
  const client = new SecretsManagerClient(awsClientConfig())
  const res = await client.send(new GetSecretValueCommand({ SecretId: arn }))
  cached = res.SecretString || null
  return cached
}

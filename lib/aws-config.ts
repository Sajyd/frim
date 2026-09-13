import { awsCredentialsProvider } from '@vercel/oidc-aws-credentials-provider'
import '@/lib/app-url'

const region = process.env.AWS_REGION || 'eu-north-1'

/**
 * Short-lived credentials only. Never access keys in env or Vercel.
 * Vercel assumes AWS_ROLE_ARN via OIDC; local uses AWS_PROFILE / instance role.
 */
export function awsClientConfig() {
  const roleArn = process.env.AWS_ROLE_ARN
  if (roleArn && (process.env.VERCEL || process.env.VERCEL_OIDC_TOKEN)) {
    // Use Vercel's native token (aud https://vercel.com/<team>) unless overridden.
    // Custom sts.amazonaws.com audience fails unless that ClientId is on the IdP.
    const audience = process.env.AWS_OIDC_AUDIENCE
    return {
      region,
      credentials: awsCredentialsProvider({
        roleArn,
        ...(audience ? { audience } : {}),
      }),
    }
  }
  return { region }
}

export function isGpuAwsConfigured() {
  return Boolean(
    process.env.GPU_S3_BUCKET &&
    process.env.GPU_SQS_QUEUE_URL &&
    (process.env.AWS_ROLE_ARN || process.env.AWS_PROFILE || process.env.VERCEL)
  )
}

import prisma from '@/lib/prisma'

const DEFAULT_ADMINS = [
  'sajydmounib@gmail.com',
  'sajyd.mounib@epitech.eu',
  'mounib_s@epitech.eu',
]

export function adminEmails(): string[] {
  const raw = [process.env.ADMIN_EMAILS, process.env.GPU_ALERT_EMAIL, ...DEFAULT_ADMINS]
    .filter(Boolean)
    .join(',')
  const emails = raw
    .split(/[,;\s]+/)
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.includes('@'))
  return emails.length > 0 ? [...new Set(emails)] : DEFAULT_ADMINS
}

export function isAdminEmail(email?: string | null): boolean {
  if (!email) return false
  return adminEmails().includes(email.trim().toLowerCase())
}

export async function isAdminUserId(userId?: string | null): Promise<boolean> {
  if (!userId) return false
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })
  return isAdminEmail(user?.email)
}

/** Owner, or an admin opening someone else's project. */
export async function canAccessProject(
  sessionUserId: string,
  projectUserId: string,
): Promise<boolean> {
  if (sessionUserId === projectUserId) return true
  return isAdminUserId(sessionUserId)
}

const IN_FLIGHT = new Set(['uploading', 'queued', 'waking', 'running'])

export function jobKind(job: { kind?: string | null; s3InputKey?: string | null }): 'video' | 't2m' {
  if (job.s3InputKey?.startsWith('prompts/') || job.kind === 't2m') return 't2m'
  return 'video'
}

export function jobModelLabel(job: {
  kind?: string | null
  model?: string | null
  s3InputKey?: string | null
  status?: string | null
}): string {
  const model = job.model?.trim()
  if (model) return model
  if (jobKind(job) === 't2m') return 'MotionGPT'
  if (job.status && IN_FLIGHT.has(job.status)) return 'Pending'
  return 'Not recorded'
}

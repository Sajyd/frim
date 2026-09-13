const FALLBACK = 'https://frim.app'

function usableOrigin(raw?: string) {
  if (!raw) return null
  const url = raw.replace(/\/$/, '')
  try {
    if (new URL(url).hostname.endsWith('.vercel.app')) return null
    return url
  } catch {
    return null
  }
}

/** Public site origin. Never the unique *.vercel.app deployment host. */
export function publicAppUrl() {
  return (
    usableOrigin(process.env.NEXTAUTH_URL) ||
    usableOrigin(process.env.GPU_CALLBACK_URL) ||
    FALLBACK
  )
}

if (process.env.VERCEL) {
  const origin = publicAppUrl()
  process.env.NEXTAUTH_URL = origin
  if (!process.env.GPU_CALLBACK_URL) process.env.GPU_CALLBACK_URL = origin
}

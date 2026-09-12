import { Resend } from 'resend'

const ALERT_TO = process.env.GPU_ALERT_EMAIL || 'sajydmounib@gmail.com'
const FROM = process.env.RESEND_FROM || 'Frim GPU <alerts@frim.app>'

export async function sendGpuAlert(subject: string, text: string) {
  const key = process.env.RESEND_API_KEY
  if (!key) {
    console.warn('RESEND_API_KEY missing — GPU alert not sent:', subject)
    return { sent: false as const }
  }
  const resend = new Resend(key)
  const { error } = await resend.emails.send({
    from: FROM,
    to: ALERT_TO,
    subject,
    text,
  })
  if (error) {
    console.error('Resend alert failed:', error)
    return { sent: false as const }
  }
  return { sent: true as const }
}

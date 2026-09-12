import Link from 'next/link'
import { authErrorMessage } from '@/lib/auth-errors'

export default function AuthError({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const message = authErrorMessage(searchParams.error) || 'Sign-in failed. Please try again.'

  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center px-4 relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-frim-500/5 via-transparent to-transparent" />
        <div className="glow-effect w-[400px] h-[400px] bg-frim-500/30 top-0 left-1/2 -translate-x-1/2" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <Link href="/" className="flex items-center justify-center gap-3 mb-8">
          <svg className="w-12 h-12 text-frim-400" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2"/>
            <circle cx="16" cy="10" r="3" fill="currentColor"/>
            <line x1="16" y1="13" x2="16" y2="20" stroke="currentColor" strokeWidth="2"/>
            <line x1="16" y1="16" x2="10" y2="14" stroke="currentColor" strokeWidth="2"/>
            <line x1="16" y1="16" x2="22" y2="14" stroke="currentColor" strokeWidth="2"/>
            <line x1="16" y1="20" x2="12" y2="26" stroke="currentColor" strokeWidth="2"/>
            <line x1="16" y1="20" x2="20" y2="26" stroke="currentColor" strokeWidth="2"/>
          </svg>
        </Link>

        <div className="bg-dark-900 border border-dark-800 rounded-2xl p-8 text-center">
          <h1 className="font-display text-2xl font-semibold mb-3">Sign-in failed</h1>
          <p className="text-red-400 text-sm mb-8">{message}</p>
          <Link href="/auth/signin" className="btn-primary inline-flex items-center justify-center">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}

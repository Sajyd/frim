import Link from 'next/link'
import { authErrorMessage } from '@/lib/auth-errors'
import { AuthShell } from '@/components/chrome'

export default function AuthError({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  const message = authErrorMessage(searchParams.error) || 'Sign-in failed. Please try again.'

  return (
    <AuthShell title="Sign-in failed" subtitle="Nothing was changed on your account.">
      <p role="alert" className="text-red-300 text-sm text-center mb-6 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3">
        {message}
      </p>
      <Link href="/auth/signin" className="btn-primary w-full">
        Back to sign in
      </Link>
    </AuthShell>
  )
}

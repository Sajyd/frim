'use client'

import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { authErrorMessage } from '@/lib/auth-errors'
import { AuthShell, OAuthButtons, PasswordField } from '@/components/chrome'

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
  const error = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(authErrorMessage(error))

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setErrorMsg('')

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        setErrorMsg('Invalid email or password')
        setLoading(false)
      } else {
        router.push(callbackUrl)
      }
    } catch {
      setErrorMsg('Something went wrong')
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to open your projects">
      <OAuthButtons onSelect={(provider) => signIn(provider, { callbackUrl })} />

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-dark-700" />
        </div>
        <div className="relative flex justify-center">
          <span className="bg-dark-900 px-4 text-sm text-dark-500">or</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm text-dark-300 mb-2">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-dark-100 placeholder-dark-600 focus:border-frim-500 transition-colors"
            placeholder="you@email.com"
            required
          />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm text-dark-300 mb-2">Password</label>
          <PasswordField
            id="password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
          />
        </div>

        {errorMsg && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm text-center">
            {errorMsg}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary disabled:opacity-50"
        >
          {loading ? <span className="spinner" /> : null}
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="text-center text-dark-400 text-sm mt-6">
        Don&apos;t have an account?{' '}
        <Link href="/auth/register" className="text-frim-400 hover:text-frim-300 font-medium">
          Create one
        </Link>
      </p>
    </AuthShell>
  )
}

export default function SignIn() {
  return (
    <Suspense
      fallback={
        <AuthShell title="Welcome back" subtitle="Sign in to open your projects">
          <div className="flex justify-center py-10">
            <div className="spinner w-8 h-8" />
          </div>
        </AuthShell>
      }
    >
      <SignInForm />
    </Suspense>
  )
}

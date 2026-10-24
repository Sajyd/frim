'use client'

import { useState } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AuthShell, OAuthButtons, PasswordField } from '@/components/chrome'

export default function Register() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'Something went wrong')
        setLoading(false)
        return
      }

      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      })

      if (result?.error) {
        router.push('/auth/signin')
      } else {
        router.push('/dashboard')
      }
    } catch {
      setError('Something went wrong')
      setLoading(false)
    }
  }

  const passwordHint = password.length === 0
    ? 'At least 6 characters'
    : password.length >= 6
      ? 'Long enough to continue'
      : `${6 - password.length} more character${6 - password.length === 1 ? '' : 's'}`

  return (
    <AuthShell title="Create your account" subtitle="Free plan. No credit card.">
      <OAuthButtons onSelect={(provider) => signIn(provider, { callbackUrl: '/dashboard' })} />

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
          <label htmlFor="name" className="block text-sm text-dark-300 mb-2">Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 text-dark-100 placeholder-dark-600 focus:border-frim-500 transition-colors"
            placeholder="Your name"
          />
        </div>
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
            autoComplete="new-password"
            minLength={6}
          />
          <p className={`text-xs mt-1.5 ${password.length >= 6 ? 'text-frim-400' : 'text-dark-500'}`}>
            {passwordHint}
          </p>
        </div>

        {error && (
          <div role="alert" className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-300 text-sm text-center">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full btn-primary disabled:opacity-50"
        >
          {loading ? <span className="spinner" /> : null}
          {loading ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="text-center text-dark-400 text-sm mt-6">
        Already have an account?{' '}
        <Link href="/auth/signin" className="text-frim-400 hover:text-frim-300 font-medium">
          Sign in
        </Link>
      </p>
    </AuthShell>
  )
}

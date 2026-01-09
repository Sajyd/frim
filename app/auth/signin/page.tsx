'use client'

import { Suspense, useState } from 'react'
import { signIn } from 'next-auth/react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'

function SignInForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const callbackUrl = searchParams.get('callbackUrl') || '/dashboard'
  const error = searchParams.get('error')
  
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(error ? 'Invalid credentials' : '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
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

  const handleOAuthSignIn = (provider: string) => {
    signIn(provider, { callbackUrl })
  }

  return (
    <div className="w-full max-w-md relative z-10">
      {/* Logo */}
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

      <div className="bg-dark-900 border border-dark-800 rounded-2xl p-8">
        <h1 className="font-display text-2xl font-semibold text-center mb-2">Welcome back</h1>
        <p className="text-dark-500 text-center mb-8">Sign in to access your projects</p>

        {/* OAuth Buttons */}
        <div className="space-y-3 mb-6">
          <button
            onClick={() => handleOAuthSignIn('github')}
            className="w-full flex items-center justify-center gap-3 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg px-4 py-3 transition-colors"
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/>
            </svg>
            Continue with GitHub
          </button>
          <button
            onClick={() => handleOAuthSignIn('google')}
            className="w-full flex items-center justify-center gap-3 bg-dark-800 hover:bg-dark-700 border border-dark-700 rounded-lg px-4 py-3 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>
        </div>

        <div className="relative mb-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-dark-700" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-dark-900 px-4 text-sm text-dark-500">or</span>
          </div>
        </div>

        {/* Email/Password Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-dark-400 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-dark-950 border border-dark-700 rounded-lg px-4 py-3 text-dark-100 placeholder-dark-600 focus:border-frim-500 transition-colors"
              placeholder="your@email.com"
              required
            />
          </div>
          <div>
            <label className="block text-sm text-dark-400 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-dark-950 border border-dark-700 rounded-lg px-4 py-3 text-dark-100 placeholder-dark-600 focus:border-frim-500 transition-colors"
              placeholder="••••••••"
              required
            />
          </div>

          {errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm text-center">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full btn-primary flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <span className="spinner" /> : null}
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-dark-500 text-sm mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/auth/register" className="text-frim-400 hover:text-frim-300">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}

function SignInLoading() {
  return (
    <div className="w-full max-w-md relative z-10">
      <div className="flex items-center justify-center gap-3 mb-8">
        <svg className="w-12 h-12 text-frim-400" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2"/>
          <circle cx="16" cy="10" r="3" fill="currentColor"/>
          <line x1="16" y1="13" x2="16" y2="20" stroke="currentColor" strokeWidth="2"/>
          <line x1="16" y1="16" x2="10" y2="14" stroke="currentColor" strokeWidth="2"/>
          <line x1="16" y1="16" x2="22" y2="14" stroke="currentColor" strokeWidth="2"/>
          <line x1="16" y1="20" x2="12" y2="26" stroke="currentColor" strokeWidth="2"/>
          <line x1="16" y1="20" x2="20" y2="26" stroke="currentColor" strokeWidth="2"/>
        </svg>
      </div>
      <div className="bg-dark-900 border border-dark-800 rounded-2xl p-8 flex justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    </div>
  )
}

export default function SignIn() {
  return (
    <div className="min-h-screen bg-dark-950 flex items-center justify-center px-4 relative overflow-hidden">
      {/* Background effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-b from-frim-500/5 via-transparent to-transparent" />
        <div className="glow-effect w-[400px] h-[400px] bg-frim-500/30 top-0 left-1/2 -translate-x-1/2" />
      </div>

      <Suspense fallback={<SignInLoading />}>
        <SignInForm />
      </Suspense>
    </div>
  )
}

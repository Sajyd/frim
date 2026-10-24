'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Eye, EyeOff, Menu, X } from 'lucide-react'

export const DISCORD_URL = 'https://discord.gg/YKfmSqZ5e8'
export const SUPPORT_EMAIL = 'support@frim.app'

export function FrimLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2" />
      <circle cx="16" cy="10" r="3" fill="currentColor" />
      <line x1="16" y1="13" x2="16" y2="20" stroke="currentColor" strokeWidth="2" />
      <line x1="16" y1="16" x2="10" y2="14" stroke="currentColor" strokeWidth="2" />
      <line x1="16" y1="16" x2="22" y2="14" stroke="currentColor" strokeWidth="2" />
      <line x1="16" y1="20" x2="12" y2="26" stroke="currentColor" strokeWidth="2" />
      <line x1="16" y1="20" x2="20" y2="26" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

export function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  )
}

export function MarketingNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed top-0 inset-x-0 z-50">
      <nav className="border-b border-white/[0.06] bg-dark-950/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2.5 shrink-0" onClick={() => setOpen(false)}>
            <FrimLogo className="w-8 h-8 text-frim-400" />
            <span className="font-display text-xl font-semibold tracking-tight">frim</span>
          </Link>
          <div className="hidden md:flex items-center gap-1">{children}</div>
          <button
            type="button"
            className="md:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg text-dark-200 hover:bg-white/5"
            aria-expanded={open}
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
        {open && (
          <div className="md:hidden border-t border-white/[0.06] bg-dark-950/95 px-4 py-4">
            <div
              className="flex flex-col gap-2 [&_a]:flex [&_a]:w-full [&_a]:items-center [&_.btn-primary]:justify-center [&_.btn-secondary]:justify-center"
              onClick={() => setOpen(false)}
            >
              {children}
            </div>
          </div>
        )}
      </nav>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] py-10 px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3 text-dark-300">
          <FrimLogo className="w-7 h-7 text-frim-400" />
          <div>
            <p className="font-display font-semibold leading-none text-dark-100">frim</p>
            <p className="text-xs text-dark-500 mt-1">© {new Date().getFullYear()} Frim</p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Footer">
          <Link href="/pricing" className="text-sm text-dark-400 hover:text-dark-100 transition-colors">
            Pricing
          </Link>
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-dark-400 hover:text-[#5865F2] transition-colors inline-flex items-center gap-1.5"
          >
            <DiscordIcon className="w-4 h-4" />
            Discord
          </a>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-sm text-dark-400 hover:text-dark-100 transition-colors"
          >
            Support
          </a>
        </nav>
      </div>
    </footer>
  )
}

const AUTH_POINTS = [
  'Import GLB files and pose the skeleton',
  'Keyframe, play back, and export',
  'Cloud projects on every plan',
]

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-dark-950 lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,0.95fr)]">
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden border-r border-white/[0.06] p-12">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-0 bg-gradient-to-b from-frim-500/10 via-transparent to-transparent" />
          <div className="glow-effect w-[420px] h-[420px] bg-frim-500/40 -top-24 left-1/4" />
        </div>
        <Link href="/" className="relative flex items-center gap-3">
          <FrimLogo className="w-10 h-10 text-frim-400" />
          <span className="font-display text-2xl font-semibold tracking-tight">frim</span>
        </Link>
        <div className="relative max-w-md">
          <p className="font-display text-4xl font-semibold leading-tight text-balance">
            Animate in the browser.
          </p>
          <p className="mt-4 text-dark-300 leading-relaxed">
            Pose a rig, set keyframes, and export a GLB. No install, and your projects stay in the cloud.
          </p>
        </div>
        <ul className="relative space-y-3">
          {AUTH_POINTS.map((point) => (
            <li key={point} className="flex items-center gap-3 text-sm text-dark-300">
              <span className="w-5 h-5 rounded-full bg-frim-500/15 text-frim-400 inline-flex items-center justify-center shrink-0">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              {point}
            </li>
          ))}
        </ul>
      </aside>

      <div className="relative flex items-center justify-center px-4 py-10">
        <div className="absolute inset-0 pointer-events-none lg:hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-frim-500/10 via-transparent to-transparent" />
        </div>
        <div className="relative w-full max-w-md">
          <Link href="/" className="lg:hidden flex items-center justify-center gap-2.5 mb-8">
            <FrimLogo className="w-10 h-10 text-frim-400" />
            <span className="font-display text-2xl font-semibold">frim</span>
          </Link>
          <div className="modal-pop bg-dark-900/90 border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl shadow-black/40">
            <h1 className="font-display text-2xl font-semibold text-center mb-1.5">{title}</h1>
            <p className="text-dark-400 text-center text-sm mb-7">{subtitle}</p>
            {children}
          </div>
        </div>
      </div>
    </div>
  )
}

export function PasswordField({
  id,
  value,
  onChange,
  autoComplete,
  minLength,
  placeholder = '••••••••',
}: {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  minLength?: number
  placeholder?: string
}) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        minLength={minLength}
        required
        placeholder={placeholder}
        className="w-full bg-dark-950 border border-dark-700 rounded-xl px-4 py-3 pr-12 text-dark-100 placeholder-dark-600 focus:border-frim-500 transition-colors"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 inline-flex items-center justify-center rounded-lg text-dark-400 hover:text-dark-100 hover:bg-white/5"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  )
}

export function OAuthButtons({ onSelect }: { onSelect: (provider: 'github' | 'google') => void }) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => onSelect('github')}
        className="w-full flex items-center justify-center gap-3 bg-dark-800 hover:bg-dark-700 border border-dark-700 hover:border-dark-600 rounded-xl px-4 py-3 transition-colors"
      >
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.604-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.463-1.11-1.463-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.336 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
        </svg>
        Continue with GitHub
      </button>
      <button
        type="button"
        onClick={() => onSelect('google')}
        className="w-full flex items-center justify-center gap-3 bg-dark-800 hover:bg-dark-700 border border-dark-700 hover:border-dark-600 rounded-xl px-4 py-3 transition-colors"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
        </svg>
        Continue with Google
      </button>
    </div>
  )
}

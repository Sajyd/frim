'use client'

import { Suspense } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'

export default function PricingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    }>
      <PricingContent />
    </Suspense>
  )
}

function PricingContent() {
  const { data: session } = useSession()

  const features = [
    'Unlimited projects',
    'Unlimited animations per project',
    'GLB/GLTF import & export',
    'Advanced animation tools',
    'Bone hierarchy editing',
    'Keyframe animation',
    'Animation timeline',
    'JSON & GLB export',
    'Cloud saves',
    'AI Video Motion Capture (Coming Soon)',
  ]

  return (
    <div className="min-h-screen bg-dark-950 relative overflow-hidden">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-frim-500/5 via-transparent to-transparent" />
        <div className="glow-effect w-[600px] h-[600px] bg-frim-500 -top-48 left-1/4 opacity-30" />
        <div className="glow-effect w-[400px] h-[400px] bg-purple-500 bottom-1/4 right-1/4 opacity-20" style={{ animationDelay: '-7s' }} />
      </div>

      {/* Navigation */}
      <nav className="sticky top-0 z-50 glass border-b border-dark-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-3">
            <svg className="w-9 h-9 text-frim-400" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2"/>
              <circle cx="16" cy="10" r="3" fill="currentColor"/>
              <line x1="16" y1="13" x2="16" y2="20" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="16" x2="10" y2="14" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="16" x2="22" y2="14" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="20" x2="12" y2="26" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="20" x2="20" y2="26" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <span className="font-display text-2xl font-semibold">frim</span>
          </Link>
          <div className="flex items-center gap-4">
            {session ? (
              <Link href="/dashboard" className="btn-secondary text-sm py-2">
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/auth/signin" className="btn-secondary text-sm py-2">
                  Sign In
                </Link>
                <Link href="/auth/register" className="btn-primary text-sm py-2">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Header */}
      <section className="relative pt-20 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-frim-500/10 border border-frim-500/20 px-4 py-2 rounded-full text-sm text-frim-400 mb-6">
            <span className="w-2 h-2 bg-frim-400 rounded-full animate-pulse" />
            🎉 Everything is FREE!
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-6">
            <span className="gradient-text">100% Free</span> — No Limits
          </h1>
          <p className="text-lg text-dark-400 max-w-2xl mx-auto">
            We&apos;ve made all features completely free. Create unlimited projects, 
            unlimited animations, and access all tools — no credit card required.
          </p>
        </div>
      </section>

      {/* Single Free Plan Card */}
      <section className="relative pb-24 px-6">
        <div className="max-w-xl mx-auto">
          <div className="relative bg-dark-900 border border-frim-500 shadow-xl shadow-frim-500/10 rounded-2xl p-8">
            <div className="absolute -top-4 left-1/2 -translate-x-1/2">
              <span className="bg-gradient-to-r from-frim-500 to-frim-400 text-dark-950 px-4 py-1.5 rounded-full text-sm font-semibold">
                ✨ All Features Included
              </span>
            </div>

            <div className="text-center mb-8 pt-4">
              <h3 className="font-display text-3xl font-bold mb-2">Free Forever</h3>
              <p className="text-dark-500">No subscriptions, no limits, no catch.</p>
            </div>

            <div className="text-center mb-8">
              <span className="font-display text-6xl font-bold text-frim-400">$0</span>
              <span className="text-dark-500 ml-2">forever</span>
            </div>

            <Link
              href={session ? "/dashboard" : "/auth/register"}
              className="block w-full py-4 rounded-xl font-semibold mb-8 text-center bg-gradient-to-r from-frim-500 to-frim-400 text-dark-950 hover:shadow-lg hover:shadow-frim-500/25 transition-all"
            >
              {session ? "Go to Dashboard" : "Get Started Free"}
            </Link>

            <div className="space-y-4">
              {features.map((feature, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-5 h-5 rounded-full bg-frim-500/20 flex items-center justify-center shrink-0">
                    <svg className="w-3 h-3 text-frim-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-dark-300">{feature}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Why Free Section */}
      <section className="relative pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-3xl font-bold text-center mb-12">
            Why is it free?
          </h2>
          <div className="space-y-6">
            {[
              {
                q: 'Is this really free?',
                a: 'Yes! All features are completely free with no hidden costs. We want everyone to have access to professional animation tools.',
              },
              {
                q: 'Will it stay free?',
                a: 'We plan to keep the core features free. If we introduce premium features in the future, existing functionality will remain free.',
              },
              {
                q: 'What\'s the catch?',
                a: 'There\'s no catch! We\'re building this for the community. We may introduce optional paid features later, but the current features will always be free.',
              },
              {
                q: 'Is my data safe?',
                a: 'Absolutely. Your projects are stored securely in the cloud. We don\'t sell your data or use it for anything other than providing the service.',
              },
            ].map((faq, i) => (
              <div key={i} className="bg-dark-900 border border-dark-800 rounded-xl p-6">
                <h3 className="font-semibold text-lg mb-2">{faq.q}</h3>
                <p className="text-dark-400">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-dark-800 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-dark-400">
            <svg className="w-7 h-7" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2"/>
              <circle cx="16" cy="10" r="3" fill="currentColor"/>
              <line x1="16" y1="13" x2="16" y2="20" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="16" x2="10" y2="14" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="16" x2="22" y2="14" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="20" x2="12" y2="26" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="20" x2="20" y2="26" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <span className="font-display text-lg font-semibold">frim</span>
          </div>
          <p className="text-sm text-dark-600">© 2026 Frim. Free web-based GLB animation editor.</p>
        </div>
      </footer>
    </div>
  )
}

'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const plans = [
  {
    id: 'free',
    name: 'Free',
    description: 'Perfect for getting started',
    price: 0,
    period: '',
    features: [
      'Up to 3 projects',
      'Up to 2 animations per project',
      'GLB/GLTF import & export',
      'Basic animation tools',
      'JSON & GLB export',
      'Community support',
    ],
    notIncluded: [
      'AI Video Motion Capture',
      'Priority cloud saves',
      'Priority support',
    ],
    cta: 'Get Started',
    popular: false,
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For professional animators',
    price: 12,
    period: '/month',
    features: [
      'Unlimited projects',
      'Unlimited animations per project',
      'GLB/GLTF import & export',
      'Advanced animation tools',
      'AI Video Motion Capture',
      'Extract animations from videos',
      'Priority cloud saves',
      'Priority support',
    ],
    notIncluded: [],
    cta: 'Upgrade to Pro',
    popular: true,
  },
]

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
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState<string | null>(null)
  const [currentPlan, setCurrentPlan] = useState<string>('free')
  const [showCanceled, setShowCanceled] = useState(false)

  useEffect(() => {
    if (searchParams.get('canceled') === 'true') {
      setShowCanceled(true)
      setTimeout(() => setShowCanceled(false), 5000)
    }
  }, [searchParams])

  useEffect(() => {
    if (session) {
      fetchSubscription()
    }
  }, [session])

  const fetchSubscription = async () => {
    try {
      const res = await fetch('/api/user/subscription')
      if (res.ok) {
        const data = await res.json()
        setCurrentPlan(data.plan)
      }
    } catch (error) {
      console.error('Failed to fetch subscription:', error)
    }
  }

  const handleUpgrade = async (planId: string) => {
    if (!session) {
      router.push('/auth/signin?callbackUrl=/pricing')
      return
    }

    if (planId === 'free') {
      router.push('/dashboard')
      return
    }

    setLoading(planId)

    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Failed to create checkout session')
      }
    } catch (error) {
      console.error('Upgrade error:', error)
      alert('Failed to start checkout. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  const handleManageBilling = async () => {
    setLoading('portal')

    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
      })

      const data = await res.json()

      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Failed to open billing portal')
      }
    } catch (error) {
      console.error('Portal error:', error)
      alert('Failed to open billing portal. Please try again.')
    } finally {
      setLoading(null)
    }
  }

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

      {/* Canceled Notice */}
      {showCanceled && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 px-6 py-3 rounded-xl z-50 animate-slide-down">
          Checkout was canceled. No charges were made.
        </div>
      )}

      {/* Header */}
      <section className="relative pt-20 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-frim-500/10 border border-frim-500/20 px-4 py-2 rounded-full text-sm text-frim-400 mb-6">
            <span className="w-2 h-2 bg-frim-400 rounded-full animate-pulse" />
            Simple, transparent pricing
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-6">
            Choose your <span className="gradient-text">plan</span>
          </h1>
          <p className="text-lg text-dark-400 max-w-2xl mx-auto">
            Start free and upgrade when you need more. No hidden fees, cancel anytime.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="relative pb-24 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative bg-dark-900 border rounded-2xl p-8 ${
                  plan.popular
                    ? 'border-frim-500 shadow-xl shadow-frim-500/10'
                    : 'border-dark-800'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-frim-500 to-frim-400 text-dark-950 px-4 py-1.5 rounded-full text-sm font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="font-display text-2xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-dark-500">{plan.description}</p>
                </div>

                <div className="mb-8">
                  <span className="font-display text-5xl font-bold">
                    ${plan.price}
                  </span>
                  <span className="text-dark-500">{plan.period}</span>
                </div>

                {currentPlan === plan.id ? (
                  <div className="mb-8">
                    <div className="bg-frim-500/10 border border-frim-500/30 text-frim-400 px-4 py-3 rounded-xl text-center font-medium">
                      ✓ Current Plan
                    </div>
                    {plan.id === 'pro' && (
                      <button
                        onClick={handleManageBilling}
                        disabled={loading === 'portal'}
                        className="w-full mt-3 text-sm text-dark-400 hover:text-dark-200 py-2 transition-colors"
                      >
                        {loading === 'portal' ? 'Loading...' : 'Manage Billing →'}
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={loading === plan.id}
                    className={`w-full py-3.5 rounded-xl font-semibold mb-8 transition-all ${
                      plan.popular
                        ? 'bg-gradient-to-r from-frim-500 to-frim-400 text-dark-950 hover:shadow-lg hover:shadow-frim-500/25'
                        : 'bg-dark-800 text-dark-200 hover:bg-dark-700'
                    } disabled:opacity-50`}
                  >
                    {loading === plan.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="spinner w-4 h-4" />
                        Processing...
                      </span>
                    ) : (
                      plan.cta
                    )}
                  </button>
                )}

                <div className="space-y-4">
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-frim-500/20 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-frim-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-dark-300">{feature}</span>
                    </div>
                  ))}
                  {plan.notIncluded.map((feature, i) => (
                    <div key={i} className="flex items-center gap-3 opacity-50">
                      <div className="w-5 h-5 rounded-full bg-dark-800 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-dark-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <span className="text-dark-600">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-3xl font-bold text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="space-y-6">
            {[
              {
                q: 'Can I cancel anytime?',
                a: 'Yes! You can cancel your subscription at any time. You\'ll continue to have access to Pro features until the end of your billing period.',
              },
              {
                q: 'What happens to my projects if I downgrade?',
                a: 'Your projects are safe! If you exceed the free plan limit after downgrading, you can still access all your projects but won\'t be able to create new ones until you\'re within the limit.',
              },
              {
                q: 'Is there a free trial?',
                a: 'The free plan lets you explore all basic features with up to 3 projects. This is essentially a forever-free tier, not a limited trial.',
              },
              {
                q: 'How secure is my payment?',
                a: 'We use Stripe for all payments. Your card details never touch our servers and are processed securely by Stripe, trusted by millions of businesses worldwide.',
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
          <p className="text-sm text-dark-600">© 2026 Frim. Web-based GLB animation editor.</p>
        </div>
      </footer>

      <style jsx>{`
        @keyframes slide-down {
          from { opacity: 0; transform: translate(-50%, -20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-slide-down { animation: slide-down 0.3s ease-out; }
      `}</style>
    </div>
  )
}

'use client'

import { Suspense, useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { startPlanCheckout } from '@/lib/checkout'
import Celebration, { type CelebrationKind } from '@/components/Celebration'
import StudioUpgradeModal from '@/components/StudioUpgradeModal'
import { MarketingNav, SiteFooter } from '@/components/chrome'

const plans = [
  {
    id: 'free',
    name: 'Free',
    description: 'Learn the editor on a real model',
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
      'Studio 3D GPU Capture',
      'Priority support',
    ],
    cta: 'Get Started',
    popular: false,
    highlight: null as string | null,
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'Capture a performance from video',
    price: 12,
    period: '/month',
    features: [
      'Unlimited projects',
      'Unlimited animations per project',
      'GLB/GLTF import & export',
      'Advanced animation tools',
      'AI Video Motion Capture (Fast)',
      'Priority cloud saves',
      'Priority support',
    ],
    notIncluded: [
      'Studio 3D GPU Capture',
    ],
    cta: 'Upgrade to Pro',
    popular: true,
    highlight: null as string | null,
  },
  {
    id: 'studio',
    name: 'Studio',
    description: 'Retarget 3D motion onto your GLB',
    price: 39,
    period: '/month',
    features: [
      'Everything in Pro',
      'Studio 3D GPU motion capture',
      'True 3D rotations on your GLB',
      '40 GPU captures per month',
      'Then $1 per extra capture',
      'Unlimited projects & animations',
      'Priority cloud saves',
      'Priority support',
    ],
    notIncluded: [] as string[],
    cta: 'Upgrade to Studio',
    popular: false,
    highlight: '3D GPU',
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
  const [celebration, setCelebration] = useState<CelebrationKind>(null)
  const [showStudioModal, setShowStudioModal] = useState(false)
  const [studioError, setStudioError] = useState<string | null>(null)
  const [faqOpen, setFaqOpen] = useState(0)

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
      router.push(session ? '/dashboard' : '/auth/register')
      return
    }

    if (planId === 'studio') {
      setStudioError(null)
      setShowStudioModal(true)
      return
    }

    setLoading(planId)

    try {
      const result = await startPlanCheckout('pro', '/dashboard')
      if ('error' in result) throw new Error(result.error)
      if ('upgraded' in result && result.upgraded) {
        setCurrentPlan(result.planId)
        setCelebration(result.planId)
      }
    } catch (error) {
      console.error('Upgrade error:', error)
      alert('Failed to start checkout. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  const confirmStudioUpgrade = async () => {
    if (!session) {
      router.push('/auth/signin?callbackUrl=/pricing')
      return
    }
    setLoading('studio')
    setStudioError(null)
    try {
      const result = await startPlanCheckout('studio', '/dashboard')
      if ('error' in result) {
        setStudioError(result.error)
        return
      }
      if ('upgraded' in result && result.upgraded) {
        setShowStudioModal(false)
        setCurrentPlan(result.planId)
        setCelebration(result.planId)
      }
    } catch (error) {
      console.error('Studio upgrade error:', error)
      setStudioError(error instanceof Error ? error.message : 'Failed to start checkout. Please try again.')
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
        <div className="glow-effect w-[400px] h-[400px] bg-emerald-500 bottom-1/4 right-1/4 opacity-20" style={{ animationDelay: '-7s' }} />
      </div>

      <MarketingNav>
        {session ? (
          <Link href="/dashboard" className="btn-secondary text-sm py-2 px-4">
            Dashboard
          </Link>
        ) : (
          <>
            <Link href="/auth/signin" className="btn-secondary text-sm py-2 px-4">
              Sign in
            </Link>
            <Link href="/auth/register" className="btn-primary text-sm py-2 px-4">
              Start free
            </Link>
          </>
        )}
      </MarketingNav>

      {/* Canceled Notice */}
      {showCanceled && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-yellow-500/10 border border-yellow-500/30 text-yellow-100 px-4 py-3 rounded-xl z-50 flex items-center gap-3 shadow-lg">
          <span className="text-sm">Checkout was canceled. No charges were made.</span>
          <button type="button" onClick={() => setShowCanceled(false)} className="text-yellow-200/80 hover:text-white text-sm px-2" aria-label="Dismiss">
            Close
          </button>
        </div>
      )}
      <Celebration kind={celebration} onClose={() => {
        setCelebration(null)
        router.push('/dashboard')
      }} />
      <StudioUpgradeModal
        open={showStudioModal}
        onClose={() => {
          if (loading === 'studio') return
          setShowStudioModal(false)
          setStudioError(null)
        }}
        onConfirm={confirmStudioUpgrade}
        loading={loading === 'studio'}
        error={studioError}
        currentPlan={currentPlan}
      />

      {/* Header */}
      <section id="main" className="relative pt-28 pb-16 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-frim-500/10 border border-frim-500/20 px-4 py-2 rounded-full text-sm text-frim-400 mb-6">
            <span className="w-2 h-2 bg-frim-400 rounded-full animate-pulse" />
            Simple, transparent pricing
          </div>
          <h1 className="font-display text-4xl md:text-6xl font-bold mb-6 text-balance">
            Start free. Upgrade when the clip needs <span className="gradient-text">capture.</span>
          </h1>
          <p className="text-lg text-dark-200 max-w-2xl mx-auto">
            The editor is included on every plan. Pro adds video capture. Studio adds GPU 3D, with 40 captures a month and $1 after that.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="relative pb-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6 items-stretch pt-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={`relative bg-dark-900 border rounded-2xl p-8 flex flex-col ${
                  plan.popular
                    ? 'border-frim-500 shadow-xl shadow-frim-500/10 md:-translate-y-2'
                    : plan.id === 'studio'
                    ? 'border-emerald-500/50 shadow-xl shadow-emerald-500/10'
                    : 'border-white/[0.06]'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-frim-500 to-frim-400 text-dark-950 px-4 py-1.5 rounded-full text-sm font-semibold">
                      Most Popular
                    </span>
                  </div>
                )}
                {plan.highlight && !plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="bg-gradient-to-r from-emerald-400 to-frim-400 text-dark-950 px-4 py-1.5 rounded-full text-sm font-semibold">
                      {plan.highlight}
                    </span>
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="font-display text-2xl font-bold mb-2">{plan.name}</h3>
                  <p className="text-dark-300 min-h-[48px]">{plan.description}</p>
                </div>

                <div className="mb-8">
                  <span className="font-display text-5xl font-bold">
                    ${plan.price}
                  </span>
                  <span className="text-dark-500">{plan.period}</span>
                </div>

                {session && currentPlan === plan.id ? (
                  <div className="mb-8">
                    <div className="bg-frim-500/10 border border-frim-500/30 text-frim-400 px-4 py-3 rounded-xl text-center font-medium">
                      ✓ Current Plan
                    </div>
                    {plan.id !== 'free' && (
                      <button
                        onClick={handleManageBilling}
                        disabled={loading === 'portal'}
                        className="w-full mt-3 text-sm text-dark-400 hover:text-dark-200 py-2 transition-colors"
                      >
                        {loading === 'portal' ? 'Loading...' : 'Manage Billing →'}
                      </button>
                    )}
                  </div>
                ) : currentPlan === 'studio' && plan.id === 'pro' ? (
                  <div className="mb-8">
                    <div className="bg-dark-800 border border-dark-700 text-dark-400 px-4 py-3 rounded-xl text-center font-medium">
                      Included in Studio
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => handleUpgrade(plan.id)}
                    disabled={loading === plan.id}
                    className={`w-full py-3.5 rounded-xl font-semibold mb-8 transition-all ${
                      plan.popular || plan.id === 'studio'
                        ? 'bg-gradient-to-r from-frim-500 to-frim-400 text-dark-950 hover:shadow-lg hover:shadow-frim-500/25'
                        : 'bg-dark-800 text-dark-200 hover:bg-dark-700'
                    } disabled:opacity-50`}
                  >
                    {loading === plan.id ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="spinner w-4 h-4" />
                        Processing...
                      </span>
                    ) : currentPlan === 'pro' && plan.id === 'studio' ? (
                      'Upgrade to Studio'
                    ) : (
                      plan.cta
                    )}
                  </button>
                )}

                <div className="space-y-3.5">
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-5 h-5 rounded-full bg-frim-500/20 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-frim-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="text-dark-200 text-sm leading-snug">{feature}</span>
                    </div>
                  ))}
                  {plan.notIncluded.map((feature, i) => (
                    <div key={i} className="flex items-start gap-3 opacity-60">
                      <div className="w-5 h-5 rounded-full bg-dark-800 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-dark-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <span className="text-dark-500 text-sm leading-snug">{feature}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-dark-400 mt-8">
            Stripe handles payment. Cancel whenever you like and keep paid features through the end of the period.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="relative pb-24 px-6">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-3xl font-bold text-center mb-12">
            Frequently Asked Questions
          </h2>
          <div className="space-y-3">
            {[
              {
                q: 'What is Studio 3D capture?',
                a: 'Studio adds GPU motion capture: a 3D body solver that retargets onto the GLB you load in the editor. Pro includes unlimited Fast (in-browser) capture. Studio includes 40 GPU jobs per month, then $1 per extra capture.',
              },
              {
                q: 'Can I cancel anytime?',
                a: 'Yes. Cancel whenever you like and keep the paid features until the end of the current billing period.',
              },
              {
                q: 'What happens to my projects if I downgrade?',
                a: 'Projects stay saved. If you are over the free limit, you can still open them. You just cannot create new ones until you are back within the limit.',
              },
              {
                q: 'Is there a free trial?',
                a: 'The free plan is a permanent tier: up to 3 projects and the basic editor. It is not a timed trial.',
              },
              {
                q: 'How secure is my payment?',
                a: 'Stripe processes every payment. Card details never reach Frim servers.',
              },
            ].map((faq, i) => {
              const open = faqOpen === i
              return (
                <div key={faq.q} className="bg-dark-900 border border-white/[0.06] rounded-xl">
                  <button
                    type="button"
                    aria-expanded={open}
                    onClick={() => setFaqOpen(open ? -1 : i)}
                    className="w-full text-left px-6 py-5 flex items-center justify-between gap-4"
                  >
                    <span className="font-semibold">{faq.q}</span>
                    <span className="text-dark-400 text-xl leading-none" aria-hidden="true">{open ? '−' : '+'}</span>
                  </button>
                  {open && <p className="px-6 pb-5 text-dark-300 leading-relaxed">{faq.a}</p>}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      <SiteFooter />

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

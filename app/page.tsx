'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { HeroEditorPreview, MocapCapturePreview } from '@/components/Landing/MotionPreviews'
import { DISCORD_URL, DiscordIcon, MarketingNav, SiteFooter } from '@/components/chrome'

export default function Home() {
  const { data: session, status } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (session) {
      router.push('/dashboard')
    }
  }, [session, router])

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-950">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark-950 relative overflow-hidden">
      {/* Animated Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-frim-500/10 via-transparent to-transparent" />
        <div className="absolute inset-0" style={{
          backgroundImage: 'linear-gradient(rgba(34, 197, 94, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 197, 94, 0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
          maskImage: 'radial-gradient(ellipse 80% 60% at 50% 30%, black 20%, transparent 70%)'
        }} />
        <div className="glow-effect w-[600px] h-[600px] bg-frim-500 -top-48 left-1/4" />
        <div className="glow-effect w-[400px] h-[400px] bg-frim-600 bottom-1/4 right-1/4" style={{ animationDelay: '-7s' }} />
      </div>

      <MarketingNav>
        <Link href="/pricing" className="text-sm text-dark-300 hover:text-white hover:bg-white/5 transition-colors px-3 py-2 rounded-lg">
          Pricing
        </Link>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-dark-300 hover:text-[#5865F2] hover:bg-white/5 transition-colors px-3 py-2 rounded-lg inline-flex items-center gap-1.5"
        >
          <DiscordIcon className="w-4 h-4" />
          Discord
        </a>
        <Link href="/auth/signin" className="btn-secondary text-sm py-2 px-4">
          Sign in
        </Link>
        <Link href="/auth/register" className="btn-primary text-sm py-2 px-4">
          Start free
        </Link>
      </MarketingNav>

      <section id="main" className="relative pt-28 pb-16 sm:pt-32 sm:pb-20">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 bg-frim-500/10 border border-frim-500/20 px-4 py-2 rounded-full text-sm text-frim-300 mb-6">
              <span className="w-2 h-2 bg-frim-400 rounded-full animate-pulse" />
              Free plan · No credit card
            </div>

            <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-bold leading-[0.98] mb-6 text-balance">
              Make the character <span className="gradient-text">move.</span>
            </h1>

            <p className="text-lg text-dark-200 mb-8 leading-relaxed">
              Frim is a skeletal animation editor that opens in a tab.
              Drop in a GLB, pose the bones, and export a clip you can use.
            </p>

            <div className="flex flex-wrap gap-3 mb-6">
              <Link href="/auth/register" className="btn-primary text-base px-6 py-3">
                Start free
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link href="/pricing" className="btn-secondary text-base px-6 py-3">
                Compare plans
              </Link>
            </div>

            <p className="text-sm text-dark-400">
              3 projects on the free plan. Paid plans cancel anytime.
            </p>
          </div>

          <div className="flex justify-center">
            <HeroEditorPreview />
          </div>
        </div>
      </section>

      <section className="relative px-6 pb-8">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-3">
          {[
            { name: 'Free', price: '$0', detail: 'Pose, keyframe, and export', href: '/auth/register', cta: 'Start free' },
            { name: 'Pro', price: '$12', detail: 'Video capture and text to motion', href: '/pricing', cta: 'See Pro' },
            { name: 'Studio', price: '$39', detail: 'GPU 3D capture on your GLB', href: '/pricing', cta: 'See Studio' },
          ].map((plan) => (
            <Link
              key={plan.name}
              href={plan.href}
              className={`rounded-2xl border p-5 transition-colors ${
                plan.name === 'Pro'
                  ? 'bg-frim-500/10 border-frim-500/40 hover:border-frim-400'
                  : 'bg-dark-900/80 border-white/[0.06] hover:border-white/20'
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-display text-lg font-semibold">{plan.name}</p>
                <p className="font-display text-2xl font-bold">
                  {plan.price}
                  {plan.price !== '$0' && <span className="text-sm font-medium text-dark-400">/mo</span>}
                </p>
              </div>
              <p className="mt-2 text-sm text-dark-300">{plan.detail}</p>
              <p className="mt-4 text-sm font-semibold text-frim-400">{plan.cta} →</p>
            </Link>
          ))}
        </div>
      </section>

      {/* AI Video Motion Capture Section */}
      <section className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="relative bg-gradient-to-br from-dark-900 via-dark-900 to-dark-800/50 border border-dark-700/50 rounded-3xl p-8 md:p-12 overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-frim-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
            
            <div className="relative grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-frim-500/10 border border-frim-500/30 px-3 py-1.5 rounded-full text-xs font-semibold text-frim-400 mb-6">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  PRO FEATURE
                </div>
                
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                  AI Video<br />
                  <span className="bg-gradient-to-r from-frim-400 to-emerald-400 bg-clip-text text-transparent">Motion Capture</span>
                </h2>
                
                <p className="text-dark-400 mb-6 leading-relaxed">
                  Upload any video and let AI extract human movements automatically — 
                  no expensive mocap suits required. Runs entirely in your browser.
                </p>
                
                <ul className="space-y-3 mb-8">
                  {[
                    'Upload MP4, MOV, or WebM videos',
                    'AI detects body pose frame by frame',
                    'Auto-generates keyframes for bones',
                    'Describe a move and generate the clip',
                    'Studio 3D GPU capture on your GLB',
                    'Works with any rigged humanoid model'
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm text-dark-300">
                      <div className="w-5 h-5 rounded-full bg-frim-500/20 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-frim-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
                
                <Link href="/pricing" className="btn-primary">
                  Unlock capture on Pro
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              </div>
              
              {/* Visual */}
              <div className="relative">
                <MocapCapturePreview />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative py-8 px-6" id="how-it-works">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl font-bold mb-3">How it works</h2>
            <p className="text-lg text-dark-400">Three steps from a model file to a finished clip</p>
          </div>
          <ol className="grid md:grid-cols-3 gap-4">
            {steps.map((step) => (
              <li key={step.title} className="bg-dark-900/80 border border-white/[0.06] rounded-2xl p-6">
                <p className="font-display text-3xl font-bold text-frim-400 mb-3">{step.index}</p>
                <h3 className="font-display text-xl font-semibold mb-2">{step.title}</h3>
                <p className="text-sm text-dark-300 leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-24 px-6" id="everything-you-need">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl font-bold mb-4">Built for a finished clip</h2>
            <p className="text-lg text-dark-300">The editor is free to try. Capture is what Pro and Studio add.</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div key={i} className={`bg-dark-900 border rounded-2xl p-8 card-hover ${feature.highlight ? 'border-frim-500/30 bg-gradient-to-br from-dark-900 to-frim-950/20' : 'border-dark-800'}`}>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 ${feature.highlight ? 'bg-frim-500/20 text-frim-400' : 'bg-frim-500/10 text-frim-400'}`}>
                  {feature.icon}
                </div>
                <div className="flex items-center gap-2 mb-3">
                  <h3 className="font-display text-lg font-semibold">{feature.title}</h3>
                  {feature.highlight && (
                    <span className="text-[10px] font-bold bg-frim-500 text-dark-950 px-1.5 py-0.5 rounded">PRO</span>
                  )}
                </div>
                <p className="text-dark-300 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="relative px-6 pb-24">
        <div className="max-w-4xl mx-auto text-center rounded-3xl border border-frim-500/30 bg-gradient-to-b from-frim-500/15 to-dark-900 px-6 py-16">
          <p className="text-sm font-semibold text-frim-300 mb-3">No install. No card.</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold mb-4 text-balance">Open the editor and pose something.</h2>
          <p className="text-dark-200 mb-8 max-w-xl mx-auto">The sample model is one click away. Your first project stays free.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/auth/register" className="btn-primary text-base px-6 py-3">
              Start free
            </Link>
            <Link href="/pricing" className="btn-secondary text-base px-6 py-3">
              See pricing
            </Link>
          </div>
        </div>
      </section>

      <SiteFooter />

    </div>
  )
}

const steps = [
  {
    index: '01',
    title: 'Import a model',
    body: 'Drop in a rigged GLB or start from the sample character. Frim reads the skeleton and lists every bone.',
  },
  {
    index: '02',
    title: 'Pose and keyframe',
    body: 'Rotate, move, or scale a bone, then drop a keyframe. Scrub the timeline or hit play to see the motion.',
  },
  {
    index: '03',
    title: 'Export or capture',
    body: 'Download a GLB with your clips. On Pro, capture a video or describe a move in text. Studio retargets video in 3D.',
  },
]

const features = [
  {
    title: 'GLB/GLTF Import',
    description: 'Load any GLB or GLTF model with armature. Full support for industry-standard formats.',
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /></svg>,
    highlight: false,
  },
  {
    title: 'AI Video Motion Capture',
    description: 'Upload a video and let Frim AI extract body movements automatically. Runs entirely in your browser.',
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2" strokeWidth={2}/></svg>,
    highlight: true,
  },
  {
    title: 'Text to motion',
    description: 'Describe a walk, wave, jump, or dance. Frim builds the clip and retargets it onto the model you loaded.',
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h10M4 17h7" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l3 3-3 3" /></svg>,
    highlight: true,
  },
  {
    title: 'Bone Controls',
    description: 'Select and transform bones with precision. Rotate, translate, and scale intuitively.',
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12v8M8 20h8M8 14l-2 2M16 14l2 2"/></svg>,
    highlight: false,
  },
  {
    title: 'Keyframe Timeline',
    description: 'Visual timeline with keyframe editing. Create smooth animations with ease.',
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2}/><circle cx="8" cy="12" r="2" fill="currentColor"/><circle cx="16" cy="8" r="2" fill="currentColor"/><circle cx="16" cy="16" r="2" fill="currentColor"/></svg>,
    highlight: false,
  },
  {
    title: 'Cloud Saves',
    description: 'Save projects to the cloud. Access your animations from anywhere, anytime.',
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>,
    highlight: false,
  },
  {
    title: 'GLB Export',
    description: 'Export your animations back to GLB. Multiple animations per file supported.',
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>,
    highlight: false,
  },
]


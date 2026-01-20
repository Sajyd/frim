'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

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

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FrimLogo className="w-9 h-9 text-frim-400" />
            <span className="font-display text-2xl font-semibold">frim</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/pricing" className="text-sm text-dark-400 hover:text-dark-200 transition-colors">
              Pricing
            </Link>
            <Link href="/auth/signin" className="btn-secondary text-sm py-2">
              Sign In
            </Link>
            <Link href="/auth/register" className="btn-primary text-sm py-2">
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-20">
        <div className="max-w-7xl mx-auto px-6 grid lg:grid-cols-2 gap-16 items-center">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 bg-frim-500/10 border border-frim-500/20 px-4 py-2 rounded-full text-sm text-frim-400 mb-6">
              <span className="w-2 h-2 bg-frim-400 rounded-full animate-pulse" />
              Web-Based Animation Tool
            </div>
            
            <h1 className="font-display text-5xl lg:text-6xl font-bold leading-tight mb-6">
              Animate your<br />
              <span className="gradient-text">3D models</span>
            </h1>
            
            <p className="text-lg text-dark-400 mb-8 leading-relaxed">
              The simplest way to create skeletal animations. 
              Import GLB files, pose bones, add keyframes, and export 
              production-ready animations — all in your browser.
            </p>

            <div className="flex flex-wrap gap-4 mb-10">
              <Link href="/auth/register" className="btn-primary flex items-center gap-2">
                Start Animating
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link href="/auth/signin" className="btn-secondary flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                Try Demo
              </Link>
            </div>

            <div className="flex flex-wrap gap-3">
              {['No installation', 'GLB import & export', 'Cloud saves'].map((feature) => (
                <div key={feature} className="flex items-center gap-2 bg-dark-900 px-3 py-2 rounded-full text-sm text-dark-400">
                  <svg className="w-4 h-4 text-frim-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {feature}
                </div>
              ))}
            </div>
          </div>

          {/* Visual Preview */}
          <div className="hidden lg:flex justify-center">
            <div className="w-full max-w-lg bg-dark-900 rounded-2xl border border-dark-800 overflow-hidden shadow-2xl">
              <div className="flex items-center gap-2 px-4 py-3 bg-dark-950 border-b border-dark-800">
                <div className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="w-3 h-3 rounded-full bg-yellow-500" />
                  <span className="w-3 h-3 rounded-full bg-frim-500" />
                </div>
                <span className="text-xs text-dark-500 font-mono">frim editor</span>
              </div>
              <div className="p-10 flex flex-col items-center">
                {/* Animated Skeleton Preview */}
                <div className="relative w-32 h-48 mb-8">
                  <SkeletonPreview />
                </div>
                {/* Timeline Preview */}
                <div className="w-full bg-dark-950 rounded-lg p-4 relative">
                  <div className="h-1 bg-dark-800 rounded relative">
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-frim-500 rounded-sm rotate-45" style={{ left: '15%' }} />
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-frim-500 rounded-sm rotate-45" style={{ left: '45%' }} />
                    <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-frim-500 rounded-sm rotate-45" style={{ left: '80%' }} />
                    <div className="absolute top-0 -translate-y-1 w-0.5 h-4 bg-frim-400 playhead-animate" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl font-bold mb-4">Everything you need</h2>
            <p className="text-lg text-dark-500">Professional animation tools, right in your browser</p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div key={i} className="bg-dark-900 border border-dark-800 rounded-2xl p-8 card-hover">
                <div className="w-12 h-12 bg-frim-500/10 rounded-xl flex items-center justify-center text-frim-400 mb-5">
                  {feature.icon}
                </div>
                <h3 className="font-display text-lg font-semibold mb-3">{feature.title}</h3>
                <p className="text-dark-500 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-dark-800 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 text-dark-400">
            <FrimLogo className="w-7 h-7" />
            <span className="font-display text-lg font-semibold">frim</span>
          </div>
          <p className="text-sm text-dark-600">© 2026 Frim. Free GLB animation editor.</p>
        </div>
      </footer>

      <style jsx>{`
        .playhead-animate {
          animation: playhead 3s ease-in-out infinite;
        }
        @keyframes playhead {
          0%, 100% { left: 15%; }
          50% { left: 80%; }
        }
      `}</style>
    </div>
  )
}

function FrimLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2"/>
      <circle cx="16" cy="10" r="3" fill="currentColor"/>
      <line x1="16" y1="13" x2="16" y2="20" stroke="currentColor" strokeWidth="2"/>
      <line x1="16" y1="16" x2="10" y2="14" stroke="currentColor" strokeWidth="2"/>
      <line x1="16" y1="16" x2="22" y2="14" stroke="currentColor" strokeWidth="2"/>
      <line x1="16" y1="20" x2="12" y2="26" stroke="currentColor" strokeWidth="2"/>
      <line x1="16" y1="20" x2="20" y2="26" stroke="currentColor" strokeWidth="2"/>
    </svg>
  )
}

function SkeletonPreview() {
  return (
    <svg viewBox="0 0 120 200" className="w-full h-full">
      <style>{`
        .joint { fill: #4ade80; }
        .bone { stroke: #22c55e; stroke-width: 4; stroke-linecap: round; }
        .head { fill: #4ade80; }
        .arm-l { animation: wave-l 2s ease-in-out infinite; transform-origin: 30px 60px; }
        .arm-r { animation: wave-r 2s ease-in-out infinite; transform-origin: 90px 60px; }
        .leg-l { animation: step-l 2s ease-in-out infinite; transform-origin: 50px 100px; }
        .leg-r { animation: step-r 2s ease-in-out infinite; transform-origin: 70px 100px; }
        @keyframes wave-l { 0%, 100% { transform: rotate(-15deg); } 50% { transform: rotate(15deg); } }
        @keyframes wave-r { 0%, 100% { transform: rotate(15deg); } 50% { transform: rotate(-15deg); } }
        @keyframes step-l { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
        @keyframes step-r { 0%, 100% { transform: rotate(5deg); } 50% { transform: rotate(-5deg); } }
      `}</style>
      {/* Head */}
      <circle className="head" cx="60" cy="20" r="12" />
      {/* Neck */}
      <line className="bone" x1="60" y1="32" x2="60" y2="50" />
      {/* Spine */}
      <line className="bone" x1="60" y1="50" x2="60" y2="100" />
      {/* Arms */}
      <g className="arm-l">
        <line className="bone" x1="30" y1="60" x2="60" y2="55" />
        <line className="bone" x1="10" y1="80" x2="30" y2="60" />
        <circle className="joint" cx="30" cy="60" r="5" />
        <circle className="joint" cx="10" cy="80" r="4" />
      </g>
      <g className="arm-r">
        <line className="bone" x1="90" y1="60" x2="60" y2="55" />
        <line className="bone" x1="110" y1="80" x2="90" y2="60" />
        <circle className="joint" cx="90" cy="60" r="5" />
        <circle className="joint" cx="110" cy="80" r="4" />
      </g>
      {/* Legs */}
      <g className="leg-l">
        <line className="bone" x1="50" y1="100" x2="45" y2="150" />
        <line className="bone" x1="45" y1="150" x2="40" y2="190" />
        <circle className="joint" cx="50" cy="100" r="5" />
        <circle className="joint" cx="45" cy="150" r="4" />
        <circle className="joint" cx="40" cy="190" r="3" />
      </g>
      <g className="leg-r">
        <line className="bone" x1="70" y1="100" x2="75" y2="150" />
        <line className="bone" x1="75" y1="150" x2="80" y2="190" />
        <circle className="joint" cx="70" cy="100" r="5" />
        <circle className="joint" cx="75" cy="150" r="4" />
        <circle className="joint" cx="80" cy="190" r="3" />
      </g>
    </svg>
  )
}

const features = [
  {
    title: 'GLB/GLTF Import',
    description: 'Load any GLB or GLTF model with armature. Full support for industry-standard formats.',
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /></svg>,
  },
  {
    title: 'Bone Controls',
    description: 'Select and transform bones with precision. Rotate, translate, and scale intuitively.',
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 12v8M8 20h8M8 14l-2 2M16 14l2 2"/></svg>,
  },
  {
    title: 'Keyframe Timeline',
    description: 'Visual timeline with keyframe editing. Create smooth animations with ease.',
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2}/><circle cx="8" cy="12" r="2" fill="currentColor"/><circle cx="16" cy="8" r="2" fill="currentColor"/><circle cx="16" cy="16" r="2" fill="currentColor"/></svg>,
  },
  {
    title: 'Cloud Saves',
    description: 'Save projects to the cloud. Access your animations from anywhere, anytime.',
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>,
  },
  {
    title: 'GLB Export',
    description: 'Export your animations back to GLB. Multiple animations per file supported.',
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/></svg>,
  },
  {
    title: 'Live Preview',
    description: 'Real-time playback of your animations. See changes instantly.',
    icon: <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  },
]


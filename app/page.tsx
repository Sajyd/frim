'use client'

import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { HeroEditorPreview, MocapCapturePreview } from '@/components/Landing/MotionPreviews'

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
            <a
              href="https://discord.gg/YKfmSqZ5e8"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-dark-400 hover:text-[#5865F2] transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              Discord
            </a>
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
              <a href="#everything-you-need" className="btn-secondary flex items-center gap-2">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Learn More
              </a>
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
            <HeroEditorPreview />
          </div>
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
                
                <Link href="/pricing" className="inline-flex items-center gap-2 bg-gradient-to-r from-frim-500 to-frim-400 text-dark-950 px-6 py-3 rounded-xl font-semibold hover:shadow-lg hover:shadow-frim-500/25 transition-all">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  See Pro and Studio
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

      {/* Features Section */}
      <section className="relative py-24 px-6" id="everything-you-need">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl font-bold mb-4">Everything you need</h2>
            <p className="text-lg text-dark-500">Professional animation tools, right in your browser</p>
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
          <div className="flex items-center gap-6">
            <Link href="/pricing" className="text-sm text-dark-500 hover:text-dark-300 transition-colors">
              Pricing
            </Link>
            <a
              href="https://discord.gg/YKfmSqZ5e8"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-dark-500 hover:text-[#5865F2] transition-colors flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              Discord
            </a>
          </div>
          <p className="text-sm text-dark-600">© 2026 Frim. Free GLB animation editor.</p>
        </div>
      </footer>

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


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

      {/* AI Video Motion Capture Section */}
      <section className="relative py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="relative bg-gradient-to-br from-dark-900 via-dark-900 to-dark-800/50 border border-dark-700/50 rounded-3xl p-8 md:p-12 overflow-hidden">
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />
            
            <div className="relative grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1.5 rounded-full text-xs font-semibold text-amber-400 mb-6">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  COMING SOON
                </div>
                
                <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
                  AI Video<br />
                  <span className="bg-gradient-to-r from-amber-400 to-orange-400 bg-clip-text text-transparent">Motion Capture</span>
                </h2>
                
                <p className="text-dark-400 mb-6 leading-relaxed">
                  We&apos;re building something amazing! Soon you&apos;ll be able to upload any video 
                  and let AI extract human movements automatically — no expensive mocap suits required.
                </p>
                
                <ul className="space-y-3 mb-8">
                  {[
                    'Upload MP4, MOV, or WebM videos',
                    'AI detects body pose frame by frame',
                    'Auto-generates keyframes for bones',
                    'Works with any rigged humanoid model'
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-sm text-dark-500">
                      <div className="w-5 h-5 rounded-full bg-dark-700 flex items-center justify-center shrink-0">
                        <svg className="w-3 h-3 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
                
                <div className="inline-flex items-center gap-2 bg-dark-800 text-dark-400 px-6 py-3 rounded-xl font-semibold cursor-not-allowed">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Coming Soon
                </div>
              </div>
              
              {/* Visual */}
              <div className="relative">
                <div className="bg-dark-950 rounded-2xl border border-dark-800 overflow-hidden shadow-2xl">
                  <div className="flex items-center gap-2 px-4 py-3 bg-dark-900 border-b border-dark-800">
                    <div className="flex gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                      <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                      <span className="w-2.5 h-2.5 rounded-full bg-frim-500/80" />
                    </div>
                    <span className="text-xs text-dark-500 font-mono">video-analysis.mp4</span>
                  </div>
                  <div className="p-6">
                    <div className="flex gap-6 items-center">
                      {/* Video frame */}
                      <div className="flex-1 aspect-video bg-dark-800 rounded-lg relative overflow-hidden">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <VideoAnalysisPreview />
                        </div>
                        <div className="absolute bottom-2 left-2 right-2 h-1 bg-dark-700 rounded">
                          <div className="h-full w-2/3 bg-frim-500 rounded video-progress-animate" />
                        </div>
                      </div>
                      {/* Arrow */}
                      <div className="shrink-0">
                        <svg className="w-8 h-8 text-frim-500 pulse-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                      </div>
                      {/* Skeleton output */}
                      <div className="w-20 h-28 shrink-0">
                        <MiniSkeletonPreview />
                      </div>
                    </div>
                    
                    {/* Progress indicators */}
                    <div className="mt-4 flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-dark-800 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-frim-500 to-frim-400 analysis-bar-animate" />
                      </div>
                      <span className="text-xs text-frim-400 font-mono tabular-nums analysis-percent">87%</span>
                    </div>
                    <p className="text-xs text-dark-500 mt-2">Extracting pose data from video frames...</p>
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

      <style jsx>{`
        .playhead-animate {
          animation: playhead 3s ease-in-out infinite;
        }
        @keyframes playhead {
          0%, 100% { left: 15%; }
          50% { left: 80%; }
        }
        .video-progress-animate {
          animation: video-progress 4s ease-in-out infinite;
        }
        @keyframes video-progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
        .analysis-bar-animate {
          animation: analysis-bar 3s ease-in-out infinite;
        }
        @keyframes analysis-bar {
          0% { width: 20%; }
          50% { width: 90%; }
          100% { width: 20%; }
        }
        .pulse-arrow {
          animation: pulse-arrow 1.5s ease-in-out infinite;
        }
        @keyframes pulse-arrow {
          0%, 100% { opacity: 0.5; transform: translateX(0); }
          50% { opacity: 1; transform: translateX(4px); }
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

function VideoAnalysisPreview() {
  return (
    <svg viewBox="0 0 160 90" className="w-full h-full">
      <style>{`
        .person-fill { fill: #3f3f46; }
        .pose-line { stroke: #22c55e; stroke-width: 2; stroke-linecap: round; opacity: 0.8; }
        .pose-dot { fill: #4ade80; }
        .scan-line { 
          stroke: #22c55e; 
          stroke-width: 1; 
          opacity: 0.6;
          animation: scan 2s ease-in-out infinite;
        }
        @keyframes scan {
          0%, 100% { transform: translateY(-30px); opacity: 0; }
          50% { transform: translateY(30px); opacity: 0.8; }
        }
        .pose-pulse {
          animation: pose-pulse 1.5s ease-in-out infinite;
        }
        @keyframes pose-pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
      `}</style>
      {/* Background person silhouette */}
      <ellipse className="person-fill" cx="80" cy="25" rx="12" ry="14" />
      <rect className="person-fill" x="65" y="38" width="30" height="35" rx="4" />
      <rect className="person-fill" x="50" y="40" width="14" height="6" rx="2" />
      <rect className="person-fill" x="96" y="40" width="14" height="6" rx="2" />
      <rect className="person-fill" x="68" y="72" width="10" height="18" rx="2" />
      <rect className="person-fill" x="82" y="72" width="10" height="18" rx="2" />
      
      {/* Pose detection overlay */}
      <g className="pose-pulse">
        {/* Head */}
        <circle className="pose-dot" cx="80" cy="22" r="3" />
        {/* Shoulders */}
        <line className="pose-line" x1="60" y1="42" x2="100" y2="42" />
        <circle className="pose-dot" cx="60" cy="42" r="2.5" />
        <circle className="pose-dot" cx="100" cy="42" r="2.5" />
        <circle className="pose-dot" cx="80" cy="42" r="2" />
        {/* Spine */}
        <line className="pose-line" x1="80" y1="42" x2="80" y2="70" />
        {/* Hips */}
        <line className="pose-line" x1="70" y1="70" x2="90" y2="70" />
        <circle className="pose-dot" cx="70" cy="70" r="2.5" />
        <circle className="pose-dot" cx="90" cy="70" r="2.5" />
        {/* Arms */}
        <line className="pose-line" x1="60" y1="42" x2="48" y2="46" />
        <circle className="pose-dot" cx="48" cy="46" r="2" />
        <line className="pose-line" x1="100" y1="42" x2="112" y2="46" />
        <circle className="pose-dot" cx="112" cy="46" r="2" />
        {/* Legs */}
        <line className="pose-line" x1="70" y1="70" x2="72" y2="88" />
        <circle className="pose-dot" cx="72" cy="88" r="2" />
        <line className="pose-line" x1="90" y1="70" x2="88" y2="88" />
        <circle className="pose-dot" cx="88" cy="88" r="2" />
      </g>
      
      {/* Scanning line */}
      <line className="scan-line" x1="30" y1="45" x2="130" y2="45" />
    </svg>
  )
}

function MiniSkeletonPreview() {
  return (
    <svg viewBox="0 0 60 100" className="w-full h-full">
      <style>{`
        .mini-joint { fill: #4ade80; }
        .mini-bone { stroke: #22c55e; stroke-width: 3; stroke-linecap: round; }
        .mini-head { fill: #4ade80; }
        .mini-arm-l { animation: mini-wave-l 1.5s ease-in-out infinite; transform-origin: 15px 30px; }
        .mini-arm-r { animation: mini-wave-r 1.5s ease-in-out infinite; transform-origin: 45px 30px; }
        @keyframes mini-wave-l { 0%, 100% { transform: rotate(-20deg); } 50% { transform: rotate(10deg); } }
        @keyframes mini-wave-r { 0%, 100% { transform: rotate(20deg); } 50% { transform: rotate(-10deg); } }
      `}</style>
      <circle className="mini-head" cx="30" cy="12" r="8" />
      <line className="mini-bone" x1="30" y1="20" x2="30" y2="28" />
      <line className="mini-bone" x1="30" y1="28" x2="30" y2="55" />
      <g className="mini-arm-l">
        <line className="mini-bone" x1="15" y1="35" x2="30" y2="30" />
        <line className="mini-bone" x1="5" y1="45" x2="15" y2="35" />
        <circle className="mini-joint" cx="15" cy="35" r="3" />
      </g>
      <g className="mini-arm-r">
        <line className="mini-bone" x1="45" y1="35" x2="30" y2="30" />
        <line className="mini-bone" x1="55" y1="45" x2="45" y2="35" />
        <circle className="mini-joint" cx="45" cy="35" r="3" />
      </g>
      <line className="mini-bone" x1="25" y1="55" x2="22" y2="78" />
      <line className="mini-bone" x1="22" y1="78" x2="20" y2="95" />
      <line className="mini-bone" x1="35" y1="55" x2="38" y2="78" />
      <line className="mini-bone" x1="38" y1="78" x2="40" y2="95" />
      <circle className="mini-joint" cx="25" cy="55" r="3" />
      <circle className="mini-joint" cx="35" cy="55" r="3" />
      <circle className="mini-joint" cx="22" cy="78" r="2.5" />
      <circle className="mini-joint" cx="38" cy="78" r="2.5" />
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
    description: 'Coming soon! Upload a video and let AI extract body movements automatically.',
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
    highlight: false,
    comingSoon: true,
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


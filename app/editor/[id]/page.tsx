'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ChevronLeft, Cloud, Save, Check, X } from 'lucide-react'
import { startPlanCheckout, buyGpuCredits } from '@/lib/checkout'
import Celebration, { type CelebrationKind } from '@/components/Celebration'
import GpuUsageMeter from '@/components/GpuUsageMeter'
import StudioUpgradeModal from '@/components/StudioUpgradeModal'

// Dynamically import the editor with no SSR
const ThreeEditor = dynamic(() => import('@/components/Editor/ThreeEditor'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[calc(100vh-52px)] bg-[#0f1117] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#22c55e]/20 border-t-[#22c55e] rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#71717a]">Loading editor...</p>
      </div>
    </div>
  )
})

interface Project {
  id: string
  name: string
  description?: string
  thumbnail?: string
  animations: any[]
  modelData?: string
  modelName?: string
}

interface ProjectData {
  animations: any[]
  modelName: string
  modelData?: string
  thumbnail?: string
}

interface Subscription {
  plan: string
  limits: {
    animationsPerProject: number | 'unlimited'
    videoAnalysis: boolean
    gpuCapture?: boolean
    gpuCapturesPerMonth?: number
  }
  usage?: {
    gpuCapturesUsed?: number
    gpuCapturesBonus?: number
    gpuCapturesIncluded?: number
    gpuCapturesRemaining?: number
    gpuCapturesLimit?: number
  }
}

export default function EditorPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const pendingDataRef = useRef<ProjectData | null>(null)
  const [celebration, setCelebration] = useState<CelebrationKind>(null)
  const [celebrationCredits, setCelebrationCredits] = useState(0)
  const [upgradingStudio, setUpgradingStudio] = useState(false)
  const [showStudioModal, setShowStudioModal] = useState(false)
  const [studioError, setStudioError] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  useEffect(() => {
    if (session && projectId) {
      fetchProject()
      fetchSubscription()
    }
  }, [session, projectId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    const upgraded = params.get('upgraded')
    const credits = params.get('credits')
    if (upgraded === 'studio' || upgraded === 'pro') setCelebration(upgraded)
    if (credits) {
      const n = Math.max(1, parseInt(credits, 10) || 1)
      setCelebrationCredits(n)
      setCelebration('credits')
    }
    if (upgraded || credits) {
      window.history.replaceState({}, '', `/editor/${projectId}`)
      fetchSubscription()
    }
  }, [projectId])

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  const fetchProject = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`)
      if (res.ok) {
        const data = await res.json()
        setProject(data)
      } else {
        router.push('/dashboard')
      }
    } catch (error) {
      console.error('Failed to fetch project:', error)
      router.push('/dashboard')
    } finally {
      setLoading(false)
    }
  }

  const fetchSubscription = async () => {
    try {
      const res = await fetch('/api/user/subscription')
      if (res.ok) {
        const data = await res.json()
        setSubscription(data)
      }
    } catch (error) {
      console.error('Failed to fetch subscription:', error)
    }
  }

  const requestStudioUpgrade = () => {
    setStudioError(null)
    setShowStudioModal(true)
  }

  const confirmStudioUpgrade = async () => {
    setUpgradingStudio(true)
    setStudioError(null)
    try {
      const result = await startPlanCheckout('studio', `/editor/${projectId}`)
      if ('error' in result) {
        setStudioError(result.error)
        return
      }
      if ('upgraded' in result && result.upgraded) {
        setShowStudioModal(false)
        setCelebration('studio')
        await fetchSubscription()
      }
    } catch (error) {
      console.error('Studio upgrade error:', error)
      setStudioError(error instanceof Error ? error.message : 'Failed to upgrade. Please try again.')
    } finally {
      setUpgradingStudio(false)
    }
  }

  const handleBuyGpuCredits = async (quantity: number) => {
    try {
      const result = await buyGpuCredits(quantity, `/editor/${projectId}`)
      if ('error' in result) throw new Error(result.error)
    } catch (error) {
      console.error('Credit purchase error:', error)
      alert('Failed to start payment.')
    }
  }

  const saveProject = useCallback(async (data?: ProjectData) => {
    if (!project) return

    const dataToSave = data || pendingDataRef.current
    if (!dataToSave) {
      showToast('Nothing to save', 'info')
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: project.name,
          animations: dataToSave.animations,
          modelName: dataToSave.modelName,
          modelData: dataToSave.modelData,
          thumbnail: dataToSave.thumbnail,
        }),
      })

      if (res.ok) {
        setLastSaved(new Date())
        setHasUnsavedChanges(false)
        pendingDataRef.current = null
        showToast('Project saved!', 'success')
      } else {
        showToast('Failed to save project', 'error')
      }
    } catch (error) {
      console.error('Failed to save project:', error)
      showToast('Failed to save project', 'error')
    } finally {
      setSaving(false)
    }
  }, [project, projectId])

  // Handle data change from editor (just mark as changed, don't auto-save)
  const handleEditorChange = useCallback((data: ProjectData) => {
    pendingDataRef.current = data
    setHasUnsavedChanges(true)
  }, [])

  // Auto-save every 2 minutes if there are unsaved changes
  useEffect(() => {
    if (project) {
      autoSaveTimerRef.current = setInterval(() => {
        if (hasUnsavedChanges && pendingDataRef.current) {
          saveProject(pendingDataRef.current)
        }
      }, 120000)
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current)
      }
    }
  }, [project, hasUnsavedChanges, saveProject])

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (pendingDataRef.current) {
          saveProject(pendingDataRef.current)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [saveProject])

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    const container = document.getElementById('toast-container')
    if (!container) return

    const toast = document.createElement('div')
    toast.className = `px-4 py-3 rounded-xl shadow-lg border flex items-center gap-2 animate-slide-up pointer-events-auto ${
      type === 'success'
        ? 'bg-[#052e16] border-[#22c55e]/40 text-[#bbf7d0]'
        : type === 'error'
        ? 'bg-[#450a0a] border-red-500/40 text-red-100'
        : 'bg-[#151821] border-white/10 text-[#e4e4e7]'
    }`
    
    const iconSpan = document.createElement('span')
    iconSpan.className = 'w-4 h-4'
    if (type === 'success') iconSpan.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'
    else if (type === 'error') iconSpan.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'
    else iconSpan.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>'
    
    const textSpan = document.createElement('span')
    textSpan.textContent = message
    
    toast.appendChild(iconSpan)
    toast.appendChild(textSpan)
    container.appendChild(toast)

    setTimeout(() => {
      toast.style.opacity = '0'
      toast.style.transform = 'translateY(10px)'
      setTimeout(() => toast.remove(), 300)
    }, 3000)
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-[#0c0e14] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#22c55e]/20 border-t-[#22c55e] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#a1a1aa]">Opening project…</p>
        </div>
      </div>
    )
  }

  const isPaid = subscription?.plan === 'pro' || subscription?.plan === 'studio'
  const isStudio = subscription?.plan === 'studio'
  const isPro = subscription?.plan === 'pro'
  const animationLimit = subscription?.limits?.animationsPerProject === 'unlimited' 
    ? Infinity 
    : (subscription?.limits?.animationsPerProject || 2)

  return (
    <div className="min-h-screen bg-[#0c0e14] text-[#f4f4f5]">
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 h-[52px] bg-[#0c0e14]/90 backdrop-blur-xl border-b border-white/[0.06] z-[1000] flex items-center justify-between gap-3 px-3 sm:px-4">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-1 text-[#a1a1aa] hover:text-[#f4f4f5] transition-colors shrink-0"
            aria-label="Back to dashboard"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm hidden sm:inline">Dashboard</span>
          </Link>
          <div className="w-px h-6 bg-[#252b3d]" />
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-[#22c55e]" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2"/>
              <circle cx="16" cy="11" r="2.5" fill="currentColor"/>
              <line x1="16" y1="13.5" x2="16" y2="19" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="15.5" x2="11" y2="14" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="15.5" x2="21" y2="14" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="19" x2="13" y2="24" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="19" x2="19" y2="24" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <span className="font-semibold text-sm">frim</span>
          </div>
        </div>

        <div className="flex-1 flex justify-center items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate max-w-[40vw]">{project?.name || 'Untitled Project'}</span>
          {hasUnsavedChanges && (
            <span className="text-[11px] text-amber-300 bg-amber-400/10 border border-amber-400/20 px-2 py-0.5 rounded-full shrink-0">Unsaved</span>
          )}
          {isStudio && (
            <div className="hidden lg:block shrink-0">
              <GpuUsageMeter
                used={subscription?.usage?.gpuCapturesUsed ?? 0}
                included={subscription?.usage?.gpuCapturesIncluded ?? 40}
                bonus={subscription?.usage?.gpuCapturesBonus ?? 0}
                remaining={subscription?.usage?.gpuCapturesRemaining ?? 0}
                compact
              />
            </div>
          )}
          {isPro && (
            <button
              onClick={requestStudioUpgrade}
              className="hidden md:inline text-xs bg-frim-500/10 text-frim-400 px-2 py-1 rounded hover:bg-frim-500/20 transition-colors shrink-0"
            >
              Upgrade to Studio
            </button>
          )}
          {!isPaid && (
            <Link
              href="/pricing"
              className="hidden sm:inline text-xs bg-frim-500/10 text-frim-400 px-2 py-1 rounded hover:bg-frim-500/20 transition-colors shrink-0"
            >
              Free Plan
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="hidden lg:flex text-xs text-[#71717a] items-center gap-1 shrink-0">
              <Cloud className="w-3.5 h-3.5" />
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => pendingDataRef.current && saveProject(pendingDataRef.current)}
            disabled={saving || !hasUnsavedChanges}
            title="Save (⌘S)"
            className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0 ${
              hasUnsavedChanges 
                ? 'bg-[#22c55e] text-[#09090b] hover:bg-[#4ade80]' 
                : 'bg-[#252b3d] text-[#a1a1aa]'
            }`}
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                Saving...
              </>
            ) : hasUnsavedChanges ? (
              <>
                <Save className="w-4 h-4" />
                Save
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Saved
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div id="main" className="pt-[52px]">
        <ThreeEditor 
          projectName={project?.name || 'Untitled'} 
          onChange={handleEditorChange}
          saving={saving}
          initialData={project ? {
            animations: project.animations,
            modelData: project.modelData,
            modelName: project.modelName
          } : undefined}
          animationLimit={animationLimit}
          isPro={isPaid}
          canUseVideoAnalysis={subscription?.limits?.videoAnalysis || false}
          canUseGpuCapture={subscription?.limits?.gpuCapture || false}
          gpuCapturesRemaining={subscription?.usage?.gpuCapturesRemaining ?? 0}
          gpuCapturesLimit={subscription?.usage?.gpuCapturesLimit ?? subscription?.limits?.gpuCapturesPerMonth ?? 0}
          gpuCapturesUsed={subscription?.usage?.gpuCapturesUsed ?? 0}
          gpuCapturesBonus={subscription?.usage?.gpuCapturesBonus ?? 0}
          gpuCapturesIncluded={subscription?.usage?.gpuCapturesIncluded ?? 40}
          onUpgradeToStudio={requestStudioUpgrade}
          onBuyGpuCredits={handleBuyGpuCredits}
          upgradingStudio={upgradingStudio}
        />
      </div>

      <Celebration
        kind={celebration}
        credits={celebrationCredits}
        onClose={() => setCelebration(null)}
      />
      <StudioUpgradeModal
        open={showStudioModal}
        onClose={() => {
          if (upgradingStudio) return
          setShowStudioModal(false)
          setStudioError(null)
        }}
        onConfirm={confirmStudioUpgrade}
        loading={upgradingStudio}
        error={studioError}
        currentPlan={subscription?.plan}
      />
      <div id="toast-container" className="fixed bottom-[176px] right-4 flex flex-col gap-2 z-[1001] pointer-events-none max-w-[min(100%-2rem,24rem)]" />

      <style jsx global>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
      `}</style>
    </div>
  )
}

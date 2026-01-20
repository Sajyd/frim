'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { ChevronLeft, Cloud, Save, Check, X } from 'lucide-react'

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
    toast.className = `fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 animate-slide-up ${
      type === 'success' ? 'bg-green-500/90' : type === 'error' ? 'bg-red-500/90' : 'bg-blue-500/90'
    } text-white`
    
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
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#22c55e]/20 border-t-[#22c55e] rounded-full animate-spin mx-auto mb-4" />
          <p className="text-[#71717a]">Loading project...</p>
        </div>
      </div>
    )
  }

  const isPro = subscription?.plan === 'pro'
  const animationLimit = subscription?.limits?.animationsPerProject === 'unlimited' 
    ? Infinity 
    : (subscription?.limits?.animationsPerProject || 2)

  return (
    <div className="min-h-screen bg-[#0f1117] text-[#f4f4f5]">
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 h-[52px] bg-[#151821] border-b border-[#252b3d] z-[1000] flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#f4f4f5] transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm">Dashboard</span>
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

        <div className="flex-1 flex justify-center items-center gap-3">
          <span className="text-sm font-medium">{project?.name || 'Untitled Project'}</span>
          {hasUnsavedChanges && (
            <span className="text-xs text-yellow-500">• Unsaved</span>
          )}
          {!isPro && (
            <Link
              href="/pricing"
              className="text-xs bg-frim-500/10 text-frim-400 px-2 py-1 rounded hover:bg-frim-500/20 transition-colors"
            >
              Free Plan
            </Link>
          )}
        </div>

        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-xs text-[#71717a] flex items-center gap-1">
              <Cloud className="w-3.5 h-3.5" />
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={() => pendingDataRef.current && saveProject(pendingDataRef.current)}
            disabled={saving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
              hasUnsavedChanges 
                ? 'bg-[#22c55e] text-[#09090b] hover:bg-[#4ade80]' 
                : 'bg-[#252b3d] text-[#a1a1aa] hover:bg-[#3f3f46]'
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
      <div className="pt-[52px]">
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
          isPro={isPro}
          canUseVideoAnalysis={subscription?.limits?.videoAnalysis || false}
        />
      </div>

      <div id="toast-container" className="fixed bottom-4 right-4 flex flex-col-reverse gap-3 z-[1001]" />

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

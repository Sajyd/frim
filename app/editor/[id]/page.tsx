'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'
import dynamic from 'next/dynamic'

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

export default function EditorPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const params = useParams()
  const projectId = params.id as string

  const [project, setProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  useEffect(() => {
    if (session && projectId) {
      fetchProject()
    }
  }, [session, projectId])

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

  const saveProject = useCallback(async () => {
    if (!project) return

    setSaving(true)
    try {
      // For now, just save the project name - we'll add animation data later
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: project.name,
          animations: [],
        }),
      })

      if (res.ok) {
        setLastSaved(new Date())
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

  // Auto-save every 2 minutes
  useEffect(() => {
    if (project) {
      autoSaveTimerRef.current = setInterval(() => {
        saveProject()
      }, 120000)
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current)
      }
    }
  }, [project, saveProject])

  // Keyboard shortcut for save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveProject()
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
    toast.innerHTML = `
      <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span>${message}</span>
    `
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

  return (
    <div className="min-h-screen bg-[#0f1117] text-[#f4f4f5]">
      {/* Top Bar */}
      <div className="fixed top-0 left-0 right-0 h-[52px] bg-[#151821] border-b border-[#252b3d] z-[1000] flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 text-[#a1a1aa] hover:text-[#f4f4f5] transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
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

        <div className="flex-1 flex justify-center">
          <span className="text-sm font-medium">{project?.name || 'Untitled Project'}</span>
        </div>

        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-xs text-[#71717a]">
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={saveProject}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-[#22c55e] text-[#09090b] rounded-lg text-sm font-semibold hover:bg-[#4ade80] transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-[#09090b]/30 border-t-[#09090b] rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Save
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="pt-[52px]">
        <ThreeEditor 
          projectName={project?.name || 'Untitled'} 
          onSave={saveProject}
          saving={saving}
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

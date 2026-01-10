'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import Link from 'next/link'

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
  const [editorReady, setEditorReady] = useState(false)
  const editorRef = useRef<any>(null)
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
    if (!editorRef.current || !project) return

    setSaving(true)
    try {
      const editorData = editorRef.current.getProjectData?.() || {}
      
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: project.name,
          animations: editorData.animations || [],
          modelData: editorData.modelData,
          modelName: editorData.modelName,
          thumbnail: editorData.thumbnail,
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
    toast.className = `toast ${type}`
    toast.innerHTML = `
      <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
      <span class="toast-message">${message}</span>
    `
    container.appendChild(toast)

    setTimeout(() => {
      toast.classList.add('removing')
      setTimeout(() => toast.remove(), 300)
    }, 3000)
  }

  // Load editor script dynamically
  useEffect(() => {
    if (project && !loading && typeof window !== 'undefined' && !editorReady) {
      // Load editor module with cache busting
      const script = document.createElement('script')
      script.type = 'module'
      script.src = `/js/editor-module.js?v=${Date.now()}`
      script.onload = () => {
        setEditorReady(true)
      }
      script.onerror = (e) => {
        console.error('Failed to load editor:', e)
      }
      document.body.appendChild(script)
    }
  }, [project, loading, editorReady])

  // Initialize editor when script is loaded
  useEffect(() => {
    if (editorReady && project) {
      const initEditor = () => {
        if ((window as any).GLBAnimationEditor) {
          const editor = new (window as any).GLBAnimationEditor()
          editorRef.current = editor

          if (project.modelData || project.animations?.length > 0) {
            editor.loadProjectData?.(project)
          }

          (window as any).saveProjectToCloud = saveProject
        } else {
          setTimeout(initEditor, 100)
        }
      }

      initEditor()
    }
  }, [editorReady, project, saveProject])

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="text-center">
          <div className="spinner w-8 h-8 mx-auto mb-4" />
          <p className="text-dark-500">Loading editor...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Editor Styles */}
      <link rel="stylesheet" href="/css/editor.css" />
      
      {/* Top Bar Override for Project Info */}
      <div className="fixed top-0 left-0 right-0 h-[52px] bg-[#151821] border-b border-[#252b3d] z-[1000] flex items-center justify-between px-4">
        <div className="flex items-center gap-4">
          <Link 
            href="/dashboard" 
            className="flex items-center gap-2 text-dark-400 hover:text-dark-200 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            <span className="text-sm">Dashboard</span>
          </Link>
          <div className="w-px h-6 bg-dark-700" />
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-frim-400" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="2"/>
              <circle cx="16" cy="11" r="2.5" fill="currentColor"/>
              <line x1="16" y1="13.5" x2="16" y2="19" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="15.5" x2="11" y2="14" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="15.5" x2="21" y2="14" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="19" x2="13" y2="24" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="19" x2="19" y2="24" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <span className="font-display text-sm font-semibold">frim</span>
          </div>
        </div>

        <div className="flex-1 flex justify-center">
          <span className="text-sm font-medium">{project?.name || 'Untitled Project'}</span>
        </div>

        <div className="flex items-center gap-3">
          {lastSaved && (
            <span className="text-xs text-dark-500">
              Saved {lastSaved.toLocaleTimeString()}
            </span>
          )}
          <button
            onClick={saveProject}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-frim-500 text-dark-950 rounded-lg text-sm font-semibold hover:bg-frim-400 transition-colors disabled:opacity-50"
          >
            {saving ? (
              <>
                <span className="w-4 h-4 border-2 border-dark-950/30 border-t-dark-950 rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Save to Cloud
              </>
            )}
          </button>
        </div>
      </div>

      {/* Editor Container */}
      <div id="editor-container" className="pt-[52px]">
        <div id="welcome-screen" className="screen" style={{ display: 'none' }} />
        <div id="editor-screen" className="screen active">
          <canvas id="editor-canvas"></canvas>
        </div>
      </div>

      <div id="toast-container" className="fixed bottom-[180px] right-5 flex flex-col-reverse gap-3 z-[1001]" />
    </>
  )
}

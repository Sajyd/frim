'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

interface Project {
  id: string
  name: string
  description?: string
  thumbnail?: string
  modelName?: string
  createdAt: string
  updatedAt: string
}

export default function Dashboard() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    }>
      <DashboardContent />
    </Suspense>
  )
}

function DashboardContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  useEffect(() => {
    if (session) {
      fetchProjects()
    }
  }, [session])

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects')
      if (res.ok) {
        const data = await res.json()
        setProjects(data)
      }
    } catch (error) {
      console.error('Failed to fetch projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const createProject = async () => {
    if (!newProjectName.trim()) return

    setCreating(true)

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjectName.trim(),
          animations: [],
        }),
      })

      if (res.ok) {
        const project = await res.json()
        router.push(`/editor/${project.id}`)
      }
    } catch (error) {
      console.error('Failed to create project:', error)
    } finally {
      setCreating(false)
      setShowNewModal(false)
      setNewProjectName('')
    }
  }

  const deleteProject = async (id: string) => {
    if (!confirm('Are you sure you want to delete this project?')) return
    setDeletingId(id)

    try {
      const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setProjects(projects.filter(p => p.id !== id))
      }
    } catch (error) {
      console.error('Failed to delete project:', error)
    } finally {
      setDeletingId(null)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Header */}
      <header className="border-b border-dark-800 bg-dark-900/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <svg className="w-8 h-8 text-frim-400" viewBox="0 0 32 32" fill="none">
              <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2"/>
              <circle cx="16" cy="10" r="3" fill="currentColor"/>
              <line x1="16" y1="13" x2="16" y2="20" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="16" x2="10" y2="14" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="16" x2="22" y2="14" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="20" x2="12" y2="26" stroke="currentColor" strokeWidth="2"/>
              <line x1="16" y1="20" x2="20" y2="26" stroke="currentColor" strokeWidth="2"/>
            </svg>
            <span className="font-display text-xl font-semibold">frim</span>
          </Link>

          <div className="flex items-center gap-4">
            <a
              href="https://discord.gg/YKfmSqZ5e8"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-2 text-sm text-dark-400 hover:text-[#5865F2] transition-colors"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
              </svg>
              Discord
            </a>
            <span className="hidden sm:flex items-center gap-2 text-sm text-frim-400 bg-frim-500/10 px-3 py-1.5 rounded-full">
              <span className="w-2 h-2 bg-frim-400 rounded-full" />
              All Features Free
            </span>
            <button
              onClick={() => setShowNewModal(true)}
              className="btn-primary text-sm py-2 flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Project
            </button>
            
            <div className="flex items-center gap-3">
              {session?.user?.image && (
                <Image
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  width={36}
                  height={36}
                  className="rounded-full"
                />
              )}
              <div className="hidden sm:block">
                <p className="text-sm font-medium">{session?.user?.name || session?.user?.email}</p>
                <p className="text-xs text-frim-400">Free plan (unlimited)</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-dark-400 hover:text-dark-200 p-2 rounded-lg hover:bg-dark-800 transition-colors"
                title="Sign out"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold mb-2">Your Projects</h1>
          <p className="text-dark-500">Create unlimited animation projects — all features are free!</p>
        </div>

        {projects.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-dark-800 rounded-2xl flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
            <p className="text-dark-500 mb-6">Create your first animation project to get started</p>
            <button
              onClick={() => setShowNewModal(true)}
              className="btn-primary flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Project
            </button>
          </div>
        ) : (
          /* Projects Grid */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {/* New Project Card */}
            <button
              onClick={() => setShowNewModal(true)}
              className="bg-dark-900/50 border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center min-h-[200px] transition-all group border-dark-700 hover:border-frim-500 hover:bg-dark-800/50"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors bg-dark-800 group-hover:bg-frim-500/20">
                <svg className="w-6 h-6 text-dark-400 group-hover:text-frim-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <span className="text-dark-400 group-hover:text-dark-200">New Project</span>
            </button>

            {/* Project Cards */}
            {projects.map((project) => (
              <div
                key={project.id}
                className="bg-dark-900 border border-dark-800 rounded-xl overflow-hidden card-hover group"
              >
                {/* Thumbnail */}
                <Link href={`/editor/${project.id}`} className="block">
                  <div className="aspect-video bg-dark-800 relative overflow-hidden">
                    {project.thumbnail ? (
                      <img
                        src={project.thumbnail}
                        alt={project.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <svg className="w-12 h-12 text-dark-600" viewBox="0 0 32 32" fill="none">
                          <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2"/>
                          <circle cx="16" cy="10" r="3" fill="currentColor"/>
                          <line x1="16" y1="13" x2="16" y2="20" stroke="currentColor" strokeWidth="2"/>
                          <line x1="16" y1="16" x2="10" y2="14" stroke="currentColor" strokeWidth="2"/>
                          <line x1="16" y1="16" x2="22" y2="14" stroke="currentColor" strokeWidth="2"/>
                          <line x1="16" y1="20" x2="12" y2="26" stroke="currentColor" strokeWidth="2"/>
                          <line x1="16" y1="20" x2="20" y2="26" stroke="currentColor" strokeWidth="2"/>
                        </svg>
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-dark-900/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute bottom-3 left-3 right-3 flex justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="bg-frim-500 text-dark-950 px-4 py-1.5 rounded-lg text-sm font-semibold">
                        Open Editor
                      </span>
                    </div>
                  </div>
                </Link>

                {/* Info */}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">{project.name}</h3>
                      {project.modelName && (
                        <p className="text-xs text-dark-500 truncate mt-1 font-mono">
                          {project.modelName}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteProject(project.id)}
                      disabled={deletingId === project.id}
                      className="p-2 text-dark-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                      title="Delete project"
                    >
                      {deletingId === project.id ? (
                        <span className="spinner w-4 h-4" />
                      ) : (
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-dark-600 mt-3">
                    Updated {new Date(project.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-2xl w-full max-w-md p-6">
            <h2 className="font-display text-xl font-semibold mb-4">Create New Project</h2>
            <div className="mb-6">
              <label className="block text-sm text-dark-400 mb-2">Project Name</label>
              <input
                type="text"
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                className="w-full bg-dark-950 border border-dark-700 rounded-lg px-4 py-3 text-dark-100 placeholder-dark-600 focus:border-frim-500 transition-colors"
                placeholder="My Animation Project"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && createProject()}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowNewModal(false)
                  setNewProjectName('')
                }}
                className="btn-secondary py-2"
              >
                Cancel
              </button>
              <button
                onClick={createProject}
                disabled={creating || !newProjectName.trim()}
                className="btn-primary py-2 flex items-center gap-2 disabled:opacity-50"
              >
                {creating ? <span className="spinner" /> : null}
                {creating ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-dark-800 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-dark-500">
              <svg className="w-6 h-6" viewBox="0 0 32 32" fill="none">
                <circle cx="16" cy="16" r="14" stroke="currentColor" strokeWidth="2"/>
                <circle cx="16" cy="10" r="3" fill="currentColor"/>
                <line x1="16" y1="13" x2="16" y2="20" stroke="currentColor" strokeWidth="2"/>
                <line x1="16" y1="16" x2="10" y2="14" stroke="currentColor" strokeWidth="2"/>
                <line x1="16" y1="16" x2="22" y2="14" stroke="currentColor" strokeWidth="2"/>
                <line x1="16" y1="20" x2="12" y2="26" stroke="currentColor" strokeWidth="2"/>
                <line x1="16" y1="20" x2="20" y2="26" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <span className="text-sm">© 2026 Frim — 100% Free</span>
            </div>
            <div className="flex items-center gap-6">
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
          </div>
        </div>
      </footer>
    </div>
  )
}

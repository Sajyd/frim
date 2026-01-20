'use client'

import { useEffect, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
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

interface Subscription {
  plan: string
  planDetails: {
    name: string
    limits: { projects: number }
  }
  currentPeriodEnd: string | null
  usage: {
    projects: number
    projectLimit: number | 'unlimited'
    canCreateProject: boolean
  }
}

export default function Dashboard() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [showSuccessToast, setShowSuccessToast] = useState(false)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      setShowSuccessToast(true)
      setTimeout(() => setShowSuccessToast(false), 5000)
      // Clean URL
      window.history.replaceState({}, '', '/dashboard')
    }
  }, [searchParams])

  useEffect(() => {
    if (session) {
      fetchProjects()
      fetchSubscription()
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

  const createProject = async () => {
    if (!newProjectName.trim()) return
    
    // Check if user can create projects
    if (subscription && !subscription.usage.canCreateProject) {
      setShowNewModal(false)
      setShowUpgradeModal(true)
      return
    }

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

      if (res.status === 403) {
        setShowNewModal(false)
        setShowUpgradeModal(true)
        return
      }

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
        // Refresh subscription to update usage
        fetchSubscription()
      }
    } catch (error) {
      console.error('Failed to delete project:', error)
    } finally {
      setDeletingId(null)
    }
  }

  const handleNewProjectClick = () => {
    if (subscription && !subscription.usage.canCreateProject) {
      setShowUpgradeModal(true)
    } else {
      setShowNewModal(true)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  const isPro = subscription?.plan === 'pro'

  return (
    <div className="min-h-screen bg-dark-950">
      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-frim-500/10 border border-frim-500/30 text-frim-400 px-6 py-3 rounded-xl z-50 animate-slide-down flex items-center gap-3">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Welcome to Pro! Your subscription is now active.
        </div>
      )}

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
            {!isPro && (
              <Link
                href="/pricing"
                className="hidden sm:flex items-center gap-2 text-sm text-frim-400 hover:text-frim-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Upgrade to Pro
              </Link>
            )}
            <button
              onClick={handleNewProjectClick}
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
                <p className="text-xs text-dark-500 flex items-center gap-1">
                  {isPro ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-frim-400" />
                      Pro
                    </>
                  ) : (
                    'Free plan'
                  )}
                </p>
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
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold mb-2">Your Projects</h1>
            <p className="text-dark-500">Create and manage your animation projects</p>
          </div>
          
          {/* Usage indicator */}
          {subscription && (
            <div className="bg-dark-900 border border-dark-800 rounded-xl px-4 py-3">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-xs text-dark-500 mb-1">Projects</p>
                  <p className="font-mono text-sm">
                    <span className="text-frim-400">{subscription.usage.projects}</span>
                    <span className="text-dark-600"> / </span>
                    <span className="text-dark-400">
                      {subscription.usage.projectLimit === 'unlimited' ? '∞' : subscription.usage.projectLimit}
                    </span>
                  </p>
                </div>
                {!isPro && subscription.usage.projects >= 2 && (
                  <Link
                    href="/pricing"
                    className="text-xs bg-frim-500/10 text-frim-400 px-3 py-1.5 rounded-lg hover:bg-frim-500/20 transition-colors"
                  >
                    Need more?
                  </Link>
                )}
              </div>
            </div>
          )}
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
              onClick={handleNewProjectClick}
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
              onClick={handleNewProjectClick}
              className={`bg-dark-900/50 border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center min-h-[200px] transition-all group ${
                subscription && !subscription.usage.canCreateProject
                  ? 'border-dark-800 opacity-60 cursor-not-allowed'
                  : 'border-dark-700 hover:border-frim-500 hover:bg-dark-800/50'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-colors ${
                subscription && !subscription.usage.canCreateProject
                  ? 'bg-dark-800'
                  : 'bg-dark-800 group-hover:bg-frim-500/20'
              }`}>
                {subscription && !subscription.usage.canCreateProject ? (
                  <svg className="w-6 h-6 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-dark-400 group-hover:text-frim-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
              </div>
              <span className={subscription && !subscription.usage.canCreateProject ? 'text-dark-600' : 'text-dark-400 group-hover:text-dark-200'}>
                {subscription && !subscription.usage.canCreateProject ? 'Upgrade to add more' : 'New Project'}
              </span>
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

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-2xl w-full max-w-md p-6 text-center">
            <div className="w-16 h-16 bg-frim-500/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-frim-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h2 className="font-display text-xl font-semibold mb-2">Project Limit Reached</h2>
            <p className="text-dark-400 mb-6">
              You've reached the limit of {subscription?.usage.projectLimit} projects on the Free plan.
              Upgrade to Pro for unlimited projects.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href="/pricing"
                className="btn-primary py-3 flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Upgrade to Pro - $12/month
              </Link>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="btn-secondary py-2"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}

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

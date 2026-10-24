'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { startPlanCheckout, buyGpuCredits } from '@/lib/checkout'
import Celebration, { type CelebrationKind } from '@/components/Celebration'
import GpuUsageMeter from '@/components/GpuUsageMeter'
import StudioUpgradeModal from '@/components/StudioUpgradeModal'
import { DISCORD_URL, DiscordIcon, FrimLogo, SUPPORT_EMAIL, SiteFooter } from '@/components/chrome'

interface Project {
  id: string
  name: string
  description?: string
  thumbnail?: string
  modelName?: string
  createdAt: string
  updatedAt: string
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.round(diff / 60000)
  if (!Number.isFinite(mins) || mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 14) return `${days}d ago`
  return new Date(iso).toLocaleDateString()
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
    gpuCapturesUsed?: number
    gpuCapturesBonus?: number
    gpuCapturesIncluded?: number
    gpuCapturesLimit?: number
    gpuCapturesRemaining?: number
  }
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
  const [showSubscriptionModal, setShowSubscriptionModal] = useState(false)
  const [cancelingSubscription, setCancelingSubscription] = useState(false)
  const [celebration, setCelebration] = useState<CelebrationKind>(null)
  const [celebrationCredits, setCelebrationCredits] = useState(0)
  const [upgradingStudio, setUpgradingStudio] = useState(false)
  const [showStudioModal, setShowStudioModal] = useState(false)
  const [studioError, setStudioError] = useState<string | null>(null)
  const [buyingCredits, setBuyingCredits] = useState(false)
  const [creditQty, setCreditQty] = useState(5)
  const [query, setQuery] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/signin')
    }
  }, [status, router])

  useEffect(() => {
    if (!menuOpen) return
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!showNewModal && !showUpgradeModal && !projectToDelete && !showSubscriptionModal) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || cancelingSubscription) return
      setShowNewModal(false)
      setShowUpgradeModal(false)
      setProjectToDelete(null)
      setShowSubscriptionModal(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showNewModal, showUpgradeModal, projectToDelete, showSubscriptionModal, cancelingSubscription])

  useEffect(() => {
    const upgraded = searchParams.get('upgraded') || (searchParams.get('success') === 'true' ? 'pro' : null)
    const credits = searchParams.get('credits')
    if (upgraded === 'studio' || upgraded === 'pro') {
      setCelebration(upgraded)
    } else if (searchParams.get('success') === 'true') {
      setShowSuccessToast(true)
      setTimeout(() => setShowSuccessToast(false), 5000)
    }
    if (credits) {
      const n = Math.max(1, parseInt(credits, 10) || 1)
      setCelebrationCredits(n)
      setCelebration('credits')
    }
    if (upgraded || credits || searchParams.get('success') === 'true') {
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
    setProjectToDelete(null)
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

  const requestStudioUpgrade = () => {
    setStudioError(null)
    setShowStudioModal(true)
  }

  const confirmStudioUpgrade = async () => {
    setUpgradingStudio(true)
    setStudioError(null)
    try {
      const result = await startPlanCheckout('studio', '/dashboard')
      if ('error' in result) {
        setStudioError(result.error)
        return
      }
      if ('upgraded' in result && result.upgraded) {
        setShowStudioModal(false)
        setShowSubscriptionModal(false)
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

  const handleBuyCredits = async (quantity = creditQty) => {
    setBuyingCredits(true)
    try {
      const result = await buyGpuCredits(quantity, '/dashboard')
      if ('error' in result) throw new Error(result.error)
    } catch (error) {
      console.error('Credit purchase error:', error)
      alert('Failed to start payment. Please try again.')
    } finally {
      setBuyingCredits(false)
    }
  }

  const handleManageSubscription = async () => {
    setCancelingSubscription(true)
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        throw new Error(data.error || 'Failed to open billing portal')
      }
    } catch (error) {
      console.error('Portal error:', error)
      alert('Failed to open billing portal. Please try again.')
    } finally {
      setCancelingSubscription(false)
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-dark-950 flex items-center justify-center">
        <div className="spinner w-8 h-8" />
      </div>
    )
  }

  const isPaid = subscription?.plan === 'pro' || subscription?.plan === 'studio'
  const isStudio = subscription?.plan === 'studio'
  const planLabel = isStudio ? 'Studio' : isPaid ? 'Pro' : 'Free plan'
  const firstName = session?.user?.name?.split(' ')[0]
  const needle = query.trim().toLowerCase()
  const visibleProjects = [...projects]
    .filter((project) => {
      if (!needle) return true
      return project.name.toLowerCase().includes(needle) || (project.modelName || '').toLowerCase().includes(needle)
    })
    .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
  const initials = (session?.user?.name || session?.user?.email || '?')
    .replace(/@.*/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?'

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col">
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
      {/* Success Toast */}
      {showSuccessToast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-frim-500/10 border border-frim-500/30 text-frim-400 px-6 py-3 rounded-xl z-50 animate-slide-down flex items-center gap-3">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Welcome! Your subscription is now active.
        </div>
      )}

      {/* Header */}
      <header className="border-b border-white/[0.06] bg-dark-950/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
            <FrimLogo className="w-8 h-8 text-frim-400" />
            <span className="font-display text-xl font-semibold tracking-tight">frim</span>
          </Link>

          <div className="flex items-center gap-2 sm:gap-3">
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-2 text-sm text-dark-400 hover:text-[#5865F2] transition-colors px-2 py-1.5 rounded-lg"
            >
              <DiscordIcon className="w-4 h-4" />
              Discord
            </a>
            {!isPaid && (
              <Link
                href="/pricing"
                className="hidden sm:flex items-center gap-2 text-sm text-frim-400 hover:text-frim-300 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Upgrade
              </Link>
            )}
            {subscription?.plan === 'pro' && (
              <button
                onClick={requestStudioUpgrade}
                className="hidden sm:flex items-center gap-2 text-sm text-frim-400 hover:text-frim-300 transition-colors"
              >
                Upgrade to Studio
              </button>
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
            
            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                className="flex items-center gap-2 rounded-full p-0.5 hover:bg-white/5"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-label="Account menu"
              >
                {session?.user?.image ? (
                  <Image
                    src={session.user.image}
                    alt=""
                    width={36}
                    height={36}
                    className="rounded-full"
                  />
                ) : (
                  <span className="w-9 h-9 rounded-full bg-frim-500/15 text-frim-300 text-xs font-semibold inline-flex items-center justify-center">
                    {initials}
                  </span>
                )}
              </button>
              {menuOpen && (
                <div role="menu" className="modal-pop absolute right-0 mt-2 w-64 rounded-xl border border-white/10 bg-dark-900 shadow-2xl shadow-black/40 p-2 z-50">
                  <div className="px-3 py-2">
                    <p className="text-sm font-medium truncate">{session?.user?.name || 'Account'}</p>
                    <p className="text-xs text-dark-400 truncate">{session?.user?.email}</p>
                    <p className="text-xs text-frim-400 mt-1">{planLabel}</p>
                  </div>
                  <div className="my-1 h-px bg-white/5" />
                  <Link href="/pricing" role="menuitem" className="block px-3 py-2 text-sm rounded-lg text-dark-200 hover:bg-white/5" onClick={() => setMenuOpen(false)}>
                    {isPaid ? 'Plans' : 'Upgrade'}
                  </Link>
                  {subscription?.plan === 'pro' && (
                    <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); requestStudioUpgrade() }} className="w-full text-left px-3 py-2 text-sm rounded-lg text-dark-200 hover:bg-white/5">
                      Upgrade to Studio
                    </button>
                  )}
                  <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" role="menuitem" className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-dark-200 hover:bg-white/5">
                    <DiscordIcon className="w-4 h-4" /> Discord
                  </a>
                  <button type="button" role="menuitem" onClick={() => signOut({ callbackUrl: '/' })} className="w-full text-left px-3 py-2 text-sm rounded-lg text-dark-200 hover:bg-white/5">
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main" className="max-w-7xl mx-auto px-4 sm:px-6 py-10 flex-1 w-full">
        <div className="mb-8 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-bold mb-2">Projects</h1>
            <p className="text-dark-300">
              {firstName ? `${firstName}, pick up a project or start a new one.` : 'Create and manage your animation projects.'}
            </p>
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
                {isStudio && (
                  <div className="min-w-[160px]">
                    <GpuUsageMeter
                      used={subscription.usage.gpuCapturesUsed ?? 0}
                      included={subscription.usage.gpuCapturesIncluded ?? 40}
                      bonus={subscription.usage.gpuCapturesBonus ?? 0}
                      remaining={subscription.usage.gpuCapturesRemaining ?? 0}
                      compact
                    />
                  </div>
                )}
                {!isPaid && subscription.usage.projects >= 2 && (
                  <Link
                    href="/pricing"
                    className="text-xs bg-frim-500/10 text-frim-400 px-3 py-1.5 rounded-lg hover:bg-frim-500/20 transition-colors"
                  >
                    Need more?
                  </Link>
                )}
                {isPaid && (
                  <button
                    onClick={() => setShowSubscriptionModal(true)}
                    className="text-xs text-dark-400 hover:text-dark-200 px-3 py-1.5 rounded-lg hover:bg-dark-800 transition-colors"
                  >
                    Manage →
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {projects.length > 0 && (
          <label className="relative block mb-6 max-w-md">
            <span className="sr-only">Search projects</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              className="w-full bg-dark-900 border border-white/[0.06] rounded-xl pl-4 pr-10 py-2.5 text-sm text-dark-100 placeholder-dark-500"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-dark-400 hover:text-dark-100 px-2 py-1"
              >
                Clear
              </button>
            )}
          </label>
        )}

        {projects.length === 0 ? (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 bg-dark-800 rounded-2xl flex items-center justify-center mb-6">
              <svg className="w-10 h-10 text-dark-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h2 className="text-xl font-semibold mb-2">No projects yet</h2>
            <p className="text-dark-300 mb-6 max-w-sm">Create a project, load a GLB, and the editor opens with a timeline ready for the first keyframe.</p>
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
            {visibleProjects.length === 0 && (
              <div className="sm:col-span-2 lg:col-span-3 xl:col-span-3 bg-dark-900 border border-white/[0.06] rounded-xl p-8 text-center">
                <p className="font-medium mb-1">No projects match “{query.trim()}”</p>
                <button type="button" onClick={() => setQuery('')} className="text-sm text-frim-400 hover:text-frim-300">
                  Clear search
                </button>
              </div>
            )}
            {visibleProjects.map((project) => (
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
                      onClick={() => setProjectToDelete(project)}
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
                  <p className="text-xs text-dark-500 mt-3" title={new Date(project.updatedAt).toLocaleString()}>
                    Updated {timeAgo(project.updatedAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* New Project Modal */}
      {showNewModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) { setShowNewModal(false); setNewProjectName('') } }}>
          <div role="dialog" aria-modal="true" aria-labelledby="new-project-title" className="modal-pop bg-dark-900 border border-white/10 rounded-2xl w-full max-w-md p-6">
            <h2 id="new-project-title" className="font-display text-xl font-semibold mb-1">New project</h2>
            <p className="text-sm text-dark-400 mb-4">Use a name you will recognize in the list.</p>
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
                View plans
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

      {/* Subscription Management Modal */}
      {showSubscriptionModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-dark-900 border border-dark-800 rounded-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="font-display text-xl font-semibold">Subscription</h2>
              <button
                onClick={() => setShowSubscriptionModal(false)}
                className="p-2 text-dark-400 hover:text-dark-200 hover:bg-dark-800 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <div className="bg-dark-950 border border-dark-800 rounded-xl p-4 mb-6">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 bg-frim-500/20 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-frim-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="font-semibold text-frim-400">{isStudio ? 'Studio Plan' : 'Pro Plan'}</p>
                  <p className="text-sm text-dark-500">{isStudio ? '$39/month' : '$12/month'}</p>
                </div>
              </div>
              {subscription?.currentPeriodEnd && (
                <p className="text-sm text-dark-400">
                  Next billing: {new Date(subscription.currentPeriodEnd).toLocaleDateString('en-US', { 
                    month: 'long', 
                    day: 'numeric', 
                    year: 'numeric' 
                  })}
                </p>
              )}
              {isStudio && (
                <div className="mt-4">
                  <GpuUsageMeter
                    used={subscription?.usage.gpuCapturesUsed ?? 0}
                    included={subscription?.usage.gpuCapturesIncluded ?? 40}
                    bonus={subscription?.usage.gpuCapturesBonus ?? 0}
                    remaining={subscription?.usage.gpuCapturesRemaining ?? 0}
                  />
                </div>
              )}
            </div>

            {subscription?.plan === 'pro' && (
              <button
                onClick={requestStudioUpgrade}
                className="w-full mb-3 btn-primary py-3 flex items-center justify-center gap-2"
              >
                Upgrade to Studio — $39/mo
              </button>
            )}

            {isStudio && (
              <div className="bg-dark-950 border border-dark-800 rounded-xl p-4 mb-3">
                <p className="text-sm font-medium mb-2">Buy extra captures · $1 each</p>
                <div className="flex items-center gap-2 mb-3">
                  {[1, 5, 10, 20].map((n) => (
                    <button
                      key={n}
                      onClick={() => setCreditQty(n)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium ${
                        creditQty === n
                          ? 'bg-frim-500/20 text-frim-400 border border-frim-500/40'
                          : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => handleBuyCredits(creditQty)}
                  disabled={buyingCredits}
                  className="w-full py-2.5 bg-frim-500 text-dark-950 rounded-xl font-semibold hover:bg-frim-400 transition-colors disabled:opacity-50"
                >
                  {buyingCredits ? 'Redirecting…' : `Pay $${creditQty} for ${creditQty} capture${creditQty === 1 ? '' : 's'}`}
                </button>
              </div>
            )}

            <div className="space-y-3">
              <button
                onClick={handleManageSubscription}
                disabled={cancelingSubscription}
                className="w-full bg-dark-800 hover:bg-dark-700 text-dark-200 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                {cancelingSubscription ? (
                  <>
                    <span className="spinner w-4 h-4" />
                    Loading...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Manage Billing & Cancel
                  </>
                )}
              </button>
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="w-full bg-dark-950 hover:bg-dark-800 border border-dark-700 text-dark-300 py-3 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Contact Support
              </a>
            </div>
          </div>
        </div>
      )}

      {projectToDelete && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget && deletingId !== projectToDelete.id) setProjectToDelete(null) }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="delete-project-title" className="modal-pop bg-dark-900 border border-white/10 rounded-2xl w-full max-w-md p-6">
            <h2 id="delete-project-title" className="font-display text-xl font-semibold mb-2">Delete this project?</h2>
            <p className="text-sm text-dark-300 mb-6">
              <span className="text-dark-100 font-medium">{projectToDelete.name}</span> and its saved animations will be removed. This cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button type="button" onClick={() => setProjectToDelete(null)} className="btn-secondary py-2" disabled={deletingId === projectToDelete.id}>
                Keep it
              </button>
              <button
                type="button"
                onClick={() => deleteProject(projectToDelete.id)}
                disabled={deletingId === projectToDelete.id}
                className="inline-flex items-center justify-center gap-2 bg-red-500 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-red-400 disabled:opacity-50"
              >
                {deletingId === projectToDelete.id ? 'Deleting...' : 'Delete project'}
              </button>
            </div>
          </div>
        </div>
      )}

      <SiteFooter />

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

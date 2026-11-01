'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { FrimLogo } from '@/components/chrome'

type Overview = {
  generatedAt: string
  usersTruncated: boolean
  totals: {
    users: number
    users7d: number
    users30d: number
    active7d: number
    projects: number
    projects7d: number
    jobs: number
    jobs7d: number
    jobs30d: number
    complete: number
    failed: number
    cancelled: number
    inflight: number
    successRate: number
    awsUsd: number
    awsUsd30d: number
    gpuMinutes: number
    creditsUsd: number
    creditPacks: number
    listedMrr: number
  }
  plans: { plan: string; count: number; price: number }[]
  models: {
    model: string
    kind: 'video' | 't2m'
    jobs: number
    complete: number
    failed: number
    minutes: number
    awsUsd: number
  }[]
  days: { date: string; signups: number; jobs: number; complete: number; failed: number; awsUsd: number }[]
  users: {
    id: string
    name: string | null
    email: string | null
    plan: string
    createdAt: string
    projects: number
    gpuUsed: number
    gpuBonus: number
    jobs: number
    awsUsd: number
    gpuMinutes: number
    lastActive: string
  }[]
  jobs: {
    id: string
    createdAt: string
    completedAt: string | null
    userId: string
    email: string | null
    name: string | null
    kind: 'video' | 't2m'
    model: string
    device: string | null
    status: string
    durationMs: number | null
    billedUsd: number | null
    prompt: string | null
    error: string | null
    quotaCharged: boolean
  }[]
}

function usd(value: number | null | undefined) {
  const amount = value || 0
  if (amount > 0 && amount < 0.01) return `$${amount.toFixed(4)}`
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`
}

function minutes(value: number) {
  if (value < 1) return `${Math.round(value * 60)}s`
  if (value < 60) return `${value.toFixed(1)} min`
  const hours = Math.floor(value / 60)
  return `${hours}h ${Math.round(value % 60)}m`
}

function duration(ms: number | null) {
  if (!ms || ms < 0) return '—'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

function when(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function dayLabel(isoDate: string) {
  const [year, month, day] = isoDate.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function statusClass(status: string) {
  if (status === 'complete') return 'text-frim-300 bg-frim-500/10'
  if (status === 'failed') return 'text-red-300 bg-red-500/10'
  if (status === 'cancelled') return 'text-dark-300 bg-white/5'
  return 'text-amber-200 bg-amber-400/10'
}

export default function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<'all' | 'video' | 't2m'>('all')
  const [status, setStatus] = useState('all')

  async function load() {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/overview', { cache: 'no-store' })
      if (response.status === 401) {
        window.location.href = '/auth/signin?callbackUrl=/admin'
        return
      }
      if (!response.ok) throw new Error('Could not load admin data')
      setData(await response.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load admin data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const needle = query.trim().toLowerCase()
  const users = useMemo(() => {
    if (!data) return []
    if (!needle) return data.users
    return data.users.filter((user) =>
      `${user.name || ''} ${user.email || ''} ${user.plan}`.toLowerCase().includes(needle),
    )
  }, [data, needle])

  const jobs = useMemo(() => {
    if (!data) return []
    return data.jobs.filter((job) => {
      if (kind !== 'all' && job.kind !== kind) return false
      if (status !== 'all' && job.status !== status) return false
      if (!needle) return true
      return `${job.name || ''} ${job.email || ''} ${job.model} ${job.prompt || ''} ${job.error || ''}`
        .toLowerCase()
        .includes(needle)
    })
  }, [data, kind, needle, status])

  const totals = data?.totals
  const maxJobs = Math.max(1, ...(data?.days.map((day) => day.jobs) || [1]))
  const maxSignups = Math.max(1, ...(data?.days.map((day) => day.signups) || [1]))

  return (
    <div className="min-h-screen bg-dark-950 text-dark-100">
      <header className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/dashboard" className="flex items-center gap-2 text-frim-400">
            <FrimLogo className="w-7 h-7" />
            <span className="font-display font-semibold text-dark-100">Frim</span>
            <span className="text-xs uppercase tracking-wider text-dark-400 border border-white/10 rounded-full px-2 py-0.5">Admin</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="text-sm text-dark-300 hover:text-white">
              Projects
            </Link>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="text-sm rounded-lg border border-white/10 px-3 py-1.5 text-dark-200 hover:bg-white/5 disabled:opacity-50"
            >
              {loading ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <main id="main" className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-bold">Usage</h1>
          <p className="text-dark-300 mt-2 max-w-3xl">
            GPU calls, the model each one ran, estimated Spot cost, and how accounts use the app.
            Fast in-browser capture stays on the device and is not a GPU job.
          </p>
        </div>

        {error && (
          <p className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </p>
        )}

        {loading && !data && (
          <div className="py-24 flex justify-center">
            <div className="spinner w-8 h-8" />
          </div>
        )}

        {totals && data && (
          <>
            <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              <Stat label="Accounts" value={String(totals.users)} detail={`${totals.users7d} new in 7 days · ${totals.users30d} in 30`} />
              <Stat label="Active in 7 days" value={String(totals.active7d)} detail="Opened a project or started a GPU job" />
              <Stat label="Projects" value={String(totals.projects)} detail={`${totals.projects7d} created in 7 days`} />
              <Stat label="GPU jobs" value={String(totals.jobs)} detail={`${totals.jobs7d} in 7 days · ${totals.inflight} in flight`} />
              <Stat label="Estimated AWS" value={usd(totals.awsUsd)} detail={`${usd(totals.awsUsd30d)} in the last 30 days`} />
              <Stat label="GPU time" value={minutes(totals.gpuMinutes)} detail={`${pct(totals.successRate)} of finished jobs succeeded`} />
              <Stat label="Listed MRR" value={usd(totals.listedMrr)} detail="Current plan prices × accounts, not collected Stripe revenue" />
              <Stat label="GPU credits" value={usd(totals.creditsUsd)} detail={`${totals.creditPacks} checkout${totals.creditPacks === 1 ? '' : 's'} at $1 per capture`} />
            </section>

            <section className="grid lg:grid-cols-2 gap-3 mb-8">
              <Bars title="GPU jobs, last 14 days" days={data.days} max={maxJobs} pick={(day) => day.jobs} format={(day) => `${day.jobs} jobs · ${usd(day.awsUsd)}`} />
              <Bars title="Signups, last 14 days" days={data.days} max={maxSignups} pick={(day) => day.signups} format={(day) => `${day.signups} accounts`} />
            </section>

            <section className="grid lg:grid-cols-5 gap-3 mb-8">
              <div className="lg:col-span-3 bg-dark-900 border border-dark-800 rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5">
                  <h2 className="font-medium">Models</h2>
                  <p className="text-xs text-dark-400 mt-1">Video jobs finished before this deploy say “Not recorded”. Text jobs are MotionGPT.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wide text-dark-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Model</th>
                        <th className="px-4 py-2 font-medium">Type</th>
                        <th className="px-4 py-2 font-medium text-right">Jobs</th>
                        <th className="px-4 py-2 font-medium text-right">Failed</th>
                        <th className="px-4 py-2 font-medium text-right">Time</th>
                        <th className="px-4 py-2 font-medium text-right">AWS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.models.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-dark-400">No GPU jobs yet.</td>
                        </tr>
                      )}
                      {data.models.map((row) => (
                        <tr key={`${row.kind}-${row.model}`} className="border-t border-white/5">
                          <td className="px-4 py-2.5">{row.model}</td>
                          <td className="px-4 py-2.5 text-dark-300">{row.kind === 't2m' ? 'Text' : 'Video'}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{row.jobs}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{row.failed}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{minutes(row.minutes)}</td>
                          <td className="px-4 py-2.5 text-right font-mono">{usd(row.awsUsd)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="lg:col-span-2 bg-dark-900 border border-dark-800 rounded-xl p-4">
                <h2 className="font-medium mb-3">Plans</h2>
                <ul className="space-y-3">
                  {data.plans.map((plan) => {
                    const share = totals.users > 0 ? plan.count / totals.users : 0
                    return (
                      <li key={plan.plan}>
                        <div className="flex justify-between text-sm mb-1">
                          <span className="capitalize">{plan.plan}</span>
                          <span className="font-mono text-dark-300">{plan.count} · {usd(plan.price)}/mo</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                          <div className="h-full bg-frim-500" style={{ width: `${Math.max(share * 100, plan.count > 0 ? 2 : 0)}%` }} />
                        </div>
                      </li>
                    )
                  })}
                </ul>
                <p className="text-xs text-dark-500 mt-4">
                  {totals.complete} complete · {totals.failed} failed · {totals.cancelled} cancelled
                </p>
              </div>
            </section>

            <section className="mb-4 flex flex-col sm:flex-row gap-3 sm:items-center">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Filter by name, email, model, or prompt"
                className="flex-1 bg-dark-900 border border-dark-800 rounded-lg px-3 py-2 text-sm outline-none focus:border-frim-500"
              />
              <div className="flex flex-wrap gap-2">
                {(['all', 'video', 't2m'] as const).map((value) => (
                  <Filter key={value} active={kind === value} onClick={() => setKind(value)}>
                    {value === 'all' ? 'All types' : value === 'video' ? 'Video' : 'Text'}
                  </Filter>
                ))}
                {['all', 'complete', 'failed', 'running', 'queued'].map((value) => (
                  <Filter key={value} active={status === value} onClick={() => setStatus(value)}>
                    {value === 'all' ? 'Any status' : value}
                  </Filter>
                ))}
              </div>
            </section>

            <section className="bg-dark-900 border border-dark-800 rounded-xl overflow-hidden mb-8">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
                <h2 className="font-medium">GPU calls</h2>
                <p className="text-xs text-dark-400">{jobs.length} shown · latest 200</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-dark-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">When</th>
                      <th className="px-4 py-2 font-medium">Account</th>
                      <th className="px-4 py-2 font-medium">Model</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium text-right">Time</th>
                      <th className="px-4 py-2 font-medium text-right">AWS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-dark-400">No matching GPU calls.</td>
                      </tr>
                    )}
                    {jobs.map((job) => (
                      <tr key={job.id} className="border-t border-white/5 align-top">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div>{when(job.createdAt)}</div>
                          <div className="text-xs text-dark-500 font-mono mt-1">{job.id.slice(0, 8)}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="truncate max-w-[220px]">{job.name || 'Account'}</div>
                          <div className="text-xs text-dark-400 truncate max-w-[220px]">{job.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div>{job.model}</div>
                          <div className="text-xs text-dark-400 mt-1">
                            {job.kind === 't2m' ? 'Text' : 'Video'}
                            {job.device ? ` · ${job.device}` : ''}
                            {job.quotaCharged ? ' · quota' : ''}
                          </div>
                          {job.prompt && <p className="text-xs text-dark-300 mt-1 max-w-xs">{job.prompt}</p>}
                          {job.error && <p className="text-xs text-red-300 mt-1 max-w-xs">{job.error}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs capitalize ${statusClass(job.status)}`}>
                            {job.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{duration(job.durationMs)}</td>
                        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">{usd(job.billedUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="bg-dark-900 border border-dark-800 rounded-xl overflow-hidden mb-8">
              <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between gap-3">
                <h2 className="font-medium">Accounts</h2>
                <p className="text-xs text-dark-400">
                  {users.length} shown{data.usersTruncated ? ' · first 400 by signup date' : ''}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-dark-500">
                    <tr>
                      <th className="px-4 py-2 font-medium">Account</th>
                      <th className="px-4 py-2 font-medium">Plan</th>
                      <th className="px-4 py-2 font-medium text-right">Projects</th>
                      <th className="px-4 py-2 font-medium text-right">GPU used</th>
                      <th className="px-4 py-2 font-medium text-right">Jobs</th>
                      <th className="px-4 py-2 font-medium text-right">AWS</th>
                      <th className="px-4 py-2 font-medium">Last active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-dark-400">No matching accounts.</td>
                      </tr>
                    )}
                    {users.map((user) => (
                      <tr key={user.id} className="border-t border-white/5">
                        <td className="px-4 py-3">
                          <div className="truncate max-w-[220px]">{user.name || 'Account'}</div>
                          <div className="text-xs text-dark-400 truncate max-w-[220px]">{user.email}</div>
                        </td>
                        <td className="px-4 py-3 capitalize">{user.plan}</td>
                        <td className="px-4 py-3 text-right font-mono">{user.projects}</td>
                        <td className="px-4 py-3 text-right font-mono">
                          {user.gpuUsed}
                          {user.gpuBonus > 0 ? <span className="text-dark-500"> +{user.gpuBonus}</span> : null}
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{user.jobs}</td>
                        <td className="px-4 py-3 text-right font-mono">{usd(user.awsUsd)}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-dark-300">{when(user.lastActive)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="text-xs text-dark-500 max-w-3xl leading-relaxed">
              AWS cost is Spot runtime times the hourly rate stored when the job finished (default $0.13).
              It is not the $1 capture charge. Listed MRR multiplies each account’s current plan price and does not include taxes, coupons, or failed payments.
              A video model is saved when the worker reports it. Until that worker is on the GPU, finished video jobs stay “Not recorded”; new text jobs are stored as MotionGPT immediately.
              Updated {when(data.generatedAt)}.
            </p>
          </>
        )}
      </main>
    </div>
  )
}

function Stat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="bg-dark-900 border border-dark-800 rounded-xl px-4 py-3">
      <p className="text-xs text-dark-500">{label}</p>
      <p className="font-display text-2xl font-semibold mt-1">{value}</p>
      <p className="text-xs text-dark-400 mt-1">{detail}</p>
    </div>
  )
}

function Bars({
  title,
  days,
  max,
  pick,
  format,
}: {
  title: string
  days: Overview['days']
  max: number
  pick: (day: Overview['days'][number]) => number
  format: (day: Overview['days'][number]) => string
}) {
  return (
    <div className="bg-dark-900 border border-dark-800 rounded-xl p-4">
      <h2 className="font-medium mb-4">{title}</h2>
      <div className="flex items-end gap-1 h-28">
        {days.map((day) => {
          const value = pick(day)
          return (
            <div key={day.date} className="flex-1 flex flex-col justify-end h-full group" title={`${dayLabel(day.date)} · ${format(day)}`}>
              <div
                className="w-full rounded-sm bg-frim-500/80 group-hover:bg-frim-400"
                style={{ height: `${value === 0 ? 0 : Math.max(6, (value / max) * 100)}%` }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex justify-between text-[11px] text-dark-500 mt-2">
        <span>{dayLabel(days[0]?.date || '')}</span>
        <span>{dayLabel(days[days.length - 1]?.date || '')}</span>
      </div>
    </div>
  )
}

function Filter({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs rounded-full px-2.5 py-1 border ${
        active ? 'border-frim-500/50 bg-frim-500/10 text-frim-200' : 'border-white/10 text-dark-300 hover:bg-white/5'
      }`}
    >
      {children}
    </button>
  )
}

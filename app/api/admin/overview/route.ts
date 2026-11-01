import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { isAdminEmail, jobKind, jobModelLabel } from '@/lib/admin'

const PLAN_PRICE: Record<string, number> = {
  free: 0,
  pro: 12,
  studio: 39,
}

export const dynamic = 'force-dynamic'

const DAY_MS = 24 * 60 * 60 * 1000
const IN_FLIGHT = new Set(['uploading', 'queued', 'waking', 'running'])

function dayKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function money(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0
}

type StatusRow = {
  status: string
  _count: { _all: number }
  _sum: { billedUsd: number | null; durationMs: number | null }
}

type ModelRow = StatusRow & { model: string | null; kind: string | null }

function blankModel() {
  return { OR: [{ model: null }, { model: '' }] }
}

function textJob() {
  return { OR: [{ s3InputKey: { startsWith: 'prompts/' } }, { kind: 't2m' }] }
}

export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true },
    })
    if (!isAdminEmail(admin?.email)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const now = Date.now()
    const since7 = new Date(now - 7 * DAY_MS)
    const since14 = new Date(now - 13 * DAY_MS)
    since14.setUTCHours(0, 0, 0, 0)
    const since30 = new Date(now - 30 * DAY_MS)

    const [
      users,
      users7d,
      users30d,
      projects,
      projects7d,
      jobs,
      jobs7d,
      jobs30d,
      statusRows,
      spend30,
      credits,
      planRows,
      labeledRows,
      unlabeledText,
      unlabeledVideo,
      recentJobs,
      recentUsers,
      spendByUser,
      projectActivity,
      signupRows,
      dayJobs,
      activeJobUsers,
      activeProjectUsers,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: since7 } } }),
      prisma.user.count({ where: { createdAt: { gte: since30 } } }),
      prisma.project.count(),
      prisma.project.count({ where: { createdAt: { gte: since7 } } }),
      prisma.gpuJob.count(),
      prisma.gpuJob.count({ where: { createdAt: { gte: since7 } } }),
      prisma.gpuJob.count({ where: { createdAt: { gte: since30 } } }),
      prisma.gpuJob.groupBy({
        by: ['status'],
        _count: { _all: true },
        _sum: { billedUsd: true, durationMs: true },
      }),
      prisma.gpuJob.aggregate({
        where: { createdAt: { gte: since30 } },
        _sum: { billedUsd: true },
      }),
      prisma.gpuCreditPurchase.aggregate({
        _sum: { quantity: true },
        _count: { _all: true },
      }),
      prisma.user.groupBy({
        by: ['plan'],
        _count: { _all: true },
      }),
      prisma.gpuJob.groupBy({
        by: ['model', 'kind', 'status'],
        where: { AND: [{ model: { not: null } }, { NOT: { model: '' } }] },
        _count: { _all: true },
        _sum: { billedUsd: true, durationMs: true },
      }),
      prisma.gpuJob.groupBy({
        by: ['status'],
        where: { AND: [blankModel(), textJob()] },
        _count: { _all: true },
        _sum: { billedUsd: true, durationMs: true },
      }),
      prisma.gpuJob.groupBy({
        by: ['status'],
        where: { AND: [blankModel(), { NOT: textJob() }] },
        _count: { _all: true },
        _sum: { billedUsd: true, durationMs: true },
      }),
      prisma.gpuJob.findMany({
        orderBy: { createdAt: 'desc' },
        take: 200,
        select: {
          id: true,
          createdAt: true,
          completedAt: true,
          status: true,
          durationMs: true,
          billedUsd: true,
          kind: true,
          model: true,
          device: true,
          prompt: true,
          error: true,
          quotaCharged: true,
          s3InputKey: true,
          user: { select: { id: true, email: true, name: true } },
        },
      }),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 400,
        select: {
          id: true,
          name: true,
          email: true,
          plan: true,
          createdAt: true,
          gpuCapturesUsed: true,
          gpuCapturesBonus: true,
          _count: { select: { projects: true, gpuJobs: true } },
        },
      }),
      prisma.gpuJob.groupBy({
        by: ['userId'],
        _sum: { billedUsd: true, durationMs: true },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.project.groupBy({
        by: ['userId'],
        _max: { updatedAt: true },
        _count: { _all: true },
      }),
      prisma.user.findMany({
        where: { createdAt: { gte: since14 } },
        select: { createdAt: true },
      }),
      prisma.gpuJob.findMany({
        where: { createdAt: { gte: since14 } },
        select: { createdAt: true, status: true, billedUsd: true },
      }),
      prisma.gpuJob.findMany({
        where: { createdAt: { gte: since7 } },
        distinct: ['userId'],
        select: { userId: true },
      }),
      prisma.project.findMany({
        where: { updatedAt: { gte: since7 } },
        distinct: ['userId'],
        select: { userId: true },
      }),
    ])

    const byStatus = new Map(statusRows.map((row) => [row.status, row._count._all]))
    const awsUsd = statusRows.reduce((sum, row) => sum + money(row._sum.billedUsd), 0)
    const gpuMinutes = statusRows.reduce((sum, row) => sum + money(row._sum.durationMs), 0) / 60000
    const complete = byStatus.get('complete') || 0
    const failed = byStatus.get('failed') || 0
    const cancelled = byStatus.get('cancelled') || 0
    const inflight = ['uploading', 'queued', 'waking', 'running'].reduce((sum, status) => sum + (byStatus.get(status) || 0), 0)
    const finished = complete + failed + cancelled

    const listedMrr = planRows.reduce((sum, row) => {
      const price = PLAN_PRICE[row.plan] ?? 0
      return sum + price * row._count._all
    }, 0)

    type ModelStat = {
      model: string
      kind: 'video' | 't2m'
      jobs: number
      complete: number
      failed: number
      minutes: number
      awsUsd: number
    }
    const models = new Map<string, ModelStat>()
    const addModel = (model: string, kind: 'video' | 't2m', row: StatusRow) => {
      const key = `${kind}:${model}`
      const current = models.get(key) || { model, kind, jobs: 0, complete: 0, failed: 0, minutes: 0, awsUsd: 0 }
      const count = row._count._all
      current.jobs += count
      current.awsUsd += money(row._sum.billedUsd)
      current.minutes += money(row._sum.durationMs) / 60000
      if (row.status === 'complete') current.complete += count
      if (row.status === 'failed') current.failed += count
      models.set(key, current)
    }

    for (const row of labeledRows as ModelRow[]) {
      const kind = row.model === 'MotionGPT' || row.kind === 't2m' ? 't2m' : 'video'
      const model = jobModelLabel({ model: row.model, kind, status: row.status })
      addModel(model, kind, row)
    }
    for (const row of unlabeledText as StatusRow[]) addModel('MotionGPT', 't2m', row)
    for (const row of unlabeledVideo as StatusRow[]) {
      const model = IN_FLIGHT.has(row.status) ? 'Pending' : 'Not recorded'
      addModel(model, 'video', row)
    }

    const days: { date: string; signups: number; jobs: number; complete: number; failed: number; awsUsd: number }[] = []
    for (let i = 0; i < 14; i++) {
      const date = new Date(since14.getTime() + i * DAY_MS)
      days.push({ date: dayKey(date), signups: 0, jobs: 0, complete: 0, failed: 0, awsUsd: 0 })
    }
    const dayIndex = new Map(days.map((day, index) => [day.date, index]))
    for (const row of signupRows) {
      const index = dayIndex.get(dayKey(row.createdAt))
      if (index != null) days[index].signups += 1
    }
    for (const row of dayJobs) {
      const index = dayIndex.get(dayKey(row.createdAt))
      if (index == null) continue
      days[index].jobs += 1
      days[index].awsUsd += money(row.billedUsd)
      if (row.status === 'complete') days[index].complete += 1
      if (row.status === 'failed') days[index].failed += 1
    }

    const spend = new Map(spendByUser.map((row) => [row.userId, row]))
    const lastProject = new Map(projectActivity.map((row) => [row.userId, row._max.updatedAt]))
    const active = new Set<string>()
    for (const row of activeJobUsers) active.add(row.userId)
    for (const row of activeProjectUsers) active.add(row.userId)

    const userRows = recentUsers
      .map((user) => {
        const jobAt = spend.get(user.id)?._max.createdAt?.getTime() || 0
        const projectAt = lastProject.get(user.id)?.getTime() || 0
        const lastActive = Math.max(jobAt, projectAt, user.createdAt.getTime())
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          plan: user.plan,
          createdAt: user.createdAt.toISOString(),
          projects: user._count.projects,
          gpuUsed: user.gpuCapturesUsed,
          gpuBonus: user.gpuCapturesBonus,
          jobs: user._count.gpuJobs,
          awsUsd: money(spend.get(user.id)?._sum.billedUsd),
          gpuMinutes: money(spend.get(user.id)?._sum.durationMs) / 60000,
          lastActive: new Date(lastActive).toISOString(),
        }
      })
      .sort((a, b) => +new Date(b.lastActive) - +new Date(a.lastActive))

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      usersTruncated: users > recentUsers.length,
      totals: {
        users,
        users7d,
        users30d,
        active7d: active.size,
        projects,
        projects7d,
        jobs,
        jobs7d,
        jobs30d,
        complete,
        failed,
        cancelled,
        inflight,
        successRate: finished > 0 ? complete / finished : 0,
        awsUsd,
        awsUsd30d: money(spend30._sum.billedUsd),
        gpuMinutes,
        creditsUsd: credits._sum.quantity || 0,
        creditPacks: credits._count._all,
        listedMrr,
      },
      plans: planRows
        .map((row) => ({
          plan: row.plan,
          count: row._count._all,
          price: PLAN_PRICE[row.plan] ?? 0,
        }))
        .sort((a, b) => b.count - a.count),
      models: [...models.values()].sort((a, b) => b.jobs - a.jobs || b.awsUsd - a.awsUsd),
      days,
      users: userRows,
      jobs: recentJobs.map((job) => ({
        id: job.id,
        createdAt: job.createdAt.toISOString(),
        completedAt: job.completedAt?.toISOString() || null,
        userId: job.user.id,
        email: job.user.email,
        name: job.user.name,
        kind: jobKind(job),
        model: jobModelLabel(job),
        device: job.device,
        status: job.status,
        durationMs: job.durationMs,
        billedUsd: job.billedUsd,
        prompt: job.prompt ? job.prompt.slice(0, 180) : null,
        error: job.error ? job.error.slice(0, 180) : null,
        quotaCharged: job.quotaCharged,
      })),
    })
  } catch (error) {
    console.error('Admin overview error:', error)
    return NextResponse.json({ error: 'Failed to load admin overview' }, { status: 500 })
  }
}

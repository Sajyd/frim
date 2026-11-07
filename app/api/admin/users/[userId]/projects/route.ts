import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { isAdminUserId } from '@/lib/admin'

export const dynamic = 'force-dynamic'

export async function GET(
  _req: Request,
  { params }: { params: { userId: string } },
) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!(await isAdminUserId(session.user.id))) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const user = await prisma.user.findUnique({
      where: { id: params.userId },
      select: {
        id: true,
        name: true,
        email: true,
        projects: {
          orderBy: { updatedAt: 'desc' },
          select: {
            id: true,
            name: true,
            description: true,
            modelName: true,
            updatedAt: true,
            createdAt: true,
          },
        },
      },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      projects: user.projects.map((project) => ({
        ...project,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Admin user projects error:', error)
    return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 })
  }
}

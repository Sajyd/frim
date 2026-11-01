import type { Metadata } from 'next'
import { getServerSession } from 'next-auth'
import { notFound, redirect } from 'next/navigation'
import { authOptions } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { isAdminEmail } from '@/lib/admin'
import AdminDashboard from './dashboard'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Admin — Frim',
  robots: { index: false, follow: false },
}

export default async function AdminPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect('/auth/signin?callbackUrl=/admin')

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { email: true },
  })
  if (!isAdminEmail(user?.email)) notFound()

  return <AdminDashboard />
}

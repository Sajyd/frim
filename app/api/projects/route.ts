import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import prisma from "@/lib/prisma"
import { PLANS, PlanType } from "@/lib/stripe"

// GET all projects for the authenticated user
export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const projects = await prisma.project.findMany({
      where: { userId: session.user.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        thumbnail: true,
        modelName: true,
        createdAt: true,
        updatedAt: true,
      }
    })

    return NextResponse.json(projects)
  } catch (error) {
    console.error("Error fetching projects:", error)
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 })
  }
}

// POST create a new project
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's plan and project count
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        plan: true,
        _count: { select: { projects: true } }
      }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check project limit
    const plan = PLANS[user.plan as PlanType] || PLANS.free
    const projectCount = user._count.projects

    if (projectCount >= plan.limits.projects) {
      return NextResponse.json(
        { 
          error: "Project limit reached",
          message: `You've reached the limit of ${plan.limits.projects} projects on the ${plan.name} plan. Please upgrade to create more projects.`
        },
        { status: 403 }
      )
    }

    const { name, description, animations, modelData, modelName, thumbnail } = await req.json()

    if (!name) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 })
    }

    const project = await prisma.project.create({
      data: {
        name,
        description,
        animations: animations || [],
        modelData,
        modelName,
        thumbnail,
        userId: session.user.id,
      }
    })

    return NextResponse.json(project)
  } catch (error) {
    console.error("Error creating project:", error)
    return NextResponse.json({ error: "Failed to create project" }, { status: 500 })
  }
}

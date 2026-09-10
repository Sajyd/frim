import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
  typescript: true,
})

const PRO_PRICE_ID = process.env.STRIPE_PRO_PRICE_ID || null
const STUDIO_PRICE_ID = process.env.STRIPE_STUDIO_PRICE_ID || 'price_1UEHdOGDZFhJlM8nhafjO2xh'

export const PLANS = {
  free: {
    name: 'Free',
    description: 'Perfect for getting started',
    price: 0,
    priceId: null as string | null,
    features: [
      'Up to 3 projects',
      'Up to 2 animations per project',
      'GLB/GLTF import & export',
      'Basic animation tools',
      'JSON & GLB export',
      'Community support',
    ],
    limits: {
      projects: 3,
      animationsPerProject: 2,
      videoAnalysis: false,
      gpuCapture: false,
      gpuCapturesPerMonth: 0,
    },
  },
  pro: {
    name: 'Pro',
    description: 'For professional animators',
    price: 12,
    priceId: PRO_PRICE_ID,
    features: [
      'Unlimited projects',
      'Unlimited animations per project',
      'GLB/GLTF import & export',
      'Advanced animation tools',
      'AI Video Motion Capture (Fast)',
      'Extract animations from videos',
      'Priority cloud saves',
      'Priority support',
    ],
    limits: {
      projects: Infinity,
      animationsPerProject: Infinity,
      videoAnalysis: true,
      gpuCapture: false,
      gpuCapturesPerMonth: 0,
    },
  },
  studio: {
    name: 'Studio',
    description: 'GPU 3D capture for production',
    price: 39,
    priceId: STUDIO_PRICE_ID,
    features: [
      'Everything in Pro',
      'Studio 3D GPU motion capture',
      'True 3D rotations on your GLB',
      '40 GPU captures per month',
      'Unlimited projects & animations',
      'Priority cloud saves',
      'Priority support',
    ],
    limits: {
      projects: Infinity,
      animationsPerProject: Infinity,
      videoAnalysis: true,
      gpuCapture: true,
      gpuCapturesPerMonth: 40,
    },
  },
} as const

export type PlanType = keyof typeof PLANS
export type PaidPlanType = 'pro' | 'studio'

export function isPaidPlan(plan: string | null | undefined): boolean {
  return plan === 'pro' || plan === 'studio'
}

export function isStudioPlan(plan: string | null | undefined): boolean {
  return plan === 'studio'
}

export function planFromPriceId(priceId: string | null | undefined): PlanType {
  if (!priceId) return 'free'
  if (priceId === STUDIO_PRICE_ID) return 'studio'
  if (PRO_PRICE_ID && priceId === PRO_PRICE_ID) return 'pro'
  return 'pro'
}

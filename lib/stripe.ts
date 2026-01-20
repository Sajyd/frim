import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-12-15.clover',
  typescript: true,
})

// ALL FEATURES ARE FREE FOR NOW
export const PLANS = {
  free: {
    name: 'Free',
    description: 'All features included - completely free!',
    price: 0,
    priceId: null,
    features: [
      'Unlimited projects',
      'Unlimited animations per project',
      'GLB/GLTF import & export',
      'Advanced animation tools',
      'AI Video Motion Capture (Coming Soon)',
      'Cloud saves',
      'JSON & GLB export',
      'Community support',
    ],
    limits: {
      projects: Infinity,
      animationsPerProject: Infinity,
      videoAnalysis: true, // Will be enabled when feature is ready
    },
  },
  pro: {
    name: 'Pro',
    description: 'Same as Free - all features unlocked!',
    price: 0,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    features: [
      'Unlimited projects',
      'Unlimited animations per project',
      'GLB/GLTF import & export',
      'Advanced animation tools',
      'AI Video Motion Capture (Coming Soon)',
      'Cloud saves',
      'JSON & GLB export',
      'Community support',
    ],
    limits: {
      projects: Infinity,
      animationsPerProject: Infinity,
      videoAnalysis: true,
    },
  },
} as const

export type PlanType = keyof typeof PLANS

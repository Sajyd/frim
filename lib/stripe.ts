import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
  typescript: true,
})

export const PLANS = {
  free: {
    name: 'Free',
    description: 'Perfect for getting started',
    price: 0,
    priceId: null,
    features: [
      'Up to 3 projects',
      'GLB/GLTF import',
      'Basic animation tools',
      'JSON export',
      'Community support',
    ],
    limits: {
      projects: 3,
    },
  },
  pro: {
    name: 'Pro',
    description: 'For professional animators',
    price: 12,
    priceId: process.env.STRIPE_PRO_PRICE_ID,
    features: [
      'Unlimited projects',
      'GLB/GLTF import & export',
      'Advanced animation tools',
      'Priority cloud saves',
      'GLB export with animations',
      'Priority support',
    ],
    limits: {
      projects: Infinity,
    },
  },
} as const

export type PlanType = keyof typeof PLANS

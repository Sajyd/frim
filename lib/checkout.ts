export type CheckoutResult =
  | { upgraded: true; planId: 'pro' | 'studio' }
  | { redirected: true }
  | { error: string }

export async function startPlanCheckout(
  planId: 'pro' | 'studio',
  returnUrl?: string,
): Promise<CheckoutResult> {
  const res = await fetch('/api/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId, returnUrl }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { error: data.error || 'Checkout failed' }
  if (data.upgraded) return { upgraded: true, planId: data.planId || planId }
  if (data.url) {
    window.location.href = data.url
    return { redirected: true }
  }
  return { error: data.error || 'Checkout failed' }
}

export async function buyGpuCredits(
  quantity: number,
  returnUrl?: string,
): Promise<CheckoutResult> {
  const res = await fetch('/api/stripe/credits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ quantity, returnUrl }),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return { error: data.error || 'Payment failed' }
  if (data.url) {
    window.location.href = data.url
    return { redirected: true }
  }
  return { error: data.error || 'Payment failed' }
}

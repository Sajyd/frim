'use client'

const STUDIO_PRICE = 39

const STUDIO_UPGRADE_BENEFITS = [
  'Everything in Pro, including Fast in-browser capture',
  'Studio 3D GPU motion capture on your GLB',
  'True 3D joint rotations, not a 2D overlay',
  '40 GPU captures included every month',
  '$1 per extra capture after that',
  'Unlimited projects and animations',
  'Priority cloud saves',
  'Priority support',
]

type StudioUpgradeModalProps = {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  loading?: boolean
  error?: string | null
  currentPlan?: string | null
}

export default function StudioUpgradeModal({
  open,
  onClose,
  onConfirm,
  loading = false,
  error = null,
  currentPlan,
}: StudioUpgradeModalProps) {
  if (!open) return null

  const fromPro = currentPlan === 'pro'

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[2200] p-4">
      <div className="bg-dark-900 border border-dark-800 rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className="text-xs font-semibold tracking-wider text-frim-400 mb-1">STUDIO</p>
            <h2 className="font-display text-2xl font-semibold">Upgrade to Studio</h2>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 text-dark-400 hover:text-dark-200 hover:bg-dark-800 rounded-lg transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex items-baseline gap-1 mb-2">
          <span className="font-display text-4xl font-bold">${STUDIO_PRICE}</span>
          <span className="text-dark-500">/month</span>
        </div>
        <p className="text-sm text-dark-400 mb-5">
          {fromPro
            ? 'We’ll prorate the rest of your Pro period so you only pay the difference.'
            : 'GPU 3D capture for production, billed monthly. Cancel anytime.'}
        </p>

        <div className="bg-dark-950 border border-dark-800 rounded-xl p-4 mb-5">
          <p className="text-xs font-semibold text-dark-500 mb-3 tracking-wider">WHAT YOU GET</p>
          <ul className="space-y-2.5">
            {STUDIO_UPGRADE_BENEFITS.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm text-dark-200">
                <span className="mt-0.5 w-5 h-5 rounded-full bg-frim-500/20 flex items-center justify-center shrink-0">
                  <svg className="w-3 h-3 text-frim-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <button
            onClick={onConfirm}
            disabled={loading}
            className="btn-primary py-3 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="spinner w-4 h-4" />
                {fromPro ? 'Upgrading…' : 'Redirecting to checkout…'}
              </>
            ) : fromPro ? (
              `Confirm upgrade — $${STUDIO_PRICE}/mo`
            ) : (
              `Continue to checkout — $${STUDIO_PRICE}/mo`
            )}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            className="btn-secondary py-2 disabled:opacity-50"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  )
}

'use client'

import { useEffect, useRef } from 'react'

export type CelebrationKind = 'studio' | 'pro' | 'credits' | null

interface CelebrationProps {
  kind: CelebrationKind
  credits?: number
  onClose: () => void
}

export default function Celebration({ kind, credits = 0, onClose }: CelebrationProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!kind) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let w = (canvas.width = window.innerWidth)
    let h = (canvas.height = window.innerHeight)
    const onResize = () => {
      w = canvas.width = window.innerWidth
      h = canvas.height = window.innerHeight
    }
    window.addEventListener('resize', onResize)

    const colors = ['#22c55e', '#4ade80', '#86efac', '#fbbf24', '#f472b6', '#60a5fa', '#c4b5fd']
    const pieces = Array.from({ length: 160 }, () => ({
      x: Math.random() * w,
      y: -20 - Math.random() * h,
      r: 4 + Math.random() * 6,
      vx: -3 + Math.random() * 6,
      vy: 4 + Math.random() * 6,
      rot: Math.random() * Math.PI,
      vr: -0.2 + Math.random() * 0.4,
      color: colors[Math.floor(Math.random() * colors.length)],
      w: 6 + Math.random() * 8,
      h: 8 + Math.random() * 10,
    }))

    let raf = 0
    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      for (const p of pieces) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.04
        p.rot += p.vr
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rot)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)

    const closeTimer = window.setTimeout(onClose, 8000)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', onResize)
      window.clearTimeout(closeTimer)
    }
  }, [kind, onClose])

  if (!kind) return null

  const title = kind === 'credits'
    ? `+${credits} Studio capture${credits === 1 ? '' : 's'}`
    : kind === 'studio'
    ? "You're on Studio"
    : "You're on Pro"

  const body = kind === 'credits'
    ? 'Extra GPU captures are ready to use on your model.'
    : kind === 'studio'
    ? 'Congrats — Studio 3D capture is unlocked. 40 GPU jobs this period, then $1 each.'
    : 'Congrats — unlimited projects and Fast motion capture are yours.'

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center p-4">
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none" />
      <div className="relative bg-[#151821]/95 border border-[#22c55e]/40 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl shadow-[#22c55e]/20">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="font-display text-2xl font-bold text-white mb-2">{title}</h2>
        <p className="text-[#a1a1aa] mb-6">{body}</p>
        <button
          onClick={onClose}
          className="w-full py-3 bg-[#22c55e] text-[#09090b] rounded-xl font-semibold hover:bg-[#4ade80] transition-colors"
        >
          Let&apos;s go
        </button>
      </div>
    </div>
  )
}

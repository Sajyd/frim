'use client'

import { useEffect, useState } from 'react'

type Pt = { x: number; y: number }

type WalkPose = {
  hipY: number
  lean: number
  head: number
  thighL: number
  shinL: number
  footL: number
  thighR: number
  shinR: number
  footR: number
  armL: number
  forearmL: number
  armR: number
  forearmR: number
}

type Rig = {
  hip: Pt
  chest: Pt
  neck: Pt
  head: Pt
  nose: Pt
  shoulderL: Pt
  elbowL: Pt
  wristL: Pt
  shoulderR: Pt
  elbowR: Pt
  wristR: Pt
  hipL: Pt
  kneeL: Pt
  ankleL: Pt
  toeL: Pt
  hipR: Pt
  kneeR: Pt
  ankleR: Pt
  toeR: Pt
}

const WALK_PERIOD = 1.35

function deg(d: number) {
  return (d * Math.PI) / 180
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t
}

function smoothstep(t: number) {
  return t * t * (3 - 2 * t)
}

function polar(from: Pt, angleFromDown: number, len: number): Pt {
  return {
    x: from.x + Math.sin(angleFromDown) * len,
    y: from.y + Math.cos(angleFromDown) * len,
  }
}

function lerpPose(a: WalkPose, b: WalkPose, t: number): WalkPose {
  const keys = Object.keys(a) as (keyof WalkPose)[]
  const out = { ...a }
  for (const key of keys) out[key] = lerp(a[key], b[key], t)
  return out
}

function swapLR(p: WalkPose): WalkPose {
  return {
    ...p,
    thighL: p.thighR,
    shinL: p.shinR,
    footL: p.footR,
    thighR: p.thighL,
    shinR: p.shinL,
    footR: p.footL,
    armL: p.armR,
    forearmL: p.forearmR,
    armR: p.armL,
    forearmR: p.forearmL,
  }
}

const CONTACT: WalkPose = {
  hipY: 0,
  lean: 8,
  head: -5,
  thighR: 28,
  shinR: 28,
  footR: 12,
  thighL: -26,
  shinL: 32,
  footL: -16,
  armR: -28,
  forearmR: 14,
  armL: 26,
  forearmL: 34,
}

const DOWN: WalkPose = {
  hipY: 0,
  lean: 10,
  head: -3,
  thighR: 16,
  shinR: 58,
  footR: 2,
  thighL: 28,
  shinL: 64,
  footL: 8,
  armR: -14,
  forearmR: 22,
  armL: 12,
  forearmL: 40,
}

const PASS: WalkPose = {
  hipY: 0,
  lean: 6,
  head: -4,
  thighR: -30,
  shinR: 42,
  footR: -12,
  thighL: 72,
  shinL: 74,
  footL: 4,
  armR: 10,
  forearmR: 18,
  armL: -12,
  forearmL: 24,
}

const HIGH: WalkPose = {
  hipY: 0,
  lean: 7,
  head: -6,
  thighR: -20,
  shinR: 24,
  footR: -16,
  thighL: 52,
  shinL: 50,
  footL: 12,
  armR: 26,
  forearmR: 32,
  armL: -28,
  forearmL: 16,
}

const WALK_KEYS: { at: number; pose: WalkPose }[] = [
  { at: 0, pose: CONTACT },
  { at: 0.1, pose: DOWN },
  { at: 0.2, pose: PASS },
  { at: 0.34, pose: PASS },
  { at: 0.44, pose: HIGH },
  { at: 0.5, pose: swapLR(CONTACT) },
  { at: 0.6, pose: swapLR(DOWN) },
  { at: 0.7, pose: swapLR(PASS) },
  { at: 0.84, pose: swapLR(PASS) },
  { at: 0.94, pose: swapLR(HIGH) },
  { at: 1, pose: CONTACT },
]

function sampleWalk(time: number): WalkPose {
  const c = ((time / WALK_PERIOD) % 1 + 1) % 1
  let i = 0
  while (i < WALK_KEYS.length - 1 && WALK_KEYS[i + 1].at < c) i += 1
  const a = WALK_KEYS[i]
  const b = WALK_KEYS[i + 1]
  const u = smoothstep((c - a.at) / (b.at - a.at))
  return lerpPose(a.pose, b.pose, u)
}

function up(p: Pt, dy: number): Pt {
  return { x: p.x, y: p.y - dy }
}

function solveLeg(hip: Pt, thigh: number, shin: number, foot: number, scale: number) {
  const knee = polar(hip, deg(thigh), 28 * scale)
  // shin is knee flexion: calf folds back so the foot lifts instead of kicking forward
  const ankle = polar(knee, deg(thigh - shin), 26 * scale)
  const toe = polar(ankle, Math.PI / 2 + deg(foot), 10 * scale)
  return { knee, ankle, toe }
}

function solveSide(pose: WalkPose, origin: Pt, scale: number): Rig {
  const s = scale
  const hip = { x: origin.x, y: origin.y + pose.hipY * s }
  const floorY = origin.y + 54 * s
  const lean = deg(pose.lean)
  const chest = { x: hip.x + Math.sin(lean) * 26 * s, y: hip.y - Math.cos(lean) * 26 * s }
  const neck = { x: chest.x + Math.sin(lean) * 9 * s, y: chest.y - Math.cos(lean) * 9 * s }
  const headAng = lean + deg(pose.head)
  const head = { x: neck.x + Math.sin(headAng) * 11 * s, y: neck.y - Math.cos(headAng) * 11 * s }
  const nose = { x: head.x + Math.cos(headAng) * 8 * s, y: head.y + Math.sin(headAng) * 8 * s }

  const shoulderR = { x: chest.x + 5 * s, y: chest.y + 2 * s }
  const shoulderL = { x: chest.x - 7 * s, y: chest.y + 4 * s }
  const elbowR = polar(shoulderR, deg(pose.armR), 20 * s)
  const wristR = polar(elbowR, deg(pose.armR + pose.forearmR), 18 * s)
  const elbowL = polar(shoulderL, deg(pose.armL), 20 * s)
  const wristL = polar(elbowL, deg(pose.armL + pose.forearmL), 18 * s)

  const hipR = { x: hip.x + 5 * s, y: hip.y + 1 * s }
  const hipL = { x: hip.x - 6 * s, y: hip.y + 2 * s }
  const right = solveLeg(hipR, pose.thighR, pose.shinR, pose.footR, s)
  const left = solveLeg(hipL, pose.thighL, pose.shinL, pose.footL, s)

  const lowest = Math.max(left.ankle.y, left.toe.y, right.ankle.y, right.toe.y)
  const dy = lowest - floorY

  return {
    hip: up(hip, dy),
    chest: up(chest, dy),
    neck: up(neck, dy),
    head: up(head, dy),
    nose: up(nose, dy),
    shoulderL: up(shoulderL, dy),
    elbowL: up(elbowL, dy),
    wristL: up(wristL, dy),
    shoulderR: up(shoulderR, dy),
    elbowR: up(elbowR, dy),
    wristR: up(wristR, dy),
    hipL: up(hipL, dy),
    kneeL: up(left.knee, dy),
    ankleL: up(left.ankle, dy),
    toeL: up(left.toe, dy),
    hipR: up(hipR, dy),
    kneeR: up(right.knee, dy),
    ankleR: up(right.ankle, dy),
    toeR: up(right.toe, dy),
  }
}

function solveWave(pose: WalkPose, origin: Pt, scale: number): Rig {
  const s = scale
  const hip = { x: origin.x + pose.lean * 0.5 * s, y: origin.y + pose.hipY * s }
  const chest = { x: hip.x + pose.lean * 0.2 * s, y: hip.y - 30 * s }
  const neck = { x: chest.x + pose.head * 0.1 * s, y: chest.y - 10 * s }
  const head = { x: neck.x + pose.head * 0.25 * s, y: neck.y - 13 * s }
  const nose = { x: head.x, y: head.y + 3 * s }

  const shoulderL = { x: chest.x - 16 * s, y: chest.y + 4 * s }
  const shoulderR = { x: chest.x + 16 * s, y: chest.y + 3 * s }
  const elbowL = polar(shoulderL, deg(-pose.armL), 20 * s)
  const wristL = polar(elbowL, deg(-pose.armL - pose.forearmL * 0.35), 18 * s)
  const elbowR = polar(shoulderR, deg(pose.armR), 20 * s)
  const wristR = polar(elbowR, deg(pose.armR + pose.forearmR), 17 * s)

  const hipL = { x: hip.x - 9 * s, y: hip.y + 2 * s }
  const hipR = { x: hip.x + 9 * s, y: hip.y + 2 * s }
  const kneeL = polar(hipL, deg(pose.thighL), 27 * s)
  const ankleL = polar(kneeL, deg(pose.thighL + pose.shinL), 25 * s)
  const toeL = { x: ankleL.x - 1 * s, y: ankleL.y + 3 * s }
  const kneeR = polar(hipR, deg(pose.thighR), 27 * s)
  const ankleR = polar(kneeR, deg(pose.thighR + pose.shinR), 25 * s)
  const toeR = { x: ankleR.x + 1 * s, y: ankleR.y + 3 * s }

  return {
    hip, chest, neck, head, nose,
    shoulderL, elbowL, wristL,
    shoulderR, elbowR, wristR,
    hipL, kneeL, ankleL, toeL,
    hipR, kneeR, ankleR, toeR,
  }
}

const WAVE_PERIOD = 2.4

function easeOutCubic(t: number) {
  return 1 - (1 - t) ** 3
}

function easeInCubic(t: number) {
  return t * t * t
}

function sampleWave(time: number): WalkPose {
  const c = ((time / WAVE_PERIOD) % 1 + 1) % 1
  const sec = c * WAVE_PERIOD
  const breath = Math.sin(time * 2.1) * 2.2

  let armR = 12
  let forearmR = 14
  let head = 0
  let lean = 0

  if (sec < 0.38) {
    const k = easeOutCubic(sec / 0.38)
    armR = lerp(12, 108, k)
    forearmR = lerp(14, 62, k)
    lean = lerp(0, -5, k)
    head = lerp(0, 10, k)
  } else if (sec < 1.88) {
    const w = (sec - 0.38) / 1.5
    const osc = Math.sin(w * Math.PI * 5)
    armR = 108 + osc * 7
    forearmR = 74 + osc * 38
    lean = -5
    head = 10 + osc * 4
  } else {
    const k = easeInCubic((sec - 1.88) / 0.52)
    armR = lerp(108, 12, k)
    forearmR = lerp(74, 14, k)
    lean = lerp(-5, 0, k)
    head = lerp(10, 0, k)
  }

  return {
    hipY: breath * 0.45,
    lean,
    head,
    thighL: -7,
    shinL: 8,
    footL: 0,
    thighR: 7,
    shinR: 8,
    footR: 0,
    armL: 10 + breath * 0.7,
    forearmL: 16,
    armR,
    forearmR,
  }
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

function useRafTime(paused: boolean) {
  const [t, setT] = useState(0)
  useEffect(() => {
    if (paused) return
    let raf = 0
    let start = 0
    const loop = (now: number) => {
      if (!start) start = now
      setT((now - start) / 1000)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [paused])
  return t
}

function Bone({ a, b, width, color, opacity = 1 }: { a: Pt; b: Pt; width: number; color: string; opacity?: number }) {
  return (
    <line
      x1={a.x}
      y1={a.y}
      x2={b.x}
      y2={b.y}
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      opacity={opacity}
    />
  )
}

function Joint({ p, r, color, glow = true }: { p: Pt; r: number; color: string; glow?: boolean }) {
  return (
    <g>
      {glow && <circle cx={p.x} cy={p.y} r={r + 3} fill={color} opacity={0.22} />}
      <circle cx={p.x} cy={p.y} r={r} fill={color} />
      <circle cx={p.x - r * 0.28} cy={p.y - r * 0.28} r={r * 0.32} fill="#fff" opacity={0.35} />
    </g>
  )
}

function ActorSilhouette({ rig, scale }: { rig: Rig; scale: number }) {
  const cloth = '#4b5160'
  const skin = '#6b7280'
  const far = '#323846'

  return (
    <g>
      <Bone a={rig.hipL} b={rig.kneeL} width={8.5 * scale} color={far} />
      <Bone a={rig.kneeL} b={rig.ankleL} width={7 * scale} color={far} />
      <Bone a={rig.ankleL} b={rig.toeL} width={5.5 * scale} color={far} />
      <Bone a={rig.shoulderL} b={rig.elbowL} width={7.5 * scale} color={far} />
      <Bone a={rig.elbowL} b={rig.wristL} width={6 * scale} color={far} />
      <Bone a={rig.shoulderL} b={rig.shoulderR} width={12 * scale} color={cloth} />
      <Bone a={rig.neck} b={rig.hip} width={14 * scale} color={cloth} />
      <Bone a={rig.hipL} b={rig.hipR} width={11 * scale} color={cloth} />
      <ellipse cx={rig.head.x} cy={rig.head.y} rx={9 * scale} ry={10 * scale} fill={skin} />
      <circle cx={rig.nose.x} cy={rig.nose.y} r={1.6 * scale} fill={skin} />
      <Bone a={rig.hipR} b={rig.kneeR} width={9 * scale} color={cloth} />
      <Bone a={rig.kneeR} b={rig.ankleR} width={7.4 * scale} color={skin} />
      <Bone a={rig.ankleR} b={rig.toeR} width={5.8 * scale} color={skin} />
      <Bone a={rig.shoulderR} b={rig.elbowR} width={8 * scale} color={cloth} />
      <Bone a={rig.elbowR} b={rig.wristR} width={6.4 * scale} color={skin} />
    </g>
  )
}

function PoseOverlay({ rig, scale }: { rig: Rig; scale: number }) {
  const left = '#22d3ee'
  const right = '#f472b6'
  const torso = '#4ade80'
  const w = 1.6 * scale

  return (
    <g>
      <Bone a={rig.shoulderL} b={rig.shoulderR} width={w} color={torso} />
      <Bone a={rig.neck} b={rig.hip} width={w} color={torso} />
      <Bone a={rig.hipL} b={rig.hipR} width={w} color={torso} />
      <Bone a={rig.shoulderL} b={rig.elbowL} width={w} color={left} />
      <Bone a={rig.elbowL} b={rig.wristL} width={w} color={left} />
      <Bone a={rig.hipL} b={rig.kneeL} width={w} color={left} />
      <Bone a={rig.kneeL} b={rig.ankleL} width={w} color={left} />
      <Bone a={rig.ankleL} b={rig.toeL} width={w * 1.15} color={left} />
      <Bone a={rig.shoulderR} b={rig.elbowR} width={w} color={right} />
      <Bone a={rig.elbowR} b={rig.wristR} width={w} color={right} />
      <Bone a={rig.hipR} b={rig.kneeR} width={w} color={right} />
      <Bone a={rig.kneeR} b={rig.ankleR} width={w} color={right} />
      <Bone a={rig.ankleR} b={rig.toeR} width={w * 1.15} color={right} />
      {[
        [rig.head, torso, 2.2],
        [rig.neck, torso, 1.8],
        [rig.hip, torso, 2.2],
        [rig.shoulderL, left, 2.1],
        [rig.elbowL, left, 1.9],
        [rig.wristL, left, 1.8],
        [rig.hipL, left, 2.1],
        [rig.kneeL, left, 2.2],
        [rig.ankleL, left, 2],
        [rig.toeL, left, 1.5],
        [rig.shoulderR, right, 2.1],
        [rig.elbowR, right, 1.9],
        [rig.wristR, right, 1.8],
        [rig.hipR, right, 2.1],
        [rig.kneeR, right, 2.2],
        [rig.ankleR, right, 2],
        [rig.toeR, right, 1.5],
      ].map(([p, color, r], i) => (
        <Joint key={i} p={p as Pt} r={(r as number) * scale} color={color as string} glow={false} />
      ))}
    </g>
  )
}

function RigFigure({ rig, scale }: { rig: Rig; scale: number }) {
  const bone = '#22c55e'
  const joint = '#86efac'
  const far = '#16a34a'

  return (
    <g>
      <Bone a={rig.shoulderL} b={rig.elbowL} width={3.2 * scale} color={far} opacity={0.7} />
      <Bone a={rig.elbowL} b={rig.wristL} width={2.6 * scale} color={far} opacity={0.7} />
      <Bone a={rig.hipL} b={rig.kneeL} width={3.4 * scale} color={far} opacity={0.7} />
      <Bone a={rig.kneeL} b={rig.ankleL} width={2.8 * scale} color={far} opacity={0.7} />
      <Bone a={rig.ankleL} b={rig.toeL} width={2.2 * scale} color={far} opacity={0.7} />
      <Bone a={rig.shoulderL} b={rig.shoulderR} width={3.2 * scale} color={bone} />
      <Bone a={rig.neck} b={rig.hip} width={3.6 * scale} color={bone} />
      <Bone a={rig.hipL} b={rig.hipR} width={3.2 * scale} color={bone} />
      <Bone a={rig.neck} b={rig.head} width={3 * scale} color={bone} />
      <Bone a={rig.shoulderR} b={rig.elbowR} width={3.4 * scale} color={bone} />
      <Bone a={rig.elbowR} b={rig.wristR} width={2.8 * scale} color={bone} />
      <Bone a={rig.hipR} b={rig.kneeR} width={3.6 * scale} color={bone} />
      <Bone a={rig.kneeR} b={rig.ankleR} width={3 * scale} color={bone} />
      <Bone a={rig.ankleR} b={rig.toeR} width={2.4 * scale} color={bone} />
      <Joint p={rig.head} r={7.2 * scale} color={joint} />
      {[
        rig.neck, rig.hip, rig.shoulderL, rig.shoulderR, rig.elbowL, rig.elbowR,
        rig.wristL, rig.wristR, rig.hipL, rig.hipR, rig.kneeL, rig.kneeR, rig.ankleL, rig.ankleR,
      ].map((p, i) => (
        <Joint key={i} p={p} r={(i < 3 ? 3.4 : 2.7) * scale} color={joint} />
      ))}
    </g>
  )
}

function pad(n: number, len = 2) {
  return String(n).padStart(len, '0')
}

function formatTimecode(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  const f = Math.floor((seconds % 1) * 24)
  return `${pad(m)}:${pad(s)}:${pad(f)}`
}

export function HeroEditorPreview() {
  const reduced = usePrefersReducedMotion()
  const t = useRafTime(reduced)
  const pose = sampleWave(reduced ? 0.9 : t)
  const rig = solveWave(pose, { x: 96, y: 118 }, 1.12)
  const cycle = ((t / WAVE_PERIOD) % 1 + 1) % 1
  const frame = Math.floor(cycle * 48)
  const shadowW = 40 + pose.hipY * 0.4

  return (
    <div className="w-full max-w-lg bg-dark-900 rounded-2xl border border-dark-800 overflow-hidden shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-3 bg-dark-950 border-b border-dark-800">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-500" />
          <span className="w-3 h-3 rounded-full bg-yellow-500" />
          <span className="w-3 h-3 rounded-full bg-frim-500" />
        </div>
        <span className="text-xs text-dark-500 font-mono">wave_hello · character.glb</span>
        <span className="ml-auto text-[10px] text-dark-600 font-mono">24 fps</span>
      </div>

      <div className="relative h-[280px] bg-[#0c0e14] overflow-hidden">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(rgba(34,197,94,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.08) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
            maskImage: 'radial-gradient(ellipse 70% 80% at 50% 45%, black 20%, transparent 75%)',
          }}
        />
        <div
          className="absolute left-1/2 bottom-7 w-[82%] h-28 opacity-50"
          style={{
            background:
              'repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(34,197,94,0.12) 18px, rgba(34,197,94,0.12) 19px), repeating-linear-gradient(0deg, transparent, transparent 14px, rgba(34,197,94,0.08) 14px, rgba(34,197,94,0.08) 15px)',
            transform: 'translateX(-50%) perspective(520px) rotateX(66deg)',
            transformOrigin: 'center bottom',
          }}
        />

        <svg viewBox="0 0 200 240" className="absolute inset-0 w-full h-full">
          <ellipse cx={rig.hip.x} cy={186} rx={shadowW} ry={7} fill="#000" opacity={0.35} />
          <RigFigure rig={rig} scale={1} />
        </svg>

        <div className="absolute top-3 left-3 flex items-center gap-2">
          <span className="text-[10px] font-mono text-dark-500 bg-dark-950/70 px-2 py-1 rounded border border-dark-800">
            Perspective
          </span>
        </div>
        <div className="absolute top-3 right-3 text-[10px] font-mono text-frim-400/80 tabular-nums">
          {pad(frame)} / 48
        </div>
        <div className="absolute bottom-3 left-3 flex items-center gap-1.5 text-[10px] font-mono text-dark-500">
          <span className="w-2 h-2 rounded-sm bg-red-500" />
          <span className="w-2 h-2 rounded-sm bg-frim-500" />
          <span className="w-2 h-2 rounded-sm bg-blue-500" />
        </div>
      </div>

      <div className="bg-dark-950 px-4 py-3 border-t border-dark-800">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-6 h-6 rounded bg-frim-500/15 text-frim-400 flex items-center justify-center">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <span className="text-[11px] font-mono text-dark-400 tabular-nums">
            {formatTimecode(cycle * 2)} / 00:02:00
          </span>
        </div>
        <div className="space-y-1.5">
          {[
            { name: 'Hips', keys: [10, 50, 88] },
            { name: 'Spine', keys: [16, 48, 84] },
            { name: 'Arm.R', keys: [8, 22, 38, 54, 70, 90] },
          ].map((track) => (
            <div key={track.name} className="flex items-center gap-2">
              <span className="w-10 text-[9px] font-mono text-dark-600 truncate">{track.name}</span>
              <div className="relative flex-1 h-3 bg-dark-900 rounded-sm overflow-hidden">
                {track.keys.map((k) => (
                  <span
                    key={k}
                    className="absolute top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-frim-500 rotate-45"
                    style={{ left: `${k}%` }}
                  />
                ))}
                <span
                  className="absolute top-0 bottom-0 w-px bg-frim-300/90"
                  style={{ left: `${cycle * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function MocapCapturePreview() {
  const reduced = usePrefersReducedMotion()
  const t = useRafTime(reduced)
  const pose = sampleWalk(reduced ? 0.08 : t)
  const videoOrigin = { x: 152, y: 96 }
  const videoScale = 1.02
  const videoRig = solveSide(pose, videoOrigin, videoScale)
  const videoFloor = videoOrigin.y + 54 * videoScale
  const outRig = solveSide(pose, { x: 70, y: 86 }, 0.88)
  const outFloor = 86 + 54 * 0.88
  const cycle = ((t / WALK_PERIOD) % 1 + 1) % 1
  const frame = Math.floor((t * 24) % 240)
  const progress = 0.62 + Math.sin(t * 0.7) * 0.12
  const scroll = (t * 55) % 80
  const minX = Math.min(
    videoRig.wristL.x, videoRig.wristR.x, videoRig.ankleL.x, videoRig.ankleR.x, videoRig.head.x - 12,
  )
  const maxX = Math.max(
    videoRig.wristL.x, videoRig.wristR.x, videoRig.ankleL.x, videoRig.ankleR.x, videoRig.head.x + 12,
  )
  const minY = videoRig.head.y - 16
  const maxY = Math.max(videoRig.ankleL.y, videoRig.ankleR.y) + 8

  return (
    <div className="bg-dark-950 rounded-2xl border border-dark-800 overflow-hidden shadow-2xl">
      <div className="flex items-center gap-2 px-4 py-3 bg-dark-900 border-b border-dark-800">
        <div className="flex gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
          <span className="w-2.5 h-2.5 rounded-full bg-frim-500/80" />
        </div>
        <span className="text-xs text-dark-500 font-mono">studio-take-04.mov</span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] font-semibold tracking-wide text-red-400">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          REC {formatTimecode(t)}
        </span>
      </div>

      <div className="p-5">
        <div className="flex gap-4 items-stretch">
          <div className="flex-1 min-w-0">
            <div className="text-[9px] font-mono text-dark-500 mb-1.5 tracking-wider uppercase">Source video</div>
            <div className="relative aspect-video rounded-lg overflow-hidden bg-[#12151c] border border-dark-800">
              <svg viewBox="0 0 320 180" className="absolute inset-0 w-full h-full">
                <defs>
                  <linearGradient id="studioWall" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1c212c" />
                    <stop offset="100%" stopColor="#141820" />
                  </linearGradient>
                  <linearGradient id="floorFade" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a1f28" />
                    <stop offset="100%" stopColor="#0c0e14" />
                  </linearGradient>
                  <radialGradient id="spot" cx="45%" cy="35%" r="45%">
                    <stop offset="0%" stopColor="#2a3344" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#151922" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <rect width="320" height="180" fill="url(#studioWall)" />
                <rect width="320" height="180" fill="url(#spot)" />
                <rect y={videoFloor} width="320" height={180 - videoFloor} fill="url(#floorFade)" />
                <line x1="0" y1={videoFloor} x2="320" y2={videoFloor} stroke="#2a3140" strokeWidth="1" />
                {Array.from({ length: 6 }).map((_, i) => {
                  const u = i / 5
                  const y = videoFloor + u * u * (180 - videoFloor)
                  return (
                    <line
                      key={`h${i}`}
                      x1="0"
                      y1={y}
                      x2="320"
                      y2={y}
                      stroke="#243044"
                      strokeWidth="1"
                      opacity={0.45 + u * 0.35}
                    />
                  )
                })}
                {Array.from({ length: 11 }).map((_, i) => {
                  const x = ((i * 36 - scroll * 0.6) % 396) - 38
                  return (
                    <line
                      key={`v${i}`}
                      x1={x}
                      y1={videoFloor}
                      x2={(x - 160) * 1.35 + 160}
                      y2="180"
                      stroke="#243044"
                      strokeWidth="1"
                      opacity="0.5"
                    />
                  )
                })}
                <ellipse cx={videoRig.hip.x} cy={videoFloor + 4} rx={28} ry={4.5} fill="#000" opacity={0.4} />
                <ActorSilhouette rig={videoRig} scale={1} />
                <rect
                  x={minX - 8}
                  y={minY - 6}
                  width={maxX - minX + 16}
                  height={maxY - minY + 10}
                  fill="none"
                  stroke="#4ade80"
                  strokeWidth="1"
                  strokeDasharray="4 3"
                  opacity="0.55"
                />
                <PoseOverlay rig={videoRig} scale={1} />
              </svg>
              <div
                className="pointer-events-none absolute inset-0 opacity-[0.12]"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.35) 2px, rgba(0,0,0,0.35) 3px)',
                }}
              />
              <div className="absolute top-2 left-2 text-[9px] font-mono text-frim-400/90 bg-black/40 px-1.5 py-0.5 rounded">
                33 landmarks
              </div>
              <div className="absolute bottom-2 left-2 right-2 h-0.5 bg-dark-700 rounded">
                <div className="h-full bg-frim-500 rounded" style={{ width: `${(frame / 240) * 100}%` }} />
              </div>
            </div>
          </div>

          <div className="hidden sm:flex flex-col items-center justify-center shrink-0 text-frim-500">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <span className="text-[8px] font-mono text-dark-500 mt-1">retarget</span>
          </div>

          <div className="w-[38%] max-w-[160px] shrink-0">
            <div className="text-[9px] font-mono text-dark-500 mb-1.5 tracking-wider uppercase">Rig output</div>
            <div className="relative h-full min-h-[120px] aspect-[3/4] sm:aspect-auto sm:h-[calc(100%-18px)] rounded-lg overflow-hidden bg-[#0c0e14] border border-dark-800">
              <svg viewBox="0 0 140 180" className="absolute inset-0 w-full h-full">
                <defs>
                  <radialGradient id="rigGlow" cx="50%" cy="45%" r="50%">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity="0" />
                  </radialGradient>
                </defs>
                <rect width="140" height="180" fill="url(#rigGlow)" />
                {Array.from({ length: 7 }).map((_, i) => (
                  <line
                    key={i}
                    x1="18"
                    y1={40 + i * 18}
                    x2="122"
                    y2={40 + i * 18}
                    stroke="#1a1f18"
                    strokeWidth="1"
                  />
                ))}
                <ellipse cx={outRig.hip.x} cy={outFloor + 3} rx={22} ry={4} fill="#14532d" opacity={0.45} />
                <RigFigure rig={outRig} scale={0.95} />
              </svg>
            </div>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <div className="flex-1 h-1.5 bg-dark-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-frim-500 to-frim-400"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
          <span className="text-xs text-frim-400 font-mono tabular-nums">{Math.round(progress * 100)}%</span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-dark-500">
          <span>Extracting pose · frame {frame}</span>
          <span>conf 98% · 24 fps</span>
        </div>
      </div>
    </div>
  )
}

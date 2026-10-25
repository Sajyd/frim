/**
 * Text to motion.
 *
 * A prompt becomes a MediaPipe-style 33-point clip. The editor retargets that
 * clip onto the loaded GLB the same way it retargets Studio capture.
 *
 * Authoring space is y-up, meters, +x = the person's left, +z = toward the camera.
 * Output world landmarks are MediaPipe: y-down, smaller z = closer to the camera.
 */

export type MotionLandmark = { x: number; y: number; z: number; visibility: number }

export type MotionFrame = {
  image: MotionLandmark[]
  world: MotionLandmark[]
}

export type TextMotionClip = {
  name: string
  summary: string
  recognized: boolean
  fps: number
  aspect: number
  loop: boolean
  frames: MotionFrame[]
}

export const TEXT_MOTION_EXAMPLES = [
  'walk',
  'run and wave',
  'jump, then bow',
  'happy dance',
  'sit down',
  'slow sad walk',
] as const

const FPS = 30
const SPINE = 0.5
const HIP_W = 0.1
const SHOULDER_W = 0.19
const UPPER_ARM = 0.28
const FOREARM = 0.25
const THIGH = 0.44
const SHIN = 0.38
const IMG_SCALE = 0.28 / SPINE
const IMG_FOOT = 0.84

type ActionId =
  | 'idle' | 'walk' | 'run' | 'jump' | 'wave' | 'dance' | 'sit' | 'crouch'
  | 'punch' | 'kick' | 'clap' | 'bow' | 'stretch' | 'turn' | 'point' | 'kneel'
  | 'cheer' | 'look' | 'nod' | 'shake' | 'shrug' | 'hips' | 'swim' | 'throw'
  | 'push' | 'lunge' | 'fall' | 'rise' | 'block' | 'pray' | 'jack'

type Layer = 'loco' | 'gesture' | 'full'
type Mood = 'neutral' | 'sad' | 'happy' | 'angry' | 'tired'

type Ch = {
  rootX: number
  rootY: number
  rootZ: number
  yaw: number
  spinePitch: number
  spineYaw: number
  spineRoll: number
  headPitch: number
  headYaw: number
  headRoll: number
  lSwing: number
  lAbduct: number
  lElbow: number
  rSwing: number
  rAbduct: number
  rElbow: number
  lHip: number
  lHipOut: number
  lKnee: number
  lAnkle: number
  rHip: number
  rHipOut: number
  rKnee: number
  rAnkle: number
  heelLift: number
}

type Segment = {
  base: ActionId
  gesture: ActionId | null
  duration: number
  cycles: number
  side: 1 | -1
  variant: string
  travel: boolean
  mood: Mood
  speed: number
  cyclic: boolean
  label: string
}

const LAYER: Record<ActionId, Layer> = {
  idle: 'loco', walk: 'loco', run: 'loco',
  wave: 'gesture', punch: 'gesture', point: 'gesture', cheer: 'gesture',
  look: 'gesture', nod: 'gesture', shake: 'gesture', shrug: 'gesture',
  hips: 'gesture', throw: 'gesture', push: 'gesture', block: 'gesture',
  pray: 'gesture', clap: 'gesture', stretch: 'gesture',
  jump: 'full', dance: 'full', sit: 'full', crouch: 'full', kick: 'full',
  bow: 'full', turn: 'full', kneel: 'full', swim: 'full', lunge: 'full',
  fall: 'full', rise: 'full', jack: 'full',
}

const TIMING: Record<ActionId, { seconds: number; cycles?: number; cyclic: boolean }> = {
  idle: { seconds: 3, cycles: 2, cyclic: true },
  walk: { seconds: 2.4, cycles: 2, cyclic: true },
  run: { seconds: 2.1, cycles: 3, cyclic: true },
  jump: { seconds: 1.45, cyclic: true },
  wave: { seconds: 2.4, cycles: 3, cyclic: true },
  dance: { seconds: 3.4, cycles: 2, cyclic: true },
  sit: { seconds: 2.3, cyclic: false },
  crouch: { seconds: 2, cyclic: false },
  punch: { seconds: 1.45, cyclic: false },
  kick: { seconds: 1.55, cyclic: false },
  clap: { seconds: 2.4, cycles: 3, cyclic: true },
  bow: { seconds: 2.5, cyclic: true },
  stretch: { seconds: 2.6, cyclic: false },
  turn: { seconds: 2.1, cyclic: false },
  point: { seconds: 2, cyclic: false },
  kneel: { seconds: 2.3, cyclic: false },
  cheer: { seconds: 2.2, cycles: 2, cyclic: true },
  look: { seconds: 3, cycles: 1, cyclic: true },
  nod: { seconds: 1.8, cycles: 2, cyclic: true },
  shake: { seconds: 1.6, cycles: 3, cyclic: true },
  shrug: { seconds: 2, cycles: 2, cyclic: true },
  hips: { seconds: 2.2, cyclic: true },
  swim: { seconds: 3.2, cycles: 2, cyclic: true },
  throw: { seconds: 1.5, cyclic: false },
  push: { seconds: 1.7, cyclic: false },
  lunge: { seconds: 2.1, cyclic: false },
  fall: { seconds: 1.7, cyclic: false },
  rise: { seconds: 1.9, cyclic: false },
  block: { seconds: 1.8, cyclic: false },
  pray: { seconds: 2.4, cyclic: true },
  jack: { seconds: 2.8, cycles: 4, cyclic: true },
}

const LABEL: Record<ActionId, string> = {
  idle: 'Idle', walk: 'Walk', run: 'Run', jump: 'Jump', wave: 'Wave',
  dance: 'Dance', sit: 'Sit', crouch: 'Crouch', punch: 'Punch', kick: 'Kick',
  clap: 'Clap', bow: 'Bow', stretch: 'Stretch', turn: 'Turn', point: 'Point',
  kneel: 'Kneel', cheer: 'Cheer', look: 'Look around', nod: 'Nod',
  shake: 'Head shake', shrug: 'Shrug', hips: 'Hands on hips', swim: 'Swim',
  throw: 'Throw', push: 'Push', lunge: 'Lunge', fall: 'Fall', rise: 'Stand up',
  block: 'Block', pray: 'Pray', jack: 'Jumping jacks',
}

const PHRASES: { phrase: string; action: ActionId }[] = [
  { phrase: 'jumping jacks', action: 'jack' },
  { phrase: 'jumping jack', action: 'jack' },
  { phrase: 'hands on hips', action: 'hips' },
  { phrase: 'stand up', action: 'rise' },
  { phrase: 'get up', action: 'rise' },
  { phrase: 'sit down', action: 'sit' },
  { phrase: 'look around', action: 'look' },
  { phrase: 'shake my head', action: 'shake' },
  { phrase: 'shake head', action: 'shake' },
  { phrase: 'head shake', action: 'shake' },
  { phrase: 'raise your arms', action: 'cheer' },
  { phrase: 'raise arms', action: 'cheer' },
  { phrase: 'arms up', action: 'cheer' },
  { phrase: 'hands up', action: 'cheer' },
  { phrase: 'jumping', action: 'jump' },
  { phrase: 'walking', action: 'walk' },
  { phrase: 'walks', action: 'walk' },
  { phrase: 'running', action: 'run' },
  { phrase: 'runs', action: 'run' },
  { phrase: 'jogging', action: 'run' },
  { phrase: 'dancing', action: 'dance' },
  { phrase: 'waving', action: 'wave' },
  { phrase: 'waves', action: 'wave' },
  { phrase: 'jumps', action: 'jump' },
  { phrase: 'dances', action: 'dance' },
  { phrase: 'kicks', action: 'kick' },
  { phrase: 'punches', action: 'punch' },
  { phrase: 'claps', action: 'clap' },
  { phrase: 'bows', action: 'bow' },
  { phrase: 'sitting', action: 'sit' },
  { phrase: 'crouching', action: 'crouch' },
  { phrase: 'squatting', action: 'crouch' },
  { phrase: 'punching', action: 'punch' },
  { phrase: 'kicking', action: 'kick' },
  { phrase: 'clapping', action: 'clap' },
  { phrase: 'bowing', action: 'bow' },
  { phrase: 'pointing', action: 'point' },
  { phrase: 'turning', action: 'turn' },
  { phrase: 'kneeling', action: 'kneel' },
  { phrase: 'stretching', action: 'stretch' },
  { phrase: 'swimming', action: 'swim' },
  { phrase: 'celebrate', action: 'jump' },
  { phrase: 'celebration', action: 'jump' },
  { phrase: 'goodbye', action: 'wave' },
  { phrase: 'hello', action: 'wave' },
  { phrase: 'applause', action: 'clap' },
  { phrase: 'zombie', action: 'walk' },
  { phrase: 'sprint', action: 'run' },
  { phrase: 'stroll', action: 'walk' },
  { phrase: 'squat', action: 'crouch' },
  { phrase: 'march', action: 'walk' },
  { phrase: 'sneak', action: 'walk' },
  { phrase: 'tiptoe', action: 'walk' },
  { phrase: 'creep', action: 'walk' },
  { phrase: 'limp', action: 'walk' },
  { phrase: 'robot', action: 'dance' },
  { phrase: 'dance', action: 'dance' },
  { phrase: 'walk', action: 'walk' },
  { phrase: 'run', action: 'run' },
  { phrase: 'jog', action: 'run' },
  { phrase: 'jump', action: 'jump' },
  { phrase: 'hop', action: 'jump' },
  { phrase: 'leap', action: 'jump' },
  { phrase: 'wave', action: 'wave' },
  { phrase: 'bye', action: 'wave' },
  { phrase: 'sit', action: 'sit' },
  { phrase: 'crouch', action: 'crouch' },
  { phrase: 'duck', action: 'crouch' },
  { phrase: 'punch', action: 'punch' },
  { phrase: 'jab', action: 'punch' },
  { phrase: 'box', action: 'punch' },
  { phrase: 'kick', action: 'kick' },
  { phrase: 'clap', action: 'clap' },
  { phrase: 'bow', action: 'bow' },
  { phrase: 'stretch', action: 'stretch' },
  { phrase: 'turn', action: 'turn' },
  { phrase: 'spin', action: 'turn' },
  { phrase: 'twirl', action: 'turn' },
  { phrase: 'point', action: 'point' },
  { phrase: 'kneel', action: 'kneel' },
  { phrase: 'cheer', action: 'cheer' },
  { phrase: 'nod', action: 'nod' },
  { phrase: 'shrug', action: 'shrug' },
  { phrase: 'swim', action: 'swim' },
  { phrase: 'throw', action: 'throw' },
  { phrase: 'push', action: 'push' },
  { phrase: 'lunge', action: 'lunge' },
  { phrase: 'fall', action: 'fall' },
  { phrase: 'block', action: 'block' },
  { phrase: 'pray', action: 'pray' },
  { phrase: 'prayer', action: 'pray' },
  { phrase: 'idle', action: 'idle' },
  { phrase: 'stand', action: 'idle' },
  { phrase: 'breathe', action: 'idle' },
  { phrase: 'breathing', action: 'idle' },
  { phrase: 'wait', action: 'idle' },
  { phrase: 'scared', action: 'crouch' },
  { phrase: 'afraid', action: 'crouch' },
]

type Vec3 = { x: number; y: number; z: number }

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const smooth = (t: number) => {
  const x = clamp(t, 0, 1)
  return x * x * (3 - 2 * x)
}
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
const len = (a: Vec3) => Math.hypot(a.x, a.y, a.z)
const norm = (a: Vec3): Vec3 => {
  const l = len(a) || 1
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

function rotateX(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c }
}
function rotateY(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c }
}
function rotateZ(v: Vec3, a: number): Vec3 {
  const c = Math.cos(a)
  const s = Math.sin(a)
  return { x: v.x * c - v.y * s, y: v.x * s + v.y * c, z: v.z }
}
function rotateAround(v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const k = cross(axis, v)
  const d = dot(axis, v)
  return {
    x: v.x * c + k.x * s + axis.x * d * (1 - c),
    y: v.y * c + k.y * s + axis.y * d * (1 - c),
    z: v.z * c + k.z * s + axis.z * d * (1 - c),
  }
}

function limbDir(swing: number, abduct: number, side: number): Vec3 {
  return norm({
    x: Math.sin(side * abduct),
    y: -Math.cos(swing) * Math.cos(abduct),
    z: Math.sin(swing) * Math.cos(abduct),
  })
}

function bendToward(dir: Vec3, flex: number, aim: Vec3): Vec3 {
  if (flex <= 1e-4) return dir
  let axis = cross(dir, aim)
  let axisLen = len(axis)
  if (axisLen < 1e-4) {
    axis = cross(dir, { x: 0, y: 1, z: 0 })
    axisLen = len(axis)
  }
  if (axisLen < 1e-4) axis = { x: 1, y: 0, z: 0 }
  else axis = scale(axis, 1 / axisLen)
  return norm(rotateAround(dir, axis, flex))
}

function curve(u: number, keys: Array<[number, number]>): number {
  const x = clamp(u, 0, 1)
  let i = 0
  while (i < keys.length - 2 && x > keys[i + 1][0]) i++
  const [a0, v0] = keys[i]
  const [a1, v1] = keys[Math.min(i + 1, keys.length - 1)]
  const t = smooth((x - a0) / Math.max(1e-4, a1 - a0))
  return v0 + (v1 - v0) * t
}

function stance(): Ch {
  return {
    rootX: 0, rootY: 0, rootZ: 0, yaw: 0,
    spinePitch: 0.04, spineYaw: 0, spineRoll: 0,
    headPitch: 0, headYaw: 0, headRoll: 0,
    lSwing: 0.18, rSwing: 0.18,
    lAbduct: 0.14, rAbduct: 0.14,
    lElbow: 0.28, rElbow: 0.28,
    lHip: 0.05, rHip: 0.05,
    lHipOut: 0.05, rHipOut: 0.05,
    lKnee: 0.1, rKnee: 0.1,
    lAnkle: 0, rAnkle: 0,
    heelLift: 0,
  }
}

function phaseOf(t: number, duration: number, cycles: number) {
  return (t / Math.max(duration, 1e-4)) * cycles * Math.PI * 2
}

function sampleBase(seg: Segment, t: number): Ch {
  const ch = stance()
  const u = clamp(t / Math.max(seg.duration, 1e-4), 0, 1)
  const p = phaseOf(t, seg.duration, Math.max(1, seg.cycles))
  const s = Math.sin(p)
  const dir = seg.variant === 'back' ? -1 : 1

  if (seg.base === 'idle') {
    ch.spinePitch = 0.04 + Math.sin(p) * 0.035
    ch.headYaw = Math.sin(p) * 0.1
    ch.lSwing = 0.18 + Math.sin(p) * 0.04
    ch.rSwing = 0.18 - Math.sin(p) * 0.04
    return ch
  }

  if (seg.base === 'walk' || seg.base === 'run') {
    const run = seg.base === 'run'
    const sneak = seg.variant === 'sneak'
    const march = seg.variant === 'march'
    const limp = seg.variant === 'limp'
    const zombie = seg.variant === 'zombie'
    const stride = run ? 0.68 : sneak ? 0.3 : march ? 0.52 : 0.48
    const kneeLift = run ? 1.02 : sneak ? 0.82 : march ? 1.15 : 0.72
    const arm = run ? 0.78 : sneak ? 0.18 : march ? 0.8 : 0.42
    const step = dir * p
    const ls = Math.sin(step)
    ch.lHip = ls * stride * (limp ? 0.55 : 1)
    ch.rHip = -ls * stride
    ch.lKnee = 0.1 + Math.pow(Math.max(0, Math.sin(step + 0.35)), 1.15) * (limp ? kneeLift * 0.45 : kneeLift)
    ch.rKnee = 0.1 + Math.pow(Math.max(0, Math.sin(step + Math.PI + 0.35)), 1.15) * kneeLift
    ch.lAnkle = Math.max(0, ls * dir) * (run ? 0.45 : 0.28)
    ch.rAnkle = Math.max(0, -ls * dir) * (run ? 0.45 : 0.28)
    ch.lSwing = 0.22 - ls * arm
    ch.rSwing = 0.22 + ls * arm
    ch.lElbow = run ? 1.12 : 0.32
    ch.rElbow = run ? 1.12 : 0.32
    ch.spineYaw = ls * (run ? 0.12 : 0.07)
    ch.spineRoll = ls * 0.045
    ch.spinePitch = run ? 0.2 : sneak ? 0.42 : 0.08
    ch.lHipOut = sneak ? 0.03 : 0.06
    ch.rHipOut = sneak ? 0.03 : 0.06
    if (run) ch.rootY = Math.pow(Math.max(0, Math.cos(step * 2)), 1.5) * 0.07
    if (zombie) {
      ch.lSwing = 1.15
      ch.rSwing = 1.15
      ch.lElbow = 0.42
      ch.rElbow = 0.42
      ch.spinePitch = 0.28
      ch.headPitch = 0.18
    }
    if (sneak) ch.heelLift = 0.055
    if (seg.travel) {
      const speed = (run ? 1.65 : sneak ? 0.45 : 0.82) * dir
      ch.rootZ = t * speed
    }
    if (limp) ch.spineRoll += Math.max(0, ls) * 0.08
    return ch
  }

  if (seg.base === 'jump') {
    const c = curve(u, [[0, 0], [0.18, 1], [0.34, 0.04], [0.72, 0.02], [0.86, 0.65], [1, 0]])
    const air = u >= 0.32 && u <= 0.74 ? Math.sin((u - 0.32) / 0.42 * Math.PI) : 0
    ch.lHip = c * 1.12
    ch.rHip = c * 1.12
    ch.lKnee = 0.08 + c * 1.32
    ch.rKnee = 0.08 + c * 1.32
    ch.spinePitch = 0.04 + c * 0.26
    ch.rootY = air * (seg.variant === 'celebrate' ? 0.52 : 0.4)
    const arms = seg.variant === 'celebrate' ? Math.max(air, c * 0.3) : air
    ch.lSwing = 0.25 + arms * 2.15 + c * 0.35
    ch.rSwing = 0.25 + arms * 2.15 + c * 0.35
    ch.lElbow = 0.22
    ch.rElbow = 0.22
    return ch
  }

  if (seg.base === 'dance') {
    if (seg.variant === 'robot') {
      const steps = 8
      const idx = Math.floor((t / Math.max(seg.duration, 1e-4)) * seg.cycles * steps) % steps
      const poses: Array<[number, number, number]> = [
        [0.4, 0.2, 0.3],
        [1.3, 0.9, 0.4],
        [2.2, 0.3, 0.2],
        [1.2, 1.1, 0.8],
        [0.3, 0.4, 1.2],
        [1.6, 0.2, 0.5],
        [2.4, 0.6, 0.25],
        [0.5, 0.3, 0.35],
      ]
      const [sw, ab, el] = poses[idx]
      const flip = idx % 2 === 0 ? 1 : -1
      ch.lSwing = sw
      ch.rSwing = sw * 0.85
      ch.lAbduct = ab
      ch.rAbduct = ab
      ch.lElbow = el
      ch.rElbow = el
      ch.spineRoll = flip * 0.12
      ch.headYaw = flip * 0.2
      ch.lKnee = idx % 2 ? 0.45 : 0.12
      ch.rKnee = idx % 2 ? 0.12 : 0.45
      return ch
    }
    ch.lSwing = 1.05 + s * 0.85
    ch.rSwing = 1.05 - s * 0.85
    ch.lAbduct = 0.32 + Math.cos(p) * 0.22
    ch.rAbduct = 0.32 - Math.cos(p) * 0.22
    ch.lElbow = 0.72
    ch.rElbow = 0.72
    ch.lKnee = 0.14 + Math.max(0, s) * 0.5
    ch.rKnee = 0.14 + Math.max(0, -s) * 0.5
    ch.lHip = s * 0.18
    ch.rHip = -s * 0.18
    ch.spineRoll = s * 0.16
    ch.spineYaw = Math.cos(p) * 0.16
    ch.headYaw = s * 0.18
    return ch
  }

  if (seg.base === 'sit') {
    const k = smooth(Math.min(1, u / 0.55))
    ch.lHip = 0.05 + k * 1.32
    ch.rHip = 0.05 + k * 1.32
    ch.lKnee = 0.1 + k * 1.42
    ch.rKnee = 0.1 + k * 1.42
    ch.spinePitch = 0.06 + k * 0.06
    ch.lSwing = 0.22 + k * 0.2
    ch.rSwing = 0.22 + k * 0.2
    ch.lElbow = 0.34 + k * 0.25
    ch.rElbow = 0.34 + k * 0.25
    ch.rootZ = -k * 0.06
    return ch
  }

  if (seg.base === 'crouch') {
    const k = smooth(Math.min(1, u / 0.4))
    ch.lHip = k * 1.15
    ch.rHip = k * 1.15
    ch.lKnee = 0.1 + k * 1.4
    ch.rKnee = 0.1 + k * 1.4
    ch.spinePitch = 0.08 + k * 0.38
    ch.lSwing = 0.25 + k * 0.65
    ch.rSwing = 0.25 + k * 0.65
    ch.lElbow = 0.3 + k * 0.35
    ch.rElbow = 0.3 + k * 0.35
    return ch
  }

  if (seg.base === 'kick') {
    const frontRight = seg.side < 0
    const hip = curve(u, [[0, 0.05], [0.28, 0.55], [0.46, 1.22], [0.68, 0.35], [1, 0.05]])
    const knee = curve(u, [[0, 0.1], [0.28, 1.5], [0.46, 0.18], [0.72, 0.28], [1, 0.1]])
    if (frontRight) {
      ch.rHip = hip
      ch.rKnee = knee
      ch.lKnee = 0.2 + hip * 0.15
      ch.spineRoll = -0.06 * smooth(Math.sin(u * Math.PI))
    } else {
      ch.lHip = hip
      ch.lKnee = knee
      ch.rKnee = 0.2 + hip * 0.15
      ch.spineRoll = 0.06 * smooth(Math.sin(u * Math.PI))
    }
    ch.lAbduct = 0.28
    ch.rAbduct = 0.28
    ch.lSwing = 0.35
    ch.rSwing = 0.35
    return ch
  }

  if (seg.base === 'bow') {
    const k = Math.sin(u * Math.PI)
    ch.spinePitch = 0.04 + k * 1.02
    ch.headPitch = k * 0.22
    ch.lSwing = 0.2 + k * 0.12
    ch.rSwing = 0.2 + k * 0.12
    return ch
  }

  if (seg.base === 'turn') {
    const turns = seg.variant === 'spin' ? 1 : 0.5
    const sign = seg.side > 0 ? 1 : -1
    ch.yaw = smooth(u) * turns * Math.PI * 2 * sign
    const step = Math.sin(u * Math.PI * 4)
    ch.lHip = step * 0.28
    ch.rHip = -step * 0.28
    ch.lKnee = 0.12 + Math.max(0, step) * 0.35
    ch.rKnee = 0.12 + Math.max(0, -step) * 0.35
    return ch
  }

  if (seg.base === 'kneel') {
    const k = smooth(Math.min(1, u / 0.5))
    if (seg.side < 0) {
      ch.rHip = k * 0.12
      ch.rKnee = 0.1 + k * 2.2
      ch.lHip = k * 1.4
      ch.lKnee = 0.1 + k * 1.65
    } else {
      ch.lHip = k * 0.12
      ch.lKnee = 0.1 + k * 2.2
      ch.rHip = k * 1.4
      ch.rKnee = 0.1 + k * 1.65
    }
    ch.spinePitch = 0.06 + k * 0.08
    ch.lSwing = 0.2
    ch.rSwing = 0.2
    return ch
  }

  if (seg.base === 'swim') {
    ch.spinePitch = 0.5
    ch.headPitch = 0.12
    ch.lSwing = 0.45 + Math.sin(p) * 1.1
    ch.rSwing = 0.45 + Math.sin(p + Math.PI) * 1.1
    ch.lElbow = 0.35 + Math.max(0, Math.cos(p)) * 1.05
    ch.rElbow = 0.35 + Math.max(0, Math.cos(p + Math.PI)) * 1.05
    ch.lKnee = 0.3 + Math.max(0, Math.sin(p + Math.PI)) * 0.45
    ch.rKnee = 0.3 + Math.max(0, Math.sin(p)) * 0.45
    return ch
  }

  if (seg.base === 'lunge') {
    const k = smooth(Math.min(1, u / 0.45))
    if (seg.side < 0) {
      ch.rHip = k * 1.15
      ch.rKnee = 0.1 + k * 1.2
      ch.lHip = -k * 0.45
      ch.lKnee = 0.1 + k * 0.2
    } else {
      ch.lHip = k * 1.15
      ch.lKnee = 0.1 + k * 1.2
      ch.rHip = -k * 0.45
      ch.rKnee = 0.1 + k * 0.2
    }
    ch.spinePitch = 0.06 + k * 0.1
    ch.lSwing = 0.35
    ch.rSwing = 0.15
    return ch
  }

  if (seg.base === 'fall') {
    const k = smooth(u)
    ch.spinePitch = 0.04 + k * 1.05
    ch.lHip = k * 0.75
    ch.rHip = k * 0.75
    ch.lKnee = 0.1 + k * 1.55
    ch.rKnee = 0.1 + k * 1.55
    ch.yaw = k * 0.35 * (seg.side > 0 ? 1 : -1)
    ch.lSwing = 0.2 + k * 0.7
    ch.rSwing = 0.2 + k * 0.45
    ch.spineRoll = k * 0.18
    return ch
  }

  if (seg.base === 'rise') {
    const k = 1 - smooth(u)
    ch.lHip = k * 1.15
    ch.rHip = k * 1.15
    ch.lKnee = 0.1 + k * 1.4
    ch.rKnee = 0.1 + k * 1.4
    ch.spinePitch = 0.06 + k * 0.32
    ch.lSwing = 0.2 + k * 0.45
    ch.rSwing = 0.2 + k * 0.45
    return ch
  }

  if (seg.base === 'jack') {
    const open = (1 - Math.cos(p)) / 2
    ch.lSwing = open * 2.85
    ch.rSwing = open * 2.85
    ch.lAbduct = Math.sin(open * Math.PI) * 0.18
    ch.rAbduct = Math.sin(open * Math.PI) * 0.18
    ch.lElbow = 0.12
    ch.rElbow = 0.12
    ch.lHipOut = 0.04 + open * 0.4
    ch.rHipOut = 0.04 + open * 0.4
    ch.rootY = open * 0.035
    return ch
  }

  return ch
}

function applyGesture(ch: Ch, seg: Segment, t: number): Ch {
  const g = seg.gesture
  if (!g) return ch
  const timing = TIMING[g]
  const posed = { ...ch }
  const side = seg.side

  if (timing.cyclic) {
    const cycles = timing.cycles ?? 2
    const p = phaseOf(t, seg.duration, cycles)
    const s = Math.sin(p)
    if (g === 'wave') {
      const flap = Math.sin(p)
      if (side < 0) {
        posed.rSwing = 1.28 + flap * 0.26
        posed.rAbduct = 0.48
        posed.rElbow = 0.62 + Math.sin(p + 0.7) * 0.42
        posed.headYaw = -0.22
      } else {
        posed.lSwing = 1.28 + flap * 0.26
        posed.lAbduct = 0.48
        posed.lElbow = 0.62 + Math.sin(p + 0.7) * 0.42
        posed.headYaw = 0.22
      }
    } else if (g === 'clap') {
      const open = (1 - Math.cos(p)) / 2
      posed.lSwing = 0.95
      posed.rSwing = 0.95
      posed.lElbow = 1.2 - open * 0.25
      posed.rElbow = 1.2 - open * 0.25
      posed.lAbduct = 0.1 + open * 0.4
      posed.rAbduct = 0.1 + open * 0.4
    } else if (g === 'cheer') {
      const bounce = (1 - Math.cos(p)) / 2
      posed.lSwing = 2.35 + bounce * 0.3
      posed.rSwing = 2.35 + bounce * 0.3
      posed.lAbduct = 0.22
      posed.rAbduct = 0.22
      posed.lElbow = 0.16
      posed.rElbow = 0.16
      posed.heelLift = bounce * 0.04
    } else if (g === 'look') {
      posed.headYaw = Math.sin(p) * 0.7
      posed.headPitch = Math.sin(p * 2) * 0.08
    } else if (g === 'nod') {
      posed.headPitch = Math.max(0, s) * 0.48
    } else if (g === 'shake') {
      posed.headYaw = s * 0.5
    } else if (g === 'shrug') {
      const up = (1 - Math.cos(p)) / 2
      posed.lAbduct = 0.2 + up * 0.5
      posed.rAbduct = 0.2 + up * 0.5
      posed.lElbow = 0.4 + up * 0.65
      posed.rElbow = 0.4 + up * 0.65
      posed.headRoll = s * 0.06
    } else if (g === 'hips') {
      posed.lElbow = 1.42
      posed.rElbow = 1.42
      posed.lAbduct = 0.82
      posed.rAbduct = 0.82
      posed.lSwing = 0.22
      posed.rSwing = 0.22
    } else if (g === 'pray') {
      posed.lSwing = 1.02
      posed.rSwing = 1.02
      posed.lElbow = 1.52
      posed.rElbow = 1.52
      posed.lAbduct = 0.16
      posed.rAbduct = 0.16
      posed.headPitch = 0.18
    }
    return copyGesture(ch, posed, g, side, 1)
  }

  const dur = Math.min(timing.seconds, seg.duration)
  const u = clamp(t / Math.max(dur, 1e-4), 0, 1)
  const w = t <= dur ? 1 : clamp(1 - (t - dur) / 0.28, 0, 1)
  if (w <= 0) return ch

  if (g === 'punch' || g === 'throw') {
    const swing = g === 'throw'
      ? curve(u, [[0, 0.3], [0.3, -0.55], [0.48, 1.55], [1, 0.35]])
      : curve(u, [[0, 0.25], [0.3, -0.4], [0.46, 1.42], [1, 0.25]])
    const elbow = curve(u, [[0, 0.3], [0.3, 1.4], [0.46, 0.14], [1, 0.3]])
    const yaw = curve(u, [[0, 0], [0.46, side < 0 ? -0.28 : 0.28], [1, 0]])
    if (side < 0) {
      posed.rSwing = swing
      posed.rElbow = elbow
      posed.rAbduct = 0.12
      posed.lSwing = 0.55
      posed.lElbow = 1.25
    } else {
      posed.lSwing = swing
      posed.lElbow = elbow
      posed.lAbduct = 0.12
      posed.rSwing = 0.55
      posed.rElbow = 1.25
    }
    posed.spineYaw = yaw
    posed.headYaw = yaw
  } else if (g === 'point') {
    const k = smooth(Math.min(1, u / 0.35))
    if (side < 0) {
      posed.rSwing = 0.2 + k * 1.25
      posed.rElbow = 0.28 * (1 - k) + 0.08
      posed.rAbduct = 0.1
      posed.headYaw = -0.2 * k
    } else {
      posed.lSwing = 0.2 + k * 1.25
      posed.lElbow = 0.28 * (1 - k) + 0.08
      posed.lAbduct = 0.1
      posed.headYaw = 0.2 * k
    }
  } else if (g === 'stretch' || g === 'cheer') {
    const k = smooth(Math.min(1, u / 0.4))
    posed.lSwing = 0.2 + k * 2.55
    posed.rSwing = 0.2 + k * 2.55
    posed.lElbow = 0.28 * (1 - k) + 0.1
    posed.rElbow = 0.28 * (1 - k) + 0.1
    posed.lAbduct = 0.18
    posed.rAbduct = 0.18
    posed.heelLift = k * 0.07
    posed.spinePitch = 0.04 - k * 0.1
    posed.headPitch = -k * 0.08
  } else if (g === 'push') {
    const elbow = curve(u, [[0, 0.35], [0.28, 1.25], [0.55, 0.16], [1, 0.3]])
    const swing = curve(u, [[0, 0.4], [0.28, 0.7], [0.55, 1.25], [1, 0.45]])
    posed.lSwing = swing
    posed.rSwing = swing
    posed.lElbow = elbow
    posed.rElbow = elbow
    posed.lAbduct = 0.16
    posed.rAbduct = 0.16
    posed.spinePitch = curve(u, [[0, 0.04], [0.55, 0.22], [1, 0.06]])
  } else if (g === 'block') {
    const k = smooth(Math.min(1, u / 0.3))
    posed.lSwing = 0.2 + k * 0.95
    posed.rSwing = 0.2 + k * 0.95
    posed.lElbow = 0.28 + k * 1.05
    posed.rElbow = 0.28 + k * 1.05
    posed.lAbduct = 0.14 + k * 0.18
    posed.rAbduct = 0.14 + k * 0.18
  }

  return copyGesture(ch, posed, g, side, w)
}

function copyGesture(base: Ch, posed: Ch, action: ActionId, side: number, weight: number): Ch {
  const out = { ...base }
  const oneArm = side < 0
    ? (['rSwing', 'rAbduct', 'rElbow'] as const)
    : (['lSwing', 'lAbduct', 'lElbow'] as const)
  const both = ['lSwing', 'lAbduct', 'lElbow', 'rSwing', 'rAbduct', 'rElbow'] as const
  let keys: (keyof Ch)[]
  if (action === 'wave' || action === 'point') keys = [...oneArm, 'headYaw']
  else if (action === 'punch' || action === 'throw') keys = [...both, 'headYaw', 'spineYaw']
  else if (action === 'look' || action === 'nod' || action === 'shake') keys = ['headPitch', 'headYaw', 'headRoll']
  else keys = [...both, 'headPitch', 'headYaw', 'headRoll', 'spinePitch', 'heelLift']
  for (const key of keys) {
    out[key] = base[key] + (posed[key] - base[key]) * weight
  }
  return out
}

function applyMood(ch: Ch, mood: Mood, gestureOwnsArms: boolean): Ch {
  if (mood === 'neutral') return ch
  const out = { ...ch }
  if (mood === 'sad') {
    out.spinePitch += 0.32
    out.headPitch += 0.32
    if (!gestureOwnsArms) {
      out.lSwing *= 0.6
      out.rSwing *= 0.6
    }
  } else if (mood === 'happy') {
    out.spinePitch -= 0.06
    out.lAbduct += 0.06
    out.rAbduct += 0.06
  } else if (mood === 'angry') {
    out.spinePitch += 0.16
    out.lAbduct += 0.12
    out.rAbduct += 0.12
    out.headPitch += 0.12
  } else if (mood === 'tired') {
    out.spinePitch += 0.4
    out.headPitch += 0.28
  }
  return out
}

function poseAt(seg: Segment, t: number): Ch {
  const local = clamp(t, 0, seg.duration)
  let ch = sampleBase(seg, local)
  ch = applyGesture(ch, seg, local)
  return applyMood(ch, seg.mood, Boolean(seg.gesture))
}

function blendAt(segments: Segment[], t: number): Ch {
  let acc = 0
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const end = acc + seg.duration
    if (t <= end || i === segments.length - 1) {
      let ch = poseAt(seg, t - acc)
      const next = segments[i + 1]
      if (next) {
        const fade = Math.min(0.22, seg.duration * 0.3, next.duration * 0.3)
        const into = t - (end - fade)
        if (into > 0) {
          const start = poseAt(next, 0)
          const w = smooth(into / fade)
          const out = { ...ch }
          for (const key of Object.keys(out) as (keyof Ch)[]) {
            out[key] = ch[key] + (start[key] - ch[key]) * w
          }
          ch = out
        }
      }
      return ch
    }
    acc = end
  }
  return stance()
}

function fk(ch: Ch): Vec3[] {
  const pts: Vec3[] = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 }))
  const spineDir = norm(rotateY(rotateZ(rotateX({ x: 0, y: 1, z: 0 }, ch.spinePitch), ch.spineRoll), ch.spineYaw))
  const lateral = norm(rotateY({ x: 1, y: 0, z: 0 }, ch.spineYaw))
  const shoulderCenter = scale(spineDir, SPINE)
  const lHip = { x: HIP_W, y: 0, z: 0 }
  const rHip = { x: -HIP_W, y: 0, z: 0 }

  const leg = (hip: Vec3, swing: number, abduct: number, kneeFlex: number, anklePitch: number, side: number) => {
    const thigh = limbDir(swing, abduct, side)
    const knee = add(hip, scale(thigh, THIGH))
    const shin = bendToward(thigh, Math.max(0.08, kneeFlex), { x: side * 0.05, y: -0.2, z: -1 })
    const ankle = add(knee, scale(shin, SHIN))
    const toe = { x: ankle.x, y: ankle.y - 0.05 + Math.sin(anklePitch) * 0.08, z: ankle.z + 0.13 }
    const heel = { x: ankle.x, y: ankle.y - 0.05 + ch.heelLift, z: ankle.z - 0.05 }
    return { knee, ankle, toe, heel }
  }
  const leftLeg = leg(lHip, ch.lHip, ch.lHipOut, ch.lKnee, ch.lAnkle, 1)
  const rightLeg = leg(rHip, ch.rHip, ch.rHipOut, ch.rKnee, ch.rAnkle, -1)

  const arm = (swing: number, abduct: number, elbowFlex: number, side: number) => {
    const upper = limbDir(swing, abduct, side)
    const fore = bendToward(upper, Math.max(0.12, elbowFlex), { x: side * 0.12, y: 0.25, z: 1 })
    const shoulder = add(shoulderCenter, scale(lateral, side * SHOULDER_W))
    const elbow = add(shoulder, scale(rotateY(upper, ch.spineYaw), UPPER_ARM))
    const wrist = add(elbow, scale(rotateY(fore, ch.spineYaw), FOREARM))
    const handDir = norm(rotateY(fore, ch.spineYaw))
    const sideDir = norm(cross(handDir, { x: 0, y: 1, z: 0 }))
    const index = add(wrist, add(scale(handDir, 0.08), scale(sideDir, side * 0.02)))
    const pinky = add(wrist, add(scale(handDir, 0.07), scale(sideDir, side * -0.03)))
    const thumb = add(wrist, add(scale(handDir, 0.04), { x: 0, y: 0.03, z: 0 }))
    return { shoulder, elbow, wrist, index, pinky, thumb }
  }
  const leftArm = arm(ch.lSwing, ch.lAbduct, ch.lElbow, 1)
  const rightArm = arm(ch.rSwing, ch.rAbduct, ch.rElbow, -1)

  const headDir = norm(rotateY(rotateX(spineDir, ch.headPitch), ch.headYaw))
  const fwd = norm(rotateY(rotateX({ x: 0, y: 0, z: 1 }, ch.spinePitch + ch.headPitch), ch.spineYaw + ch.headYaw))
  const neck = add(shoulderCenter, scale(headDir, 0.08))
  const nose = add(neck, add(scale(headDir, 0.05), scale(fwd, 0.07)))
  const lEye = add(nose, add(scale(lateral, 0.032), scale(headDir, 0.02)))
  const rEye = add(nose, add(scale(lateral, -0.032), scale(headDir, 0.02)))
  const earC = add(neck, scale(headDir, 0.01))
  const lEar = add(earC, add(scale(lateral, 0.07), scale(fwd, -0.02)))
  const rEar = add(earC, add(scale(lateral, -0.07), scale(fwd, -0.02)))

  const put = (i: number, p: Vec3) => { pts[i] = p }
  put(0, nose)
  put(1, add(lEye, scale(lateral, -0.012)))
  put(2, lEye)
  put(3, add(lEye, scale(lateral, 0.012)))
  put(4, add(rEye, scale(lateral, 0.012)))
  put(5, rEye)
  put(6, add(rEye, scale(lateral, -0.012)))
  put(7, lEar)
  put(8, rEar)
  put(9, add(nose, add(scale(lateral, 0.02), scale(headDir, -0.03))))
  put(10, add(nose, add(scale(lateral, -0.02), scale(headDir, -0.03))))
  put(11, leftArm.shoulder)
  put(12, rightArm.shoulder)
  put(13, leftArm.elbow)
  put(14, rightArm.elbow)
  put(15, leftArm.wrist)
  put(16, rightArm.wrist)
  put(17, leftArm.pinky)
  put(18, rightArm.pinky)
  put(19, leftArm.index)
  put(20, rightArm.index)
  put(21, leftArm.thumb)
  put(22, rightArm.thumb)
  put(23, lHip)
  put(24, rHip)
  put(25, leftLeg.knee)
  put(26, rightLeg.knee)
  put(27, leftLeg.ankle)
  put(28, rightLeg.ankle)
  put(29, leftLeg.heel)
  put(30, rightLeg.heel)
  put(31, leftLeg.toe)
  put(32, rightLeg.toe)

  let ground = Math.min(pts[27].y, pts[28].y, pts[29].y, pts[30].y, pts[31].y, pts[32].y)
  // A kneeling knee is the contact. Standing knees stay above the feet and are ignored.
  if (pts[25].y < ground) ground = pts[25].y
  if (pts[26].y < ground) ground = pts[26].y
  const lift = -ground + ch.rootY
  const yawed = pts.map(p => rotateY({ x: p.x, y: p.y + lift, z: p.z }, ch.yaw))
  const offset = rotateY({ x: ch.rootX, y: 0, z: ch.rootZ }, ch.yaw)
  return yawed.map(p => add(p, offset))
}

function toWorld(p: Vec3): MotionLandmark {
  return { x: p.x, y: -p.y, z: -p.z, visibility: 1 }
}
function toImage(p: Vec3): MotionLandmark {
  const mp = toWorld(p)
  return {
    x: 0.5 + mp.x * IMG_SCALE,
    y: IMG_FOOT + mp.y * IMG_SCALE,
    z: mp.z,
    visibility: 1,
  }
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function consumeActions(text: string): ActionId[] {
  let rest = ` ${text} `
  const found: ActionId[] = []
  const phrases = [...PHRASES].sort((a, b) => b.phrase.length - a.phrase.length)
  for (const entry of phrases) {
    const re = new RegExp(`\\b${escapeReg(entry.phrase)}\\b`, 'i')
    if (re.test(rest)) {
      if (!found.includes(entry.action)) found.push(entry.action)
      rest = rest.replace(re, ' ')
    }
  }
  return found
}

function takeSeconds(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*(seconds|second|secs|sec|s)\b/i)
  if (!match) return null
  const n = Number(match[1])
  if (!Number.isFinite(n)) return null
  return clamp(n, 0.6, 20)
}

function takeSpeed(text: string): number {
  if (/\b(very fast|super fast|rapid|quickly|quick)\b/.test(text)) return 1.45
  if (/\b(fast|brisk)\b/.test(text)) return 1.28
  if (/\b(very slow|slowly|slow|gentle|leisurely)\b/.test(text)) return 0.72
  return 1
}

function takeMood(text: string): Mood {
  if (/\b(sad|unhappy|depressed|gloomy)\b/.test(text)) return 'sad'
  if (/\b(angry|mad|furious)\b/.test(text)) return 'angry'
  if (/\b(tired|exhausted|sleepy)\b/.test(text)) return 'tired'
  if (/\b(happy|joyful|excited|cheerful)\b/.test(text)) return 'happy'
  return 'neutral'
}

function takeSide(text: string): 1 | -1 {
  const left = /\bleft\b/.test(text)
  const right = /\bright\b/.test(text)
  if (left && !right) return 1
  return -1
}

function takeVariant(text: string, actions: ActionId[]): string {
  if (/\b(zombie|zombies)\b/.test(text)) return 'zombie'
  if (/\b(sneak|sneaking|tiptoe|tiptoeing|creep|creeping)\b/.test(text)) return 'sneak'
  if (/\b(limp|limping)\b/.test(text)) return 'limp'
  if (/\b(march|marching)\b/.test(text)) return 'march'
  if (/\brobot(ic)?\b/.test(text)) return 'robot'
  if (/\b(spin|spinning|twirl|twirling|pirouette)\b/.test(text)) return 'spin'
  if (/\b(backward|backwards)\b/.test(text)) return 'back'
  if (/\b(celebrate|celebration|hooray|yay)\b/.test(text) || actions.includes('jump') && /\bcheer\b/.test(text)) return 'celebrate'
  return 'normal'
}

function schedule(action: ActionId, speed: number, requested: number | null) {
  const timing = TIMING[action]
  let usedSpeed = speed
  const cadence = ((timing.cycles ?? 1) / timing.seconds) * usedSpeed
  if (requested != null && timing.cyclic && timing.cycles) {
    const cycles = Math.max(1, Math.round(requested * cadence))
    return { duration: cycles / cadence, cycles, cyclic: true }
  }
  if (requested != null) return { duration: requested, cycles: 1, cyclic: timing.cyclic }
  if (timing.cyclic && timing.cycles) {
    const cycles = timing.cycles
    return { duration: cycles / cadence, cycles, cyclic: true }
  }
  return { duration: timing.seconds / usedSpeed, cycles: 1, cyclic: timing.cyclic }
}

function segmentLabel(seg: Pick<Segment, 'base' | 'gesture' | 'mood' | 'variant' | 'travel' | 'speed'>): string {
  const mods: string[] = []
  if (seg.speed < 0.9) mods.push('slow')
  else if (seg.speed > 1.15) mods.push('fast')
  if (seg.variant === 'sneak') mods.push('sneaking')
  else if (seg.variant === 'limp') mods.push('limping')
  else if (seg.variant === 'march') mods.push('marching')
  else if (seg.variant === 'zombie') mods.push('zombie')
  else if (seg.variant === 'robot') mods.push('robot')
  else if (seg.variant === 'spin') mods.push('spinning')
  else if (seg.variant === 'back') mods.push('backward')
  else if (seg.variant === 'celebrate') mods.push('celebrating')
  if (seg.mood !== 'neutral') mods.push(seg.mood)
  if (seg.travel) mods.push('forward')
  const primary = seg.base === 'idle' && seg.gesture ? seg.gesture : seg.base
  const extra = seg.gesture && primary !== seg.gesture ? LABEL[seg.gesture].toLowerCase() : ''
  const name = LABEL[primary].toLowerCase()
  const head = `${mods.join(' ')} ${name}`.trim()
  return extra ? `${head}, ${extra}` : head
}

function parsePrompt(prompt: string): { segments: Segment[]; recognized: boolean } {
  const cleaned = prompt.toLowerCase().replace(/[!.?;]+/g, ' ').replace(/\s+/g, ' ').trim()
  const chunks = (cleaned ? cleaned.split(/\s*(?:and then|followed by|after that|,| then | next )\s*/) : [''])
    .map(part => part.trim())
    .filter(Boolean)
  const parts = chunks.length ? chunks : ['']
  const globalSeconds = takeSeconds(cleaned)
  const perPartSeconds = parts.map(takeSeconds)
  const explicitCount = perPartSeconds.filter(v => v != null).length

  let recognized = false
  const segments: Segment[] = []

  parts.forEach((part, index) => {
    let actions = consumeActions(part)
    let variant = takeVariant(part, actions)
    if (variant === 'zombie' && !actions.includes('walk') && !actions.includes('dance')) actions.unshift('walk')
    if (variant === 'robot' && actions.length === 0) actions = ['dance']
    if ((variant === 'sneak' || variant === 'limp' || variant === 'march') && !actions.includes('walk') && !actions.includes('run')) {
      actions.unshift('walk')
    }
    if (variant === 'spin' && !actions.includes('turn')) actions.unshift('turn')
    if (variant === 'celebrate') {
      actions = actions.filter(action => action !== 'cheer')
      if (!actions.includes('jump')) actions.unshift('jump')
    }
    if (actions.includes('walk') && actions.includes('crouch')) {
      actions = actions.filter(action => action !== 'crouch')
      variant = 'sneak'
    }
    if (actions.length) recognized = true

    const bases = actions.filter(action => LAYER[action] !== 'gesture')
    const gestures = actions.filter(action => LAYER[action] === 'gesture')
    if (!bases.length) bases.push('idle')

    const mood = takeMood(part) !== 'neutral' ? takeMood(part) : takeMood(cleaned)
    const side = takeSide(part)
    const travel = /\b(forward|ahead|towards|toward)\b/.test(part)
      && (bases.includes('walk') || bases.includes('run'))
    let speed = takeSpeed(part)
    if (takeSpeed(cleaned) !== 1 && takeSpeed(part) === 1) speed = takeSpeed(cleaned)
    if (mood === 'happy' && speed === 1 && /\bexcited\b/.test(cleaned)) speed = 1.12
    const pace = speed
    if (variant === 'sneak') speed *= 0.8
    if (variant === 'march') speed *= 1.12

    const ownSeconds = perPartSeconds[index]
    const requested = ownSeconds ?? (explicitCount === 0 && parts.length === 1 ? globalSeconds : null)

    bases.forEach((base, baseIndex) => {
      const gesture = baseIndex === 0 ? (gestures[0] ?? null) : null
      const timingAction = base === 'idle' && gesture ? gesture : base
      const timed = schedule(timingAction, speed, requested)
      const cyclic = timed.cyclic && TIMING[base].cyclic && (!gesture || TIMING[gesture].cyclic)
      const seg: Segment = {
        base,
        gesture,
        duration: timed.duration,
        cycles: timed.cycles,
        side,
        variant,
        travel,
        mood,
        speed: pace,
        cyclic,
        label: '',
      }
      seg.label = segmentLabel(seg)
      segments.push(seg)
    })

    gestures.slice(bases.length > 0 ? 1 : 0).forEach(gesture => {
      if (bases.length === 0) return
      const timed = schedule(gesture, speed, null)
      const seg: Segment = {
        base: 'idle',
        gesture,
        duration: timed.duration,
        cycles: timed.cycles,
        side,
        variant: 'normal',
        travel: false,
        mood,
        speed: pace,
        cyclic: timed.cyclic,
        label: '',
      }
      seg.label = segmentLabel(seg)
      segments.push(seg)
    })
  })

  if (!segments.length) {
    const seg: Segment = {
      base: 'idle', gesture: null, duration: 3, cycles: 2, side: -1,
      variant: 'normal', travel: false, mood: 'neutral', speed: 1, cyclic: true, label: 'Idle',
    }
    segments.push(seg)
  }
  return { segments, recognized }
}

function summaryFor(segments: Segment[], recognized: boolean) {
  if (!recognized) {
    return 'That prompt did not match a move, so this is a standing idle. Try walk, wave, jump, or dance.'
  }
  const text = segments.map(seg => seg.label).join(', then ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function clipName(prompt: string, summary: string) {
  const clean = prompt.trim().replace(/\s+/g, ' ')
  const source = clean || summary
  const titled = source.charAt(0).toUpperCase() + source.slice(1)
  return titled.length > 42 ? `${titled.slice(0, 41)}…` : titled
}

export function describeTextMotion(prompt: string): { summary: string; recognized: boolean; name: string } {
  const parsed = parsePrompt(prompt)
  const summary = summaryFor(parsed.segments, parsed.recognized)
  return { summary, recognized: parsed.recognized, name: clipName(prompt, summary) }
}

export function textToMotion(prompt: string): TextMotionClip {
  const parsed = parsePrompt(prompt)
  const summary = summaryFor(parsed.segments, parsed.recognized)
  const total = parsed.segments.reduce((sum, seg) => sum + seg.duration, 0)
  const frames: MotionFrame[] = []
  const count = Math.max(8, Math.round(total * FPS))
  for (let i = 0; i < count; i++) {
    const t = (i / count) * total
    const ch = blendAt(parsed.segments, Math.min(t, total - 1e-4))
    const pts = fk(ch)
    frames.push({
      image: pts.map(toImage),
      world: pts.map(toWorld),
    })
  }
  const loop = parsed.segments.length === 1 && parsed.segments[0].cyclic && !parsed.segments[0].travel
  return {
    name: clipName(prompt, summary),
    summary,
    recognized: parsed.recognized,
    fps: FPS,
    aspect: 1,
    loop,
    frames,
  }
}

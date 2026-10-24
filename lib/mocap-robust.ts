/** Spike repair for AI mocap timelines. A joint that leaves and comes back in one frame is a bad detection. A real hit stays, because the frames around it move too. */

export type PosePoint = { x: number; y: number; z?: number; visibility?: number }

export type PoseFrame = {
  image: PosePoint[]
  world: PosePoint[]
  leftHand?: PosePoint[] | null
  rightHand?: PosePoint[] | null
}

const BODY = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]

function finite(n: number | undefined) {
  return typeof n === 'number' && Number.isFinite(n)
}

function sanitize(p: PosePoint | undefined): PosePoint {
  if (!p || !finite(p.x) || !finite(p.y) || (p.z != null && !finite(p.z))) {
    return { x: 0, y: 0, z: 0, visibility: 0 }
  }
  const vis = finite(p.visibility) ? (p.visibility as number) : 1
  return { x: p.x, y: p.y, z: p.z || 0, visibility: vis }
}

function dist(a: PosePoint, b: PosePoint, useZ: boolean) {
  return Math.hypot(a.x - b.x, a.y - b.y, useZ ? (a.z || 0) - (b.z || 0) : 0)
}

function torsoOf(pts: PosePoint[] | undefined, useZ: boolean) {
  if (!pts || pts.length < 25 || !pts[11] || !pts[12] || !pts[23] || !pts[24]) return 0
  const sx = (pts[11].x + pts[12].x) / 2 - (pts[23].x + pts[24].x) / 2
  const sy = (pts[11].y + pts[12].y) / 2 - (pts[23].y + pts[24].y) / 2
  const sz = useZ
    ? ((pts[11].z || 0) + (pts[12].z || 0)) / 2 - ((pts[23].z || 0) + (pts[24].z || 0)) / 2
    : 0
  const len = Math.hypot(sx, sy, sz)
  return Number.isFinite(len) ? len : 0
}

function hipOf(pts: PosePoint[], useZ: boolean): PosePoint {
  return {
    x: (pts[23].x + pts[24].x) / 2,
    y: (pts[23].y + pts[24].y) / 2,
    z: useZ ? ((pts[23].z || 0) + (pts[24].z || 0)) / 2 : 0,
  }
}

function hasBody(frame: PoseFrame) {
  const vis = [11, 12, 23, 24].reduce((sum, i) => sum + (frame.image[i]?.visibility ?? 0), 0) / 4
  return vis >= 0.25 && (torsoOf(frame.image, false) > 0.04 || torsoOf(frame.world, true) > 0.08)
}

function repairSpace(frames: Array<PoseFrame | null | undefined>, space: 'image' | 'world') {
  const useZ = space === 'world'
  for (let i = 1; i < frames.length - 1; i++) {
    const prev = frames[i - 1]
    const cur = frames[i]
    const next = frames[i + 1]
    if (!prev || !cur || !next) continue
    const a = prev[space]
    const b = cur[space]
    const c = next[space]
    if (!a || !b || !c || a.length < 25 || b.length < 25 || c.length < 25) continue
    const scale = Math.max(torsoOf(a, useZ), torsoOf(b, useZ), torsoOf(c, useZ), useZ ? 0.2 : 0.08)
    if (dist(hipOf(a, useZ), hipOf(b, useZ), useZ) > scale * 2.2) continue
    if (dist(hipOf(b, useZ), hipOf(c, useZ), useZ) > scale * 2.2) continue
    const limit = useZ ? Math.max(0.16, scale * 0.6) : Math.max(0.07, scale * 0.65)
    for (const j of BODY) {
      const pa = a[j]
      const pb = b[j]
      const pc = c[j]
      if (!pa || !pb || !pc) continue
      if ((pa.visibility ?? 1) < 0.2 || (pc.visibility ?? 1) < 0.2) continue
      const mid = {
        x: (pa.x + pc.x) / 2,
        y: (pa.y + pc.y) / 2,
        z: ((pa.z || 0) + (pc.z || 0)) / 2,
      }
      const span = dist(pa, pc, useZ)
      const dev = dist(pb, mid, useZ)
      if (span < limit && dev > limit) {
        b[j] = {
          x: mid.x,
          y: mid.y,
          z: mid.z,
          visibility: Math.min(pa.visibility ?? 1, pc.visibility ?? 1, pb.visibility ?? 1),
        }
      }
    }
  }
}

export function repairAiTimeline(frames: Array<PoseFrame | null | undefined>) {
  let tracked = 0
  for (const frame of frames) {
    if (!frame) continue
    frame.image = (frame.image || []).map(sanitize)
    frame.world = (frame.world || []).map(sanitize)
    if (frame.leftHand) frame.leftHand = frame.leftHand.map(sanitize)
    if (frame.rightHand) frame.rightHand = frame.rightHand.map(sanitize)
    if (hasBody(frame)) tracked++
  }
  repairSpace(frames, 'image')
  repairSpace(frames, 'world')
  return { tracked, total: frames.length }
}

/** 2D similarity around the image centre: scale * R(p - c) + c + t */

export type Sim2D = { tx: number; ty: number; scale: number; rot: number }

export type Landmark = { x: number; y: number; z: number; visibility: number }

export type CaptureFrame = {
  image: Landmark[]
  world: Landmark[]
  leftHand?: Landmark[] | null
  rightHand?: Landmark[] | null
}

export const IDENTITY_SIM: Sim2D = { tx: 0, ty: 0, scale: 1, rot: 0 }

export function composeSim(a: Sim2D, b: Sim2D): Sim2D {
  const c = Math.cos(a.rot)
  const s = Math.sin(a.rot)
  return {
    scale: a.scale * b.scale,
    rot: a.rot + b.rot,
    tx: a.scale * (c * b.tx - s * b.ty) + a.tx,
    ty: a.scale * (s * b.tx + c * b.ty) + a.ty,
  }
}

export function invertSim(a: Sim2D): Sim2D {
  const invS = 1 / (a.scale || 1)
  const c = Math.cos(-a.rot)
  const s = Math.sin(-a.rot)
  const nx = -a.tx
  const ny = -a.ty
  return {
    scale: invS,
    rot: -a.rot,
    tx: invS * (c * nx - s * ny),
    ty: invS * (s * nx + c * ny),
  }
}

export function applySim(sim: Sim2D, x: number, y: number): { x: number; y: number } {
  const c = Math.cos(sim.rot)
  const s = Math.sin(sim.rot)
  return {
    x: sim.scale * (c * x - s * y) + sim.tx,
    y: sim.scale * (s * x + c * y) + sim.ty,
  }
}

export function poseBBox(image: Landmark[] | undefined, pad = 0.1) {
  if (!image?.length) return null
  let x0 = 1, y0 = 1, x1 = 0, y1 = 0, n = 0
  for (const p of image) {
    if ((p.visibility ?? 1) < 0.35) continue
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
    n++
  }
  if (!n) return null
  return {
    x0: Math.max(0, x0 - pad),
    y0: Math.max(0, y0 - pad),
    x1: Math.min(1, x1 + pad),
    y1: Math.min(1, y1 + pad),
  }
}

function toGray(data: Uint8ClampedArray, w: number, h: number) {
  const g = new Uint8Array(w * h)
  for (let i = 0, p = 0; i < g.length; i++, p += 4) {
    g[i] = (data[p] * 77 + data[p + 1] * 150 + data[p + 2] * 29) >> 8
  }
  return g
}

function patchSad(
  a: Uint8Array, b: Uint8Array, w: number,
  ax: number, ay: number, bx: number, by: number, r: number,
) {
  let s = 0
  for (let dy = -r; dy <= r; dy++) {
    const ra = (ay + dy) * w + ax
    const rb = (by + dy) * w + bx
    for (let dx = -r; dx <= r; dx++) s += Math.abs(a[ra + dx] - b[rb + dx])
  }
  return s
}

function umeyama(src: { x: number; y: number }[], dst: { x: number; y: number }[]): Sim2D | null {
  const n = src.length
  if (n < 3) return null
  let sx = 0, sy = 0, dx = 0, dy = 0
  for (let i = 0; i < n; i++) {
    sx += src[i].x; sy += src[i].y
    dx += dst[i].x; dy += dst[i].y
  }
  sx /= n; sy /= n; dx /= n; dy /= n
  let sxx = 0, sxy = 0, syx = 0, syy = 0, varS = 0
  for (let i = 0; i < n; i++) {
    const ax = src[i].x - sx, ay = src[i].y - sy
    const bx = dst[i].x - dx, by = dst[i].y - dy
    sxx += ax * bx; sxy += ax * by
    syx += ay * bx; syy += ay * by
    varS += ax * ax + ay * ay
  }
  const mu = Math.atan2(sxy - syx, sxx + syy)
  const c = Math.cos(mu), s = Math.sin(mu)
  const scale = varS > 1e-12 ? (c * (sxx + syy) + s * (sxy - syx)) / varS : 1
  const clamped = Math.max(0.85, Math.min(1.18, scale || 1))
  const rot = Math.max(-0.18, Math.min(0.18, mu))
  const cc = Math.cos(rot)
  const ss = Math.sin(rot)
  return {
    scale: clamped,
    rot,
    tx: dx - clamped * (cc * sx - ss * sy),
    ty: dy - clamped * (ss * sx + cc * sy),
  }
}

/** Similarity that maps background points in `prev` → `curr` (normalized image). */
export function estimateBackgroundSim(
  prev: Uint8Array,
  curr: Uint8Array,
  width: number,
  height: number,
  bbox: { x0: number; y0: number; x1: number; y1: number } | null,
): Sim2D {
  const patchR = 4
  const search = 7
  const src: { x: number; y: number }[] = []
  const dst: { x: number; y: number }[] = []
  const gx = 6
  const gy = 5
  const x0 = patchR + search
  const y0 = patchR + search
  const x1 = width - patchR - search - 1
  const y1 = height - patchR - search - 1
  if (x1 <= x0 || y1 <= y0) return { ...IDENTITY_SIM }

  for (let iy = 0; iy < gy; iy++) {
    for (let ix = 0; ix < gx; ix++) {
      const nx = (ix + 0.5) / gx
      const ny = (iy + 0.5) / gy
      if (bbox && nx >= bbox.x0 && nx <= bbox.x1 && ny >= bbox.y0 && ny <= bbox.y1) continue
      const cx = Math.round(x0 + nx * (x1 - x0))
      const cy = Math.round(y0 + ny * (y1 - y0))
      let best = Infinity
      let bx = cx
      let by = cy
      for (let dy = -search; dy <= search; dy++) {
        for (let dx = -search; dx <= search; dx++) {
          const sad = patchSad(prev, curr, width, cx, cy, cx + dx, cy + dy, patchR)
          if (sad < best) {
            best = sad
            bx = cx + dx
            by = cy + dy
          }
        }
      }
      const area = (patchR * 2 + 1) ** 2
      if (best / area > 28) continue
      src.push({ x: cx / width, y: cy / height })
      dst.push({ x: bx / width, y: by / height })
    }
  }

  if (src.length < 4) return { ...IDENTITY_SIM }

  let fitted = umeyama(src, dst)
  if (!fitted) return { ...IDENTITY_SIM }

  const residuals: number[] = []
  for (let i = 0; i < src.length; i++) {
    const p = applySim(fitted, src[i].x, src[i].y)
    residuals.push(Math.hypot(p.x - dst[i].x, p.y - dst[i].y))
  }
  const sorted = [...residuals].sort((a, b) => a - b)
  const med = sorted[Math.floor(sorted.length / 2)] || 0
  const keepSrc: typeof src = []
  const keepDst: typeof dst = []
  for (let i = 0; i < src.length; i++) {
    if (residuals[i] <= med * 2.2 + 0.004) {
      keepSrc.push(src[i])
      keepDst.push(dst[i])
    }
  }
  if (keepSrc.length >= 4) fitted = umeyama(keepSrc, keepDst) || fitted
  return {
    scale: fitted.scale,
    rot: fitted.rot,
    tx: Math.max(-0.07, Math.min(0.07, fitted.tx)),
    ty: Math.max(-0.07, Math.min(0.07, fitted.ty)),
  }
}

export function accumulateSims(deltas: Sim2D[]): Sim2D[] {
  const out: Sim2D[] = [{ ...IDENTITY_SIM }]
  for (let i = 0; i < deltas.length; i++) {
    out.push(composeSim(deltas[i], out[out.length - 1]))
  }
  return out
}

export function cameraMotionStrength(cams: Sim2D[]) {
  if (cams.length < 2) return 0
  let s = 0
  for (const c of cams) {
    s += Math.abs(c.tx) + Math.abs(c.ty) + Math.abs(Math.log(c.scale || 1)) * 0.5 + Math.abs(c.rot)
  }
  return s / cams.length
}

function mapPts(pts: Landmark[] | null | undefined, sim: Sim2D, xyOnly: boolean) {
  if (!pts?.length) return pts ?? null
  return pts.map(p => {
    if (xyOnly) {
      const q = applySim(sim, p.x, p.y)
      return { ...p, x: q.x, y: q.y }
    }
    const c = Math.cos(sim.rot)
    const s = Math.sin(sim.rot)
    return {
      ...p,
      x: c * p.x - s * p.y,
      y: s * p.x + c * p.y,
    }
  })
}

function torsoLen(a: Landmark, b: Landmark, c: Landmark, d: Landmark) {
  return Math.hypot((a.x + b.x) / 2 - (c.x + d.x) / 2, (a.y + b.y) / 2 - (c.y + d.y) / 2)
}

function torsoScaleFallback(frames: Array<CaptureFrame | null>) {
  const ratios: number[] = []
  for (const f of frames) {
    if (!f?.image?.[11] || !f.image[12] || !f.image[23] || !f.image[24]) {
      ratios.push(0)
      continue
    }
    if (!f.world?.[11] || !f.world[12] || !f.world[23] || !f.world[24]) {
      ratios.push(0)
      continue
    }
    const img = torsoLen(f.image[11], f.image[12], f.image[23], f.image[24])
    const wld = torsoLen(f.world[11], f.world[12], f.world[23], f.world[24])
    ratios.push(img > 1e-4 && wld > 1e-4 ? img / wld : 0)
  }
  const valid = ratios.filter(r => r > 0)
  if (valid.length < 8) return
  const sorted = [...valid].sort((a, b) => a - b)
  const med = sorted[Math.floor(sorted.length / 2)]
  frames.forEach((f, i) => {
    const r = ratios[i]
    if (!f || !r || !med) return
    const s = Math.max(0.82, Math.min(1.22, med / r))
    if (Math.abs(s - 1) < 0.03) return
    const hip = {
      x: (f.image[23].x + f.image[24].x) / 2,
      y: (f.image[23].y + f.image[24].y) / 2,
    }
    f.image = f.image.map(p => ({
      ...p,
      x: hip.x + (p.x - hip.x) * s,
      y: hip.y + (p.y - hip.y) * s,
    }))
  })
}

export function applyCameraStabilize(
  frames: Array<CaptureFrame | null>,
  cams: Sim2D[],
  imageHands: boolean,
) {
  const n = Math.min(frames.length, cams.length)
  for (let i = 0; i < n; i++) {
    const f = frames[i]
    if (!f) continue
    const unlock = invertSim(cams[i])
    f.image = mapPts(f.image, unlock, true) || f.image
    if (imageHands) {
      f.leftHand = mapPts(f.leftHand, unlock, true)
      f.rightHand = mapPts(f.rightHand, unlock, true)
    } else if (Math.abs(unlock.rot) > 1e-4) {
      const roll = { ...IDENTITY_SIM, rot: unlock.rot }
      f.world = mapPts(f.world, roll, false) || f.world
      f.leftHand = mapPts(f.leftHand, roll, false)
      f.rightHand = mapPts(f.rightHand, roll, false)
    }
  }
  torsoScaleFallback(frames)
}

export function readDownscaledGray(ctx: CanvasRenderingContext2D, dw: number, dh: number) {
  const img = ctx.getImageData(0, 0, dw, dh)
  return toGray(img.data, dw, dh)
}

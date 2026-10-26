import * as THREE from 'three'

/** Mixamo-compatible bone names used by Frim mocap + the editor quick-select. */
export const MIXAMO_BONES = [
  'Hips',
  'Spine',
  'Spine1',
  'Spine2',
  'Neck',
  'Head',
  'LeftShoulder',
  'LeftArm',
  'LeftForeArm',
  'LeftHand',
  'RightShoulder',
  'RightArm',
  'RightForeArm',
  'RightHand',
  'LeftUpLeg',
  'LeftLeg',
  'LeftFoot',
  'LeftToeBase',
  'RightUpLeg',
  'RightLeg',
  'RightFoot',
  'RightToeBase',
] as const

export type MixamoBoneName = (typeof MIXAMO_BONES)[number]

export type JointMap = Partial<Record<MixamoBoneName, THREE.Vector3>>

export type PlaceJointId =
  | 'Head'
  | 'Hips'
  | 'LeftArm'
  | 'LeftForeArm'
  | 'LeftHand'
  | 'LeftUpLeg'
  | 'LeftLeg'
  | 'LeftFoot'

export const PLACE_STEPS: {
  id: PlaceJointId
  label: string
  hint: string
  mirror?: MixamoBoneName
}[] = [
  { id: 'Head', label: 'Head / chin', hint: 'Click the chin or base of the skull' },
  { id: 'Hips', label: 'Hips / groin', hint: 'Click the pelvis / groin' },
  { id: 'LeftArm', label: 'Left shoulder', hint: 'Click the left shoulder joint', mirror: 'RightArm' },
  { id: 'LeftForeArm', label: 'Left elbow', hint: 'Click the left elbow', mirror: 'RightForeArm' },
  { id: 'LeftHand', label: 'Left wrist', hint: 'Click the left wrist', mirror: 'RightHand' },
  { id: 'LeftUpLeg', label: 'Left hip', hint: 'Click the left hip socket', mirror: 'RightUpLeg' },
  { id: 'LeftLeg', label: 'Left knee', hint: 'Click the left knee', mirror: 'RightLeg' },
  { id: 'LeftFoot', label: 'Left ankle', hint: 'Click the left ankle', mirror: 'RightFoot' },
]

const PARENT: Record<MixamoBoneName, MixamoBoneName | null> = {
  Hips: null,
  Spine: 'Hips',
  Spine1: 'Spine',
  Spine2: 'Spine1',
  Neck: 'Spine2',
  Head: 'Neck',
  LeftShoulder: 'Spine2',
  LeftArm: 'LeftShoulder',
  LeftForeArm: 'LeftArm',
  LeftHand: 'LeftForeArm',
  RightShoulder: 'Spine2',
  RightArm: 'RightShoulder',
  RightForeArm: 'RightArm',
  RightHand: 'RightForeArm',
  LeftUpLeg: 'Hips',
  LeftLeg: 'LeftUpLeg',
  LeftFoot: 'LeftLeg',
  LeftToeBase: 'LeftFoot',
  RightUpLeg: 'Hips',
  RightLeg: 'RightUpLeg',
  RightFoot: 'RightLeg',
  RightToeBase: 'RightFoot',
}

/** Primary child used as the bone’s length / capsule end. */
const PRIMARY_CHILD: Partial<Record<MixamoBoneName, MixamoBoneName>> = {
  Hips: 'Spine',
  Spine: 'Spine1',
  Spine1: 'Spine2',
  Spine2: 'Neck',
  Neck: 'Head',
  LeftShoulder: 'LeftArm',
  LeftArm: 'LeftForeArm',
  LeftForeArm: 'LeftHand',
  RightShoulder: 'RightArm',
  RightArm: 'RightForeArm',
  RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg',
  LeftLeg: 'LeftFoot',
  LeftFoot: 'LeftToeBase',
  RightUpLeg: 'RightLeg',
  RightLeg: 'RightFoot',
  RightFoot: 'RightToeBase',
}

export type AutoRigEstimate = {
  joints: Record<MixamoBoneName, THREE.Vector3>
  box: { min: THREE.Vector3; max: THREE.Vector3; size: THREE.Vector3; center: THREE.Vector3 }
  height: number
  humanoid: boolean
  confidence: number
}

type Slice = { minX: number; maxX: number; minZ: number; maxZ: number; count: number; cx: number; cz: number; cy: number }

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n))
}

function lerpVec(a: THREE.Vector3, b: THREE.Vector3, t: number) {
  return new THREE.Vector3(
    a.x + (b.x - a.x) * t,
    a.y + (b.y - a.y) * t,
    a.z + (b.z - a.z) * t,
  )
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function collectWorldVertices(root: THREE.Object3D, maxSamples = 24000): THREE.Vector3[] {
  const out: THREE.Vector3[] = []
  root.updateMatrixWorld(true)
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh || !mesh.geometry) return
    const pos = mesh.geometry.attributes.position
    if (!pos || pos.count === 0) return
    const v = new THREE.Vector3()
    const step = pos.count > maxSamples ? Math.ceil(pos.count / maxSamples) : 1
    for (let i = 0; i < pos.count; i += step) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld)
      out.push(v.clone())
    }
  })
  return out
}

function buildSlices(vertices: THREE.Vector3[], minY: number, maxY: number, bins = 36): Slice[] {
  const slices: Slice[] = Array.from({ length: bins }, () => ({
    minX: Infinity,
    maxX: -Infinity,
    minZ: Infinity,
    maxZ: -Infinity,
    count: 0,
    cx: 0,
    cz: 0,
    cy: 0,
  }))
  const span = Math.max(1e-6, maxY - minY)
  for (const v of vertices) {
    const t = clamp((v.y - minY) / span, 0, 0.9999)
    const i = Math.floor(t * bins)
    const s = slices[i]
    s.minX = Math.min(s.minX, v.x)
    s.maxX = Math.max(s.maxX, v.x)
    s.minZ = Math.min(s.minZ, v.z)
    s.maxZ = Math.max(s.maxZ, v.z)
    s.cx += v.x
    s.cz += v.z
    s.cy += v.y
    s.count++
  }
  for (const s of slices) {
    if (s.count === 0) continue
    s.cx /= s.count
    s.cz /= s.count
    s.cy /= s.count
  }
  return slices
}

function sliceAt(slices: Slice[], t: number) {
  const i = clamp(Math.round(t * (slices.length - 1)), 0, slices.length - 1)
  return slices[i]
}

function widthOf(s: Slice) {
  if (s.count === 0 || !Number.isFinite(s.minX)) return 0
  return s.maxX - s.minX
}

function centroidOf(vertices: THREE.Vector3[], pred: (v: THREE.Vector3) => boolean) {
  const acc = new THREE.Vector3()
  let n = 0
  for (const v of vertices) {
    if (!pred(v)) continue
    acc.add(v)
    n++
  }
  return n === 0 ? null : acc.multiplyScalar(1 / n)
}

function extremeX(vertices: THREE.Vector3[], pred: (v: THREE.Vector3) => boolean, side: 1 | -1) {
  let best: THREE.Vector3 | null = null
  let bestX = side > 0 ? -Infinity : Infinity
  for (const v of vertices) {
    if (!pred(v)) continue
    if (side > 0 ? v.x > bestX : v.x < bestX) {
      bestX = v.x
      best = v
    }
  }
  return best?.clone() ?? null
}

export function estimateHumanoidJoints(root: THREE.Object3D): AutoRigEstimate | null {
  const vertices = collectWorldVertices(root)
  if (vertices.length < 24) return null

  const box = new THREE.Box3().setFromObject(root)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const height = size.y
  if (height < 1e-4) return null

  const min = box.min.clone()
  const max = box.max.clone()
  const slices = buildSlices(vertices, min.y, max.y)
  const cx = median(vertices.map((v) => v.x))
  const cz = median(vertices.filter((v) => v.y > min.y + height * 0.4 && v.y < min.y + height * 0.75).map((v) => v.z)) || center.z

  // Neck = local min width in the top quarter; shoulders = max width just below that.
  let neckT = 0.86
  let neckW = Infinity
  for (let t = 0.78; t <= 0.95; t += 0.02) {
    const w = widthOf(sliceAt(slices, t))
    if (w > 0 && w < neckW) {
      neckW = w
      neckT = t
    }
  }
  let shoulderT = 0.8
  let shoulderW = 0
  for (let t = 0.68; t <= Math.min(0.88, neckT); t += 0.02) {
    const w = widthOf(sliceAt(slices, t))
    if (w > shoulderW) {
      shoulderW = w
      shoulderT = t
    }
  }
  let waistT = 0.55
  let waistW = Infinity
  for (let t = 0.42; t <= 0.64; t += 0.02) {
    const w = widthOf(sliceAt(slices, t))
    if (w > 0 && w < waistW) {
      waistW = w
      waistT = t
    }
  }
  let hipT = 0.5
  let hipW = 0
  for (let t = 0.4; t <= Math.min(0.58, waistT + 0.02); t += 0.02) {
    const w = widthOf(sliceAt(slices, t))
    if (w > hipW) {
      hipW = w
      hipT = t
    }
  }

  const y = (t: number) => min.y + height * t
  const hipsY = y(hipT)
  const shoulderY = y(shoulderT)
  const neckY = y(neckT)
  const headY = min.y + height * 0.93
  const chestY = (shoulderY + hipsY) * 0.5 + height * 0.06

  const hipSlice = sliceAt(slices, hipT)
  const shoulderSlice = sliceAt(slices, shoulderT)
  const hipHalf = Math.max(size.x * 0.08, widthOf(hipSlice) * 0.22)
  const shoulderHalf = Math.max(size.x * 0.12, widthOf(shoulderSlice) * 0.28)

  // Facing: toes are the foot vertices furthest from the ankle in Z.
  const footBand = (v: THREE.Vector3) => v.y < min.y + height * 0.12
  const footZs = vertices.filter(footBand).map((v) => v.z)
  const toeSign = (() => {
    if (footZs.length < 8) return 1
    const lo = Math.min(...footZs)
    const hi = Math.max(...footZs)
    const mid = (lo + hi) / 2
    let forward = 0
    let back = 0
    for (const z of footZs) {
      if (z > mid) forward++
      else back++
    }
    // More vertices on one side usually means the bulk of the foot (heel). Toes are the thinner extreme.
    return hi - mid > mid - lo ? 1 : -1
  })()

  const hips = new THREE.Vector3(cx, hipsY, cz)
  const head = new THREE.Vector3(cx, headY, cz)
  const neck = new THREE.Vector3(cx, neckY, cz)
  const spine2 = new THREE.Vector3(cx, shoulderY - height * 0.02, cz)
  const spine1 = new THREE.Vector3(cx, chestY, cz)
  const spine = lerpVec(hips, spine1, 0.45)

  const leftArm = new THREE.Vector3(cx + shoulderHalf, shoulderY, cz)
  const rightArm = new THREE.Vector3(cx - shoulderHalf, shoulderY, cz)
  const leftShoulder = lerpVec(spine2, leftArm, 0.35)
  const rightShoulder = lerpVec(spine2, rightArm, 0.35)

  const armYMin = hipsY + height * 0.02
  const armYMax = shoulderY + height * 0.04
  const leftWristPt =
    extremeX(vertices, (v) => v.x > cx + shoulderHalf * 0.35 && v.y > armYMin && v.y < armYMax, 1) ||
    new THREE.Vector3(cx + size.x * 0.48, (shoulderY + hipsY) * 0.55, cz)
  const rightWristPt =
    extremeX(vertices, (v) => v.x < cx - shoulderHalf * 0.35 && v.y > armYMin && v.y < armYMax, -1) ||
    new THREE.Vector3(cx - size.x * 0.48, (shoulderY + hipsY) * 0.55, cz)

  const leftHand = new THREE.Vector3(leftWristPt.x, leftWristPt.y, leftWristPt.z)
  const rightHand = new THREE.Vector3(rightWristPt.x, rightWristPt.y, rightWristPt.z)
  const leftForeArm = lerpVec(leftArm, leftHand, 0.52)
  const rightForeArm = lerpVec(rightArm, rightHand, 0.52)

  const elbowHintL = centroidOf(
    vertices,
    (v) => v.x > cx + shoulderHalf * 0.25 && v.y < shoulderY - height * 0.04 && v.y > leftHand.y + height * 0.04,
  )
  const elbowHintR = centroidOf(
    vertices,
    (v) => v.x < cx - shoulderHalf * 0.25 && v.y < shoulderY - height * 0.04 && v.y > rightHand.y + height * 0.04,
  )
  if (elbowHintL) leftForeArm.copy(elbowHintL)
  if (elbowHintR) rightForeArm.copy(elbowHintR)

  const leftUpLeg = new THREE.Vector3(cx + hipHalf, hipsY, cz)
  const rightUpLeg = new THREE.Vector3(cx - hipHalf, hipsY, cz)

  const leftAnkleHint =
    centroidOf(vertices, (v) => v.x > cx && v.y < min.y + height * 0.1) ||
    new THREE.Vector3(cx + hipHalf, min.y + height * 0.04, cz)
  const rightAnkleHint =
    centroidOf(vertices, (v) => v.x < cx && v.y < min.y + height * 0.1) ||
    new THREE.Vector3(cx - hipHalf, min.y + height * 0.04, cz)

  const leftFoot = new THREE.Vector3(leftAnkleHint.x, Math.max(min.y + height * 0.03, leftAnkleHint.y), leftAnkleHint.z)
  const rightFoot = new THREE.Vector3(rightAnkleHint.x, Math.max(min.y + height * 0.03, rightAnkleHint.y), rightAnkleHint.z)
  const leftLeg = lerpVec(leftUpLeg, leftFoot, 0.52)
  const rightLeg = lerpVec(rightUpLeg, rightFoot, 0.52)

  const kneeHintL = centroidOf(
    vertices,
    (v) => v.x > cx && v.y < hipsY - height * 0.08 && v.y > leftFoot.y + height * 0.08,
  )
  const kneeHintR = centroidOf(
    vertices,
    (v) => v.x < cx && v.y < hipsY - height * 0.08 && v.y > rightFoot.y + height * 0.08,
  )
  if (kneeHintL) leftLeg.copy(kneeHintL)
  if (kneeHintR) rightLeg.copy(kneeHintR)

  const toeOff = height * 0.045 * toeSign
  const leftToeBase = new THREE.Vector3(leftFoot.x, min.y + height * 0.012, leftFoot.z + toeOff)
  const rightToeBase = new THREE.Vector3(rightFoot.x, min.y + height * 0.012, rightFoot.z + toeOff)

  const joints: Record<MixamoBoneName, THREE.Vector3> = {
    Hips: hips,
    Spine: spine,
    Spine1: spine1,
    Spine2: spine2,
    Neck: neck,
    Head: head,
    LeftShoulder: leftShoulder,
    LeftArm: leftArm,
    LeftForeArm: leftForeArm,
    LeftHand: leftHand,
    RightShoulder: rightShoulder,
    RightArm: rightArm,
    RightForeArm: rightForeArm,
    RightHand: rightHand,
    LeftUpLeg: leftUpLeg,
    LeftLeg: leftLeg,
    LeftFoot: leftFoot,
    LeftToeBase: leftToeBase,
    RightUpLeg: rightUpLeg,
    RightLeg: rightLeg,
    RightFoot: rightFoot,
    RightToeBase: rightToeBase,
  }

  const aspect = height / Math.max(size.x, 1e-6)
  const tall = aspect >= 1.2
  const hasArms = size.x > height * 0.28
  const humanoid = tall && hasArms
  const confidence = clamp((aspect - 1) / 1.2, 0, 1) * (hasArms ? 1 : 0.45)

  return {
    joints,
    box: { min, max, size, center },
    height,
    humanoid,
    confidence,
  }
}

export function mirrorJoint(p: THREE.Vector3, centerX: number) {
  return new THREE.Vector3(2 * centerX - p.x, p.y, p.z)
}

export function applySymmetry(joints: JointMap, centerX: number): JointMap {
  const next: JointMap = { ...joints }
  const pairs: [MixamoBoneName, MixamoBoneName][] = [
    ['LeftShoulder', 'RightShoulder'],
    ['LeftArm', 'RightArm'],
    ['LeftForeArm', 'RightForeArm'],
    ['LeftHand', 'RightHand'],
    ['LeftUpLeg', 'RightUpLeg'],
    ['LeftLeg', 'RightLeg'],
    ['LeftFoot', 'RightFoot'],
    ['LeftToeBase', 'RightToeBase'],
  ]
  for (const [l, r] of pairs) {
    if (next[l]) next[r] = mirrorJoint(next[l]!, centerX)
  }
  for (const center of ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'] as MixamoBoneName[]) {
    if (next[center]) next[center] = new THREE.Vector3(centerX, next[center]!.y, next[center]!.z)
  }
  return next
}

/** Fill spine / clavicles / toes from the user-placed Mixamo markers. */
export function expandJoints(partial: JointMap, estimate: AutoRigEstimate): Record<MixamoBoneName, THREE.Vector3> {
  const cx = estimate.box.center.x
  const h = estimate.height
  const base = { ...estimate.joints, ...partial } as Record<MixamoBoneName, THREE.Vector3>
  const mirrored = applySymmetry(base, cx) as Record<MixamoBoneName, THREE.Vector3>

  const hips = mirrored.Hips
  const head = mirrored.Head
  const lArm = mirrored.LeftArm
  const rArm = mirrored.RightArm
  const lHand = mirrored.LeftHand
  const rHand = mirrored.RightHand
  const lFoot = mirrored.LeftFoot
  const rFoot = mirrored.RightFoot

  const midShoulder = lerpVec(lArm, rArm, 0.5)
  mirrored.Spine2 = new THREE.Vector3(cx, midShoulder.y - h * 0.02, (midShoulder.z + hips.z) * 0.5)
  mirrored.Neck = lerpVec(mirrored.Spine2, head, 0.45)
  mirrored.Spine1 = lerpVec(hips, mirrored.Spine2, 0.62)
  mirrored.Spine = lerpVec(hips, mirrored.Spine1, 0.5)
  mirrored.LeftShoulder = lerpVec(mirrored.Spine2, lArm, 0.38)
  mirrored.RightShoulder = lerpVec(mirrored.Spine2, rArm, 0.38)

  if (!partial.LeftForeArm) mirrored.LeftForeArm = lerpVec(lArm, lHand, 0.52)
  if (!partial.RightForeArm) mirrored.RightForeArm = lerpVec(rArm, rHand, 0.52)

  const lHip = mirrored.LeftUpLeg
  const rHip = mirrored.RightUpLeg
  if (!partial.LeftLeg) mirrored.LeftLeg = lerpVec(lHip, lFoot, 0.52)
  if (!partial.RightLeg) mirrored.RightLeg = lerpVec(rHip, rFoot, 0.52)

  const toeSign = Math.sign(estimate.joints.LeftToeBase.z - estimate.joints.LeftFoot.z) || 1
  const toeOff = h * 0.045 * toeSign
  mirrored.LeftToeBase = new THREE.Vector3(lFoot.x, estimate.box.min.y + h * 0.012, lFoot.z + toeOff)
  mirrored.RightToeBase = new THREE.Vector3(rFoot.x, estimate.box.min.y + h * 0.012, rFoot.z + toeOff)

  return mirrored
}

function distToSegment(p: THREE.Vector3, a: THREE.Vector3, b: THREE.Vector3) {
  const ab = b.clone().sub(a)
  const len = ab.lengthSq()
  if (len < 1e-10) return p.distanceTo(a)
  const t = clamp(p.clone().sub(a).dot(ab) / len, 0, 1)
  return p.distanceTo(a.clone().add(ab.multiplyScalar(t)))
}

function boneRadius(name: MixamoBoneName, height: number) {
  if (name === 'Hips' || name.startsWith('Spine')) return height * 0.11
  if (name === 'Head' || name === 'Neck') return height * 0.08
  if (name.includes('UpLeg') || name.includes('Leg') || name.includes('Foot')) return height * 0.055
  if (name.includes('Shoulder') || name.includes('Arm') || name.includes('Hand')) return height * 0.045
  if (name.includes('Toe')) return height * 0.03
  return height * 0.06
}

function sidePenalty(name: MixamoBoneName, x: number, centerX: number, height: number) {
  const slack = height * 0.02
  if (name.startsWith('Left') && x < centerX - slack) return 0.12
  if (name.startsWith('Right') && x > centerX + slack) return 0.12
  return 1
}

export function computeSkinWeights(
  geometry: THREE.BufferGeometry,
  meshWorld: THREE.Matrix4,
  joints: Record<MixamoBoneName, THREE.Vector3>,
  height: number,
  centerX: number,
) {
  const pos = geometry.attributes.position
  const count = pos.count
  const skinIndex = new Uint16Array(count * 4)
  const skinWeight = new Float32Array(count * 4)

  const capsules: { name: MixamoBoneName; a: THREE.Vector3; b: THREE.Vector3; r: number; index: number }[] = []
  MIXAMO_BONES.forEach((name, index) => {
    const a = joints[name]
    const child = PRIMARY_CHILD[name]
    const b = child ? joints[child] : a.clone().add(new THREE.Vector3(0, height * 0.04, 0))
    capsules.push({ name, a, b, r: boneRadius(name, height), index })
  })

  const v = new THREE.Vector3()
  const influences: { index: number; w: number }[] = new Array(capsules.length)

  for (let i = 0; i < count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(meshWorld)
    for (let c = 0; c < capsules.length; c++) {
      const cap = capsules[c]
      const d = distToSegment(v, cap.a, cap.b)
      const falloff = Math.max(0, 1 - d / cap.r)
      const w = falloff * falloff * sidePenalty(cap.name, v.x, centerX, height)
      influences[c] = { index: cap.index, w }
    }
    influences.sort((a, b) => b.w - a.w)
    let sum = 0
    for (let k = 0; k < 4; k++) {
      const inf = influences[k]
      const w = inf && inf.w > 0.002 ? inf.w : 0
      skinIndex[i * 4 + k] = inf ? inf.index : 0
      skinWeight[i * 4 + k] = w
      sum += w
    }
    if (sum < 1e-6) {
      skinIndex[i * 4] = 0
      skinWeight[i * 4] = 1
    } else {
      for (let k = 0; k < 4; k++) skinWeight[i * 4 + k] /= sum
    }
  }

  return { skinIndex, skinWeight }
}

function copyMeshTransform(from: THREE.Object3D, to: THREE.Object3D) {
  to.name = from.name
  to.position.copy(from.position)
  to.quaternion.copy(from.quaternion)
  to.scale.copy(from.scale)
  to.visible = from.visible
  to.frustumCulled = from.frustumCulled
  to.renderOrder = from.renderOrder
  to.castShadow = (from as THREE.Mesh).castShadow
  to.receiveShadow = (from as THREE.Mesh).receiveShadow
  to.userData = { ...from.userData, autorig: true }
}

function removeExistingBones(model: THREE.Object3D) {
  const roots: THREE.Bone[] = []
  model.traverse((obj) => {
    const bone = obj as THREE.Bone
    if (!bone.isBone) return
    const parentIsBone = bone.parent && (bone.parent as THREE.Bone).isBone
    if (!parentIsBone) roots.push(bone)
  })
  for (const root of roots) {
    root.parent?.remove(root)
  }
}

function setWorldPosition(bone: THREE.Bone, world: THREE.Vector3) {
  bone.parent?.updateMatrixWorld(true)
  const local = world.clone()
  bone.parent?.worldToLocal(local)
  bone.position.copy(local)
}

export type AppliedRig = {
  bones: THREE.Bone[]
  skeleton: THREE.Skeleton
  boneMap: Map<string, THREE.Bone>
}

/**
 * Build a Mixamo-named skeleton, convert meshes to SkinnedMesh, and bind weights.
 * Joint positions are world-space.
 */
export function applyAutoRig(model: THREE.Object3D, joints: Record<MixamoBoneName, THREE.Vector3>): AppliedRig {
  const height = Math.max(
    1e-4,
    Math.max(...Object.values(joints).map((j) => j.y)) - Math.min(...Object.values(joints).map((j) => j.y)),
  )
  const centerX = joints.Hips.x

  removeExistingBones(model)

  const boneByName = new Map<MixamoBoneName, THREE.Bone>()
  for (const name of MIXAMO_BONES) {
    const bone = new THREE.Bone()
    bone.name = name
    boneByName.set(name, bone)
  }

  const hips = boneByName.get('Hips')!
  model.add(hips)
  setWorldPosition(hips, joints.Hips)

  for (const name of MIXAMO_BONES) {
    if (name === 'Hips') continue
    const parentName = PARENT[name]
    const bone = boneByName.get(name)!
    const parent = parentName ? boneByName.get(parentName)! : hips
    parent.add(bone)
    setWorldPosition(bone, joints[name])
  }

  model.updateMatrixWorld(true)

  const bones = MIXAMO_BONES.map((n) => boneByName.get(n)!)
  const skeleton = new THREE.Skeleton(bones)

  const meshes: THREE.Mesh[] = []
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh && mesh.geometry?.attributes?.position && !(mesh as { isBone?: boolean }).isBone) {
      meshes.push(mesh)
    }
  })

  for (const mesh of meshes) {
    if ((mesh as { isBone?: boolean }).isBone) continue
    const geo = mesh.geometry.clone()
    const { skinIndex, skinWeight } = computeSkinWeights(geo, mesh.matrixWorld, joints, height, centerX)
    geo.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4))
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4))

    const alreadySkinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh
    if (alreadySkinned) {
      const skinned = mesh as THREE.SkinnedMesh
      const oldGeo = skinned.geometry
      skinned.geometry = geo
      oldGeo.dispose()
      skinned.bind(skeleton, skinned.matrixWorld.clone())
      skinned.normalizeSkinWeights()
      continue
    }

    const skinned = new THREE.SkinnedMesh(geo, mesh.material)
    copyMeshTransform(mesh, skinned)
    skinned.matrix.copy(mesh.matrix)
    skinned.matrixWorld.copy(mesh.matrixWorld)
    const parent = mesh.parent
    if (parent) {
      parent.add(skinned)
      parent.remove(mesh)
    }
    skinned.bind(skeleton, skinned.matrixWorld.clone())
    skinned.normalizeSkinWeights()
    mesh.geometry.dispose()
  }

  const boneMap = new Map<string, THREE.Bone>()
  for (const bone of bones) boneMap.set(bone.name, bone)

  return { bones, skeleton, boneMap }
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunk = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function interiorizeHit(
  point: THREE.Vector3,
  normal: THREE.Vector3,
  joint: PlaceJointId,
  height: number,
  centerX: number,
) {
  const inward = point.clone()
  const pull =
    joint === 'Hips' ? height * 0.04 :
    joint === 'Head' ? height * 0.025 :
    joint === 'LeftUpLeg' || joint === 'LeftArm' ? height * 0.02 :
    height * 0.015
  inward.addScaledVector(normal, -pull)
  if (joint === 'Hips' || joint === 'Head') inward.x = centerX
  return inward
}

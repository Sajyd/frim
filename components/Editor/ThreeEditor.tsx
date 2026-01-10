'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'

interface EditorProps {
  projectName: string
  onSave: () => void
  saving: boolean
  initialData?: {
    animations?: any[]
    modelData?: string
    modelName?: string
  }
}

interface Animation {
  name: string
  fps: number
  totalFrames: number
  speed: number
  loop: boolean
  keyframes: Map<number, Map<string, BoneKeyframe>>
}

interface BoneKeyframe {
  position: THREE.Vector3
  rotation: THREE.Quaternion
  scale: THREE.Vector3
}

interface HistoryState {
  boneStates: { [key: string]: { position: number[]; rotation: number[]; scale: number[] } }
}

export default function ThreeEditor({ projectName, onSave, saving, initialData }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  // Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const transformControlsRef = useRef<TransformControls | null>(null)
  const clockRef = useRef(new THREE.Clock())
  const animationIdRef = useRef<number>(0)
  const gridHelperRef = useRef<THREE.GridHelper | null>(null)
  const boneLinesGroupRef = useRef<THREE.Group | null>(null)
  const boneHelpersRef = useRef<THREE.Group[]>([])
  const modelRef = useRef<THREE.Group | null>(null)
  const originalGLTFRef = useRef<any>(null)

  // Editor state
  const [currentTool, setCurrentTool] = useState<'select' | 'rotate' | 'translate' | 'scale'>('rotate')
  const [selectedBone, setSelectedBone] = useState<THREE.Bone | null>(null)
  const [bones, setBones] = useState<Map<string, THREE.Bone>>(new Map())
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [modelLoaded, setModelLoaded] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [showGrid, setShowGrid] = useState(true)
  const [showBoneView, setShowBoneView] = useState(true)
  const [loadedFilename, setLoadedFilename] = useState('')

  // Animation state
  const [animations, setAnimations] = useState<Map<string, Animation>>(new Map())
  const [currentAnimationId, setCurrentAnimationId] = useState<string | null>(null)
  const animationCounterRef = useRef(0)

  // History for undo/redo
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const maxHistory = 50

  // Clipboard
  const clipboardRef = useRef<{ position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 } | null>(null)

  // Original bone transforms
  const originalTransformsRef = useRef<Map<string, { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }>>(new Map())

  // Playback
  const playbackTimeRef = useRef(0)

  // Get current animation
  const currentAnimation = currentAnimationId ? animations.get(currentAnimationId) : null
  const totalFrames = currentAnimation?.totalFrames || 30
  const fps = currentAnimation?.fps || 24
  const speed = currentAnimation?.speed || 1
  const loop = currentAnimation?.loop !== false

  // Toast notification
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const container = document.getElementById('toast-container')
    if (!container) return

    const icons: Record<string, string> = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }
    const colors: Record<string, string> = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      warning: 'bg-yellow-500',
      info: 'bg-blue-500'
    }

    const toast = document.createElement('div')
    toast.className = `flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${colors[type]} text-white animate-slide-up`
    toast.innerHTML = `<span>${icons[type]}</span><span>${message}</span>`
    container.appendChild(toast)

    setTimeout(() => {
      toast.style.opacity = '0'
      toast.style.transform = 'translateY(10px)'
      setTimeout(() => toast.remove(), 300)
    }, 3000)
  }, [])

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasRef.current) return

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f1117)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.set(4, 3, 6)
    camera.lookAt(0, 1, 0)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight - 52)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    rendererRef.current = renderer

    // Orbit Controls
    const controls = new OrbitControls(camera, canvasRef.current)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.target.set(0, 1, 0)
    controls.minDistance = 1
    controls.maxDistance = 20
    controlsRef.current = controls

    // Transform Controls
    const transformControls = new TransformControls(camera, canvasRef.current)
    transformControls.setMode('rotate')
    transformControls.setSpace('local')
    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value
    })
    scene.add(transformControls)
    transformControlsRef.current = transformControls

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.5)
    directionalLight.position.set(5, 10, 5)
    directionalLight.castShadow = true
    directionalLight.shadow.mapSize.width = 2048
    directionalLight.shadow.mapSize.height = 2048
    scene.add(directionalLight)

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.5)
    fillLight.position.set(-5, 5, -5)
    scene.add(fillLight)

    const rimLight = new THREE.DirectionalLight(0x22c55e, 0.4)
    rimLight.position.set(0, 5, -10)
    scene.add(rimLight)

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6)
    hemiLight.position.set(0, 20, 0)
    scene.add(hemiLight)

    // Grid
    const gridHelper = new THREE.GridHelper(20, 20, 0x22c55e, 0x252b3d)
    scene.add(gridHelper)
    gridHelperRef.current = gridHelper

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(20, 20)
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1d24, roughness: 0.9, metalness: 0.1 })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.position.y = -0.01
    ground.receiveShadow = true
    scene.add(ground)

    // Axes helper
    const axesHelper = new THREE.AxesHelper(2)
    scene.add(axesHelper)

    // Bone lines group
    const boneLinesGroup = new THREE.Group()
    scene.add(boneLinesGroup)
    boneLinesGroupRef.current = boneLinesGroup

    // Handle resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / (window.innerHeight - 52)
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight - 52)
    }
    window.addEventListener('resize', handleResize)

    // Create default animation
    const defaultAnim: Animation = {
      name: 'Animation 1',
      fps: 24,
      totalFrames: 30,
      speed: 1,
      loop: true,
      keyframes: new Map()
    }
    const animId = `anim_${animationCounterRef.current++}`
    setAnimations(new Map([[animId, defaultAnim]]))
    setCurrentAnimationId(animId)

    // Don't auto-load - show welcome screen instead

    return () => {
      cancelAnimationFrame(animationIdRef.current)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
    }
  }, [])

  // Animation loop
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return

    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate)

      const delta = clockRef.current.getDelta()

      // Playback
      if (isPlaying && currentAnimation) {
        playbackTimeRef.current += delta * speed
        const frameDuration = 1 / fps

        if (playbackTimeRef.current >= frameDuration) {
          playbackTimeRef.current = 0
          const nextFrame = currentFrame + 1
          if (nextFrame <= totalFrames) {
            goToFrame(nextFrame)
          } else if (loop) {
            goToFrame(0)
          } else {
            setIsPlaying(false)
          }
        }
      }

      // Update bone lines
      if (showBoneView && boneLinesGroupRef.current) {
        updateBoneLines()
      }

      controlsRef.current?.update()
      rendererRef.current!.render(sceneRef.current!, cameraRef.current!)
    }
    animate()

    return () => cancelAnimationFrame(animationIdRef.current)
  }, [isPlaying, currentFrame, currentAnimation, fps, speed, loop, totalFrames, showBoneView])

  // Update transform controls mode
  useEffect(() => {
    if (transformControlsRef.current && currentTool !== 'select') {
      transformControlsRef.current.setMode(currentTool)
    }
  }, [currentTool])

  // Attach transform controls to selected bone
  useEffect(() => {
    if (transformControlsRef.current) {
      if (selectedBone && currentTool !== 'select') {
        transformControlsRef.current.attach(selectedBone)
      } else {
        transformControlsRef.current.detach()
      }
    }
  }, [selectedBone, currentTool])

  // Grid visibility
  useEffect(() => {
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = showGrid
    }
  }, [showGrid])

  // Bone view visibility
  useEffect(() => {
    if (boneLinesGroupRef.current) {
      boneLinesGroupRef.current.visible = showBoneView
    }
    boneHelpersRef.current.forEach(helper => {
      helper.visible = showBoneView
    })
  }, [showBoneView])

  const createSampleArmature = (scene: THREE.Scene) => {
    const group = new THREE.Group()
    const boneMap = new Map<string, THREE.Bone>()
    const originalTransforms = new Map<string, { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }>()

    // Materials
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x6366f1, roughness: 0.4, metalness: 0.1 })
    const accentMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x22c55e, roughness: 0.3, metalness: 0.2, emissive: 0x22c55e, emissiveIntensity: 0.2
    })

    // Create bones
    const createBone = (name: string, position: THREE.Vector3, parent?: THREE.Bone) => {
      const bone = new THREE.Bone()
      bone.name = name
      bone.position.copy(position)
      if (parent) parent.add(bone)
      boneMap.set(name, bone)
      originalTransforms.set(name, {
        position: position.clone(),
        rotation: bone.rotation.clone(),
        scale: bone.scale.clone()
      })
      return bone
    }

    // Build skeleton
    const hips = new THREE.Bone()
    hips.name = 'Hips'
    hips.position.y = 1
    boneMap.set('Hips', hips)
    originalTransforms.set('Hips', { position: new THREE.Vector3(0, 1, 0), rotation: hips.rotation.clone(), scale: hips.scale.clone() })

    const spine = createBone('Spine', new THREE.Vector3(0, 0.2, 0), hips)
    const spine1 = createBone('Spine1', new THREE.Vector3(0, 0.15, 0), spine)
    const spine2 = createBone('Spine2', new THREE.Vector3(0, 0.15, 0), spine1)
    const neck = createBone('Neck', new THREE.Vector3(0, 0.12, 0), spine2)
    const head = createBone('Head', new THREE.Vector3(0, 0.15, 0), neck)

    // Left arm
    const leftShoulder = new THREE.Bone()
    leftShoulder.name = 'LeftShoulder'
    leftShoulder.position.set(-0.18, 0.08, 0)
    spine2.add(leftShoulder)
    boneMap.set('LeftShoulder', leftShoulder)
    originalTransforms.set('LeftShoulder', { position: leftShoulder.position.clone(), rotation: leftShoulder.rotation.clone(), scale: leftShoulder.scale.clone() })

    const leftArm = createBone('LeftArm', new THREE.Vector3(-0.15, 0, 0), leftShoulder)
    const leftForeArm = createBone('LeftForeArm', new THREE.Vector3(-0.22, 0, 0), leftArm)
    const leftHand = createBone('LeftHand', new THREE.Vector3(-0.18, 0, 0), leftForeArm)

    // Right arm
    const rightShoulder = new THREE.Bone()
    rightShoulder.name = 'RightShoulder'
    rightShoulder.position.set(0.18, 0.08, 0)
    spine2.add(rightShoulder)
    boneMap.set('RightShoulder', rightShoulder)
    originalTransforms.set('RightShoulder', { position: rightShoulder.position.clone(), rotation: rightShoulder.rotation.clone(), scale: rightShoulder.scale.clone() })

    const rightArm = createBone('RightArm', new THREE.Vector3(0.15, 0, 0), rightShoulder)
    const rightForeArm = createBone('RightForeArm', new THREE.Vector3(0.22, 0, 0), rightArm)
    const rightHand = createBone('RightHand', new THREE.Vector3(0.18, 0, 0), rightForeArm)

    // Left leg
    const leftUpLeg = new THREE.Bone()
    leftUpLeg.name = 'LeftUpLeg'
    leftUpLeg.position.set(-0.1, -0.05, 0)
    hips.add(leftUpLeg)
    boneMap.set('LeftUpLeg', leftUpLeg)
    originalTransforms.set('LeftUpLeg', { position: leftUpLeg.position.clone(), rotation: leftUpLeg.rotation.clone(), scale: leftUpLeg.scale.clone() })

    const leftLeg = createBone('LeftLeg', new THREE.Vector3(0, -0.4, 0), leftUpLeg)
    const leftFoot = createBone('LeftFoot', new THREE.Vector3(0, -0.38, 0), leftLeg)

    // Right leg
    const rightUpLeg = new THREE.Bone()
    rightUpLeg.name = 'RightUpLeg'
    rightUpLeg.position.set(0.1, -0.05, 0)
    hips.add(rightUpLeg)
    boneMap.set('RightUpLeg', rightUpLeg)
    originalTransforms.set('RightUpLeg', { position: rightUpLeg.position.clone(), rotation: rightUpLeg.rotation.clone(), scale: rightUpLeg.scale.clone() })

    const rightLeg = createBone('RightLeg', new THREE.Vector3(0, -0.4, 0), rightUpLeg)
    const rightFoot = createBone('RightFoot', new THREE.Vector3(0, -0.38, 0), rightLeg)

    // Create body meshes
    const bodyGroup = new THREE.Group()

    // Pelvis
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.15), bodyMaterial)
    pelvis.position.y = 1
    pelvis.castShadow = true
    bodyGroup.add(pelvis)

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.45, 0.18), bodyMaterial)
    torso.position.set(0, 1.32, 0)
    torso.castShadow = true
    bodyGroup.add(torso)

    // Head
    const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), accentMaterial)
    headMesh.position.set(0, 1.72, 0)
    headMesh.castShadow = true
    bodyGroup.add(headMesh)

    // Neck
    const neckMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.1, 8), bodyMaterial)
    neckMesh.position.set(0, 1.58, 0)
    bodyGroup.add(neckMesh)

    // Arms
    const leftUpperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.2, 4, 8), bodyMaterial)
    leftUpperArm.position.set(-0.28, 1.38, 0)
    leftUpperArm.rotation.z = 0.3
    leftUpperArm.castShadow = true
    bodyGroup.add(leftUpperArm)

    const leftLowerArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.18, 4, 8), bodyMaterial)
    leftLowerArm.position.set(-0.42, 1.15, 0)
    leftLowerArm.rotation.z = 0.2
    leftLowerArm.castShadow = true
    bodyGroup.add(leftLowerArm)

    const leftHandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.03), accentMaterial)
    leftHandMesh.position.set(-0.48, 0.95, 0)
    bodyGroup.add(leftHandMesh)

    const rightUpperArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.04, 0.2, 4, 8), bodyMaterial)
    rightUpperArm.position.set(0.28, 1.38, 0)
    rightUpperArm.rotation.z = -0.3
    rightUpperArm.castShadow = true
    bodyGroup.add(rightUpperArm)

    const rightLowerArm = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.18, 4, 8), bodyMaterial)
    rightLowerArm.position.set(0.42, 1.15, 0)
    rightLowerArm.rotation.z = -0.2
    rightLowerArm.castShadow = true
    bodyGroup.add(rightLowerArm)

    const rightHandMesh = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.08, 0.03), accentMaterial)
    rightHandMesh.position.set(0.48, 0.95, 0)
    bodyGroup.add(rightHandMesh)

    // Legs
    const leftThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.32, 4, 8), bodyMaterial)
    leftThigh.position.set(-0.1, 0.72, 0)
    leftThigh.castShadow = true
    bodyGroup.add(leftThigh)

    const leftShin = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.3, 4, 8), bodyMaterial)
    leftShin.position.set(-0.1, 0.32, 0)
    leftShin.castShadow = true
    bodyGroup.add(leftShin)

    const leftFootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.15), accentMaterial)
    leftFootMesh.position.set(-0.1, 0.025, 0.03)
    bodyGroup.add(leftFootMesh)

    const rightThigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.32, 4, 8), bodyMaterial)
    rightThigh.position.set(0.1, 0.72, 0)
    rightThigh.castShadow = true
    bodyGroup.add(rightThigh)

    const rightShin = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.3, 4, 8), bodyMaterial)
    rightShin.position.set(0.1, 0.32, 0)
    rightShin.castShadow = true
    bodyGroup.add(rightShin)

    const rightFootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 0.15), accentMaterial)
    rightFootMesh.position.set(0.1, 0.025, 0.03)
    bodyGroup.add(rightFootMesh)

    group.add(bodyGroup)
    group.add(hips)

    // Create bone helpers
    const helpers: THREE.Group[] = []
    boneMap.forEach((bone, name) => {
      const helper = createBoneHelper(name)
      bone.add(helper)
      helpers.push(helper)
    })
    boneHelpersRef.current = helpers

    // Create bone lines
    createBoneLines(boneMap)

    scene.add(group)
    modelRef.current = group

    setBones(boneMap)
    originalTransformsRef.current = originalTransforms
    setModelLoaded(true)
    setShowWelcome(false)
    setLoadedFilename('sample_armature.glb')
  }

  const createBoneHelper = (boneName: string) => {
    const group = new THREE.Group()
    group.userData.boneName = boneName

    const jointSize = 0.06
    const jointGeo = new THREE.OctahedronGeometry(jointSize, 0)
    const jointMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.3,
      metalness: 0.6,
      transparent: true,
      opacity: 0.85
    })
    const joint = new THREE.Mesh(jointGeo, jointMat)
    joint.userData.boneName = boneName
    joint.renderOrder = 100
    group.add(joint)

    const glowGeo = new THREE.OctahedronGeometry(jointSize * 1.15, 0)
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.3,
      side: THREE.BackSide
    })
    const glow = new THREE.Mesh(glowGeo, glowMat)
    glow.userData.boneName = boneName
    group.add(glow)

    const wireGeo = new THREE.OctahedronGeometry(jointSize * 1.02, 0)
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x86efac,
      wireframe: true,
      transparent: true,
      opacity: 0.6
    })
    const wireframe = new THREE.Mesh(wireGeo, wireMat)
    wireframe.userData.boneName = boneName
    group.add(wireframe)

    const coreGeo = new THREE.SphereGeometry(jointSize * 0.3, 8, 8)
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9
    })
    const core = new THREE.Mesh(coreGeo, coreMat)
    core.userData.boneName = boneName
    group.add(core)

    return group
  }

  const createBoneLines = (boneMap: Map<string, THREE.Bone>) => {
    if (!boneLinesGroupRef.current) return

    boneLinesGroupRef.current.clear()

    boneMap.forEach((bone) => {
      if (bone.parent && (bone.parent as THREE.Bone).isBone) {
        const material = new THREE.LineBasicMaterial({
          color: 0x22c55e,
          linewidth: 2,
          depthTest: false
        })
        const geometry = new THREE.BufferGeometry()
        const positions = new Float32Array(6)
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))

        const line = new THREE.Line(geometry, material)
        line.renderOrder = 1001
        line.userData.parentBone = bone.parent
        line.userData.childBone = bone
        boneLinesGroupRef.current!.add(line)
      }
    })
  }

  const updateBoneLines = () => {
    if (!boneLinesGroupRef.current) return

    boneLinesGroupRef.current.children.forEach((child) => {
      const line = child as THREE.Line
      const parentBone = line.userData.parentBone as THREE.Bone
      const childBone = line.userData.childBone as THREE.Bone

      if (parentBone && childBone) {
        const parentPos = new THREE.Vector3()
        const childPos = new THREE.Vector3()
        parentBone.getWorldPosition(parentPos)
        childBone.getWorldPosition(childPos)

        const positions = (line.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array
        positions[0] = parentPos.x
        positions[1] = parentPos.y
        positions[2] = parentPos.z
        positions[3] = childPos.x
        positions[4] = childPos.y
        positions[5] = childPos.z
        line.geometry.attributes.position.needsUpdate = true
      }
    })
  }

  const handleBoneSelect = useCallback((boneName: string) => {
    const bone = bones.get(boneName)
    if (!bone) return

    // Update helper colors
    boneHelpersRef.current.forEach(helper => {
      const isSelected = helper.userData.boneName === boneName
      helper.traverse(child => {
        if ((child as THREE.Mesh).isMesh && (child as THREE.Mesh).material) {
          const mesh = child as THREE.Mesh
          const mat = mesh.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
          if (isSelected) {
            if (mesh.geometry.type === 'OctahedronGeometry') {
              mat.color.setHex(mat.wireframe ? 0xfcd34d : mat.side === THREE.BackSide ? 0xfbbf24 : 0xf59e0b)
            } else if (mesh.geometry.type === 'SphereGeometry') {
              mat.color.setHex(0xfef3c7)
            }
          } else {
            if (mesh.geometry.type === 'OctahedronGeometry') {
              mat.color.setHex(mat.wireframe ? 0x86efac : mat.side === THREE.BackSide ? 0x4ade80 : 0x22c55e)
            } else if (mesh.geometry.type === 'SphereGeometry') {
              mat.color.setHex(0xffffff)
            }
          }
        }
      })
      helper.scale.setScalar(isSelected ? 1.4 : 1)
    })

    setSelectedBone(bone)
  }, [bones])

  const goToFrame = useCallback((frame: number) => {
    const clampedFrame = Math.max(0, Math.min(frame, totalFrames))
    setCurrentFrame(clampedFrame)
    applyPoseAtFrame(clampedFrame)
  }, [totalFrames])

  const applyPoseAtFrame = useCallback((frame: number) => {
    if (!currentAnimation || currentAnimation.keyframes.size === 0) return

    const sortedFrames = Array.from(currentAnimation.keyframes.keys()).sort((a, b) => a - b)

    bones.forEach((bone, boneName) => {
      let prevFrame: number | null = null
      let nextFrame: number | null = null

      for (const f of sortedFrames) {
        if (currentAnimation.keyframes.get(f)?.has(boneName)) {
          if (f <= frame) prevFrame = f
          if (f >= frame && nextFrame === null) nextFrame = f
        }
      }

      if (prevFrame === null && nextFrame === null) return
      if (prevFrame === null) prevFrame = nextFrame!
      if (nextFrame === null) nextFrame = prevFrame!

      const prevData = currentAnimation.keyframes.get(prevFrame)?.get(boneName)
      const nextData = currentAnimation.keyframes.get(nextFrame)?.get(boneName)

      if (!prevData || !nextData) return

      let t = 0
      if (prevFrame !== nextFrame) {
        t = (frame - prevFrame) / (nextFrame - prevFrame)
      }

      bone.position.lerpVectors(prevData.position, nextData.position, t)
      const quat = new THREE.Quaternion()
      quat.slerpQuaternions(prevData.rotation, nextData.rotation, t)
      bone.rotation.setFromQuaternion(quat)
      bone.scale.lerpVectors(prevData.scale, nextData.scale, t)
    })
  }, [currentAnimation, bones])

  const addKeyframe = useCallback(() => {
    if (!selectedBone || !currentAnimationId) {
      showToast('Select a bone first', 'warning')
      return
    }

    setAnimations(prev => {
      const newAnimations = new Map(prev)
      const anim = newAnimations.get(currentAnimationId)
      if (!anim) return prev

      const newKeyframes = new Map(anim.keyframes)
      if (!newKeyframes.has(currentFrame)) {
        newKeyframes.set(currentFrame, new Map())
      }

      newKeyframes.get(currentFrame)!.set(selectedBone.name, {
        position: selectedBone.position.clone(),
        rotation: new THREE.Quaternion().setFromEuler(selectedBone.rotation),
        scale: selectedBone.scale.clone()
      })

      newAnimations.set(currentAnimationId, { ...anim, keyframes: newKeyframes })
      return newAnimations
    })

    showToast(`Keyframe added for ${selectedBone.name} at frame ${currentFrame}`, 'success')
  }, [selectedBone, currentAnimationId, currentFrame, showToast])

  const deleteKeyframe = useCallback(() => {
    if (!selectedBone || !currentAnimationId) return

    setAnimations(prev => {
      const newAnimations = new Map(prev)
      const anim = newAnimations.get(currentAnimationId)
      if (!anim) return prev

      const newKeyframes = new Map(anim.keyframes)
      const frameData = newKeyframes.get(currentFrame)
      if (frameData?.has(selectedBone.name)) {
        frameData.delete(selectedBone.name)
        if (frameData.size === 0) {
          newKeyframes.delete(currentFrame)
        }
        showToast('Keyframe deleted', 'info')
      }

      newAnimations.set(currentAnimationId, { ...anim, keyframes: newKeyframes })
      return newAnimations
    })
  }, [selectedBone, currentAnimationId, currentFrame, showToast])

  const resetBone = useCallback(() => {
    if (!selectedBone) return
    const original = originalTransformsRef.current.get(selectedBone.name)
    if (original) {
      selectedBone.position.copy(original.position)
      selectedBone.rotation.copy(original.rotation)
      selectedBone.scale.copy(original.scale)
      showToast('Bone reset', 'info')
    }
  }, [selectedBone, showToast])

  const resetAllBones = useCallback(() => {
    originalTransformsRef.current.forEach((transforms, boneName) => {
      const bone = bones.get(boneName)
      if (bone) {
        bone.position.copy(transforms.position)
        bone.rotation.copy(transforms.rotation)
        bone.scale.copy(transforms.scale)
      }
    })
    showToast('All bones reset', 'info')
  }, [bones, showToast])

  const copyPose = useCallback(() => {
    if (!selectedBone) return
    clipboardRef.current = {
      position: selectedBone.position.clone(),
      rotation: selectedBone.rotation.clone(),
      scale: selectedBone.scale.clone()
    }
    showToast('Pose copied', 'info')
  }, [selectedBone, showToast])

  const pastePose = useCallback(() => {
    if (!selectedBone || !clipboardRef.current) return
    selectedBone.position.copy(clipboardRef.current.position)
    selectedBone.rotation.copy(clipboardRef.current.rotation)
    selectedBone.scale.copy(clipboardRef.current.scale)
    showToast('Pose pasted', 'success')
  }, [selectedBone, showToast])

  const mirrorPose = useCallback(() => {
    if (!selectedBone) return

    const name = selectedBone.name
    let mirrorName = name

    if (name.includes('Left')) {
      mirrorName = name.replace('Left', 'Right')
    } else if (name.includes('Right')) {
      mirrorName = name.replace('Right', 'Left')
    }

    const mirrorBone = bones.get(mirrorName)
    if (mirrorBone) {
      mirrorBone.rotation.x = selectedBone.rotation.x
      mirrorBone.rotation.y = -selectedBone.rotation.y
      mirrorBone.rotation.z = -selectedBone.rotation.z
      showToast(`Mirrored to ${mirrorName}`, 'success')
    } else {
      showToast('No mirror bone found', 'warning')
    }
  }, [selectedBone, bones, showToast])

  const createNewAnimation = useCallback(() => {
    const id = `anim_${animationCounterRef.current++}`
    const newAnim: Animation = {
      name: `Animation ${animations.size + 1}`,
      fps: 24,
      totalFrames: 30,
      speed: 1,
      loop: true,
      keyframes: new Map()
    }

    setAnimations(prev => new Map(prev).set(id, newAnim))
    setCurrentAnimationId(id)
    setCurrentFrame(0)
    resetAllBones()
    showToast('New animation created', 'success')
  }, [animations.size, resetAllBones, showToast])

  const deleteAnimation = useCallback((animId: string) => {
    if (animations.size <= 1) {
      showToast('Cannot delete the only animation', 'warning')
      return
    }

    setAnimations(prev => {
      const newAnimations = new Map(prev)
      newAnimations.delete(animId)
      return newAnimations
    })

    if (currentAnimationId === animId) {
      const remaining = Array.from(animations.keys()).filter(id => id !== animId)
      setCurrentAnimationId(remaining[0] || null)
    }
  }, [animations, currentAnimationId, showToast])

  const duplicateAnimation = useCallback((animId: string) => {
    const source = animations.get(animId)
    if (!source) return

    const newId = `anim_${animationCounterRef.current++}`
    const newKeyframes = new Map<number, Map<string, BoneKeyframe>>()
    
    source.keyframes.forEach((frameData, frame) => {
      const newFrameData = new Map<string, BoneKeyframe>()
      frameData.forEach((boneData, boneName) => {
        newFrameData.set(boneName, {
          position: boneData.position.clone(),
          rotation: boneData.rotation.clone(),
          scale: boneData.scale.clone()
        })
      })
      newKeyframes.set(frame, newFrameData)
    })

    const newAnim: Animation = {
      ...source,
      name: source.name + ' (Copy)',
      keyframes: newKeyframes
    }

    setAnimations(prev => new Map(prev).set(newId, newAnim))
    showToast('Animation duplicated', 'success')
  }, [animations, showToast])

  // File loading
  const loadGLBFile = useCallback((file: File) => {
    showToast('Loading model...', 'info')

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer
        const loader = new GLTFLoader()

        loader.parse(arrayBuffer, '', (gltf) => {
          originalGLTFRef.current = gltf
          setLoadedFilename(file.name)

          // Clear existing model
          if (modelRef.current && sceneRef.current) {
            sceneRef.current.remove(modelRef.current)
          }

          // Add new model
          const model = gltf.scene
          model.position.set(0, 0, 0)

          // Normalize scale
          const box = new THREE.Box3().setFromObject(model)
          const size = box.getSize(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z)
          if (maxDim > 3) {
            model.scale.setScalar(2 / maxDim)
          }

          // Center
          box.setFromObject(model)
          const center = box.getCenter(new THREE.Vector3())
          model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z))

          // Setup shadows
          model.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              child.castShadow = true
              child.receiveShadow = true
            }
          })

          sceneRef.current?.add(model)
          modelRef.current = model

          // Find bones
          const boneMap = new Map<string, THREE.Bone>()
          const originalTransforms = new Map<string, { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }>()

          model.traverse((child) => {
            if ((child as THREE.SkinnedMesh).isSkinnedMesh && (child as THREE.SkinnedMesh).skeleton) {
              ;(child as THREE.SkinnedMesh).skeleton.bones.forEach((bone) => {
                boneMap.set(bone.name, bone)
                originalTransforms.set(bone.name, {
                  position: bone.position.clone(),
                  rotation: bone.rotation.clone(),
                  scale: bone.scale.clone()
                })
              })
            }
            if ((child as THREE.Bone).isBone) {
              boneMap.set(child.name, child as THREE.Bone)
              if (!originalTransforms.has(child.name)) {
                originalTransforms.set(child.name, {
                  position: (child as THREE.Bone).position.clone(),
                  rotation: (child as THREE.Bone).rotation.clone(),
                  scale: (child as THREE.Bone).scale.clone()
                })
              }
            }
          })

          // Create bone helpers
          const helpers: THREE.Group[] = []
          boneMap.forEach((bone, name) => {
            const helper = createBoneHelper(name)
            bone.add(helper)
            helpers.push(helper)
          })
          boneHelpersRef.current = helpers

          // Create bone lines
          createBoneLines(boneMap)

          setBones(boneMap)
          originalTransformsRef.current = originalTransforms
          setModelLoaded(true)
          setShowWelcome(false)
          setSelectedBone(null)

          showToast(`Model loaded! Found ${boneMap.size} bones.`, 'success')
        }, (error) => {
          console.error('GLB load error:', error)
          showToast('Failed to load model', 'error')
        })
      } catch (err) {
        console.error('Error loading GLB:', err)
        showToast('Failed to load model', 'error')
      }
    }
    reader.readAsArrayBuffer(file)
  }, [showToast])

  // Export JSON
  const exportJSON = useCallback(() => {
    if (!currentAnimation) return

    const keyframesObj: Record<number, Record<string, any>> = {}
    currentAnimation.keyframes.forEach((frameData, frame) => {
      keyframesObj[frame] = {}
      frameData.forEach((boneData, boneName) => {
        keyframesObj[frame][boneName] = {
          position: boneData.position.toArray(),
          rotation: [boneData.rotation.x, boneData.rotation.y, boneData.rotation.z, boneData.rotation.w],
          scale: boneData.scale.toArray()
        }
      })
    })

    const data = {
      name: currentAnimation.name,
      fps: currentAnimation.fps,
      totalFrames: currentAnimation.totalFrames,
      speed: currentAnimation.speed,
      loop: currentAnimation.loop,
      keyframes: keyframesObj,
      exportedAt: new Date().toISOString()
    }

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${currentAnimation.name.toLowerCase().replace(/\s+/g, '_')}.json`
    a.click()
    URL.revokeObjectURL(url)

    showToast('Animation exported as JSON', 'success')
  }, [currentAnimation, showToast])

  // Export GLB with animation
  const exportGLB = useCallback(() => {
    if (!currentAnimation || !modelRef.current) {
      showToast('No model or animation to export', 'warning')
      return
    }

    showToast('Generating GLB...', 'info')

    try {
      // Create animation clip from keyframes
      const tracks: THREE.KeyframeTrack[] = []
      const duration = totalFrames / fps

      // Collect all bones with keyframes
      const bonesWithKeyframes = new Set<string>()
      currentAnimation.keyframes.forEach((frameData) => {
        frameData.forEach((_, boneName) => bonesWithKeyframes.add(boneName))
      })

      bonesWithKeyframes.forEach(boneName => {
        const times: number[] = []
        const positions: number[] = []
        const quaternions: number[] = []
        const scales: number[] = []

        const sortedFrames = Array.from(currentAnimation.keyframes.keys()).sort((a, b) => a - b)

        sortedFrames.forEach(frame => {
          const boneData = currentAnimation.keyframes.get(frame)?.get(boneName)
          if (boneData) {
            times.push(frame / fps)
            positions.push(boneData.position.x, boneData.position.y, boneData.position.z)
            quaternions.push(boneData.rotation.x, boneData.rotation.y, boneData.rotation.z, boneData.rotation.w)
            scales.push(boneData.scale.x, boneData.scale.y, boneData.scale.z)
          }
        })

        if (times.length > 0) {
          tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.position`, times, positions))
          tracks.push(new THREE.QuaternionKeyframeTrack(`${boneName}.quaternion`, times, quaternions))
          tracks.push(new THREE.VectorKeyframeTrack(`${boneName}.scale`, times, scales))
        }
      })

      const clip = new THREE.AnimationClip(currentAnimation.name, duration, tracks)

      // Clone model for export
      const exportScene = modelRef.current.clone(true)
      exportScene.animations = [clip]

      // Export using GLTFExporter
      const exporter = new GLTFExporter()
      exporter.parse(
        exportScene,
        (result) => {
          const blob = new Blob([result as ArrayBuffer], { type: 'application/octet-stream' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${currentAnimation.name.toLowerCase().replace(/\s+/g, '_')}.glb`
          a.click()
          URL.revokeObjectURL(url)
          showToast('GLB exported successfully', 'success')
        },
        (error) => {
          console.error('GLB export error:', error)
          showToast('Failed to export GLB', 'error')
        },
        { binary: true, animations: [clip] }
      )
    } catch (err) {
      console.error('Export error:', err)
      showToast('Failed to export GLB', 'error')
    }
  }, [currentAnimation, totalFrames, fps, showToast])

  // Import JSON animation
  const importJSON = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string)
        
        // Create new animation from JSON
        const newId = `anim_${animationCounterRef.current++}`
        const newKeyframes = new Map<number, Map<string, BoneKeyframe>>()
        
        Object.entries(data.keyframes || {}).forEach(([frameStr, frameData]: [string, any]) => {
          const frame = parseInt(frameStr)
          const boneMap = new Map<string, BoneKeyframe>()
          
          Object.entries(frameData).forEach(([boneName, boneData]: [string, any]) => {
            boneMap.set(boneName, {
              position: new THREE.Vector3(...boneData.position),
              rotation: new THREE.Quaternion(...boneData.rotation),
              scale: new THREE.Vector3(...boneData.scale)
            })
          })
          
          newKeyframes.set(frame, boneMap)
        })
        
        const newAnim: Animation = {
          name: data.name || 'Imported Animation',
          fps: data.fps || 24,
          totalFrames: data.totalFrames || 30,
          speed: data.speed || 1,
          loop: data.loop !== false,
          keyframes: newKeyframes
        }
        
        setAnimations(prev => new Map(prev).set(newId, newAnim))
        setCurrentAnimationId(newId)
        setCurrentFrame(0)
        
        showToast(`Imported "${newAnim.name}"`, 'success')
      } catch (err) {
        console.error('JSON import error:', err)
        showToast('Failed to import animation', 'error')
      }
    }
    reader.readAsText(file)
  }, [showToast])

  // Undo function
  const undo = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setHistoryIndex(newIndex)
      const state = JSON.parse(history[newIndex])
      
      Object.entries(state).forEach(([boneName, transforms]: [string, any]) => {
        const bone = bones.get(boneName)
        if (bone) {
          bone.position.fromArray(transforms.position)
          bone.rotation.fromArray(transforms.rotation)
          bone.scale.fromArray(transforms.scale)
        }
      })
      
      showToast('Undo', 'info')
    }
  }, [historyIndex, history, bones, showToast])

  // Redo function
  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setHistoryIndex(newIndex)
      const state = JSON.parse(history[newIndex])
      
      Object.entries(state).forEach(([boneName, transforms]: [string, any]) => {
        const bone = bones.get(boneName)
        if (bone) {
          bone.position.fromArray(transforms.position)
          bone.rotation.fromArray(transforms.rotation)
          bone.scale.fromArray(transforms.scale)
        }
      })
      
      showToast('Redo', 'info')
    }
  }, [historyIndex, history, bones, showToast])

  // Save to history
  const saveToHistory = useCallback(() => {
    const state: Record<string, any> = {}
    bones.forEach((bone, name) => {
      state[name] = {
        position: bone.position.toArray(),
        rotation: bone.rotation.toArray(),
        scale: bone.scale.toArray()
      }
    })
    
    const stateStr = JSON.stringify(state)
    
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push(stateStr)
      if (newHistory.length > maxHistory) newHistory.shift()
      return newHistory
    })
    setHistoryIndex(prev => Math.min(prev + 1, maxHistory - 1))
  }, [bones, historyIndex])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          setIsPlaying(p => !p)
          break
        case 'KeyV': setCurrentTool('select'); break
        case 'KeyR': setCurrentTool('rotate'); break
        case 'KeyT': setCurrentTool('translate'); break
        case 'KeyS':
          if (!e.ctrlKey && !e.metaKey) setCurrentTool('scale')
          break
        case 'KeyB': setShowBoneView(v => !v); break
        case 'KeyK': addKeyframe(); break
        case 'KeyZ':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            if (e.shiftKey) {
              redo()
            } else {
              undo()
            }
          }
          break
        case 'KeyY':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            redo()
          }
          break
        case 'KeyC':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            copyPose()
          }
          break
        case 'KeyX':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            copyPose()
            resetBone()
          }
          break
        case 'Delete':
        case 'Backspace':
          deleteKeyframe()
          break
        case 'ArrowLeft': goToFrame(currentFrame - 1); break
        case 'ArrowRight': goToFrame(currentFrame + 1); break
        case 'Home': goToFrame(0); break
        case 'End': goToFrame(totalFrames); break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentFrame, goToFrame, addKeyframe, deleteKeyframe, undo, redo, copyPose, resetBone, totalFrames])

  // Canvas click for bone selection
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const handleClick = (e: MouseEvent) => {
      if (!cameraRef.current || !sceneRef.current) return

      const rect = canvas.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      )

      const raycaster = new THREE.Raycaster()
      raycaster.setFromCamera(mouse, cameraRef.current)

      const meshesToTest: THREE.Mesh[] = []
      boneHelpersRef.current.forEach(helper => {
        helper.traverse(child => {
          if ((child as THREE.Mesh).isMesh) {
            meshesToTest.push(child as THREE.Mesh)
          }
        })
      })

      const intersects = raycaster.intersectObjects(meshesToTest, false)

      if (intersects.length > 0) {
        let obj: THREE.Object3D | null = intersects[0].object
        while (obj && !obj.userData.boneName) {
          obj = obj.parent
        }
        if (obj?.userData.boneName) {
          handleBoneSelect(obj.userData.boneName)
        }
      }
    }

    canvas.addEventListener('click', handleClick)
    return () => canvas.removeEventListener('click', handleClick)
  }, [handleBoneSelect])

  // Drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
      loadGLBFile(file)
    } else {
      showToast('Please drop a .glb or .gltf file', 'error')
    }
  }, [loadGLBFile, showToast])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <div 
      ref={containerRef} 
      className="relative w-full h-[calc(100vh-52px)]"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Welcome Screen */}
      {showWelcome && (
        <div className="absolute inset-0 bg-[#0f1117]/95 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="max-w-md w-full mx-4 bg-[#151821] border border-[#252b3d] rounded-2xl p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-[#22c55e] to-[#16a34a] rounded-2xl flex items-center justify-center text-4xl shadow-lg shadow-[#22c55e]/20">
              🎬
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Welcome to Frim</h2>
            <p className="text-[#a1a1aa] mb-8">GLB Animation Editor - Create and edit skeletal animations</p>
            
            <div className="space-y-3">
              <button
                onClick={() => {
                  if (sceneRef.current) {
                    createSampleArmature(sceneRef.current)
                  }
                }}
                className="w-full py-3 px-4 bg-[#22c55e] text-[#09090b] rounded-xl font-semibold hover:bg-[#4ade80] transition-colors flex items-center justify-center gap-2"
              >
                🤖 Load Sample Model
              </button>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 bg-[#1c2130] text-white border border-[#252b3d] rounded-xl font-semibold hover:bg-[#252b3d] transition-colors flex items-center justify-center gap-2"
              >
                📂 Import GLB/GLTF File
              </button>
            </div>
            
            <div className="mt-8 pt-6 border-t border-[#252b3d]">
              <p className="text-xs text-[#71717a]">
                Drop a .glb or .gltf file anywhere to import
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".glb,.gltf"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && loadGLBFile(e.target.files[0])}
      />
      <input
        type="file"
        id="json-import-input"
        accept=".json"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])}
      />

      {/* Top Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#151821] border border-[#252b3d] rounded-xl flex gap-1 p-1.5 z-10">
        {/* File operations */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg text-[#a1a1aa] hover:bg-[#1c2130] transition-colors"
          title="Load Model (GLB/GLTF)"
        >
          📂
        </button>
        <button
          onClick={() => document.getElementById('json-import-input')?.click()}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg text-[#a1a1aa] hover:bg-[#1c2130] transition-colors"
          title="Import Animation (JSON)"
        >
          📥
        </button>
        <button
          onClick={exportJSON}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg text-[#a1a1aa] hover:bg-[#1c2130] transition-colors"
          title="Export JSON"
        >
          📄
        </button>
        <button
          onClick={exportGLB}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg text-[#a1a1aa] hover:bg-[#1c2130] transition-colors"
          title="Export GLB with Animation"
        >
          💾
        </button>
        <div className="w-px h-8 my-1 bg-[#252b3d]" />
        
        {/* Undo/Redo */}
        <button
          onClick={undo}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg text-[#a1a1aa] hover:bg-[#1c2130] transition-colors disabled:opacity-30"
          title="Undo (Ctrl+Z)"
          disabled={historyIndex <= 0}
        >
          ↩
        </button>
        <button
          onClick={redo}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-lg text-[#a1a1aa] hover:bg-[#1c2130] transition-colors disabled:opacity-30"
          title="Redo (Ctrl+Y)"
          disabled={historyIndex >= history.length - 1}
        >
          ↪
        </button>
        <div className="w-px h-8 my-1 bg-[#252b3d]" />
        
        {/* Transform tools */}
        {(['select', 'rotate', 'translate', 'scale'] as const).map(tool => (
          <button
            key={tool}
            onClick={() => setCurrentTool(tool)}
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-colors ${
              currentTool === tool ? 'bg-[#22c55e] text-[#09090b]' : 'text-[#a1a1aa] hover:bg-[#1c2130]'
            }`}
            title={`${tool.charAt(0).toUpperCase() + tool.slice(1)} (${tool[0].toUpperCase()})`}
          >
            {tool === 'select' && '◇'}
            {tool === 'rotate' && '↻'}
            {tool === 'translate' && '✥'}
            {tool === 'scale' && '⤢'}
          </button>
        ))}
        <div className="w-px h-8 my-1 bg-[#252b3d]" />
        
        {/* View toggles */}
        <button
          onClick={() => setShowGrid(v => !v)}
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-colors ${
            showGrid ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'text-[#a1a1aa] hover:bg-[#1c2130]'
          }`}
          title="Toggle Grid"
        >
          #
        </button>
        <button
          onClick={() => setShowBoneView(v => !v)}
          className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-colors ${
            showBoneView ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'text-[#a1a1aa] hover:bg-[#1c2130]'
          }`}
          title="Toggle Bone View (B)"
        >
          🦴
        </button>
      </div>

      {/* Left Panel - Bones */}
      <div className="absolute top-4 left-4 bottom-[180px] w-[240px] bg-[#151821] border border-[#252b3d] rounded-xl overflow-hidden flex flex-col z-10">
        <div className="p-3 border-b border-[#252b3d] flex items-center justify-between">
          <h3 className="text-xs tracking-widest text-[#71717a] font-semibold">SKELETON</h3>
          <span className="text-xs text-[#71717a]">{bones.size} bones</span>
        </div>
        
        {/* Quick Bone Select */}
        <div className="p-2 border-b border-[#252b3d] bg-[#0f1117]">
          <div className="grid grid-cols-5 gap-1">
            {[
              { emoji: '🧠', bones: ['Head', 'Neck'], label: 'Head' },
              { emoji: '💪', bones: ['LeftArm', 'LeftForeArm', 'LeftHand', 'LeftShoulder'], label: 'L Arm' },
              { emoji: '🦵', bones: ['Spine', 'Spine1', 'Spine2', 'Hips'], label: 'Spine' },
              { emoji: '💪', bones: ['RightArm', 'RightForeArm', 'RightHand', 'RightShoulder'], label: 'R Arm' },
              { emoji: '🦶', bones: ['LeftUpLeg', 'LeftLeg', 'LeftFoot'], label: 'L Leg' },
              { emoji: '🖐', bones: ['LeftHand'], label: 'L Hand' },
              { emoji: '🦴', bones: ['Hips'], label: 'Hips' },
              { emoji: '🖐', bones: ['RightHand'], label: 'R Hand' },
              { emoji: '🦶', bones: ['RightUpLeg', 'RightLeg', 'RightFoot'], label: 'R Leg' },
            ].map((item, idx) => {
              // Find first matching bone
              const matchingBone = item.bones.find(b => bones.has(b))
              return (
                <button
                  key={idx}
                  onClick={() => matchingBone && handleBoneSelect(matchingBone)}
                  className={`p-1.5 rounded text-xs transition-colors ${
                    matchingBone && item.bones.includes(selectedBone?.name || '')
                      ? 'bg-[#22c55e]/30 text-[#22c55e]'
                      : matchingBone
                      ? 'hover:bg-[#1c2130] text-[#a1a1aa]'
                      : 'opacity-30 cursor-not-allowed text-[#71717a]'
                  }`}
                  title={item.label}
                  disabled={!matchingBone}
                >
                  {item.emoji}
                </button>
              )
            })}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-0.5 font-mono text-xs">
            {Array.from(bones.keys()).map(name => (
              <div
                key={name}
                onClick={() => handleBoneSelect(name)}
                className={`px-2 py-1.5 rounded cursor-pointer transition-colors ${
                  selectedBone?.name === name 
                    ? 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30' 
                    : 'hover:bg-[#1c2130] text-[#a1a1aa]'
                }`}
              >
                {name}
              </div>
            ))}
          </div>
        </div>
        <div className="p-3 border-t border-[#252b3d]">
          <p className="text-[10px] text-[#71717a]">📦 {loadedFilename || 'No model'}</p>
        </div>
      </div>

      {/* Right Panel - Properties & Animations */}
      <div className="absolute top-4 right-4 bottom-[180px] w-[260px] bg-[#151821] border border-[#252b3d] rounded-xl overflow-hidden flex flex-col z-10">
        {/* Properties Section */}
        <div className="p-3 border-b border-[#252b3d]">
          <h3 className="text-xs tracking-widest text-[#71717a] font-semibold">PROPERTIES</h3>
        </div>
        {selectedBone ? (
          <div className="p-3 space-y-3 border-b border-[#252b3d] max-h-[300px] overflow-y-auto">
            <div className="flex items-center justify-between">
              <span className="text-xs text-[#71717a]">Selected:</span>
              <span className="font-mono text-sm text-[#22c55e]">{selectedBone.name}</span>
            </div>
            
            {/* Transform values */}
            <div className="space-y-2">
              {/* Rotation */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-[#71717a] w-12">Rotation</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {['x', 'y', 'z'].map((axis) => (
                    <div key={`rot-${axis}`} className="relative">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-[#71717a] uppercase">{axis}</span>
                      <input
                        type="number"
                        step="0.1"
                        value={(selectedBone.rotation[axis as 'x' | 'y' | 'z'] * (180 / Math.PI)).toFixed(1)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value) * (Math.PI / 180)
                          selectedBone.rotation[axis as 'x' | 'y' | 'z'] = val
                          saveToHistory()
                        }}
                        className="w-full bg-[#0f1117] border border-[#252b3d] rounded px-1 pl-4 py-1 text-[10px] text-[#f4f4f5] text-right"
                      />
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Position */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-[#71717a] w-12">Position</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {['x', 'y', 'z'].map((axis) => (
                    <div key={`pos-${axis}`} className="relative">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-[#71717a] uppercase">{axis}</span>
                      <input
                        type="number"
                        step="0.01"
                        value={selectedBone.position[axis as 'x' | 'y' | 'z'].toFixed(3)}
                        onChange={(e) => {
                          selectedBone.position[axis as 'x' | 'y' | 'z'] = parseFloat(e.target.value)
                          saveToHistory()
                        }}
                        className="w-full bg-[#0f1117] border border-[#252b3d] rounded px-1 pl-4 py-1 text-[10px] text-[#f4f4f5] text-right"
                      />
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Scale */}
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-[#71717a] w-12">Scale</span>
                </div>
                <div className="grid grid-cols-3 gap-1">
                  {['x', 'y', 'z'].map((axis) => (
                    <div key={`scale-${axis}`} className="relative">
                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] text-[#71717a] uppercase">{axis}</span>
                      <input
                        type="number"
                        step="0.1"
                        value={selectedBone.scale[axis as 'x' | 'y' | 'z'].toFixed(2)}
                        onChange={(e) => {
                          selectedBone.scale[axis as 'x' | 'y' | 'z'] = parseFloat(e.target.value)
                          saveToHistory()
                        }}
                        className="w-full bg-[#0f1117] border border-[#252b3d] rounded px-1 pl-4 py-1 text-[10px] text-[#f4f4f5] text-right"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={addKeyframe}
                className="py-2 bg-[#22c55e] text-[#09090b] rounded-lg font-semibold text-xs hover:bg-[#4ade80] transition-colors"
              >
                🔑 Keyframe
              </button>
              <button
                onClick={resetBone}
                className="py-2 bg-[#27272a] text-[#a1a1aa] border border-[#3f3f46] rounded-lg text-xs hover:bg-[#3f3f46] transition-colors"
              >
                ↺ Reset
              </button>
            </div>
            <div className="grid grid-cols-3 gap-1">
              <button onClick={copyPose} className="py-1.5 bg-[#27272a] text-[#a1a1aa] rounded text-[10px] hover:bg-[#3f3f46]">Copy</button>
              <button onClick={pastePose} className="py-1.5 bg-[#27272a] text-[#a1a1aa] rounded text-[10px] hover:bg-[#3f3f46]">Paste</button>
              <button onClick={mirrorPose} className="py-1.5 bg-[#27272a] text-[#a1a1aa] rounded text-[10px] hover:bg-[#3f3f46]">Mirror</button>
            </div>
          </div>
        ) : (
          <div className="p-4 text-center text-[#71717a] text-xs border-b border-[#252b3d]">
            Click a bone to select
          </div>
        )}

        {/* Animations Section */}
        <div className="p-3 border-b border-[#252b3d] flex items-center justify-between">
          <h3 className="text-xs tracking-widest text-[#71717a] font-semibold">ANIMATIONS</h3>
          <button
            onClick={createNewAnimation}
            className="w-6 h-6 rounded bg-[#22c55e] text-[#09090b] text-xs font-bold hover:bg-[#4ade80]"
          >
            +
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {Array.from(animations.entries()).map(([id, anim]) => (
              <div
                key={id}
                onClick={() => {
                  setCurrentAnimationId(id)
                  setCurrentFrame(0)
                  resetAllBones()
                  applyPoseAtFrame(0)
                }}
                className={`p-2 rounded-lg cursor-pointer transition-colors ${
                  currentAnimationId === id
                    ? 'bg-[#22c55e]/20 border border-[#22c55e]/30'
                    : 'hover:bg-[#1c2130]'
                }`}
              >
                <div className="flex items-center justify-between">
                  {currentAnimationId === id ? (
                    <input
                      type="text"
                      value={anim.name}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        setAnimations(prev => {
                          const newAnimations = new Map(prev)
                          const current = newAnimations.get(id)
                          if (current) {
                            newAnimations.set(id, { ...current, name: e.target.value })
                          }
                          return newAnimations
                        })
                      }}
                      className="text-xs font-medium text-[#f4f4f5] bg-transparent border-b border-[#22c55e] outline-none w-24"
                    />
                  ) : (
                    <span className="text-xs font-medium text-[#f4f4f5]">{anim.name}</span>
                  )}
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); duplicateAnimation(id) }}
                      className="w-5 h-5 rounded text-[10px] text-[#71717a] hover:bg-[#252b3d]"
                      title="Duplicate"
                    >
                      📋
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteAnimation(id) }}
                      className="w-5 h-5 rounded text-[10px] text-[#71717a] hover:bg-[#252b3d]"
                      title="Delete"
                    >
                      🗑
                    </button>
                  </div>
                </div>
                <p className="text-[10px] text-[#71717a] mt-0.5">
                  {anim.totalFrames}f @ {anim.fps}fps · {anim.keyframes.size} keys
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom Panel - Timeline */}
      <div className="absolute bottom-0 left-0 right-0 h-[160px] bg-[#151821] border-t border-[#252b3d] z-10">
        {/* Controls bar */}
        <div className="flex items-center justify-between px-4 py-2 bg-[#0f1117] border-b border-[#252b3d]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToFrame(currentFrame - 1)}
              className="w-8 h-8 bg-[#151821] border border-[#252b3d] rounded-md text-[#a1a1aa] hover:bg-[#1c2130] text-sm"
            >
              ⏮
            </button>
            <button
              onClick={() => setIsPlaying(p => !p)}
              className={`w-8 h-8 border border-[#252b3d] rounded-md text-sm ${
                isPlaying ? 'bg-[#22c55e] text-[#09090b]' : 'bg-[#151821] text-[#a1a1aa] hover:bg-[#1c2130]'
              }`}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button
              onClick={() => { setIsPlaying(false); goToFrame(0) }}
              className="w-8 h-8 bg-[#151821] border border-[#252b3d] rounded-md text-[#a1a1aa] hover:bg-[#1c2130] text-sm"
            >
              ⏹
            </button>
            <button
              onClick={() => goToFrame(currentFrame + 1)}
              className="w-8 h-8 bg-[#151821] border border-[#252b3d] rounded-md text-[#a1a1aa] hover:bg-[#1c2130] text-sm"
            >
              ⏭
            </button>
            <div className="flex items-center gap-1 font-mono text-sm text-[#a1a1aa] ml-2">
              <input
                type="number"
                value={currentFrame}
                onChange={(e) => goToFrame(parseInt(e.target.value) || 0)}
                className="w-12 bg-[#0f1117] border border-[#252b3d] rounded px-2 py-1 text-center text-[#f4f4f5] text-xs"
              />
              <span>/</span>
              <input
                type="number"
                value={totalFrames}
                onChange={(e) => {
                  if (!currentAnimationId) return
                  const frames = Math.max(1, Math.min(parseInt(e.target.value) || 30, 600))
                  setAnimations(prev => {
                    const newAnimations = new Map(prev)
                    const anim = newAnimations.get(currentAnimationId)
                    if (anim) {
                      newAnimations.set(currentAnimationId, { ...anim, totalFrames: frames })
                    }
                    return newAnimations
                  })
                }}
                className="w-12 bg-[#0f1117] border border-[#252b3d] rounded px-2 py-1 text-center text-[#f4f4f5] text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#a1a1aa]">
            <div className="flex items-center gap-2">
              <span>FPS:</span>
              <select
                value={fps}
                onChange={(e) => {
                  if (!currentAnimationId) return
                  setAnimations(prev => {
                    const newAnimations = new Map(prev)
                    const anim = newAnimations.get(currentAnimationId)
                    if (anim) {
                      newAnimations.set(currentAnimationId, { ...anim, fps: parseInt(e.target.value) })
                    }
                    return newAnimations
                  })
                }}
                className="bg-[#0f1117] border border-[#252b3d] rounded px-2 py-1 text-[#f4f4f5]"
              >
                <option value={12}>12</option>
                <option value={24}>24</option>
                <option value={30}>30</option>
                <option value={60}>60</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span>Speed:</span>
              <input
                type="range"
                min="0.1"
                max="2"
                step="0.1"
                value={speed}
                onChange={(e) => {
                  if (!currentAnimationId) return
                  setAnimations(prev => {
                    const newAnimations = new Map(prev)
                    const anim = newAnimations.get(currentAnimationId)
                    if (anim) {
                      newAnimations.set(currentAnimationId, { ...anim, speed: parseFloat(e.target.value) })
                    }
                    return newAnimations
                  })
                }}
                className="w-20"
              />
              <span className="w-8">{speed.toFixed(1)}x</span>
            </div>
            <label className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={loop}
                onChange={(e) => {
                  if (!currentAnimationId) return
                  setAnimations(prev => {
                    const newAnimations = new Map(prev)
                    const anim = newAnimations.get(currentAnimationId)
                    if (anim) {
                      newAnimations.set(currentAnimationId, { ...anim, loop: e.target.checked })
                    }
                    return newAnimations
                  })
                }}
                className="rounded"
              />
              Loop
            </label>
          </div>
        </div>

        {/* Timeline */}
        <div className="relative h-[calc(100%-44px)] overflow-x-auto">
          {/* Ruler */}
          <div className="h-6 bg-[#0f1117] border-b border-[#252b3d] relative min-w-full" style={{ width: `${totalFrames * 20 + 100}px` }}>
            {Array.from({ length: Math.ceil(totalFrames / 5) + 1 }).map((_, i) => (
              <span
                key={i}
                className="absolute text-[10px] text-[#71717a] font-mono top-1"
                style={{ left: `${i * 5 * 20}px` }}
              >
                {i * 5}
              </span>
            ))}
          </div>

          {/* Track */}
          <div
            className="h-[calc(100%-24px)] relative cursor-pointer"
            style={{ 
              width: `${totalFrames * 20 + 100}px`,
              background: 'repeating-linear-gradient(90deg, #252b3d 0px, #252b3d 1px, transparent 1px, transparent 20px)'
            }}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - rect.left + e.currentTarget.parentElement!.scrollLeft
              const frame = Math.round(x / 20)
              goToFrame(frame)
            }}
          >
            {/* Keyframe markers */}
            {currentAnimation?.keyframes && Array.from(currentAnimation.keyframes.entries()).map(([frame, frameData]) => (
              Array.from(frameData.keys()).map((boneName, idx) => (
                <div
                  key={`${frame}-${boneName}`}
                  className={`absolute w-3 h-3 rounded-sm rotate-45 -translate-x-1/2 cursor-pointer hover:scale-125 transition-transform ${
                    selectedBone?.name === boneName ? 'bg-[#fbbf24] border-2 border-[#151821]' : 'bg-[#22c55e] border-2 border-[#151821]'
                  }`}
                  style={{ 
                    left: `${frame * 20}px`, 
                    top: `${20 + idx * 16}px`
                  }}
                  title={`${boneName} @ frame ${frame}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    goToFrame(frame)
                    handleBoneSelect(boneName)
                  }}
                />
              ))
            ))}

            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-[#22c55e] pointer-events-none z-10"
              style={{ left: `${currentFrame * 20}px` }}
            >
              <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-[#22c55e]" />
            </div>
          </div>
        </div>
      </div>

      {/* Toast container */}
      <div id="toast-container" className="fixed bottom-[180px] right-4 flex flex-col-reverse gap-2 z-50" />

      <style jsx global>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.3s ease-out; }
      `}</style>
    </div>
  )
}

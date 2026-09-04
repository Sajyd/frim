'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
// MediaPipe Pose is loaded dynamically from CDN when video capture is used
import {
  FolderOpen,
  Download,
  Upload,
  FileJson,
  Save,
  Undo2,
  Redo2,
  MousePointer2,
  RotateCcw,
  Move,
  Maximize2,
  Grid3X3,
  Bone,
  Play,
  Pause,
  Square,
  SkipBack,
  SkipForward,
  Plus,
  Copy,
  Trash2,
  Key,
  RefreshCw,
  Clipboard,
  ClipboardPaste,
  FlipHorizontal,
  Zap,
  Lock,
  Package,
  Bot,
  Check,
  X,
  AlertTriangle,
  Info,
  Video,
  Loader2,
  Sparkles
} from 'lucide-react'

interface EditorProps {
  projectName: string
  onChange: (data: ProjectData) => void
  saving: boolean
  initialData?: {
    animations?: any[]
    modelData?: string
    modelName?: string
  }
  animationLimit?: number
  isPro?: boolean
  canUseVideoAnalysis?: boolean
}

interface ProjectData {
  animations: any[]
  modelName: string
  modelData?: string
  thumbnail?: string
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

function normBoneName(n: string) {
  return n.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/** Pick the shortest Mixamo/generic bone whose name ends with one of the aliases. */
function matchNamedBone(order: string[], aliases: string[]): string | null {
  const wants = aliases.map(normBoneName)
  let best: string | null = null
  let bestLen = Infinity
  for (const boneName of order) {
    const n = normBoneName(boneName)
    if (/thumb|index|middle|ring|pinky|eye|end$/.test(n)) continue
    for (const w of wants) {
      if (n === w || n.endsWith(w)) {
        if (n.length < bestLen) { best = boneName; bestLen = n.length }
      }
    }
  }
  return best
}

/**
 * Analytic two-bone IK. Reaches `target` with rest lengths `len1`/`len2` and
 * bends toward `pole` so elbows/knees come off the image plane (true depth).
 */
function solveTwoBoneIK(
  origin: THREE.Vector3,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  len1: number,
  len2: number,
): { mid: THREE.Vector3; end: THREE.Vector3 } {
  const axis = target.clone().sub(origin)
  const distRaw = axis.length()
  if (len1 < 1e-6 || len2 < 1e-6 || distRaw < 1e-8) {
    return { mid: origin.clone(), end: target.clone() }
  }
  axis.multiplyScalar(1 / distRaw)
  const maxLen = (len1 + len2) * 0.999
  const minLen = Math.abs(len1 - len2) + 1e-4
  const dist = THREE.MathUtils.clamp(distRaw, minLen, maxLen)
  const end = origin.clone().add(axis.clone().multiplyScalar(dist))

  let cosA = (len1 * len1 + dist * dist - len2 * len2) / (2 * len1 * dist)
  cosA = THREE.MathUtils.clamp(cosA, -1, 1)
  const a = Math.acos(cosA)

  const toPole = pole.clone().sub(origin)
  let n = new THREE.Vector3().crossVectors(axis, toPole)
  if (n.lengthSq() < 1e-10) {
    n.crossVectors(axis, Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0))
  }
  n.normalize()
  const ortho = new THREE.Vector3().crossVectors(n, axis).normalize()

  const mid = origin.clone()
    .add(axis.clone().multiplyScalar(len1 * Math.cos(a)))
    .add(ortho.clone().multiplyScalar(len1 * Math.sin(a)))
  return { mid, end }
}

function slerpKeepHemisphere(a: THREE.Quaternion, b: THREE.Quaternion, t: number) {
  const qa = a.clone()
  const qb = b.clone()
  if (qa.dot(qb) < 0) qb.negate()
  return qa.slerp(qb, t)
}

export default function ThreeEditor({ projectName, onChange, saving, initialData, animationLimit = 2, isPro = false, canUseVideoAnalysis = false }: EditorProps) {
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
  const boneVisualizerGroupRef = useRef<THREE.Group | null>(null)
  const modelRef = useRef<THREE.Group | null>(null)
  const modelSelectionBoxRef = useRef<THREE.BoxHelper | null>(null)
  const originalGLTFRef = useRef<any>(null)
  const modelDataRef = useRef<string | null>(null)  // Store base64 encoded model data

  // Editor state
  const [currentTool, setCurrentTool] = useState<'select' | 'rotate' | 'translate' | 'scale'>('rotate')
  const [selectedBone, setSelectedBone] = useState<THREE.Bone | null>(null)
  const [isModelSelected, setIsModelSelected] = useState(false)
  const [bones, setBones] = useState<Map<string, THREE.Bone>>(new Map())
  const [currentFrame, setCurrentFrame] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [modelLoaded, setModelLoaded] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [sceneReady, setSceneReady] = useState(false)
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
  const saveToHistoryRef = useRef<(() => void) | null>(null)
  const notifyChangeRef = useRef<(() => void) | null>(null)

  // Clipboard
  const clipboardRef = useRef<{ position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 } | null>(null)

  // Upgrade modal
  const [showUpgradeModal, setShowUpgradeModal] = useState(false)
  const [upgradeModalReason, setUpgradeModalReason] = useState<'animation_limit' | 'video_analysis'>('animation_limit')

  // Video analysis modal
  const [showVideoModal, setShowVideoModal] = useState(false)
  const [videoFile, setVideoFile] = useState<File | null>(null)
  const [videoAnalyzing, setVideoAnalyzing] = useState(false)
  const [videoProgress, setVideoProgress] = useState(0)
  const videoInputRef = useRef<HTMLInputElement>(null)

  // GLB export modal
  const [showExportModal, setShowExportModal] = useState(false)
  const [selectedExportAnimations, setSelectedExportAnimations] = useState<Set<string>>(new Set())
  const [exportFilename, setExportFilename] = useState('model_animated')
  
  // Reset bones modal
  const [showResetBonesModal, setShowResetBonesModal] = useState(false)
  const [selectedResetBones, setSelectedResetBones] = useState<Set<string>>(new Set())
  const [resetAddKeyframe, setResetAddKeyframe] = useState(true)
  
  // Keyframe dragging
  const [draggingKeyframe, setDraggingKeyframe] = useState<{boneName: string, fromFrame: number} | null>(null)
  const [exportIncludeModel, setExportIncludeModel] = useState(true)
  const [exportingGLB, setExportingGLB] = useState(false)
  
  // Keyframe selection state
  const [selectedKeyframes, setSelectedKeyframes] = useState<Set<string>>(new Set()) // Set of "frame:boneName" strings
  const [boxSelection, setBoxSelection] = useState<{active: boolean, startX: number, startY: number, currentX: number, currentY: number} | null>(null)
  const timelineTracksRef = useRef<HTMLDivElement>(null)

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

  // Serialize animations for saving
  const serializeAnimations = useCallback(() => {
    const serialized: any[] = []
    animations.forEach((anim, id) => {
      const keyframesObj: Record<number, Record<string, any>> = {}
      anim.keyframes.forEach((frameData, frame) => {
        keyframesObj[frame] = {}
        frameData.forEach((boneData, boneName) => {
          keyframesObj[frame][boneName] = {
            position: boneData.position.toArray(),
            rotation: [boneData.rotation.x, boneData.rotation.y, boneData.rotation.z, boneData.rotation.w],
            scale: boneData.scale.toArray()
          }
        })
      })
      serialized.push({
        id,
        name: anim.name,
        fps: anim.fps,
        totalFrames: anim.totalFrames,
        speed: anim.speed,
        loop: anim.loop,
        keyframes: keyframesObj
      })
    })
    return serialized
  }, [animations])

  // Capture thumbnail from the scene
  const captureThumbnail = useCallback((): string | undefined => {
    if (!rendererRef.current || !sceneRef.current || !cameraRef.current || !modelLoaded) {
      return undefined
    }

    try {
      // Render the scene
      rendererRef.current.render(sceneRef.current, cameraRef.current)
      
      // Get the canvas data as base64
      const canvas = rendererRef.current.domElement
      
      // Create a smaller canvas for thumbnail (400x300)
      const thumbCanvas = document.createElement('canvas')
      const thumbWidth = 400
      const thumbHeight = 300
      thumbCanvas.width = thumbWidth
      thumbCanvas.height = thumbHeight
      
      const ctx = thumbCanvas.getContext('2d')
      if (!ctx) return undefined
      
      // Draw the main canvas scaled down to thumbnail size
      ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, thumbWidth, thumbHeight)
      
      // Return as base64 JPEG (smaller file size)
      return thumbCanvas.toDataURL('image/jpeg', 0.8)
    } catch (err) {
      console.error('Failed to capture thumbnail:', err)
      return undefined
    }
  }, [modelLoaded])

  // Get current project data for saving
  const getProjectData = useCallback((): ProjectData => {
    return {
      animations: serializeAnimations(),
      modelName: loadedFilename,
      modelData: modelDataRef.current || undefined,
      thumbnail: captureThumbnail()
    }
  }, [serializeAnimations, loadedFilename, captureThumbnail])

  // Notify parent of changes
  const notifyChange = useCallback(() => {
    onChange(getProjectData())
  }, [onChange, getProjectData])

  // Toast notification
  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    const container = document.getElementById('toast-container')
    if (!container) return

    const colors: Record<string, string> = {
      success: 'bg-green-500',
      error: 'bg-red-500',
      warning: 'bg-yellow-500',
      info: 'bg-blue-500'
    }

    const toast = document.createElement('div')
    toast.className = `flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg ${colors[type]} text-white animate-slide-up`
    
    const iconSpan = document.createElement('span')
    iconSpan.className = 'w-4 h-4'
    if (type === 'success') iconSpan.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>'
    else if (type === 'error') iconSpan.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>'
    else if (type === 'warning') iconSpan.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
    else iconSpan.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>'
    
    const textSpan = document.createElement('span')
    textSpan.textContent = message
    
    toast.appendChild(iconSpan)
    toast.appendChild(textSpan)
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
      // Save to history and notify parent when dragging ends
      if (!event.value) {
        if (saveToHistoryRef.current) {
          saveToHistoryRef.current()
        }
        if (notifyChangeRef.current) {
          notifyChangeRef.current()
        }
      }
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
    const gridHelper = new THREE.GridHelper(20, 40, 0x22c55e, 0x252b3d)
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

    // Bone visualizer group (for octahedron helpers)
    const boneVisualizerGroup = new THREE.Group()
    boneVisualizerGroup.renderOrder = 1000
    scene.add(boneVisualizerGroup)
    boneVisualizerGroupRef.current = boneVisualizerGroup

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
    // Mark scene as ready for initial data loading
    setSceneReady(true)

    return () => {
      cancelAnimationFrame(animationIdRef.current)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
    }
  }, [])

  // Apply pose interpolation at a specific frame
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

  // Reset only bones that don't have keyframes to T-pose
  const resetBonesWithoutKeyframes = useCallback((anim: Animation | null | undefined) => {
    if (!anim) return
    
    // Get all bones that have keyframes in this animation
    const bonesWithKeyframes = new Set<string>()
    anim.keyframes.forEach((frameData) => {
      frameData.forEach((_, boneName) => {
        bonesWithKeyframes.add(boneName)
      })
    })
    
    console.log('Bones with keyframes:', bonesWithKeyframes.size)
    
    // Reset only bones that don't have keyframes to T-pose
    let resetCount = 0
    originalTransformsRef.current.forEach((transforms, boneName) => {
      if (!bonesWithKeyframes.has(boneName)) {
        const bone = bones.get(boneName)
        if (bone) {
          bone.position.copy(transforms.position)
          bone.rotation.copy(transforms.rotation)
          bone.scale.copy(transforms.scale)
          resetCount++
        }
      }
    })
    
    console.log(`Auto-reset ${resetCount} bones without keyframes to T-pose`)
  }, [bones])

  // Apply pose when animation changes or is loaded
  useEffect(() => {
    if (currentAnimation && !isPlaying) {
      // Auto-reset bones without keyframes to T-pose when animation changes
      resetBonesWithoutKeyframes(currentAnimation)
      // Then apply the animation pose
      if (currentAnimation.keyframes.size > 0) {
      applyPoseAtFrame(currentFrame)
    }
    }
  }, [currentAnimationId, currentAnimation, applyPoseAtFrame, currentFrame, isPlaying, resetBonesWithoutKeyframes])

  // Navigate to a specific frame
  const goToFrame = useCallback((frame: number) => {
    const clampedFrame = Math.max(0, Math.min(frame, totalFrames))
    setCurrentFrame(clampedFrame)
    applyPoseAtFrame(clampedFrame)
  }, [totalFrames, applyPoseAtFrame])

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

      // Update bone lines and helpers
      if (showBoneView) {
        if (boneLinesGroupRef.current) {
        updateBoneLines()
        }
        if (boneVisualizerGroupRef.current) {
          updateBoneHelperPositions()
        }
      }

      // Keep the model selection outline glued to the model as it moves/scales/rotates
      if (modelSelectionBoxRef.current && modelRef.current) {
        modelSelectionBoxRef.current.setFromObject(modelRef.current)
      }

      controlsRef.current?.update()
      rendererRef.current!.render(sceneRef.current!, cameraRef.current!)
    }
    animate()

    return () => cancelAnimationFrame(animationIdRef.current)
  }, [isPlaying, currentFrame, currentAnimation, fps, speed, loop, totalFrames, showBoneView, goToFrame])

  // Update transform controls mode
  useEffect(() => {
    if (transformControlsRef.current && currentTool !== 'select') {
      transformControlsRef.current.setMode(currentTool)
    }
  }, [currentTool])

  // Attach transform controls to selected bone or whole model
  useEffect(() => {
    if (transformControlsRef.current) {
      const target = isModelSelected ? modelRef.current : selectedBone
      if (target && currentTool !== 'select') {
        transformControlsRef.current.attach(target)
      } else {
        transformControlsRef.current.detach()
      }
    }
  }, [selectedBone, isModelSelected, currentTool])

  // Show a selection outline around the whole model when it is selected
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (isModelSelected && modelRef.current) {
      if (!modelSelectionBoxRef.current) {
        const box = new THREE.BoxHelper(modelRef.current, 0x22c55e)
        box.userData.isModelSelectionBox = true
        ;(box.material as THREE.LineBasicMaterial).depthTest = false
        box.renderOrder = 999
        scene.add(box)
        modelSelectionBoxRef.current = box
      } else {
        modelSelectionBoxRef.current.setFromObject(modelRef.current)
      }
    } else if (modelSelectionBoxRef.current) {
      scene.remove(modelSelectionBoxRef.current)
      modelSelectionBoxRef.current.geometry.dispose()
      ;(modelSelectionBoxRef.current.material as THREE.Material).dispose()
      modelSelectionBoxRef.current = null
    }
  }, [isModelSelected, modelLoaded])

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

  // Load sample model from assets
  const loadSampleModel = useCallback(async () => {
    if (!sceneRef.current) return
    
    showToast('Loading sample model...', 'info')
    
    try {
      // Fetch the GLB file as ArrayBuffer to store for saving
      const response = await fetch('/assets/sample-model.glb')
      if (!response.ok) {
        throw new Error('Failed to fetch sample model')
      }
      const arrayBuffer = await response.arrayBuffer()
      
      // Store base64 encoded model data for saving
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      )
      modelDataRef.current = base64
      console.log('Sample model loaded, base64 length:', base64.length)
      
      const loader = new GLTFLoader()
      
      // Parse the ArrayBuffer we already have
      loader.parse(arrayBuffer, '', (gltf) => {
        originalGLTFRef.current = gltf
        setLoadedFilename('sample-model.glb')

        // Clear existing model and helpers
        if (modelRef.current && sceneRef.current) {
          sceneRef.current.remove(modelRef.current)
        }
        if (boneVisualizerGroupRef.current) {
          boneVisualizerGroupRef.current.clear()
        }
        boneHelpersRef.current = []
        
        // Clear history for new model
        setHistory([])
        setHistoryIndex(-1)

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

        // Create bone helpers in visualizer group
    const helpers: THREE.Group[] = []
    boneMap.forEach((bone, name) => {
      const helper = createBoneHelper(name)
          helper.userData.boneName = name
          helper.userData.bone = bone
          if (boneVisualizerGroupRef.current) {
            boneVisualizerGroupRef.current.add(helper)
          }
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
        setIsModelSelected(false)

        // Process GLB animations if present
        const glbAnimations = gltf.animations || []
        if (glbAnimations.length > 0) {
          const newAnimations = new Map<string, Animation>()
          
          glbAnimations.forEach((clip, index) => {
            const animId = `anim_${animationCounterRef.current++}`
            const { keyframes, totalFrames } = convertGLBClipToKeyframes(
              clip, boneMap, originalTransforms, 60, 2
            )
            
            newAnimations.set(animId, {
              name: clip.name || `Animation ${index + 1}`,
              fps: 60,
              totalFrames,
              speed: 1,
              loop: true,
              keyframes
            })
          })
          
          // Also add a default empty animation
          const defaultAnimId = `anim_${animationCounterRef.current++}`
          newAnimations.set(defaultAnimId, {
            name: 'New Animation',
            fps: 24,
            totalFrames: 30,
            speed: 1,
            loop: true,
            keyframes: new Map()
          })
          
          setAnimations(newAnimations)
          const firstAnimId = Array.from(newAnimations.keys())[0]
          setCurrentAnimationId(firstAnimId)
          setCurrentFrame(0)
          
          showToast(`Sample model loaded! ${boneMap.size} bones, ${glbAnimations.length} animation(s).`, 'success')
        } else {
          const defaultAnimId = `anim_${animationCounterRef.current++}`
          setAnimations(new Map([[defaultAnimId, {
            name: 'Animation 1',
            fps: 24,
            totalFrames: 30,
            speed: 1,
            loop: true,
            keyframes: new Map()
          }]]))
          setCurrentAnimationId(defaultAnimId)
          
          showToast(`Sample model loaded! Found ${boneMap.size} bones.`, 'success')
        }
      }, (error) => {
        console.error('Failed to parse sample model:', error)
        showToast('Failed to parse sample model', 'error')
      })
    } catch (error) {
      console.error('Failed to load sample model:', error)
      showToast('Sample model not found. Please add a GLB file to /public/assets/sample-model.glb', 'error')
    }
  }, [showToast])

  const createBoneHelper = (boneName: string) => {
    const group = new THREE.Group()
    group.userData.boneName = boneName
    group.userData.isBoneHelper = true

    // Larger size for better visibility and clickability
    const jointSize = 0.08
    
    // Main octahedron (diamond shape) - the main clickable element
    const jointGeo = new THREE.OctahedronGeometry(jointSize, 0)
    const jointMat = new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.3,
      metalness: 0.6,
      transparent: true,
      opacity: 0.85,
      depthTest: false
    })
    const joint = new THREE.Mesh(jointGeo, jointMat)
    joint.userData.boneName = boneName
    joint.userData.isBoneHelper = true
    joint.renderOrder = 100
    group.add(joint)

    // Glow effect
    const glowGeo = new THREE.OctahedronGeometry(jointSize * 1.2, 0)
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0x4ade80,
      transparent: true,
      opacity: 0.25,
      side: THREE.BackSide,
      depthTest: false
    })
    const glow = new THREE.Mesh(glowGeo, glowMat)
    glow.userData.boneName = boneName
    glow.renderOrder = 99
    group.add(glow)

    // Wireframe outline for visibility
    const wireGeo = new THREE.OctahedronGeometry(jointSize * 1.05, 0)
    const wireMat = new THREE.MeshBasicMaterial({
      color: 0x86efac,
      wireframe: true,
      transparent: true,
      opacity: 0.7,
      depthTest: false
    })
    const wireframe = new THREE.Mesh(wireGeo, wireMat)
    wireframe.userData.boneName = boneName
    wireframe.renderOrder = 101
    group.add(wireframe)

    // Inner core sphere
    const coreGeo = new THREE.SphereGeometry(jointSize * 0.35, 8, 8)
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.9,
      depthTest: false
    })
    const core = new THREE.Mesh(coreGeo, coreMat)
    core.userData.boneName = boneName
    core.renderOrder = 102
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

  // Update bone helper positions to match bone world positions
  const updateBoneHelperPositions = () => {
    boneHelpersRef.current.forEach(helper => {
      const boneName = helper.userData.boneName
      const bone = bones.get(boneName)
      if (bone) {
        const worldPos = new THREE.Vector3()
        bone.getWorldPosition(worldPos)
        helper.position.copy(worldPos)
        
        // Optional: match bone rotation
        const worldQuat = new THREE.Quaternion()
        bone.getWorldQuaternion(worldQuat)
        helper.quaternion.copy(worldQuat)
      }
    })
  }

  const handleBoneSelect = useCallback((boneName: string) => {
    const bone = bones.get(boneName)
    if (!bone) return

    setIsModelSelected(false)

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

  // Reset bone marker visuals to their unselected appearance
  const resetBoneHelperVisuals = useCallback(() => {
    boneHelpersRef.current.forEach(helper => {
      helper.scale.setScalar(1)
      helper.traverse(child => {
        const mesh = child as THREE.Mesh
        if (mesh.isMesh && mesh.material) {
          const mat = mesh.material as THREE.MeshBasicMaterial | THREE.MeshStandardMaterial
          if (mesh.geometry.type === 'OctahedronGeometry') {
            mat.color.setHex(mat.wireframe ? 0x86efac : mat.side === THREE.BackSide ? 0x4ade80 : 0x22c55e)
          } else if (mesh.geometry.type === 'SphereGeometry') {
            mat.color.setHex(0xffffff)
          }
        }
      })
    })
  }, [])

  // Select the whole model so it can be moved/scaled/rotated (bones follow automatically)
  const handleModelSelect = useCallback(() => {
    if (!modelRef.current) return

    setSelectedBone(null)
    resetBoneHelperVisuals()
    setIsModelSelected(true)
    // The gizmo only shows in a transform mode, so jump out of pure "select"
    setCurrentTool(prev => (prev === 'select' ? 'translate' : prev))
  }, [resetBoneHelperVisuals])

  // Clear all selection (bone + whole model)
  const handleDeselect = useCallback(() => {
    setSelectedBone(null)
    setIsModelSelected(false)
    resetBoneHelperVisuals()
  }, [resetBoneHelperVisuals])

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

  const moveKeyframe = useCallback((boneName: string, fromFrame: number, toFrame: number) => {
    if (!currentAnimationId || fromFrame === toFrame) return

    setAnimations(prev => {
      const newAnimations = new Map(prev)
      const anim = newAnimations.get(currentAnimationId)
      if (!anim) return prev

      const newKeyframes = new Map(anim.keyframes)
      const frameData = newKeyframes.get(fromFrame)
      if (!frameData || !frameData.has(boneName)) return prev

      // Get the keyframe data
      const boneData = frameData.get(boneName)!

      // Remove from old frame
      frameData.delete(boneName)
      if (frameData.size === 0) {
        newKeyframes.delete(fromFrame)
      }

      // Add to new frame
      if (!newKeyframes.has(toFrame)) {
        newKeyframes.set(toFrame, new Map())
      }
      newKeyframes.get(toFrame)!.set(boneName, boneData)

      newAnimations.set(currentAnimationId, { ...anim, keyframes: newKeyframes })
      return newAnimations
    })

    showToast(`Keyframe moved from frame ${fromFrame} to ${toFrame}`, 'info')
  }, [currentAnimationId, showToast])

  // Select/toggle keyframe selection
  const selectKeyframe = useCallback((frame: number, boneName: string, addToSelection = false) => {
    const key = `${frame}:${boneName}`
    
    setSelectedKeyframes(prev => {
      const newSelection = addToSelection ? new Set(prev) : new Set<string>()
      
      if (prev.has(key) && addToSelection) {
        newSelection.delete(key)
      } else {
        newSelection.add(key)
      }
      
      return newSelection
    })
  }, [])

  // Clear keyframe selection
  const clearKeyframeSelection = useCallback(() => {
    setSelectedKeyframes(new Set())
  }, [])

  // Duplicate selected keyframes (or current bone's keyframe)
  const duplicateKeyframes = useCallback(() => {
    if (!currentAnimationId) {
      showToast('No animation selected', 'error')
      return
    }

    setAnimations(prev => {
      const newAnimations = new Map(prev)
      const anim = newAnimations.get(currentAnimationId)
      if (!anim) return prev

      const newKeyframes = new Map(anim.keyframes)
      let duplicatedCount = 0
      const newSelection = new Set<string>()

      // If we have selected keyframes, duplicate those
      if (selectedKeyframes.size > 0) {
        const keyframesToDuplicate: {frame: number, boneName: string, data: BoneKeyframe}[] = []
        
        selectedKeyframes.forEach(key => {
          const [frameStr, boneName] = key.split(':')
          const frame = parseInt(frameStr, 10)
          const frameData = newKeyframes.get(frame)
          if (frameData?.has(boneName)) {
            keyframesToDuplicate.push({
              frame,
              boneName,
              data: frameData.get(boneName)!
            })
          }
        })

        if (keyframesToDuplicate.length === 0) {
          showToast('No valid keyframes selected', 'warning')
          return prev
        }

        // Duplicate each keyframe to next frame
        const offset = 1
        keyframesToDuplicate.forEach(({ frame, boneName, data }) => {
          const newFrame = frame + offset
          if (newFrame <= anim.totalFrames) {
            if (!newKeyframes.has(newFrame)) {
              newKeyframes.set(newFrame, new Map())
            }
            
            newKeyframes.get(newFrame)!.set(boneName, {
              position: data.position.clone(),
              rotation: data.rotation.clone(),
              scale: data.scale.clone()
            })
            
            newSelection.add(`${newFrame}:${boneName}`)
            duplicatedCount++
          }
        })
      } else if (selectedBone) {
        // No selection, duplicate current bone's keyframe at current frame
        const frameData = newKeyframes.get(currentFrame)
        if (frameData?.has(selectedBone.name)) {
          const data = frameData.get(selectedBone.name)!
          const newFrame = currentFrame + 1
          
          if (newFrame <= anim.totalFrames) {
            if (!newKeyframes.has(newFrame)) {
              newKeyframes.set(newFrame, new Map())
            }
            
            newKeyframes.get(newFrame)!.set(selectedBone.name, {
              position: data.position.clone(),
              rotation: data.rotation.clone(),
              scale: data.scale.clone()
            })
            
            newSelection.add(`${newFrame}:${selectedBone.name}`)
            duplicatedCount++
          }
        } else {
          showToast('No keyframe at current frame for selected bone', 'warning')
          return prev
        }
      } else {
        showToast('Select keyframes or a bone first', 'warning')
        return prev
      }

      // Update selection to new keyframes
      setSelectedKeyframes(newSelection)

      if (duplicatedCount > 0) {
        showToast(`Duplicated ${duplicatedCount} keyframe(s)`, 'success')
      }

      newAnimations.set(currentAnimationId, { ...anim, keyframes: newKeyframes })
      return newAnimations
    })
  }, [currentAnimationId, selectedKeyframes, selectedBone, currentFrame, showToast])

  // Delete all selected keyframes
  const deleteSelectedKeyframes = useCallback(() => {
    if (!currentAnimationId) return

    if (selectedKeyframes.size === 0) {
      // Fall back to deleting current bone's keyframe
      if (selectedBone) {
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
      }
      return
    }

    setAnimations(prev => {
      const newAnimations = new Map(prev)
      const anim = newAnimations.get(currentAnimationId)
      if (!anim) return prev

      const newKeyframes = new Map(anim.keyframes)
      let deletedCount = 0

      selectedKeyframes.forEach(key => {
        const [frameStr, boneName] = key.split(':')
        const frame = parseInt(frameStr, 10)
        const frameData = newKeyframes.get(frame)
        
        if (frameData?.has(boneName)) {
          frameData.delete(boneName)
          if (frameData.size === 0) {
            newKeyframes.delete(frame)
          }
          deletedCount++
        }
      })

      if (deletedCount > 0) {
        showToast(`Deleted ${deletedCount} keyframe(s)`, 'info')
      }

      newAnimations.set(currentAnimationId, { ...anim, keyframes: newKeyframes })
      return newAnimations
    })

    setSelectedKeyframes(new Set())
  }, [currentAnimationId, selectedKeyframes, selectedBone, currentFrame, showToast])

  // Move all selected keyframes by a frame offset
  const moveSelectedKeyframes = useCallback((deltaFrames: number) => {
    if (!currentAnimationId || selectedKeyframes.size === 0) return

    setAnimations(prev => {
      const newAnimations = new Map(prev)
      const anim = newAnimations.get(currentAnimationId)
      if (!anim) return prev

      const newKeyframes = new Map(anim.keyframes)
      const keyframesToMove: {oldFrame: number, newFrame: number, boneName: string, data: BoneKeyframe}[] = []

      // Collect keyframes to move
      selectedKeyframes.forEach(key => {
        const [frameStr, boneName] = key.split(':')
        const frame = parseInt(frameStr, 10)
        const frameData = newKeyframes.get(frame)
        
        if (frameData?.has(boneName)) {
          keyframesToMove.push({
            oldFrame: frame,
            newFrame: Math.max(0, Math.min(anim.totalFrames, frame + deltaFrames)),
            boneName,
            data: frameData.get(boneName)!
          })
        }
      })

      // Remove old keyframes
      keyframesToMove.forEach(({ oldFrame, boneName }) => {
        const frameData = newKeyframes.get(oldFrame)
        if (frameData) {
          frameData.delete(boneName)
          if (frameData.size === 0) {
            newKeyframes.delete(oldFrame)
          }
        }
      })

      // Update selection and add new keyframes
      const newSelection = new Set<string>()
      keyframesToMove.forEach(({ newFrame, boneName, data }) => {
        if (!newKeyframes.has(newFrame)) {
          newKeyframes.set(newFrame, new Map())
        }
        newKeyframes.get(newFrame)!.set(boneName, data)
        newSelection.add(`${newFrame}:${boneName}`)
      })

      setSelectedKeyframes(newSelection)
      showToast(`Moved ${keyframesToMove.length} keyframe(s)`, 'info')

      newAnimations.set(currentAnimationId, { ...anim, keyframes: newKeyframes })
      return newAnimations
    })
  }, [currentAnimationId, selectedKeyframes, showToast])

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
    // Check animation limit for free users
    if (!isPro && animations.size >= animationLimit) {
      setUpgradeModalReason('animation_limit')
      setShowUpgradeModal(true)
      return
    }

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
  }, [animations.size, resetAllBones, showToast, isPro, animationLimit])

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
  // Helper function to sample quaternion from animation track
  const sampleQuaternionTrack = (track: THREE.KeyframeTrack, time: number) => {
    const times = track.times
    const values = track.values
    
    if (time <= times[0]) {
      return new THREE.Quaternion(values[0], values[1], values[2], values[3])
    }
    if (time >= times[times.length - 1]) {
      const i = (times.length - 1) * 4
      return new THREE.Quaternion(values[i], values[i + 1], values[i + 2], values[i + 3])
    }
    
    let i1 = 0
    for (let i = 0; i < times.length - 1; i++) {
      if (time >= times[i] && time < times[i + 1]) {
        i1 = i
        break
      }
    }
    const i2 = i1 + 1
    const alpha = (time - times[i1]) / (times[i2] - times[i1])
    
    const q1 = new THREE.Quaternion(values[i1 * 4], values[i1 * 4 + 1], values[i1 * 4 + 2], values[i1 * 4 + 3])
    const q2 = new THREE.Quaternion(values[i2 * 4], values[i2 * 4 + 1], values[i2 * 4 + 2], values[i2 * 4 + 3])
    
    return q1.slerp(q2, alpha)
  }

  // Helper function to sample vector from animation track
  const sampleVectorTrack = (track: THREE.KeyframeTrack, time: number) => {
    const times = track.times
    const values = track.values
    
    if (time <= times[0]) {
      return new THREE.Vector3(values[0], values[1], values[2])
    }
    if (time >= times[times.length - 1]) {
      const i = (times.length - 1) * 3
      return new THREE.Vector3(values[i], values[i + 1], values[i + 2])
    }
    
    let i1 = 0
    for (let i = 0; i < times.length - 1; i++) {
      if (time >= times[i] && time < times[i + 1]) {
        i1 = i
        break
      }
    }
    const i2 = i1 + 1
    const alpha = (time - times[i1]) / (times[i2] - times[i1])
    
    const v1 = new THREE.Vector3(values[i1 * 3], values[i1 * 3 + 1], values[i1 * 3 + 2])
    const v2 = new THREE.Vector3(values[i2 * 3], values[i2 * 3 + 1], values[i2 * 3 + 2])
    
    return v1.lerp(v2, alpha)
  }

  // Convert GLB animation clip to keyframes
  const convertGLBClipToKeyframes = (
    clip: THREE.AnimationClip, 
    boneMap: Map<string, THREE.Bone>,
    originalTransforms: Map<string, { position: THREE.Vector3; rotation: THREE.Euler; scale: THREE.Vector3 }>,
    targetFPS: number = 60,
    sampleRate: number = 2
  ) => {
    const duration = clip.duration
    const totalFrames = Math.ceil(duration * targetFPS)
    
    const keyframes = new Map<number, Map<string, BoneKeyframe>>()
    
    // Sample at every sampleRate frames
    for (let frame = 0; frame <= totalFrames; frame += sampleRate) {
      const time = frame / targetFPS
      const frameKeyframes = new Map<string, BoneKeyframe>()
      
      clip.tracks.forEach(track => {
        // Parse track name to get bone name (format: "boneName.property")
        const parts = track.name.split('.')
        const boneName = parts[0]
        const property = parts[parts.length - 1]
        
        // Skip non-bone tracks
        if (!boneMap.has(boneName)) return
        
        if (!frameKeyframes.has(boneName)) {
          const original = originalTransforms.get(boneName)
          frameKeyframes.set(boneName, {
            position: original?.position.clone() || new THREE.Vector3(),
            rotation: new THREE.Quaternion(),
            scale: original?.scale.clone() || new THREE.Vector3(1, 1, 1)
          })
        }
        
        const boneData = frameKeyframes.get(boneName)!
        
        // Sample the track
        if (property === 'quaternion') {
          const quat = sampleQuaternionTrack(track, time)
          boneData.rotation = quat
        } else if (property === 'position') {
          const pos = sampleVectorTrack(track, time)
          boneData.position = pos
        } else if (property === 'scale') {
          const scale = sampleVectorTrack(track, time)
          boneData.scale = scale
        }
      })
      
      if (frameKeyframes.size > 0) {
        keyframes.set(frame, frameKeyframes)
      }
    }
    
    return { keyframes, totalFrames }
  }

  const loadGLBFile = useCallback((file: File) => {
    showToast('Loading model...', 'info')

    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const arrayBuffer = e.target?.result as ArrayBuffer
        
        // Store base64 encoded model data for saving
        const base64 = btoa(
          new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
        )
        modelDataRef.current = base64
        
        const loader = new GLTFLoader()

        loader.parse(arrayBuffer, '', (gltf) => {
          originalGLTFRef.current = gltf
          setLoadedFilename(file.name)

          // Clear existing model and helpers
          if (modelRef.current && sceneRef.current) {
            sceneRef.current.remove(modelRef.current)
          }
          boneHelpersRef.current.forEach(helper => {
            if (helper.parent) helper.parent.remove(helper)
          })
          boneHelpersRef.current = []
          
          // Clear history for new model
          setHistory([])
          setHistoryIndex(-1)

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

          // Create bone helpers (octahedron/diamond shapes) - add to visualizer group for visibility
          // Clear existing helpers
          if (boneVisualizerGroupRef.current) {
            boneVisualizerGroupRef.current.clear()
          }
          const helpers: THREE.Group[] = []
          boneMap.forEach((bone, name) => {
            const helper = createBoneHelper(name)
            helper.userData.boneName = name
            helper.userData.bone = bone
            // Add to visualizer group instead of bone (better visibility)
            if (boneVisualizerGroupRef.current) {
              boneVisualizerGroupRef.current.add(helper)
            }
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
          setIsModelSelected(false)

          // Process GLB animations if present
          const glbAnimations = gltf.animations || []
          if (glbAnimations.length > 0) {
            showToast(`Found ${glbAnimations.length} animation(s), converting...`, 'info')
            
            const newAnimations = new Map<string, Animation>()
            
            glbAnimations.forEach((clip, index) => {
              const animId = `anim_${animationCounterRef.current++}`
              const { keyframes, totalFrames } = convertGLBClipToKeyframes(
                clip, boneMap, originalTransforms, 60, 2
              )
              
              newAnimations.set(animId, {
                name: clip.name || `Animation ${index + 1}`,
                fps: 60,
                totalFrames,
                speed: 1,
                loop: true,
                keyframes
              })
            })
            
            // Also keep a default empty animation
            const defaultAnimId = `anim_${animationCounterRef.current++}`
            newAnimations.set(defaultAnimId, {
              name: 'New Animation',
              fps: 24,
              totalFrames: 30,
              speed: 1,
              loop: true,
              keyframes: new Map()
            })
            
            setAnimations(newAnimations)
            // Select first imported animation
            const firstAnimId = Array.from(newAnimations.keys())[0]
            setCurrentAnimationId(firstAnimId)
            setCurrentFrame(0)
            
            showToast(`Model loaded! ${boneMap.size} bones, ${glbAnimations.length} animation(s) converted.`, 'success')
          } else {
            // Create default animation if no animations in GLB
            const defaultAnimId = `anim_${animationCounterRef.current++}`
            setAnimations(new Map([[defaultAnimId, {
              name: 'Animation 1',
              fps: 24,
              totalFrames: 30,
              speed: 1,
              loop: true,
              keyframes: new Map()
            }]]))
            setCurrentAnimationId(defaultAnimId)

          showToast(`Model loaded! Found ${boneMap.size} bones.`, 'success')
          }
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

  // Load model from base64 data (for restoring saved projects)
  const loadModelFromBase64 = useCallback((base64: string, filename: string) => {
    try {
      // Convert base64 to ArrayBuffer
      const binaryString = atob(base64)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }
      const arrayBuffer = bytes.buffer

      // Store the base64 data
      modelDataRef.current = base64

      const loader = new GLTFLoader()
      loader.parse(arrayBuffer, '', (gltf) => {
        originalGLTFRef.current = gltf
        setLoadedFilename(filename)

        // Clear existing model and helpers
        if (modelRef.current && sceneRef.current) {
          sceneRef.current.remove(modelRef.current)
        }
        boneHelpersRef.current.forEach(helper => {
          if (helper.parent) helper.parent.remove(helper)
        })
        boneHelpersRef.current = []

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
        if (boneVisualizerGroupRef.current) {
          boneVisualizerGroupRef.current.clear()
        }
        const helpers: THREE.Group[] = []
        boneMap.forEach((bone, name) => {
          const helper = createBoneHelper(name)
          helper.userData.boneName = name
          helper.userData.bone = bone
          if (boneVisualizerGroupRef.current) {
            boneVisualizerGroupRef.current.add(helper)
          }
          helpers.push(helper)
        })
        boneHelpersRef.current = helpers

        setBones(boneMap)
        originalTransformsRef.current = originalTransforms
        setModelLoaded(true)
        setShowWelcome(false)
        setSelectedBone(null)
        setIsModelSelected(false)

        showToast(`Project restored! Found ${boneMap.size} bones.`, 'success')
      }, (error) => {
        console.error('Failed to restore model:', error)
        showToast('Failed to restore model', 'error')
        // Still hide welcome screen to show the editor
        setShowWelcome(false)
      })
    } catch (err) {
      console.error('Error restoring model:', err)
      showToast('Failed to restore model', 'error')
    }
  }, [showToast])

  // Load initial data when component mounts and scene is ready
  const initialDataLoadedRef = useRef(false)
  useEffect(() => {
    if (initialDataLoadedRef.current) return
    if (!initialData) return
    if (!sceneReady) return  // Wait for scene to be ready

    initialDataLoadedRef.current = true

    // Load model if we have model data
    if (initialData.modelData && initialData.modelName) {
      loadModelFromBase64(initialData.modelData, initialData.modelName)

      // Load animations after a small delay to ensure model is loaded
      if (initialData.animations && initialData.animations.length > 0) {
        setTimeout(() => {
          const newAnimations = new Map<string, Animation>()
          initialData.animations!.forEach((animData: any, index: number) => {
            const animId = `anim_${animationCounterRef.current++}`
            const keyframes = new Map<number, Map<string, BoneKeyframe>>()
            
            if (animData.keyframes) {
              Object.entries(animData.keyframes).forEach(([frameStr, bonesData]: [string, any]) => {
                const frame = parseInt(frameStr)
                const boneKeyframes = new Map<string, BoneKeyframe>()
                Object.entries(bonesData).forEach(([boneName, boneData]: [string, any]) => {
                  boneKeyframes.set(boneName, {
                    position: new THREE.Vector3(...boneData.position),
                    rotation: new THREE.Quaternion(...boneData.rotation),
                    scale: new THREE.Vector3(...boneData.scale)
                  })
                })
                keyframes.set(frame, boneKeyframes)
              })
            }

            newAnimations.set(animId, {
              name: animData.name || `Animation ${index + 1}`,
              fps: animData.fps || 24,
              totalFrames: animData.totalFrames || 30,
              speed: animData.speed || 1,
              loop: animData.loop !== false,
              keyframes
            })
          })

          if (newAnimations.size > 0) {
            setAnimations(newAnimations)
            const firstAnimId = newAnimations.keys().next().value
            if (firstAnimId) {
              setCurrentAnimationId(firstAnimId)
              setCurrentFrame(0)
            }
          }
        }, 100)
      }
    } else if (initialData.animations && initialData.animations.length > 0) {
      // We have animations but no model - just load animations and show welcome
      // (user will need to load a model)
    }
  }, [initialData, loadModelFromBase64, sceneReady])

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

  // Create animation clip from a specific animation
  const createAnimationClipFromAnimation = useCallback((animId: string): THREE.AnimationClip | null => {
    const anim = animations.get(animId)
    if (!anim || anim.keyframes.size === 0) return null

    const tracks: THREE.KeyframeTrack[] = []
    const duration = anim.totalFrames / anim.fps

    // Collect all bones with keyframes
    const bonesWithKeyframes = new Set<string>()
    anim.keyframes.forEach((frameData) => {
      frameData.forEach((_, boneName) => bonesWithKeyframes.add(boneName))
    })

    bonesWithKeyframes.forEach(boneName => {
      const times: number[] = []
      const positions: number[] = []
      const quaternions: number[] = []
      const scales: number[] = []

      const sortedFrames = Array.from(anim.keyframes.keys()).sort((a, b) => a - b)

      sortedFrames.forEach(frame => {
        const boneData = anim.keyframes.get(frame)?.get(boneName)
        if (boneData) {
          times.push(frame / anim.fps)
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

    if (tracks.length === 0) return null
    return new THREE.AnimationClip(anim.name, duration, tracks)
  }, [animations])

  // Open GLB export modal
  const openExportModal = useCallback(() => {
    if (!modelRef.current) {
      showToast('No model to export', 'warning')
      return
    }
    // Pre-select all animations with keyframes
    const animsWithKeyframes = new Set<string>()
    animations.forEach((anim, id) => {
      if (anim.keyframes.size > 0) {
        animsWithKeyframes.add(id)
      }
    })
    setSelectedExportAnimations(animsWithKeyframes)
    setExportFilename(loadedFilename.replace(/\.(glb|gltf)$/i, '') || 'model_animated')
    setShowExportModal(true)
  }, [animations, loadedFilename, showToast])

  // Export GLB with selected animations
  const exportGLB = useCallback(() => {
    if (!modelRef.current) {
      showToast('No model to export', 'warning')
      return
    }

    setExportingGLB(true)
    showToast('Generating GLB...', 'info')

    try {
      // Create animation clips for all selected animations
      const animationClips: THREE.AnimationClip[] = []
      selectedExportAnimations.forEach(animId => {
        const clip = createAnimationClipFromAnimation(animId)
        if (clip) {
          animationClips.push(clip)
        }
      })

      // Save original animations to restore later
      const originalAnimations = modelRef.current.animations ? [...modelRef.current.animations] : []
      
      // Use the original model directly (don't clone - cloning breaks glTF internal data)
      // Temporarily set our animations on the model (or empty array if none selected)
      modelRef.current.animations = animationClips
      
      // Update skeleton pose
      modelRef.current.traverse(child => {
        if ((child as THREE.SkinnedMesh).isSkinnedMesh && (child as THREE.SkinnedMesh).skeleton) {
          ;(child as THREE.SkinnedMesh).skeleton.update()
        }
      })

      // Export using GLTFExporter
      const exporter = new GLTFExporter()
      const exportOptions: { binary: boolean; includeCustomExtensions: boolean; animations?: THREE.AnimationClip[] } = { 
        binary: true,
        includeCustomExtensions: true
      }
      
      // Only include animations in options if we have any
      if (animationClips.length > 0) {
        exportOptions.animations = animationClips
      }

      exporter.parse(
        modelRef.current,
        (result) => {
          // Restore original animations
          if (modelRef.current) {
            modelRef.current.animations = originalAnimations
          }
          
          const blob = new Blob([result as ArrayBuffer], { type: 'application/octet-stream' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `${exportFilename}.glb`
          a.click()
          URL.revokeObjectURL(url)
          
          if (animationClips.length > 0) {
            showToast(`GLB exported with ${animationClips.length} animation(s)`, 'success')
          } else {
            showToast('GLB exported (model only, no animations)', 'success')
          }
          setShowExportModal(false)
          setExportingGLB(false)
        },
        (error) => {
          // Restore original animations on error too
          if (modelRef.current) {
            modelRef.current.animations = originalAnimations
          }
          console.error('GLB export error:', error)
          showToast('Failed to export GLB', 'error')
          setExportingGLB(false)
        },
        exportOptions
      )
    } catch (err) {
      console.error('Export error:', err)
      showToast('Failed to export GLB', 'error')
      setExportingGLB(false)
    }
  }, [selectedExportAnimations, exportFilename, createAnimationClipFromAnimation, showToast])

  // Toggle animation selection for export
  const toggleExportAnimation = useCallback((animId: string) => {
    setSelectedExportAnimations(prev => {
      const newSet = new Set(prev)
      if (newSet.has(animId)) {
        newSet.delete(animId)
      } else {
        newSet.add(animId)
      }
      return newSet
    })
  }, [])

  // Select/deselect all animations for export
  const selectAllExportAnimations = useCallback(() => {
    const allIds = new Set<string>()
    animations.forEach((anim, id) => {
      if (anim.keyframes.size > 0) {
        allIds.add(id)
      }
    })
    setSelectedExportAnimations(allIds)
  }, [animations])

  const deselectAllExportAnimations = useCallback(() => {
    setSelectedExportAnimations(new Set())
  }, [])

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
    if (bones.size === 0) return
    
    const state: Record<string, any> = {}
    bones.forEach((bone, name) => {
      state[name] = {
        position: bone.position.toArray(),
        rotation: bone.rotation.toArray(),
        scale: bone.scale.toArray()
      }
    })
    
    const stateStr = JSON.stringify(state)
    
    // Don't save duplicate states
    setHistory(prev => {
      if (prev.length > 0 && prev[prev.length - 1] === stateStr) {
        return prev
      }
      const newHistory = prev.slice(0, historyIndex + 1)
      newHistory.push(stateStr)
      if (newHistory.length > maxHistory) newHistory.shift()
      return newHistory
    })
    setHistoryIndex(prev => Math.min(prev + 1, maxHistory - 1))
  }, [bones, historyIndex])

  // Keep refs updated with latest functions
  useEffect(() => {
    saveToHistoryRef.current = saveToHistory
  }, [saveToHistory])

  useEffect(() => {
    notifyChangeRef.current = notifyChange
  }, [notifyChange])

  // Notify parent when animations change
  const animationsInitializedRef = useRef(false)
  useEffect(() => {
    // Skip initial render and first animation setup
    if (!animationsInitializedRef.current) {
      if (animations.size > 0) {
        animationsInitializedRef.current = true
      }
      return
    }
    // Notify parent of changes with a small delay to ensure state is settled
    const timeoutId = setTimeout(() => {
      if (notifyChangeRef.current) {
        console.log('Notifying parent of animation changes, animations count:', animations.size)
        notifyChangeRef.current()
      }
    }, 50)
    return () => clearTimeout(timeoutId)
  }, [animations])

  // Save initial state to history when model loads
  useEffect(() => {
    if (bones.size > 0 && history.length === 0) {
      saveToHistory()
    }
  }, [bones.size, history.length, saveToHistory])

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
          deleteSelectedKeyframes()
          break
        case 'ArrowLeft': goToFrame(currentFrame - 1); break
        case 'ArrowRight': goToFrame(currentFrame + 1); break
        case 'Home': goToFrame(0); break
        case 'End': goToFrame(totalFrames); break
        case 'KeyD':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            duplicateKeyframes()
          }
          break
        case 'Escape':
          clearKeyframeSelection()
          break
        case 'KeyA':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            // Select all keyframes
            if (currentAnimation) {
              const allKeys = new Set<string>()
              currentAnimation.keyframes.forEach((frameData, frame) => {
                frameData.forEach((_, boneName) => {
                  allKeys.add(`${frame}:${boneName}`)
                })
              })
              setSelectedKeyframes(allKeys)
              showToast(`Selected ${allKeys.size} keyframe(s)`, 'info')
            }
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentFrame, goToFrame, addKeyframe, deleteKeyframe, deleteSelectedKeyframes, duplicateKeyframes, clearKeyframeSelection, undo, redo, copyPose, resetBone, totalFrames, currentAnimation, showToast])

  // Canvas click for bone / model selection
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Track press position so we can tell a real click from a camera-orbit / gizmo drag
    let downX = 0
    let downY = 0
    let isPotentialClick = false
    const DRAG_THRESHOLD = 5

    const handlePointerDown = (e: MouseEvent) => {
      downX = e.clientX
      downY = e.clientY
      // Ignore presses that start on the transform gizmo
      isPotentialClick = !(transformControlsRef.current?.dragging ?? false)
    }

    const handleClick = (e: MouseEvent) => {
      if (!cameraRef.current || !sceneRef.current) return

      // Skip if this was a drag (camera orbit / gizmo manipulation)
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY)
      if (!isPotentialClick || moved > DRAG_THRESHOLD) return

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

      // A visible bone marker takes priority (markers render on top of the mesh)
      if (intersects.length > 0) {
        let obj: THREE.Object3D | null = intersects[0].object
        while (obj && !obj.userData.boneName) {
          obj = obj.parent
        }
        if (obj?.userData.boneName) {
          handleBoneSelect(obj.userData.boneName)
          return
        }
      }

      // Otherwise, clicking anywhere on the model body selects the whole model
      if (modelRef.current) {
        const modelHits = raycaster.intersectObject(modelRef.current, true)
        if (modelHits.length > 0) {
          handleModelSelect()
          return
        }
      }

      // Clicked empty space: clear any selection
      handleDeselect()
    }

    canvas.addEventListener('pointerdown', handlePointerDown)
    canvas.addEventListener('click', handleClick)
    return () => {
      canvas.removeEventListener('pointerdown', handlePointerDown)
      canvas.removeEventListener('click', handleClick)
    }
  }, [handleBoneSelect, handleModelSelect, handleDeselect])

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

  // Video Motion Capture - MediaPipe Tasks PoseLandmarker (heavy model)
  const poseModelRef = useRef<any>(null)
  // Live preview (testing): MediaPipe skeleton drawn over the source video.
  const previewVideoRef = useRef<HTMLVideoElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  const loadPoseModel = useCallback(async () => {
    if (poseModelRef.current) return poseModelRef.current

    // Load JS bundle and WASM from the same CDN version so they stay ABI-compatible.
    // The Function(...) wrapper keeps the bundler from trying to resolve the URL import.
    const VER = '0.10.22-rc.20250304'
    const BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VER}`
    const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/latest/pose_landmarker_heavy.task'

    const vision: any = await (Function('u', 'return import(u)')(`${BASE}/vision_bundle.mjs`))
    const { PoseLandmarker, FilesetResolver } = vision
    if (!PoseLandmarker || !FilesetResolver) throw new Error('Failed to load MediaPipe tasks-vision')

    const fileset = await FilesetResolver.forVisionTasks(`${BASE}/wasm`)
    // IMAGE running mode: every frame is detected independently with NO internal
    // temporal smoothing. This preserves full limb amplitude/depth (VIDEO mode's
    // tracking damps fast motion and flattens the pose). We do our own light
    // smoothing afterwards instead.
    const makeOptions = (delegate: 'GPU' | 'CPU') => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: 'IMAGE' as const,
      numPoses: 1,
      minPoseDetectionConfidence: 0.6,
      minPosePresenceConfidence: 0.6,
      minTrackingConfidence: 0.6,
    })

    let landmarker: any
    try {
      landmarker = await PoseLandmarker.createFromOptions(fileset, makeOptions('GPU'))
    } catch {
      // Some browsers/GPUs reject the GPU delegate; fall back to CPU.
      landmarker = await PoseLandmarker.createFromOptions(fileset, makeOptions('CPU'))
    }

    poseModelRef.current = landmarker
    return landmarker
  }, [])

  const analyzeSkeletonHierarchy = useCallback(() => {
    if (bones.size === 0) return null
    const info: { bones: Map<string, any>; order: string[]; spineLength: number } = { bones: new Map(), order: [], spineLength: 0 }

    let rootBone: THREE.Bone | null = null
    bones.forEach((bone) => {
      if (!rootBone && (!bone.parent || !bones.has(bone.parent.name))) rootBone = bone
    })
    if (!rootBone) return null

    // Measure the main spine chain length (first child at each level) for scale calibration
    let chainBone: THREE.Object3D | null = rootBone
    while (chainBone) {
      let next: THREE.Object3D | null = null
      for (const child of chainBone.children) { if (bones.has(child.name)) { next = child; break } }
      if (!next) break
      const cp = next.position
      info.spineLength += Math.sqrt(cp.x * cp.x + cp.y * cp.y + cp.z * cp.z)
      chainBone = next
    }
    if (info.spineLength === 0) info.spineLength = 0.77

    const queue: THREE.Bone[] = [rootBone]
    while (queue.length > 0) {
      const bone = queue.shift()!
      let firstBoneChild: THREE.Object3D | null = null
      for (const child of bone.children) {
        if (bones.has(child.name)) { if (!firstBoneChild) firstBoneChild = child; queue.push(child as THREE.Bone) }
      }
      const orig = originalTransformsRef.current.get(bone.name)
      const restQuat = orig
        ? new THREE.Quaternion().setFromEuler(orig.rotation)
        : new THREE.Quaternion().setFromEuler(bone.rotation)
      // Child's rest direction in the bone's local frame (normalized). This is the
      // axis that gets aligned to the captured limb direction via setFromUnitVectors.
      let childPosDir = new THREE.Vector3(0, 1, 0)
      let restLength = 0
      if (firstBoneChild) {
        const cp = firstBoneChild.position
        const len = Math.sqrt(cp.x * cp.x + cp.y * cp.y + cp.z * cp.z)
        if (len > 1e-6) {
          childPosDir = new THREE.Vector3(cp.x / len, cp.y / len, cp.z / len)
          restLength = len
        }
      }
      let parentName: string | null = null
      if (bone.parent && bones.has(bone.parent.name)) parentName = bone.parent.name
      info.bones.set(bone.name, { parentName, childPosDir, restQuat, restLength })
      info.order.push(bone.name)
    }
    return info
  }, [bones])

  const processVideoCapture = useCallback(async () => {
    if (!videoFile || bones.size === 0) return

    const skeletonInfo = analyzeSkeletonHierarchy()
    if (!skeletonInfo) { showToast('No skeleton found to map to', 'error'); return }

    setVideoAnalyzing(true)
    setVideoProgress(0)

    try {
      const pose = await loadPoseModel()

      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.src = URL.createObjectURL(videoFile)
      await new Promise<void>(r => { video.onloadedmetadata = () => r() })

      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')!
      // Image landmarks are normalized to width/height separately; multiply x by the
      // aspect ratio so screen-space directions are measured in consistent units.
      const aspect = (video.videoWidth || 1) / (video.videoHeight || 1)

      const captureFps = 30
      const totalAnimFrames = Math.max(1, Math.round(video.duration * captureFps))
      // Interleaved passes: even frames (0,2,4…) and odd frames (1,3,5…) each get a
      // forward + backward pass averaged together → full 30 fps coverage with 4 passes.
      const evenIndices: number[] = []
      const oddIndices: number[] = []
      for (let i = 0; i < totalAnimFrames; i++) {
        if (i % 2 === 0) evenIndices.push(i)
        else oddIndices.push(i)
      }
      if (evenIndices.length === 0 && oddIndices.length === 0) {
        showToast('Video too short to capture', 'warning'); return
      }

      // A captured frame keeps BOTH landmark sets:
      //  - image:  normalized screen coords (used for root/screen placement + depth)
      //  - world:  metric 3D coords centred on the hips (used for bone orientation)
      type LMSet = { image: any[]; world: any[] } | null

      // Visibility-weighted average of several landmark arrays into one.
      const avgLandmarks = (arrays: any[][]): any[] => {
        const L = arrays[0].length
        const res: any[] = []
        for (let k = 0; k < L; k++) {
          let sx = 0, sy = 0, sz = 0, sw = 0, sv = 0
          for (const arr of arrays) {
            const l = arr[k]
            const vis = l.visibility ?? 1
            const w = Math.max(0.01, vis)
            sx += l.x * w; sy += l.y * w; sz += (l.z || 0) * w
            sw += w; sv += vis
          }
          res.push({ x: sx / sw, y: sy / sw, z: sz / sw, visibility: sv / arrays.length })
        }
        return res
      }

      const runPass = async (
        indices: number[],
        reversed: boolean,
        progressOffset: number,
        progressScale: number,
      ): Promise<LMSet[]> => {
        const out: LMSet[] = new Array(indices.length).fill(null)
        const order = reversed
          ? [...Array(indices.length).keys()].reverse()
          : [...Array(indices.length).keys()]
        for (const idx of order) {
          video.currentTime = indices[idx] / captureFps
          await new Promise<void>(r => { video.onseeked = () => r() })
          ctx.drawImage(video, 0, 0)

          let result: any = null
          try { result = pose.detect(canvas) } catch { /* keep frame as null */ }

          const imageLm = result?.landmarks?.[0]
          const worldLm = result?.worldLandmarks?.[0]
          if (imageLm && imageLm.length) {
            out[idx] = { image: imageLm, world: (worldLm && worldLm.length) ? worldLm : imageLm }
          }
          const done = reversed ? indices.length - 1 - idx : idx
          setVideoProgress(Math.round(progressOffset + (done / indices.length) * progressScale))
          await new Promise(r => setTimeout(r, 2))
        }
        return out
      }

      const mergePassPair = (fwd: LMSet[], bwd: LMSet[], indices: number[]): Map<number, LMSet> => {
        const map = new Map<number, LMSet>()
        for (let i = 0; i < indices.length; i++) {
          const a = fwd[i], b = bwd[i]
          if (!a && !b) continue
          if (!a) { map.set(indices[i], b); continue }
          if (!b) { map.set(indices[i], a); continue }
          map.set(indices[i], {
            image: avgLandmarks([a.image, b.image]),
            world: avgLandmarks([a.world, b.world]),
          })
        }
        return map
      }

      // 4 passes: even fwd/bwd + odd fwd/bwd → every video frame sampled once, each
      // averaged from two detections for stability.
      const evenFwd = evenIndices.length ? await runPass(evenIndices, false, 0, 22) : []
      const evenBwd = evenIndices.length ? await runPass(evenIndices, true, 22, 22) : []
      const oddFwd = oddIndices.length ? await runPass(oddIndices, false, 44, 22) : []
      const oddBwd = oddIndices.length ? await runPass(oddIndices, true, 66, 22) : []

      URL.revokeObjectURL(video.src)

      const timeline: LMSet[] = new Array(totalAnimFrames).fill(null)
      if (evenIndices.length) {
        for (const [frameIdx, data] of mergePassPair(evenFwd, evenBwd, evenIndices)) {
          timeline[frameIdx] = data
        }
      }
      if (oddIndices.length) {
        for (const [frameIdx, data] of mergePassPair(oddFwd, oddBwd, oddIndices)) {
          timeline[frameIdx] = data
        }
      }

      // Fill dropped frames by interpolating between the nearest valid detections so
      // occlusions don't punch holes in the animation.
      const lerpLmArr = (a: any[], b: any[], t: number) => a.map((p, k) => {
        const q = b[k] || p
        return {
          x: p.x + (q.x - p.x) * t,
          y: p.y + (q.y - p.y) * t,
          z: (p.z || 0) + ((q.z || 0) - (p.z || 0)) * t,
          visibility: (p.visibility ?? 1) + ((q.visibility ?? 1) - (p.visibility ?? 1)) * t,
        }
      })
      {
        let i = 0
        while (i < totalAnimFrames) {
          if (timeline[i]) { i++; continue }
          let j = i
          while (j < totalAnimFrames && !timeline[j]) j++
          const prev = i > 0 ? timeline[i - 1] : null
          const next = j < totalAnimFrames ? timeline[j] : null
          for (let k = i; k < j; k++) {
            if (prev && next) {
              const t = (k - (i - 1)) / Math.max(1, j - (i - 1))
              timeline[k] = { image: lerpLmArr(prev.image, next.image, t), world: lerpLmArr(prev.world, next.world, t) }
            } else {
              timeline[k] = prev || next
            }
          }
          i = j
        }
      }

      // Rebuild occluded joints (low visibility) from neighbouring confident frames
      // instead of letting a bad 2D estimate flatten a limb.
      const VIS_OK = 0.5
      const lmCount = timeline.find(f => f)?.image.length ?? 33
      for (const space of ['image', 'world'] as const) {
        for (let k = 0; k < lmCount; k++) {
          const good: number[] = []
          for (let f = 0; f < totalAnimFrames; f++) {
            const vis = timeline[f]?.[space][k]?.visibility ?? 0
            if (timeline[f] && vis >= VIS_OK) good.push(f)
          }
          if (good.length === 0) continue
          for (let f = 0; f < totalAnimFrames; f++) {
            const cur = timeline[f]
            if (!cur) continue
            if ((cur[space][k]?.visibility ?? 0) >= VIS_OK) continue
            let p = 0
            while (p + 1 < good.length && good[p + 1] < f) p++
            const a = good[p]
            const b = good[Math.min(p + 1, good.length - 1)]
            const src = cur[space]
            if (a === b) {
              src[k] = { ...timeline[a]![space][k], visibility: src[k]?.visibility ?? 0 }
            } else {
              const t = (f - a) / (b - a)
              const pa = timeline[a]![space][k]
              const pb = timeline[b]![space][k]
              src[k] = {
                x: pa.x + (pb.x - pa.x) * t,
                y: pa.y + (pb.y - pa.y) * t,
                z: (pa.z || 0) + ((pb.z || 0) - (pa.z || 0)) * t,
                visibility: src[k]?.visibility ?? 0,
              }
            }
          }
        }
      }

      // Binomial [1,2,1] temporal filter: current frame stays dominant so fast motion
      // isn't smeared, but single-frame jitter is still killed.
      const smoothedTimeline: LMSet[] = new Array(totalAnimFrames).fill(null)
      const weightedAvg = (items: { arr: any[]; w: number }[]): any[] => {
        const L = items[0].arr.length
        const res: any[] = []
        for (let k = 0; k < L; k++) {
          let sx = 0, sy = 0, sz = 0, sw = 0, sv = 0
          for (const { arr, w } of items) {
            const l = arr[k]
            const vis = l.visibility ?? 1
            const ww = w * Math.max(0.01, vis)
            sx += l.x * ww; sy += l.y * ww; sz += (l.z || 0) * ww
            sw += ww; sv += vis * w
          }
          const wSum = items.reduce((s, it) => s + it.w, 0)
          res.push({ x: sx / sw, y: sy / sw, z: sz / sw, visibility: sv / wSum })
        }
        return res
      }
      for (let frameIdx = 0; frameIdx < totalAnimFrames; frameIdx++) {
        if (!timeline[frameIdx]) continue
        const imgWin: { arr: any[]; w: number }[] = []
        const worldWin: { arr: any[]; w: number }[] = []
        for (let d = -1; d <= 1; d++) {
          const j = frameIdx + d
          if (j >= 0 && j < totalAnimFrames && timeline[j]) {
            const w = d === 0 ? 2 : 1
            imgWin.push({ arr: timeline[j]!.image, w })
            worldWin.push({ arr: timeline[j]!.world, w })
          }
        }
        smoothedTimeline[frameIdx] = { image: weightedAvg(imgWin), world: weightedAvg(worldWin) }
      }

      const frameEntries: { frameIdx: number; data: LMSet }[] = []
      for (let frameIdx = 0; frameIdx < totalAnimFrames; frameIdx++) {
        const f = smoothedTimeline[frameIdx]
        if (!f) continue
        const avgVis = f.image.reduce((s, l) => s + (l.visibility ?? 1), 0) / f.image.length
        if (avgVis >= 0.35) frameEntries.push({ frameIdx, data: f })
      }

      if (frameEntries.length === 0) { showToast('No poses detected in video', 'warning'); return }

      setVideoProgress(92)

      // --- Build the animation ---------------------------------------------
      const id = `anim_${animationCounterRef.current++}`
      const newAnim: Animation = {
        name: `Video Capture`,
        // Match video timeline: frame N at t = N/captureFps seconds.
        fps: captureFps, totalFrames: totalAnimFrames, speed: 1, loop: true,
        keyframes: new Map()
      }

      type Pt = { x: number; y: number; z: number }
      const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 })

      // Bone -> (start landmark, end landmark) using the standard MediaPipe Pose
      // 33-point topology. Same mapping is applied to both world and image sets.
      const getBoneMapping = (lm: any[]): Record<string, { start: Pt; end: Pt }> => {
        const midHip = mid(lm[23], lm[24])
        const midShoulder = mid(lm[11], lm[12])
        const midNeck = mid(midShoulder, lm[0])
        return {
          'Hips': { start: midHip, end: midShoulder }, 'Spine': { start: midHip, end: midShoulder },
          'Spine1': { start: midHip, end: midShoulder }, 'Spine2': { start: midHip, end: midShoulder },
          'Neck': { start: midShoulder, end: midNeck }, 'Head': { start: midNeck, end: lm[0] },
          'LeftShoulder': { start: midShoulder, end: lm[11] }, 'LeftArm': { start: lm[11], end: lm[13] },
          'LeftForeArm': { start: lm[13], end: lm[15] }, 'LeftHand': { start: lm[15], end: lm[19] },
          'RightShoulder': { start: midShoulder, end: lm[12] }, 'RightArm': { start: lm[12], end: lm[14] },
          'RightForeArm': { start: lm[14], end: lm[16] }, 'RightHand': { start: lm[16], end: lm[20] },
          'LeftUpLeg': { start: lm[23], end: lm[25] }, 'LeftLeg': { start: lm[25], end: lm[27] },
          'LeftFoot': { start: lm[27], end: lm[31] },
          'RightUpLeg': { start: lm[24], end: lm[26] }, 'RightLeg': { start: lm[26], end: lm[28] },
          'RightFoot': { start: lm[28], end: lm[32] },
        }
      }

      // Hybrid landmark space -> character space. x/y come from the accurate 2D image
      // landmarks (aspect-corrected) so the silhouette matches the video. z comes from
      // MediaPipe world landmarks. MediaPipe image axes: +x right, +y down; Three.js:
      // +x right, +y up, +z toward viewer. Keep x, negate y and z (180° about x).
      // Torso/spine stay slightly damped on z; limbs use full world z via two-bone IK.
      const Z_DEPTH_TORSO = 0.85
      const charVec = (a: Pt, b: Pt): THREE.Vector3 =>
        new THREE.Vector3((b.x - a.x), -(b.y - a.y), -(b.z - a.z))

      const dirFromSeg = (start: Pt, end: Pt): THREE.Vector3 | null => {
        const v = charVec(start, end)
        const len = v.length()
        if (len < 1e-6) return null
        return v.divideScalar(len)
      }

      const charPt = (p: Pt): THREE.Vector3 => new THREE.Vector3(p.x, -p.y, -p.z)

      // Non-IK bones still blend a little translation so spine/shoulders follow bounce.
      // IK limbs keep rest lengths — depth comes from the 3D pole, not from stretching.
      const POSITION_GAIN_XZ = 0.45
      const POSITION_GAIN_Y = 0.85

      const torsoQuatFromWorld = (lm: any[]): THREE.Quaternion | null => {
        const lHip = lm[23], rHip = lm[24], lSho = lm[11], rSho = lm[12]
        const midHip = mid(lHip, rHip)
        const midSho = mid(lSho, rSho)
        const up = charVec(midHip, midSho)
        if (up.lengthSq() < 1e-8) return null
        up.normalize()
        const rightApprox = charVec(rHip, lHip).add(charVec(rSho, lSho))
        if (rightApprox.lengthSq() < 1e-8) return null
        rightApprox.normalize()
        const forward = new THREE.Vector3().crossVectors(rightApprox, up)
        if (forward.lengthSq() < 1e-8) return null
        forward.normalize()
        const right = new THREE.Vector3().crossVectors(up, forward).normalize()
        const m = new THREE.Matrix4().makeBasis(right, up, forward)
        return new THREE.Quaternion().setFromRotationMatrix(m)
      }

      const findSegment = (mapping: Record<string, { start: Pt; end: Pt }>, boneName: string) => {
        if (mapping[boneName]) return mapping[boneName]
        const lower = boneName.toLowerCase()
        for (const [mn, s] of Object.entries(mapping)) {
          if (lower.includes(mn.toLowerCase()) || mn.toLowerCase().includes(lower)) return s
        }
        return null
      }

      type IkChain = {
        upper: string
        lower: string
        poleLm: number
        endLm: number
      }
      const ikChains: IkChain[] = []
      const addChain = (upperAliases: string[], lowerAliases: string[], poleLm: number, endLm: number) => {
        const upper = matchNamedBone(skeletonInfo.order, upperAliases)
        const lower = matchNamedBone(skeletonInfo.order, lowerAliases)
        if (upper && lower && upper !== lower) ikChains.push({ upper, lower, poleLm, endLm })
      }
      addChain(['LeftArm', 'LeftUpperArm'], ['LeftForeArm', 'LeftLowerArm'], 13, 15)
      addChain(['RightArm', 'RightUpperArm'], ['RightForeArm', 'RightLowerArm'], 14, 16)
      addChain(['LeftUpLeg', 'LeftUpperLeg', 'LeftThigh'], ['LeftLeg', 'LeftLowerLeg', 'LeftCalf', 'LeftShin'], 25, 27)
      addChain(['RightUpLeg', 'RightUpperLeg', 'RightThigh'], ['RightLeg', 'RightLowerLeg', 'RightCalf', 'RightShin'], 26, 28)
      const ikUpperOf = new Map<string, IkChain>()
      const ikLowerOf = new Map<string, IkChain>()
      for (const c of ikChains) {
        ikUpperOf.set(c.upper, c)
        ikLowerOf.set(c.lower, c)
      }

      const headBoneName = matchNamedBone(skeletonInfo.order, ['Head'])
      const leftHandName = matchNamedBone(skeletonInfo.order, ['LeftHand'])
      const rightHandName = matchNamedBone(skeletonInfo.order, ['RightHand'])
      const leftFootName = matchNamedBone(skeletonInfo.order, ['LeftFoot'])
      const rightFootName = matchNamedBone(skeletonInfo.order, ['RightFoot'])

      const rootBoneName = skeletonInfo.order[0]
      const rootRest = originalTransformsRef.current.get(rootBoneName)?.position
        ?? bones.get(rootBoneName)?.position
      const restHipsQuat: THREE.Quaternion =
        skeletonInfo.bones.get(rootBoneName)?.restQuat?.clone() ?? new THREE.Quaternion()

      // Root translation (image-space). Anchor to the AVERAGE hip position and scale by
      // the MEDIAN torso size across the whole clip. This keeps a steady dancer centred
      // (no slow drift to one side) and prevents amplitude blow-up from an unlucky first
      // frame. The translation is exactly the hip motion MediaPipe reports, mapped 1:1
      // to model scale - nothing synthetic is added.
      const mean = (a: number[]) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0)
      const median = (a: number[]) => {
        if (!a.length) return 0.25
        const s = [...a].sort((x, y) => x - y)
        return s[Math.floor(s.length / 2)]
      }
      const hipXs: number[] = [], hipYs: number[] = [], hipZs: number[] = [], torsoSizes: number[] = []
      for (const { data } of frameEntries) {
        const mh = mid(data!.image[23], data!.image[24])
        const ms = mid(data!.image[11], data!.image[12])
        const mhW = mid(data!.world[23], data!.world[24])
        hipXs.push(mh.x); hipYs.push(mh.y); hipZs.push(mhW.z)
        torsoSizes.push(Math.hypot(ms.x - mh.x, ms.y - mh.y))
      }
      const refHipCenter = { x: mean(hipXs), y: mean(hipYs) }
      const refHipZ = mean(hipZs)
      const screenScale = skeletonInfo.spineLength / (median(torsoSizes) || 0.25)

      // Root motion from hip trajectory in the video. Horizontal (X) stays dampened so a
      // centred dancer doesn't drift; vertical (Y) follows the 2D skeleton bounce/squat
      // closely so the whole body moves up/down with the video rhythm. Z from world hips
      // adds toward/away depth for crossed legs and crouch.
      const ROOT_GAIN_X = 0.45
      const ROOT_GAIN_Y = 1.0
      const ROOT_GAIN_Z = 0.55
      const ROOT_DEADZONE_X = 0.015
      // Near-zero vertical deadzone: even small hip bounces should reach the rig so the
      // body visibly bobs with the music instead of snapping flat between big moves.
      const ROOT_DEADZONE_Y = 0.001
      const smoothOnTimeline = (values: Map<number, number>, win: number) => {
        const out = new Map<number, number>()
        for (const { frameIdx } of frameEntries) {
          let s = 0, c = 0
          for (let d = -win; d <= win; d++) {
            const v = values.get(frameIdx + d)
            if (v !== undefined) { s += v; c++ }
          }
          out.set(frameIdx, c ? s / c : values.get(frameIdx) ?? 0)
        }
        return out
      }
      const shapeRoot = (v: number, gain: number, deadzone: number) => {
        const g = v * gain
        if (Math.abs(g) < deadzone) return 0
        return g - Math.sign(g) * deadzone
      }

      const rawDX = new Map<number, number>()
      const rawDY = new Map<number, number>()
      const rawDZ = new Map<number, number>()
      for (let i = 0; i < frameEntries.length; i++) {
        const { frameIdx, data } = frameEntries[i]
        const mh = mid(data!.image[23], data!.image[24])
        const mhW = mid(data!.world[23], data!.world[24])
        rawDX.set(frameIdx, (mh.x - refHipCenter.x) * screenScale)
        rawDY.set(frameIdx, -(mh.y - refHipCenter.y) * screenScale)
        rawDZ.set(frameIdx, -(mhW.z - refHipZ) * screenScale)
      }
      const rootDX = new Map<number, number>()
      const rootDY = new Map<number, number>()
      const rootDZ = new Map<number, number>()
      for (const [frameIdx, v] of smoothOnTimeline(rawDX, 4)) {
        rootDX.set(frameIdx, shapeRoot(v, ROOT_GAIN_X, ROOT_DEADZONE_X))
      }
      // Light smoothing on Y (win=1 → 3-frame average) preserves quick up/down bounce;
      // a wider window (as on X) would average the bounciness out into a flat glide.
      for (const [frameIdx, v] of smoothOnTimeline(rawDY, 1)) {
        rootDY.set(frameIdx, shapeRoot(v, ROOT_GAIN_Y, ROOT_DEADZONE_Y))
      }
      for (const [frameIdx, v] of smoothOnTimeline(rawDZ, 2)) {
        rootDZ.set(frameIdx, shapeRoot(v, ROOT_GAIN_Z, 0))
      }

      // Torso orientation is applied relative to the first valid frame so the rig's
      // bind/rest orientation is preserved and we only add the body's rotation.
      let refTorsoQuat: THREE.Quaternion | null = null
      let refHeadQuat: THREE.Quaternion | null = null

      const tmpParentInv = new THREE.Quaternion()
      const tmpLocalDir = new THREE.Vector3()

      const lmVis = (arr: any[], i: number) => arr[i]?.visibility ?? 0

      frameEntries.forEach(({ frameIdx, data: frame }) => {
        const img = frame!.image
        const wld = frame!.world

        const deltaX = rootDX.get(frameIdx) ?? 0
        const deltaY = rootDY.get(frameIdx) ?? 0
        const deltaZ = rootDZ.get(frameIdx) ?? 0
        const rootPos = rootRest
          ? new THREE.Vector3(
              rootRest.x + deltaX,
              rootRest.y + deltaY,
              (rootRest.z || 0) + deltaZ,
            )
          : new THREE.Vector3(deltaX, 1 + deltaY, deltaZ)

        // Hybrid: 2D silhouette xy + scaled world z (torso-damped). Used for spine,
        // shoulders, and IK end-effector xy so the model still matches the video.
        const msI = mid(img[11], img[12]), mhI = mid(img[23], img[24])
        const imgTorso = Math.hypot((msI.x - mhI.x) * aspect, msI.y - mhI.y) || 1e-6
        const msW = mid(wld[11], wld[12]), mhW = mid(wld[23], wld[24])
        const worldTorso = Math.hypot(msW.x - mhW.x, msW.y - mhW.y, msW.z - mhW.z) || 1e-6
        const zScale = (imgTorso / worldTorso) * Z_DEPTH_TORSO
        const hyb: Pt[] = img.map((l: any, k: number) => ({
          x: l.x * aspect, y: l.y, z: (wld[k]?.z ?? 0) * zScale,
        }))
        // Full metric world landmarks in character space (undamped z) for IK poles.
        const w3d: Pt[] = wld.map((l: any) => ({ x: l.x, y: l.y, z: l.z || 0 }))

        const mapping = getBoneMapping(hyb)
        const worldQuats: Record<string, THREE.Quaternion> = {}
        const worldPositions: Record<string, THREE.Vector3> = {}

        const midHipChar = charPt(mid(hyb[23], hyb[24]))
        const midShoulderChar = charPt(mid(hyb[11], hyb[12]))
        const hybTorso = midShoulderChar.distanceTo(midHipChar) || 1e-6
        const rigScale = skeletonInfo.spineLength / hybTorso
        const worldScale = skeletonInfo.spineLength / worldTorso

        const jointFromHyb = (idx: number) =>
          rootPos.clone().add(charPt(hyb[idx]).sub(midHipChar).multiplyScalar(rigScale))
        const jointFromWorld = (idx: number) =>
          rootPos.clone().add(charPt(w3d[idx]).multiplyScalar(worldScale))
        // End effectors: video xy (silhouette) + nearly-full world z (depth).
        const ikTarget = (idx: number) => {
          const hy = jointFromHyb(idx)
          const wr = jointFromWorld(idx)
          return new THREE.Vector3(hy.x, hy.y, THREE.MathUtils.lerp(hy.z, wr.z, 0.9))
        }
        const ikPole = (idx: number) => {
          const vis = Math.max(lmVis(wld, idx), lmVis(img, idx))
          return vis >= 0.35 ? jointFromWorld(idx) : jointFromHyb(idx)
        }

        const alignBone = (
          restDir: THREE.Vector3,
          targetWorldDir: THREE.Vector3,
          parentWorldQ: THREE.Quaternion,
        ) => {
          tmpParentInv.copy(parentWorldQ).invert()
          tmpLocalDir.copy(targetWorldDir).applyQuaternion(tmpParentInv)
          if (tmpLocalDir.lengthSq() < 1e-10) return null
          tmpLocalDir.normalize()
          return new THREE.Quaternion().setFromUnitVectors(restDir, tmpLocalDir)
        }

        const frameKeyframes = new Map<string, BoneKeyframe>()
        const solvedLower = new Set<string>()

        for (const boneName of skeletonInfo.order) {
          const bi = skeletonInfo.bones.get(boneName)
          if (!bi) continue
          const bone = bones.get(boneName)
          if (!bone) continue

          const isRoot = !bi.parentName
          const parentWorldQ = bi.parentName
            ? (worldQuats[bi.parentName] ?? new THREE.Quaternion())
            : new THREE.Quaternion()
          const parentWorldPos = bi.parentName
            ? (worldPositions[bi.parentName] ?? new THREE.Vector3())
            : new THREE.Vector3()

          let localQuat: THREE.Quaternion = bi.restQuat.clone()
          const boneRest = originalTransformsRef.current.get(boneName)?.position ?? bone.position
          let localPos = new THREE.Vector3(boneRest.x, boneRest.y, boneRest.z)

          if (isRoot) {
            const qTorso = torsoQuatFromWorld(hyb)
            if (qTorso) {
              if (!refTorsoQuat) refTorsoQuat = qTorso.clone()
              const deltaQ = qTorso.clone().multiply(refTorsoQuat.clone().invert())
              localQuat = deltaQ.multiply(restHipsQuat.clone())
            }
            localPos = rootPos.clone()
            worldPositions[boneName] = rootPos.clone()
            worldQuats[boneName] = parentWorldQ.clone().multiply(localQuat)
            frameKeyframes.set(boneName, {
              position: localPos,
              rotation: localQuat,
              scale: new THREE.Vector3(1, 1, 1),
            })
            continue
          }

          const chain = ikUpperOf.get(boneName)
          if (chain) {
            const lowerBi = skeletonInfo.bones.get(chain.lower)
            const len1 = bi.restLength || skeletonInfo.spineLength * 0.22
            const len2 = lowerBi?.restLength || skeletonInfo.spineLength * 0.2
            const origin = parentWorldPos.clone().add(localPos.clone().applyQuaternion(parentWorldQ))
            const target = ikTarget(chain.endLm)
            const pole = ikPole(chain.poleLm)
            const solved = solveTwoBoneIK(origin, target, pole, len1, len2)

            const upperDir = solved.mid.clone().sub(origin)
            const upperQ = alignBone(bi.childPosDir, upperDir, parentWorldQ)
            if (upperQ) localQuat = upperQ

            worldQuats[boneName] = parentWorldQ.clone().multiply(localQuat)
            worldPositions[boneName] = origin
            frameKeyframes.set(boneName, {
              position: localPos,
              rotation: localQuat,
              scale: new THREE.Vector3(1, 1, 1),
            })

            if (lowerBi) {
              const lowerBone = bones.get(chain.lower)
              const lowerRest = originalTransformsRef.current.get(chain.lower)?.position
                ?? lowerBone?.position
              const lowerLocalPos = lowerRest
                ? new THREE.Vector3(lowerRest.x, lowerRest.y, lowerRest.z)
                : new THREE.Vector3(0, len1, 0)
              const elbowWorld = origin.clone().add(lowerLocalPos.clone().applyQuaternion(worldQuats[boneName]))
              const lowerDir = target.clone().sub(elbowWorld)
              let lowerLocalQ: THREE.Quaternion = lowerBi.restQuat.clone()
              const lq = alignBone(lowerBi.childPosDir, lowerDir, worldQuats[boneName])
              if (lq) lowerLocalQ = lq
              worldQuats[chain.lower] = worldQuats[boneName].clone().multiply(lowerLocalQ)
              worldPositions[chain.lower] = elbowWorld
              frameKeyframes.set(chain.lower, {
                position: lowerLocalPos,
                rotation: lowerLocalQ,
                scale: new THREE.Vector3(1, 1, 1),
              })
              solvedLower.add(chain.lower)
            }
            continue
          }

          if (solvedLower.has(boneName)) continue

          const seg = findSegment(mapping, boneName)
          if (seg) {
            let targetWorldDir = dirFromSeg(seg.start, seg.end)

            // Head: ears + nose give yaw/pitch instead of a single nose point.
            if (boneName === headBoneName && img[7] && img[8] && img[0]) {
              const midEar = mid(hyb[7], hyb[8])
              const fwd = charVec(midEar, hyb[0])
              const up = charVec(mid(hyb[23], hyb[24]), mid(hyb[11], hyb[12]))
              if (fwd.lengthSq() > 1e-8 && up.lengthSq() > 1e-8) {
                fwd.normalize()
                up.normalize()
                const right = new THREE.Vector3().crossVectors(up, fwd).normalize()
                const upOrtho = new THREE.Vector3().crossVectors(fwd, right).normalize()
                const qHead = new THREE.Quaternion().setFromRotationMatrix(
                  new THREE.Matrix4().makeBasis(right, upOrtho, fwd)
                )
                if (!refHeadQuat) refHeadQuat = qHead.clone()
                const delta = qHead.clone().multiply(refHeadQuat.clone().invert())
                tmpParentInv.copy(parentWorldQ).invert()
                localQuat = tmpParentInv.clone().multiply(delta).multiply(parentWorldQ).multiply(bi.restQuat)
                targetWorldDir = null
              }
            }

            // Hands: aim at the palm centre (index/pinky), not just the index tip.
            if (boneName === leftHandName && hyb[15] && hyb[17] && hyb[19]) {
              const palm = mid(hyb[17], hyb[19])
              targetWorldDir = dirFromSeg(hyb[15], palm)
            }
            if (boneName === rightHandName && hyb[16] && hyb[18] && hyb[20]) {
              const palm = mid(hyb[18], hyb[20])
              targetWorldDir = dirFromSeg(hyb[16], palm)
            }
            // Feet: heel → toe so the sole follows the captured foot, not just the ankle.
            if (boneName === leftFootName && hyb[29] && hyb[31]) {
              targetWorldDir = dirFromSeg(hyb[29], hyb[31]) || targetWorldDir
            }
            if (boneName === rightFootName && hyb[30] && hyb[32]) {
              targetWorldDir = dirFromSeg(hyb[30], hyb[32]) || targetWorldDir
            }

            if (targetWorldDir) {
              const q = alignBone(bi.childPosDir, targetWorldDir, parentWorldQ)
              if (q) localQuat = q
            }
          }

          const fkWorldPos = parentWorldPos.clone().add(
            localPos.clone().applyQuaternion(parentWorldQ)
          )

          let resolvedWorldPos = fkWorldPos
          if (seg) {
            const jointWorldPos = rootPos.clone().add(
              charPt(seg.start).sub(midHipChar).multiplyScalar(rigScale)
            )
            resolvedWorldPos = new THREE.Vector3(
              THREE.MathUtils.lerp(fkWorldPos.x, jointWorldPos.x, POSITION_GAIN_XZ),
              THREE.MathUtils.lerp(fkWorldPos.y, jointWorldPos.y, POSITION_GAIN_Y),
              THREE.MathUtils.lerp(fkWorldPos.z, jointWorldPos.z, POSITION_GAIN_XZ),
            )
          }

          localPos = resolvedWorldPos.clone().sub(parentWorldPos).applyQuaternion(
            parentWorldQ.clone().invert()
          )
          worldPositions[boneName] = resolvedWorldPos
          worldQuats[boneName] = parentWorldQ.clone().multiply(localQuat)

          frameKeyframes.set(boneName, {
            position: localPos,
            rotation: localQuat,
            scale: new THREE.Vector3(1, 1, 1),
          })
        }

        newAnim.keyframes.set(frameIdx, frameKeyframes)
      })

      // Quaternion/position temporal filter on the finished animation. Landmark
      // averaging can still leave bone-level jitter; a 3-tap slerp (current-frame
      // weighted) kills that without flattening IK depth or bounce.
      {
        const frames = [...newAnim.keyframes.keys()].sort((a, b) => a - b)
        if (frames.length >= 3) {
          const orig = frames.map(f => {
            const src = newAnim.keyframes.get(f)!
            const copy = new Map<string, BoneKeyframe>()
            src.forEach((kf, name) => {
              copy.set(name, {
                position: kf.position.clone(),
                rotation: kf.rotation.clone(),
                scale: kf.scale.clone(),
              })
            })
            return copy
          })
          for (let i = 0; i < frames.length; i++) {
            const prev = orig[Math.max(0, i - 1)]
            const cur = orig[i]
            const next = orig[Math.min(orig.length - 1, i + 1)]
            const out = newAnim.keyframes.get(frames[i])!
            out.forEach((kf, name) => {
              const p = prev.get(name)
              const c = cur.get(name)
              const n = next.get(name)
              if (!p || !c || !n) return
              const midQ = slerpKeepHemisphere(p.rotation, n.rotation, 0.5)
              kf.rotation.copy(slerpKeepHemisphere(midQ, c.rotation, 0.7))
              kf.position.set(
                p.position.x * 0.15 + c.position.x * 0.7 + n.position.x * 0.15,
                p.position.y * 0.1 + c.position.y * 0.8 + n.position.y * 0.1,
                p.position.z * 0.15 + c.position.z * 0.7 + n.position.z * 0.15,
              )
            })
          }
        }
      }

      setAnimations(prev => new Map(prev).set(id, newAnim))
      setCurrentAnimationId(id)
      setCurrentFrame(0)
      setShowVideoModal(false)
      setVideoFile(null)
      const durationSec = (totalAnimFrames / captureFps).toFixed(1)
      showToast(`Imported ${frameEntries.length} keyframes · ${captureFps} fps · ${durationSec}s`, 'success')
    } catch (err: any) {
      console.error('Video capture error:', err)
      showToast('Error: ' + (err.message || 'Video processing failed'), 'error')
    } finally {
      setVideoAnalyzing(false)
      setVideoProgress(0)
    }
  }, [videoFile, bones, analyzeSkeletonHierarchy, loadPoseModel, showToast, setAnimations, setCurrentAnimationId, setCurrentFrame])

  // TEMPORARY (testing): live MediaPipe skeleton overlaid on the source video so testers
  // can compare the detected pose against the captured animation. Remove later.
  useEffect(() => {
    if (!showVideoModal || !videoFile || videoAnalyzing) return
    const video = previewVideoRef.current
    const canvas = previewCanvasRef.current
    if (!video || !canvas) return

    // MediaPipe Pose 33-point body connections (face points omitted for clarity).
    const CONNECTIONS: [number, number][] = [
      [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
      [11, 23], [12, 24], [23, 24],
      [23, 25], [25, 27], [27, 29], [29, 31], [27, 31],
      [24, 26], [26, 28], [28, 30], [30, 32], [28, 32],
      [15, 17], [15, 19], [17, 19], [16, 18], [16, 20], [18, 20],
    ]

    let cancelled = false
    let raf = 0
    const ctx = canvas.getContext('2d')!
    const url = URL.createObjectURL(videoFile)
    video.src = url
    video.muted = true
    video.loop = true

    const draw = (landmarks: any[]) => {
      const w = video.videoWidth, h = video.videoHeight
      if (!w || !h) return
      if (canvas.width !== w) canvas.width = w
      if (canvas.height !== h) canvas.height = h
      ctx.clearRect(0, 0, w, h)
      ctx.lineWidth = Math.max(2, w / 250)
      ctx.strokeStyle = '#22c55e'
      ctx.fillStyle = '#4ade80'
      for (const [a, b] of CONNECTIONS) {
        const la = landmarks[a], lb = landmarks[b]
        if (!la || !lb || (la.visibility ?? 1) < 0.4 || (lb.visibility ?? 1) < 0.4) continue
        ctx.beginPath()
        ctx.moveTo(la.x * w, la.y * h)
        ctx.lineTo(lb.x * w, lb.y * h)
        ctx.stroke()
      }
      const r = Math.max(3, w / 180)
      for (const lm of landmarks) {
        if ((lm.visibility ?? 1) < 0.4) continue
        ctx.beginPath()
        ctx.arc(lm.x * w, lm.y * h, r, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    const setup = async () => {
      let pose: any
      try { pose = await loadPoseModel() } catch { return }
      if (cancelled) return
      video.play().catch(() => {})
      // The heavy model's detect() is synchronous and blocks the main thread, so
      // running it every animation frame stutters the video. Throttle it to ~10fps:
      // the video keeps playing smoothly and the skeleton overlay updates often
      // enough to be useful.
      let lastDetect = 0
      const DETECT_INTERVAL = 100
      const loop = (now: number) => {
        if (cancelled) return
        if (!video.paused && video.readyState >= 2 && now - lastDetect >= DETECT_INTERVAL) {
          lastDetect = now
          try {
            const res = pose.detect(video)
            if (res?.landmarks?.[0]) draw(res.landmarks[0])
          } catch { /* ignore transient detect errors */ }
        }
        raf = requestAnimationFrame(loop)
      }
      raf = requestAnimationFrame(loop)
    }
    setup()

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      try { video.pause() } catch {}
      URL.revokeObjectURL(url)
    }
  }, [showVideoModal, videoFile, videoAnalyzing, loadPoseModel])

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
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-[#22c55e] to-[#16a34a] rounded-2xl flex items-center justify-center shadow-lg shadow-[#22c55e]/20">
              <Bone className="w-10 h-10 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Welcome to Frim</h2>
            <p className="text-[#a1a1aa] mb-8">GLB Animation Editor - Create and edit skeletal animations</p>
            
            <div className="space-y-3">
              <button
                onClick={loadSampleModel}
                className="w-full py-3 px-4 bg-[#22c55e] text-[#09090b] rounded-xl font-semibold hover:bg-[#4ade80] transition-colors flex items-center justify-center gap-2"
              >
                <Bot className="w-5 h-5" />
                Load Sample Model
              </button>
              
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-3 px-4 bg-[#1c2130] text-white border border-[#252b3d] rounded-xl font-semibold hover:bg-[#252b3d] transition-colors flex items-center justify-center gap-2"
              >
                <FolderOpen className="w-5 h-5" />
                Import GLB/GLTF File
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
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.[0]) {
            setVideoFile(e.target.files[0])
            setShowVideoModal(true)
          }
          e.target.value = ''
        }}
      />

      {/* Top Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#151821] border border-[#252b3d] rounded-xl flex gap-1 p-1.5 z-10">
        {/* File operations */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-[#a1a1aa] hover:bg-[#1c2130] transition-colors"
          title="Load Model (GLB/GLTF)"
        >
          <FolderOpen className="w-5 h-5" />
        </button>
        <button
          onClick={() => document.getElementById('json-import-input')?.click()}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-[#a1a1aa] hover:bg-[#1c2130] transition-colors"
          title="Import Animation (JSON)"
        >
          <Upload className="w-5 h-5" />
        </button>
        <button
          onClick={exportJSON}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-[#a1a1aa] hover:bg-[#1c2130] transition-colors"
          title="Export JSON"
        >
          <FileJson className="w-5 h-5" />
        </button>
        <button
          onClick={openExportModal}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-[#a1a1aa] hover:bg-[#1c2130] transition-colors"
          title="Export GLB with Animations"
        >
          <Download className="w-5 h-5" />
        </button>
        <div className="w-px h-8 my-1 bg-[#252b3d]" />
        
        {/* Undo/Redo */}
        <button
          onClick={undo}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-[#a1a1aa] hover:bg-[#1c2130] transition-colors disabled:opacity-30"
          title="Undo (Ctrl+Z)"
          disabled={historyIndex <= 0}
        >
          <Undo2 className="w-5 h-5" />
        </button>
        <button
          onClick={redo}
          className="w-10 h-10 rounded-lg flex items-center justify-center text-[#a1a1aa] hover:bg-[#1c2130] transition-colors disabled:opacity-30"
          title="Redo (Ctrl+Y)"
          disabled={historyIndex >= history.length - 1}
        >
          <Redo2 className="w-5 h-5" />
        </button>
        <div className="w-px h-8 my-1 bg-[#252b3d]" />
        
        {/* Transform tools */}
        <button
          onClick={() => setCurrentTool('select')}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            currentTool === 'select' ? 'bg-[#22c55e] text-[#09090b]' : 'text-[#a1a1aa] hover:bg-[#1c2130]'
          }`}
          title="Select (V)"
        >
          <MousePointer2 className="w-5 h-5" />
        </button>
        <button
          onClick={() => setCurrentTool('rotate')}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            currentTool === 'rotate' ? 'bg-[#22c55e] text-[#09090b]' : 'text-[#a1a1aa] hover:bg-[#1c2130]'
          }`}
          title="Rotate (R)"
        >
          <RotateCcw className="w-5 h-5" />
        </button>
        <button
          onClick={() => setCurrentTool('translate')}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            currentTool === 'translate' ? 'bg-[#22c55e] text-[#09090b]' : 'text-[#a1a1aa] hover:bg-[#1c2130]'
          }`}
          title="Translate (T)"
        >
          <Move className="w-5 h-5" />
        </button>
        <button
          onClick={() => setCurrentTool('scale')}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            currentTool === 'scale' ? 'bg-[#22c55e] text-[#09090b]' : 'text-[#a1a1aa] hover:bg-[#1c2130]'
          }`}
          title="Scale (S)"
        >
          <Maximize2 className="w-5 h-5" />
        </button>
        <div className="w-px h-8 my-1 bg-[#252b3d]" />
        
        {/* View toggles */}
        <button
          onClick={() => setShowGrid(v => !v)}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            showGrid ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'text-[#a1a1aa] hover:bg-[#1c2130]'
          }`}
          title="Toggle Grid"
        >
          <Grid3X3 className="w-5 h-5" />
        </button>
        <button
          onClick={() => setShowBoneView(v => !v)}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
            showBoneView ? 'bg-[#22c55e]/20 text-[#22c55e]' : 'text-[#a1a1aa] hover:bg-[#1c2130]'
          }`}
          title="Toggle Bone View (B)"
        >
          <Bone className="w-5 h-5" />
        </button>
        <div className="w-px h-8 my-1 bg-[#252b3d]" />
        
        {/* AI Video Motion Capture (Pro) */}
        <button
          onClick={() => {
            if (!canUseVideoAnalysis) {
              setUpgradeModalReason('video_analysis')
              setShowUpgradeModal(true)
              return
            }
            if (bones.size === 0) {
              showToast('Load a model with a skeleton first', 'warning')
              return
            }
            videoInputRef.current?.click()
          }}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors relative ${
            canUseVideoAnalysis ? 'text-[#a1a1aa] hover:bg-[#1c2130]' : 'text-[#71717a] hover:bg-[#1c2130]'
          }`}
          title={canUseVideoAnalysis ? 'AI Video Motion Capture' : 'AI Video Motion Capture (Pro)'}
        >
          <Video className="w-5 h-5" />
          {!canUseVideoAnalysis && (
            <span className="absolute -top-1 -right-1 text-[8px] bg-[#22c55e]/20 text-[#22c55e] px-1 rounded font-bold">PRO</span>
          )}
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
            <div
              onClick={handleModelSelect}
              className={`px-2 py-1.5 mb-1 rounded cursor-pointer transition-colors flex items-center gap-1.5 ${
                isModelSelected
                  ? 'bg-[#22c55e]/20 text-[#22c55e] border border-[#22c55e]/30'
                  : 'hover:bg-[#1c2130] text-[#a1a1aa]'
              }`}
              title="Move, scale or rotate the whole model"
            >
              <Package className="w-3 h-3" />
              Whole Model
            </div>
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
          <p className="text-[10px] text-[#71717a] flex items-center gap-1">
            <Package className="w-3 h-3" />
            {loadedFilename || 'No model'}
          </p>
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
                        }}
                        onBlur={saveToHistory}
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
                        }}
                        onBlur={saveToHistory}
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
                        }}
                        onBlur={saveToHistory}
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
                className="py-2 bg-[#22c55e] text-[#09090b] rounded-lg font-semibold text-xs hover:bg-[#4ade80] transition-colors flex items-center justify-center gap-1"
              >
                <Key className="w-3.5 h-3.5" />
                Keyframe
              </button>
              <button
                onClick={duplicateKeyframes}
                className="py-2 bg-[#27272a] text-[#a1a1aa] border border-[#3f3f46] rounded-lg text-xs hover:bg-[#3f3f46] transition-colors flex items-center justify-center gap-1"
                title="Duplicate selected keyframes (Ctrl+D)"
              >
                <Copy className="w-3.5 h-3.5" />
                Duplicate
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={resetBone}
                className="py-2 bg-[#27272a] text-[#a1a1aa] border border-[#3f3f46] rounded-lg text-xs hover:bg-[#3f3f46] transition-colors flex items-center justify-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset
              </button>
              <button
                onClick={deleteSelectedKeyframes}
                className="py-2 bg-[#27272a] text-[#dc2626] border border-[#3f3f46] rounded-lg text-xs hover:bg-[#3f3f46] transition-colors flex items-center justify-center gap-1"
                title="Delete selected keyframes"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete Key
              </button>
            </div>
            <button
              onClick={() => {
                // Pre-select bones without keyframes
                const bonesWithKeyframes = new Set<string>()
                if (currentAnimation) {
                  currentAnimation.keyframes.forEach((frameData) => {
                    frameData.forEach((_, boneName) => {
                      bonesWithKeyframes.add(boneName)
                    })
                  })
                }
                const bonesWithoutKeyframes = new Set<string>()
                bones.forEach((_, boneName) => {
                  if (!bonesWithKeyframes.has(boneName)) {
                    bonesWithoutKeyframes.add(boneName)
                  }
                })
                setSelectedResetBones(bonesWithoutKeyframes)
                setShowResetBonesModal(true)
              }}
              className="w-full py-1.5 bg-[#27272a] text-[#a1a1aa] border border-[#3f3f46] rounded-lg text-xs hover:bg-[#3f3f46] transition-colors flex items-center justify-center gap-1"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Reset Multiple Bones
            </button>
            <div className="grid grid-cols-3 gap-1">
              <button onClick={copyPose} className="py-1.5 bg-[#27272a] text-[#a1a1aa] rounded text-[10px] hover:bg-[#3f3f46] flex items-center justify-center gap-1">
                <Clipboard className="w-3 h-3" />
                Copy
              </button>
              <button onClick={pastePose} className="py-1.5 bg-[#27272a] text-[#a1a1aa] rounded text-[10px] hover:bg-[#3f3f46] flex items-center justify-center gap-1">
                <ClipboardPaste className="w-3 h-3" />
                Paste
              </button>
              <button onClick={mirrorPose} className="py-1.5 bg-[#27272a] text-[#a1a1aa] rounded text-[10px] hover:bg-[#3f3f46] flex items-center justify-center gap-1">
                <FlipHorizontal className="w-3 h-3" />
                Mirror
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 text-center text-[#71717a] text-xs border-b border-[#252b3d]">
            Click a bone to select
          </div>
        )}

        {/* Animations Section */}
        <div className="p-3 border-b border-[#252b3d] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-xs tracking-widest text-[#71717a] font-semibold">ANIMATIONS</h3>
            {!isPro && (
              <span className="text-[10px] text-[#71717a] font-mono">
                {animations.size}/{animationLimit}
              </span>
            )}
          </div>
          <button
            onClick={createNewAnimation}
            className={`w-6 h-6 rounded flex items-center justify-center transition-colors ${
              !isPro && animations.size >= animationLimit
                ? 'bg-[#252b3d] text-[#71717a] hover:bg-[#3f3f46]'
                : 'bg-[#22c55e] text-[#09090b] hover:bg-[#4ade80]'
            }`}
            title={!isPro && animations.size >= animationLimit ? 'Upgrade to Pro for more animations' : 'Create new animation'}
          >
            {!isPro && animations.size >= animationLimit ? <Lock className="w-3.5 h-3.5" /> : <Plus className="w-4 h-4" />}
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
                  // Reset only bones without keyframes to T-pose
                  resetBonesWithoutKeyframes(anim)
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
                      className="w-5 h-5 rounded flex items-center justify-center text-[#71717a] hover:bg-[#252b3d] hover:text-[#a1a1aa]"
                      title="Duplicate"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteAnimation(id) }}
                      className="w-5 h-5 rounded flex items-center justify-center text-[#71717a] hover:bg-[#252b3d] hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
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
              className="w-8 h-8 bg-[#151821] border border-[#252b3d] rounded-md text-[#a1a1aa] hover:bg-[#1c2130] flex items-center justify-center"
            >
              <SkipBack className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIsPlaying(p => !p)}
              className={`w-8 h-8 border border-[#252b3d] rounded-md flex items-center justify-center ${
                isPlaying ? 'bg-[#22c55e] text-[#09090b]' : 'bg-[#151821] text-[#a1a1aa] hover:bg-[#1c2130]'
              }`}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={() => { setIsPlaying(false); goToFrame(0) }}
              className="w-8 h-8 bg-[#151821] border border-[#252b3d] rounded-md text-[#a1a1aa] hover:bg-[#1c2130] flex items-center justify-center"
            >
              <Square className="w-4 h-4" />
            </button>
            <button
              onClick={() => goToFrame(currentFrame + 1)}
              className="w-8 h-8 bg-[#151821] border border-[#252b3d] rounded-md text-[#a1a1aa] hover:bg-[#1c2130] flex items-center justify-center"
            >
              <SkipForward className="w-4 h-4" />
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
          <div className="h-6 bg-[#0f1117] border-b border-[#252b3d] relative min-w-full" style={{ width: `${totalFrames * 20}px` }}>
            {Array.from({ length: Math.floor(totalFrames / 5) + 1 }).map((_, i) => (
              <span
                key={i}
                className="absolute text-[10px] text-[#71717a] font-mono top-1"
                style={{ left: `${i * 5 * 20}px` }}
              >
                {i * 5}
              </span>
            ))}
            {/* Show the final frame marker if not on a multiple of 5 */}
            {totalFrames % 5 !== 0 && (
              <span
                className="absolute text-[10px] text-[#22c55e] font-mono top-1"
                style={{ left: `${totalFrames * 20}px` }}
              >
                {totalFrames}
              </span>
            )}
          </div>

          {/* Track */}
          <div
            ref={timelineTracksRef}
            className="h-[calc(100%-24px)] relative cursor-pointer select-none"
            style={{ 
              width: `${totalFrames * 20}px`,
              background: 'repeating-linear-gradient(90deg, #252b3d 0px, #252b3d 1px, transparent 1px, transparent 20px)'
            }}
            onMouseDown={(e) => {
              // Only start box selection if clicking on empty area (not on a keyframe marker)
              if ((e.target as HTMLElement).classList.contains('keyframe-marker')) return
              
              const track = e.currentTarget
              const rect = track.getBoundingClientRect()
              const startX = e.clientX - rect.left + track.parentElement!.scrollLeft
              const startY = e.clientY - rect.top
              
              // Start box selection
              setBoxSelection({
                active: true,
                startX,
                startY,
                currentX: startX,
                currentY: startY
              })
              
              const handleMouseMove = (moveEvent: MouseEvent) => {
                const currentX = moveEvent.clientX - rect.left + track.parentElement!.scrollLeft
                const currentY = moveEvent.clientY - rect.top
                setBoxSelection(prev => prev ? { ...prev, currentX, currentY } : null)
              }
              
              const handleMouseUp = (upEvent: MouseEvent) => {
                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)
                
                const endX = upEvent.clientX - rect.left + track.parentElement!.scrollLeft
                const endY = upEvent.clientY - rect.top
                
                const left = Math.min(startX, endX)
                const right = Math.max(startX, endX)
                const top = Math.min(startY, endY)
                const bottom = Math.max(startY, endY)
                
                // Only select if box has meaningful size
                if (right - left > 5 || bottom - top > 5) {
                  // Select keyframes within box
                  if (!upEvent.shiftKey) {
                    setSelectedKeyframes(new Set())
                  }
                  
                  const newSelection = upEvent.shiftKey ? new Set(selectedKeyframes) : new Set<string>()
                  
                  if (currentAnimation) {
                    currentAnimation.keyframes.forEach((frameData, frame) => {
                      const markerX = frame * 20
                      let idx = 0
                      frameData.forEach((_, boneName) => {
                        const markerY = 20 + idx * 16
                        if (markerX >= left && markerX <= right && markerY >= top && markerY <= bottom) {
                          newSelection.add(`${frame}:${boneName}`)
                        }
                        idx++
                      })
                    })
                  }
                  
                  setSelectedKeyframes(newSelection)
                } else {
                  // Small movement = click to go to frame
                  const frame = Math.max(0, Math.min(totalFrames, Math.round(startX / 20)))
                  if (!upEvent.shiftKey) {
                    clearKeyframeSelection()
                  }
                  goToFrame(frame)
                }
                
                setBoxSelection(null)
              }
              
              e.preventDefault()
              document.addEventListener('mousemove', handleMouseMove)
              document.addEventListener('mouseup', handleMouseUp)
            }}
          >
            {/* Box selection overlay */}
            {boxSelection && (
              <div
                className="absolute bg-[#22c55e]/20 border border-[#22c55e] pointer-events-none z-20"
                style={{
                  left: `${Math.min(boxSelection.startX, boxSelection.currentX)}px`,
                  top: `${Math.min(boxSelection.startY, boxSelection.currentY)}px`,
                  width: `${Math.abs(boxSelection.currentX - boxSelection.startX)}px`,
                  height: `${Math.abs(boxSelection.currentY - boxSelection.startY)}px`
                }}
              />
            )}
            
            {/* Keyframe markers */}
            {currentAnimation?.keyframes && Array.from(currentAnimation.keyframes.entries()).map(([frame, frameData]) => (
              Array.from(frameData.keys()).map((boneName, idx) => {
                const keyId = `${frame}:${boneName}`
                const isSelected = selectedKeyframes.has(keyId)
                
                return (
                <div
                  key={keyId}
                  className={`keyframe-marker absolute w-3 h-3 rounded-sm rotate-45 -translate-x-1/2 cursor-grab hover:scale-125 transition-all ${
                    isSelected 
                      ? 'bg-[#06b6d4] border-2 border-[#151821] scale-110 shadow-[0_0_10px_#06b6d4]' 
                      : selectedBone?.name === boneName 
                        ? 'bg-[#fbbf24] border-2 border-[#151821]' 
                        : 'bg-[#22c55e] border-2 border-[#151821]'
                  } ${draggingKeyframe?.boneName === boneName && draggingKeyframe?.fromFrame === frame ? 'scale-150 opacity-80 cursor-grabbing' : ''}`}
                  style={{ 
                    left: `${frame * 20}px`, 
                    top: `${20 + idx * 16}px`
                  }}
                  title={`${boneName} @ frame ${frame}${isSelected ? ' (selected)' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!draggingKeyframe) {
                      // Shift+click to add/toggle selection
                      selectKeyframe(frame, boneName, e.shiftKey)
                      goToFrame(frame)
                      handleBoneSelect(boneName)
                    }
                  }}
                  onMouseDown={(e) => {
                    if (e.button !== 0) return
                    e.stopPropagation()
                    e.preventDefault()
                    
                    const startX = e.clientX
                    const startFrame = frame
                    let currentNewFrame = startFrame
                    let hasMoved = false
                    
                    // If this keyframe is selected and there are multiple selections, move all
                    const movingMultiple = isSelected && selectedKeyframes.size > 1
                    
                    setDraggingKeyframe({ boneName, fromFrame: frame })
                    
                    const handleMouseMove = (moveEvent: MouseEvent) => {
                      const deltaX = moveEvent.clientX - startX
                      const deltaFrames = Math.round(deltaX / 20)
                      currentNewFrame = Math.max(0, Math.min(totalFrames, startFrame + deltaFrames))
                      
                      if (currentNewFrame !== startFrame) {
                        hasMoved = true
                      }
                    }
                    
                    const handleMouseUp = () => {
                      document.removeEventListener('mousemove', handleMouseMove)
                      document.removeEventListener('mouseup', handleMouseUp)
                      
                      setDraggingKeyframe(null)
                      
                      if (hasMoved && currentNewFrame !== startFrame) {
                        const deltaFrames = currentNewFrame - startFrame
                        if (movingMultiple) {
                          moveSelectedKeyframes(deltaFrames)
                        } else {
                          moveKeyframe(boneName, startFrame, currentNewFrame)
                        }
                      }
                    }
                    
                    document.addEventListener('mousemove', handleMouseMove)
                    document.addEventListener('mouseup', handleMouseUp)
                  }}
                />
              )})
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

      {/* Upgrade Modal */}
      {showUpgradeModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[2000] p-4">
          <div className="bg-[#151821] border border-[#252b3d] rounded-2xl w-full max-w-md p-6 text-center">
            <div className="w-16 h-16 bg-[#22c55e]/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              {upgradeModalReason === 'video_analysis' ? (
                <Video className="w-8 h-8 text-[#22c55e]" />
              ) : (
                <Zap className="w-8 h-8 text-[#22c55e]" />
              )}
            </div>
            <h2 className="text-xl font-semibold mb-2">
              {upgradeModalReason === 'video_analysis' 
                ? 'AI Video Motion Capture' 
                : 'Animation Limit Reached'}
            </h2>
            <p className="text-[#a1a1aa] mb-6">
              {upgradeModalReason === 'video_analysis' 
                ? 'Extract animations from videos with AI pose detection. Upgrade to Pro to unlock this powerful feature.'
                : `You've reached the limit of ${animationLimit} animation${animationLimit !== 1 ? 's' : ''} on the Free plan. Upgrade to Pro for unlimited animations.`}
            </p>
            
            {/* Feature highlights */}
            <div className="bg-[#0f1117] border border-[#252b3d] rounded-xl p-4 mb-6 text-left">
              <p className="text-xs font-semibold text-[#71717a] mb-3">PRO INCLUDES:</p>
              <ul className="space-y-2">
                {[
                  'Unlimited animations per project',
                  'AI Video Motion Capture',
                  'Unlimited projects',
                  'Priority support'
                ].map((feature, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-[#a1a1aa]">
                    <Check className="w-4 h-4 text-[#22c55e] shrink-0" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
            
            <div className="flex flex-col gap-3">
              <a
                href="/pricing"
                className="w-full py-3 bg-[#22c55e] text-[#09090b] rounded-xl font-semibold hover:bg-[#4ade80] transition-colors flex items-center justify-center gap-2"
              >
                <Zap className="w-5 h-5" />
                Upgrade to Pro - $12/month
              </a>
              <button
                onClick={() => setShowUpgradeModal(false)}
                className="w-full py-2 bg-[#252b3d] text-[#a1a1aa] rounded-xl hover:bg-[#2f3649] transition-colors"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Motion Capture Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[2000] p-4">
          <div className="bg-[#151821] border border-[#252b3d] rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#22c55e]/10 rounded-xl flex items-center justify-center">
                  <Video className="w-5 h-5 text-[#22c55e]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">AI Motion Capture</h2>
                  <p className="text-xs text-[#71717a]">{videoFile?.name || 'No file selected'}</p>
                </div>
              </div>
              <button
                onClick={() => { setShowVideoModal(false); setVideoFile(null); setVideoAnalyzing(false) }}
                className="text-[#71717a] hover:text-[#a1a1aa] p-2"
                disabled={videoAnalyzing}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!videoAnalyzing ? (
              <>
                {/* TEMPORARY preview: live MediaPipe skeleton over the video (testing) */}
                <div className="relative w-full rounded-xl overflow-hidden mb-3 bg-black flex items-center justify-center" style={{ aspectRatio: '16 / 9' }}>
                  <video
                    ref={previewVideoRef}
                    className="absolute inset-0 w-full h-full object-contain"
                    playsInline
                    muted
                  />
                  <canvas
                    ref={previewCanvasRef}
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  />
                  <span className="absolute top-2 left-2 text-[10px] font-bold bg-black/60 text-[#4ade80] px-2 py-0.5 rounded">
                    PREVIEW · detected skeleton
                  </span>
                </div>
                <div className="bg-[#0f1117] border border-[#252b3d] rounded-xl p-4 mb-4 space-y-3">
                  <p className="text-xs text-[#71717a]">Frim AI will detect body poses frame-by-frame and map them to your skeleton.</p>
                  <div className="flex items-center gap-2 text-xs text-[#a1a1aa]">
                    <span className="w-2 h-2 bg-[#22c55e] rounded-full" />
                    Processes entirely in your browser
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowVideoModal(false); setVideoFile(null) }}
                    className="flex-1 py-2.5 bg-[#252b3d] text-[#a1a1aa] rounded-xl hover:bg-[#2f3649] transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={processVideoCapture}
                    className="flex-1 py-2.5 bg-[#22c55e] text-[#09090b] rounded-xl font-semibold hover:bg-[#4ade80] transition-colors flex items-center justify-center gap-2"
                  >
                    <Video className="w-4 h-4" />
                    Process Video
                  </button>
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="bg-[#0f1117] border border-[#252b3d] rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-[#a1a1aa]">Analyzing video...</span>
                    <span className="text-sm font-mono text-[#22c55e]">{videoProgress}%</span>
                  </div>
                  <div className="h-2 bg-[#252b3d] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#22c55e] to-[#4ade80] rounded-full transition-all duration-300"
                      style={{ width: `${videoProgress}%` }}
                    />
                  </div>
                  <p className="text-xs text-[#71717a] mt-2">
                    {
                      videoProgress < 5 ? 'Loading AI model...' :
                      videoProgress < 22 ? 'Pass 1/4: even frames forward...' :
                      videoProgress < 44 ? 'Pass 2/4: even frames backward...' :
                      videoProgress < 66 ? 'Pass 3/4: odd frames forward...' :
                      videoProgress < 88 ? 'Pass 4/4: odd frames backward...' :
                      'Building keyframes at video pace...'
                    }
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GLB Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[2000] p-4">
          <div className="bg-[#151821] border border-[#252b3d] rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#22c55e]/10 rounded-xl flex items-center justify-center">
                  <Package className="w-5 h-5 text-[#22c55e]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">Export GLB</h2>
                  <p className="text-xs text-[#71717a]">Export model with animations</p>
                </div>
              </div>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-[#71717a] hover:text-[#a1a1aa] p-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Filename input */}
            <div className="mb-4">
              <label className="block text-xs text-[#71717a] mb-2">File Name</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={exportFilename}
                  onChange={(e) => setExportFilename(e.target.value)}
                  className="flex-1 bg-[#0f1117] border border-[#252b3d] rounded-lg px-3 py-2 text-sm text-[#f4f4f5] focus:outline-none focus:border-[#22c55e]"
                  placeholder="model_animated"
                />
                <span className="text-sm text-[#71717a]">.glb</span>
              </div>
            </div>

            {/* Animation selection */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-[#71717a]">Select Animations to Export</label>
                <div className="flex gap-2">
                  <button
                    onClick={selectAllExportAnimations}
                    className="text-[10px] px-2 py-1 bg-[#252b3d] text-[#a1a1aa] rounded hover:bg-[#2f3649] transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={deselectAllExportAnimations}
                    className="text-[10px] px-2 py-1 bg-[#252b3d] text-[#a1a1aa] rounded hover:bg-[#2f3649] transition-colors"
                  >
                    Deselect All
                  </button>
                </div>
              </div>
              <div className="bg-[#0f1117] border border-[#252b3d] rounded-xl max-h-[200px] overflow-y-auto">
                {Array.from(animations.entries()).map(([id, anim]) => {
                  const hasKeyframes = anim.keyframes.size > 0
                  return (
                    <label
                      key={id}
                      className={`flex items-center gap-3 p-3 border-b border-[#252b3d] last:border-b-0 cursor-pointer hover:bg-[#151821] transition-colors ${
                        !hasKeyframes ? 'opacity-50' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedExportAnimations.has(id)}
                        onChange={() => toggleExportAnimation(id)}
                        disabled={!hasKeyframes}
                        className="w-4 h-4 rounded border-[#252b3d] bg-[#0f1117] text-[#22c55e] focus:ring-[#22c55e] focus:ring-offset-0"
                      />
                      <div className="flex-1">
                        <p className="text-sm text-[#f4f4f5]">{anim.name}</p>
                        <p className="text-[10px] text-[#71717a]">
                          {anim.totalFrames}f @ {anim.fps}fps · {anim.keyframes.size} keyframes
                          {!hasKeyframes && ' (no keyframes)'}
                        </p>
                      </div>
                      {selectedExportAnimations.has(id) && (
                        <Check className="w-4 h-4 text-[#22c55e]" />
                      )}
                    </label>
                  )
                })}
              </div>
              <p className="text-[10px] mt-2">
                {selectedExportAnimations.size > 0 ? (
                  <span className="text-[#22c55e]">{selectedExportAnimations.size} animation(s) selected</span>
                ) : (
                  <span className="text-[#71717a]">No animations selected - will export model only</span>
                )}
              </p>
            </div>

            {/* Export options */}
            <div className="mb-6">
              <label className="flex items-center gap-3 p-3 bg-[#0f1117] border border-[#252b3d] rounded-xl cursor-pointer hover:border-[#3f3f46] transition-colors">
                <input
                  type="checkbox"
                  checked={exportIncludeModel}
                  onChange={(e) => setExportIncludeModel(e.target.checked)}
                  className="w-4 h-4 rounded border-[#252b3d] bg-[#0f1117] text-[#22c55e] focus:ring-[#22c55e] focus:ring-offset-0"
                />
                <div>
                  <p className="text-sm text-[#f4f4f5]">Include model mesh</p>
                  <p className="text-[10px] text-[#71717a]">Include the 3D model geometry in the export</p>
                </div>
              </label>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowExportModal(false)}
                className="flex-1 py-3 bg-[#252b3d] text-[#a1a1aa] rounded-xl font-medium hover:bg-[#2f3649] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={exportGLB}
                disabled={exportingGLB}
                className="flex-1 py-3 bg-[#22c55e] text-[#09090b] rounded-xl font-semibold hover:bg-[#4ade80] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {exportingGLB ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Export GLB
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Bones Modal */}
      {showResetBonesModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[2000] p-4">
          <div className="bg-[#151821] border border-[#252b3d] rounded-2xl w-full max-w-lg p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-[#f4f4f5] flex items-center gap-2">
                <RefreshCw className="w-5 h-5" />
                Reset Bones
              </h2>
              <button
                onClick={() => setShowResetBonesModal(false)}
                className="p-1 rounded-lg hover:bg-[#252b3d] transition-colors"
              >
                <X className="w-5 h-5 text-[#71717a]" />
              </button>
            </div>

            <p className="text-sm text-[#71717a] mb-4">
              Select bones to reset to their original T-pose position:
            </p>

            {/* Selection buttons */}
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setSelectedResetBones(new Set(bones.keys()))}
                className="text-[10px] px-2 py-1 bg-[#252b3d] text-[#a1a1aa] rounded hover:bg-[#2f3649] transition-colors"
              >
                Select All
              </button>
              <button
                onClick={() => setSelectedResetBones(new Set())}
                className="text-[10px] px-2 py-1 bg-[#252b3d] text-[#a1a1aa] rounded hover:bg-[#2f3649] transition-colors"
              >
                Deselect All
              </button>
              <button
                onClick={() => {
                  const bonesWithKeyframes = new Set<string>()
                  if (currentAnimation) {
                    currentAnimation.keyframes.forEach((frameData) => {
                      frameData.forEach((_, boneName) => {
                        bonesWithKeyframes.add(boneName)
                      })
                    })
                  }
                  const bonesWithoutKeyframes = new Set<string>()
                  bones.forEach((_, boneName) => {
                    if (!bonesWithKeyframes.has(boneName)) {
                      bonesWithoutKeyframes.add(boneName)
                    }
                  })
                  setSelectedResetBones(bonesWithoutKeyframes)
                }}
                className="text-[10px] px-2 py-1 bg-[#252b3d] text-[#a1a1aa] rounded hover:bg-[#2f3649] transition-colors"
              >
                Without Keyframes
              </button>
              <button
                onClick={() => {
                  const bonesWithKeyframes = new Set<string>()
                  if (currentAnimation) {
                    currentAnimation.keyframes.forEach((frameData) => {
                      frameData.forEach((_, boneName) => {
                        bonesWithKeyframes.add(boneName)
                      })
                    })
                  }
                  setSelectedResetBones(bonesWithKeyframes)
                }}
                className="text-[10px] px-2 py-1 bg-[#252b3d] text-[#a1a1aa] rounded hover:bg-[#2f3649] transition-colors"
              >
                With Keyframes
              </button>
            </div>

            {/* Bone list */}
            <div className="bg-[#0f1117] border border-[#252b3d] rounded-xl max-h-[300px] overflow-y-auto mb-4">
              {Array.from(bones.keys()).sort().map((boneName) => {
                const hasKeyframes = (() => {
                  if (!currentAnimation) return false
                  let has = false
                  currentAnimation.keyframes.forEach((frameData) => {
                    if (frameData.has(boneName)) has = true
                  })
                  return has
                })()
                return (
                  <label
                    key={boneName}
                    className="flex items-center gap-3 p-2 border-b border-[#252b3d] last:border-b-0 cursor-pointer hover:bg-[#151821] transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedResetBones.has(boneName)}
                      onChange={() => {
                        const newSelected = new Set(selectedResetBones)
                        if (newSelected.has(boneName)) {
                          newSelected.delete(boneName)
                        } else {
                          newSelected.add(boneName)
                        }
                        setSelectedResetBones(newSelected)
                      }}
                      className="w-4 h-4 rounded border-[#252b3d] bg-[#0f1117] text-[#22c55e] focus:ring-[#22c55e] focus:ring-offset-0"
                    />
                    <span className={`text-sm ${hasKeyframes ? 'text-[#22c55e]' : 'text-[#f4f4f5]'}`}>
                      {boneName}
                    </span>
                    {hasKeyframes && (
                      <span className="text-[10px] text-[#22c55e] ml-auto">🔑 has keyframes</span>
                    )}
                  </label>
                )
              })}
            </div>

            {/* Add keyframe option */}
            <label className="flex items-center gap-3 p-3 bg-[#0f1117] border border-[#252b3d] rounded-xl cursor-pointer hover:border-[#3f3f46] transition-colors mb-4">
              <input
                type="checkbox"
                checked={resetAddKeyframe}
                onChange={(e) => setResetAddKeyframe(e.target.checked)}
                className="w-4 h-4 rounded border-[#252b3d] bg-[#0f1117] text-[#22c55e] focus:ring-[#22c55e] focus:ring-offset-0"
              />
              <div>
                <p className="text-sm text-[#f4f4f5]">Add keyframe after reset</p>
                <p className="text-[10px] text-[#71717a]">Create keyframes at current frame for reset bones</p>
              </div>
            </label>

            <p className="text-[10px] text-[#71717a] mb-4">
              {selectedResetBones.size > 0 ? (
                <span className="text-[#22c55e]">{selectedResetBones.size} bone(s) selected</span>
              ) : (
                <span>No bones selected</span>
              )}
            </p>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowResetBonesModal(false)}
                className="flex-1 py-3 bg-[#252b3d] text-[#a1a1aa] rounded-xl font-medium hover:bg-[#2f3649] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (selectedResetBones.size === 0) {
                    showToast('No bones selected', 'warning')
                    return
                  }
                  
                  // Reset selected bones
                  selectedResetBones.forEach(boneName => {
                    const bone = bones.get(boneName)
                    const original = originalTransformsRef.current.get(boneName)
                    if (bone && original) {
                      bone.position.copy(original.position)
                      bone.rotation.copy(original.rotation)
                      bone.scale.copy(original.scale)
                    }
                  })
                  
                  // Add keyframes if checkbox is checked
                  if (resetAddKeyframe && currentAnimationId) {
                    setAnimations(prev => {
                      const newAnimations = new Map(prev)
                      const anim = newAnimations.get(currentAnimationId)
                      if (!anim) return prev
                      
                      const newKeyframes = new Map(anim.keyframes)
                      if (!newKeyframes.has(currentFrame)) {
                        newKeyframes.set(currentFrame, new Map())
                      }
                      
                      selectedResetBones.forEach(boneName => {
                        const original = originalTransformsRef.current.get(boneName)
                        if (original) {
                          newKeyframes.get(currentFrame)!.set(boneName, {
                            position: new THREE.Vector3().copy(original.position),
                            rotation: new THREE.Quaternion().setFromEuler(original.rotation),
                            scale: new THREE.Vector3().copy(original.scale)
                          })
                        }
                      })
                      
                      newAnimations.set(currentAnimationId, { ...anim, keyframes: newKeyframes })
                      return newAnimations
                    })
                  }
                  
                  showToast(`${selectedResetBones.size} bone(s) reset${resetAddKeyframe ? ' with keyframes' : ''}`, 'success')
                  setShowResetBonesModal(false)
                }}
                disabled={selectedResetBones.size === 0}
                className="flex-1 py-3 bg-[#22c55e] text-[#09090b] rounded-xl font-semibold hover:bg-[#4ade80] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Reset Selected
              </button>
            </div>
          </div>
        </div>
      )}

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

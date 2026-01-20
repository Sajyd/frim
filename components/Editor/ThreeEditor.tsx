'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js'
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
  const originalGLTFRef = useRef<any>(null)
  const modelDataRef = useRef<string | null>(null)  // Store base64 encoded model data

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
  const [exportIncludeModel, setExportIncludeModel] = useState(true)
  const [exportingGLB, setExportingGLB] = useState(false)

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

  // Get current project data for saving
  const getProjectData = useCallback((): ProjectData => {
    return {
      animations: serializeAnimations(),
      modelName: loadedFilename,
      modelData: modelDataRef.current || undefined
    }
  }, [serializeAnimations, loadedFilename])

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

  // Load sample model from assets
  const loadSampleModel = useCallback(() => {
    if (!sceneRef.current) return
    
    showToast('Loading sample model...', 'info')
    
    const loader = new GLTFLoader()
    
    // Load from assets folder - place your GLB file at /public/assets/sample-model.glb
    loader.load(
      '/assets/sample-model.glb',
      (gltf) => {
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
      },
      undefined,
      (error) => {
        console.error('Failed to load sample model:', error)
        showToast('Sample model not found. Please add a GLB file to /public/assets/sample-model.glb', 'error')
      }
    )
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

        showToast(`Project restored! Found ${boneMap.size} bones.`, 'success')
      }, (error) => {
        console.error('Failed to restore model:', error)
        showToast('Failed to restore model', 'error')
      })
    } catch (err) {
      console.error('Error restoring model:', err)
      showToast('Failed to restore model', 'error')
    }
  }, [showToast])

  // Load initial data when component mounts
  const initialDataLoadedRef = useRef(false)
  useEffect(() => {
    if (initialDataLoadedRef.current) return
    if (!initialData) return
    if (!sceneRef.current) return  // Wait for scene to be ready

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
            }
          }
        }, 100)
      }
    } else if (initialData.animations && initialData.animations.length > 0) {
      // We have animations but no model - just load animations and show welcome
      // (user will need to load a model)
    }
  }, [initialData, loadModelFromBase64])

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
    // Notify parent of changes
    if (notifyChangeRef.current) {
      notifyChangeRef.current()
    }
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

  // Handle video analysis
  const handleVideoAnalysis = useCallback(async () => {
    if (!videoFile || !modelLoaded) {
      showToast('Please load a model first', 'warning')
      return
    }

    setVideoAnalyzing(true)
    setVideoProgress(0)

    try {
      // Simulate video analysis progress
      // In a real implementation, this would send the video to an AI service
      // that extracts pose data from each frame
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(resolve => setTimeout(resolve, 300))
        setVideoProgress(i)
      }

      // Create a sample animation from the "analyzed" video
      // In production, this would use actual pose estimation data
      const newId = `anim_${animationCounterRef.current++}`
      const sampleKeyframes = new Map<number, Map<string, BoneKeyframe>>()
      
      // Generate sample keyframes (placeholder - real implementation would use AI)
      const boneNames = Array.from(bones.keys())
      const frameCount = 60 // Assume 2 seconds at 30fps
      
      for (let frame = 0; frame <= frameCount; frame += 10) {
        const frameData = new Map<string, BoneKeyframe>()
        boneNames.forEach(boneName => {
          const bone = bones.get(boneName)
          if (bone) {
            const original = originalTransformsRef.current.get(boneName)
            if (original) {
              // Add slight variation to simulate extracted motion
              const t = frame / frameCount
              const wobble = Math.sin(t * Math.PI * 2) * 0.1
              frameData.set(boneName, {
                position: original.position.clone(),
                rotation: new THREE.Quaternion().setFromEuler(
                  new THREE.Euler(
                    original.rotation.x + wobble,
                    original.rotation.y,
                    original.rotation.z
                  )
                ),
                scale: original.scale.clone()
              })
            }
          }
        })
        sampleKeyframes.set(frame, frameData)
      }

      const newAnim: Animation = {
        name: `Video: ${videoFile.name.replace(/\.[^.]+$/, '')}`,
        fps: 30,
        totalFrames: frameCount,
        speed: 1,
        loop: true,
        keyframes: sampleKeyframes
      }

      setAnimations(prev => new Map(prev).set(newId, newAnim))
      setCurrentAnimationId(newId)
      setCurrentFrame(0)
      
      showToast('Animation extracted from video!', 'success')
      setShowVideoModal(false)
      setVideoFile(null)
    } catch (error) {
      console.error('Video analysis error:', error)
      showToast('Failed to analyze video', 'error')
    } finally {
      setVideoAnalyzing(false)
      setVideoProgress(0)
    }
  }, [videoFile, modelLoaded, bones, showToast])

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
          }
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
        
        {/* Video Analysis (Pro feature) */}
        <button
          onClick={() => {
            if (canUseVideoAnalysis) {
              setShowVideoModal(true)
            } else {
              setUpgradeModalReason('video_analysis')
              setShowUpgradeModal(true)
            }
          }}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors relative ${
            canUseVideoAnalysis 
              ? 'text-[#a1a1aa] hover:bg-[#1c2130] hover:text-[#22c55e]' 
              : 'text-[#71717a] hover:bg-[#1c2130]'
          }`}
          title={canUseVideoAnalysis ? "AI Video Motion Capture" : "Upgrade to Pro for Video Analysis"}
        >
          <Video className="w-5 h-5" />
          {canUseVideoAnalysis && (
            <Sparkles className="w-2.5 h-2.5 text-[#22c55e] absolute -top-0.5 -right-0.5" />
          )}
          {!canUseVideoAnalysis && (
            <Lock className="w-2.5 h-2.5 text-[#71717a] absolute -top-0.5 -right-0.5" />
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
                onClick={resetBone}
                className="py-2 bg-[#27272a] text-[#a1a1aa] border border-[#3f3f46] rounded-lg text-xs hover:bg-[#3f3f46] transition-colors flex items-center justify-center gap-1"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset
              </button>
            </div>
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

      {/* Video Analysis Modal */}
      {showVideoModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[2000] p-4">
          <div className="bg-[#151821] border border-[#252b3d] rounded-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#22c55e]/10 rounded-xl flex items-center justify-center">
                  <Video className="w-5 h-5 text-[#22c55e]" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold">AI Video Motion Capture</h2>
                  <p className="text-xs text-[#71717a]">Extract bone animations from video</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowVideoModal(false)
                  setVideoFile(null)
                }}
                className="text-[#71717a] hover:text-[#a1a1aa] p-2"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!modelLoaded && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-200 px-4 py-3 rounded-xl mb-6 text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Please load a 3D model first before analyzing video.
              </div>
            )}

            {/* Video upload area */}
            <div
              onClick={() => !videoAnalyzing && videoInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center mb-6 transition-colors ${
                videoFile 
                  ? 'border-[#22c55e]/50 bg-[#22c55e]/5' 
                  : 'border-[#252b3d] hover:border-[#3f3f46] cursor-pointer'
              } ${videoAnalyzing ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {videoFile ? (
                <div className="flex items-center justify-center gap-3">
                  <Video className="w-8 h-8 text-[#22c55e]" />
                  <div className="text-left">
                    <p className="text-sm font-medium text-[#f4f4f5]">{videoFile.name}</p>
                    <p className="text-xs text-[#71717a]">
                      {(videoFile.size / (1024 * 1024)).toFixed(2)} MB
                    </p>
                  </div>
                </div>
              ) : (
                <>
                  <Upload className="w-10 h-10 text-[#71717a] mx-auto mb-3" />
                  <p className="text-sm text-[#a1a1aa] mb-1">Click to upload video</p>
                  <p className="text-xs text-[#71717a]">MP4, MOV, WebM supported</p>
                </>
              )}
            </div>

            {/* Progress bar */}
            {videoAnalyzing && (
              <div className="mb-6">
                <div className="flex items-center justify-between text-xs text-[#a1a1aa] mb-2">
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Analyzing video...
                  </span>
                  <span>{videoProgress}%</span>
                </div>
                <div className="h-2 bg-[#252b3d] rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-[#22c55e] to-[#4ade80] transition-all duration-300"
                    style={{ width: `${videoProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* Info box */}
            <div className="bg-[#0f1117] border border-[#252b3d] rounded-xl p-4 mb-6">
              <h4 className="text-xs font-semibold text-[#a1a1aa] mb-2 flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[#22c55e]" />
                How it works
              </h4>
              <ul className="text-xs text-[#71717a] space-y-1">
                <li>• AI analyzes body movements in your video</li>
                <li>• Pose data is extracted frame by frame</li>
                <li>• Motion is mapped to your model's bones</li>
                <li>• Animation keyframes are auto-generated</li>
              </ul>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowVideoModal(false)
                  setVideoFile(null)
                }}
                className="flex-1 py-3 bg-[#252b3d] text-[#a1a1aa] rounded-xl font-medium hover:bg-[#2f3649] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleVideoAnalysis}
                disabled={!videoFile || !modelLoaded || videoAnalyzing}
                className="flex-1 py-3 bg-[#22c55e] text-[#09090b] rounded-xl font-semibold hover:bg-[#4ade80] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {videoAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Extract Animation
                  </>
                )}
              </button>
            </div>
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

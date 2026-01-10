'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { TransformControls } from 'three/examples/jsm/controls/TransformControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

interface EditorProps {
  projectName: string
  onSave: () => void
  saving: boolean
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
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number; w: number }
  scale: { x: number; y: number; z: number }
}

export default function ThreeEditor({ projectName, onSave, saving }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const transformControlsRef = useRef<TransformControls | null>(null)
  const clockRef = useRef(new THREE.Clock())
  const animationIdRef = useRef<number>(0)

  const [currentTool, setCurrentTool] = useState<'select' | 'rotate' | 'translate' | 'scale'>('rotate')
  const [selectedBone, setSelectedBone] = useState<THREE.Bone | null>(null)
  const [bones, setBones] = useState<Map<string, THREE.Bone>>(new Map())
  const [currentFrame, setCurrentFrame] = useState(0)
  const [totalFrames, setTotalFrames] = useState(30)
  const [isPlaying, setIsPlaying] = useState(false)
  const [fps, setFps] = useState(24)
  const [modelLoaded, setModelLoaded] = useState(false)
  const [animations, setAnimations] = useState<Map<string, Animation>>(new Map())
  const [currentAnimationId, setCurrentAnimationId] = useState<string | null>(null)

  const originalTransformsRef = useRef<Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }>>(new Map())

  // Initialize Three.js scene
  useEffect(() => {
    if (!canvasRef.current) return

    // Scene
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0f1117)
    sceneRef.current = scene

    // Camera
    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000)
    camera.position.set(3, 2, 5)
    cameraRef.current = camera

    // Renderer
    const renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true })
    renderer.setSize(window.innerWidth, window.innerHeight - 52)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    rendererRef.current = renderer

    // Orbit Controls
    const controls = new OrbitControls(camera, canvasRef.current)
    controls.enableDamping = true
    controls.dampingFactor = 0.05
    controls.target.set(0, 1, 0)
    controlsRef.current = controls

    // Transform Controls
    const transformControls = new TransformControls(camera, canvasRef.current)
    transformControls.setMode('rotate')
    transformControls.addEventListener('dragging-changed', (event) => {
      controls.enabled = !event.value
    })
    scene.add(transformControls)
    transformControlsRef.current = transformControls

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
    scene.add(ambientLight)

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1)
    directionalLight.position.set(5, 10, 7)
    directionalLight.castShadow = true
    scene.add(directionalLight)

    const backLight = new THREE.DirectionalLight(0x4ade80, 0.3)
    backLight.position.set(-5, 5, -5)
    scene.add(backLight)

    // Grid
    const gridHelper = new THREE.GridHelper(20, 20, 0x22c55e, 0x252b3d)
    scene.add(gridHelper)

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(20, 20)
    const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3 })
    const ground = new THREE.Mesh(groundGeometry, groundMaterial)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // Animation loop
    const animate = () => {
      animationIdRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
    }
    animate()

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
    const animId = 'anim_0'
    setAnimations(new Map([[animId, defaultAnim]]))
    setCurrentAnimationId(animId)

    // Load sample model
    loadSampleModel(scene)

    return () => {
      cancelAnimationFrame(animationIdRef.current)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
    }
  }, [])

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

  const loadSampleModel = (scene: THREE.Scene) => {
    // Create a simple humanoid armature
    const group = new THREE.Group()
    const boneMap = new Map<string, THREE.Bone>()
    const originalTransforms = new Map<string, { position: THREE.Vector3; quaternion: THREE.Quaternion; scale: THREE.Vector3 }>()

    // Create bones
    const createBone = (name: string, position: THREE.Vector3, parent?: THREE.Bone) => {
      const bone = new THREE.Bone()
      bone.name = name
      bone.position.copy(position)
      if (parent) {
        parent.add(bone)
      }
      boneMap.set(name, bone)
      originalTransforms.set(name, {
        position: position.clone(),
        quaternion: bone.quaternion.clone(),
        scale: bone.scale.clone()
      })
      return bone
    }

    // Build skeleton
    const root = createBone('Root', new THREE.Vector3(0, 0, 0))
    const hips = createBone('Hips', new THREE.Vector3(0, 1, 0), root)
    const spine = createBone('Spine', new THREE.Vector3(0, 0.2, 0), hips)
    const spine1 = createBone('Spine1', new THREE.Vector3(0, 0.2, 0), spine)
    const spine2 = createBone('Spine2', new THREE.Vector3(0, 0.2, 0), spine1)
    const neck = createBone('Neck', new THREE.Vector3(0, 0.15, 0), spine2)
    const head = createBone('Head', new THREE.Vector3(0, 0.15, 0), neck)

    // Arms
    const leftShoulder = createBone('LeftShoulder', new THREE.Vector3(-0.1, 0.1, 0), spine2)
    const leftArm = createBone('LeftArm', new THREE.Vector3(-0.15, 0, 0), leftShoulder)
    const leftForeArm = createBone('LeftForeArm', new THREE.Vector3(-0.25, 0, 0), leftArm)
    const leftHand = createBone('LeftHand', new THREE.Vector3(-0.2, 0, 0), leftForeArm)

    const rightShoulder = createBone('RightShoulder', new THREE.Vector3(0.1, 0.1, 0), spine2)
    const rightArm = createBone('RightArm', new THREE.Vector3(0.15, 0, 0), rightShoulder)
    const rightForeArm = createBone('RightForeArm', new THREE.Vector3(0.25, 0, 0), rightArm)
    const rightHand = createBone('RightHand', new THREE.Vector3(0.2, 0, 0), rightForeArm)

    // Legs
    const leftUpLeg = createBone('LeftUpLeg', new THREE.Vector3(-0.1, 0, 0), hips)
    const leftLeg = createBone('LeftLeg', new THREE.Vector3(0, -0.45, 0), leftUpLeg)
    const leftFoot = createBone('LeftFoot', new THREE.Vector3(0, -0.45, 0), leftLeg)

    const rightUpLeg = createBone('RightUpLeg', new THREE.Vector3(0.1, 0, 0), hips)
    const rightLeg = createBone('RightLeg', new THREE.Vector3(0, -0.45, 0), rightUpLeg)
    const rightFoot = createBone('RightFoot', new THREE.Vector3(0, -0.45, 0), rightLeg)

    // Create skeleton helper for visualization
    const skeleton = new THREE.Skeleton(Array.from(boneMap.values()))
    const skeletonHelper = new THREE.SkeletonHelper(root)
    ;(skeletonHelper.material as THREE.LineBasicMaterial).linewidth = 2
    scene.add(skeletonHelper)

    // Add bone visualizers
    const jointGeometry = new THREE.SphereGeometry(0.03)
    const jointMaterial = new THREE.MeshBasicMaterial({ color: 0x4ade80 })
    
    boneMap.forEach((bone, name) => {
      const joint = new THREE.Mesh(jointGeometry, jointMaterial)
      joint.userData.boneName = name
      bone.add(joint)
    })

    group.add(root)
    scene.add(group)

    setBones(boneMap)
    originalTransformsRef.current = originalTransforms
    setModelLoaded(true)
  }

  const handleBoneSelect = (boneName: string) => {
    const bone = bones.get(boneName)
    if (bone) {
      setSelectedBone(bone)
    }
  }

  const addKeyframe = useCallback(() => {
    if (!selectedBone || !currentAnimationId) return

    setAnimations(prev => {
      const newAnimations = new Map(prev)
      const anim = newAnimations.get(currentAnimationId)
      if (!anim) return prev

      const newKeyframes = new Map(anim.keyframes)
      if (!newKeyframes.has(currentFrame)) {
        newKeyframes.set(currentFrame, new Map())
      }

      newKeyframes.get(currentFrame)!.set(selectedBone.name, {
        position: { x: selectedBone.position.x, y: selectedBone.position.y, z: selectedBone.position.z },
        rotation: { x: selectedBone.quaternion.x, y: selectedBone.quaternion.y, z: selectedBone.quaternion.z, w: selectedBone.quaternion.w },
        scale: { x: selectedBone.scale.x, y: selectedBone.scale.y, z: selectedBone.scale.z }
      })

      newAnimations.set(currentAnimationId, { ...anim, keyframes: newKeyframes })
      return newAnimations
    })
  }, [selectedBone, currentAnimationId, currentFrame])

  const resetBone = useCallback(() => {
    if (!selectedBone) return
    const original = originalTransformsRef.current.get(selectedBone.name)
    if (original) {
      selectedBone.position.copy(original.position)
      selectedBone.quaternion.copy(original.quaternion)
      selectedBone.scale.copy(original.scale)
    }
  }, [selectedBone])

  const goToFrame = useCallback((frame: number) => {
    setCurrentFrame(Math.max(0, Math.min(frame, totalFrames)))
  }, [totalFrames])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return

      switch (e.key.toLowerCase()) {
        case 'v': setCurrentTool('select'); break
        case 'r': setCurrentTool('rotate'); break
        case 't': setCurrentTool('translate'); break
        case 's': 
          if (!e.ctrlKey && !e.metaKey) setCurrentTool('scale')
          break
        case ' ':
          e.preventDefault()
          setIsPlaying(p => !p)
          break
        case 'arrowleft': goToFrame(currentFrame - 1); break
        case 'arrowright': goToFrame(currentFrame + 1); break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentFrame, goToFrame])

  return (
    <div ref={containerRef} className="relative w-full h-[calc(100vh-52px)]">
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Transform Toolbar */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#151821] border border-[#252b3d] rounded-xl flex gap-1 p-1.5 z-10">
        {(['select', 'rotate', 'translate', 'scale'] as const).map(tool => (
          <button
            key={tool}
            onClick={() => setCurrentTool(tool)}
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-colors ${
              currentTool === tool ? 'bg-[#22c55e] text-[#09090b]' : 'text-[#a1a1aa] hover:bg-[#1c2130]'
            }`}
            title={tool.charAt(0).toUpperCase() + tool.slice(1)}
          >
            {tool === 'select' && '◇'}
            {tool === 'rotate' && '↻'}
            {tool === 'translate' && '✥'}
            {tool === 'scale' && '⤢'}
          </button>
        ))}
      </div>

      {/* Left Panel - Bones */}
      <div className="absolute top-0 left-0 bottom-[160px] w-[260px] bg-[#151821] border-r border-[#252b3d] overflow-hidden flex flex-col z-10">
        <div className="p-4 border-b border-[#252b3d]">
          <h3 className="text-xs tracking-widest text-[#71717a] font-semibold">SKELETON</h3>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <h4 className="text-[11px] text-[#71717a] mb-2 uppercase">Bone Hierarchy</h4>
          <div className="space-y-0.5 font-mono text-xs">
            {Array.from(bones.keys()).map(name => (
              <div
                key={name}
                onClick={() => handleBoneSelect(name)}
                className={`px-2 py-1.5 rounded cursor-pointer transition-colors ${
                  selectedBone?.name === name ? 'bg-[#252b3d] text-[#22c55e]' : 'hover:bg-[#1c2130] text-[#a1a1aa]'
                }`}
              >
                {name}
              </div>
            ))}
          </div>
        </div>
        <div className="p-3 border-t border-[#252b3d]">
          <h4 className="text-[11px] text-[#71717a] mb-2">📦 Model Info</h4>
          <div className="text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-[#71717a]">Bones:</span>
              <span className="text-[#f4f4f5]">{bones.size}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Properties */}
      <div className="absolute top-0 right-0 bottom-[160px] w-[260px] bg-[#151821] border-l border-[#252b3d] overflow-hidden flex flex-col z-10">
        <div className="p-4 border-b border-[#252b3d]">
          <h3 className="text-xs tracking-widest text-[#71717a] font-semibold">PROPERTIES</h3>
        </div>
        {selectedBone ? (
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div>
              <h4 className="text-[11px] text-[#71717a] mb-2 uppercase">Selected Bone</h4>
              <p className="font-mono text-sm text-[#22c55e]">{selectedBone.name}</p>
            </div>
            <div className="space-y-2">
              <button
                onClick={addKeyframe}
                className="w-full py-2.5 bg-[#22c55e] text-[#09090b] rounded-lg font-semibold text-sm hover:bg-[#4ade80] transition-colors"
              >
                🔑 Add Keyframe
              </button>
              <button
                onClick={resetBone}
                className="w-full py-2.5 bg-[#27272a] text-[#a1a1aa] border border-[#3f3f46] rounded-lg text-sm hover:bg-[#3f3f46] transition-colors"
              >
                ↺ Reset Bone
              </button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-[#71717a] text-sm">
            Select a bone to edit
          </div>
        )}
      </div>

      {/* Bottom Panel - Timeline */}
      <div className="absolute bottom-0 left-0 right-0 h-[160px] bg-[#151821] border-t border-[#252b3d] z-10">
        <div className="flex items-center justify-between px-4 py-2 bg-[#0f1117] border-b border-[#252b3d]">
          <div className="flex items-center gap-2">
            <button
              onClick={() => goToFrame(currentFrame - 1)}
              className="w-8 h-8 bg-[#151821] border border-[#252b3d] rounded-md text-[#a1a1aa] hover:bg-[#1c2130]"
            >
              ⏮
            </button>
            <button
              onClick={() => setIsPlaying(p => !p)}
              className={`w-8 h-8 border border-[#252b3d] rounded-md ${isPlaying ? 'bg-[#22c55e] text-[#09090b]' : 'bg-[#151821] text-[#a1a1aa] hover:bg-[#1c2130]'}`}
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button
              onClick={() => goToFrame(currentFrame + 1)}
              className="w-8 h-8 bg-[#151821] border border-[#252b3d] rounded-md text-[#a1a1aa] hover:bg-[#1c2130]"
            >
              ⏭
            </button>
            <div className="flex items-center gap-1 font-mono text-sm text-[#a1a1aa]">
              <input
                type="number"
                value={currentFrame}
                onChange={(e) => goToFrame(parseInt(e.target.value) || 0)}
                className="w-12 bg-[#0f1117] border border-[#252b3d] rounded px-2 py-1 text-center text-[#f4f4f5]"
              />
              <span>/</span>
              <input
                type="number"
                value={totalFrames}
                onChange={(e) => setTotalFrames(parseInt(e.target.value) || 30)}
                className="w-12 bg-[#0f1117] border border-[#252b3d] rounded px-2 py-1 text-center text-[#f4f4f5]"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#a1a1aa]">
            <span>FPS:</span>
            <select
              value={fps}
              onChange={(e) => setFps(parseInt(e.target.value))}
              className="bg-[#0f1117] border border-[#252b3d] rounded px-2 py-1 text-[#f4f4f5]"
            >
              <option value={12}>12</option>
              <option value={24}>24</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </div>
        </div>
        <div className="relative h-[calc(100%-44px)]">
          {/* Timeline ruler */}
          <div className="h-6 bg-[#0f1117] border-b border-[#252b3d] relative">
            {Array.from({ length: Math.ceil(totalFrames / 5) + 1 }).map((_, i) => (
              <span
                key={i}
                className="absolute text-[10px] text-[#71717a] font-mono"
                style={{ left: `${(i * 5 / totalFrames) * 100}%` }}
              >
                {i * 5}
              </span>
            ))}
          </div>
          {/* Timeline track */}
          <div
            className="h-[calc(100%-24px)] relative cursor-pointer"
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              const x = e.clientX - rect.left
              const frame = Math.round((x / rect.width) * totalFrames)
              goToFrame(frame)
            }}
            style={{
              background: 'repeating-linear-gradient(90deg, #252b3d 0px, #252b3d 1px, transparent 1px, transparent 20px)'
            }}
          >
            {/* Keyframe markers */}
            {currentAnimationId && animations.get(currentAnimationId)?.keyframes && 
              Array.from(animations.get(currentAnimationId)!.keyframes.keys()).map(frame => (
                <div
                  key={frame}
                  className="absolute top-1/2 w-3 h-3 bg-[#22c55e] border-2 border-[#151821] rounded-sm rotate-45 -translate-y-1/2 -translate-x-1/2 cursor-pointer hover:scale-125 transition-transform"
                  style={{ left: `${(frame / totalFrames) * 100}%` }}
                  onClick={(e) => { e.stopPropagation(); goToFrame(frame) }}
                />
              ))
            }
            {/* Playhead */}
            <div
              className="absolute top-0 bottom-0 w-0.5 bg-[#22c55e] pointer-events-none"
              style={{ left: `${(currentFrame / totalFrames) * 100}%` }}
            >
              <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-[#22c55e]" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


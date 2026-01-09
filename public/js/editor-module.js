// GLB Animation Editor - Module Wrapper with Cloud Save Support
// This wrapper extends the core editor with cloud persistence

import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { OrbitControls } from 'https://unpkg.com/three@0.159.0/examples/jsm/controls/OrbitControls.js';
import { TransformControls } from 'https://unpkg.com/three@0.159.0/examples/jsm/controls/TransformControls.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.159.0/examples/jsm/loaders/GLTFLoader.js';
import { GLTFExporter } from 'https://unpkg.com/three@0.159.0/examples/jsm/exporters/GLTFExporter.js';

class GLBAnimationEditor {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.transformControls = null;
        this.clock = new THREE.Clock();
        
        // Model and skeleton
        this.model = null;
        this.skeleton = null;
        this.bones = new Map();
        this.boneHelpers = [];
        this.selectedBone = null;
        this.loadedFilename = '';
        
        // Original GLTF data for export
        this.originalGLTF = null;
        
        // Original bone transforms (for reset)
        this.originalBoneTransforms = new Map();
        
        // Multiple animations support
        this.animations = new Map();
        this.currentAnimationId = null;
        this.animationCounter = 0;
        
        // Current animation data
        this.currentFrame = 0;
        this.isPlaying = false;
        
        // Clipboard
        this.clipboard = null;
        
        // History for undo/redo
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
        
        // Saved animations
        this.savedAnimations = [];
        this.selectedAnimationToLoad = null;
        
        // Current transform tool
        this.currentTool = 'rotate';
        
        // Grid visibility
        this.showGrid = true;
        this.gridHelper = null;
        
        // Bone view mode
        this.showBoneView = false;
        this.skeletonHelper = null;
        this.boneVisualizerGroup = null;
        this.boneLinesGroup = null;
        
        // Pending import
        this.pendingGLBImport = null;
        
        // Cloud save enabled
        this.cloudSaveEnabled = true;
        
        this.init();
    }
    
    get currentAnimation() {
        return this.animations.get(this.currentAnimationId);
    }
    
    get keyframes() {
        return this.currentAnimation?.keyframes || new Map();
    }
    
    get totalFrames() {
        return this.currentAnimation?.totalFrames || 30;
    }
    
    get fps() {
        return this.currentAnimation?.fps || 24;
    }
    
    get speed() {
        return this.currentAnimation?.speed || 1.0;
    }
    
    get loop() {
        return this.currentAnimation?.loop !== false;
    }
    
    get animationName() {
        return this.currentAnimation?.name || 'Untitled';
    }
    
    init() {
        console.log('Frim Editor initializing with cloud save support...');
        this.setupEditor();
    }
    
    setupEditor() {
        // Initialize 3D scene
        this.initScene();
        this.initUI();
        this.setupEventListeners();
        this.animate();
        
        // Show editor screen directly (skip welcome for cloud version)
        document.getElementById('welcome-screen')?.classList.remove('active');
        document.getElementById('editor-screen')?.classList.add('active');
    }
    
    initScene() {
        const canvas = document.getElementById('editor-canvas');
        if (!canvas) return;
        
        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0f1117);
        
        // Camera
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(3, 2, 5);
        
        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: true,
            alpha: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        
        // Orbit Controls
        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 1, 0);
        
        // Transform Controls
        this.transformControls = new TransformControls(this.camera, canvas);
        this.transformControls.setMode('rotate');
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
        });
        this.transformControls.addEventListener('objectChange', () => {
            this.onBoneTransformChanged();
        });
        this.scene.add(this.transformControls);
        
        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);
        
        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 10, 7);
        directionalLight.castShadow = true;
        directionalLight.shadow.mapSize.width = 2048;
        directionalLight.shadow.mapSize.height = 2048;
        this.scene.add(directionalLight);
        
        const backLight = new THREE.DirectionalLight(0x4ade80, 0.3);
        backLight.position.set(-5, 5, -5);
        this.scene.add(backLight);
        
        // Grid
        this.gridHelper = new THREE.GridHelper(20, 20, 0x22c55e, 0x252b3d);
        this.scene.add(this.gridHelper);
        
        // Ground plane
        const groundGeometry = new THREE.PlaneGeometry(20, 20);
        const groundMaterial = new THREE.ShadowMaterial({ opacity: 0.3 });
        const ground = new THREE.Mesh(groundGeometry, groundMaterial);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        // Handle resize
        window.addEventListener('resize', () => this.onWindowResize());
    }
    
    initUI() {
        // Build editor UI dynamically
        this.buildToolbarUI();
        this.buildPanelsUI();
        this.buildTimelineUI();
    }
    
    buildToolbarUI() {
        const editorScreen = document.getElementById('editor-screen');
        if (!editorScreen) return;
        
        // Transform toolbar
        const transformToolbar = document.createElement('div');
        transformToolbar.className = 'transform-toolbar';
        transformToolbar.style.cssText = `
            position: fixed;
            top: 120px;
            left: 50%;
            transform: translateX(-50%);
            background: #151821;
            border: 1px solid #252b3d;
            border-radius: 10px;
            display: flex;
            gap: 4px;
            padding: 6px;
            z-index: 100;
        `;
        transformToolbar.innerHTML = `
            <button class="transform-btn" id="tool-select" title="Select (V)">◇</button>
            <button class="transform-btn active" id="tool-rotate" title="Rotate (R)">↻</button>
            <button class="transform-btn" id="tool-translate" title="Translate (T)">✥</button>
            <button class="transform-btn" id="tool-scale" title="Scale (S)">⤢</button>
        `;
        editorScreen.appendChild(transformToolbar);
    }
    
    buildPanelsUI() {
        const editorScreen = document.getElementById('editor-screen');
        if (!editorScreen) return;
        
        // Left Panel - Bone Hierarchy
        const leftPanel = document.createElement('div');
        leftPanel.className = 'panel-left';
        leftPanel.style.cssText = `
            position: fixed;
            top: 52px;
            left: 0;
            bottom: 160px;
            width: 280px;
            background: #151821;
            border-right: 1px solid #252b3d;
            z-index: 90;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;
        leftPanel.innerHTML = `
            <div class="panel-header" style="padding: 16px; border-bottom: 1px solid #252b3d;">
                <h3 style="font-size: 12px; letter-spacing: 2px; color: #71717a;">SKELETON</h3>
            </div>
            <div class="panel-section" style="padding: 12px; flex: 1; overflow-y: auto;">
                <h4 style="font-size: 11px; color: #71717a; margin-bottom: 10px;">Bone Hierarchy</h4>
                <div id="bone-tree" style="font-family: monospace; font-size: 12px;"></div>
            </div>
            <div class="panel-section" style="padding: 12px; border-top: 1px solid #252b3d;">
                <h4 style="font-size: 11px; color: #71717a; margin-bottom: 10px;">📦 Model Info</h4>
                <div id="model-info">
                    <div style="display: flex; justify-content: space-between; padding: 6px 0;">
                        <span style="color: #71717a;">File:</span>
                        <span id="model-filename">-</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 6px 0;">
                        <span style="color: #71717a;">Bones:</span>
                        <span id="model-bone-count">-</span>
                    </div>
                </div>
            </div>
        `;
        editorScreen.appendChild(leftPanel);
        
        // Right Panel - Properties
        const rightPanel = document.createElement('div');
        rightPanel.className = 'panel-right';
        rightPanel.style.cssText = `
            position: fixed;
            top: 52px;
            right: 0;
            bottom: 160px;
            width: 280px;
            background: #151821;
            border-left: 1px solid #252b3d;
            z-index: 90;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        `;
        rightPanel.innerHTML = `
            <div class="panel-header" style="padding: 16px; border-bottom: 1px solid #252b3d;">
                <h3 style="font-size: 12px; letter-spacing: 2px; color: #71717a;">PROPERTIES</h3>
            </div>
            <div id="properties-empty" style="padding: 40px 20px; text-align: center; color: #71717a;">
                <p>Select a bone to edit</p>
            </div>
            <div id="properties-content" class="hidden" style="flex: 1; overflow-y: auto; padding: 16px;">
                <div style="margin-bottom: 20px;">
                    <h4 style="font-size: 11px; color: #71717a; margin-bottom: 12px;">Selected Bone</h4>
                    <div style="display: flex; gap: 12px;">
                        <label style="width: 70px; font-size: 12px; color: #a1a1aa;">Name</label>
                        <span id="bone-name" style="font-family: monospace;">-</span>
                    </div>
                </div>
                <div style="margin-bottom: 20px;">
                    <h4 style="font-size: 11px; color: #71717a; margin-bottom: 12px;">Rotation</h4>
                    <div id="rotation-controls"></div>
                </div>
                <div style="margin-bottom: 20px;">
                    <h4 style="font-size: 11px; color: #71717a; margin-bottom: 12px;">Actions</h4>
                    <button id="btn-add-keyframe" style="width: 100%; padding: 10px; background: #22c55e; color: #09090b; border: none; border-radius: 6px; font-weight: 600; cursor: pointer; margin-bottom: 8px;">
                        🔑 Add Keyframe
                    </button>
                    <button id="btn-reset-bone" style="width: 100%; padding: 10px; background: #27272a; color: #a1a1aa; border: 1px solid #3f3f46; border-radius: 6px; cursor: pointer;">
                        ↺ Reset Bone
                    </button>
                </div>
            </div>
        `;
        editorScreen.appendChild(rightPanel);
    }
    
    buildTimelineUI() {
        const editorScreen = document.getElementById('editor-screen');
        if (!editorScreen) return;
        
        // Bottom Panel - Timeline
        const bottomPanel = document.createElement('div');
        bottomPanel.className = 'panel-bottom';
        bottomPanel.style.cssText = `
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            height: 160px;
            background: #151821;
            border-top: 1px solid #252b3d;
            z-index: 100;
        `;
        bottomPanel.innerHTML = `
            <div style="height: 100%; display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; justify-content: space-between; padding: 8px 16px; border-bottom: 1px solid #252b3d; background: #0f1117;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <button id="btn-prev-frame" style="width: 34px; height: 34px; background: #151821; border: 1px solid #252b3d; border-radius: 6px; color: #a1a1aa; cursor: pointer;">⏮</button>
                        <button id="btn-play-timeline" style="width: 34px; height: 34px; background: #151821; border: 1px solid #252b3d; border-radius: 6px; color: #a1a1aa; cursor: pointer;">▶</button>
                        <button id="btn-next-frame" style="width: 34px; height: 34px; background: #151821; border: 1px solid #252b3d; border-radius: 6px; color: #a1a1aa; cursor: pointer;">⏭</button>
                        <span style="font-family: monospace; color: #a1a1aa;">
                            <input type="number" id="current-frame" value="0" min="0" style="width: 50px; background: #0f1117; border: 1px solid #252b3d; border-radius: 4px; padding: 6px; color: #f4f4f5; text-align: center;">
                            <span>/</span>
                            <input type="number" id="total-frames" value="30" min="1" max="300" style="width: 50px; background: #0f1117; border: 1px solid #252b3d; border-radius: 4px; padding: 6px; color: #f4f4f5; text-align: center;">
                        </span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 12px; font-size: 12px; color: #a1a1aa;">
                        <label>FPS:</label>
                        <select id="animation-fps" style="background: #0f1117; border: 1px solid #252b3d; border-radius: 4px; padding: 5px 8px; color: #f4f4f5;">
                            <option value="12">12</option>
                            <option value="24" selected>24</option>
                            <option value="30">30</option>
                            <option value="60">60</option>
                        </select>
                        <label>Loop:</label>
                        <input type="checkbox" id="animation-loop" checked style="accent-color: #22c55e;">
                    </div>
                </div>
                <div style="flex: 1; position: relative; overflow-x: auto;">
                    <div id="timeline-ruler" style="height: 24px; background: #0f1117; border-bottom: 1px solid #252b3d;"></div>
                    <div id="timeline-tracks" style="position: relative; height: calc(100% - 24px); background: repeating-linear-gradient(90deg, #252b3d 0px, #252b3d 1px, transparent 1px, transparent 20px);"></div>
                    <div id="timeline-playhead" style="position: absolute; top: 0; bottom: 0; width: 2px; background: #22c55e; pointer-events: none; z-index: 20; left: 0;"></div>
                </div>
            </div>
        `;
        editorScreen.appendChild(bottomPanel);
    }
    
    setupEventListeners() {
        // Transform tools
        document.getElementById('tool-select')?.addEventListener('click', () => this.setTool('select'));
        document.getElementById('tool-rotate')?.addEventListener('click', () => this.setTool('rotate'));
        document.getElementById('tool-translate')?.addEventListener('click', () => this.setTool('translate'));
        document.getElementById('tool-scale')?.addEventListener('click', () => this.setTool('scale'));
        
        // Timeline controls
        document.getElementById('btn-play-timeline')?.addEventListener('click', () => this.togglePlay());
        document.getElementById('btn-prev-frame')?.addEventListener('click', () => this.prevFrame());
        document.getElementById('btn-next-frame')?.addEventListener('click', () => this.nextFrame());
        document.getElementById('current-frame')?.addEventListener('change', (e) => {
            this.goToFrame(parseInt(e.target.value));
        });
        document.getElementById('total-frames')?.addEventListener('change', (e) => {
            if (this.currentAnimation) {
                this.currentAnimation.totalFrames = parseInt(e.target.value);
                this.updateTimeline();
            }
        });
        
        // Properties
        document.getElementById('btn-add-keyframe')?.addEventListener('click', () => this.addKeyframe());
        document.getElementById('btn-reset-bone')?.addEventListener('click', () => this.resetSelectedBone());
        
        // Keyboard shortcuts
        window.addEventListener('keydown', (e) => this.handleKeyboard(e));
        
        // Canvas click for bone selection
        const canvas = document.getElementById('editor-canvas');
        canvas?.addEventListener('click', (e) => this.handleCanvasClick(e));
        
        // Timeline click
        document.getElementById('timeline-tracks')?.addEventListener('click', (e) => this.handleTimelineClick(e));
    }
    
    setTool(tool) {
        this.currentTool = tool;
        
        document.querySelectorAll('.transform-btn').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`tool-${tool}`)?.classList.add('active');
        
        if (tool === 'select') {
            this.transformControls.detach();
        } else if (this.selectedBone) {
            this.transformControls.setMode(tool);
            this.transformControls.attach(this.selectedBone);
        }
    }
    
    handleKeyboard(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        switch (e.key.toLowerCase()) {
            case 'v':
                this.setTool('select');
                break;
            case 'r':
                this.setTool('rotate');
                break;
            case 't':
                this.setTool('translate');
                break;
            case 's':
                if (!e.ctrlKey && !e.metaKey) {
                    this.setTool('scale');
                }
                break;
            case ' ':
                e.preventDefault();
                this.togglePlay();
                break;
            case 'arrowleft':
                this.prevFrame();
                break;
            case 'arrowright':
                this.nextFrame();
                break;
        }
    }
    
    handleCanvasClick(e) {
        // Raycasting for bone selection
        if (!this.model || !this.bones.size) return;
        
        const rect = e.target.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        
        // Check bone helpers
        const intersects = raycaster.intersectObjects(this.boneHelpers, true);
        if (intersects.length > 0) {
            const boneName = intersects[0].object.userData.boneName;
            if (boneName) {
                this.selectBone(boneName);
            }
        }
    }
    
    handleTimelineClick(e) {
        const timeline = document.getElementById('timeline-tracks');
        if (!timeline) return;
        
        const rect = timeline.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const frame = Math.round((x / rect.width) * this.totalFrames);
        this.goToFrame(Math.max(0, Math.min(frame, this.totalFrames)));
    }
    
    selectBone(boneName) {
        const bone = this.bones.get(boneName);
        if (!bone) return;
        
        this.selectedBone = bone;
        
        // Update UI
        document.getElementById('properties-empty')?.classList.add('hidden');
        document.getElementById('properties-content')?.classList.remove('hidden');
        document.getElementById('bone-name').textContent = boneName;
        
        // Attach transform controls
        if (this.currentTool !== 'select') {
            this.transformControls.attach(bone);
        }
        
        // Highlight in bone tree
        document.querySelectorAll('.bone-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.bone === boneName);
        });
    }
    
    onBoneTransformChanged() {
        // Update UI with new values
        if (!this.selectedBone) return;
        
        // Could add live rotation display here
    }
    
    addKeyframe() {
        if (!this.selectedBone || !this.currentAnimation) {
            this.showToast('Select a bone first', 'error');
            return;
        }
        
        const frame = this.currentFrame;
        const boneName = this.selectedBone.name;
        
        if (!this.keyframes.has(frame)) {
            this.keyframes.set(frame, new Map());
        }
        
        this.keyframes.get(frame).set(boneName, {
            position: {
                x: this.selectedBone.position.x,
                y: this.selectedBone.position.y,
                z: this.selectedBone.position.z
            },
            rotation: {
                x: this.selectedBone.quaternion.x,
                y: this.selectedBone.quaternion.y,
                z: this.selectedBone.quaternion.z,
                w: this.selectedBone.quaternion.w
            },
            scale: {
                x: this.selectedBone.scale.x,
                y: this.selectedBone.scale.y,
                z: this.selectedBone.scale.z
            }
        });
        
        this.updateTimeline();
        this.showToast(`Keyframe added at frame ${frame}`, 'success');
    }
    
    resetSelectedBone() {
        if (!this.selectedBone) return;
        
        const original = this.originalBoneTransforms.get(this.selectedBone.name);
        if (original) {
            this.selectedBone.position.copy(original.position);
            this.selectedBone.quaternion.copy(original.quaternion);
            this.selectedBone.scale.copy(original.scale);
        }
    }
    
    togglePlay() {
        this.isPlaying = !this.isPlaying;
        const btn = document.getElementById('btn-play-timeline');
        if (btn) {
            btn.textContent = this.isPlaying ? '⏸' : '▶';
            btn.classList.toggle('playing', this.isPlaying);
        }
    }
    
    prevFrame() {
        this.goToFrame(Math.max(0, this.currentFrame - 1));
    }
    
    nextFrame() {
        this.goToFrame(Math.min(this.totalFrames, this.currentFrame + 1));
    }
    
    goToFrame(frame) {
        this.currentFrame = frame;
        document.getElementById('current-frame').value = frame;
        
        // Apply interpolated pose
        this.applyPoseAtFrame(frame);
        
        // Update playhead
        this.updatePlayhead();
    }
    
    applyPoseAtFrame(frame) {
        if (!this.keyframes.size) return;
        
        // Find surrounding keyframes
        const frames = Array.from(this.keyframes.keys()).sort((a, b) => a - b);
        if (frames.length === 0) return;
        
        const prevFrame = frames.filter(f => f <= frame).pop() ?? frames[0];
        const nextFrame = frames.filter(f => f > frame)[0] ?? frames[frames.length - 1];
        
        const prevKeyframes = this.keyframes.get(prevFrame);
        const nextKeyframes = this.keyframes.get(nextFrame);
        
        if (!prevKeyframes) return;
        
        // Calculate interpolation factor
        const t = prevFrame === nextFrame ? 0 : (frame - prevFrame) / (nextFrame - prevFrame);
        
        // Apply to each bone
        prevKeyframes.forEach((data, boneName) => {
            const bone = this.bones.get(boneName);
            if (!bone) return;
            
            const nextData = nextKeyframes?.get(boneName) || data;
            
            // Interpolate position
            bone.position.set(
                THREE.MathUtils.lerp(data.position.x, nextData.position.x, t),
                THREE.MathUtils.lerp(data.position.y, nextData.position.y, t),
                THREE.MathUtils.lerp(data.position.z, nextData.position.z, t)
            );
            
            // Interpolate rotation (quaternion slerp)
            const q1 = new THREE.Quaternion(data.rotation.x, data.rotation.y, data.rotation.z, data.rotation.w);
            const q2 = new THREE.Quaternion(nextData.rotation.x, nextData.rotation.y, nextData.rotation.z, nextData.rotation.w);
            bone.quaternion.slerpQuaternions(q1, q2, t);
            
            // Interpolate scale
            bone.scale.set(
                THREE.MathUtils.lerp(data.scale.x, nextData.scale.x, t),
                THREE.MathUtils.lerp(data.scale.y, nextData.scale.y, t),
                THREE.MathUtils.lerp(data.scale.z, nextData.scale.z, t)
            );
        });
    }
    
    updatePlayhead() {
        const playhead = document.getElementById('timeline-playhead');
        const tracks = document.getElementById('timeline-tracks');
        if (!playhead || !tracks) return;
        
        const percent = (this.currentFrame / this.totalFrames) * 100;
        playhead.style.left = `${percent}%`;
    }
    
    updateTimeline() {
        const tracks = document.getElementById('timeline-tracks');
        const ruler = document.getElementById('timeline-ruler');
        if (!tracks || !ruler) return;
        
        // Clear existing
        tracks.innerHTML = '';
        ruler.innerHTML = '';
        
        // Draw ruler marks
        for (let i = 0; i <= this.totalFrames; i += 5) {
            const mark = document.createElement('div');
            mark.style.cssText = `
                position: absolute;
                left: ${(i / this.totalFrames) * 100}%;
                top: 0;
                height: 100%;
                font-size: 10px;
                color: #71717a;
                font-family: monospace;
            `;
            mark.textContent = i.toString();
            ruler.appendChild(mark);
        }
        
        // Draw keyframe markers
        this.keyframes.forEach((boneKeyframes, frame) => {
            const marker = document.createElement('div');
            marker.className = 'keyframe-marker';
            marker.style.cssText = `
                position: absolute;
                left: ${(frame / this.totalFrames) * 100}%;
                top: 50%;
                width: 12px;
                height: 12px;
                background: #22c55e;
                border: 2px solid #151821;
                border-radius: 2px;
                transform: translate(-50%, -50%) rotate(45deg);
                cursor: pointer;
                z-index: 10;
            `;
            marker.addEventListener('click', (e) => {
                e.stopPropagation();
                this.goToFrame(frame);
            });
            tracks.appendChild(marker);
        });
        
        this.updatePlayhead();
    }
    
    onWindowResize() {
        if (!this.camera || !this.renderer) return;
        
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        const delta = this.clock.getDelta();
        
        // Playback
        if (this.isPlaying) {
            const frameDuration = 1 / this.fps;
            this.playbackAccumulator = (this.playbackAccumulator || 0) + delta * this.speed;
            
            if (this.playbackAccumulator >= frameDuration) {
                this.playbackAccumulator = 0;
                let nextFrame = this.currentFrame + 1;
                
                if (nextFrame > this.totalFrames) {
                    if (this.loop) {
                        nextFrame = 0;
                    } else {
                        this.isPlaying = false;
                        nextFrame = this.totalFrames;
                    }
                }
                
                this.goToFrame(nextFrame);
            }
        }
        
        this.controls?.update();
        this.renderer?.render(this.scene, this.camera);
    }
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.style.cssText = `
            background: #151821;
            border: 1px solid #252b3d;
            border-left: 4px solid ${type === 'success' ? '#22c55e' : type === 'error' ? '#ef4444' : '#eab308'};
            border-radius: 10px;
            padding: 14px 20px;
            min-width: 300px;
            display: flex;
            align-items: center;
            gap: 12px;
            animation: toast-in 0.3s ease;
        `;
        toast.innerHTML = `
            <span style="font-size: 18px;">${icons[type]}</span>
            <span style="font-size: 13px;">${message}</span>
        `;
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.style.animation = 'toast-out 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
    
    // === Cloud Save API ===
    
    // Load project data from cloud
    loadProjectData(project) {
        if (!project) return;
        
        console.log('Loading project data:', project.name);
        
        // Load model if available
        if (project.modelData) {
            this.loadModelFromBase64(project.modelData, project.modelName);
        }
        
        // Load animations
        if (project.animations && Array.isArray(project.animations)) {
            this.animations.clear();
            project.animations.forEach((anim, index) => {
                const id = `anim_${index}`;
                this.animations.set(id, {
                    name: anim.name || 'Animation ' + (index + 1),
                    fps: anim.fps || 24,
                    totalFrames: anim.totalFrames || 30,
                    speed: anim.speed || 1,
                    loop: anim.loop !== false,
                    keyframes: new Map(Object.entries(anim.keyframes || {}).map(([k, v]) => [
                        parseInt(k),
                        new Map(Object.entries(v))
                    ]))
                });
            });
            
            // Set first animation as current
            if (this.animations.size > 0) {
                this.currentAnimationId = this.animations.keys().next().value;
                this.updateTimeline();
            }
        }
        
        // Create default animation if none
        if (this.animations.size === 0) {
            this.createNewAnimation('Animation 1');
        }
    }
    
    loadModelFromBase64(base64Data, filename) {
        try {
            const binary = atob(base64Data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
                bytes[i] = binary.charCodeAt(i);
            }
            
            const loader = new GLTFLoader();
            loader.parse(bytes.buffer, '', (gltf) => {
                this.loadModel(gltf, filename);
            }, (error) => {
                console.error('Failed to parse model:', error);
            });
        } catch (e) {
            console.error('Failed to load model from base64:', e);
        }
    }
    
    loadModel(gltf, filename) {
        // Remove old model
        if (this.model) {
            this.scene.remove(this.model);
        }
        
        this.originalGLTF = gltf;
        this.loadedFilename = filename || 'model.glb';
        this.model = gltf.scene;
        
        // Setup model
        this.model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
            if (child.isBone) {
                this.bones.set(child.name, child);
                
                // Store original transform
                this.originalBoneTransforms.set(child.name, {
                    position: child.position.clone(),
                    quaternion: child.quaternion.clone(),
                    scale: child.scale.clone()
                });
            }
        });
        
        // Add to scene
        this.scene.add(this.model);
        
        // Update UI
        document.getElementById('model-filename').textContent = filename;
        document.getElementById('model-bone-count').textContent = this.bones.size.toString();
        
        // Build bone tree UI
        this.buildBoneTree();
        
        // Create bone helpers
        this.createBoneHelpers();
        
        this.showToast('Model loaded: ' + filename, 'success');
    }
    
    buildBoneTree() {
        const container = document.getElementById('bone-tree');
        if (!container) return;
        
        container.innerHTML = '';
        
        this.bones.forEach((bone, name) => {
            const item = document.createElement('div');
            item.className = 'bone-item';
            item.dataset.bone = name;
            item.style.cssText = `
                padding: 6px 8px;
                cursor: pointer;
                border-radius: 4px;
                transition: background 0.15s;
            `;
            item.textContent = name;
            item.addEventListener('click', () => this.selectBone(name));
            item.addEventListener('mouseenter', () => item.style.background = '#1c2130');
            item.addEventListener('mouseleave', () => {
                if (!item.classList.contains('selected')) {
                    item.style.background = 'transparent';
                }
            });
            container.appendChild(item);
        });
    }
    
    createBoneHelpers() {
        // Clean up old helpers
        this.boneHelpers.forEach(h => this.scene.remove(h));
        this.boneHelpers = [];
        
        // Create sphere helpers for each bone
        const geometry = new THREE.SphereGeometry(0.03);
        const material = new THREE.MeshBasicMaterial({ color: 0x4ade80 });
        
        this.bones.forEach((bone, name) => {
            const helper = new THREE.Mesh(geometry, material);
            helper.userData.boneName = name;
            bone.add(helper);
            this.boneHelpers.push(helper);
        });
    }
    
    createNewAnimation(name) {
        const id = `anim_${this.animationCounter++}`;
        this.animations.set(id, {
            name: name || 'Animation ' + this.animationCounter,
            fps: 24,
            totalFrames: 30,
            speed: 1,
            loop: true,
            keyframes: new Map()
        });
        this.currentAnimationId = id;
        this.updateTimeline();
        return id;
    }
    
    // Get project data for saving to cloud
    getProjectData() {
        // Serialize animations
        const animationsArray = [];
        this.animations.forEach((anim, id) => {
            const keyframesObj = {};
            anim.keyframes.forEach((boneData, frame) => {
                keyframesObj[frame] = Object.fromEntries(boneData);
            });
            
            animationsArray.push({
                name: anim.name,
                fps: anim.fps,
                totalFrames: anim.totalFrames,
                speed: anim.speed,
                loop: anim.loop,
                keyframes: keyframesObj
            });
        });
        
        // Generate thumbnail from canvas
        let thumbnail = null;
        try {
            const canvas = document.getElementById('editor-canvas');
            if (canvas) {
                thumbnail = canvas.toDataURL('image/jpeg', 0.5);
            }
        } catch (e) {
            console.warn('Could not generate thumbnail');
        }
        
        return {
            animations: animationsArray,
            modelName: this.loadedFilename,
            thumbnail
        };
    }
}

// Add toast animations
const style = document.createElement('style');
style.textContent = `
    @keyframes toast-in {
        from { opacity: 0; transform: translateX(100px); }
        to { opacity: 1; transform: translateX(0); }
    }
    @keyframes toast-out {
        to { opacity: 0; transform: translateX(100px); }
    }
    .hidden { display: none !important; }
    .bone-item.selected {
        background: #252b3d !important;
        color: #22c55e;
    }
`;
document.head.appendChild(style);

// Initialize and expose globally
window.GLBAnimationEditor = GLBAnimationEditor;
window.editor = new GLBAnimationEditor();


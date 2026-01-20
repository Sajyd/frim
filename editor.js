// GLB Animation Editor - Standalone
// Skeletal animation creation tool with GLB import/export support

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';

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
        this.animations = new Map(); // Map<animId, {name, fps, totalFrames, speed, loop, keyframes}>
        this.currentAnimationId = null;
        this.animationCounter = 0;
        
        // Current animation data (references active animation)
        this.currentFrame = 0;
        this.isPlaying = false;
        
        // Clipboard for copy/paste
        this.clipboard = null;
        
        // History for undo/redo
        this.history = [];
        this.historyIndex = -1;
        this.maxHistory = 50;
        
        // Saved animations (localStorage)
        this.savedAnimations = [];
        this.selectedAnimationToLoad = null;
        
        // Current transform tool
        this.currentTool = 'rotate';
        
        // Grid visibility
        this.showGrid = true;
        this.gridHelper = null;
        
        // Bone view mode - enabled by default for clickable bones
        this.showBoneView = true;
        this.skeletonHelper = null;
        this.boneVisualizerGroup = null;
        this.boneLinesGroup = null;
        
        // Pending GLB import
        this.pendingGLBImport = null;
        
        this.init();
    }
    
    // Get current animation object
    get currentAnimation() {
        return this.animations.get(this.currentAnimationId);
    }
    
    // Convenience getters for current animation properties
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
        console.log('GLB Animation Editor initializing...');
        // Wait a bit for auth to potentially show welcome screen
        setTimeout(() => this.setupWelcomeScreen(), 100);
    }
    
    // ==================== WELCOME SCREEN ====================
    
    setupWelcomeScreen() {
        console.log('Setting up welcome screen...');
        
        const dropZone = document.getElementById('drop-zone');
        const fileInput = document.getElementById('file-input');
        const btnLoadSample = document.getElementById('btn-load-sample');
        
        console.log('Drop zone found:', !!dropZone);
        console.log('File input found:', !!fileInput);
        console.log('Sample button found:', !!btnLoadSample);
        
        if (!dropZone || !fileInput) {
            console.error('Welcome screen elements not found, retrying in 500ms...');
            setTimeout(() => this.setupWelcomeScreen(), 500);
            return;
        }
        
        // Prevent duplicate setup
        if (dropZone.dataset.initialized === 'true') {
            console.log('Welcome screen already initialized');
            return;
        }
        dropZone.dataset.initialized = 'true';
        
        // Store reference for file input
        this.fileInput = fileInput;
        
        // Click to browse - handle click on drop zone
        dropZone.addEventListener('click', (e) => {
            // Don't trigger if clicking on file input itself
            if (e.target === fileInput) return;
            console.log('Drop zone clicked, opening file dialog');
            fileInput.click();
        });
        
        // File input change
        fileInput.addEventListener('change', (e) => {
            console.log('File selected:', e.target.files);
            if (e.target.files && e.target.files.length > 0) {
                this.loadGLBFromFile(e.target.files[0]);
            }
        });
        
        // Drag and drop
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.add('drag-over');
        });
        
        dropZone.addEventListener('dragleave', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
        });
        
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('drag-over');
            
            console.log('File dropped:', e.dataTransfer.files);
            const file = e.dataTransfer.files[0];
            if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
                this.loadGLBFromFile(file);
            } else {
                this.showToast('Please drop a .glb or .gltf file', 'error');
            }
        });
        
        // Sample model button
        if (btnLoadSample) {
            btnLoadSample.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log('Sample model button clicked');
                this.loadSampleModel();
            });
        }
        
        console.log('Welcome screen setup complete');
    }
    
    loadGLBFromFile(file) {
        this.showToast('Loading model...', 'info');
        this.loadedFilename = file.name;
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                await this.loadGLBFromArrayBuffer(arrayBuffer, file.name);
            } catch (err) {
                console.error('Error loading GLB:', err);
                this.showToast('Failed to load model: ' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }
    
    async loadGLBFromArrayBuffer(arrayBuffer, filename) {
        const loader = new GLTFLoader();
        
        return new Promise((resolve, reject) => {
            loader.parse(arrayBuffer, '', (gltf) => {
                this.originalGLTF = gltf;
                this.loadedFilename = filename;
                this.enterEditor(gltf);
                resolve(gltf);
            }, (error) => {
                reject(error);
            });
        });
    }
    
    loadSampleModel() {
        console.log('loadSampleModel called');
        this.showToast('Loading sample model...', 'info');
        
        try {
            // Create a simple humanoid armature as sample
            this.createSampleArmature();
        } catch (err) {
            console.error('Error creating sample armature:', err);
            this.showToast('Failed to create sample model: ' + err.message, 'error');
        }
    }
    
    createSampleArmature() {
        // Create a visible humanoid figure with bones
        const group = new THREE.Group();
        
        // Materials
        const bodyMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x6366f1, 
            roughness: 0.4,
            metalness: 0.1
        });
        const accentMaterial = new THREE.MeshStandardMaterial({ 
            color: 0x00e5a0, 
            roughness: 0.3,
            metalness: 0.2,
            emissive: 0x00e5a0,
            emissiveIntensity: 0.2
        });
        
        // Helper to create a capsule-like body part
        const createBodyPart = (radiusTop, radiusBottom, height, material) => {
            const geo = new THREE.CapsuleGeometry(radiusTop, height, 4, 8);
            const mesh = new THREE.Mesh(geo, material);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            return mesh;
        };
        
        // Create bones
        const createBone = (name, posY) => {
            const bone = new THREE.Bone();
            bone.name = name;
            bone.position.y = posY;
            return bone;
        };
        
        // Root bone
        const hips = new THREE.Bone();
        hips.name = 'Hips';
        hips.position.y = 1;
        
        // Spine bones
        const spine = createBone('Spine', 0.2);
        const spine1 = createBone('Spine1', 0.15);
        const spine2 = createBone('Spine2', 0.15);
        const neck = createBone('Neck', 0.12);
        const head = createBone('Head', 0.15);
        
        // Left arm bones
        const leftShoulder = new THREE.Bone();
        leftShoulder.name = 'LeftShoulder';
        leftShoulder.position.set(-0.18, 0.08, 0);
        const leftArm = createBone('LeftArm', -0.25);
        const leftForeArm = createBone('LeftForeArm', -0.22);
        const leftHand = createBone('LeftHand', -0.08);
        
        // Right arm bones
        const rightShoulder = new THREE.Bone();
        rightShoulder.name = 'RightShoulder';
        rightShoulder.position.set(0.18, 0.08, 0);
        const rightArm = createBone('RightArm', -0.25);
        const rightForeArm = createBone('RightForeArm', -0.22);
        const rightHand = createBone('RightHand', -0.08);
        
        // Left leg bones
        const leftUpLeg = new THREE.Bone();
        leftUpLeg.name = 'LeftUpLeg';
        leftUpLeg.position.set(-0.1, -0.05, 0);
        const leftLeg = createBone('LeftLeg', -0.4);
        const leftFoot = createBone('LeftFoot', -0.38);
        
        // Right leg bones
        const rightUpLeg = new THREE.Bone();
        rightUpLeg.name = 'RightUpLeg';
        rightUpLeg.position.set(0.1, -0.05, 0);
        const rightLeg = createBone('RightLeg', -0.4);
        const rightFoot = createBone('RightFoot', -0.38);
        
        // Build bone hierarchy
        hips.add(spine);
        spine.add(spine1);
        spine1.add(spine2);
        spine2.add(neck);
        neck.add(head);
        
        spine2.add(leftShoulder);
        leftShoulder.add(leftArm);
        leftArm.add(leftForeArm);
        leftForeArm.add(leftHand);
        
        spine2.add(rightShoulder);
        rightShoulder.add(rightArm);
        rightArm.add(rightForeArm);
        rightForeArm.add(rightHand);
        
        hips.add(leftUpLeg);
        leftUpLeg.add(leftLeg);
        leftLeg.add(leftFoot);
        
        hips.add(rightUpLeg);
        rightUpLeg.add(rightLeg);
        rightLeg.add(rightFoot);
        
        // Create visual meshes for each body part (not skinned, just for display)
        const bodyGroup = new THREE.Group();
        
        // Pelvis/Hips
        const pelvis = new THREE.Mesh(
            new THREE.BoxGeometry(0.25, 0.12, 0.15),
            bodyMaterial
        );
        pelvis.position.y = 1;
        bodyGroup.add(pelvis);
        
        // Torso (spine area)
        const torso = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 0.45, 0.18),
            bodyMaterial
        );
        torso.position.set(0, 1.32, 0);
        bodyGroup.add(torso);
        
        // Head
        const headMesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.12, 16, 16),
            accentMaterial
        );
        headMesh.position.set(0, 1.72, 0);
        bodyGroup.add(headMesh);
        
        // Neck
        const neckMesh = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.05, 0.1, 8),
            bodyMaterial
        );
        neckMesh.position.set(0, 1.58, 0);
        bodyGroup.add(neckMesh);
        
        // Left arm parts
        const leftUpperArm = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.04, 0.2, 4, 8),
            bodyMaterial
        );
        leftUpperArm.position.set(-0.28, 1.38, 0);
        leftUpperArm.rotation.z = 0.3;
        bodyGroup.add(leftUpperArm);
        
        const leftLowerArm = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.035, 0.18, 4, 8),
            bodyMaterial
        );
        leftLowerArm.position.set(-0.42, 1.15, 0);
        leftLowerArm.rotation.z = 0.2;
        bodyGroup.add(leftLowerArm);
        
        const leftHandMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.08, 0.03),
            accentMaterial
        );
        leftHandMesh.position.set(-0.48, 0.95, 0);
        bodyGroup.add(leftHandMesh);
        
        // Right arm parts
        const rightUpperArm = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.04, 0.2, 4, 8),
            bodyMaterial
        );
        rightUpperArm.position.set(0.28, 1.38, 0);
        rightUpperArm.rotation.z = -0.3;
        bodyGroup.add(rightUpperArm);
        
        const rightLowerArm = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.035, 0.18, 4, 8),
            bodyMaterial
        );
        rightLowerArm.position.set(0.42, 1.15, 0);
        rightLowerArm.rotation.z = -0.2;
        bodyGroup.add(rightLowerArm);
        
        const rightHandMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.05, 0.08, 0.03),
            accentMaterial
        );
        rightHandMesh.position.set(0.48, 0.95, 0);
        bodyGroup.add(rightHandMesh);
        
        // Left leg parts
        const leftThigh = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.055, 0.32, 4, 8),
            bodyMaterial
        );
        leftThigh.position.set(-0.1, 0.72, 0);
        bodyGroup.add(leftThigh);
        
        const leftShin = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.045, 0.3, 4, 8),
            bodyMaterial
        );
        leftShin.position.set(-0.1, 0.32, 0);
        bodyGroup.add(leftShin);
        
        const leftFootMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.05, 0.15),
            accentMaterial
        );
        leftFootMesh.position.set(-0.1, 0.025, 0.03);
        bodyGroup.add(leftFootMesh);
        
        // Right leg parts
        const rightThigh = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.055, 0.32, 4, 8),
            bodyMaterial
        );
        rightThigh.position.set(0.1, 0.72, 0);
        bodyGroup.add(rightThigh);
        
        const rightShin = new THREE.Mesh(
            new THREE.CapsuleGeometry(0.045, 0.3, 4, 8),
            bodyMaterial
        );
        rightShin.position.set(0.1, 0.32, 0);
        bodyGroup.add(rightShin);
        
        const rightFootMesh = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.05, 0.15),
            accentMaterial
        );
        rightFootMesh.position.set(0.1, 0.025, 0.03);
        bodyGroup.add(rightFootMesh);
        
        // Enable shadows on all meshes
        bodyGroup.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        group.add(bodyGroup);
        
        // Create skeleton with all bones
        const allBones = [
            hips, spine, spine1, spine2, neck, head,
            leftShoulder, leftArm, leftForeArm, leftHand,
            rightShoulder, rightArm, rightForeArm, rightHand,
            leftUpLeg, leftLeg, leftFoot,
            rightUpLeg, rightLeg, rightFoot
        ];
        
        // Add root bone to group for skeleton visibility
        group.add(hips);
        
        this.loadedFilename = 'sample_armature.glb';
        this.originalGLTF = { scene: group, animations: [] };
        this.enterEditor({ scene: group, animations: [] });
    }
    
    enterEditor(gltf) {
        console.log('enterEditor called with gltf:', gltf);
        
        // Hide welcome screen, show editor
        const welcomeScreen = document.getElementById('welcome-screen');
        const editorScreen = document.getElementById('editor-screen');
        
        console.log('Welcome screen element:', welcomeScreen);
        console.log('Editor screen element:', editorScreen);
        
        if (welcomeScreen) {
            welcomeScreen.classList.remove('active');
        }
        if (editorScreen) {
            editorScreen.classList.add('active');
        }
        
        // Also hide landing page if visible
        const landingPage = document.getElementById('landing-page');
        if (landingPage) {
            landingPage.classList.remove('active');
        }
        
        this.initEditor(gltf);
    }
    
    // ==================== EDITOR INITIALIZATION ====================
    
    async initEditor(gltf) {
        console.log('Initializing Editor with model...');
        
        // Need to wait a frame for CSS to apply after showing editor screen
        await new Promise(resolve => requestAnimationFrame(resolve));
        
        this.setupRenderer();
        this.setupScene();
        this.setupCamera();
        this.setupControls();
        this.setupLighting();
        this.setupGrid();
        
        await this.loadModel(gltf);
        
        // Import animations from the GLB
        this.importAnimationsFromGLTF(gltf);
        
        this.setupEventListeners();
        this.setupToolbar();
        this.setupTimeline();
        this.setupAnimationsPanel();
        this.loadSavedAnimations();
        
        // Force a resize to ensure correct canvas dimensions
        this.onResize();
        
        this.animate();
        
        console.log('Editor initialized. Scene children:', this.scene.children.length);
        console.log('Camera position:', this.camera.position);
        
        // Initialize pose capture if available
        if (window.PoseCapture && !this.poseCapture) {
            this.poseCapture = new window.PoseCapture(this);
        }
        
        this.showToast('Model loaded! Select bones to animate.', 'success');
    }
    
    // ==================== ANIMATION MANAGEMENT ====================
    
    importAnimationsFromGLTF(gltf) {
        const clips = gltf.animations || [];
        
        if (clips.length > 0) {
            // Import all animations from the GLB
            clips.forEach((clip, index) => {
                const animData = this.convertClipToAnimationData(clip);
                const id = `imported_${this.animationCounter++}`;
                this.animations.set(id, animData);
            });
            
            // Select first animation
            const firstId = Array.from(this.animations.keys())[0];
            this.switchToAnimation(firstId);
            
            this.showToast(`Imported ${clips.length} animation(s) from GLB`, 'success');
        } else {
            // Create a default empty animation
            this.createNewAnimation('New Animation');
        }
        
        this.updateAnimationsList();
    }
    
    convertClipToAnimationData(clip) {
        const duration = clip.duration;
        const fps = 60;
        const totalFrames = Math.ceil(duration * fps);
        const keyframes = new Map();
        
        // Sample animation at regular intervals
        const sampleRate = 2;
        for (let frame = 0; frame <= totalFrames; frame += sampleRate) {
            const time = frame / fps;
            
            clip.tracks.forEach(track => {
                const parts = track.name.split('.');
                const boneName = parts[0];
                const property = parts[parts.length - 1];
                
                if (!this.bones.has(boneName)) return;
                
                if (!keyframes.has(frame)) {
                    keyframes.set(frame, new Map());
                }
                
                if (!keyframes.get(frame).has(boneName)) {
                    const original = this.originalBoneTransforms.get(boneName);
                    keyframes.get(frame).set(boneName, {
                        position: original?.position.clone() || new THREE.Vector3(),
                        rotation: new THREE.Quaternion(),
                        scale: original?.scale.clone() || new THREE.Vector3(1, 1, 1)
                    });
                }
                
                const boneData = keyframes.get(frame).get(boneName);
                
                if (property === 'quaternion') {
                    const quat = this.sampleQuaternionTrack(track, time);
                    boneData.rotation = quat;
                } else if (property === 'position') {
                    const pos = this.sampleVectorTrack(track, time);
                    boneData.position = pos;
                } else if (property === 'scale') {
                    const scale = this.sampleVectorTrack(track, time);
                    boneData.scale = scale;
                }
            });
        }
        
        return {
            name: clip.name || 'Imported Animation',
            fps: fps,
            totalFrames: totalFrames,
            speed: 1.0,
            loop: true,
            keyframes: keyframes
        };
    }
    
    createNewAnimation(name = null) {
        const id = `anim_${this.animationCounter++}`;
        const animName = name || `Animation ${this.animations.size + 1}`;
        
        this.animations.set(id, {
            name: animName,
            fps: 24,
            totalFrames: 30,
            speed: 1.0,
            loop: true,
            keyframes: new Map()
        });
        
        this.switchToAnimation(id);
        this.updateAnimationsList();
        
        return id;
    }
    
    switchToAnimation(animId) {
        if (!this.animations.has(animId)) return;
        
        // Stop playback
        this.isPlaying = false;
        document.getElementById('btn-play-timeline')?.classList.remove('playing');
        document.getElementById('btn-play')?.classList.remove('active');
        
        this.currentAnimationId = animId;
        this.currentFrame = 0;
        
        // Reset bones to original pose first
        if (this.bones.size > 0) {
            this.resetAllBonesToOriginal();
            
            // Apply first frame of new animation
            this.applyPoseAtFrame(0);
        }
        
        // Update UI (with null checks)
        this.updateAnimationsList();
        
        if (document.getElementById('timeline-ruler')) {
            this.updateTimeline();
        }
        
        this.updateAnimationSettings();
        
        if (this.selectedBone) {
            this.updateTransformInputs();
        }
        
        const nameInput = document.getElementById('animation-name');
        if (nameInput) {
            nameInput.value = this.animationName;
        }
    }
    
    resetAllBonesToOriginal() {
        this.originalBoneTransforms.forEach((transforms, boneName) => {
            const bone = this.bones.get(boneName);
            if (bone) {
                bone.position.copy(transforms.position);
                bone.rotation.copy(transforms.rotation);
                bone.scale.copy(transforms.scale);
            }
        });
    }
    
    deleteAnimation(animId) {
        if (this.animations.size <= 1) {
            this.showToast('Cannot delete the only animation', 'warning');
            return;
        }
        
        this.animations.delete(animId);
        
        // Switch to another animation if we deleted the current one
        if (this.currentAnimationId === animId) {
            const firstId = Array.from(this.animations.keys())[0];
            this.switchToAnimation(firstId);
        }
        
        this.updateAnimationsList();
    }
    
    duplicateAnimation(animId) {
        const source = this.animations.get(animId);
        if (!source) return;
        
        const newId = `anim_${this.animationCounter++}`;
        
        // Deep clone keyframes
        const newKeyframes = new Map();
        source.keyframes.forEach((frameData, frame) => {
            const newFrameData = new Map();
            frameData.forEach((boneData, boneName) => {
                newFrameData.set(boneName, {
                    position: boneData.position.clone(),
                    rotation: boneData.rotation.clone(),
                    scale: boneData.scale.clone()
                });
            });
            newKeyframes.set(frame, newFrameData);
        });
        
        this.animations.set(newId, {
            name: source.name + ' (Copy)',
            fps: source.fps,
            totalFrames: source.totalFrames,
            speed: source.speed,
            loop: source.loop,
            keyframes: newKeyframes
        });
        
        this.updateAnimationsList();
        this.showToast('Animation duplicated', 'success');
    }
    
    renameAnimation(animId, newName) {
        const anim = this.animations.get(animId);
        if (anim) {
            anim.name = newName;
            this.updateAnimationsList();
            if (animId === this.currentAnimationId) {
                document.getElementById('animation-name').value = newName;
            }
        }
    }
    
    updateAnimationSettings() {
        const anim = this.currentAnimation;
        if (!anim) return;
        
        const fpsEl = document.getElementById('animation-fps');
        const totalFramesEl = document.getElementById('total-frames');
        const totalFramesSettingEl = document.getElementById('total-frames-setting');
        const loopEl = document.getElementById('animation-loop');
        const speedEl = document.getElementById('animation-speed');
        const speedDisplayEl = document.getElementById('speed-display');
        
        if (fpsEl) fpsEl.value = anim.fps;
        if (totalFramesEl) totalFramesEl.value = anim.totalFrames;
        if (totalFramesSettingEl) totalFramesSettingEl.value = anim.totalFrames;
        if (loopEl) loopEl.checked = anim.loop;
        if (speedEl) speedEl.value = anim.speed;
        if (speedDisplayEl) speedDisplayEl.textContent = `${anim.speed.toFixed(1)}x`;
    }
    
    setupAnimationsPanel() {
        // Add new animation button
        document.getElementById('btn-add-animation')?.addEventListener('click', () => {
            this.createNewAnimation();
            this.showToast('New animation created', 'success');
        });
        
        this.updateAnimationsList();
    }
    
    updateAnimationsList() {
        const list = document.getElementById('animations-list');
        if (!list) return;
        
        list.innerHTML = '';
        
        if (this.animations.size === 0) {
            list.innerHTML = '<div style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 11px;">No animations</div>';
            return;
        }
        
        this.animations.forEach((anim, id) => {
            const item = document.createElement('div');
            item.className = 'animation-item' + (id === this.currentAnimationId ? ' active' : '');
            item.dataset.animId = id;
            
            const keyframeCount = anim.keyframes?.size || 0;
            
            item.innerHTML = `
                <span class="animation-item-icon">🎬</span>
                <div class="animation-item-info">
                    <div class="animation-item-name">${anim.name || 'Untitled'}</div>
                    <div class="animation-item-meta">${anim.totalFrames || 30}f @ ${anim.fps || 24}fps · ${keyframeCount} keys</div>
                </div>
                <div class="animation-item-actions">
                    <button class="animation-item-btn duplicate" title="Duplicate">📋</button>
                    <button class="animation-item-btn delete" title="Delete">🗑</button>
                </div>
            `;
            
            // Click to switch
            item.addEventListener('click', (e) => {
                if (!e.target.closest('.animation-item-btn')) {
                    this.switchToAnimation(id);
                }
            });
            
            // Duplicate button
            item.querySelector('.duplicate')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.duplicateAnimation(id);
            });
            
            // Delete button
            item.querySelector('.delete')?.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteAnimation(id);
            });
            
            list.appendChild(item);
        });
    }
    
    setupRenderer() {
        const canvas = document.getElementById('editor-canvas');
        console.log('Setting up renderer, canvas:', canvas);
        
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        
        console.log('Renderer initialized with size:', window.innerWidth, 'x', window.innerHeight);
    }
    
    setupScene() {
        this.scene = new THREE.Scene();
        // Dark blue background so we can tell scene is rendering
        this.scene.background = new THREE.Color(0x1a1f2e);
        console.log('Scene created');
    }
    
    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        this.camera.position.set(4, 3, 6);
        this.camera.lookAt(0, 0.5, 0);
        console.log('Camera created at position:', this.camera.position);
    }
    
    setupControls() {
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.05;
        this.controls.target.set(0, 1, 0);
        this.controls.minDistance = 1;
        this.controls.maxDistance = 20;
        
        // Transform controls for bone manipulation
        this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
        this.transformControls.setMode('rotate');
        this.transformControls.setSpace('local');
        this.scene.add(this.transformControls);
        
        // Disable orbit when using transform controls
        this.transformControls.addEventListener('dragging-changed', (event) => {
            this.controls.enabled = !event.value;
        });
        
        // Update UI when transform changes
        this.transformControls.addEventListener('change', () => {
            if (this.selectedBone) {
                this.updateTransformInputs();
            }
        });
        
        this.transformControls.addEventListener('objectChange', () => {
            this.saveToHistory();
        });
    }
    
    setupLighting() {
        // Strong ambient light
        const ambient = new THREE.AmbientLight(0xffffff, 1.0);
        this.scene.add(ambient);
        
        // Main directional light
        const mainLight = new THREE.DirectionalLight(0xffffff, 1.5);
        mainLight.position.set(5, 10, 5);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        this.scene.add(mainLight);
        
        // Fill light
        const fillLight = new THREE.DirectionalLight(0x8888ff, 0.5);
        fillLight.position.set(-5, 5, -5);
        this.scene.add(fillLight);
        
        // Rim light
        const rimLight = new THREE.DirectionalLight(0x00e5a0, 0.4);
        rimLight.position.set(0, 5, -10);
        this.scene.add(rimLight);
        
        // Hemisphere light for better ambient
        const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
        hemiLight.position.set(0, 20, 0);
        this.scene.add(hemiLight);
    }
    
    setupGrid() {
        // More visible grid
        this.gridHelper = new THREE.GridHelper(20, 20, 0x00e5a0, 0x404050);
        this.scene.add(this.gridHelper);
        
        // Add ground plane with visible color
        const groundGeo = new THREE.PlaneGeometry(20, 20);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x1a1d24,
            roughness: 0.9,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.position.y = -0.01; // Slightly below grid
        ground.receiveShadow = true;
        this.scene.add(ground);
        
        // Add axis helper for orientation
        const axesHelper = new THREE.AxesHelper(2);
        this.scene.add(axesHelper);
    }
    
    async loadModel(gltf) {
        this.model = gltf.scene;
        this.model.position.set(0, 0, 0);
        
        console.log('Loading model...', this.model);
        
        // Count meshes in the model
        let meshCount = 0;
        this.model.traverse((child) => {
            if (child.isMesh) meshCount++;
        });
        console.log('Model has', meshCount, 'meshes');
        
        // Normalize scale
        const box = new THREE.Box3().setFromObject(this.model);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        console.log('Model size:', size, 'maxDim:', maxDim);
        
        if (maxDim > 0.01 && maxDim > 3) {
            const scale = 2 / maxDim;
            this.model.scale.setScalar(scale);
            console.log('Scaled model to:', scale);
        } else if (maxDim < 0.01) {
            // Model is too small or has no geometry, don't scale
            console.log('Model has minimal geometry, using default scale');
        }
        
        // Center model
        box.setFromObject(this.model);
        const center = box.getCenter(new THREE.Vector3());
        if (box.min.y !== Infinity) {
            this.model.position.sub(new THREE.Vector3(center.x, box.min.y, center.z));
        }
        
        // Setup shadows
        this.model.traverse((child) => {
            if (child.isMesh) {
                child.castShadow = true;
                child.receiveShadow = true;
            }
        });
        
        this.scene.add(this.model);
        console.log('Model added to scene');
        
        // Find skeleton and bones
        this.findSkeleton();
        this.createBoneHelpers();
        this.buildBoneTree();
        this.updateModelInfo();
        this.buildQuickSelect();
        
        console.log('Model loaded! Found bones:', Array.from(this.bones.keys()));
        
        // If no meshes but has bones, turn on bone view by default
        if (meshCount === 0 && this.bones.size > 0) {
            this.showBoneView = true;
            if (this.boneLinesGroup) {
                this.boneLinesGroup.visible = true;
            }
            document.getElementById('btn-bone-view')?.classList.add('active');
            console.log('No meshes found, enabling bone view');
        }
    }
    
    findSkeleton() {
        this.bones.clear();
        this.originalBoneTransforms.clear();
        
        this.model.traverse((child) => {
            if (child.isSkinnedMesh && child.skeleton) {
                this.skeleton = child.skeleton;
                child.skeleton.bones.forEach((bone) => {
                    this.bones.set(bone.name, bone);
                    this.originalBoneTransforms.set(bone.name, {
                        position: bone.position.clone(),
                        rotation: bone.rotation.clone(),
                        scale: bone.scale.clone()
                    });
                });
            }
            if (child.isBone) {
                this.bones.set(child.name, child);
                if (!this.originalBoneTransforms.has(child.name)) {
                    this.originalBoneTransforms.set(child.name, {
                        position: child.position.clone(),
                        rotation: child.rotation.clone(),
                        scale: child.scale.clone()
                    });
                }
            }
        });
        
        console.log(`Found ${this.bones.size} bones`);
    }
    
    createBoneHelpers() {
        // Remove existing helpers
        this.boneHelpers.forEach(helper => {
            if (helper.parent) helper.parent.remove(helper);
        });
        this.boneHelpers = [];
        
        if (this.boneVisualizerGroup) {
            this.scene.remove(this.boneVisualizerGroup);
        }
        this.boneVisualizerGroup = new THREE.Group();
        this.scene.add(this.boneVisualizerGroup);
        
        // Create visual indicators for bones
        this.bones.forEach((bone, name) => {
            const boneLength = this.getBoneLength(bone);
            const helper = this.createBoneShape(boneLength, name);
            helper.userData.boneName = name;
            helper.userData.isBoneHelper = true;
            
            bone.add(helper);
            this.boneHelpers.push(helper);
        });
        
        // Create skeleton helper for bone view
        this.createSkeletonHelper();
    }
    
    getBoneLength(bone) {
        let length = 0.12; // Larger default for better visibility
        
        if (bone.children && bone.children.length > 0) {
            for (const child of bone.children) {
                if (child.isBone) {
                    const dist = child.position.length();
                    if (dist > 0.01) {
                        length = Math.min(dist * 0.6, 0.25);
                        break;
                    }
                }
            }
        }
        
        return Math.max(length, 0.08);
    }
    
    createBoneShape(length, boneName) {
        const group = new THREE.Group();
        group.userData.boneName = boneName;
        
        // Main joint - Large octahedron (diamond shape)
        const jointSize = length * 0.8;
        const jointGeo = new THREE.OctahedronGeometry(jointSize, 0);
        const jointMat = new THREE.MeshStandardMaterial({
            color: 0x22c55e, // Green theme
            roughness: 0.3,
            metalness: 0.6,
            transparent: true,
            opacity: 0.85
        });
        const joint = new THREE.Mesh(jointGeo, jointMat);
        joint.userData.boneName = boneName;
        joint.userData.isBoneHelper = true;
        joint.renderOrder = 100;
        group.add(joint);
        
        // Glow outline
        const glowGeo = new THREE.OctahedronGeometry(jointSize * 1.15, 0);
        const glowMat = new THREE.MeshBasicMaterial({
            color: 0x4ade80,
            transparent: true,
            opacity: 0.3,
            side: THREE.BackSide
        });
        const glow = new THREE.Mesh(glowGeo, glowMat);
        glow.userData.boneName = boneName;
        glow.renderOrder = 99;
        group.add(glow);
        
        // Wireframe for selection visibility
        const wireGeo = new THREE.OctahedronGeometry(jointSize * 1.02, 0);
        const wireMat = new THREE.MeshBasicMaterial({
            color: 0x86efac,
            wireframe: true,
            transparent: true,
            opacity: 0.6
        });
        const wireframe = new THREE.Mesh(wireGeo, wireMat);
        wireframe.userData.boneName = boneName;
        wireframe.renderOrder = 101;
        group.add(wireframe);
        
        // Inner core sphere for visual interest
        const coreGeo = new THREE.SphereGeometry(jointSize * 0.3, 8, 8);
        const coreMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.9
        });
        const core = new THREE.Mesh(coreGeo, coreMat);
        core.userData.boneName = boneName;
        core.renderOrder = 102;
        group.add(core);
        
        return group;
    }
    
    // Update bone helper appearance when selected/deselected
    updateBoneHelperAppearance(boneName, isSelected) {
        const helper = this.boneHelpers.find(h => h.userData.boneName === boneName);
        if (!helper) return;
        
        helper.traverse(child => {
            if (child.isMesh && child.material) {
                if (isSelected) {
                    // Highlight selected bone
                    if (child.material.color) {
                        child.userData.originalColor = child.material.color.getHex();
                        child.material.color.setHex(0xfbbf24); // Yellow/gold for selection
                    }
                    if (child.material.emissive) {
                        child.material.emissive.setHex(0xfbbf24);
                        child.material.emissiveIntensity = 0.5;
                    }
                    child.material.opacity = Math.min((child.material.opacity || 0.5) + 0.3, 1);
                } else {
                    // Restore original appearance
                    if (child.userData.originalColor !== undefined) {
                        child.material.color.setHex(child.userData.originalColor);
                    }
                    if (child.material.emissive) {
                        child.material.emissive.setHex(0x000000);
                        child.material.emissiveIntensity = 0;
                    }
                }
            }
        });
    }
    
    createSkeletonHelper() {
        if (this.skeletonHelper) {
            this.scene.remove(this.skeletonHelper);
            this.skeletonHelper = null;
        }
        
        if (this.boneLinesGroup) {
            this.scene.remove(this.boneLinesGroup);
        }
        this.boneLinesGroup = new THREE.Group();
        
        // Create bone lines connecting parent to children
        this.bones.forEach((bone) => {
            if (bone.parent && bone.parent.isBone) {
                const material = new THREE.LineBasicMaterial({
                    color: 0x00e5a0,
                    linewidth: 2,
                    depthTest: false
                });
                const geometry = new THREE.BufferGeometry();
                const positions = new Float32Array(6);
                geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                
                const line = new THREE.Line(geometry, material);
                line.renderOrder = 1001;
                line.userData.parentBone = bone.parent;
                line.userData.childBone = bone;
                this.boneLinesGroup.add(line);
            }
        });
        
        this.boneLinesGroup.visible = this.showBoneView;
        this.scene.add(this.boneLinesGroup);
        
        // Update button state to match showBoneView
        document.getElementById('btn-bone-view')?.classList.toggle('active', this.showBoneView);
    }
    
    updateBoneLines() {
        if (!this.boneLinesGroup) return;
        
        this.boneLinesGroup.children.forEach(line => {
            const parentBone = line.userData.parentBone;
            const childBone = line.userData.childBone;
            
            if (parentBone && childBone) {
                const parentPos = new THREE.Vector3();
                const childPos = new THREE.Vector3();
                
                parentBone.getWorldPosition(parentPos);
                childBone.getWorldPosition(childPos);
                
                const positions = line.geometry.attributes.position.array;
                positions[0] = parentPos.x;
                positions[1] = parentPos.y;
                positions[2] = parentPos.z;
                positions[3] = childPos.x;
                positions[4] = childPos.y;
                positions[5] = childPos.z;
                
                line.geometry.attributes.position.needsUpdate = true;
            }
        });
    }
    
    buildBoneTree() {
        const treeContainer = document.getElementById('bone-tree');
        if (!treeContainer) return;
        
        treeContainer.innerHTML = '';
        
        // Find root bones
        const rootBones = [];
        this.bones.forEach((bone, name) => {
            if (!bone.parent || !bone.parent.isBone) {
                rootBones.push(bone);
            }
        });
        
        const buildTree = (bone, depth = 0) => {
            const hasChildren = bone.children.some(c => c.isBone);
            
            const item = document.createElement('div');
            item.className = 'bone-item';
            item.style.setProperty('--depth', depth);
            item.dataset.boneName = bone.name;
            
            if (hasChildren) {
                const toggle = document.createElement('span');
                toggle.className = 'bone-toggle';
                toggle.textContent = '▶';
                toggle.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggle.classList.toggle('expanded');
                    const children = item.nextElementSibling;
                    if (children?.classList.contains('bone-children')) {
                        children.classList.toggle('expanded');
                    }
                });
                item.appendChild(toggle);
            } else {
                const spacer = document.createElement('span');
                spacer.style.width = '16px';
                spacer.style.display = 'inline-block';
                item.appendChild(spacer);
            }
            
            const name = document.createElement('span');
            name.textContent = bone.name;
            item.appendChild(name);
            
            item.addEventListener('click', () => {
                this.selectBone(bone.name);
            });
            
            treeContainer.appendChild(item);
            
            // Child bones
            const boneChildren = bone.children.filter(c => c.isBone);
            if (boneChildren.length > 0) {
                const childContainer = document.createElement('div');
                childContainer.className = 'bone-children';
                boneChildren.forEach(child => {
                    buildTree(child, depth + 1);
                });
                treeContainer.appendChild(childContainer);
            }
        };
        
        rootBones.forEach(bone => buildTree(bone));
    }
    
    buildQuickSelect() {
        const container = document.getElementById('quick-bones');
        if (!container) return;
        
        container.innerHTML = '';
        
        // Common bone names to look for
        const commonBones = [
            'Hips', 'Spine', 'Head', 'Neck',
            'LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm',
            'LeftHand', 'RightHand', 'LeftUpLeg', 'RightUpLeg',
            'LeftLeg', 'RightLeg', 'LeftFoot', 'RightFoot'
        ];
        
        commonBones.forEach(name => {
            const bone = this.findBoneByPattern(name);
            if (bone) {
                const btn = document.createElement('button');
                btn.className = 'quick-bone';
                btn.dataset.bone = bone.name;
                btn.textContent = name.replace('Left', 'L.').replace('Right', 'R.');
                btn.addEventListener('click', () => this.selectBone(bone.name));
                container.appendChild(btn);
            }
        });
    }
    
    findBoneByPattern(pattern) {
        const lowerPattern = pattern.toLowerCase();
        for (const [name, bone] of this.bones) {
            if (name.toLowerCase().includes(lowerPattern)) {
                return bone;
            }
        }
        return null;
    }
    
    updateModelInfo() {
        const filenameEl = document.getElementById('model-filename');
        const boneCountEl = document.getElementById('model-bone-count');
        
        if (filenameEl) filenameEl.textContent = this.loadedFilename || '-';
        if (boneCountEl) boneCountEl.textContent = this.bones.size;
    }
    
    selectBone(boneName) {
        const bone = this.bones.get(boneName);
        if (!bone) return;
        
        // Track previous selection for visual update
        const previousBone = this.selectedBone?.name;
        this.selectedBone = bone;
        
        // Update visual selection with enhanced appearance
        this.boneHelpers.forEach(helper => {
            const helperBoneName = helper.userData.boneName;
            const isSelected = helperBoneName === boneName;
            const wasSelected = helperBoneName === previousBone;
            
            // Reset previous selection
            if (wasSelected && !isSelected) {
                helper.traverse(child => {
                    if (child.material) {
                        // Restore original colors
                        if (child.geometry?.type === 'OctahedronGeometry') {
                            if (child.material.wireframe) {
                                child.material.color.setHex(0x86efac);
                            } else if (child.material.side === THREE.BackSide) {
                                child.material.color.setHex(0x4ade80);
                            } else {
                                child.material.color.setHex(0x22c55e);
                            }
                        } else if (child.geometry?.type === 'SphereGeometry') {
                            child.material.color.setHex(0xffffff);
                        }
                    }
                });
                helper.scale.setScalar(1);
            }
            
            // Highlight new selection
            if (isSelected) {
                helper.traverse(child => {
                    if (child.material) {
                        // Golden/yellow highlight for selected bone
                        if (child.geometry?.type === 'OctahedronGeometry') {
                            if (child.material.wireframe) {
                                child.material.color.setHex(0xfcd34d);
                            } else if (child.material.side === THREE.BackSide) {
                                child.material.color.setHex(0xfbbf24);
                            } else {
                                child.material.color.setHex(0xf59e0b);
                            }
                        } else if (child.geometry?.type === 'SphereGeometry') {
                            child.material.color.setHex(0xfef3c7);
                        }
                    }
                });
                helper.scale.setScalar(1.4);
            }
        });
        
        // Update bone tree selection
        document.querySelectorAll('.bone-item').forEach(item => {
            item.classList.toggle('selected', item.dataset.boneName === boneName);
        });
        
        // Quick select buttons
        document.querySelectorAll('.quick-bone').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.bone === boneName);
        });
        
        // Attach transform controls
        this.transformControls.attach(bone);
        
        // Update properties panel
        this.showBonePropertiesPanel();
    }
    
    showBonePropertiesPanel() {
        document.getElementById('properties-empty')?.classList.add('hidden');
        document.getElementById('properties-content')?.classList.remove('hidden');
        
        this.updateTransformInputs();
    }
    
    updateTransformInputs() {
        if (!this.selectedBone) return;
        
        document.getElementById('bone-name').textContent = this.selectedBone.name;
        
        // Position
        document.getElementById('pos-x').value = this.selectedBone.position.x.toFixed(3);
        document.getElementById('pos-y').value = this.selectedBone.position.y.toFixed(3);
        document.getElementById('pos-z').value = this.selectedBone.position.z.toFixed(3);
        
        // Rotation
        document.getElementById('rot-x').value = this.selectedBone.rotation.x.toFixed(3);
        document.getElementById('rot-y').value = this.selectedBone.rotation.y.toFixed(3);
        document.getElementById('rot-z').value = this.selectedBone.rotation.z.toFixed(3);
        
        document.getElementById('slider-x').value = this.selectedBone.rotation.x;
        document.getElementById('slider-y').value = this.selectedBone.rotation.y;
        document.getElementById('slider-z').value = this.selectedBone.rotation.z;
        
        // Scale
        document.getElementById('scale-x').value = this.selectedBone.scale.x.toFixed(3);
        document.getElementById('scale-y').value = this.selectedBone.scale.y.toFixed(3);
        document.getElementById('scale-z').value = this.selectedBone.scale.z.toFixed(3);
    }
    
    // ==================== EVENT LISTENERS ====================
    
    setupEventListeners() {
        // Window resize
        window.addEventListener('resize', () => this.onResize());
        
        // Keyboard
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        
        // Canvas click for bone selection
        this.renderer.domElement.addEventListener('click', (e) => this.onCanvasClick(e));
        
        // Close modals
        document.querySelectorAll('.modal-close, [data-close]').forEach(btn => {
            btn.addEventListener('click', () => {
                const modalId = btn.dataset.close || btn.closest('.modal-overlay')?.id;
                if (modalId) {
                    document.getElementById(modalId)?.classList.add('hidden');
                }
            });
        });
        
        // Property inputs
        this.setupPropertyInputs();
        
        // Context menu
        this.setupContextMenu();
    }
    
    setupPropertyInputs() {
        // Position inputs
        ['pos-x', 'pos-y', 'pos-z'].forEach((id, i) => {
            const input = document.getElementById(id);
            input?.addEventListener('change', () => {
                if (!this.selectedBone) return;
                const val = parseFloat(input.value) || 0;
                this.selectedBone.position.setComponent(i, val);
                this.saveToHistory();
            });
        });
        
        // Rotation inputs
        ['rot-x', 'rot-y', 'rot-z'].forEach((id, i) => {
            const input = document.getElementById(id);
            input?.addEventListener('change', () => {
                if (!this.selectedBone) return;
                const val = parseFloat(input.value) || 0;
                if (i === 0) this.selectedBone.rotation.x = val;
                if (i === 1) this.selectedBone.rotation.y = val;
                if (i === 2) this.selectedBone.rotation.z = val;
                this.updateTransformInputs();
                this.saveToHistory();
            });
        });
        
        // Rotation sliders
        ['slider-x', 'slider-y', 'slider-z'].forEach((id, i) => {
            const slider = document.getElementById(id);
            slider?.addEventListener('input', () => {
                if (!this.selectedBone) return;
                const val = parseFloat(slider.value);
                if (i === 0) this.selectedBone.rotation.x = val;
                if (i === 1) this.selectedBone.rotation.y = val;
                if (i === 2) this.selectedBone.rotation.z = val;
                this.updateTransformInputs();
            });
            slider?.addEventListener('change', () => this.saveToHistory());
        });
        
        // Scale inputs
        ['scale-x', 'scale-y', 'scale-z'].forEach((id, i) => {
            const input = document.getElementById(id);
            input?.addEventListener('change', () => {
                if (!this.selectedBone) return;
                const val = parseFloat(input.value) || 1;
                this.selectedBone.scale.setComponent(i, val);
                this.saveToHistory();
            });
        });
    }
    
    setupContextMenu() {
        const menu = document.getElementById('context-menu');
        if (!menu) return;
        
        // Hide on click outside
        document.addEventListener('click', () => menu.classList.add('hidden'));
        
        // Context menu items
        menu.querySelectorAll('.context-item').forEach(item => {
            item.addEventListener('click', () => {
                const action = item.dataset.action;
                switch (action) {
                    case 'add-keyframe': this.addKeyframe(); break;
                    case 'add-keyframe-reset': this.addKeyframeReset(); break;
                    case 'delete-keyframe': this.deleteKeyframe(); break;
                    case 'copy': this.copyPose(); break;
                    case 'paste': this.pastePose(); break;
                    case 'reset': this.resetBone(); break;
                }
            });
        });
    }
    
    setupToolbar() {
        // Load new model
        document.getElementById('btn-new')?.addEventListener('click', () => {
            document.getElementById('file-input').click();
        });
        
        document.getElementById('btn-load')?.addEventListener('click', () => this.showLoadModal());
        document.getElementById('btn-save')?.addEventListener('click', () => this.showSaveModal());
        document.getElementById('btn-export-json')?.addEventListener('click', () => this.showExportJSONModal());
        document.getElementById('btn-export-glb')?.addEventListener('click', () => this.showExportGLBModal());
        
        // Undo/Redo
        document.getElementById('btn-undo')?.addEventListener('click', () => this.undo());
        document.getElementById('btn-redo')?.addEventListener('click', () => this.redo());
        
        // Playback
        document.getElementById('btn-play')?.addEventListener('click', () => this.togglePlayback());
        document.getElementById('btn-stop')?.addEventListener('click', () => this.stopPlayback());
        
        // Grid toggle
        document.getElementById('btn-grid')?.addEventListener('click', () => {
            this.showGrid = !this.showGrid;
            this.gridHelper.visible = this.showGrid;
            document.getElementById('btn-grid')?.classList.toggle('active', this.showGrid);
        });
        
        // Transform tools
        ['select', 'rotate', 'translate', 'scale'].forEach(tool => {
            document.getElementById(`tool-${tool}`)?.addEventListener('click', () => {
                this.setTool(tool);
            });
        });
        
        // Bone view toggle
        document.getElementById('btn-bone-view')?.addEventListener('click', () => {
            this.toggleBoneView();
        });
        
        // Keyframe actions
        document.getElementById('btn-add-keyframe')?.addEventListener('click', () => this.addKeyframe());
        document.getElementById('btn-add-keyframe-reset')?.addEventListener('click', () => this.addKeyframeReset());
        document.getElementById('btn-copy-pose')?.addEventListener('click', () => this.copyPose());
        document.getElementById('btn-paste-pose')?.addEventListener('click', () => this.pastePose());
        document.getElementById('btn-mirror-pose')?.addEventListener('click', () => this.mirrorPose());
        document.getElementById('btn-reset-bone')?.addEventListener('click', () => this.resetBone());
        document.getElementById('btn-reset-pose')?.addEventListener('click', () => this.resetAllBones());
        
        // Save modal
        document.getElementById('btn-confirm-save')?.addEventListener('click', () => this.saveAnimation());
        
        // Load modal
        document.getElementById('btn-import-animation')?.addEventListener('click', () => {
            document.getElementById('import-animation').click();
        });
        document.getElementById('import-animation')?.addEventListener('change', (e) => {
            this.importAnimationFile(e.target.files[0]);
        });
        document.getElementById('btn-load-selected')?.addEventListener('click', () => this.loadSelectedAnimation());
        
        // GLB Import
        document.getElementById('btn-import-glb')?.addEventListener('click', () => {
            document.getElementById('import-glb-animation').click();
        });
        document.getElementById('import-glb-animation')?.addEventListener('change', (e) => {
            this.importGLBAnimations(e.target.files[0]);
            e.target.value = '';
        });
        document.getElementById('btn-import-glb-selected')?.addEventListener('click', () => this.importSelectedGLBAnimation());
        
        // Export modals
        document.getElementById('btn-confirm-export-json')?.addEventListener('click', () => this.exportJSON());
        document.getElementById('btn-confirm-export-glb')?.addEventListener('click', () => this.exportGLB());
        
        // Animation name
        document.getElementById('animation-name')?.addEventListener('change', (e) => {
            const newName = e.target.value || 'Untitled Animation';
            if (this.currentAnimation) {
                this.currentAnimation.name = newName;
                this.updateAnimationsList();
            }
        });
        
        // Save speed slider (for save modal preview)
        const saveSpeedSlider = document.getElementById('save-animation-speed');
        const saveSpeedDisplay = document.getElementById('save-speed-display');
        saveSpeedSlider?.addEventListener('input', () => {
            const val = parseFloat(saveSpeedSlider.value);
            if (this.currentAnimation) {
                this.currentAnimation.speed = val;
            }
            if (saveSpeedDisplay) saveSpeedDisplay.textContent = `${val.toFixed(1)}x`;
        });
    }
    
    setupTimeline() {
        // Frame controls
        document.getElementById('btn-prev-frame')?.addEventListener('click', () => this.prevFrame());
        document.getElementById('btn-next-frame')?.addEventListener('click', () => this.nextFrame());
        document.getElementById('btn-play-timeline')?.addEventListener('click', () => this.togglePlayback());
        
        // Current frame input
        document.getElementById('current-frame')?.addEventListener('change', (e) => {
            const frame = parseInt(e.target.value) || 0;
            this.goToFrame(Math.max(0, Math.min(frame, this.totalFrames)));
        });
        
        // Total frames input
        const totalFramesInput = document.getElementById('total-frames');
        const totalFramesSetting = document.getElementById('total-frames-setting');
        
        const updateTotalFrames = (e) => {
            const frames = Math.max(1, Math.min(parseInt(e.target.value) || 30, 600));
            if (this.currentAnimation) {
                this.currentAnimation.totalFrames = frames;
            }
            if (totalFramesInput) totalFramesInput.value = frames;
            if (totalFramesSetting) totalFramesSetting.value = frames;
            this.updateTimeline();
        };
        
        totalFramesInput?.addEventListener('change', updateTotalFrames);
        totalFramesSetting?.addEventListener('change', updateTotalFrames);
        
        // FPS
        document.getElementById('animation-fps')?.addEventListener('change', (e) => {
            if (this.currentAnimation) {
                this.currentAnimation.fps = parseInt(e.target.value) || 24;
            }
        });
        
        // Speed slider
        const speedSlider = document.getElementById('animation-speed');
        const speedDisplay = document.getElementById('speed-display');
        speedSlider?.addEventListener('input', () => {
            const speed = parseFloat(speedSlider.value);
            if (this.currentAnimation) {
                this.currentAnimation.speed = speed;
            }
            if (speedDisplay) speedDisplay.textContent = `${speed.toFixed(1)}x`;
        });
        
        // Loop checkbox
        document.getElementById('animation-loop')?.addEventListener('change', (e) => {
            if (this.currentAnimation) {
                this.currentAnimation.loop = e.target.checked;
            }
        });
        
        // Timeline click
        const tracks = document.getElementById('timeline-tracks');
        tracks?.addEventListener('click', (e) => {
            const rect = tracks.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const frame = Math.round(x / 20);
            this.goToFrame(Math.max(0, Math.min(frame, this.totalFrames)));
        });
        
        this.updateTimeline();
    }
    
    updateTimeline() {
        // Update ruler
        const ruler = document.getElementById('timeline-ruler');
        if (ruler) {
            ruler.innerHTML = '';
            for (let i = 0; i <= this.totalFrames; i++) {
                if (i % 5 === 0) {
                    const mark = document.createElement('div');
                    mark.className = 'timeline-ruler-mark' + (i % 10 === 0 ? ' major' : '');
                    mark.style.left = `${i * 20}px`;
                    mark.innerHTML = `<span>${i}</span>`;
                    ruler.appendChild(mark);
                }
            }
        }
        
        this.updateKeyframeMarkers();
        this.updatePlayhead();
    }
    
    updatePlayhead() {
        const playhead = document.getElementById('timeline-playhead');
        if (playhead) {
            playhead.style.left = `${this.currentFrame * 20}px`;
        }
        document.getElementById('current-frame').value = this.currentFrame;
    }
    
    updateKeyframeMarkers() {
        const tracks = document.getElementById('timeline-tracks');
        if (!tracks) return;
        
        // Remove existing markers
        tracks.querySelectorAll('.keyframe-marker').forEach(m => m.remove());
        
        // Add markers for each keyframe
        this.keyframes.forEach((frameData, frame) => {
            frameData.forEach((boneData, boneName) => {
                const marker = document.createElement('div');
                marker.className = 'keyframe-marker';
                marker.style.left = `${frame * 20}px`;
                marker.style.top = '50%';
                marker.title = `${boneName} @ frame ${frame}`;
                marker.dataset.frame = frame;
                marker.dataset.bone = boneName;
                
                marker.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.goToFrame(frame);
                    this.selectBone(boneName);
                });
                
                tracks.appendChild(marker);
            });
        });
    }
    
    goToFrame(frame) {
        this.currentFrame = frame;
        this.updatePlayhead();
        this.applyPoseAtFrame(frame);
    }
    
    prevFrame() {
        this.goToFrame(Math.max(0, this.currentFrame - 1));
    }
    
    nextFrame() {
        this.goToFrame(Math.min(this.totalFrames, this.currentFrame + 1));
    }
    
    togglePlayback() {
        this.isPlaying = !this.isPlaying;
        document.getElementById('btn-play-timeline')?.classList.toggle('playing', this.isPlaying);
        document.getElementById('btn-play')?.classList.toggle('active', this.isPlaying);
    }
    
    stopPlayback() {
        this.isPlaying = false;
        document.getElementById('btn-play-timeline')?.classList.remove('playing');
        document.getElementById('btn-play')?.classList.remove('active');
        this.goToFrame(0);
    }
    
    // ==================== KEYFRAME OPERATIONS ====================
    
    addKeyframe() {
        if (!this.selectedBone) {
            this.showToast('Select a bone first', 'warning');
            return;
        }
        
        if (!this.keyframes.has(this.currentFrame)) {
            this.keyframes.set(this.currentFrame, new Map());
        }
        
        this.keyframes.get(this.currentFrame).set(this.selectedBone.name, {
            position: this.selectedBone.position.clone(),
            rotation: new THREE.Quaternion().setFromEuler(this.selectedBone.rotation),
            scale: this.selectedBone.scale.clone()
        });
        
        this.updateKeyframeMarkers();
        this.showToast(`Keyframe added for ${this.selectedBone.name} at frame ${this.currentFrame}`, 'success');
    }
    
    addKeyframeReset() {
        if (!this.selectedBone) {
            this.showToast('Select a bone first', 'warning');
            return;
        }
        
        const original = this.originalBoneTransforms.get(this.selectedBone.name);
        if (!original) {
            this.showToast('No original transform found', 'error');
            return;
        }
        
        if (!this.keyframes.has(this.currentFrame)) {
            this.keyframes.set(this.currentFrame, new Map());
        }
        
        // Add keyframe with original bone transform values
        this.keyframes.get(this.currentFrame).set(this.selectedBone.name, {
            position: original.position.clone(),
            rotation: new THREE.Quaternion().setFromEuler(original.rotation),
            scale: original.scale.clone()
        });
        
        // Also reset the bone visually to match
        this.selectedBone.position.copy(original.position);
        this.selectedBone.rotation.copy(original.rotation);
        this.selectedBone.scale.copy(original.scale);
        
        this.updateTransformInputs();
        this.updateKeyframeMarkers();
        this.saveToHistory();
        this.showToast(`Reset keyframe added for ${this.selectedBone.name} at frame ${this.currentFrame}`, 'success');
    }
    
    deleteKeyframe() {
        if (!this.selectedBone) return;
        
        const frameData = this.keyframes.get(this.currentFrame);
        if (frameData?.has(this.selectedBone.name)) {
            frameData.delete(this.selectedBone.name);
            if (frameData.size === 0) {
                this.keyframes.delete(this.currentFrame);
            }
            this.updateKeyframeMarkers();
            this.showToast(`Keyframe deleted`, 'info');
        }
    }
    
    applyPoseAtFrame(frame) {
        if (this.keyframes.size === 0) return;
        
        const sortedFrames = Array.from(this.keyframes.keys()).sort((a, b) => a - b);
        
        this.bones.forEach((bone, boneName) => {
            let prevFrame = null;
            let nextFrame = null;
            
            for (const f of sortedFrames) {
                if (this.keyframes.get(f)?.has(boneName)) {
                    if (f <= frame) prevFrame = f;
                    if (f >= frame && nextFrame === null) nextFrame = f;
                }
            }
            
            if (prevFrame === null && nextFrame === null) return;
            
            if (prevFrame === null) prevFrame = nextFrame;
            if (nextFrame === null) nextFrame = prevFrame;
            
            const prevData = this.keyframes.get(prevFrame)?.get(boneName);
            const nextData = this.keyframes.get(nextFrame)?.get(boneName);
            
            if (!prevData || !nextData) return;
            
            let t = 0;
            if (prevFrame !== nextFrame) {
                t = (frame - prevFrame) / (nextFrame - prevFrame);
            }
            
            // Interpolate position
            bone.position.lerpVectors(prevData.position, nextData.position, t);
            
            // Interpolate rotation (slerp)
            const quat = new THREE.Quaternion();
            quat.slerpQuaternions(prevData.rotation, nextData.rotation, t);
            bone.rotation.setFromQuaternion(quat);
            
            // Interpolate scale
            bone.scale.lerpVectors(prevData.scale, nextData.scale, t);
        });
        
        if (this.selectedBone) {
            this.updateTransformInputs();
        }
    }
    
    copyPose() {
        if (!this.selectedBone) return;
        
        this.clipboard = {
            position: this.selectedBone.position.clone(),
            rotation: this.selectedBone.rotation.clone(),
            scale: this.selectedBone.scale.clone()
        };
        this.showToast('Pose copied', 'info');
    }
    
    pastePose() {
        if (!this.selectedBone || !this.clipboard) return;
        
        this.selectedBone.position.copy(this.clipboard.position);
        this.selectedBone.rotation.copy(this.clipboard.rotation);
        this.selectedBone.scale.copy(this.clipboard.scale);
        
        this.updateTransformInputs();
        this.saveToHistory();
        this.showToast('Pose pasted', 'success');
    }
    
    mirrorPose() {
        if (!this.selectedBone) return;
        
        const name = this.selectedBone.name;
        let mirrorName = name;
        
        if (name.includes('Left')) {
            mirrorName = name.replace('Left', 'Right');
        } else if (name.includes('Right')) {
            mirrorName = name.replace('Right', 'Left');
        } else if (name.startsWith('L')) {
            mirrorName = 'R' + name.slice(1);
        } else if (name.startsWith('R')) {
            mirrorName = 'L' + name.slice(1);
        }
        
        const mirrorBone = this.bones.get(mirrorName);
        if (mirrorBone) {
            mirrorBone.rotation.x = this.selectedBone.rotation.x;
            mirrorBone.rotation.y = -this.selectedBone.rotation.y;
            mirrorBone.rotation.z = -this.selectedBone.rotation.z;
            this.showToast(`Mirrored to ${mirrorName}`, 'success');
        } else {
            this.showToast('No mirror bone found', 'warning');
        }
    }
    
    resetBone() {
        if (!this.selectedBone) return;
        
        const original = this.originalBoneTransforms.get(this.selectedBone.name);
        if (original) {
            this.selectedBone.position.copy(original.position);
            this.selectedBone.rotation.copy(original.rotation);
            this.selectedBone.scale.copy(original.scale);
            this.updateTransformInputs();
            this.saveToHistory();
            this.showToast('Bone reset', 'info');
        }
    }
    
    resetAllBones() {
        this.originalBoneTransforms.forEach((transforms, boneName) => {
            const bone = this.bones.get(boneName);
            if (bone) {
                bone.position.copy(transforms.position);
                bone.rotation.copy(transforms.rotation);
                bone.scale.copy(transforms.scale);
            }
        });
        
        if (this.selectedBone) {
            this.updateTransformInputs();
        }
        
        this.saveToHistory();
        this.showToast('All bones reset', 'info');
    }
    
    // ==================== TOOLS ====================
    
    setTool(tool) {
        this.currentTool = tool;
        
        ['select', 'rotate', 'translate', 'scale'].forEach(t => {
            document.getElementById(`tool-${t}`)?.classList.toggle('active', t === tool);
        });
        
        if (tool === 'select') {
            this.transformControls.detach();
        } else if (this.selectedBone) {
            this.transformControls.attach(this.selectedBone);
            this.transformControls.setMode(tool === 'rotate' ? 'rotate' : 
                                            tool === 'translate' ? 'translate' : 'scale');
        }
    }
    
    toggleBoneView() {
        this.showBoneView = !this.showBoneView;
        
        // Toggle bone lines
        if (this.boneLinesGroup) {
            this.boneLinesGroup.visible = this.showBoneView;
        }
        
        // Toggle 3D bone helpers
        if (this.boneVisualizerGroup) {
            this.boneVisualizerGroup.visible = this.showBoneView;
        }
        
        // Update button state
        document.getElementById('btn-bone-view')?.classList.toggle('active', this.showBoneView);
        
        // Show toast
        this.showToast(this.showBoneView ? 'Bone view enabled' : 'Bone view disabled', 'info');
    }
    
    // ==================== HISTORY ====================
    
    saveToHistory() {
        const state = this.serializeState();
        
        // Remove future states if we're not at the end
        if (this.historyIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.historyIndex + 1);
        }
        
        this.history.push(state);
        if (this.history.length > this.maxHistory) {
            this.history.shift();
        }
        this.historyIndex = this.history.length - 1;
    }
    
    serializeState() {
        const boneStates = {};
        this.bones.forEach((bone, name) => {
            boneStates[name] = {
                position: bone.position.toArray(),
                rotation: bone.rotation.toArray(),
                scale: bone.scale.toArray()
            };
        });
        return JSON.stringify(boneStates);
    }
    
    restoreState(stateStr) {
        const boneStates = JSON.parse(stateStr);
        Object.entries(boneStates).forEach(([name, state]) => {
            const bone = this.bones.get(name);
            if (bone) {
                bone.position.fromArray(state.position);
                bone.rotation.fromArray(state.rotation);
                bone.scale.fromArray(state.scale);
            }
        });
        if (this.selectedBone) {
            this.updateTransformInputs();
        }
    }
    
    undo() {
        if (this.historyIndex > 0) {
            this.historyIndex--;
            this.restoreState(this.history[this.historyIndex]);
            this.showToast('Undo', 'info');
        }
    }
    
    redo() {
        if (this.historyIndex < this.history.length - 1) {
            this.historyIndex++;
            this.restoreState(this.history[this.historyIndex]);
            this.showToast('Redo', 'info');
        }
    }
    
    // ==================== SAVE/LOAD/EXPORT ====================
    
    showSaveModal() {
        document.getElementById('save-modal').classList.remove('hidden');
        document.getElementById('save-animation-name').value = this.animationName;
        document.getElementById('save-animation-id').value = this.animationName.toLowerCase().replace(/\s+/g, '_');
    }
    
    showLoadModal() {
        document.getElementById('load-modal').classList.remove('hidden');
        this.populateAnimationList();
    }
    
    showExportJSONModal() {
        document.getElementById('export-json-modal').classList.remove('hidden');
        document.getElementById('export-json-filename').value = this.animationName.toLowerCase().replace(/\s+/g, '_');
    }
    
    showExportGLBModal() {
        document.getElementById('export-glb-modal').classList.remove('hidden');
        document.getElementById('export-glb-filename').value = (this.loadedFilename || 'model').replace(/\.[^.]+$/, '');
        
        // Populate animations list for export selection
        this.populateExportAnimationsList();
    }
    
    populateExportAnimationsList() {
        const list = document.getElementById('export-animations-list');
        if (!list) return;
        
        list.innerHTML = '';
        
        this.animations.forEach((anim, id) => {
            const item = document.createElement('div');
            item.className = 'export-anim-item';
            item.innerHTML = `
                <input type="checkbox" id="export-anim-${id}" data-anim-id="${id}" checked>
                <label for="export-anim-${id}">${anim.name}</label>
                <span class="meta">${anim.totalFrames}f</span>
            `;
            list.appendChild(item);
        });
        
        // Select/Deselect all buttons
        document.getElementById('btn-select-all-anims')?.addEventListener('click', () => {
            list.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = true);
        });
        
        document.getElementById('btn-deselect-all-anims')?.addEventListener('click', () => {
            list.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        });
    }
    
    getSelectedExportAnimations() {
        const list = document.getElementById('export-animations-list');
        if (!list) return [];
        
        const selected = [];
        list.querySelectorAll('input[type="checkbox"]:checked').forEach(cb => {
            const animId = cb.dataset.animId;
            if (animId && this.animations.has(animId)) {
                selected.push(animId);
            }
        });
        
        return selected;
    }
    
    saveAnimation() {
        const name = document.getElementById('save-animation-name').value || 'Untitled';
        const id = document.getElementById('save-animation-id').value || name.toLowerCase().replace(/\s+/g, '_');
        const description = document.getElementById('save-description').value || '';
        const category = document.getElementById('save-category').value || 'other';
        
        const animation = {
            id,
            name,
            description,
            category,
            fps: this.fps,
            totalFrames: this.totalFrames,
            speed: this.speed,
            loop: this.loop,
            keyframes: this.serializeKeyframes(),
            createdAt: new Date().toISOString()
        };
        
        // Save to localStorage
        const existing = this.savedAnimations.findIndex(a => a.id === id);
        if (existing >= 0) {
            this.savedAnimations[existing] = animation;
        } else {
            this.savedAnimations.push(animation);
        }
        
        localStorage.setItem('glb_editor_animations', JSON.stringify(this.savedAnimations));
        
        document.getElementById('save-modal').classList.add('hidden');
        this.showToast(`Animation "${name}" saved!`, 'success');
    }
    
    serializeKeyframes() {
        const result = {};
        this.keyframes.forEach((frameData, frame) => {
            result[frame] = {};
            frameData.forEach((boneData, boneName) => {
                result[frame][boneName] = {
                    position: boneData.position.toArray(),
                    rotation: [boneData.rotation.x, boneData.rotation.y, boneData.rotation.z, boneData.rotation.w],
                    scale: boneData.scale.toArray()
                };
            });
        });
        return result;
    }
    
    loadSavedAnimations() {
        const saved = localStorage.getItem('glb_editor_animations');
        if (saved) {
            this.savedAnimations = JSON.parse(saved);
        }
    }
    
    populateAnimationList() {
        const list = document.getElementById('animation-list');
        if (!list) return;
        
        list.innerHTML = '';
        
        if (this.savedAnimations.length === 0) {
            list.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No saved animations</p>';
            return;
        }
        
        this.savedAnimations.forEach(anim => {
            const card = document.createElement('div');
            card.className = 'animation-card';
            card.dataset.id = anim.id;
            card.innerHTML = `
                <div class="animation-card-icon">🎬</div>
                <div class="animation-card-name">${anim.name}</div>
                <div class="animation-card-meta">${anim.totalFrames} frames @ ${anim.fps}fps</div>
                <div class="animation-card-category">${anim.category}</div>
            `;
            
            card.addEventListener('click', () => {
                list.querySelectorAll('.animation-card').forEach(c => c.classList.remove('selected'));
                card.classList.add('selected');
                this.selectedAnimationToLoad = anim.id;
                document.getElementById('btn-load-selected').disabled = false;
            });
            
            list.appendChild(card);
        });
    }
    
    loadSelectedAnimation() {
        const anim = this.savedAnimations.find(a => a.id === this.selectedAnimationToLoad);
        if (!anim) return;
        
        this.loadAnimationData(anim);
        document.getElementById('load-modal').classList.add('hidden');
    }
    
    loadAnimationData(anim) {
        // Convert keyframes from JSON format to Map format
        const keyframes = new Map();
        if (anim.keyframes) {
            Object.entries(anim.keyframes).forEach(([frame, bones]) => {
                const frameNum = parseInt(frame);
                keyframes.set(frameNum, new Map());
                
                Object.entries(bones).forEach(([boneName, data]) => {
                    keyframes.get(frameNum).set(boneName, {
                        position: new THREE.Vector3().fromArray(data.position),
                        rotation: new THREE.Quaternion().fromArray(data.rotation),
                        scale: new THREE.Vector3().fromArray(data.scale)
                    });
                });
            });
        }
        
        // Create a new animation with the loaded data
        const id = `loaded_${this.animationCounter++}`;
        this.animations.set(id, {
            name: anim.name || 'Loaded Animation',
            fps: anim.fps || 24,
            totalFrames: anim.totalFrames || 30,
            speed: anim.speed || 1,
            loop: anim.loop !== false,
            keyframes: keyframes
        });
        
        // Switch to the new animation
        this.switchToAnimation(id);
        this.updateAnimationsList();
        
        this.showToast(`Loaded "${anim.name || 'animation'}"`, 'success');
    }
    
    importAnimationFile(file) {
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this.loadAnimationData(data);
                document.getElementById('load-modal').classList.add('hidden');
            } catch (err) {
                this.showToast('Invalid animation file', 'error');
            }
        };
        reader.readAsText(file);
    }
    
    // ==================== GLB ANIMATION IMPORT ====================
    
    importGLBAnimations(file) {
        if (!file) return;
        
        this.showToast('Loading GLB file...', 'info');
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const arrayBuffer = e.target.result;
                const loader = new GLTFLoader();
                
                loader.parse(arrayBuffer, '', (gltf) => {
                    this.processGLBAnimations(gltf, file.name);
                }, (error) => {
                    console.error('GLB load error:', error);
                    this.showToast('Failed to load GLB file', 'error');
                });
                
            } catch (err) {
                console.error('GLB import error:', err);
                this.showToast('Failed to import GLB file', 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    }
    
    processGLBAnimations(gltf, filename) {
        const animations = gltf.animations || [];
        
        if (animations.length === 0) {
            this.showToast('No animations found in GLB file', 'warning');
            return;
        }
        
        this.pendingGLBImport = { gltf, filename, animations };
        
        // Show file info
        const infoEl = document.getElementById('glb-file-info');
        if (infoEl) {
            infoEl.innerHTML = `
                <div class="filename">📦 ${filename}</div>
                <div class="file-meta">${animations.length} animation(s) found</div>
            `;
        }
        
        // Populate animation list
        const listEl = document.getElementById('glb-animation-list');
        if (listEl) {
            listEl.innerHTML = '';
            
            animations.forEach((clip, index) => {
                const card = document.createElement('div');
                card.className = 'animation-card';
                card.dataset.index = index;
                card.innerHTML = `
                    <div class="animation-card-icon">${this.getAnimationIcon(clip.name)}</div>
                    <div class="animation-card-name">${clip.name || `Animation ${index + 1}`}</div>
                    <div class="animation-card-duration">${clip.duration.toFixed(2)}s</div>
                    <div class="animation-card-tracks">${clip.tracks.length} tracks</div>
                `;
                
                card.addEventListener('click', () => {
                    listEl.querySelectorAll('.animation-card').forEach(c => c.classList.remove('selected'));
                    card.classList.add('selected');
                    document.getElementById('btn-import-glb-selected').disabled = false;
                });
                
                listEl.appendChild(card);
            });
        }
        
        document.getElementById('load-modal').classList.add('hidden');
        document.getElementById('glb-select-modal').classList.remove('hidden');
    }
    
    getAnimationIcon(name) {
        const lowerName = (name || '').toLowerCase();
        if (lowerName.includes('idle')) return '🧍';
        if (lowerName.includes('walk')) return '🚶';
        if (lowerName.includes('run')) return '🏃';
        if (lowerName.includes('jump')) return '⬆️';
        if (lowerName.includes('attack') || lowerName.includes('shoot')) return '⚔️';
        if (lowerName.includes('death') || lowerName.includes('die')) return '💀';
        return '🎬';
    }
    
    importSelectedGLBAnimation() {
        if (!this.pendingGLBImport) {
            this.showToast('No GLB file loaded', 'error');
            return;
        }
        
        const selectedCard = document.querySelector('#glb-animation-list .animation-card.selected');
        if (!selectedCard) {
            this.showToast('Please select an animation', 'warning');
            return;
        }
        
        const index = parseInt(selectedCard.dataset.index);
        const clip = this.pendingGLBImport.animations[index];
        const gltf = this.pendingGLBImport.gltf;
        
        const sampleRate = parseInt(document.getElementById('glb-sample-rate')?.value || '2');
        const targetFPS = parseInt(document.getElementById('glb-target-fps')?.value || '60');
        
        this.showToast(`Converting "${clip.name}"...`, 'info');
        
        try {
            const animationData = this.convertGLBClipToKeyframes(clip, gltf, sampleRate, targetFPS);
            this.loadAnimationData(animationData);
            
            document.getElementById('glb-select-modal').classList.add('hidden');
            this.pendingGLBImport = null;
            
            this.showToast(`Imported "${clip.name}"`, 'success');
        } catch (err) {
            console.error('Import error:', err);
            this.showToast('Failed to convert animation', 'error');
        }
    }
    
    convertGLBClipToKeyframes(clip, gltf, sampleRate, targetFPS) {
        const duration = clip.duration;
        const totalFrames = Math.ceil(duration * targetFPS);
        
        const keyframes = {};
        
        // Sample at every sampleRate frame
        for (let frame = 0; frame <= totalFrames; frame += sampleRate) {
            const time = frame / targetFPS;
            
            clip.tracks.forEach(track => {
                // Parse track name to get bone name
                const parts = track.name.split('.');
                const boneName = parts[0];
                const property = parts[parts.length - 1];
                
                // Skip non-bone tracks
                if (!this.bones.has(boneName)) return;
                
                if (!keyframes[frame]) {
                    keyframes[frame] = {};
                }
                
                if (!keyframes[frame][boneName]) {
                    const bone = this.bones.get(boneName);
                    const original = this.originalBoneTransforms.get(boneName);
                    keyframes[frame][boneName] = {
                        position: original?.position.toArray() || [0, 0, 0],
                        rotation: [0, 0, 0, 1],
                        scale: original?.scale.toArray() || [1, 1, 1]
                    };
                }
                
                // Sample the track
                if (property === 'quaternion') {
                    const quat = this.sampleQuaternionTrack(track, time);
                    keyframes[frame][boneName].rotation = [quat.x, quat.y, quat.z, quat.w];
                } else if (property === 'position') {
                    const pos = this.sampleVectorTrack(track, time);
                    keyframes[frame][boneName].position = [pos.x, pos.y, pos.z];
                } else if (property === 'scale') {
                    const scale = this.sampleVectorTrack(track, time);
                    keyframes[frame][boneName].scale = [scale.x, scale.y, scale.z];
                }
            });
        }
        
        return {
            id: clip.name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''),
            name: clip.name || 'Imported Animation',
            description: `Imported from ${this.pendingGLBImport?.filename || 'GLB'}`,
            category: 'other',
            fps: targetFPS,
            totalFrames,
            speed: 1,
            loop: true,
            keyframes
        };
    }
    
    sampleQuaternionTrack(track, time) {
        const times = track.times;
        const values = track.values;
        
        if (time <= times[0]) {
            return new THREE.Quaternion(values[0], values[1], values[2], values[3]);
        }
        if (time >= times[times.length - 1]) {
            const i = (times.length - 1) * 4;
            return new THREE.Quaternion(values[i], values[i + 1], values[i + 2], values[i + 3]);
        }
        
        let i1 = 0;
        for (let i = 0; i < times.length - 1; i++) {
            if (time >= times[i] && time < times[i + 1]) {
                i1 = i;
                break;
            }
        }
        const i2 = i1 + 1;
        
        const alpha = (time - times[i1]) / (times[i2] - times[i1]);
        
        const q1 = new THREE.Quaternion(values[i1 * 4], values[i1 * 4 + 1], values[i1 * 4 + 2], values[i1 * 4 + 3]);
        const q2 = new THREE.Quaternion(values[i2 * 4], values[i2 * 4 + 1], values[i2 * 4 + 2], values[i2 * 4 + 3]);
        
        return q1.slerp(q2, alpha);
    }
    
    sampleVectorTrack(track, time) {
        const times = track.times;
        const values = track.values;
        
        if (time <= times[0]) {
            return new THREE.Vector3(values[0], values[1], values[2]);
        }
        if (time >= times[times.length - 1]) {
            const i = (times.length - 1) * 3;
            return new THREE.Vector3(values[i], values[i + 1], values[i + 2]);
        }
        
        let i1 = 0;
        for (let i = 0; i < times.length - 1; i++) {
            if (time >= times[i] && time < times[i + 1]) {
                i1 = i;
                break;
            }
        }
        const i2 = i1 + 1;
        
        const alpha = (time - times[i1]) / (times[i2] - times[i1]);
        
        const v1 = new THREE.Vector3(values[i1 * 3], values[i1 * 3 + 1], values[i1 * 3 + 2]);
        const v2 = new THREE.Vector3(values[i2 * 3], values[i2 * 3 + 1], values[i2 * 3 + 2]);
        
        return v1.lerp(v2, alpha);
    }
    
    // ==================== EXPORT ====================
    
    exportJSON() {
        const filename = document.getElementById('export-json-filename').value || 'animation';
        
        const animationData = {
            id: filename,
            name: this.animationName,
            fps: this.fps,
            totalFrames: this.totalFrames,
            loop: this.loop,
            speed: this.speed,
            keyframes: this.serializeKeyframes(),
            exportedAt: new Date().toISOString()
        };
        
        const blob = new Blob([JSON.stringify(animationData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${filename}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        document.getElementById('export-json-modal').classList.add('hidden');
        this.showToast(`Exported "${filename}.json"`, 'success');
    }
    
    async exportGLB() {
        const filename = document.getElementById('export-glb-filename').value || 'model';
        const includeModel = document.getElementById('export-include-model').checked;
        const binary = document.getElementById('export-binary').checked;
        
        // Get selected animations
        const selectedAnimIds = this.getSelectedExportAnimations();
        
        if (selectedAnimIds.length === 0) {
            this.showToast('Please select at least one animation to export', 'warning');
            return;
        }
        
        this.showToast('Generating GLB...', 'info');
        
        try {
            // Create animation clips for all selected animations
            const animationClips = [];
            selectedAnimIds.forEach(animId => {
                const clip = this.createAnimationClipFromAnimation(animId);
                if (clip) {
                    animationClips.push(clip);
                }
            });
            
            // Create export scene
            let exportScene;
            if (includeModel && this.model) {
                exportScene = this.model.clone(true);
                // Find skeleton in cloned model
                exportScene.traverse(child => {
                    if (child.isSkinnedMesh && child.skeleton) {
                        child.skeleton.update();
                    }
                });
            } else {
                // Export just the skeleton
                exportScene = new THREE.Group();
                if (this.skeleton) {
                    const rootBone = this.skeleton.bones[0];
                    if (rootBone) {
                        exportScene.add(rootBone.clone(true));
                    }
                }
            }
            
            // Add animations to scene
            exportScene.animations = animationClips;
            
            // Export using GLTFExporter
            const exporter = new GLTFExporter();
            
            const options = {
                binary: binary,
                animations: exportScene.animations,
                includeCustomExtensions: true
            };
            
            exporter.parse(exportScene, (result) => {
                let blob;
                if (binary) {
                    blob = new Blob([result], { type: 'application/octet-stream' });
                } else {
                    blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
                }
                
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${filename}.${binary ? 'glb' : 'gltf'}`;
                a.click();
                URL.revokeObjectURL(url);
                
                document.getElementById('export-glb-modal').classList.add('hidden');
                this.showToast(`Exported "${filename}.${binary ? 'glb' : 'gltf'}" with ${animationClips.length} animation(s)`, 'success');
            }, (error) => {
                console.error('Export error:', error);
                this.showToast('Failed to export GLB', 'error');
            }, options);
            
        } catch (err) {
            console.error('Export error:', err);
            this.showToast('Failed to export: ' + err.message, 'error');
        }
    }
    
    createAnimationClipFromAnimation(animId) {
        const anim = this.animations.get(animId);
        if (!anim || !anim.keyframes || anim.keyframes.size === 0) {
            return null;
        }
        
        return this.createAnimationClipFromData(anim.name, anim.keyframes, anim.fps, anim.totalFrames);
    }
    
    createAnimationClip() {
        // Create clip from current animation
        if (!this.currentAnimation || this.keyframes.size === 0) {
            return null;
        }
        
        return this.createAnimationClipFromData(this.animationName, this.keyframes, this.fps, this.totalFrames);
    }
    
    createAnimationClipFromData(name, keyframes, fps, totalFrames) {
        if (!keyframes || keyframes.size === 0) {
            return null;
        }
        
        const tracks = [];
        const duration = totalFrames / fps;
        
        // Collect all bones that have keyframes
        const bonesWithKeyframes = new Set();
        keyframes.forEach((frameData) => {
            frameData.forEach((_, boneName) => {
                bonesWithKeyframes.add(boneName);
            });
        });
        
        // Create tracks for each bone
        bonesWithKeyframes.forEach(boneName => {
            const times = [];
            const positions = [];
            const quaternions = [];
            const scales = [];
            
            // Sort frames
            const sortedFrames = Array.from(keyframes.keys()).sort((a, b) => a - b);
            
            sortedFrames.forEach(frame => {
                const boneData = keyframes.get(frame)?.get(boneName);
                if (boneData) {
                    const time = frame / fps;
                    times.push(time);
                    
                    positions.push(boneData.position.x, boneData.position.y, boneData.position.z);
                    quaternions.push(boneData.rotation.x, boneData.rotation.y, boneData.rotation.z, boneData.rotation.w);
                    scales.push(boneData.scale.x, boneData.scale.y, boneData.scale.z);
                }
            });
            
            if (times.length > 0) {
                // Position track
                const positionTrack = new THREE.VectorKeyframeTrack(
                    `${boneName}.position`,
                    times,
                    positions
                );
                tracks.push(positionTrack);
                
                // Rotation track
                const quaternionTrack = new THREE.QuaternionKeyframeTrack(
                    `${boneName}.quaternion`,
                    times,
                    quaternions
                );
                tracks.push(quaternionTrack);
                
                // Scale track
                const scaleTrack = new THREE.VectorKeyframeTrack(
                    `${boneName}.scale`,
                    times,
                    scales
                );
                tracks.push(scaleTrack);
            }
        });
        
        if (tracks.length === 0) {
            return null;
        }
        
        return new THREE.AnimationClip(name, duration, tracks);
    }
    
    // ==================== INPUT HANDLING ====================
    
    onKeyDown(e) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        
        switch (e.code) {
            case 'Space':
                e.preventDefault();
                this.togglePlayback();
                break;
            case 'KeyV':
                this.setTool('select');
                break;
            case 'KeyR':
                this.setTool('rotate');
                break;
            case 'KeyT':
                this.setTool('translate');
                break;
            case 'KeyS':
                if (!e.ctrlKey && !e.metaKey) {
                    this.setTool('scale');
                }
                break;
            case 'KeyB':
                this.toggleBoneView();
                break;
            case 'KeyK':
                if (e.shiftKey) {
                    this.addKeyframeReset();
                } else {
                    this.addKeyframe();
                }
                break;
            case 'Delete':
            case 'Backspace':
                this.deleteKeyframe();
                break;
            case 'ArrowLeft':
                this.prevFrame();
                break;
            case 'ArrowRight':
                this.nextFrame();
                break;
            case 'KeyZ':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    if (e.shiftKey) {
                        this.redo();
                    } else {
                        this.undo();
                    }
                }
                break;
            case 'KeyY':
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    this.redo();
                }
                break;
        }
    }
    
    onCanvasClick(e) {
        // Allow bone selection in all modes for better UX
        const rect = this.renderer.domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((e.clientX - rect.left) / rect.width) * 2 - 1,
            -((e.clientY - rect.top) / rect.height) * 2 + 1
        );
        
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(mouse, this.camera);
        
        // Collect all clickable meshes from bone helpers
        const meshesToTest = [];
        this.boneHelpers.forEach(helper => {
            helper.traverse(child => {
                if (child.isMesh) {
                    meshesToTest.push(child);
                }
            });
        });
        
        // Also test the model mesh for click-through selection
        if (this.model) {
            this.model.traverse(child => {
                if (child.isMesh && child.visible) {
                    meshesToTest.push(child);
                }
            });
        }
        
        const intersects = raycaster.intersectObjects(meshesToTest, false);
        
        if (intersects.length > 0) {
            // Find the bone name from the clicked object
            let obj = intersects[0].object;
            let boneName = null;
            
            // First check if we clicked directly on a bone helper
            while (obj && !obj.userData.boneName) {
                obj = obj.parent;
            }
            
            if (obj && obj.userData.boneName) {
                boneName = obj.userData.boneName;
            }
            
            // If we clicked on a mesh that's bound to a skeleton, find the nearest bone
            if (!boneName && this.skeleton) {
                const clickPoint = intersects[0].point;
                let closestBone = null;
                let closestDist = Infinity;
                
                this.bones.forEach((bone, name) => {
                    const boneWorldPos = new THREE.Vector3();
                    bone.getWorldPosition(boneWorldPos);
                    const dist = clickPoint.distanceTo(boneWorldPos);
                    if (dist < closestDist) {
                        closestDist = dist;
                        closestBone = name;
                    }
                });
                
                if (closestBone && closestDist < 0.5) {
                    boneName = closestBone;
                }
            }
            
            if (boneName) {
                this.selectBone(boneName);
            }
        }
    }
    
    onResize() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        
        this.renderer.setSize(width, height);
    }
    
    // ==================== RENDER LOOP ====================
    
    animate() {
        requestAnimationFrame(() => this.animate());
        
        // Log once every 5 seconds during first minute
        if (!this._animateLogCount) this._animateLogCount = 0;
        if (this._animateLogCount < 12 && Date.now() - (this._lastAnimateLog || 0) > 5000) {
            console.log('Animate loop running. Scene visible:', this.scene?.children?.length, 'objects');
            this._lastAnimateLog = Date.now();
            this._animateLogCount++;
        }
        
        const delta = this.clock.getDelta();
        
        // Animation playback
        if (this.isPlaying) {
            this.playbackTime = (this.playbackTime || 0) + delta * this.speed;
            const frameDuration = 1 / this.fps;
            
            if (this.playbackTime >= frameDuration) {
                this.playbackTime = 0;
                
                if (this.currentFrame < this.totalFrames) {
                    this.goToFrame(this.currentFrame + 1);
                } else if (this.loop) {
                    this.goToFrame(0);
                } else {
                    this.stopPlayback();
                }
            }
        }
        
        // Update bone lines
        if (this.showBoneView) {
            this.updateBoneLines();
        }
        
        // Update controls
        this.controls.update();
        
        // Render
        this.renderer.render(this.scene, this.camera);
    }
    
    // ==================== UTILITIES ====================
    
    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        
        const icons = {
            success: '✓',
            error: '✕',
            warning: '⚠',
            info: 'ℹ'
        };
        
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <span class="toast-message">${message}</span>
        `;
        
        container.appendChild(toast);
        
        setTimeout(() => {
            toast.classList.add('removing');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize editor when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    console.log('GLB Animation Editor starting...');
    window.glbAnimationEditor = new GLBAnimationEditor();
});


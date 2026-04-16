import * as THREE from 'three';

// Frim Pose Capture - Video to Animation using MediaPipe Pose
// Converts video body movements to skeletal animation keyframes

class PoseCapture {
    constructor(editor) {
        this.editor = editor;
        this.pose = null;
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.isProcessing = false;
        this.frames = [];
        this.currentPreviewFrame = 0;
        this.animationId = null;
        
        // Skeleton analysis & depth estimation
        this.skeletonInfo = null;
        this.referenceBodyScale = null;
        this.referenceHipCenter = null;
        this.scaleFactor = 1;
        this.previousZ = 0;
        
        // Pose landmark indices (MediaPipe)
        this.LANDMARKS = {
            NOSE: 0,
            LEFT_EYE_INNER: 1,
            LEFT_EYE: 2,
            LEFT_EYE_OUTER: 3,
            RIGHT_EYE_INNER: 4,
            RIGHT_EYE: 5,
            RIGHT_EYE_OUTER: 6,
            LEFT_EAR: 7,
            RIGHT_EAR: 8,
            MOUTH_LEFT: 9,
            MOUTH_RIGHT: 10,
            LEFT_SHOULDER: 11,
            RIGHT_SHOULDER: 12,
            LEFT_ELBOW: 13,
            RIGHT_ELBOW: 14,
            LEFT_WRIST: 15,
            RIGHT_WRIST: 16,
            LEFT_PINKY: 17,
            RIGHT_PINKY: 18,
            LEFT_INDEX: 19,
            RIGHT_INDEX: 20,
            LEFT_THUMB: 21,
            RIGHT_THUMB: 22,
            LEFT_HIP: 23,
            RIGHT_HIP: 24,
            LEFT_KNEE: 25,
            RIGHT_KNEE: 26,
            LEFT_ANKLE: 27,
            RIGHT_ANKLE: 28,
            LEFT_HEEL: 29,
            RIGHT_HEEL: 30,
            LEFT_FOOT_INDEX: 31,
            RIGHT_FOOT_INDEX: 32
        };
        
        this.init();
    }
    
    async init() {
        this.setupUI();
        this.setupEventListeners();
    }
    
    setupUI() {
        // Create modal HTML
        const modalHTML = `
            <div class="modal-overlay hidden" id="pose-capture-modal">
                <div class="modal modal-xlarge">
                    <div class="modal-header">
                        <h3>🎥 Video to Animation</h3>
                        <button class="modal-close" data-close="pose-capture-modal">✕</button>
                    </div>
                    <div class="modal-body pose-capture-body">
                        <!-- Upload Step -->
                        <div class="pose-step" id="pose-step-upload">
                            <div class="pose-upload-zone" id="pose-upload-zone">
                                <div class="upload-icon">
                                    <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                                        <polygon points="23 7 16 12 23 17 23 7"/>
                                        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
                                    </svg>
                                </div>
                                <h3>Drop Video File Here</h3>
                                <p>or click to browse</p>
                                <p class="upload-hint">Supports MP4, WebM, MOV (max 100MB)</p>
                                <input type="file" id="pose-video-input" accept="video/*" hidden>
                            </div>
                        </div>
                        
                        <!-- Processing Step -->
                        <div class="pose-step hidden" id="pose-step-process">
                            <div class="pose-preview-container">
                                <div class="pose-video-wrapper">
                                    <video id="pose-video" muted playsinline></video>
                                    <canvas id="pose-canvas"></canvas>
                                </div>
                                <div class="pose-info">
                                    <div class="info-item">
                                        <span class="label">Duration:</span>
                                        <span class="value" id="pose-duration">-</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="label">Resolution:</span>
                                        <span class="value" id="pose-resolution">-</span>
                                    </div>
                                    <div class="info-item">
                                        <span class="label">Frames:</span>
                                        <span class="value" id="pose-frame-count">-</span>
                                    </div>
                                </div>
                            </div>
                            <div class="pose-settings">
                                <div class="setting-group">
                                    <label>Sample Rate</label>
                                    <select id="pose-sample-rate">
                                        <option value="1">Every frame (smooth, slow)</option>
                                        <option value="2" selected>Every 2 frames</option>
                                        <option value="4">Every 4 frames (fast)</option>
                                        <option value="6">Every 6 frames (faster)</option>
                                    </select>
                                </div>
                                <div class="setting-group">
                                    <label>Output FPS</label>
                                    <select id="pose-output-fps">
                                        <option value="12">12 FPS</option>
                                        <option value="24" selected>24 FPS</option>
                                        <option value="30">30 FPS</option>
                                    </select>
                                </div>
                                <div class="setting-group">
                                    <label>Confidence Threshold</label>
                                    <input type="range" id="pose-confidence" min="0.3" max="0.9" step="0.1" value="0.5">
                                    <span id="pose-confidence-value">0.5</span>
                                </div>
                            </div>
                            <div class="pose-progress hidden" id="pose-progress">
                                <div class="progress-bar">
                                    <div class="progress-fill" id="pose-progress-fill"></div>
                                </div>
                                <p class="progress-text" id="pose-progress-text">Initializing AI model...</p>
                            </div>
                        </div>
                        
                        <!-- Preview Step -->
                        <div class="pose-step hidden" id="pose-step-preview">
                            <div class="pose-result-preview">
                                <canvas id="pose-result-canvas"></canvas>
                                <div class="preview-controls">
                                    <button class="preview-btn" id="pose-preview-play">▶ Play</button>
                                    <input type="range" id="pose-preview-slider" min="0" max="100" value="0">
                                    <span id="pose-preview-frame">0 / 0</span>
                                </div>
                            </div>
                            <div class="pose-result-info">
                                <h4>Capture Results</h4>
                                <div class="result-stats">
                                    <div class="stat">
                                        <span class="stat-value" id="result-frames">0</span>
                                        <span class="stat-label">Keyframes</span>
                                    </div>
                                    <div class="stat">
                                        <span class="stat-value" id="result-duration">0s</span>
                                        <span class="stat-label">Duration</span>
                                    </div>
                                    <div class="stat">
                                        <span class="stat-value" id="result-confidence">0%</span>
                                        <span class="stat-label">Avg Confidence</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button class="btn-secondary" data-close="pose-capture-modal">Cancel</button>
                        <button class="btn-secondary hidden" id="btn-pose-back">← Back</button>
                        <button class="btn-primary" id="btn-pose-process" disabled>
                            <span class="btn-text">Process Video</span>
                            <span class="btn-loading hidden">Processing...</span>
                        </button>
                        <button class="btn-primary hidden" id="btn-pose-apply">Apply to Animation</button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        
        // Add button to toolbar
        const toolbar = document.querySelector('.toolbar-left');
        if (toolbar) {
            const btn = document.createElement('button');
            btn.className = 'toolbar-btn';
            btn.id = 'btn-video-capture';
            btn.title = 'Import from Video (AI Pose Detection)';
            btn.innerHTML = '<span class="icon">🎥</span><span class="label">Video</span>';
            
            // Insert after the divider
            const divider = toolbar.querySelector('.toolbar-divider');
            if (divider) {
                divider.parentNode.insertBefore(btn, divider.nextSibling);
            } else {
                toolbar.appendChild(btn);
            }
        }
    }
    
    setupEventListeners() {
        // Open modal
        document.getElementById('btn-video-capture')?.addEventListener('click', () => this.openModal());
        
        // Close modal
        document.querySelector('[data-close="pose-capture-modal"]')?.addEventListener('click', () => this.closeModal());
        document.getElementById('pose-capture-modal')?.addEventListener('click', (e) => {
            if (e.target.id === 'pose-capture-modal') this.closeModal();
        });
        
        // Upload zone
        const uploadZone = document.getElementById('pose-upload-zone');
        const videoInput = document.getElementById('pose-video-input');
        
        uploadZone?.addEventListener('click', () => videoInput?.click());
        uploadZone?.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('drag-over');
        });
        uploadZone?.addEventListener('dragleave', () => {
            uploadZone.classList.remove('drag-over');
        });
        uploadZone?.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (file && file.type.startsWith('video/')) {
                this.loadVideo(file);
            }
        });
        
        videoInput?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) this.loadVideo(file);
        });
        
        // Confidence slider
        document.getElementById('pose-confidence')?.addEventListener('input', (e) => {
            document.getElementById('pose-confidence-value').textContent = e.target.value;
        });
        
        // Process button
        document.getElementById('btn-pose-process')?.addEventListener('click', () => this.processVideo());
        
        // Back button
        document.getElementById('btn-pose-back')?.addEventListener('click', () => this.goBack());
        
        // Apply button
        document.getElementById('btn-pose-apply')?.addEventListener('click', () => this.applyToAnimation());
        
        // Preview controls
        document.getElementById('pose-preview-play')?.addEventListener('click', () => this.togglePreviewPlay());
        document.getElementById('pose-preview-slider')?.addEventListener('input', (e) => {
            this.currentPreviewFrame = parseInt(e.target.value);
            this.drawPreviewFrame(this.currentPreviewFrame);
        });
    }
    
    openModal() {
        document.getElementById('pose-capture-modal')?.classList.remove('hidden');
        this.showStep('upload');
    }
    
    closeModal() {
        document.getElementById('pose-capture-modal')?.classList.add('hidden');
        this.cleanup();
    }
    
    showStep(step) {
        document.querySelectorAll('.pose-step').forEach(el => el.classList.add('hidden'));
        document.getElementById(`pose-step-${step}`)?.classList.remove('hidden');
        
        const processBtn = document.getElementById('btn-pose-process');
        const applyBtn = document.getElementById('btn-pose-apply');
        const backBtn = document.getElementById('btn-pose-back');
        
        processBtn?.classList.toggle('hidden', step === 'preview');
        applyBtn?.classList.toggle('hidden', step !== 'preview');
        backBtn?.classList.toggle('hidden', step === 'upload');
    }
    
    goBack() {
        if (document.getElementById('pose-step-preview')?.classList.contains('hidden') === false) {
            this.showStep('process');
        } else {
            this.showStep('upload');
        }
    }
    
    async loadVideo(file) {
        this.video = document.getElementById('pose-video');
        this.canvas = document.getElementById('pose-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        const url = URL.createObjectURL(file);
        this.video.src = url;
        
        await new Promise((resolve) => {
            this.video.onloadedmetadata = resolve;
        });
        
        // Set canvas size
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        
        // Update info
        const duration = this.video.duration;
        const fps = 30; // Assume 30fps for estimation
        const frameCount = Math.floor(duration * fps);
        
        document.getElementById('pose-duration').textContent = `${duration.toFixed(1)}s`;
        document.getElementById('pose-resolution').textContent = `${this.video.videoWidth}x${this.video.videoHeight}`;
        document.getElementById('pose-frame-count').textContent = `~${frameCount}`;
        
        // Enable process button
        document.getElementById('btn-pose-process').disabled = false;
        
        this.showStep('process');
        
        // Draw first frame
        this.video.currentTime = 0;
        await new Promise(r => this.video.onseeked = r);
        this.ctx.drawImage(this.video, 0, 0);
    }
    
    async loadPoseModel() {
        if (this.pose) return;
        
        // Load MediaPipe Pose
        const { Pose } = await import('https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js');
        
        this.pose = new Pose({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`;
            }
        });
        
        this.pose.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            smoothSegmentation: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });
        
        await this.pose.initialize();
    }
    
    async processVideo() {
        if (this.isProcessing) return;
        this.isProcessing = true;
        
        const processBtn = document.getElementById('btn-pose-process');
        const progressDiv = document.getElementById('pose-progress');
        const progressFill = document.getElementById('pose-progress-fill');
        const progressText = document.getElementById('pose-progress-text');
        
        processBtn.querySelector('.btn-text').classList.add('hidden');
        processBtn.querySelector('.btn-loading').classList.remove('hidden');
        processBtn.disabled = true;
        progressDiv.classList.remove('hidden');
        
        try {
            // Load model
            progressText.textContent = 'Loading AI pose model...';
            await this.loadPoseModel();
            
            const sampleRate = parseInt(document.getElementById('pose-sample-rate').value);
            const confidence = parseFloat(document.getElementById('pose-confidence').value);
            
            const duration = this.video.duration;
            const fps = 30;
            const totalFrames = Math.floor(duration * fps);
            const framesToProcess = Math.floor(totalFrames / sampleRate);
            
            this.frames = [];
            let processedCount = 0;
            let totalConfidence = 0;
            
            // Process frames
            for (let i = 0; i < totalFrames; i += sampleRate) {
                const time = i / fps;
                this.video.currentTime = time;
                await new Promise(r => this.video.onseeked = r);
                
                // Draw frame
                this.ctx.drawImage(this.video, 0, 0);
                
                // Detect pose
                const results = await this.detectPose();
                
                if (results && results.poseLandmarks) {
                    const avgConfidence = this.calculateAverageConfidence(results.poseLandmarks);
                    
                    if (avgConfidence >= confidence) {
                        this.frames.push({
                            time: time,
                            frameIndex: i,
                            landmarks: results.poseLandmarks,
                            confidence: avgConfidence
                        });
                        totalConfidence += avgConfidence;
                    }
                    
                    // Draw skeleton on canvas
                    this.drawSkeleton(results.poseLandmarks);
                }
                
                processedCount++;
                const progress = (processedCount / framesToProcess) * 100;
                progressFill.style.width = `${progress}%`;
                progressText.textContent = `Processing frame ${processedCount}/${framesToProcess}...`;
                
                // Allow UI to update
                await new Promise(r => setTimeout(r, 10));
            }
            
            // Show results
            const avgConf = this.frames.length > 0 ? (totalConfidence / this.frames.length * 100).toFixed(0) : 0;
            const outputFps = parseInt(document.getElementById('pose-output-fps').value);
            const resultDuration = this.frames.length / outputFps;
            
            document.getElementById('result-frames').textContent = this.frames.length;
            document.getElementById('result-duration').textContent = `${resultDuration.toFixed(1)}s`;
            document.getElementById('result-confidence').textContent = `${avgConf}%`;
            
            // Setup preview
            this.setupPreview();
            this.showStep('preview');
            
        } catch (err) {
            console.error('Pose detection error:', err);
            progressText.textContent = `Error: ${err.message}`;
        } finally {
            this.isProcessing = false;
            processBtn.querySelector('.btn-text').classList.remove('hidden');
            processBtn.querySelector('.btn-loading').classList.add('hidden');
            processBtn.disabled = false;
        }
    }
    
    async detectPose() {
        return new Promise((resolve) => {
            this.pose.onResults((results) => {
                resolve(results);
            });
            this.pose.send({ image: this.canvas });
        });
    }
    
    calculateAverageConfidence(landmarks) {
        const sum = landmarks.reduce((acc, lm) => acc + (lm.visibility || 0), 0);
        return sum / landmarks.length;
    }
    
    drawSkeleton(landmarks) {
        const connections = [
            [11, 12], // shoulders
            [11, 13], [13, 15], // left arm
            [12, 14], [14, 16], // right arm
            [11, 23], [12, 24], // torso
            [23, 24], // hips
            [23, 25], [25, 27], // left leg
            [24, 26], [26, 28], // right leg
            [0, 11], [0, 12], // head to shoulders
        ];
        
        this.ctx.drawImage(this.video, 0, 0);
        
        // Draw connections
        this.ctx.strokeStyle = '#22c55e';
        this.ctx.lineWidth = 3;
        
        connections.forEach(([i, j]) => {
            const a = landmarks[i];
            const b = landmarks[j];
            if (a.visibility > 0.5 && b.visibility > 0.5) {
                this.ctx.beginPath();
                this.ctx.moveTo(a.x * this.canvas.width, a.y * this.canvas.height);
                this.ctx.lineTo(b.x * this.canvas.width, b.y * this.canvas.height);
                this.ctx.stroke();
            }
        });
        
        // Draw landmarks
        landmarks.forEach((lm, i) => {
            if (lm.visibility > 0.5) {
                this.ctx.fillStyle = '#4ade80';
                this.ctx.beginPath();
                this.ctx.arc(lm.x * this.canvas.width, lm.y * this.canvas.height, 5, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
    }
    
    setupPreview() {
        const canvas = document.getElementById('pose-result-canvas');
        const slider = document.getElementById('pose-preview-slider');
        
        canvas.width = 400;
        canvas.height = 300;
        
        slider.max = this.frames.length - 1;
        slider.value = 0;
        
        this.currentPreviewFrame = 0;
        this.drawPreviewFrame(0);
    }
    
    drawPreviewFrame(index) {
        if (!this.frames[index]) return;
        
        const canvas = document.getElementById('pose-result-canvas');
        const ctx = canvas.getContext('2d');
        const frame = this.frames[index];
        
        // Clear
        ctx.fillStyle = '#151821';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw stick figure
        const scale = 200;
        const offsetX = canvas.width / 2;
        const offsetY = 50;
        
        const getLandmark = (idx) => {
            const lm = frame.landmarks[idx];
            return {
                x: offsetX + (lm.x - 0.5) * scale,
                y: offsetY + lm.y * scale,
                v: lm.visibility
            };
        };
        
        const connections = [
            [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
            [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
            [24, 26], [26, 28], [0, 11], [0, 12]
        ];
        
        // Draw bones
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        
        connections.forEach(([i, j]) => {
            const a = getLandmark(i);
            const b = getLandmark(j);
            if (a.v > 0.3 && b.v > 0.3) {
                ctx.beginPath();
                ctx.moveTo(a.x, a.y);
                ctx.lineTo(b.x, b.y);
                ctx.stroke();
            }
        });
        
        // Draw joints
        [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28].forEach(idx => {
            const lm = getLandmark(idx);
            if (lm.v > 0.3) {
                ctx.fillStyle = '#4ade80';
                ctx.beginPath();
                ctx.arc(lm.x, lm.y, 6, 0, Math.PI * 2);
                ctx.fill();
            }
        });
        
        // Update slider
        document.getElementById('pose-preview-frame').textContent = `${index + 1} / ${this.frames.length}`;
        document.getElementById('pose-preview-slider').value = index;
    }
    
    togglePreviewPlay() {
        const btn = document.getElementById('pose-preview-play');
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
            btn.textContent = '▶ Play';
        } else {
            btn.textContent = '⏸ Pause';
            this.playPreview();
        }
    }
    
    playPreview() {
        const fps = parseInt(document.getElementById('pose-output-fps').value);
        const frameTime = 1000 / fps;
        let lastTime = 0;
        
        const animate = (time) => {
            if (time - lastTime >= frameTime) {
                this.currentPreviewFrame = (this.currentPreviewFrame + 1) % this.frames.length;
                this.drawPreviewFrame(this.currentPreviewFrame);
                lastTime = time;
            }
            this.animationId = requestAnimationFrame(animate);
        };
        
        this.animationId = requestAnimationFrame(animate);
    }
    
    analyzeSkeletonHierarchy() {
        if (!this.editor || !this.editor.bones) return null;

        const info = { bones: new Map(), order: [], spineLength: 0 };

        let rootBone = null;
        this.editor.bones.forEach((bone) => {
            if (!rootBone && (!bone.parent || !this.editor.bones.has(bone.parent.name))) {
                rootBone = bone;
            }
        });
        if (!rootBone) return null;

        // Measure main-chain length (first child at each level) for scale calibration
        let chainBone = rootBone;
        while (chainBone) {
            let next = null;
            for (const child of chainBone.children) {
                if (this.editor.bones.has(child.name)) { next = child; break; }
            }
            if (!next) break;
            const cp = next.position;
            info.spineLength += Math.sqrt(cp.x * cp.x + cp.y * cp.y + cp.z * cp.z);
            chainBone = next;
        }
        if (info.spineLength === 0) info.spineLength = 0.77;

        // BFS to build per-bone info in hierarchy order
        const queue = [rootBone];
        while (queue.length > 0) {
            const bone = queue.shift();

            let firstBoneChild = null;
            for (const child of bone.children) {
                if (this.editor.bones.has(child.name)) {
                    if (!firstBoneChild) firstBoneChild = child;
                    queue.push(child);
                }
            }

            const orig = this.editor.originalBoneTransforms?.get(bone.name);
            const restRotZ = orig ? orig.rotation.z : bone.rotation.z;

            let childPosAngle = Math.PI / 2;
            let restAngle = restRotZ + childPosAngle;

            if (firstBoneChild) {
                const cx = firstBoneChild.position.x;
                const cy = firstBoneChild.position.y;
                childPosAngle = Math.atan2(cy, cx);
                const cosR = Math.cos(restRotZ);
                const sinR = Math.sin(restRotZ);
                restAngle = Math.atan2(cx * sinR + cy * cosR, cx * cosR - cy * sinR);
            }

            let parentName = null;
            if (bone.parent && this.editor.bones.has(bone.parent.name)) {
                parentName = bone.parent.name;
            }

            info.bones.set(bone.name, { parentName, restAngle, childPosAngle, restRotZ });
            info.order.push(bone.name);
        }

        return info;
    }

    getBoneLandmarkMapping(landmarks) {
        const midHip = {
            x: (landmarks[23].x + landmarks[24].x) / 2,
            y: (landmarks[23].y + landmarks[24].y) / 2,
        };
        const midShoulder = {
            x: (landmarks[11].x + landmarks[12].x) / 2,
            y: (landmarks[11].y + landmarks[12].y) / 2,
        };
        const midNeck = {
            x: (midShoulder.x + landmarks[0].x) / 2,
            y: (midShoulder.y + landmarks[0].y) / 2,
        };

        return {
            'Hips':            { start: midHip, end: midShoulder },
            'Spine':           { start: midHip, end: midShoulder },
            'Spine1':          { start: midHip, end: midShoulder },
            'Spine2':          { start: midHip, end: midShoulder },
            'Neck':            { start: midShoulder, end: midNeck },
            'Head':            { start: midNeck, end: landmarks[0] },
            'LeftShoulder':    { start: midShoulder, end: landmarks[11] },
            'LeftArm':         { start: landmarks[11], end: landmarks[13] },
            'LeftForeArm':     { start: landmarks[13], end: landmarks[15] },
            'RightShoulder':   { start: midShoulder, end: landmarks[12] },
            'RightArm':        { start: landmarks[12], end: landmarks[14] },
            'RightForeArm':    { start: landmarks[14], end: landmarks[16] },
            'LeftUpLeg':       { start: landmarks[23], end: landmarks[25] },
            'LeftLeg':         { start: landmarks[25], end: landmarks[27] },
            'RightUpLeg':      { start: landmarks[24], end: landmarks[26] },
            'RightLeg':        { start: landmarks[26], end: landmarks[28] },
        };
    }

    normalizeAngle(angle) {
        while (angle > Math.PI) angle -= 2 * Math.PI;
        while (angle < -Math.PI) angle += 2 * Math.PI;
        return angle;
    }

    applyToAnimation() {
        if (!this.editor || !this.editor.bones || this.frames.length === 0) {
            console.error('Cannot apply: editor not ready or no frames');
            return;
        }

        this.skeletonInfo = this.analyzeSkeletonHierarchy();
        if (!this.skeletonInfo) {
            console.error('Cannot analyze skeleton hierarchy');
            return;
        }

        this.referenceBodyScale = null;
        this.referenceHipCenter = null;
        this.previousZ = 0;

        const outputFps = parseInt(document.getElementById('pose-output-fps').value);
        const animId = this.editor.createNewAnimation(`Video Capture ${Date.now()}`);

        if (this.editor.currentAnimation) {
            this.editor.currentAnimation.fps = outputFps;
            this.editor.currentAnimation.totalFrames = this.frames.length;
        }

        this.frames.forEach((frame, frameIndex) => {
            const boneTransforms = this.landmarksToBoneTransforms(frame.landmarks, frameIndex);

            Object.entries(boneTransforms).forEach(([boneName, transform]) => {
                if (!this.editor.bones.has(boneName)) return;

                if (!this.editor.keyframes.has(frameIndex)) {
                    this.editor.keyframes.set(frameIndex, new Map());
                }
                this.editor.keyframes.get(frameIndex).set(boneName, {
                    position: transform.position,
                    rotation: transform.rotation,
                    scale: new THREE.Vector3(1, 1, 1),
                });
            });
        });

        this.editor.updateTimeline();
        this.editor.goToFrame(0);
        this.closeModal();
        this.editor.showToast?.(`Imported ${this.frames.length} frames from video!`, 'success');
    }

    landmarksToBoneTransforms(landmarks, frameIndex) {
        if (!this.skeletonInfo) return {};

        const transforms = {};
        const accAngles = {};

        const midHip = {
            x: (landmarks[23].x + landmarks[24].x) / 2,
            y: (landmarks[23].y + landmarks[24].y) / 2,
        };
        const midShoulder = {
            x: (landmarks[11].x + landmarks[12].x) / 2,
            y: (landmarks[11].y + landmarks[12].y) / 2,
        };
        const bodyScale = Math.sqrt(
            (midShoulder.x - midHip.x) ** 2 + (midShoulder.y - midHip.y) ** 2
        );

        // First frame establishes reference scale and position
        if (frameIndex === 0 || !this.referenceBodyScale) {
            this.referenceHipCenter = { x: midHip.x, y: midHip.y };
            this.referenceBodyScale = bodyScale || 0.25;
            const nose = landmarks[0];
            const spine2D = Math.sqrt(
                (nose.x - midHip.x) ** 2 + (nose.y - midHip.y) ** 2
            );
            this.scaleFactor = (this.skeletonInfo.spineLength) / (spine2D || 0.5);
            this.previousZ = 0;
        }

        // Z depth: body appearing smaller → further away (positive Z)
        let rawZ = 0;
        if (this.referenceBodyScale > 0.01 && bodyScale > 0.01) {
            rawZ = (this.referenceBodyScale / bodyScale - 1) * 2.0;
        }
        const z = 0.3 * rawZ + 0.7 * this.previousZ;
        this.previousZ = z;

        // Root position tracks hip movement (X flipped for character-space, Y flipped for 3D-up)
        const deltaX = -(midHip.x - this.referenceHipCenter.x) * this.scaleFactor;
        const deltaY = -(midHip.y - this.referenceHipCenter.y) * this.scaleFactor;

        const rootBoneName = this.skeletonInfo.order[0];
        const rootOrig = this.editor.originalBoneTransforms?.get(rootBoneName);
        const rootBone = this.editor.bones.get(rootBoneName);
        const rootRest = rootOrig ? rootOrig.position : rootBone?.position;

        const rootPos = rootRest
            ? new THREE.Vector3(rootRest.x + deltaX, rootRest.y + deltaY, (rootRest.z || 0) + z)
            : new THREE.Vector3(deltaX, 1 + deltaY, z);

        const mapping = this.getBoneLandmarkMapping(landmarks);

        for (const boneName of this.skeletonInfo.order) {
            const boneInfo = this.skeletonInfo.bones.get(boneName);
            if (!boneInfo) continue;

            const bone = this.editor.bones.get(boneName);
            if (!bone) continue;

            const parentAccAngle = boneInfo.parentName
                ? (accAngles[boneInfo.parentName] ?? 0) : 0;

            // Match bone to landmark segment (exact then partial name match)
            let segment = mapping[boneName] || null;
            if (!segment) {
                const lower = boneName.toLowerCase();
                for (const [mapName, seg] of Object.entries(mapping)) {
                    if (lower.includes(mapName.toLowerCase()) ||
                        mapName.toLowerCase().includes(lower)) {
                        segment = seg;
                        break;
                    }
                }
            }

            if (!segment) {
                accAngles[boneName] = parentAccAngle + boneInfo.restRotZ;
                continue;
            }

            // Target direction (flipped to character-space: -X mirrors left/right, -Y flips up)
            const dx = -(segment.end.x - segment.start.x);
            const dy = -(segment.end.y - segment.start.y);
            const segLen = Math.sqrt(dx * dx + dy * dy);

            if (segLen < 0.001) {
                accAngles[boneName] = parentAccAngle + boneInfo.restRotZ;
                continue;
            }

            const targetAngle = Math.atan2(dy, dx);
            const localRotZ = this.normalizeAngle(targetAngle - parentAccAngle - boneInfo.restAngle);
            accAngles[boneName] = parentAccAngle + boneInfo.restRotZ + localRotZ;

            const halfAngle = localRotZ / 2;
            const quat = new THREE.Quaternion(0, 0, Math.sin(halfAngle), Math.cos(halfAngle));

            const isRoot = !boneInfo.parentName;
            const boneOrig = this.editor.originalBoneTransforms?.get(boneName);
            const boneRest = boneOrig ? boneOrig.position : bone.position;

            transforms[boneName] = {
                rotation: quat,
                position: isRoot
                    ? rootPos.clone()
                    : new THREE.Vector3(boneRest.x, boneRest.y, boneRest.z),
            };
        }

        return transforms;
    }
    
    cleanup() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.frames = [];
        this.currentPreviewFrame = 0;
        
        this.skeletonInfo = null;
        this.referenceBodyScale = null;
        this.referenceHipCenter = null;
        this.previousZ = 0;
        
        document.getElementById('btn-pose-process').disabled = true;
        document.getElementById('pose-progress')?.classList.add('hidden');
    }
}

// Export for use in editor
window.PoseCapture = PoseCapture;


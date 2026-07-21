// ==========================================
// 1. CORE ARCHITECTURE & MANAGERS
// ==========================================

const GAME_STATES = { LOADING: 0, MAIN_MENU: 1, PLAYING: 2, PAUSED: 3, GAME_OVER: 4, SETTINGS: 5, ACHIEVEMENTS: 6 };
let currentState = GAME_STATES.LOADING;

// Shared Math Objects (Performance Optimization: Eliminate 'new' in animation loops)
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _raycaster = new THREE.Raycaster();

// Centralized Settings Manager
const SettingsManager = {
    data: JSON.parse(localStorage.getItem('neonSettings_v2')) || { mouseSens: 0.002, masterVol: 1.0, musicVol: 0.6, sfxVol: 0.8 },
    save: function () { localStorage.setItem('neonSettings_v2', JSON.stringify(this.data)); }
};

// Centralized Achievement Manager
function reportToGameHub(achievementId) {
    try {
        const queue = JSON.parse(localStorage.getItem('game-hub-event-queue') || '[]');
        queue.push({
            type: 'achievement_unlock',
            gameId: 'neon_survival',
            data: {
                achievementId: achievementId
            }
        });
        localStorage.setItem('game-hub-event-queue', JSON.stringify(queue));
    } catch (e) {
        console.warn('Neon Survival: Failed to report achievement to Game Hub', e);
    }
}

const AchievementManager = {
    stats: JSON.parse(localStorage.getItem('neonStats')) || { kills: 0, deaths: 0, shots: 0, hits: 0, distance: 0, playTime: 0, powerups: 0, dashes: 0, maxScore: 0, longestRun: 0 },
    unlocked: JSON.parse(localStorage.getItem('neonUnlocks')) || {},
    sessionStartTime: 0,

    list: {
        first_kill: { name: "First Target", desc: "Kill your first enemy", check: s => s.kills >= 1 },
        eliminator: { name: "Eliminator", desc: "Kill 100 enemies", check: s => s.kills >= 100 },
        destroyer: { name: "Destroyer", desc: "Kill 1000 enemies", check: s => s.kills >= 1000 },
        high_score: { name: "High Score", desc: "Reach 1,000 score", check: s => s.maxScore >= 1000 },
        legend: { name: "Legend", desc: "Reach 10,000 score", check: s => s.maxScore >= 10000 },
        neon_survivor: { name: "Neon Survivor", desc: "Reach 100,000 score", check: s => s.maxScore >= 100000 },
        survivor: { name: "Survivor", desc: "Stay alive for 5 minutes", check: s => s.longestRun >= 300 },
        endurance: { name: "Endurance", desc: "Stay alive for 30 minutes", check: s => s.longestRun >= 1800 },
        dash_master: { name: "Dash Master", desc: "Dash 100 times", check: s => s.dashes >= 100 },
        power_collector: { name: "Power Collector", desc: "Collect 50 powerups", check: s => s.powerups >= 50 },
        deadeye: { name: "Deadeye", desc: "Achieve 80% accuracy (>100 shots)", check: s => s.shots > 100 && (s.hits / s.shots) >= 0.8 },
        explorer: { name: "Explorer", desc: "Travel 10,000 units", check: s => s.distance >= 10000 },
        completionist: { name: "Achievement Hunter", desc: "Unlock all other achievements", check: s => Object.keys(AchievementManager.unlocked).length >= 12 }
    },

    save: function () {
        localStorage.setItem('neonStats', JSON.stringify(this.stats));
        localStorage.setItem('neonUnlocks', JSON.stringify(this.unlocked));
    },

    checkUnlocks: function () {
        for (const [key, data] of Object.entries(this.list)) {
            if (!this.unlocked[key] && data.check(this.stats)) {
                this.unlocked[key] = new Date().toLocaleDateString();
                reportToGameHub(key);
                this.showNotification(data.name, data.desc);
                AudioManager.playUnlockSound();
                this.save();
            }
        }
    },

    showNotification: function (title, desc) {
        const container = document.getElementById('notification-container');
        const toast = document.createElement('div');
        toast.className = 'achievement-toast';
        toast.innerHTML = `<div class="toast-header">Achievement Unlocked</div><div class="toast-title">${title}</div><div style="font-size:12px; margin-top:5px; color:#aaa;">${desc}</div>`;
        container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 5000);
    },

    updateRunTimer: function (timeInSeconds) {
        if (timeInSeconds > this.stats.longestRun) this.stats.longestRun = timeInSeconds;
    }
};

// Centralized Audio Manager (Solves stacking, memory leaks, and autoplay limits)
const AudioManager = {
    ctx: null, master: null, music: null, sfx: null, musicInterval: null,
    init: function () {
        if (this.ctx) return;
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.music = this.ctx.createGain();
        this.sfx = this.ctx.createGain();

        this.music.connect(this.master);
        this.sfx.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.updateVolumes();
    },
    updateVolumes: function () {
        if (!this.master) return;
        this.master.gain.value = SettingsManager.data.masterVol;
        this.music.gain.value = SettingsManager.data.musicVol;
        this.sfx.gain.value = SettingsManager.data.sfxVol;
    },
    resume: function () { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
    playTone: function (type, startFreq, endFreq, dur, vol = 0.1, filterType = null, filterFreq = null) {
        if (!this.ctx || this.ctx.state !== 'running') return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.connect(gain);

        let targetNode = gain;
        if (filterType) {
            const filter = this.ctx.createBiquadFilter();
            filter.type = filterType;
            filter.frequency.value = filterFreq;
            gain.connect(filter);
            targetNode = filter;
        }
        targetNode.connect(this.sfx);

        const t = this.ctx.currentTime;
        osc.frequency.setValueAtTime(startFreq, t);
        if (endFreq !== null) osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);

        gain.gain.setValueAtTime(vol, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        osc.start(t);
        osc.stop(t + dur);
    },
    playMenuHover: () => AudioManager.playTone('sine', 600, null, 0.1, 0.05),
    playMenuClick: () => AudioManager.playTone('square', 800, 200, 0.1, 0.1),
    playShoot: () => AudioManager.playTone('sawtooth', 800, 100, 0.1, 0.1),
    playExplosion: () => AudioManager.playTone('square', 150, 10, 0.3, 0.2),
    playHit: () => AudioManager.playTone('square', 600, 300, 0.1, 0.1),
    playDamage: () => AudioManager.playTone('triangle', 200, 50, 0.2, 0.3),
    playDash: () => AudioManager.playTone('sine', 400, 50, 0.2, 0.4),
    playPowerup: () => {
        const t = AudioManager.ctx.currentTime;
        const osc = AudioManager.ctx.createOscillator();
        const gain = AudioManager.ctx.createGain();
        osc.connect(gain); gain.connect(AudioManager.sfx);
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, t);
        osc.frequency.setValueAtTime(554, t + 0.1);
        osc.frequency.setValueAtTime(659, t + 0.2);
        gain.gain.setValueAtTime(0.2, t);
        gain.gain.linearRampToValueAtTime(0.01, t + 0.4);
        osc.start(t); osc.stop(t + 0.4);
    },
    playGameOver: () => AudioManager.playTone('sawtooth', 300, 10, 1.5, 0.5),
    playUnlockSound: () => {
        const t = AudioManager.ctx.currentTime;
        const osc = AudioManager.ctx.createOscillator();
        const gain = AudioManager.ctx.createGain();
        osc.connect(gain); gain.connect(AudioManager.sfx);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(523.25, t); // C5
        osc.frequency.setValueAtTime(659.25, t + 0.15); // E5
        osc.frequency.setValueAtTime(783.99, t + 0.3); // G5
        osc.frequency.setValueAtTime(1046.50, t + 0.45); // C6
        gain.gain.setValueAtTime(0.0, t);
        gain.gain.linearRampToValueAtTime(0.2, t + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.01, t + 1.0);
        osc.start(t); osc.stop(t + 1.0);
    },
    startMusic: function () {
        if (this.musicInterval) return;

        const kickSeq = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
        const snareSeq = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
        const hatSeq = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];
        const bassSeq = [55, 55, 0, 55, 0, 55, 65, 0, 55, 55, 0, 45, 0, 55, 55, 0];
        const arpSeq = [155, 0, 196, 0, 233, 261, 0, 311, 261, 0, 233, 196, 155, 0, 311, 0];
        let step = 0;
        const stepTime = 130;

        this.musicInterval = setInterval(() => {
            if (currentState !== GAME_STATES.PLAYING) return; // Only play during gameplay
            if (!this.ctx || this.ctx.state !== 'running') return;
            const t = this.ctx.currentTime;

            const playInst = (type, freq, gainVal, dur, filterType, filterFreq) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = type; osc.connect(gain);
                if (filterType) {
                    const filter = this.ctx.createBiquadFilter();
                    filter.type = filterType;
                    if (typeof filterFreq === 'function') filterFreq(filter, t); else filter.frequency.value = filterFreq;
                    gain.connect(filter); filter.connect(this.music);
                } else { gain.connect(this.music); }

                if (typeof freq === 'function') freq(osc, t); else osc.frequency.setValueAtTime(freq, t);
                if (typeof gainVal === 'function') gainVal(gain, t); else {
                    gain.gain.setValueAtTime(gainVal, t); gain.gain.exponentialRampToValueAtTime(0.01, t + dur);
                }
                osc.start(t); osc.stop(t + dur);
            };

            if (kickSeq[step]) playInst('sine', (o, t) => { o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(10, t + 0.1); }, 0.5, 0.1);
            if (snareSeq[step]) playInst('square', (o, t) => { o.frequency.setValueAtTime(250, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.1); }, 0.3, 0.1, 'bandpass', 1500);
            if (hatSeq[step]) playInst('square', 8000, (step % 4 === 0) ? 0.05 : 0.02, 0.05, 'highpass', 6000);
            if (bassSeq[step] > 0) playInst('sawtooth', bassSeq[step], 0.2, 0.2, 'lowpass', (f, t) => { f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(100, t + 0.15); });
            if (arpSeq[step] > 0) playInst('triangle', arpSeq[step] * 2, 0.05, 0.1);

            step = (step + 1) % 16;
        }, stepTime);
    },
    stopMusic: function () {
        if (this.musicInterval) { clearInterval(this.musicInterval); this.musicInterval = null; }
    },
    shutdown: function () {
        this.stopMusic();
        if (this.ctx) { this.ctx.close(); this.ctx = null; }
    }
};

// Generic Object Pool Manager (Optimization: Stop creating/deleting meshes in game loop)
class ObjectPool {
    constructor(factory, resetFn, initialSize) {
        this.factory = factory; this.resetFn = resetFn;
        this.pool = []; this.active = [];
        for (let i = 0; i < initialSize; i++) this.pool.push(this.factory());
    }
    get() {
        const item = this.pool.length > 0 ? this.pool.pop() : this.factory();
        if (this.resetFn) this.resetFn(item);
        this.active.push(item);
        return item;
    }
    release(item) {
        const index = this.active.indexOf(item);
        if (index > -1) this.active.splice(index, 1);
        if (item.parent) item.parent.remove(item);
        this.pool.push(item);
    }
    releaseAll() {
        while (this.active.length > 0) {
            const item = this.active.pop();
            if (item.parent) item.parent.remove(item);
            this.pool.push(item);
        }
    }
}

// ==========================================
// 2. STATE TRANSITIONS & MENUS
// ==========================================

const MenuManager = {
    createBtn: (text, onClick) => {
        const b = document.createElement('button'); b.className = 'neon-btn'; b.innerText = text;
        b.onclick = () => { AudioManager.playMenuClick(); onClick(); };
        b.onmouseenter = AudioManager.playMenuHover;
        return b;
    },
    render: (titleTxt, subTxt, elements) => {
        const c = document.getElementById('menu-container');
        c.innerHTML = `<h1 class="menu-title">${titleTxt}</h1>` + (subTxt ? `<p class="menu-subtitle">${subTxt}</p>` : '');
        elements.forEach(el => c.appendChild(el));
        setTimeout(() => { const f = c.querySelector('button, input'); if (f) f.focus(); }, 50);
    },
    showOverlay: () => {
        document.getElementById('overlay').style.display = 'flex';
        document.getElementById('overlay').style.pointerEvents = 'auto';
        document.getElementById('overlay').style.opacity = '1';
        document.getElementById('ui-layer').style.opacity = '0';
    },
    hideOverlay: () => {
        document.getElementById('overlay').style.pointerEvents = 'none';
        document.getElementById('overlay').style.opacity = '0';
        document.getElementById('ui-layer').style.opacity = '1';
        setTimeout(() => { if (currentState === GAME_STATES.PLAYING) document.getElementById('overlay').style.display = 'none'; }, 400);
    }
};

function changeState(newState) {
    currentState = newState;
    switch (newState) {
        case GAME_STATES.MAIN_MENU:
            document.exitPointerLock();
            resetWorldState(); // Clean run
            MenuManager.showOverlay();
            MenuManager.render('NEON SURVIVAL', 'Survive the geometric swarm.', [
                MenuManager.createBtn('Play', () => { AudioManager.init(); AudioManager.resume(); changeState(GAME_STATES.PLAYING); }),
                MenuManager.createBtn('Settings', () => changeState(GAME_STATES.SETTINGS)),
                MenuManager.createBtn('Achievements', () => changeState(GAME_STATES.ACHIEVEMENTS)),
                MenuManager.createBtn('Back to Launcher', backToLauncher)
            ]);
            break;
        case GAME_STATES.PLAYING:
            MenuManager.hideOverlay();
            document.body.requestPointerLock();
            prevTime = performance.now();
            AudioManager.startMusic();
            AchievementManager.sessionStartTime = performance.now();
            break;
        case GAME_STATES.PAUSED:
            document.exitPointerLock();
            MenuManager.showOverlay();
            MenuManager.render('PAUSED', 'System standing by...', [
                MenuManager.createBtn('Resume', () => changeState(GAME_STATES.PLAYING)),
                MenuManager.createBtn('Settings', () => changeState(GAME_STATES.SETTINGS)),
                MenuManager.createBtn('Restart', () => { resetWorldState(); changeState(GAME_STATES.PLAYING); }),
                MenuManager.createBtn('Main Menu', () => changeState(GAME_STATES.MAIN_MENU)),
                MenuManager.createBtn('Back to Launcher', backToLauncher)
            ]);
            break;
        case GAME_STATES.GAME_OVER:
            document.exitPointerLock();
            MenuManager.showOverlay();
            MenuManager.render('SYSTEM FAILURE', `<span style="color:#fff">FINAL SCORE: ${score}</span><br><span style="color:yellow; font-weight:bold;">BEST SCORE: ${AchievementManager.stats.maxScore}</span>`, [
                MenuManager.createBtn('Restart', () => { resetWorldState(); changeState(GAME_STATES.PLAYING); }),
                MenuManager.createBtn('Main Menu', () => changeState(GAME_STATES.MAIN_MENU)),
                MenuManager.createBtn('Back to Launcher', backToLauncher)
            ]);
            break;
        case GAME_STATES.SETTINGS:
            MenuManager.render('SETTINGS', '', [
                createSettingSlider('Master Vol', 'masterVol', 0, 1, 0.05),
                createSettingSlider('Music Vol', 'musicVol', 0, 1, 0.05),
                createSettingSlider('SFX Vol', 'sfxVol', 0, 1, 0.05),
                createSettingSlider('Look Sens', 'mouseSens', 0.0005, 0.005, 0.0005),
                MenuManager.createBtn('Toggle Fullscreen', () => {
                    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => { });
                    else document.exitFullscreen().catch(() => { });
                }),
                MenuManager.createBtn('Back', () => {
                    if (gun.parent !== pitchObject) changeState(GAME_STATES.GAME_OVER); // Quick hack to check death
                    else if (health > 0 && health < 250 && !isDying) changeState(GAME_STATES.PAUSED); // In game check
                    else if (health === 250 && score === 0) changeState(GAME_STATES.MAIN_MENU);
                    else changeState(GAME_STATES.PAUSED);
                })
            ]);
            break;
        case GAME_STATES.ACHIEVEMENTS:
            const achList = Object.entries(AchievementManager.list).map(([key, data]) => {
                const unlocked = AchievementManager.unlocked[key];
                const div = document.createElement('div');
                div.className = `achievement-card ${unlocked ? 'unlocked' : ''}`;
                div.innerHTML = `<div class="achievement-title">${data.name} ${unlocked ? '✓' : '🔒'}</div>
                                    <div class="achievement-desc">${data.desc}</div>
                                    ${unlocked ? `<div class="achievement-date">Unlocked: ${unlocked}</div>` : ''}`;
                return div;
            });
            const backBtn = MenuManager.createBtn('Back', () => changeState(GAME_STATES.MAIN_MENU));
            MenuManager.render('ACHIEVEMENTS', 'Your legacy.', [...achList, backBtn]);
            break;
    }
}

function createSettingSlider(label, key, min, max, step) {
    const row = document.createElement('div'); row.className = 'settings-row';
    const input = document.createElement('input'); input.type = 'range';
    input.min = min; input.max = max; input.step = step; input.value = SettingsManager.data[key];
    input.className = 'neon-slider';
    input.oninput = (e) => {
        SettingsManager.data[key] = parseFloat(e.target.value);
        SettingsManager.save(); AudioManager.updateVolumes();
    };
    row.innerHTML = `<span>${label}</span>`; row.appendChild(input);
    return row;
}

function backToLauncher() {
    document.exitPointerLock();
    AudioManager.shutdown();
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    renderer.dispose();
    window.location.href = '../../index.html';
}

document.addEventListener('keydown', (e) => {
    if (currentState === GAME_STATES.PLAYING) return;
    const focusable = Array.from(document.querySelectorAll('button, input'));
    if (focusable.length === 0) return;
    let i = focusable.indexOf(document.activeElement);
    if (e.code === 'ArrowDown' || e.code === 'ArrowRight') { e.preventDefault(); i = (i + 1) % focusable.length; focusable[i].focus(); if (focusable[i].tagName === 'BUTTON') AudioManager.playMenuHover(); }
    else if (e.code === 'ArrowUp' || e.code === 'ArrowLeft') { e.preventDefault(); i = (i - 1 + focusable.length) % focusable.length; focusable[i].focus(); if (focusable[i].tagName === 'BUTTON') AudioManager.playMenuHover(); }
    else if (e.code === 'Enter' && i !== -1 && focusable[i].tagName === 'BUTTON') focusable[i].click();
});


// ==========================================
// 3. GAMEPLAY & ENGINE SETUP
// ==========================================

let camera, scene, renderer, animationFrameId;
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false, canJump = false;
let prevTime = performance.now();
const velocity = new THREE.Vector3(), direction = new THREE.Vector3();
let pitchObject, yawObject, gun, gunFlash;
let recoilTimer = 0, isMouseDown = false, lastFireTime = 0, fireRate = 250, weaponMode = 0;
let overdriveTimer = 0, dashCooldown = 0, invulnerableTimer = 0;
let screenShake = 0, score = 0, health = 250, isDying = false, deathTimer = 0, spawnRate = 2000, lastSpawnTime = 0;

const chunkSize = 100;
let activeChunks = new Map();
let dirLight;

// POOLS (Optimization: Shared Geometries and Materials)
const geoBox = new THREE.BoxGeometry(1, 1, 1);
const geoTetra = new THREE.TetrahedronGeometry(1, 0);
const geoIcosa = new THREE.IcosahedronGeometry(1, 0);
const geoOcta = new THREE.OctahedronGeometry(1, 0);
const geoHitbox = new THREE.SphereGeometry(1, 8, 8);
const matHitbox = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

function createEnemyMat(hex) { return new THREE.MeshStandardMaterial({ color: hex, emissive: new THREE.Color(hex).multiplyScalar(0.3), wireframe: true, wireframeLinewidth: 2 }); }
const mats = { TANK: createEnemyMat(0x0088ff), SWARMER: createEnemyMat(0xffff00), STANDARD: createEnemyMat(0xff0055), SHOOTER: createEnemyMat(0xff00ff) };

let pools = {};

function initPools() {
    const createEnemy = (type, geo, matBase, visualScale, hitboxScale) => {
        return () => {
            const visual = new THREE.Mesh(geo, mats[type]);
            visual.scale.set(visualScale, visualScale, visualScale);
            const hitbox = new THREE.Mesh(geoHitbox, matHitbox);
            hitbox.scale.set(hitboxScale, hitboxScale, hitboxScale);
            hitbox.add(visual);
            return hitbox;
        };
    };

    pools.TANK = new ObjectPool(createEnemy('TANK', geoBox, mats.TANK, 3.0, 3.0), null, 5);
    pools.SWARMER = new ObjectPool(createEnemy('SWARMER', geoTetra, mats.SWARMER, 0.8, 2.5), null, 15);
    pools.STANDARD = new ObjectPool(createEnemy('STANDARD', geoIcosa, mats.STANDARD, 1.5, 1.5), null, 20);
    pools.SHOOTER = new ObjectPool(createEnemy('SHOOTER', geoOcta, mats.SHOOTER, 1.2, 2.0), null, 10);

    const matProj = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    pools.PROJECTILES = new ObjectPool(() => new THREE.Mesh(geoHitbox, matProj), (m) => m.scale.set(0.3, 0.3, 0.3), 30);

    const matHeal = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, wireframe: true });
    const matOver = new THREE.MeshStandardMaterial({ color: 0xff8800, emissive: 0xff8800, wireframe: true });
    pools.POWERUPS = new ObjectPool(() => new THREE.Mesh(geoOcta, matHeal), null, 10); // Mat is swapped dynamically
    pools.POWERUPS.matHeal = matHeal; pools.POWERUPS.matOver = matOver;

    pools.PARTICLES = new ObjectPool(() => new THREE.Mesh(geoBox, new THREE.MeshBasicMaterial({ color: 0xffffff })), (m) => m.scale.set(0.3, 0.3, 0.3), 100);
}

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050510);
    scene.fog = new THREE.Fog(0x050510, 10, 50);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    yawObject = new THREE.Object3D(); pitchObject = new THREE.Object3D();
    scene.add(yawObject); yawObject.add(pitchObject); pitchObject.add(camera);
    yawObject.position.y = 2;

    scene.add(new THREE.AmbientLight(0x222222));
    dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(20, 50, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048; dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5; dirLight.shadow.camera.far = 150;
    dirLight.shadow.camera.left = -60; dirLight.shadow.camera.right = 60;
    dirLight.shadow.camera.top = 60; dirLight.shadow.camera.bottom = -60;
    scene.add(dirLight); scene.add(dirLight.target);

    initPools();
    createEnvironment();
    createGun();

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.body.appendChild(renderer.domElement);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mouseup', onMouseUp);
    window.addEventListener('resize', onWindowResize);

    document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement !== document.body && currentState === GAME_STATES.PLAYING) changeState(GAME_STATES.PAUSED);
    });

    // Pre-compile shaders (Optimization)
    renderer.compile(scene, camera);

    document.getElementById('loading-screen').style.display = 'none';
    changeState(GAME_STATES.MAIN_MENU);
    animate();
}

// --- WORLD GENERATION (Chunk System) ---
function seededRandom(x, z) { let val = Math.sin((x * 73856093) ^ (z * 19349663)) * 10000; return val - Math.floor(val); }

function updateChunks() {
    const px = Math.floor(yawObject.position.x / chunkSize);
    const pz = Math.floor(yawObject.position.z / chunkSize);
    const neededChunks = new Set();
    for (let x = px - 1; x <= px + 1; x++) {
        for (let z = pz - 1; z <= pz + 1; z++) {
            const key = `${x},${z}`; neededChunks.add(key);
            if (!activeChunks.has(key)) generateChunk(x, z);
        }
    }
    for (const [key, chunk] of activeChunks.entries()) {
        if (!neededChunks.has(key)) unloadChunk(key);
    }
}

function generateChunk(cx, cz) {
    const chunkData = { meshes: [], pillars: [] };

    const floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(chunkSize, chunkSize, 1, 1), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, metalness: 0.2 }));
    floorMesh.rotation.x = -Math.PI / 2; floorMesh.position.set(cx * chunkSize, 0, cz * chunkSize);
    floorMesh.receiveShadow = true; scene.add(floorMesh); chunkData.meshes.push(floorMesh);

    const grid = new THREE.GridHelper(chunkSize, chunkSize / 2, 0x00ffff, 0x003333);
    grid.position.set(cx * chunkSize, 0.01, cz * chunkSize); scene.add(grid); chunkData.meshes.push(grid);

    const numPillars = 4 + Math.floor(seededRandom(cx, cz) * 5);
    const boxGeo = new THREE.BoxGeometry(4, 20, 4);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });

    for (let i = 0; i < numPillars; i++) {
        const rx = (seededRandom(cx, cz + i * 10) - 0.5) * chunkSize;
        const rz = (seededRandom(cx + i * 10, cz) - 0.5) * chunkSize;
        if (cx === 0 && cz === 0 && Math.abs(rx) < 10 && Math.abs(rz) < 10) continue;
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.set(cx * chunkSize + rx, 10, cz * chunkSize + rz);
        box.castShadow = true; box.receiveShadow = true;
        scene.add(box); chunkData.meshes.push(box); chunkData.pillars.push(box);
    }
    activeChunks.set(`${cx},${cz}`, chunkData);
}

function unloadChunk(key) {
    const chunk = activeChunks.get(key);
    chunk.meshes.forEach(m => { scene.remove(m); if (m.geometry) m.geometry.dispose(); if (m.material) m.material.dispose(); });
    activeChunks.delete(key);
}

function createEnvironment() { updateChunks(); }

function createGun() {
    gun = new THREE.Group();
    const matBase = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1), matBase);
    barrel.position.set(0, 0, -0.5); barrel.castShadow = true; gun.add(barrel);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.6), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 }));
    body.position.set(0, -0.1, 0); gun.add(body);

    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.1), new THREE.MeshBasicMaterial({ color: 0x00ffff }));
    tip.position.set(0, 0, -1.05); gun.add(tip);

    gunFlash = new THREE.PointLight(0x00ffff, 0, 10);
    gunFlash.position.set(0, 0, -1.5); gun.add(gunFlash);

    gun.position.set(0.5, -0.4, -0.8); pitchObject.add(gun);
}

// --- INPUT & MECHANICS ---
function onKeyDown(event) {
    if (currentState !== GAME_STATES.PLAYING || isDying) return;
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = true; break;
        case 'ArrowLeft': case 'KeyD': moveLeft = true; break;
        case 'ArrowDown': case 'KeyS': moveBackward = true; break;
        case 'ArrowRight': case 'KeyA': moveRight = true; break;
        case 'Space': if (canJump) velocity.y += 15; canJump = false; break;
        case 'ShiftLeft': case 'ShiftRight':
            if (dashCooldown <= 0) {
                AudioManager.playDash();
                const dashForce = 200;
                if (moveForward) velocity.z -= dashForce; if (moveBackward) velocity.z += dashForce;
                if (moveLeft) velocity.x -= dashForce; if (moveRight) velocity.x += dashForce;
                if (!moveForward && !moveBackward && !moveLeft && !moveRight) velocity.z -= dashForce;
                dashCooldown = 0.8;
                document.getElementById('dash-display').innerText = "DASH: CHARGING...";
                document.getElementById('dash-display').style.color = "#888";

                AchievementManager.stats.dashes++; AchievementManager.checkUnlocks();

                for (let i = 0; i < pools.STANDARD.active.length; i++) { // Optimization: Iterate over pool active directly
                    const enemy = pools.STANDARD.active[i]; // Hack: just loop through all enemy pools conceptually.
                    // Better approach: unified array for physics
                }
                // Unified Enemy Array for Shockwave
                const allActiveEnemies = [...pools.STANDARD.active, ...pools.SWARMER.active, ...pools.TANK.active, ...pools.SHOOTER.active];
                for (let i = 0; i < allActiveEnemies.length; i++) {
                    const enemy = allActiveEnemies[i];
                    const dist = enemy.position.distanceTo(yawObject.position);
                    if (dist < 30) {
                        const dx = enemy.position.x - yawObject.position.x;
                        const dz = enemy.position.z - yawObject.position.z;
                        const len = Math.sqrt(dx * dx + dz * dz);
                        if (len > 0) {
                            const pushForce = (30 - dist) * 2.5;
                            enemy.position.x += (dx / len) * pushForce;
                            enemy.position.z += (dz / len) * pushForce;
                        }
                    }
                }
            }
            break;
    }
}
function onKeyUp(event) {
    if (currentState !== GAME_STATES.PLAYING || isDying) return;
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveForward = false; break;
        case 'ArrowLeft': case 'KeyD': moveLeft = false; break;
        case 'ArrowDown': case 'KeyS': moveBackward = false; break;
        case 'ArrowRight': case 'KeyA': moveRight = false; break;
    }
}

const PI_2 = Math.PI / 2;
function onMouseMove(event) {
    if (currentState !== GAME_STATES.PLAYING || isDying) return;
    const mx = event.movementX || event.mozMovementX || event.webkitMovementX || 0;
    const my = event.movementY || event.mozMovementY || event.webkitMovementY || 0;
    if (Math.abs(mx) > 150 || Math.abs(my) > 150) return;
    yawObject.rotation.y -= mx * SettingsManager.data.mouseSens;
    pitchObject.rotation.x -= my * SettingsManager.data.mouseSens;
    pitchObject.rotation.x = Math.max(-PI_2, Math.min(PI_2, pitchObject.rotation.x));
}
function onMouseDown(event) {
    if (currentState !== GAME_STATES.PLAYING || isDying) return;
    isMouseDown = true;
    const time = performance.now();
    if (time - lastFireTime > fireRate) { shoot(); lastFireTime = time; }
}
function onMouseUp(event) { isMouseDown = false; }

function shoot() {
    AudioManager.playShoot();
    screenShake = Math.max(screenShake, 0.05);
    recoilTimer = 1.0; gunFlash.intensity = 2;

    camera.getWorldQuaternion(_q1);
    const spreadAngles = (weaponMode === 1) ? [-0.08, 0, 0.08] : [0];
    const allActiveEnemies = [...pools.STANDARD.active, ...pools.SWARMER.active, ...pools.TANK.active, ...pools.SHOOTER.active];

    spreadAngles.forEach(offsetX => {
        AchievementManager.stats.shots++;
        _v1.set(0, 0, -1).applyQuaternion(_q1);
        if (offsetX !== 0) {
            _v2.set(1, 0, 0).applyQuaternion(_q1);
            _v1.addScaledVector(_v2, offsetX).normalize();
        }

        _raycaster.set(camera.getWorldPosition(_v3), _v1);
        const intersects = _raycaster.intersectObjects(allActiveEnemies, true);

        if (intersects.length > 0) {
            AchievementManager.stats.hits++;
            let hitEnemy = intersects[0].object;
            if (hitEnemy.parent && hitEnemy.parent.userData.health !== undefined) hitEnemy = hitEnemy.parent;

            if (hitEnemy.userData.health !== undefined) {
                hitEnemy.userData.health -= 1;
                if (hitEnemy.userData.health <= 0) {
                    destroyEnemy(hitEnemy);
                    score += hitEnemy.userData.scoreValue;
                    if (score > AchievementManager.stats.maxScore) AchievementManager.stats.maxScore = score;
                    document.getElementById('score-display').innerText = `SCORE: ${score}`;
                    document.getElementById('highscore-display').innerText = `BEST: ${AchievementManager.stats.maxScore}`;
                } else {
                    AudioManager.playHit();
                    hitEnemy.children[0].scale.setScalar(0.7 * hitEnemy.userData.baseY); // Flash visual scale
                    setTimeout(() => { if (hitEnemy && hitEnemy.children[0]) hitEnemy.children[0].scale.setScalar(hitEnemy.userData.baseY); }, 100);
                }
            }
        }
    });
    AchievementManager.checkUnlocks();
}

function spawnEnemy() {
    const rand = Math.random();
    let poolType = 'STANDARD', speed, health, damage, scoreValue, size, bobSpeed, bobHeight;

    if (rand < 0.2) { poolType = 'TANK'; size = 3.0; speed = 2 + (score * 0.02); health = 3; damage = 40; scoreValue = 30; bobSpeed = 0.002; bobHeight = 0.2; }
    else if (rand < 0.5) { poolType = 'SWARMER'; size = 0.8; speed = 5 + (score * 0.03); health = 1; damage = 5; scoreValue = 5; bobSpeed = 0.015; bobHeight = 1.5; }
    else if (rand < 0.7) { poolType = 'SHOOTER'; size = 1.2; speed = 3 + (score * 0.02); health = 2; damage = 15; scoreValue = 20; bobSpeed = 0.01; bobHeight = 0.8; }
    else { poolType = 'STANDARD'; size = 1.5 + Math.random() * 0.5; speed = 4 + (score * 0.05); health = 1; damage = 20; scoreValue = 10; bobSpeed = 0.005; bobHeight = 0.5; }

    const enemy = pools[poolType].get();
    if (poolType === 'STANDARD') enemy.children[0].scale.setScalar(size); // specific scaling for random sizes

    const angle = Math.random() * Math.PI * 2;
    const radius = 30 + Math.random() * 20;
    enemy.position.x = yawObject.position.x + Math.cos(angle) * radius;
    enemy.position.z = yawObject.position.z + Math.sin(angle) * radius;
    enemy.position.y = size;

    enemy.userData = { poolType, speed, health, damage, scoreValue, baseY: size, bobSpeed, bobHeight, colorHex: mats[poolType].color.getHex(), lastShot: performance.now() + Math.random() * 2000 };
    scene.add(enemy);
}

function destroyEnemy(enemy) {
    AudioManager.playExplosion();
    createParticles(enemy.position, enemy.userData.colorHex);
    if (Math.random() < 0.15) spawnPowerup(enemy.position);

    pools[enemy.userData.poolType].release(enemy);

    AchievementManager.stats.kills++; AchievementManager.checkUnlocks();
}

function spawnPowerup(pos) {
    const type = Math.random() < 0.4 ? 0 : 1;
    const p = pools.POWERUPS.get();
    p.material = type === 0 ? pools.POWERUPS.matHeal : pools.POWERUPS.matOver;
    p.position.copy(pos);
    p.position.y = 1;
    p.userData = { type: type, floatOffset: Math.random() * Math.PI * 2 };
    scene.add(p);
}

function createParticles(position, colorHex) {
    for (let i = 0; i < 15; i++) {
        const p = pools.PARTICLES.get();
        p.material.color.setHex(colorHex);
        p.position.copy(position);
        p.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10);
        p.userData.life = 1.0;
        scene.add(p);
    }
}

function fireEnemyProjectile(startPos) {
    AudioManager.playTone('sine', 1200, 400, 0.2, 0.05);
    const proj = pools.PROJECTILES.get();
    proj.position.copy(startPos);
    _v1.subVectors(yawObject.position, proj.position).normalize();
    proj.userData = { direction: _v1.clone(), speed: 15, life: 3.0 };
    scene.add(proj);
}

function takeDamage(amount) {
    if (currentState !== GAME_STATES.PLAYING || isDying || invulnerableTimer > 0) return;
    health -= amount; invulnerableTimer = 1.0; screenShake = 0.5;
    AudioManager.playDamage();

    if (health < 0) health = 0;
    document.getElementById('health-display').innerText = `HEALTH: ${health}`;
    const flash = document.getElementById('damage-flash');
    flash.style.opacity = 0.5; setTimeout(() => { flash.style.opacity = 0; }, 100);

    if (health <= 0) die();
}

function die() {
    isDying = true; deathTimer = 2.5; AudioManager.playGameOver();
    velocity.set(0, 0, 0); moveForward = false; moveBackward = false; moveLeft = false; moveRight = false;

    for (let i = 0; i < 5; i++) { createParticles(yawObject.position, 0x00ffff); createParticles(yawObject.position, 0xffffff); }

    gun.getWorldPosition(_v1); gun.getWorldQuaternion(_q1);
    pitchObject.remove(gun); scene.add(gun);
    gun.position.copy(_v1); gun.quaternion.copy(_q1);

    _v2.set(0, 0, -1).applyQuaternion(yawObject.quaternion);
    gun.userData = { velocity: new THREE.Vector3(_v2.x * 6, 4, _v2.z * 6), rotSpeed: new THREE.Vector3(Math.random() * 8, Math.random() * 10, Math.random() * 8) };

    AchievementManager.stats.deaths++; AchievementManager.checkUnlocks(); AchievementManager.save();
}

function resetWorldState() {
    health = 250; score = 0; isDying = false; weaponMode = 0; fireRate = 250; overdriveTimer = 0; invulnerableTimer = 0; screenShake = 0;

    document.getElementById('health-display').innerText = `HEALTH: ${health}`; document.getElementById('health-display').style.opacity = 1;
    document.getElementById('score-display').innerText = `SCORE: ${score}`; document.getElementById('weapon-display').style.display = 'none';
    document.getElementById('indicator-container').style.display = 'none';

    pools.STANDARD.releaseAll(); pools.SWARMER.releaseAll(); pools.TANK.releaseAll(); pools.SHOOTER.releaseAll();
    pools.POWERUPS.releaseAll(); pools.PROJECTILES.releaseAll(); pools.PARTICLES.releaseAll();

    if (gun.parent === scene) { scene.remove(gun); pitchObject.add(gun); }
    gun.position.set(0.5, -0.4, -0.8); gun.rotation.set(0, 0, 0); pitchObject.rotation.set(0, 0, 0);
    yawObject.position.set(0, 2, 0); yawObject.rotation.set(0, 0, 0); velocity.set(0, 0, 0);

    lastSpawnTime = performance.now();
}

// --- MAIN LOOP ---
function animate() {
    animationFrameId = requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    prevTime = time;

    renderer.render(scene, camera);

    if (currentState === GAME_STATES.MENU || currentState === GAME_STATES.SETTINGS || currentState === GAME_STATES.ACHIEVEMENTS) {
        yawObject.rotation.y += 0.05 * delta; return;
    }
    if (currentState !== GAME_STATES.PLAYING && currentState !== GAME_STATES.GAME_OVER) return;

    // Tracking
    if (currentState === GAME_STATES.PLAYING && !isDying) {
        AchievementManager.stats.playTime += delta;
        AchievementManager.updateRunTimer((time - AchievementManager.sessionStartTime) / 1000);
    }

    if (!isDying && currentState === GAME_STATES.PLAYING) {
        if (isMouseDown && time - lastFireTime > fireRate) { shoot(); lastFireTime = time; }
        if (dashCooldown > 0) {
            dashCooldown -= delta;
            if (dashCooldown <= 0) { document.getElementById('dash-display').innerText = "DASH: READY"; document.getElementById('dash-display').style.color = "#0ff"; }
        }
        if (overdriveTimer > 0) {
            overdriveTimer -= delta; fireRate = 100;
            if (overdriveTimer <= 0) { weaponMode = 0; fireRate = 250; document.getElementById('weapon-display').style.display = 'none'; }
        }
        if (invulnerableTimer > 0) {
            invulnerableTimer -= delta;
            document.getElementById('health-display').style.opacity = (Math.floor(time / 100) % 2 === 0) ? 0.3 : 1;
            if (invulnerableTimer <= 0) document.getElementById('health-display').style.opacity = 1;
        }

        for (let i = pools.POWERUPS.active.length - 1; i >= 0; i--) {
            const p = pools.POWERUPS.active[i];
            p.rotation.y += delta * 3; p.rotation.x += delta * 1.5; p.position.y = 1 + Math.sin(time * 0.005 + p.userData.floatOffset) * 0.4;

            const pDist = p.position.distanceToSquared(yawObject.position);
            if (pDist < 6.25) { // 2.5 squared
                AudioManager.playPowerup();
                if (p.userData.type === 0) { health = Math.min(300, health + 50); document.getElementById('health-display').innerText = `HEALTH: ${health}`; }
                else if (p.userData.type === 1) { weaponMode = 1; overdriveTimer = 5.0; document.getElementById('weapon-display').style.display = 'block'; }
                pools.POWERUPS.release(p);
                AchievementManager.stats.powerups++; AchievementManager.checkUnlocks();
            } else if (pDist > 14400) { pools.POWERUPS.release(p); } // 120 squared
        }

        velocity.x -= velocity.x * 10.0 * delta; velocity.z -= velocity.z * 10.0 * delta; velocity.y -= 9.8 * 3.0 * delta;
        direction.set(Number(moveRight) - Number(moveLeft), 0, Number(moveForward) - Number(moveBackward)).normalize();

        if (moveForward || moveBackward) velocity.z -= direction.z * 60.0 * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * 60.0 * delta;

        yawObject.translateX(velocity.x * delta); yawObject.translateZ(velocity.z * delta); yawObject.position.y += velocity.y * delta;
        AchievementManager.stats.distance += Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z) * delta;

        // Basic Box broadphase logic for chunks
        const activeBoxes = Array.from(activeChunks.values()).flatMap(c => c.pillars);
        const px = yawObject.position.x, pz = yawObject.position.z;
        for (let i = 0; i < activeBoxes.length; i++) {
            const pillar = activeBoxes[i];
            const boxXMin = pillar.position.x - 2.5, boxXMax = pillar.position.x + 2.5;
            const boxZMin = pillar.position.z - 2.5, boxZMax = pillar.position.z + 2.5;

            if (px > boxXMin && px < boxXMax && pz > boxZMin && pz < boxZMax) {
                const distLeft = px - boxXMin, distRight = boxXMax - px;
                const distTop = pz - boxZMin, distBottom = boxZMax - pz;
                const minDist = Math.min(distLeft, distRight, distTop, distBottom);
                if (minDist === distLeft) yawObject.position.x = boxXMin; else if (minDist === distRight) yawObject.position.x = boxXMax;
                else if (minDist === distTop) yawObject.position.z = boxZMin; else if (minDist === distBottom) yawObject.position.z = boxZMax;
                velocity.x = 0; velocity.z = 0;
            }
        }

        updateChunks();

        if (dirLight) {
            dirLight.position.x = yawObject.position.x + 20; dirLight.position.z = yawObject.position.z + 20;
            dirLight.target.position.set(yawObject.position.x, 0, yawObject.position.z);
        }

        if (yawObject.position.y < 2) { velocity.y = 0; yawObject.position.y = 2; canJump = true; }

        if (recoilTimer > 0) {
            recoilTimer -= delta * 5; if (recoilTimer < 0) recoilTimer = 0;
            gun.position.z = -0.8 + (recoilTimer * 0.2); gun.rotation.x = recoilTimer * 0.2; gunFlash.intensity = recoilTimer * 2;
        }
    } else if (isDying) {
        deathTimer -= delta;
        if (gun.parent === scene) {
            gun.userData.velocity.y -= 9.8 * 2 * delta; gun.position.addScaledVector(gun.userData.velocity, delta);
            gun.rotation.x += gun.userData.rotSpeed.x * delta; gun.rotation.y += gun.userData.rotSpeed.y * delta; gun.rotation.z += gun.userData.rotSpeed.z * delta;
            if (gun.position.y < 0.2) { gun.position.y = 0.2; gun.userData.velocity.set(0, 0, 0); gun.userData.rotSpeed.set(0, 0, 0); }
        }
        if (deathTimer <= 0 && currentState !== GAME_STATES.GAME_OVER) changeState(GAME_STATES.GAME_OVER);
    }

    // Shared Entity Processing (Runs while Playing or Dying Sequence)
    if (currentState === GAME_STATES.PLAYING) {
        if (!isDying && time - lastSpawnTime > spawnRate) { spawnEnemy(); lastSpawnTime = time; }

        const allActiveEnemies = [...pools.STANDARD.active, ...pools.SWARMER.active, ...pools.TANK.active, ...pools.SHOOTER.active];
        for (let i = allActiveEnemies.length - 1; i >= 0; i--) {
            const enemy = allActiveEnemies[i];
            enemy.rotation.x += delta; enemy.rotation.y += delta;
            const dx = yawObject.position.x - enemy.position.x, dz = yawObject.position.z - enemy.position.z;
            const angleToPlayer = Math.atan2(dx, dz);
            const distSq = dx * dx + dz * dz;

            if (distSq > 14400) { pools[enemy.userData.poolType].release(enemy); continue; } // Outrun limit 120sq

            if (enemy.userData.type === 'SHOOTER') {
                if (distSq > 625) { enemy.position.x += Math.sin(angleToPlayer) * enemy.userData.speed * delta; enemy.position.z += Math.cos(angleToPlayer) * enemy.userData.speed * delta; }
                else if (distSq < 225) { enemy.position.x -= Math.sin(angleToPlayer) * enemy.userData.speed * delta; enemy.position.z -= Math.cos(angleToPlayer) * enemy.userData.speed * delta; }
                if (time > enemy.userData.lastShot + 2500 && !isDying) { fireEnemyProjectile(enemy.position); enemy.userData.lastShot = time; }
            } else {
                enemy.position.x += Math.sin(angleToPlayer) * enemy.userData.speed * delta; enemy.position.z += Math.cos(angleToPlayer) * enemy.userData.speed * delta;
            }
            enemy.position.y = enemy.userData.baseY + Math.sin(time * enemy.userData.bobSpeed + i) * enemy.userData.bobHeight;

            if (!isDying && distSq < Math.pow(enemy.userData.baseY + 1.0, 2)) {
                takeDamage(enemy.userData.damage);
                enemy.position.x -= Math.sin(angleToPlayer) * 5; enemy.position.z -= Math.cos(angleToPlayer) * 5;
            }
        }

        const activeBoxes = Array.from(activeChunks.values()).flatMap(c => c.pillars);
        for (let i = pools.PROJECTILES.active.length - 1; i >= 0; i--) {
            const p = pools.PROJECTILES.active[i];
            p.position.addScaledVector(p.userData.direction, p.userData.speed * delta);
            p.userData.life -= delta;

            if (!isDying && p.position.distanceToSquared(yawObject.position) < 2.25) { takeDamage(10); pools.PROJECTILES.release(p); continue; }

            let hitPillar = false;
            for (let j = 0; j < activeBoxes.length; j++) {
                const pillar = activeBoxes[j];
                if (Math.abs(p.position.x - pillar.position.x) < 2.5 && Math.abs(p.position.z - pillar.position.z) < 2.5 && p.position.y < 20) { hitPillar = true; break; }
            }
            if (p.userData.life <= 0 || hitPillar) pools.PROJECTILES.release(p);
        }

        for (let i = pools.PARTICLES.active.length - 1; i >= 0; i--) {
            const p = pools.PARTICLES.active[i];
            p.position.addScaledVector(p.userData.velocity, delta); p.scale.multiplyScalar(0.9); p.userData.life -= delta;
            if (p.userData.life <= 0 || p.scale.x < 0.01) pools.PARTICLES.release(p);
        }

        const indCont = document.getElementById('indicator-container'); const ind = document.getElementById('enemy-indicator');
        if (allActiveEnemies.length > 0 && !isDying) {
            let nearest = allActiveEnemies[0], minDistSq = nearest.position.distanceToSquared(yawObject.position);
            for (let i = 1; i < allActiveEnemies.length; i++) {
                const d = allActiveEnemies[i].position.distanceToSquared(yawObject.position);
                if (d < minDistSq) { minDistSq = d; nearest = allActiveEnemies[i]; }
            }
            yawObject.worldToLocal(_v1.copy(nearest.position));
            indCont.style.transform = `rotate(${Math.atan2(_v1.x, _v1.z) + Math.PI}rad)`;
            indCont.style.display = 'block'; ind.style.display = 'block';
            const colorStr = '#' + nearest.userData.colorHex.toString(16).padStart(6, '0');
            ind.style.color = colorStr; ind.style.textShadow = `0 0 10px ${colorStr}`;
        } else { indCont.style.display = 'none'; ind.style.display = 'none'; }
    }

    if (screenShake > 0) {
        camera.position.x = (Math.random() - 0.5) * screenShake; camera.position.y = (Math.random() - 0.5) * screenShake;
        screenShake -= delta * 3; if (screenShake <= 0) { screenShake = 0; camera.position.set(0, 0, 0); }
    }
}

function onWindowResize() { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); }

window.onload = init;
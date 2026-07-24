// --- GAME CONSTANTS ---
const PLAYER_HEIGHT_STANDING = 1.7;
const PLAYER_HEIGHT_CROUCH = 1.0;
const PLAYER_SPEED = 2.5;
const SPRINT_SPEED = 5.0;
const JUMP_FORCE = 15.0;
const GRAVITY = 25.0;

const GUN_DAMAGE = 25;
const GUN_FIRE_RATE = 0.5; 
const CLIP_SIZE = 30;
const RELOAD_TIME = 1.5;

const PRECISION_COOLDOWN_TIME = 40.0;
const CRITICAL_COOLDOWN_TIME = 10.0;
const CRITICAL_WINDOW_MS = 300; // 0.3 second window to shoot after uncrouching

// ==========================================
// PROFILE-AWARE STORAGE
// ==========================================
// Read the active Game Hub profile ID from the URL query parameter.
// This ensures each Game Hub profile has its own isolated save data.

const PROFILE_ID = new URLSearchParams(location.search).get('profile') || 'default';

/**
 * Get a profile-specific localStorage key for Tactical Drone Defense data.
 * @param {string} key - The base key name (e.g., 'save')
 * @returns {string} The profile-scoped key
 */
function profileKey(key) {
    return `tdd_${PROFILE_ID}_${key}`;
}

/**
 * Default save data structure
 */
const DEFAULT_SAVE_DATA = {
    highScore: 0,
    highestWave: 1,
    totalKills: 0,
    gamesPlayed: 0,
    totalShots: 0,
    totalHits: 0,
    lastPlayed: null
};

/**
 * Load save data from localStorage
 * @returns {Object} Save data object
 */
function loadSaveData() {
    const saveString = localStorage.getItem(profileKey('save'));
    if (saveString) {
        try {
            return JSON.parse(saveString);
        } catch (e) {
            console.warn('Tactical Drone Defense: Failed to parse save data, using defaults');
            return { ...DEFAULT_SAVE_DATA };
        }
    }
    return { ...DEFAULT_SAVE_DATA };
}

/**
 * Save data to localStorage
 * @param {Object} data - Save data object
 */
function saveData(data) {
    try {
        localStorage.setItem(profileKey('save'), JSON.stringify(data));
    } catch (e) {
        console.warn('Tactical Drone Defense: Failed to save data', e);
    }
}

// Load save data on startup
let currentSaveData = loadSaveData();

// --- AUDIO SYSTEM ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgmOscillators = [];
let bgmGain = null;

function initMusic() {
    if (bgmGain) return; 
    
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    bgmGain = audioCtx.createGain();
    bgmGain.gain.value = 0.15; 
    bgmGain.connect(audioCtx.destination);
    const osc1 = audioCtx.createOscillator(); osc1.type = 'sawtooth'; osc1.frequency.value = 55; osc1.connect(bgmGain); osc1.start();
    bgmOscillators.push(osc1);
    const osc2 = audioCtx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = 110; 
    const lfo = audioCtx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.5; 
    const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 50; lfo.connect(lfoGain.gain);
    osc2.connect(bgmGain); osc2.start(); lfo.start();
    bgmOscillators.push(osc2);
}

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;

    if (type === 'shoot') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(120, now); osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.2);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    } 
    else if (type === 'hit') {
        osc.type = 'square'; osc.frequency.setValueAtTime(200, now); osc.frequency.exponentialRampToValueAtTime(50, now + 0.1);
        gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    }
    else if (type === 'crit') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(800, now); osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
        gain.gain.setValueAtTime(0.3, now); gain.gain.linearRampToValueAtTime(0, now + 0.1);
        osc.start(now); osc.stop(now + 0.1);
    }
    else if (type === 'heal') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(300, now); osc.frequency.linearRampToValueAtTime(600, now + 0.3);
        gain.gain.setValueAtTime(0.3, now); gain.gain.linearRampToValueAtTime(0, now + 0.3);
        osc.start(now); osc.stop(now + 0.3);
    }
    else if (type === 'empty') {
        osc.type = 'triangle'; osc.frequency.setValueAtTime(800, now);
        gain.gain.setValueAtTime(0.1, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        osc.start(now); osc.stop(now + 0.05);
    }
    else if (type === 'reload') {
        osc.type = 'sine'; osc.frequency.setValueAtTime(400, now); osc.frequency.linearRampToValueAtTime(600, now + 0.2);
        gain.gain.setValueAtTime(0.1, now); gain.gain.linearRampToValueAtTime(0, now + 0.4);
        osc.start(now); osc.stop(now + 0.4);
    }
    else if (type === 'explosion') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now); osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.5);
        gain.gain.setValueAtTime(0.5, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        osc.start(now); osc.stop(now + 0.5);
    }
    else if (type === 'enemyShot') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    }
}

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020); 
scene.fog = new THREE.FogExp2(0x202020, 0.015); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// --- CONTROLS ---
const controls = {
    isLocked: false,
    getObject: function() { return camera; }
};

const pitchObject = new THREE.Object3D();
pitchObject.add(camera);
const yawObject = new THREE.Object3D();
yawObject.position.y = PLAYER_HEIGHT_STANDING;
yawObject.add(pitchObject);
scene.add(yawObject);

const onMouseMove = (event) => {
    if (!controls.isLocked) return;
    yawObject.rotation.y -= event.movementX * 0.002;
    pitchObject.rotation.x -= event.movementY * 0.002;
    pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObject.rotation.x));
};

document.addEventListener('mousemove', onMouseMove, false);

// --- MENU SYSTEM ---
let menuState = 'MAIN';
function showMenu(state) {
    menuState = state;
    document.getElementById('menu-main').style.display = state === 'MAIN' ? 'flex' : 'none';
    document.getElementById('menu-pause').style.display = state === 'PAUSED' ? 'flex' : 'none';
    document.getElementById('menu-gameover').style.display = state === 'GAMEOVER' ? 'flex' : 'none';
}

function requestLock() {
    try {
        const lockPromise = document.body.requestPointerLock();
        if (lockPromise !== undefined) {
            lockPromise.catch(e => {
                console.warn("Pointer lock failed:", e);
                if (e.name === 'SecurityError') {
                    showMessage("BROWSER COOLDOWN: TRY AGAIN IN 1S");
                }
            });
        }
    } catch (e) {
        console.warn(e);
    }
}

document.getElementById('play-btn').addEventListener('click', () => {
    requestLock();
    
    lastTime = performance.now();
    initMusic();
    
    // Check if this is a respawn click
    if (playerHealth <= 0) {
        resetGame();
    }
});

// Pause Menu Buttons
document.getElementById('resume-btn').addEventListener('click', () => {
    requestLock();
});

document.getElementById('abort-pause-btn').addEventListener('click', () => {
    showMenu('MAIN');
    playerHealth = 0; // Forces resetGame() on next DEPLOY
});

// Game Over Menu Buttons
document.getElementById('deploy-back-btn').addEventListener('click', () => {
    resetGame();
    requestLock();
});

document.getElementById('abort-gameover-btn').addEventListener('click', () => {
    showMenu('MAIN');
    playerHealth = 0; // Ensures resetGame runs next time DEPLOY is clicked
});

// Launcher Return Buttons
const returnToLauncher = () => {
    window.location.href = '../../index.html';
};
document.getElementById('launcher-main-btn').addEventListener('click', returnToLauncher);
document.getElementById('launcher-pause-btn').addEventListener('click', returnToLauncher);
document.getElementById('launcher-gameover-btn').addEventListener('click', returnToLauncher);

document.addEventListener('pointerlockchange', () => {
    controls.isLocked = document.pointerLockElement === document.body;
    document.getElementById('blocker').style.display = controls.isLocked ? 'none' : 'flex';
    
    if(controls.isLocked) {
        lastTime = performance.now();
    } else {
        if (playerHealth > 0) {
            showMenu('PAUSED');
        } else {
            showMenu('GAMEOVER'); // Forces Game Over state explicitly if dead
        }
    }
});

// --- GAME STATE ---
let lastTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let moveState = { forward: false, backward: false, left: false, right: false };
let canJump = false;

// Control States
let isCrouching = false; 
let isSprinting = false;
let lastWPressTime = 0;
let precisionCooldown = 0;
let precisionActive = false;
let criticalCooldown = 0;
let lastUncrouchTime = 0;

let isFiring = false;
let currentCameraHeight = PLAYER_HEIGHT_STANDING;

let playerHealth = 100;
let ammo = CLIP_SIZE;
let totalAmmo = 120;
let isReloading = false;
let lastShotTime = 0;
let score = 0;
let wave = 1;

// Persistence Tracking
let totalKills = 0;
let shotsFired = 0;
let shotsHit = 0;

// --- ASSETS & WORLD ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3); 
scene.add(ambientLight);

function createCeilingLight(x, z) {
    const light = new THREE.PointLight(0xffaa55, 1, 40);
    light.position.set(x, 14, z);
    light.castShadow = true;
    scene.add(light);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 2), new THREE.MeshBasicMaterial({color: 0xffaa55}));
    mesh.position.set(x, 14.5, z);
    scene.add(mesh);
}
createCeilingLight(0, 0); createCeilingLight(20, 20); createCeilingLight(-20, -20); createCeilingLight(20, -20); createCeilingLight(-20, 20);

const floorCanvas = document.createElement('canvas'); floorCanvas.width = 512; floorCanvas.height = 512;
const ctx = floorCanvas.getContext('2d'); ctx.fillStyle = '#444444'; ctx.fillRect(0, 0, 512, 512);
for(let i=0; i<20; i++) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; const r = Math.random() * 50; ctx.beginPath(); ctx.arc(Math.random()*512, Math.random()*512, r, 0, Math.PI*2); ctx.fill(); }
const floorTexture = new THREE.CanvasTexture(floorCanvas); floorTexture.wrapS = THREE.RepeatWrapping; floorTexture.wrapT = THREE.RepeatWrapping; floorTexture.repeat.set(20, 20);
const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.8, metalness: 0.2 });
const floorGeo = new THREE.PlaneGeometry(100, 100);
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

const wallMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
function createWall(x, y, z, w, h, d) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
}
createWall(0, 7.5, -50, 100, 15, 2); createWall(0, 7.5, 50, 100, 15, 2); createWall(-50, 7.5, 0, 2, 15, 100); createWall(50, 7.5, 0, 2, 15, 100); createWall(0, 15, 0, 100, 1, 100);

const obstacles = [];
const barrelGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.5, 16);
const barrelMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.5, metalness: 0.4 });
const barrelRimMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });

function createBarrel(x, z) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(barrelGeo, barrelMat); body.castShadow = true; body.receiveShadow = true; group.add(body);
    const rim1 = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.1, 16), barrelRimMat); rim1.position.y = 0.6; group.add(rim1);
    const rim2 = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.1, 16), barrelRimMat); rim2.position.y = -0.6; group.add(rim2);
    group.position.set(x, 0.75, z); group.isBarrel = true; 
    scene.add(group); obstacles.push(group);
    return group;
}

for(let i=0; i<30; i++) {
    const x = (Math.random() - 0.5) * 80; const z = (Math.random() - 0.5) * 80;
    if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;
    createBarrel(x, z);
    if (Math.random() > 0.5) createBarrel(x + 1, z);
    if (Math.random() > 0.7) { const b = createBarrel(x + 0.5, z + 0.5); b.position.y = 2.25; }
}

// --- WEAPONS ---
const gunGroup = new THREE.Group();
const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.8 });
const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.5), gunMat);
const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), gunMat);
gunBarrel.rotation.x = Math.PI / 2; gunBarrel.position.z = -0.4; gunBarrel.position.y = 0.05;
const holoBase = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.1), gunMat); holoBase.position.set(0, 0.09, -0.1);
const holoLens = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), new THREE.MeshBasicMaterial({color: 0x00ff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide}));
holoLens.position.set(0, 0.12, -0.1);
gunGroup.add(gunBody, gunBarrel, holoBase, holoLens); gunGroup.position.set(0.3, -0.25, -0.4);
const muzzleLight = new THREE.PointLight(0xffaa00, 0, 10); muzzleLight.position.set(0, 0.1, -0.8); gunGroup.add(muzzleLight);
pitchObject.add(gunGroup);

let recoilAmount = 0;

// --- ENEMY SYSTEM ---
const enemies = [];
const enemyBullets = [];
const particles = [];

function createEnemyGun() {
    const group = new THREE.Group();
    const matBlack = new THREE.MeshStandardMaterial({color: 0x1a1a1a});
    const matDark = new THREE.MeshStandardMaterial({color: 0x333333});
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.3), matBlack); group.add(receiver);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5), matBlack);
    barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.3; barrel.position.y = 0.02; group.add(barrel);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.25), matDark);
    stock.position.z = 0.25; stock.position.y = -0.02; group.add(stock);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.08), matBlack);
    mag.rotation.x = 0.2; mag.position.y = -0.12; mag.position.z = -0.1; group.add(mag);
    return group;
}

function createLimb(w, h, d, color, x, y, z) {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 }));
    mesh.position.y = -h / 2; 
    group.add(mesh);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(w+0.02, 0.15, d+0.02), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    hand.position.y = -h - 0.075; 
    group.add(hand);
    group.position.set(x, y, z);
    return { group, hand }; 
}

function createHumanoid(type) {
    const root = new THREE.Group();
    const color = type === 'soldier' ? 0x2e7d32 : 0x29b6f6;
    root.scale.set(1.2, 1.2, 1.2);
    
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), new THREE.MeshStandardMaterial({ color: color }));
    torso.position.y = 1.0; root.add(torso);

    const headGroup = new THREE.Group(); headGroup.position.y = 1.55;
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: color }));
    headGroup.add(headMesh);
    const visorColor = type === 'soldier' ? 0x00ff00 : 0x00ffff;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: visorColor }));
    visor.position.set(0, 0, 0.16); headGroup.add(visor);
    root.add(headGroup);

    const armL = createLimb(0.15, 0.6, 0.15, color, -0.35, 1.3, 0); 
    const armR = createLimb(0.15, 0.6, 0.15, color, 0.35, 1.3, 0);
    const legL = createLimb(0.2, 0.7, 0.2, 0x111111, -0.15, 0.65, 0); 
    const legR = createLimb(0.2, 0.7, 0.2, 0x111111, 0.15, 0.65, 0);

    root.add(armL.group, armR.group, legL.group, legR.group);

    let gunMesh = null;
    if (type === 'soldier') {
        gunMesh = createEnemyGun();
        gunMesh.rotation.x = Math.PI / 2; gunMesh.position.set(0, -0.05, 0.1);
        armR.hand.add(gunMesh);
        
        armR.group.rotation.x = -1.5; armL.group.rotation.x = -1.5; armL.group.rotation.y = 0.5;
    } else if (type === 'controller') {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5), new THREE.MeshStandardMaterial({color: 0xaaaaaa}));
        ant.position.set(0.1, 0.3, 0); headGroup.add(ant);
        const light = new THREE.PointLight(0x00ffff, 2, 8); light.position.set(0, 1.5, 0); root.add(light);
        
        const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.05), new THREE.MeshStandardMaterial({color: 0x222222}));
        tablet.rotation.x = -Math.PI / 2; tablet.position.y = 0.1;
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.52), new THREE.MeshBasicMaterial({color: 0x00ffff}));
        screen.position.z = 0.03; tablet.add(screen);
        armL.hand.add(tablet);
        
        armL.group.rotation.x = -0.8; armR.group.rotation.x = -0.8;
    }

    return { root, armL: armL.group, armR: armR.group, legL: legL.group, legR: legR.group, torso, head: headGroup, light: root.children.find(c => c.isPointLight), gun: gunMesh };
}

function createDrone(enraged) {
    const group = new THREE.Group();
    const color = enraged ? 0x00ffff : 0xff0000;
    const droneGeo = new THREE.SphereGeometry(0.8, 16, 16);
    const droneMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.2, metalness: 0.5, emissive: color, emissiveIntensity: enraged ? 2.0 : 0.5 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    
    const body = new THREE.Mesh(droneGeo, droneMat);
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4), eyeMat);
    eye.rotation.x = Math.PI / 2; eye.position.z = 0.6;
    
    group.add(body); group.add(eye);
    
    const spikeGeo = new THREE.ConeGeometry(0.1, 0.5);
    const spikeMat = new THREE.MeshStandardMaterial({color: 0x333333});
    for(let i=0; i<4; i++) {
        const s = new THREE.Mesh(spikeGeo, spikeMat);
        s.position.x = (i%2 === 0 ? 1 : -1) * 0.6; s.position.y = (i < 2 ? 1 : -1) * 0.6; s.lookAt(0,0,0);
        group.add(s);
    }
    const light = new THREE.PointLight(color, 4, 15);
    group.add(light);
    return { root: group, body: body, eye: eye, light: light };
}

function createHealthBar(parentGroup) {
    const barContainer = new THREE.Group();
    const bgGeo = new THREE.PlaneGeometry(1, 0.15);
    const bgMat = new THREE.MeshBasicMaterial({ color: 0x330000 });
    const bg = new THREE.Mesh(bgGeo, bgMat);
    const fgGeo = new THREE.PlaneGeometry(1, 0.15);
    fgGeo.translate(0.5, 0, 0); 
    const fgMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    const fg = new THREE.Mesh(fgGeo, fgMat);
    fg.position.x = -0.5; 
    fg.scale.x = 1; 
    barContainer.add(bg);
    barContainer.add(fg);
    barContainer.position.y = 2.5; 
    parentGroup.add(barContainer);
    return fg;
}

function spawnEnemy(forceType = null, forcePos = null) {
    let type = forceType;
    if (!type) {
        const r = Math.random();
        if (r < 0.2 && wave > 1) type = 'controller';
        else if (r < 0.6) type = 'soldier';
        else type = 'drone';
    }

    let enemyGroup = new THREE.Group();
    let rig = null;
    let droneData = null;

    if (type === 'drone') {
        droneData = createDrone(false);
        enemyGroup.add(droneData.root);
    } else {
        rig = createHumanoid(type);
        enemyGroup.add(rig.root);
    }

    let hp = 50, spd = 3;
    if (type === 'soldier') { hp = 80; spd = 4; }
    if (type === 'controller') { hp = 120; spd = 3.5; }
    if (type === 'drone') { hp = 40; spd = 6; }
    
    const maxHp = hp + (wave * 10);
    const hpBarMesh = createHealthBar(enemyGroup);

    if (forcePos) {
        enemyGroup.position.copy(forcePos);
    } else {
        if (type === 'controller') {
            let valid = false, attempts = 0;
            while(!valid && attempts < 20) {
                if (obstacles.length > 0) {
                    const obs = obstacles[Math.floor(Math.random() * obstacles.length)];
                    const angle = Math.random() * Math.PI * 2; const dist = 1.5; 
                    enemyGroup.position.x = obs.position.x + Math.cos(angle) * dist;
                    enemyGroup.position.z = obs.position.z + Math.sin(angle) * dist;
                    enemyGroup.position.y = 0;
                    if (!checkEnemyCollision(enemyGroup.position)) valid = true;
                } else {
                    enemyGroup.position.set((Math.random()-0.5)*40, 0, (Math.random()-0.5)*40); valid = true;
                }
                attempts++;
            }
            if (!valid) enemyGroup.position.set(0, 0, -30);
        } else {
            let attempts = 0, valid = false;
            while(!valid && attempts < 20) {
                const angle = Math.random() * Math.PI * 2; const dist = 25 + Math.random() * 20;
                const x = Math.cos(angle) * dist; const z = Math.sin(angle) * dist;
                enemyGroup.position.set(x, type==='drone'?2:0, z);
                if(!checkEnemyCollision(enemyGroup.position)) valid = true;
                attempts++;
            }
        }
    }

    enemyGroup.userData = {
        type: type,
        maxHealth: maxHp, health: maxHp, speed: spd,
        state: 'chase',
        id: Math.random(),
        shootTimer: Math.random() * 2,
        rig: rig,
        droneData: droneData,
        hpBar: hpBarMesh
    };

    scene.add(enemyGroup);
    enemies.push(enemyGroup);
}

function createEnemyBullet(pos, dir) {
    // 3D Cylinder Projectile
    const geo = new THREE.CylinderGeometry(0.05, 0.05, 0.4);
    const mat = new THREE.MeshBasicMaterial({color: 0xffff00});
    const mesh = new THREE.Mesh(geo, mat);
    
    // Align cylinder with direction
    mesh.position.copy(pos);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    
    scene.add(mesh);
    enemyBullets.push({
        mesh: mesh,
        velocity: dir.normalize().multiplyScalar(40), // Increased Speed (40)
        life: 3.0
    });
    playSound('enemyShot');
}

function createExplosion(pos, color=0xffaa00) {
    playSound('explosion');
    for(let i=0; i<15; i++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: color }));
        mesh.position.copy(pos);
        scene.add(mesh);
        particles.push({ mesh, vel: new THREE.Vector3((Math.random()-0.5)*10, (Math.random()-0.5)*10, (Math.random()-0.5)*10), life: 0.8 });
    }
}

// Calculates the height of the obstacle below the player's current XZ coordinates to determine if they can land on it
function getGroundHeight(x, z, feetY) {
    let maxH = 0;
    for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        const dist = Math.sqrt(Math.pow(x - o.position.x, 2) + Math.pow(z - o.position.z, 2));
        if (dist < 1.2) { 
            const barrelTop = o.position.y + 0.75;
            if (feetY >= barrelTop - 0.3) { 
                if (barrelTop > maxH) maxH = barrelTop;
            }
        }
    }
    return maxH;
}

function checkCollision(position, radius = 0.5, feetY = -999) {
    if (position.x < -48 || position.x > 48 || position.z < -48 || position.z > 48) return true;
    for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        const barrelTop = o.position.y + 0.75;
        
        // Exclude barrel from solid horizontal collision if entity is above it
        if (feetY !== -999) {
            if (feetY >= barrelTop - 0.2) continue;
        } else {
            if (position.y > barrelTop) continue; // For bullets/projectiles traveling over obstacles
        }
        
        const dist = Math.sqrt(Math.pow(position.x - o.position.x, 2) + Math.pow(position.z - o.position.z, 2));
        if (dist < (radius + 0.7)) return true; 
    }
    return false;
}
function checkEnemyCollision(pos) { return checkCollision(pos, 0.8, 0); }

const onKeyDown = (event) => {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': 
            const now = performance.now();
            if (!moveState.forward && (now - lastWPressTime < 300)) {
                isSprinting = true;
            }
            lastWPressTime = now;
            moveState.forward = true; 
            break;
        case 'ArrowLeft': case 'KeyA': moveState.left = true; break;
        case 'ArrowDown': case 'KeyS': moveState.backward = true; break;
        case 'ArrowRight': case 'KeyD': moveState.right = true; break;
        case 'ShiftLeft': case 'ShiftRight': 
            // Allow crouching anytime
            isCrouching = true; 
            break;
        case 'KeyZ':
            if (precisionCooldown <= 0) precisionActive = true;
            break;
        case 'Space': if (canJump && !isCrouching) { velocity.y += JUMP_FORCE; canJump = false; } break;
        case 'KeyR': reload(); break;
    }
};

const onKeyUp = (event) => {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveState.forward = false; isSprinting = false; break;
        case 'ArrowLeft': case 'KeyA': moveState.left = false; break;
        case 'ArrowDown': case 'KeyS': moveState.backward = false; break;
        case 'ArrowRight': case 'KeyD': moveState.right = false; break;
        case 'ShiftLeft': case 'ShiftRight': 
            isCrouching = false;
            if (criticalCooldown <= 0) {
                lastUncrouchTime = performance.now(); // Start critical window
            }
            break;
    }
};
 
document.addEventListener('keydown', onKeyDown);
document.addEventListener('keyup', onKeyUp);
 
document.addEventListener('mousedown', () => {
    if (!controls.isLocked) return;
    isFiring = true;
});

document.addEventListener('mouseup', () => {
    if (!controls.isLocked) return;
    isFiring = false;
});

function resetGame() {
    // Reset Vars
    playerHealth = 100;
    ammo = CLIP_SIZE;
    totalAmmo = 120;
    isReloading = false;
    score = 0;
    wave = 1;
    precisionCooldown = 0;
    precisionActive = false;
    criticalCooldown = 0;
    lastUncrouchTime = 0;
    
    // Reset tracking
    totalKills = 0;
    shotsFired = 0;
    shotsHit = 0;
    
    // Reset Position AND fully reset Camera Angles
    yawObject.position.set(0, PLAYER_HEIGHT_STANDING, 0);
    yawObject.rotation.set(0, 0, 0); 
    pitchObject.rotation.set(0, 0, 0);
    velocity.set(0,0,0);
    
    // Clear Enemies & Bullets
    enemies.forEach(e => scene.remove(e));
    enemies.length = 0;
    enemyBullets.forEach(b => scene.remove(b.mesh));
    enemyBullets.length = 0;
    particles.forEach(p => scene.remove(p.mesh));
    particles.length = 0;
    
    // Respawn Initial
    spawnEnemy('soldier', new THREE.Vector3(0, 0.9, -20));
    spawnEnemy('drone', new THREE.Vector3(-10, 2, -15));
    spawnEnemy('controller'); 
    
    updateHUD(); // Ensure UI reflects the reset before game unpauses
}

function updateHUD() {
    document.getElementById('ammo-count').innerText = `${ammo} / ${totalAmmo}`;
    document.getElementById('health-count').innerText = Math.ceil(playerHealth);
    const hpPct = Math.max(0, playerHealth);
    const bar = document.getElementById('health-fill');
    bar.style.width = `${hpPct}%`;
    bar.style.backgroundColor = hpPct > 50 ? '#4caf50' : (hpPct > 25 ? '#ffeb3b' : '#f44336');
    document.getElementById('wave-num').innerText = wave;
    
    const modeBox = document.getElementById('mode-box');
    if (precisionActive) {
        modeBox.innerText = "PRECISION: ACTIVE (10x DMG)";
        modeBox.style.color = "#00ff00";
    } else if (precisionCooldown > 0) {
        modeBox.innerText = `PRECISION: COOLDOWN ${Math.ceil(precisionCooldown)}s`;
        modeBox.style.color = "#ff0000";
    } else {
        modeBox.innerText = "PRECISION: READY (PRESS Z)";
        modeBox.style.color = "#ffff00";
    }

    const critBox = document.getElementById('crit-box');
    if (criticalCooldown > 0) {
        critBox.innerText = `CRITICAL: COOLDOWN ${Math.ceil(criticalCooldown)}s`;
        critBox.style.color = "#ff0000";
    } else {
        const timeSinceUncrouch = performance.now() - lastUncrouchTime;
        if (!isCrouching && lastUncrouchTime > 0 && timeSinceUncrouch < CRITICAL_WINDOW_MS) {
            critBox.innerText = "CRITICAL: FIRE NOW!";
            critBox.style.color = "#ffaa00";
        } else {
            critBox.innerText = "CRITICAL: READY";
            critBox.style.color = "#ffff00";
        }
    }
    
    const radarText = document.getElementById('radar-text');
    if (enemies.length > 0) {
        let minDist = 999;
        let nearestIsController = false;

        enemies.forEach(e => {
            const d = e.position.distanceTo(yawObject.position);
            if (d < minDist) {
                minDist = d;
                if (e.userData.type === 'controller') nearestIsController = true;
            }
        });

        radarText.innerText = `CONTACT: ${Math.floor(minDist)}m`;
        if (nearestIsController) radarText.style.color = '#00ffff'; 
        else if (minDist < 10) radarText.style.color = '#ff0000'; 
        else radarText.style.color = '#ffaa00'; 
    } else {
        radarText.innerText = "AREA CLEAR";
        radarText.style.color = '#00ff00';
    }
}
 
function showMessage(text) {
    const el = document.getElementById('messages'); el.innerText = text; el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 2000);
}

function reload() {
    if (isReloading || ammo === CLIP_SIZE || totalAmmo <= 0) return;
    isReloading = true; playSound('reload');
    setTimeout(() => {
        const take = Math.min(CLIP_SIZE - ammo, totalAmmo);
        ammo += take; totalAmmo -= take; if (totalAmmo === 0) totalAmmo = 60; 
        isReloading = false; updateHUD();
    }, RELOAD_TIME * 1000);
}

function shoot() {
    if (isReloading || ammo <= 0) { playSound('empty'); reload(); return; }
    if (performance.now() - lastShotTime < GUN_FIRE_RATE * 1000) return;
    lastShotTime = performance.now();
    ammo--; updateHUD(); playSound('shoot');
    shotsFired++;

    recoilAmount += 0.05; gunGroup.position.z += 0.15;
    
    // COOLDOWN TRIGGERS
    let isPrecisionShot = false;
    let isCriticalShot = false;

    if (precisionActive) {
        isPrecisionShot = true; // Was using buff
        precisionActive = false;
        precisionCooldown = PRECISION_COOLDOWN_TIME; // Start cooldown
    } else if (!isCrouching && criticalCooldown <= 0 && lastUncrouchTime > 0 && (performance.now() - lastUncrouchTime < CRITICAL_WINDOW_MS)) {
        isCriticalShot = true; // Was using crit
        criticalCooldown = CRITICAL_COOLDOWN_TIME; // Start crit cooldown
        lastUncrouchTime = 0; // Consume the window
    }
    
    muzzleLight.intensity = 3; setTimeout(() => { muzzleLight.intensity = 0; }, 50);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    let hitObject = null;

    for (let i = 0; i < intersects.length; i++) {
        if (intersects[i].object.isMesh && intersects[i].object !== gunBody) { hitObject = intersects[i]; break; }
    }

    const startPos = new THREE.Vector3(); gunGroup.getWorldPosition(startPos);
    startPos.add(new THREE.Vector3(0, 0.05, -0.6).applyQuaternion(pitchObject.quaternion).applyQuaternion(yawObject.quaternion));
    let endPos = new THREE.Vector3();

    if (hitObject) {
        endPos.copy(hitObject.point);
        let obj = hitObject.object;
        while(obj.parent && obj.parent !== scene) obj = obj.parent;
        
        if (obj.userData && obj.userData.health) {
            let dmg = GUN_DAMAGE;
            // Check if Buff applies (was valid at start of function call)
            if (isPrecisionShot) { 
                dmg *= 10; playSound('crit'); 
                document.getElementById('crosshair').style.transform = 'translate(-50%, -50%) scale(1.5)';
                setTimeout(()=> document.getElementById('crosshair').style.transform = 'translate(-50%, -50%) scale(1)', 100);
            } else if (isCriticalShot) {
                dmg *= 2; playSound('crit'); 
                document.getElementById('crosshair').style.transform = 'translate(-50%, -50%) scale(1.3)';
                setTimeout(()=> document.getElementById('crosshair').style.transform = 'translate(-50%, -50%) scale(1)', 100);
                showMessage("CRITICAL HIT! (2x DMG)");
            } else {
                playSound('hit');
            }
            
            obj.userData.health -= dmg;
            const pct = Math.max(0, obj.userData.health / obj.userData.maxHealth);
            if (obj.userData.hpBar) { obj.userData.hpBar.scale.x = pct; obj.userData.hpBar.material.color.setHex(pct > 0.5 ? 0x00ff00 : 0xff0000); }
            
            if(obj.userData.type === 'drone') {
                const mat = obj.userData.droneData.body.material;
                mat.emissive.setHex(0xffffff); setTimeout(()=>mat.emissive.setHex(mat.color.getHex()), 50);
            } else {
                const body = obj.userData.rig.torso;
                body.material.color.setHex(0xffffff); setTimeout(()=>body.material.color.setHex(obj.userData.type==='soldier'?0x2e7d32:0x29b6f6), 50);
            }

            if (obj.userData.health <= 0) {
                // Prevent accidental heal from killing enemy AFTER we've just died
                if (obj.userData.type === 'soldier' && Math.random() < 0.4 && playerHealth > 0) { 
                    playerHealth = Math.min(100, playerHealth + 20); 
                    playSound('heal'); 
                    showMessage("HEALED +20"); 
                }
                createExplosion(obj.position, (obj.userData.type==='drone')?0xffaa00:(obj.userData.type==='soldier'?0x00ff00:0x00ffff));
                scene.remove(obj); enemies.splice(enemies.indexOf(obj), 1); score += 10;
                totalKills++;
                shotsHit++;
                
                if (enemies.length === 0) {
                    wave++; showMessage(`WAVE ${wave} INCOMING`);
                    
                    // Save on wave completion
                    currentSaveData.highestWave = Math.max(currentSaveData.highestWave, wave);
                    currentSaveData.totalKills += totalKills;
                    currentSaveData.totalShots += shotsFired;
                    currentSaveData.totalHits += shotsHit;
                    currentSaveData.lastPlayed = new Date().toISOString();
                    saveData(currentaveData);
                    
                    setTimeout(() => {
                        if (wave % 3 === 0) spawnEnemy('controller');
                        const count = 2 + Math.ceil(wave * 1.5);
                        for(let k=0; k < count; k++) spawnEnemy();
                    }, 3000);
                }
            } else {
                shotsHit++;
            }
        } else {
            const spark = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({color: 0xaaaaaa}));
            spark.position.copy(hitObject.point); scene.add(spark); particles.push({mesh: spark, vel: new THREE.Vector3(0,0,0), life: 0.1});
        }
    } else raycaster.ray.at(50, endPos);

    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([startPos, endPos]), new THREE.LineBasicMaterial({ color: isCrouching ? 0x00ffff : 0xffff00 }));
    scene.add(line); setTimeout(() => scene.remove(line), 40);
}

function takeDamage(amount) {
    // Short circuit if already dead so menus/logic don't glitch out
    if (playerHealth <= 0) return; 
    
    playerHealth -= amount; 
    updateHUD();
    
    document.getElementById('damage-overlay').style.opacity = 0.8;
    setTimeout(() => { document.getElementById('damage-overlay').style.opacity = 0; }, 300);
    
    if (playerHealth <= 0) {
        showMenu('GAMEOVER');
        document.exitPointerLock();
        document.getElementById('blocker').style.display = 'flex';
        
        // Save on game over
        currentSaveData.highScore = Math.max(currentSaveData.highScore, score);
        currentSaveData.highestWave = Math.max(currentSaveData.highestWave, wave);
        currentSaveData.totalKills += totalKills;
        currentSaveData.totalShots += shotsFired;
        currentSaveData.totalHits += shotsHit;
        currentSaveData.gamesPlayed++;
        currentSaveData.lastPlayed = new Date().toISOString();
        saveData(currentSaveData);
    }
}

function animate() {
    requestAnimationFrame(animate);
    if (!controls.isLocked) return;
    updateHUD();

    const time = performance.now();
    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    if (isFiring) shoot();
    if (precisionCooldown > 0) precisionCooldown -= delta;
    if (criticalCooldown > 0) criticalCooldown -= delta;

    velocity.x -= velocity.x * 10.0 * delta; velocity.z -= velocity.z * 10.0 * delta; velocity.y -= GRAVITY * delta;
    direction.z = Number(moveState.forward) - Number(moveState.backward);
    direction.x = Number(moveState.right) - Number(moveState.left);
    direction.normalize();

    let speed = isCrouching ? 0 : (isSprinting ? SPRINT_SPEED : PLAYER_SPEED);
    let targetH = isCrouching ? PLAYER_HEIGHT_CROUCH : PLAYER_HEIGHT_STANDING;
    let targetFOV = isCrouching ? 25 : 75;
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFOV, delta * 5); camera.updateProjectionMatrix();

    // Lerp the camera offset instead of absolute Y position to allow jumping
    currentCameraHeight = THREE.MathUtils.lerp(currentCameraHeight, targetH, delta * 10);
    
    if (moveState.forward || moveState.backward) velocity.z -= direction.z * speed * 100.0 * delta;
    if (moveState.left || moveState.right) velocity.x += direction.x * speed * 100.0 * delta;
    
    // Extract feet position
    let feetY = yawObject.position.y - currentCameraHeight;

    // XZ Movement and collision
    const oldPos = yawObject.position.clone();
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawObject.quaternion); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawObject.quaternion); right.y = 0; right.normalize();
    const dz = -velocity.z * delta; const dx = velocity.x * delta;
    
    yawObject.position.x += (forward.x * dz) + (right.x * dx);
    if (checkCollision(yawObject.position, 0.5, feetY)) yawObject.position.x = oldPos.x;
    yawObject.position.z += (forward.z * dz) + (right.z * dx);
    if (checkCollision(yawObject.position, 0.5, feetY)) yawObject.position.z = oldPos.z;

    // Vertical movement and landing on obstacles
    feetY += velocity.y * delta;
    const floorHeight = getGroundHeight(yawObject.position.x, yawObject.position.z, feetY);

    if (feetY <= floorHeight) { 
        velocity.y = 0; 
        feetY = floorHeight; 
        canJump = true; 
    } else {
        canJump = false; // Player is falling
    }
    
    // Apply composite final Y position
    yawObject.position.y = feetY + currentCameraHeight;

    if (recoilAmount > 0) recoilAmount = Math.max(0, recoilAmount - delta);
    if (gunGroup.position.z > -0.4) gunGroup.position.z -= delta * 2;
    if (isReloading) gunGroup.rotation.x = THREE.MathUtils.lerp(gunGroup.rotation.x, -Math.PI/4, delta * 5);
    else gunGroup.rotation.x = THREE.MathUtils.lerp(gunGroup.rotation.x, 0, delta * 10);
    
    if ((moveState.forward || moveState.backward || moveState.left || moveState.right) && !isCrouching) {
        gunGroup.position.x = 0.3 + Math.sin(time * 0.01) * 0.02; gunGroup.position.y = -0.25 + Math.abs(Math.cos(time * 0.01)) * 0.02;
    } else {
        gunGroup.position.x = THREE.MathUtils.lerp(gunGroup.position.x, 0.3, delta * 5);
        gunGroup.position.y = THREE.MathUtils.lerp(gunGroup.position.y, -0.25, delta * 5);
    }

    const controllersActive = enemies.some(e => e.userData.type === 'controller');

    enemies.forEach(enemy => {
        const type = enemy.userData.type;
        const dist = enemy.position.distanceTo(yawObject.position);
        if (enemy.userData.hpBar) enemy.userData.hpBar.parent.lookAt(camera.position);

        if (type === 'drone') {
            enemy.lookAt(yawObject.position);
            const dd = enemy.userData.droneData;
            dd.root.position.y = 2 + Math.sin(time * 0.005 + enemy.userData.id) * 0.2;
            if (controllersActive) {
                dd.body.material.color.setHex(0x00ffff); dd.body.material.emissive.setHex(0x00ffff); dd.body.material.emissiveIntensity = 4.0;
                dd.light.color.setHex(0x00ffff); dd.light.intensity = 6.0;
                enemy.position.x += (Math.random()-0.5)*0.2;
                const dir = new THREE.Vector3().subVectors(yawObject.position, enemy.position).normalize();
                const nextPos = enemy.position.clone().add(dir.multiplyScalar((enemy.userData.speed + 8) * delta));
                if(!checkEnemyCollision(nextPos)) enemy.position.copy(nextPos);
                if (dist < 4) takeDamage(20 * delta); 
            } else {
                dd.body.material.color.setHex(0xff0000); dd.body.material.emissive.setHex(0xff0000); dd.body.material.emissiveIntensity = 0.5;
                dd.light.color.setHex(0xff0000); dd.light.intensity = 1.0;
                const dir = new THREE.Vector3().subVectors(yawObject.position, enemy.position).normalize();
                const nextPos = enemy.position.clone().add(dir.multiplyScalar((enemy.userData.speed - 1) * delta));
                if(!checkEnemyCollision(nextPos)) enemy.position.copy(nextPos);
                if (dist < 4) takeDamage(5 * delta); 
            }
        } 
        else if (type === 'soldier') {
            enemy.lookAt(yawObject.position);
            let isMoving = false;
            
            if (enemy.userData.shootTimer > 0 && dist < 20) {
                let bestCover = null; let minCoverDist = 999;
                for(let o of obstacles) { const d = enemy.position.distanceTo(o.position); if (d < minCoverDist) { minCoverDist = d; bestCover = o; } }
                if (bestCover && minCoverDist < 10) {
                    const coverDir = new THREE.Vector3().subVectors(bestCover.position, yawObject.position).normalize();
                    const coverPos = bestCover.position.clone().add(coverDir.multiplyScalar(2.0));
                    if (enemy.position.distanceTo(coverPos) > 0.5) {
                        const moveDir = new THREE.Vector3().subVectors(coverPos, enemy.position).normalize();
                        enemy.lookAt(coverPos); 
                        const nextPos = enemy.position.clone().add(moveDir.multiplyScalar(enemy.userData.speed * delta));
                        if(!checkEnemyCollision(nextPos)) { enemy.position.copy(nextPos); isMoving = true; }
                    }
                }
            } else if (dist > 15) {
                const dir = new THREE.Vector3().subVectors(yawObject.position, enemy.position).normalize(); dir.y = 0; 
                const nextPos = enemy.position.clone().add(dir.multiplyScalar(enemy.userData.speed * delta));
                if(!checkEnemyCollision(nextPos)) { enemy.position.copy(nextPos); isMoving = true; }
            }

            const rig = enemy.userData.rig;
            // IMPROVED DUCK: Rotate Legs Back + Lower Body
            if (enemy.userData.shootTimer > 0 && !isMoving) {
                // Lower
                rig.torso.position.y = 0.6; rig.head.position.y = 1.15;
                rig.armL.position.y = 0.9; rig.armR.position.y = 0.9;
                // Rotate Legs (Kneel)
                rig.legL.rotation.x = -0.8; rig.legR.rotation.x = 0.8;
                // Face Player logic (handled by lookAt above, but refine here if needed)
                enemy.lookAt(yawObject.position); // Always face player when in cover
                rig.armR.rotation.x = -1.57; // Aim at player
            } else {
                // Stand
                rig.torso.position.y = 1.0; rig.head.position.y = 1.55;
                rig.armL.position.y = 1.3; rig.armR.position.y = 1.3;
                rig.legL.rotation.x = 0; rig.legR.rotation.x = 0;
            }

            if (isMoving) {
                const s = 10; rig.legL.rotation.x = Math.sin(time*0.01*s)*0.8; rig.legR.rotation.x = Math.sin(time*0.01*s + Math.PI)*0.8;
                rig.armL.rotation.x = Math.sin(time*0.01*s + Math.PI)*0.5; rig.armR.rotation.x = -1.0 + Math.sin(time*0.01*s)*0.4;
            } else if (enemy.userData.shootTimer <= 0) {
                 // Idle / Aiming (not in cover)
                rig.legL.rotation.x = 0; rig.legR.rotation.x = 0;
                rig.armL.rotation.x = -1.5; rig.armL.rotation.y = 0.5; rig.armR.rotation.x = -1.5;
            }

            enemy.userData.shootTimer -= delta;
            if (enemy.userData.shootTimer <= 0 && !isMoving) {
                const gp = new THREE.Vector3(); rig.gun.getWorldPosition(gp);
                const dir = new THREE.Vector3().subVectors(yawObject.position, gp).normalize();
                createEnemyBullet(gp.add(dir.multiplyScalar(0.6)), dir);
                enemy.userData.shootTimer = 2.0 + Math.random();
            }
        }
        else if (type === 'controller') {
            const rig = enemy.userData.rig;
            let isMoving = false;
            if (dist < 25) {
                 const dir = new THREE.Vector3().subVectors(enemy.position, yawObject.position).normalize(); dir.y = 0;
                 const nextPos = enemy.position.clone().add(dir.multiplyScalar(enemy.userData.speed * delta));
                 if(!checkEnemyCollision(nextPos)) { enemy.lookAt(nextPos); enemy.position.copy(nextPos); isMoving = true; }
                 else enemy.lookAt(yawObject.position);
            } else enemy.lookAt(yawObject.position);

            if (isMoving) {
                const s = 10; rig.legL.rotation.x = Math.sin(time*0.01*s)*0.8; rig.legR.rotation.x = Math.sin(time*0.01*s+Math.PI)*0.8;
                rig.armL.rotation.x = -0.8 + Math.sin(time*0.01*s)*0.2; rig.armR.rotation.x = -0.8 + Math.cos(time*0.01*s)*0.2;
            } else {
                rig.legL.rotation.x = 0; rig.legR.rotation.x = 0;
                if (rig.light) rig.light.intensity = 1.5 + Math.sin(time*0.01)*0.5;
                rig.armL.rotation.x = -0.8 + Math.sin(time*0.005)*0.05; rig.armR.rotation.x = -0.8 + Math.cos(time*0.005)*0.1; 
            }
        }
    });

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        b.life -= delta; b.mesh.position.add(b.velocity.clone().multiplyScalar(delta));
        if (b.mesh.position.distanceTo(yawObject.position) < 1.0) { takeDamage(10); scene.remove(b.mesh); enemyBullets.splice(i, 1); continue; }
        if (checkCollision(b.mesh.position, 0.2)) { scene.remove(b.mesh); enemyBullets.splice(i, 1); continue; }
        if (b.life <= 0) { scene.remove(b.mesh); enemyBullets.splice(i, 1); }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.life -= delta; p.mesh.position.add(p.vel.clone().multiplyScalar(delta));
        p.mesh.scale.multiplyScalar(0.9); p.mesh.rotation.x += delta;
        if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
    }
    renderer.render(scene, camera);
}

spawnEnemy('soldier', new THREE.Vector3(0, 0.9, -20));
spawnEnemy('drone', new THREE.Vector3(-10, 2, -15));
spawnEnemy('controller'); 

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
// --- Sound Manager (Web Audio API) ---
const SoundManager = {
    ctx: null,
    engineOsc: null,
    engineGain: null,
    isPlayingMusic: false,
    musicNoteTime: 0,
    musicBeat: 0,
    musicTempo: 120,
    musicTimer: null,

    init: function () {
        if (this.ctx) {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            return;
        }
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();
        if (this.ctx.state === 'suspended') this.ctx.resume();

        // Engine Sound
        this.engineOsc = this.ctx.createOscillator();
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 100;

        this.engineGain = this.ctx.createGain();
        this.engineGain.gain.value = 0.0;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 400;

        this.engineOsc.connect(filter);
        filter.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);

        this.engineOsc.start();
    },

    setEnginePitch: function (speedRatio, isBoost) {
        if (!this.ctx) return;
        let baseFreq = 80 + (speedRatio * 200);
        if (isBoost) baseFreq += 100;

        this.engineOsc.frequency.setTargetAtTime(baseFreq, this.ctx.currentTime, 0.1);
        this.engineGain.gain.setTargetAtTime(0.05 + (speedRatio * 0.1), this.ctx.currentTime, 0.1);
    },

    playCollect: function (type) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';

        if (type === 'boost') {
            osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1800, this.ctx.currentTime + 0.3);
        } else {
            osc.frequency.setValueAtTime(800, this.ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.1);
        }

        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.3);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    },

    playExplosion: function () {
        if (!this.ctx) return;
        const bufferSize = this.ctx.sampleRate * 1.5;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 1000;
        filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 1);

        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 1);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start();
    },

    playGameOver: function () {
        if (!this.ctx) return;
        this.stopMusic();
        const now = this.ctx.currentTime;
        const notes = [392.00, 369.99, 349.23, 329.63];
        const duration = 0.3;

        notes.forEach((freq, i) => {
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.value = freq;

            const startTime = now + (i * duration);
            gain.gain.setValueAtTime(0.2, startTime);
            gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);

            osc.connect(gain);
            gain.connect(this.ctx.destination);
            osc.start(startTime);
            osc.stop(startTime + duration);
        });
    },

    stopEngine: function () {
        if (this.engineGain) this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    },

    toggleMusic: function () {
        if (this.isPlayingMusic) {
            this.stopMusic();
        } else {
            this.startMusic();
        }
    },

    startMusic: function () {
        if (!this.ctx) this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (this.isPlayingMusic) return;
        this.isPlayingMusic = true;
        this.musicBeat = 0;
        this.musicNoteTime = this.ctx.currentTime + 0.1;
        this.scheduleMusic();
    },

    stopMusic: function () {
        this.isPlayingMusic = false;
        if (this.musicTimer) clearTimeout(this.musicTimer);
    },

    scheduleMusic: function () {
        if (!this.isPlayingMusic) return;
        const secondsPerBeat = 60.0 / this.musicTempo;
        const lookahead = 0.1;

        while (this.musicNoteTime < this.ctx.currentTime + lookahead) {
            this.playBeat(this.musicBeat, this.musicNoteTime);
            this.musicNoteTime += 0.25 * secondsPerBeat;
            this.musicBeat = (this.musicBeat + 1) % 16;
        }
        this.musicTimer = setTimeout(() => this.scheduleMusic(), 25);
    },

    playBeat: function (beat, time) {
        if (beat % 4 === 0) this.playKick(time);
        if (beat === 4 || beat === 12) this.playSnare(time);
        if (beat % 2 === 0) this.playHiHat(time, beat % 4 === 0 ? 0.05 : 0.03);
        if (beat % 2 === 0) {
            let freq = 65.41;
            if (beat >= 8) freq = 87.31;
            if (Math.random() > 0.9) freq *= 1.5;
            this.playBass(time, freq);
        }
    },

    playKick: function (time) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(150, time);
        osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.5);
        gain.gain.setValueAtTime(0.8, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.5);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + 0.5);
    },

    playSnare: function (time) {
        const bufferSize = this.ctx.sampleRate * 0.1;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 800;
        gain.gain.setValueAtTime(0.4, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(time);
    },

    playHiHat: function (time, vol) {
        const bufferSize = this.ctx.sampleRate * 0.05;
        const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
        const noise = this.ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'highpass';
        filter.frequency.value = 5000;
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(vol, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        noise.start(time);
    },

    playBass: function (time, freq) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, time);
        const filter = this.ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(600, time);
        filter.frequency.exponentialRampToValueAtTime(100, time + 0.2);
        const gain = this.ctx.createGain();
        gain.gain.setValueAtTime(0.2, time);
        gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(time);
        osc.stop(time + 0.2);
    },

    lowAltTimer: null,
    startLowAltWarning: function () {
        if (this.lowAltTimer) return;
        this.playLowAltBeep();
        this.lowAltTimer = setInterval(() => this.playLowAltBeep(), 600);
    },
    stopLowAltWarning: function () {
        if (this.lowAltTimer) {
            clearInterval(this.lowAltTimer);
            this.lowAltTimer = null;
        }
    },
    playLowAltBeep: function () {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(500, this.ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(800, this.ctx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.2);
    }
};

// ==========================================
// PROFILE-AWARE STORAGE
// ==========================================
// Read the active Game Hub profile ID from the URL query parameter.
// This ensures each Game Hub profile has its own isolated save data.

const PROFILE_ID = new URLSearchParams(location.search).get('profile') || 'default';

/**
 * Get a profile-specific localStorage key for Sky Ace data.
 * @param {string} key - The base key name (e.g., 'achievements', 'highscore')
 * @returns {string} The profile-scoped key
 */
function profileKey(key) {
    return `skyace_${PROFILE_ID}_${key}`;
}

/**
 * Migrate old (non-profile) Sky Ace data to the current profile's storage.
 * This runs once per profile and does not delete old data.
 */
function migrateOldData() {
    const OLD_ACH_KEY = 'skyAceAchievementsV3';
    const OLD_HIGHSCORE_KEY = 'skyAceHighScore';
    const NEW_ACH_KEY = profileKey('achievements');
    const NEW_HIGHSCORE_KEY = profileKey('highscore');

    // Migrate achievements
    const oldAch = localStorage.getItem(OLD_ACH_KEY);
    const newAch = localStorage.getItem(NEW_ACH_KEY);
    if (oldAch !== null && newAch === null) {
        localStorage.setItem(NEW_ACH_KEY, oldAch);
        console.log(`Sky Ace: Migrated achievements to profile "${PROFILE_ID}"`);
    }

    // Migrate high score
    const oldScore = localStorage.getItem(OLD_HIGHSCORE_KEY);
    const newScore = localStorage.getItem(NEW_HIGHSCORE_KEY);
    if (oldScore !== null && newScore === null) {
        localStorage.setItem(NEW_HIGHSCORE_KEY, oldScore);
        console.log(`Sky Ace: Migrated high score to profile "${PROFILE_ID}"`);
    }
}

// Run migration on load
migrateOldData();

// --- Achievement System (Progression) ---
const defaultAchievements = {
    // Trainee (Tier 0)
    trainee_takeoff: { title: "Flight School", desc: "Take off for the very first time.", icon: "🛫", unlocked: false, tier: 0 },
    trainee_boost: { title: "Need for Speed", desc: "Hit your first speed boost.", icon: "⚡", unlocked: false, tier: 0 },
    trainee_rings: { title: "Shiny!", desc: "Collect 5 rings in one flight.", icon: "🪙", unlocked: false, tier: 0 },

    // Expert (Tier 1)
    expert_survivor: { title: "Expert Pilot", desc: "Survive a flight for 60 seconds.", icon: "⏱️", unlocked: false, tier: 1 },
    expert_fuel: { title: "Pit Stop", desc: "Collect 5 fuel cans in one flight.", icon: "⛽", unlocked: false, tier: 1 },
    expert_rings: { title: "Ring Master", desc: "Collect 25 rings in one flight.", icon: "💍", unlocked: false, tier: 1 },

    // Ace (Tier 2)
    ace_survivor: { title: "Sky Ace", desc: "Survive a grueling 3 minutes.", icon: "👑", unlocked: false, tier: 2 },
    ace_speed: { title: "Supersonic", desc: "Hit 10 boosts in one flight.", icon: "🚀", unlocked: false, tier: 2 },
    ace_rings: { title: "Dragon's Hoard", desc: "Collect 100 rings in one flight.", icon: "🐉", unlocked: false, tier: 2 }
};

let savedAchievements = JSON.parse(localStorage.getItem(profileKey('achievements')));
let achievements = savedAchievements ? savedAchievements : defaultAchievements;

let ringsCollected = 0;
let boostsCollected = 0;
let fuelCollected = 0;

function getCurrentTier() {
    // Tier 0 (Trainee): always available by default
    // Tier 1 (Expert): unlocked when all trainee achievements are completed
    // Tier 2 (Ace): unlocked when all expert achievements are completed

    const traineeIds = ['trainee_takeoff', 'trainee_boost', 'trainee_rings'];
    const expertIds = ['expert_survivor', 'expert_fuel', 'expert_rings'];

    const allInGroupComplete = (ids) => ids.every(id => achievements[id] && achievements[id].unlocked);

    if (allInGroupComplete(expertIds)) return 2;
    if (allInGroupComplete(traineeIds)) return 1;
    return 0;
}

function reportToGameHub(achievementId) {
    // Report achievement to Game Hub via bridge queue
    try {
        const queue = JSON.parse(localStorage.getItem('game-hub-event-queue') || '[]');
        queue.push({
            type: 'achievement_unlock',
            gameId: 'sky-ace',
            data: { achievementId: achievementId }
        });
        localStorage.setItem('game-hub-event-queue', JSON.stringify(queue));
    } catch (e) {
        console.warn('Sky Ace: Failed to report achievement to Game Hub', e);
    }
}


function unlockAchievement(id) {
    let ach = achievements[id];
    if (ach && !ach.unlocked) {
        let currentTier = getCurrentTier();

        if (ach.tier > currentTier) return;

        ach.unlocked = true;
        localStorage.setItem(profileKey('achievements'), JSON.stringify(achievements));

        reportToGameHub(id);

        const toast = document.getElementById('achievement-toast');
        document.getElementById('ach-toast-title').innerText = "Achievement Unlocked!";
        document.getElementById('ach-toast-title').style.color = "#ffd700";
        document.getElementById('ach-toast-desc').innerText = ach.title;

        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3500);

        let newTier = getCurrentTier();
        if (newTier > currentTier) {
            setTimeout(() => {
                const rankNames = ["TRAINEE", "EXPERT", "SKY ACE"];
                document.getElementById('ach-toast-title').innerText = "RANK UP!";
                document.getElementById('ach-toast-title').style.color = "#00ff00";
                document.getElementById('ach-toast-desc').innerText = "You are now: " + rankNames[newTier];
                toast.classList.add('show');
                setTimeout(() => toast.classList.remove('show'), 4000);
            }, 4000);
        }
    }
}

// --- Game Constants & Variables ---
let scene, camera, renderer;
let plane, pilotMesh;
let terrain;
let starField;

// Game Objects
let rings = [];
let particles = [];
let smokeParticles = []; // v1.1.0 Feature
let fuelCans = [];
let obstacles = [];
let movingObstacles = []; // v1.1.0 Feature (Blimps)
let clouds = [];
let fallingPilot = null;
let parachute = null;
let lavaBombs = []; // v1.2.8 Feature

// State
let gameActive = false;
let isPaused = false;
let isEjecting = false;
let score = 0;
let highScore = localStorage.getItem(profileKey('highscore')) || 0;
let isCockpitView = false;
let explosionParticles = [];
let timeOfDay = 0;

// Biome Data (v1.2.4 Feature - Randomized Spatial Biomes!)
let distanceFlown = 0;
let biomeSequence = [0]; // Holds our randomized order
const biomes = [
    { name: "Plains", c1: new THREE.Color(0x3e8e41), c2: new THREE.Color(0x4CAF50), mtn: new THREE.Color(0x5D4037), tip: new THREE.Color(0xffffff) },
    { name: "Tundra", c1: new THREE.Color(0xe0f7fa), c2: new THREE.Color(0xb2ebf2), mtn: new THREE.Color(0x78909c), tip: new THREE.Color(0xffffff) },
    { name: "Desert", c1: new THREE.Color(0xe8b365), c2: new THREE.Color(0xd69f4c), mtn: new THREE.Color(0xd4a373), tip: new THREE.Color(0xd4a373) }, // v1.2.8 Richer sand colors
    { name: "Volcanic", c1: new THREE.Color(0x2b2b2b), c2: new THREE.Color(0x1a1a1a), mtn: new THREE.Color(0x111111), tip: new THREE.Color(0xff4500) }
];

// v1.2.4 Feature: Randomized Spatial Biome Calculation
function getBiomeColorsAtZ(z) {
    let chunkFloat = Math.abs(z) / 4000;
    let currentChunk = Math.floor(chunkFloat);
    let nextChunk = currentChunk + 1;
    let rawLerp = chunkFloat - currentChunk;

    // v1.2.8 Fix: Stay solid for 85% of the zone, transition quickly over the last 15% border
    let transitionProgress = 0;
    if (rawLerp > 0.85) {
        transitionProgress = (rawLerp - 0.85) / 0.15;
    }

    // Grab the randomized biomes for this specific chunk
    let currentBiomeIdx = biomeSequence[currentChunk % biomeSequence.length];
    let nextBiomeIdx = biomeSequence[nextChunk % biomeSequence.length];

    let curBiome = biomes[currentBiomeIdx];
    let nxtBiome = biomes[nextBiomeIdx];

    let dominantName = transitionProgress < 0.5 ? curBiome.name : nxtBiome.name;

    return {
        name: dominantName,
        c1: curBiome.c1.clone().lerp(nxtBiome.c1, transitionProgress),
        c2: curBiome.c2.clone().lerp(nxtBiome.c2, transitionProgress),
        mtn: curBiome.mtn.clone().lerp(nxtBiome.mtn, transitionProgress),
        tip: curBiome.tip.clone().lerp(nxtBiome.tip, transitionProgress),
        isVolcanic: (currentBiomeIdx === 3 && transitionProgress < 1) || (nextBiomeIdx === 3 && transitionProgress > 0),
        volcanicIntensity: (currentBiomeIdx === 3 ? 1 - transitionProgress : 0) + (nextBiomeIdx === 3 ? transitionProgress : 0)
    };
}

// Skins System (v1.1.0 Adds smokeColor mapping)
const skins = [
    { name: "Classic", fuselage: 0xffffff, wing: 0xe74c3c, cockpit: 0x34495e, robotBody: 0x888888, robotEye: 0x00ff00, smokeColor: 0xeeeeee },
    { name: "Stealth", fuselage: 0x2c3e50, wing: 0x1a252f, cockpit: 0x00ff00, robotBody: 0x1a1a1a, robotEye: 0x00ff00, smokeColor: 0x00ff00 },
    { name: "Golden Ace", fuselage: 0xffd700, wing: 0x111111, cockpit: 0xffffff, robotBody: 0xffd700, robotEye: 0x0000ff, smokeColor: 0xffd700 },
    { name: "Rescue", fuselage: 0xff3333, wing: 0xffd700, cockpit: 0xecf0f1, robotBody: 0xffffff, robotEye: 0xff0000, smokeColor: 0xffaa00 }
];
let currentSkinIndex = 0;

// Physics State
const physics = {
    speed: 0,
    maxSpeed: 2.2,
    minSpeed: 1.0,
    throttle: 0.5,
    fuel: 100,
    gravity: 0.015,
    bankAngle: 0,
    pitchAngle: 0,
    yawAngle: 0,
    x: 0, y: 100, z: 0,
    boostTimer: 0,
    flightFrames: 0
};

// Input State
const input = { x: 0, y: 0, throttleUp: false, throttleDown: false };

// DOM Elements
const hudSpeed = document.getElementById('hud-speed');
const hudAlt = document.getElementById('hud-alt');
const hudScore = document.getElementById('score-display');
const hudBest = document.getElementById('hud-best');
const throttleBar = document.getElementById('throttle-bar');
const fuelBar = document.getElementById('fuel-bar');
const msgArea = document.getElementById('message-area');
const reticle = document.getElementById('aim-reticle');
const skinNameEl = document.getElementById('skin-name');

// --- Initialization ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    scene.fog = new THREE.Fog(0x87CEEB, 200, 900);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);

    try {
        renderer = new THREE.WebGLRenderer({
            antialias: false,
            alpha: false,
            powerPreference: "default",
            failIfMajorPerformanceCaveat: false
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.shadowMap.enabled = true;
        document.getElementById('canvas-container').appendChild(renderer.domElement);
    } catch (e) {
        console.error("WebGL error:", e);
        document.getElementById('start-screen').innerHTML = '<h1>WebGL Error</h1><p>Your browser or environment does not support WebGL. Cannot start game.</p>';
        return;
    }

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(100, 200, 50);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // Objects
    createWorld();
    createStars();
    plane = createPlane();
    scene.add(plane);

    for (let i = 0; i < 30; i++) {
        createCloud((Math.random() - 0.5) * 2000, 100 + Math.random() * 200, -Math.random() * 2000);
    }

    // Set High Score
    hudBest.innerText = highScore;
    document.getElementById('menu-high-score').innerText = "Best Score: " + highScore;

    resetPlane();

    window.addEventListener('resize', onWindowResize, false);
    setupInputs();

    requestAnimationFrame(animate);
}

function goToMainMenu() {
    gameActive = false;
    isPaused = false;

    SoundManager.stopEngine();
    SoundManager.stopMusic();
    SoundManager.stopLowAltWarning();

    document.getElementById('pause-screen').style.display = 'none';
    document.getElementById('game-over-screen').style.display = 'none';

    document.getElementById('menu-high-score').innerText = "Best Score: " + highScore;
    document.getElementById('start-screen').style.display = 'flex';

    [...explosionParticles].forEach(o => scene.remove(o));
    explosionParticles = [];

    if (plane) scene.remove(plane);
    plane = createPlane();
    scene.add(plane);
    plane.position.set(0, 100, 0);
    plane.rotation.set(0, 0, 0, 'YXZ');

    camera.position.set(0, 105, 30);
    camera.lookAt(plane.position);
}

// --- Object Factories ---
function createPlane() {
    const planeGroup = new THREE.Group();

    const skin = skins[currentSkinIndex];

    const fuselageMat = new THREE.MeshPhongMaterial({ color: skin.fuselage, flatShading: true });
    const wingMat = new THREE.MeshPhongMaterial({ color: skin.wing, flatShading: true });
    const cockpitMat = new THREE.MeshPhongMaterial({ color: skin.cockpit, flatShading: true });
    const propMat = new THREE.MeshPhongMaterial({ color: 0x555555 });

    const fuselage = new THREE.Mesh(new THREE.ConeGeometry(1, 6, 8).rotateX(Math.PI / 2), fuselageMat);
    fuselage.castShadow = true;
    planeGroup.add(fuselage);

    const wing = new THREE.Mesh(new THREE.BoxGeometry(8, 0.2, 1.5), wingMat);
    wing.position.set(0, 0, 0.5);
    wing.castShadow = true;
    planeGroup.add(wing);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.2, 1), wingMat);
    tail.position.set(0, 0, 2.5);
    tail.castShadow = true;
    planeGroup.add(tail);

    const rudder = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.5, 1), wingMat);
    rudder.position.set(0, 0.5, 2.5);
    rudder.castShadow = true;
    planeGroup.add(rudder);

    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 1.5), cockpitMat);
    cockpit.position.set(0, 0.5, 0);
    planeGroup.add(cockpit);

    // Pilot
    const pilotGroup = new THREE.Group();

    const robotMat = new THREE.MeshLambertMaterial({ color: skin.robotBody });
    const eyeMat = new THREE.MeshBasicMaterial({ color: skin.robotEye });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), robotMat);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), robotMat);
    head.position.y = 0.5;

    const eye1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), eyeMat);
    eye1.position.set(0.1, 0.5, 0.2);
    const eye2 = eye1.clone();
    eye2.position.set(-0.1, 0.5, 0.2);

    eye1.visible = false;
    eye2.visible = false;

    const legGeo = new THREE.BoxGeometry(0.2, 0.4, 0.2);
    legGeo.translate(0, -0.2, 0);
    const legL = new THREE.Mesh(legGeo, robotMat);
    legL.position.set(0.15, -0.3, 0);
    const legR = new THREE.Mesh(legGeo, robotMat);
    legR.position.set(-0.15, -0.3, 0);

    const armGeo = new THREE.BoxGeometry(0.15, 0.4, 0.15);
    armGeo.translate(0, -0.2, 0);
    const armL = new THREE.Mesh(armGeo, robotMat);
    armL.position.set(0.35, 0.2, 0);
    const armR = new THREE.Mesh(armGeo, robotMat);
    armR.position.set(-0.35, 0.2, 0);

    pilotGroup.add(body, head, eye1, eye2, legL, legR, armL, armR);

    pilotGroup.userData = {
        limbs: { legL, legR, armL, armR },
        eyes: [eye1, eye2],
        velocity: new THREE.Vector3()
    };

    pilotGroup.position.set(0, 0.8, 0);
    pilotMesh = pilotGroup;
    planeGroup.add(pilotGroup);

    const propeller = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.1, 0.1), propMat);
    propeller.position.set(0, 0, -3);
    planeGroup.propeller = propeller;
    planeGroup.add(propeller);

    return planeGroup;
}

// v1.1.0 Feature: Smoke Contrails
function createSmoke(x, y, z, hexColor) {
    const geom = new THREE.BoxGeometry(0.4, 0.4, 0.4);
    const mat = new THREE.MeshBasicMaterial({ color: hexColor, transparent: true, opacity: 0.6 });
    const p = new THREE.Mesh(geom, mat);
    p.position.set(x, y, z);
    p.userData = { life: 1.0 };
    scene.add(p);
    smokeParticles.push(p);
}

function updateSmoke() {
    for (let i = smokeParticles.length - 1; i >= 0; i--) {
        const p = smokeParticles[i];
        p.position.y += 0.05; // Rises naturally
        p.userData.life -= 0.03;
        p.scale.setScalar(p.userData.life);
        p.material.opacity = p.userData.life * 0.6;
        if (p.userData.life <= 0) {
            scene.remove(p);
            smokeParticles.splice(i, 1);
        }
    }
}

function createStars() {
    const starGeo = new THREE.BufferGeometry();
    const count = 1000;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 2000;
        positions[i * 3 + 1] = Math.random() * 1000 + 200;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 2000;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2, transparent: true, opacity: 0 });
    starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);
}

function createExplosion(x, y, z) {
    SoundManager.playExplosion();
    const color = new THREE.Color(0xffaa00);
    const geom = new THREE.BoxGeometry(2, 2, 2);
    for (let i = 0; i < 30; i++) {
        const mat = new THREE.MeshBasicMaterial({ color: color });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(x, y, z);
        mesh.userData = {
            vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, vz: (Math.random() - 0.5) * 4,
            rotX: Math.random() * 0.2, rotY: Math.random() * 0.2, life: 1.0 + Math.random() * 0.5
        };
        scene.add(mesh);
        explosionParticles.push(mesh);
    }
}

function updateExplosions() {
    for (let i = explosionParticles.length - 1; i >= 0; i--) {
        const p = explosionParticles[i];
        p.position.x += p.userData.vx;
        p.position.y += p.userData.vy;
        p.position.z += p.userData.vz;
        p.rotation.x += p.userData.rotX;
        p.rotation.y += p.userData.rotY;
        p.userData.life -= 0.02;
        p.scale.setScalar(p.userData.life);
        p.material.opacity = p.userData.life;
        if (p.userData.life <= 0) {
            scene.remove(p);
            explosionParticles.splice(i, 1);
        }
    }
}

function createParticle(x, y, z, type) {
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    let col = 0xffaa00;
    if (type === 'boost') col = 0x00ffff;
    const material = new THREE.MeshBasicMaterial({ color: col });
    const p = new THREE.Mesh(geometry, material);
    p.position.set(x, y, z);
    p.userData = {
        vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), vz: 2,
        rotX: Math.random(), rotY: Math.random(), life: 1.0
    };
    scene.add(p);
    explosionParticles.push(p);
}

function createParachute(pilot) {
    const chuteGroup = new THREE.Group();

    const geo = new THREE.ConeGeometry(3, 2, 8, 1, true);
    const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, side: THREE.DoubleSide });
    const chute = new THREE.Mesh(geo, mat);
    chute.position.y = 4;
    chuteGroup.add(chute);

    const cordMat = new THREE.LineBasicMaterial({ color: 0x333333 });
    const cordGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(2.5, 3, 0),
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(-2.5, 3, 0),
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 3, 2.5),
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 3, -2.5)
    ]);
    const cords = new THREE.LineSegments(cordGeo, cordMat);
    chuteGroup.add(cords);

    pilot.add(chuteGroup);
    parachute = chuteGroup;
}

function createWorld() {
    const geometry = new THREE.PlaneGeometry(10000, 10000, 100, 100);
    geometry.rotateX(-Math.PI / 2);
    const count = geometry.attributes.position.count;
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    const colors = geometry.attributes.color;
    const color1 = new THREE.Color(0x3e8e41);
    const color2 = new THREE.Color(0x4CAF50);
    const pos = geometry.attributes.position;
    for (let i = 0; i < count; i++) {
        const x = pos.getX(i);
        const z = pos.getZ(i);
        const h = Math.sin(x * Math.PI / 100) * Math.cos(z * Math.PI / 100) * 15;
        pos.setY(i, h);
        const c = (Math.floor(x / 40) + Math.floor(z / 40)) % 2 === 0 ? color1 : color2;
        colors.setXYZ(i, c.r, c.g, c.b);
    }
    geometry.computeVertexNormals();
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    terrain = new THREE.Mesh(geometry, material);
    terrain.receiveShadow = true;
    scene.add(terrain);
}

function createCloud(x, y, z) {
    const mesh = new THREE.Group();
    const geom = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, opacity: 0.8, transparent: true });
    for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) {
        const m = new THREE.Mesh(geom, mat);
        m.position.set(Math.random() * 15, Math.random() * 5, Math.random() * 10);
        m.scale.setScalar(5 + Math.random() * 5);
        m.rotation.set(Math.random(), Math.random(), Math.random());
        mesh.add(m);
    }
    mesh.position.set(x, y, z);
    scene.add(mesh);
    clouds.push(mesh);
}

function createRing(x, z, type = 'normal') {
    const geometry = new THREE.TorusGeometry(8, 0.8, 8, 16);
    let color = 0xffd700;
    if (type === 'boost') color = 0x00ff00;

    const material = new THREE.MeshPhongMaterial({ color: color, emissive: type === 'boost' ? 0x00aa00 : 0xaa6600, emissiveIntensity: 0.5 });
    const ring = new THREE.Mesh(geometry, material);
    const y = 30 + Math.random() * 100;
    ring.position.set(x, y, z);
    ring.rotation.y = Math.random() * Math.PI;
    ring.userData = { type: type, initialY: y };
    scene.add(ring);
    rings.push(ring);
}

function createFuel(x, z) {
    const geometry = new THREE.CylinderGeometry(2, 2, 6, 8);
    const material = new THREE.MeshPhongMaterial({ color: 0x2196F3, emissive: 0x0000ff, emissiveIntensity: 0.2 });
    const fuel = new THREE.Mesh(geometry, material);
    const y = 30 + Math.random() * 100;
    fuel.position.set(x, y, z);
    fuel.rotation.x = Math.PI / 2;
    fuel.rotation.z = Math.PI / 4;
    scene.add(fuel);
    fuelCans.push(fuel);
}

function createObstacle(x, z) {
    const height = 150 + Math.random() * 100;
    let radius = 40 + Math.random() * 20;

    // v1.2.7: Get precise biome colors AND geometry type for this exact world position
    const bColors = getBiomeColorsAtZ(z);
    let obs;

    if (bColors.name === "Desert") {
        // DUNE: Wider, smoother cone without a cap
        radius *= 1.5;
        const geometry = new THREE.ConeGeometry(radius, height, 16);
        const material = new THREE.MeshPhongMaterial({ color: bColors.mtn, flatShading: false }); // Smooth shading
        obs = new THREE.Mesh(geometry, material);
        obs.position.set(x, (height / 2) - 10, z);

        obs.userData = { radius: radius, height: height, biomeType: "Desert" };
    }
    else if (bColors.name === "Volcanic") {
        // VOLCANO: Truncated cone with glowing crater
        const topRadius = radius * 0.35;
        const geometry = new THREE.CylinderGeometry(topRadius, radius, height, 6 + Math.floor(Math.random() * 2));
        const material = new THREE.MeshPhongMaterial({ color: bColors.mtn, flatShading: true });
        obs = new THREE.Mesh(geometry, material);
        obs.position.set(x, (height / 2) - 10, z);

        // Lava Crater inside the top
        const lavaGeo = new THREE.CircleGeometry(topRadius * 0.85, 8);
        const lavaMat = new THREE.MeshLambertMaterial({ color: bColors.tip });
        const lava = new THREE.Mesh(lavaGeo, lavaMat);
        lava.rotation.x = -Math.PI / 2;
        lava.position.y = (height / 2) + 0.1;
        obs.add(lava);

        obs.userData = { radius: radius, height: height, biomeType: "Volcanic" };
    }
    else {
        // PLAINS / TUNDRA: Standard mountain with snowcap
        const geometry = new THREE.ConeGeometry(radius, height, 4 + Math.floor(Math.random() * 3));
        const material = new THREE.MeshPhongMaterial({ color: bColors.mtn, flatShading: true });
        obs = new THREE.Mesh(geometry, material);
        obs.position.set(x, (height / 2) - 10, z);

        const snowH = height * 0.3;
        const snowR = (radius * (snowH / height)) + 1.5;
        const snowGeo = new THREE.ConeGeometry(snowR, snowH + 1, geometry.parameters.radialSegments);
        const snowMat = new THREE.MeshLambertMaterial({ color: bColors.tip, flatShading: true });

        const snow = new THREE.Mesh(snowGeo, snowMat);
        snow.position.y = (height / 2) - (snowH / 2) + 0.5;
        obs.add(snow);

        obs.userData = { radius: radius, height: height, biomeType: "Mountain" };
    }

    scene.add(obs);
    obstacles.push(obs);
}

// v1.2.0 Feature: Colorful Moving Blimps
function createBlimp(x, z) {
    const group = new THREE.Group();

    // Randomize blimp color!
    const blimpColors = [0xe74c3c, 0x3498db, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x2ecc71];
    const randomColor = blimpColors[Math.floor(Math.random() * blimpColors.length)];

    // Use a stretched sphere instead of a capsule
    const balloonGeo = new THREE.SphereGeometry(15, 16, 16);
    const balloonMat = new THREE.MeshPhongMaterial({ color: randomColor });
    const balloon = new THREE.Mesh(balloonGeo, balloonMat);
    balloon.scale.set(1, 1, 2.5); // Stretch it on the Z axis to look like a blimp!
    group.add(balloon);

    const basketGeo = new THREE.BoxGeometry(10, 5, 5);
    const basketMat = new THREE.MeshPhongMaterial({ color: 0x333333 });
    const basket = new THREE.Mesh(basketGeo, basketMat);
    basket.position.y = -16;
    group.add(basket);

    const y = 80 + Math.random() * 150;
    group.position.set(x, y, z);

    // Random slowly cruising vector
    const angle = Math.random() * Math.PI * 2;
    group.rotation.y = -angle; // Face direction of travel

    group.userData = {
        radius: 12, // v1.2.9 Fix: Reduced Hitbox radius from 20 to 12 for tighter dodging
        vx: Math.sin(angle) * 0.8,
        vz: Math.cos(angle) * 0.8,
        type: 'blimp'
    };

    scene.add(group);
    movingObstacles.push(group);
}

// --- Game Logic ---

function resetPlane() {
    if (plane) scene.remove(plane);
    plane = createPlane();
    scene.add(plane);

    physics.x = 0;
    physics.y = 100;
    physics.z = 0;
    physics.speed = 1.2;
    physics.maxSpeed = 2.2;
    physics.throttle = 0.4;
    physics.fuel = 100;
    physics.pitchAngle = 0;
    physics.yawAngle = 0;
    physics.bankAngle = 0;
    physics.boostTimer = 0;
    physics.flightFrames = 0;

    ringsCollected = 0;
    boostsCollected = 0;
    fuelCollected = 0;
    distanceFlown = 0; // Reset Biome Tracker

    // v1.2.5: Generate a massive random sequence for this run (Start anywhere!)
    let startBiome = Math.floor(Math.random() * biomes.length);
    biomeSequence = [startBiome];
    for (let i = 1; i < 500; i++) {
        let nextB = Math.floor(Math.random() * biomes.length);
        // Ensure we don't get the exact same biome twice in a row
        while (nextB === biomeSequence[i - 1]) {
            nextB = Math.floor(Math.random() * biomes.length);
        }
        biomeSequence.push(nextB);
    }

    terrain.material.color.setHex(0xffffff); // Force reset tint (vertex colors handle the rest)

    timeOfDay = 0.2;

    plane.position.set(0, 100, 0);
    plane.rotation.set(0, 0, 0, 'YXZ');
    plane.visible = true;

    isEjecting = false;
    if (fallingPilot) {
        scene.remove(fallingPilot);
        fallingPilot = null;
    }

    if (pilotMesh.parent !== plane) plane.add(pilotMesh);
    pilotMesh.position.set(0, 0.8, 0);
    pilotMesh.rotation.set(0, 0, 0);

    const limbs = pilotMesh.userData.limbs;
    if (limbs) {
        limbs.armL.rotation.set(0, 0, 0);
        limbs.armR.rotation.set(0, 0, 0);
        limbs.legL.rotation.set(0, 0, 0);
        limbs.legR.rotation.set(0, 0, 0);
    }

    if (parachute) {
        pilotMesh.remove(parachute);
        parachute = null;
    }

    [...rings, ...fuelCans, ...obstacles, ...movingObstacles, ...explosionParticles, ...smokeParticles, ...lavaBombs].forEach(o => scene.remove(o));
    rings = [];
    fuelCans = [];
    obstacles = [];
    movingObstacles = [];
    explosionParticles = [];
    smokeParticles = [];
    lavaBombs = []; // v1.2.8 Reset active lava

    // Spawn initial world radially
    for (let i = 0; i < 70; i++) {
        const angle = (Math.random() - 0.5) * (Math.PI / 1.2);
        const dist = 200 + Math.random() * 2000;
        const x = Math.sin(angle) * dist;
        const z = -Math.cos(angle) * dist;

        if (i < 30) {
            if (Math.random() > 0.8) createRing(x, z, 'boost');
            else createRing(x, z, 'normal');
        } else if (i < 55) {
            if (Math.random() > 0.8) createBlimp(x, z);
            else createObstacle(x, z);
        } else {
            createFuel(x, z);
        }
    }

    score = 0;
    hudScore.innerText = score;

    if (gameActive) {
        SoundManager.setEnginePitch(0.5, false);
        SoundManager.startMusic();
        SoundManager.stopLowAltWarning();
    }
}

function ejectSequence() {
    if (isEjecting) return;
    isEjecting = true;
    isCockpitView = false;

    if (pilotMesh) {
        pilotMesh.visible = true;
        if (pilotMesh.userData.eyes) {
            pilotMesh.userData.eyes.forEach(e => e.visible = true);
        }
    }

    SoundManager.stopEngine();
    SoundManager.stopMusic();
    SoundManager.stopLowAltWarning();
    showFloatingMessage("EJECTING!");

    const vector = new THREE.Vector3();
    pilotMesh.getWorldPosition(vector);
    const rotation = pilotMesh.getWorldQuaternion(new THREE.Quaternion());

    plane.remove(pilotMesh);
    scene.add(pilotMesh);
    pilotMesh.position.copy(vector);
    pilotMesh.quaternion.copy(rotation);

    pilotMesh.userData.velocity = new THREE.Vector3(0, 1.2, 0);

    fallingPilot = pilotMesh;

    setTimeout(() => {
        if (fallingPilot) createParachute(fallingPilot);
    }, 1000);
}

function updateDayNight() {
    timeOfDay += 0.0005;
    const cycle = Math.sin(timeOfDay);

    let r, g, b;
    let fogDist = 900;

    if (cycle > 0.5) {
        r = 0.53; g = 0.81; b = 0.92;
    } else if (cycle > 0) {
        const t = (0.5 - cycle) * 2;
        r = 0.53 + (0.99 - 0.53) * t;
        g = 0.81 + (0.37 - 0.81) * t;
        b = 0.92 + (0.33 - 0.92) * t;
        fogDist = 900 - 300 * t;
    } else {
        const t = Math.abs(cycle);
        r = 0.99 + (0.0 - 0.99) * t;
        g = 0.37 + (0.0 - 0.37) * t;
        b = 0.33 + (0.2 - 0.33) * t;
        starField.material.opacity = t;
        fogDist = 600;
    }

    const color = new THREE.Color(r, g, b);
    scene.background = color;
    scene.fog.color = color;
    scene.fog.far = fogDist;
}

function updatePhysics() {
    SoundManager.setEnginePitch(physics.throttle, physics.boostTimer > 0);

    if (physics.boostTimer > 0) {
        physics.boostTimer--;
        createParticle(physics.x, physics.y, physics.z + 4, 'boost');
    }

    if (!isEjecting) {
        physics.flightFrames++;

        if (physics.flightFrames % 300 === 0) {
            score += 100;
            hudScore.innerText = score;
        }
        if (physics.flightFrames % 600 === 0) {
            physics.maxSpeed *= 1.005;
        }

        if (physics.speed > 0) unlockAchievement('trainee_takeoff');
        if (physics.flightFrames >= 3600) unlockAchievement('expert_survivor');
        if (physics.flightFrames >= 10800) unlockAchievement('ace_survivor');

        if (physics.throttle > 0 || physics.speed > 0) {
            let speedPenalty = Math.pow(physics.speed, 2.5) * 0.015;
            let fuelDrain = (physics.throttle * 0.03) + speedPenalty;
            if (physics.boostTimer > 0) fuelDrain *= 3.0;
            physics.fuel -= fuelDrain;
        }

        if (physics.fuel <= 0) {
            physics.fuel = 0;
            physics.throttle = 0;
            if (!isEjecting) ejectSequence();
        }
        fuelBar.style.height = physics.fuel + "%";

        // V1.1.0 Feature: Emit Smoke Contrails if moving fast enough
        if (physics.speed > 0.5 && physics.flightFrames % 2 === 0) {
            const skin = skins[currentSkinIndex];
            const leftTip = new THREE.Vector3(-3.8, 0, 0.5).applyEuler(plane.rotation).add(plane.position);
            const rightTip = new THREE.Vector3(3.8, 0, 0.5).applyEuler(plane.rotation).add(plane.position);
            createSmoke(leftTip.x, leftTip.y, leftTip.z, skin.smokeColor);
            createSmoke(rightTip.x, rightTip.y, rightTip.z, skin.smokeColor);
        }
    }

    if (isEjecting) {
        physics.pitchAngle += 0.02;
        physics.y -= 2.0;
        physics.z -= 1.0;
        physics.throttle = 0;

        if (fallingPilot) {
            const pilotVel = fallingPilot.userData.velocity;

            if (!parachute) {
                pilotVel.y -= 0.04;
                const limbs = fallingPilot.userData.limbs;
                const skinName = skins[currentSkinIndex].name;
                if (skinName === "Classic") {
                    limbs.armL.rotation.set(0, 0, 0.4);
                    limbs.armR.rotation.set(0, 0, -0.4);
                    limbs.legL.rotation.x = 0.5;
                    limbs.legR.rotation.x = 0.5;
                    fallingPilot.rotation.x = -Math.PI / 4;
                } else {
                    const t = Date.now() * 0.02;
                    limbs.armL.rotation.x = Math.sin(t) * 3;
                    limbs.armR.rotation.x = Math.cos(t) * 3;
                    limbs.legL.rotation.x = Math.sin(t * 1.5) * 1.5;
                    limbs.legR.rotation.x = Math.cos(t * 1.5) * 1.5;
                }
            } else {
                pilotVel.y *= 0.9;
                if (pilotVel.y < -0.2) pilotVel.y = -0.2;

                const limbs = fallingPilot.userData.limbs;
                fallingPilot.rotation.x *= 0.9;
                limbs.armL.rotation.set(0, 0, 0.5);
                limbs.armR.rotation.set(0, 0, -0.5);
                const t = Date.now() * 0.005;
                limbs.legL.rotation.set(Math.sin(t) * 0.2, 0, 0);
                limbs.legR.rotation.set(Math.cos(t) * 0.2, 0, 0);
            }

            fallingPilot.position.add(pilotVel);
            fallingPilot.position.z -= 0.5;
            if (fallingPilot.position.y < 2) fallingPilot.position.y = 2;
        }

        if (physics.y < 5) {
            createExplosion(physics.x, physics.y, physics.z);
            plane.visible = false;
            crash("OUT OF FUEL", true);
            return;
        }

    } else {
        if (pilotMesh && pilotMesh.userData.limbs) {
            pilotMesh.userData.limbs.armL.rotation.set(-0.5, 0, 0);
            pilotMesh.userData.limbs.armR.rotation.set(-0.5, 0, 0);
        }

        if (input.throttleUp && physics.throttle < 1.0) physics.throttle += 0.01;
        if (input.throttleDown && physics.throttle > 0.0) physics.throttle -= 0.01;
        throttleBar.style.height = (physics.throttle * 100) + "%";

        let targetSpeed = physics.throttle * physics.maxSpeed;
        if (physics.boostTimer > 0) targetSpeed *= 2.0;

        targetSpeed -= physics.pitchAngle * 0.3;
        physics.speed += (targetSpeed - physics.speed) * 0.02;
        if (physics.speed < 0) physics.speed = 0;

        const targetBank = -input.x * Math.PI / 3.0;
        const targetPitch = -input.y * Math.PI / 4.0;

        const responsiveness = 0.04;
        physics.bankAngle += (targetBank - physics.bankAngle) * responsiveness;
        physics.pitchAngle += (targetPitch - physics.pitchAngle) * responsiveness;
        physics.yawAngle += physics.bankAngle * 0.015;
    }

    // Fixed Gimbal Lock
    plane.rotation.set(physics.pitchAngle, physics.yawAngle, physics.bankAngle, 'YXZ');

    const speed = physics.speed;
    const direction = new THREE.Vector3(0, 0, -1);
    direction.applyEuler(plane.rotation);
    direction.normalize();

    if (!isEjecting) {
        physics.x += direction.x * speed * 2;
        physics.y += direction.y * speed * 2;
        physics.z += direction.z * speed * 2;

        // V1.1.0 Bug Fix: Realistic Stall/Gravity Curve
        const lift = (physics.speed - physics.minSpeed) * 0.05;
        let drop = physics.gravity;

        // If you fly too slow, gravity grabs you much harder (Stall)
        if (physics.speed < physics.minSpeed) {
            let stallSeverity = physics.minSpeed - physics.speed;
            drop += Math.pow(stallSeverity, 2) * 0.15; // Plummets heavily towards ground
        }

        physics.y += lift - drop;
    } else {
        plane.position.set(physics.x, physics.y, physics.z);
    }

    if (!isEjecting) {
        if (physics.y < 40 && physics.y > 5 && gameActive) {
            SoundManager.startLowAltWarning();
        } else {
            SoundManager.stopLowAltWarning();
        }

        if (physics.y < 5) {
            createExplosion(physics.x, physics.y, physics.z);
            plane.visible = false;
            crash("CRASHED INTO GROUND");
            physics.y = 5;
        }
    }

    if (physics.y > 3000) physics.y = 3000;
    plane.position.set(physics.x, physics.y, physics.z);

    if (plane.propeller && !isEjecting) {
        plane.propeller.rotation.z += 0.5 + physics.throttle;
    }

    hudSpeed.innerText = Math.round(physics.speed * 200);
    hudAlt.innerText = Math.round(physics.y * 10);
}

function updateCamera() {
    if (isEjecting && fallingPilot) {
        if (pilotMesh) pilotMesh.visible = true;
        const camTarget = fallingPilot.position.clone().add(new THREE.Vector3(0, 5, 20));
        camera.position.lerp(camTarget, 0.1);
        camera.lookAt(fallingPilot.position);
        return;
    }

    if (isCockpitView) {
        if (pilotMesh) pilotMesh.visible = false;
        const offset = new THREE.Vector3(0, 2.0, -2.0);
        offset.applyEuler(plane.rotation);
        const camPos = plane.position.clone().add(offset);
        camera.position.copy(camPos);
        const lookOffset = new THREE.Vector3(0, 0, -50);
        lookOffset.applyEuler(plane.rotation);
        camera.lookAt(plane.position.clone().add(lookOffset));
    } else {
        if (pilotMesh) pilotMesh.visible = true;
        const relativeOffset = new THREE.Vector3(0, 8, 30);
        const yawOnly = new THREE.Euler(0, physics.yawAngle, 0, 'YXZ');
        const offsetRotated = relativeOffset.clone().applyEuler(yawOnly);
        const cameraTargetPos = plane.position.clone().add(offsetRotated);
        camera.position.lerp(cameraTargetPos, 0.1);
        const lookAtPos = plane.position.clone().add(new THREE.Vector3(0, 0, -20).applyEuler(plane.rotation));
        camera.lookAt(lookAtPos);
    }
}

function checkCollection(arr, type) {
    if (isEjecting) return;
    const planeForward = new THREE.Vector3(0, 0, -1).applyEuler(plane.rotation).normalize();

    for (let i = arr.length - 1; i >= 0; i--) {
        const item = arr[i];
        let hitRadius = 10;

        if (type === 'obs') {
            const obsRadius = item.userData.radius;
            const obsHeight = item.userData.height;
            const obsBaseY = item.position.y - (obsHeight / 2);
            const obsTipY = item.position.y + (obsHeight / 2);
            const dx = plane.position.x - item.position.x;
            const dz = plane.position.z - item.position.z;
            const distHorizontal = Math.sqrt(dx * dx + dz * dz);

            if (distHorizontal < obsRadius * 1.5) {
                if (plane.position.y > obsBaseY && plane.position.y < obsTipY) {
                    const heightFromBase = plane.position.y - obsBaseY;
                    const ratio = heightFromBase / obsHeight;

                    let allowedRadiusAtHeight = obsRadius * (1 - ratio) * 0.9;
                    if (item.userData.biomeType === "Volcanic") {
                        const topRadius = obsRadius * 0.35;
                        allowedRadiusAtHeight = (obsRadius - (obsRadius - topRadius) * ratio) * 0.9;
                    }

                    if (distHorizontal < allowedRadiusAtHeight) {
                        createExplosion(plane.position.x, plane.position.y, plane.position.z);
                        plane.visible = false;
                        crash("CRASHED INTO MOUNTAIN");
                    }
                }
            }
        }
        else if (type === 'blimp') {
            // V1.1.0 Feature: Check blimp collision (sphere hit detection)
            const dist = plane.position.distanceTo(item.position);
            if (dist < 10 + item.userData.radius) {
                createExplosion(plane.position.x, plane.position.y, plane.position.z);
                plane.visible = false;
                crash("CRASHED INTO BLIMP");
            }
        }
        else {
            const dist = plane.position.distanceTo(item.position);
            if (dist < hitRadius * 2.0) {
                if (type === 'ring') {
                    if (item.userData.type === 'boost') {
                        physics.boostTimer = 200;
                        score += 1000;

                        boostsCollected++;
                        if (boostsCollected >= 1) unlockAchievement('trainee_boost');
                        if (boostsCollected >= 10) unlockAchievement('ace_speed');

                        hudScore.innerText = score;
                        showFloatingMessage("SPEED BOOST!");
                        SoundManager.playCollect('boost');
                    } else {
                        score += 1000;
                        ringsCollected++;

                        if (ringsCollected >= 5) unlockAchievement('trainee_rings');
                        if (ringsCollected >= 25) unlockAchievement('expert_rings');
                        if (ringsCollected >= 100) unlockAchievement('ace_rings');

                        hudScore.innerText = score;
                        SoundManager.playCollect('normal');
                        showFloatingMessage("RING!");
                    }
                    scene.remove(item);
                    arr.splice(i, 1);
                } else if (type === 'fuel') {
                    physics.fuel = Math.min(100, physics.fuel + 30);

                    fuelCollected++;
                    if (fuelCollected >= 5) unlockAchievement('expert_fuel');

                    SoundManager.playCollect('normal');
                    showFloatingMessage("REFUELED");
                    scene.remove(item);
                    arr.splice(i, 1);
                }
            }
        }

        const toItem = new THREE.Vector3().subVectors(item.position, plane.position);
        toItem.y = 0;
        const distHorizontalToPlane = toItem.length();
        if (distHorizontalToPlane > 0) toItem.normalize();

        const pfFlat = planeForward.clone();
        pfFlat.y = 0;
        if (pfFlat.lengthSq() > 0) pfFlat.normalize();

        const dot = pfFlat.dot(toItem);
        const distToPlane = plane.position.distanceTo(item.position);

        let despawn = false;
        if (type === 'obs' || type === 'blimp') {
            if ((distToPlane > 600 && dot < -0.1) || distToPlane > 2500) despawn = true;
        } else {
            if ((distToPlane > 200 && dot < -0.1) || distToPlane > 2500) despawn = true;
        }

        if (despawn) {
            scene.remove(item);
            arr.splice(i, 1);
        }
    }

    const limits = { 'ring': 30, 'obs': 25, 'fuel': 12, 'blimp': 5 };
    let safetyCounter = 0;

    while (arr.length < limits[type] && safetyCounter < 50) {
        safetyCounter++;
        const baseAngle = Math.atan2(planeForward.x, planeForward.z);
        const spawnAngle = baseAngle + (Math.random() - 0.5) * (Math.PI / 1.5);
        const spawnDist = 600 + Math.random() * 1400;
        const spawnX = plane.position.x + Math.sin(spawnAngle) * spawnDist;
        const spawnZ = plane.position.z + Math.cos(spawnAngle) * spawnDist;

        if (type === 'ring') {
            if (Math.random() > 0.8) createRing(spawnX, spawnZ, 'boost');
            else createRing(spawnX, spawnZ, 'normal');
        } else if (type === 'fuel') {
            createFuel(spawnX, spawnZ);
        } else if (type === 'obs') {
            createObstacle(spawnX, spawnZ);
        } else if (type === 'blimp') {
            createBlimp(spawnX, spawnZ);
        }
    }
}

function updateEnvironment() {
    const snap = 200;
    terrain.position.x = Math.floor(physics.x / snap) * snap;
    terrain.position.z = Math.floor(physics.z / snap) * snap;

    rings.forEach((r, i) => {
        const yOffset = Math.sin(Date.now() * 0.002 + i) * 0.2;
        r.position.y += yOffset;
    });

    checkCollection(rings, 'ring');
    checkCollection(fuelCans, 'fuel');
    checkCollection(obstacles, 'obs');
    checkCollection(movingObstacles, 'blimp');

    fuelCans.forEach(f => { f.rotation.y += 0.02; });

    // Move blimps
    movingObstacles.forEach(b => {
        b.position.x += b.userData.vx;
        b.position.z += b.userData.vz;
    });

    // V1.2.3 Feature: TRUE Spatial Biome Transitions
    if (physics.speed > 0 && !isEjecting) {
        distanceFlown += physics.speed;

        // Update ALL existing mountains to maintain proper coloring based on their absolute position
        obstacles.forEach(obs => {
            const bColors = getBiomeColorsAtZ(obs.position.z);
            obs.material.color.copy(bColors.mtn);

            if (obs.userData.biomeType === "Volcanic") {
                obs.children[0].material.color.copy(bColors.tip);
                if (bColors.isVolcanic) {
                    obs.children[0].material.emissive.copy(bColors.tip);
                    obs.children[0].material.emissiveIntensity = bColors.volcanicIntensity * 0.8;
                } else {
                    obs.children[0].material.emissiveIntensity = 0;
                }
            } else if (obs.userData.biomeType === "Mountain") {
                obs.children[0].material.color.copy(bColors.tip);
            }
            // Desert dunes have no children to update
        });

        // Update the grid vertex colors smoothly based on WORLD Z position!
        if (physics.flightFrames % 5 === 0) {
            terrain.material.color.setHex(0xffffff); // Force reset tint (vertex colors handle the rest)
            const colors = terrain.geometry.attributes.color;
            const pos = terrain.geometry.attributes.position;

            for (let i = 0; i < pos.count; i++) {
                const localX = pos.getX(i);
                const localZ = pos.getZ(i);
                const worldZ = terrain.position.z + localZ; // Get absolute position of this vertex

                // Get the exact biome color for this line of the grid
                const bColors = getBiomeColorsAtZ(worldZ);

                const isC1 = (Math.floor(localX / 40) + Math.floor(localZ / 40)) % 2 === 0;
                const c = isC1 ? bColors.c1 : bColors.c2;
                colors.setXYZ(i, c.r, c.g, c.b);
            }
            colors.needsUpdate = true;
        }
    }

    updateDayNight();
}

function updateClouds() {
    const planeForward = new THREE.Vector3(0, 0, -1).applyEuler(plane.rotation).normalize();
    const pfFlat = planeForward.clone();
    pfFlat.y = 0;
    if (pfFlat.lengthSq() > 0) pfFlat.normalize();

    clouds.forEach(c => {
        const toItem = new THREE.Vector3().subVectors(c.position, plane.position);
        toItem.y = 0;
        if (toItem.lengthSq() > 0) toItem.normalize();

        const dot = pfFlat.dot(toItem);
        const distToPlane = plane.position.distanceTo(c.position);

        if ((distToPlane > 1000 && dot < -0.2) || distToPlane > 3000) {
            const baseAngle = Math.atan2(planeForward.x, planeForward.z);
            const spawnAngle = baseAngle + (Math.random() - 0.5) * Math.PI;
            const spawnDist = 2000 + Math.random() * 1000;
            c.position.x = plane.position.x + Math.sin(spawnAngle) * spawnDist;
            c.position.z = plane.position.z + Math.cos(spawnAngle) * spawnDist;
            c.position.y = 100 + Math.random() * 400;
        }
    });
}

// v1.2.8 Feature: Erupting Volcanoes
function spawnLavaBomb(x, y, z) {
    const geom = new THREE.BoxGeometry(3 + Math.random() * 2, 3 + Math.random() * 2, 3 + Math.random() * 2);
    const mat = new THREE.MeshPhongMaterial({ color: 0xff3300, emissive: 0xff0000, emissiveIntensity: 0.8, flatShading: true });
    const p = new THREE.Mesh(geom, mat);
    p.position.set(x, y, z);
    p.userData = {
        vx: (Math.random() - 0.5) * 6,
        vy: 8 + Math.random() * 12, // Shoot upwards out of the volcano!
        vz: (Math.random() - 0.5) * 6,
        rotX: Math.random() * 0.2,
        rotY: Math.random() * 0.2,
        rotZ: Math.random() * 0.2
    };
    scene.add(p);
    lavaBombs.push(p);
}

function updateLavaBombs() {
    // 1. Trigger eruptions if flying near a volcano
    if (physics.speed > 0 && !isEjecting) {
        obstacles.forEach(obs => {
            if (obs.userData.biomeType === "Volcanic") {
                const dist = plane.position.distanceTo(obs.position);
                // 2% chance per frame to erupt if you are within 1500 units!
                if (dist < 1500 && Math.random() < 0.02) {
                    spawnLavaBomb(obs.position.x, obs.position.y + (obs.userData.height / 2), obs.position.z);
                }
            }
        });
    }

    // 2. Physics & Collision for lava blocks
    for (let i = lavaBombs.length - 1; i >= 0; i--) {
        const p = lavaBombs[i];
        p.position.x += p.userData.vx;
        p.position.y += p.userData.vy;
        p.position.z += p.userData.vz;

        p.rotation.x += p.userData.rotX;
        p.rotation.y += p.userData.rotY;
        p.rotation.z += p.userData.rotZ;

        p.userData.vy -= 0.4; // Gravity pulls lava back down

        // Check collision with player
        if (!isEjecting) {
            const distToPlane = plane.position.distanceTo(p.position);
            if (distToPlane < 15) { // 15 unit hit radius
                createExplosion(plane.position.x, plane.position.y, plane.position.z);
                plane.visible = false;
                crash("INCINERATED BY LAVA");
            }
        }

        // Remove if it falls below the ground
        if (p.position.y < -10) {
            scene.remove(p);
            lavaBombs.splice(i, 1);
        }
    }
}

function togglePause() {
    if (!gameActive) return;
    isPaused = !isPaused;
    if (isPaused) {
        document.getElementById('pause-screen').style.display = 'flex';
        SoundManager.stopEngine();
        SoundManager.stopMusic();
        SoundManager.stopLowAltWarning();
    } else {
        document.getElementById('pause-screen').style.display = 'none';
        SoundManager.startMusic();
    }
}

function toggleCamera() {
    isCockpitView = !isCockpitView;
}

function crash(reason, ejected = false) {
    gameActive = false;

    if (score > highScore) {
        highScore = score;
        localStorage.setItem(profileKey('highscore'), highScore);
        hudBest.innerText = highScore;
    }

    SoundManager.stopEngine();
    SoundManager.stopMusic();
    SoundManager.stopLowAltWarning();

    const title = document.getElementById('game-over-title');
    const reasonEl = document.getElementById('crash-reason');

    reasonEl.innerText = reason || "CRASHED!";
    document.getElementById('final-score').innerText = "Score: " + score;

    title.className = ejected ? "anim-fuel" : "anim-crash";
    if (ejected) title.style.color = "#2196F3";
    else title.style.color = "#ff3333";

    setTimeout(() => {
        SoundManager.playGameOver();
        document.getElementById('game-over-screen').style.display = 'flex';
    }, 1000);
}

function showFloatingMessage(text) {
    const el = document.getElementById('msg-title');
    el.innerText = text;
    msgArea.style.display = 'block';
    msgArea.style.opacity = '1';
    setTimeout(() => { msgArea.style.display = 'none'; }, 1000);
}

function animate() {
    requestAnimationFrame(animate);

    if (gameActive && !isPaused) {
        updatePhysics();
        updateCamera();
        updateEnvironment();
        updateClouds();
        updateExplosions();
        updateSmoke(); // v1.1.0 Feature
        updateLavaBombs(); // v1.2.8 Feature
    } else if (!gameActive && explosionParticles.length > 0) {
        updateExplosions();
        updateSmoke();
        updateLavaBombs(); // Let lava finish falling even if dead
    }

    renderer.render(scene, camera);
}

// --- Inputs & UI Events ---
function setupInputs() {
    document.addEventListener('keydown', (e) => {
        if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') input.throttleUp = true;
        if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') input.throttleDown = true;
        if (e.key === 'p' || e.key === 'P') togglePause();
        if (e.key === 'c' || e.key === 'C') toggleCamera();
        if (e.key === 'm' || e.key === 'M') SoundManager.toggleMusic();
    });
    document.addEventListener('keyup', (e) => {
        if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') input.throttleUp = false;
        if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') input.throttleDown = false;
    });

    document.getElementById('pause-btn').addEventListener('click', togglePause);
    document.getElementById('camera-btn').addEventListener('click', toggleCamera);
    document.getElementById('music-btn').addEventListener('click', () => SoundManager.toggleMusic());
    document.getElementById('resume-btn').addEventListener('click', togglePause);

    document.getElementById('menu-btn-pause').addEventListener('click', goToMainMenu);
    document.getElementById('menu-btn-gameover').addEventListener('click', goToMainMenu);

    // Launcher redirect
    const goToLauncher = () => { window.location.href = '../../index.html'; };
    document.getElementById('launcher-btn-start').addEventListener('click', goToLauncher);
    document.getElementById('launcher-btn-pause').addEventListener('click', goToLauncher);
    document.getElementById('launcher-btn-gameover').addEventListener('click', goToLauncher);

    // Achievement Modal Open/Close Logic
    const achModal = document.getElementById('achievement-modal');
    const achListContainer = document.getElementById('ach-list-container');

    document.getElementById('btn-open-achievements').addEventListener('click', () => {
        achListContainer.innerHTML = '';
        let currentTier = getCurrentTier();
        const tierNames = ["Trainee Rank", "Expert Rank", "Ace Rank"];

        for (let t = 0; t <= 2; t++) {
            const header = document.createElement('h3');
            header.className = 'tier-header';
            header.innerText = tierNames[t] + (t > currentTier ? " (LOCKED)" : "");
            achListContainer.appendChild(header);

            for (const key in achievements) {
                const ach = achievements[key];
                if (ach.tier === t) {
                    const itemDiv = document.createElement('div');

                    if (t > currentTier) {
                        itemDiv.className = 'ach-item tier-locked';
                        itemDiv.innerHTML = `
                    <div class="ach-icon">🔒</div>
                    <div class="ach-text">
                        <h4>???</h4>
                        <p>Complete previous rank to reveal.</p>
                    </div>
                `;
                    } else {
                        itemDiv.className = `ach-item ${ach.unlocked ? 'unlocked' : ''}`;
                        itemDiv.innerHTML = `
                    <div class="ach-icon">${ach.unlocked ? ach.icon : '🔒'}</div>
                    <div class="ach-text">
                        <h4>${ach.title}</h4>
                        <p>${ach.desc}</p>
                    </div>
                `;
                    }
                    achListContainer.appendChild(itemDiv);
                }
            }
        }
        achModal.style.display = 'flex';
    });

    document.getElementById('btn-close-achievements').addEventListener('click', () => {
        achModal.style.display = 'none';
    });

    // Skin Selector Logic
    const prevSkinBtn = document.getElementById('prev-skin');
    const nextSkinBtn = document.getElementById('next-skin');

    const updateMenuSkin = () => {
        skinNameEl.innerText = skins[currentSkinIndex].name;
        if (!gameActive) {
            if (plane) scene.remove(plane);
            plane = createPlane();
            scene.add(plane);
            plane.position.set(0, 100, 0);
            plane.rotation.set(0, 0, 0, 'YXZ');
        }
    };

    prevSkinBtn.addEventListener('click', () => {
        currentSkinIndex--;
        if (currentSkinIndex < 0) currentSkinIndex = skins.length - 1;
        updateMenuSkin();
    });

    nextSkinBtn.addEventListener('click', () => {
        currentSkinIndex++;
        if (currentSkinIndex >= skins.length) currentSkinIndex = 0;
        updateMenuSkin();
    });

    const updateControlInput = (clientX, clientY) => {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const maxReachX = window.innerWidth * 0.45;
        const maxReachY = window.innerHeight * 0.45;
        let dx = (clientX - centerX) / maxReachX;
        let dy = (clientY - centerY) / maxReachY;
        input.x = Math.max(-1, Math.min(1, dx));
        input.y = Math.max(-1, Math.min(1, dy));
        const reticleX = centerX + (input.x * maxReachX);
        const reticleY = centerY + (input.y * maxReachY);
        reticle.style.left = reticleX + 'px';
        reticle.style.top = reticleY + 'px';
    };

    const centerControls = () => {
        const animateRecenter = () => {
            if (Math.abs(input.x) < 0.01 && Math.abs(input.y) < 0.01) {
                input.x = 0; input.y = 0;
                const cx = window.innerWidth / 2; const cy = window.innerHeight / 2;
                reticle.style.left = cx + 'px'; reticle.style.top = cy + 'px';
                return;
            }
            input.x *= 0.8; input.y *= 0.8;
            const cx = window.innerWidth / 2; const cy = window.innerHeight / 2;
            reticle.style.left = (cx + input.x * window.innerWidth * 0.4) + 'px';
            reticle.style.top = (cy + input.y * window.innerHeight * 0.4) + 'px';
            requestAnimationFrame(animateRecenter);
        };
        animateRecenter();
    };

    document.addEventListener('mousemove', e => {
        if (!gameActive || isPaused) return;
        updateControlInput(e.clientX, e.clientY);
    });

    document.addEventListener('touchstart', e => {
        if (e.target.tagName === 'BUTTON' || e.target.closest('#achievement-modal')) return;
        if (e.target.closest('#throttle-container')) {
            const rect = document.getElementById('throttle-container').getBoundingClientRect();
            const height = rect.height;
            const relativeY = Math.max(0, Math.min(height, rect.bottom - e.touches[0].clientY));
            physics.throttle = relativeY / height;
            return;
        }
        updateControlInput(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    document.addEventListener('touchmove', e => {
        if (e.target.closest('#achievement-modal')) return;
        e.preventDefault();
        if (e.target.closest('#throttle-container')) {
            const rect = document.getElementById('throttle-container').getBoundingClientRect();
            const height = rect.height;
            const relativeY = Math.max(0, Math.min(height, rect.bottom - e.touches[0].clientY));
            physics.throttle = relativeY / height;
            return;
        }
        updateControlInput(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: false });

    document.addEventListener('touchend', e => { centerControls(); });

    document.getElementById('start-btn').addEventListener('click', () => {
        document.getElementById('start-screen').style.display = 'none';
        gameActive = true;
        SoundManager.init();
        resetPlane();
    });

    document.getElementById('restart-btn').addEventListener('click', () => {
        document.getElementById('game-over-screen').style.display = 'none';
        gameActive = true;
        resetPlane();
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
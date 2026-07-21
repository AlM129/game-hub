// --- AUDIO SYSTEM ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
let bgmOscillators = [];
let bgmGain = null;

// --- BOSS MUSIC SYSTEM (Web Audio API) ---
let bossMusicActive = false;
let bossMusicIntroBuffer = null;
let bossMusicLoopBuffer = null;
let bossMusicIntroSource = null;
let bossMusicLoopSource = null;
let bossMusicGain = null;
let bossMusicBuffersLoaded = false;
let bossMusicLoadPromise = null;

function loadBossMusicBuffers() {
    if (bossMusicLoadPromise) return bossMusicLoadPromise;
    bossMusicLoadPromise = (async () => {
        try {
            const [introResponse, loopResponse] = await Promise.all([
                fetch('assets/music/juggernaut_boss_intro.ogg'),
                fetch('assets/music/juggernaut_boss_loop.ogg')
            ]);
            const [introArrayBuffer, loopArrayBuffer] = await Promise.all([
                introResponse.arrayBuffer(),
                loopResponse.arrayBuffer()
            ]);
            bossMusicIntroBuffer = await audioCtx.decodeAudioData(introArrayBuffer);
            bossMusicLoopBuffer = await audioCtx.decodeAudioData(loopArrayBuffer);
            bossMusicBuffersLoaded = true;
        } catch (e) {
            console.warn('Boss music buffer load failed:', e);
            bossMusicLoadPromise = null; // Allow retry on next call
        }
    })();
    return bossMusicLoadPromise;
}

function startBossMusic() {
    if (bossMusicActive) return;
    bossMusicActive = true;

    // Ensure audio context is running
    if (audioCtx.state === 'suspended') audioCtx.resume();

    // Stop any currently playing game over music
    stopGameOverMusic();

    // Create gain node for volume control
    bossMusicGain = audioCtx.createGain();
    bossMusicGain.gain.value = 0.7;
    bossMusicGain.connect(audioCtx.destination);

    // Load buffers (cached after first load)
    loadBossMusicBuffers().then(() => {
        if (!bossMusicActive || !bossMusicBuffersLoaded) return;

        // Create intro source node
        bossMusicIntroSource = audioCtx.createBufferSource();
        bossMusicIntroSource.buffer = bossMusicIntroBuffer;
        bossMusicIntroSource.connect(bossMusicGain);

        // Create loop source node with gapless looping
        bossMusicLoopSource = audioCtx.createBufferSource();
        bossMusicLoopSource.buffer = bossMusicLoopBuffer;
        bossMusicLoopSource.loop = true;
        bossMusicLoopSource.connect(bossMusicGain);

        // Schedule: intro starts now, loop starts exactly at intro's end
        // This is sample-accurate — no event loop delay
        const now = audioCtx.currentTime;
        bossMusicIntroSource.start(now);
        bossMusicLoopSource.start(now + bossMusicIntroBuffer.duration);
    });
}

function stopBossMusic() {
    if (!bossMusicActive) return;
    bossMusicActive = false;

    // Disconnect gain first to immediately cut audio
    if (bossMusicGain) {
        bossMusicGain.disconnect();
    }

    try {
        if (bossMusicIntroSource) {
            bossMusicIntroSource.stop();
            bossMusicIntroSource.disconnect();
            bossMusicIntroSource = null;
        }
    } catch (e) { /* already stopped */ }

    try {
        if (bossMusicLoopSource) {
            bossMusicLoopSource.stop();
            bossMusicLoopSource.disconnect();
            bossMusicLoopSource = null;
        }
    } catch (e) { /* already stopped */ }

    if (bossMusicGain) {
        bossMusicGain = null;
    }
}

function pauseBossMusic() {
    // Suspend the entire audio context to freeze all scheduled audio
    if (audioCtx.state === 'running') {
        audioCtx.suspend();
    }
}

function resumeBossMusic() {
    if (!bossMusicActive) return;
    // Resume the audio context to continue playback from where it paused
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playGameOverMusic() {
    if (bgmGain) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    bgmGain = audioCtx.createGain(); bgmGain.gain.value = 0.15; bgmGain.connect(audioCtx.destination);
    const osc1 = audioCtx.createOscillator(); osc1.type = 'sawtooth'; osc1.frequency.value = 55; osc1.connect(bgmGain); osc1.start();
    bgmOscillators.push(osc1);
    const osc2 = audioCtx.createOscillator(); osc2.type = 'sine'; osc2.frequency.value = 110;
    const lfo = audioCtx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.5;
    const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 50; lfo.connect(lfoGain.gain);
    osc2.connect(bgmGain); osc2.start(); lfo.start();
    bgmOscillators.push(osc2, lfo);
}

function stopGameOverMusic() {
    if (!bgmGain) return;
    bgmOscillators.forEach(osc => { try { osc.stop(); } catch (e) { } });
    bgmOscillators = [];
    bgmGain.disconnect();
    bgmGain = null;
}

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator(); const gain = audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
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
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(100, now); osc.frequency.exponentialRampToValueAtTime(0.01, now + 0.8);
        gain.gain.setValueAtTime(0.8, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now); osc.stop(now + 0.8);
    }
    else if (type === 'enemyShot') {
        osc.type = 'sawtooth'; osc.frequency.setValueAtTime(600, now); osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
        gain.gain.setValueAtTime(0.2, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
        osc.start(now); osc.stop(now + 0.2);
    }
    else if (type === 'cannon') {
        osc.type = 'square'; osc.frequency.setValueAtTime(50, now); osc.frequency.linearRampToValueAtTime(10, now + 2.0);
        gain.gain.setValueAtTime(1.0, now); gain.gain.exponentialRampToValueAtTime(0.01, now + 2.0);
        osc.start(now); osc.stop(now + 2.0);
    }
}
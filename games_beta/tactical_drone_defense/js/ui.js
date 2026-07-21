// --- ACHIEVEMENT SYSTEM ---
const ACHIEVEMENTS = {
    'first_scrap': { title: 'First Scrap', desc: 'Destroy your very first enemy robot.', icon: '💥' },
    'fashion_forward': { title: 'Fashion Forward', desc: 'Change your character skin in the main menu.', icon: '🧥' },
    'heavy_artillery': { title: 'Heavy Artillery', desc: 'Fire the Tower Cannon in Defend the Plane.', icon: '☢️' },
    'surgical_precision': { title: 'Surgical Precision', desc: 'Successfully land a 10x Damage Precision Strike.', icon: '🎯' },
    'death_from_above': { title: 'Death From Above', desc: 'Successfully land a 3x Damage Airborne Critical.', icon: '🦅' },
    'warehouse_veteran': { title: 'Warehouse Veteran', desc: 'Reach Wave 5 in Warehouse Survival.', icon: '🏭' },
    'airfield_defender': { title: 'Airfield Defender', desc: 'Reach Wave 5 in Defend the Plane.', icon: '✈️' },
    'juggernaut_slayer': { title: 'David vs. Goliath', desc: 'Defeat the massive Juggernaut Boss.', icon: '🦾' },
    'fresh_supplies': { title: 'Fresh Supplies', desc: 'Receive health from defeating a Soldier for the first time without exceeding 100 HP.', icon: '💚' },
    'overcharged': { title: 'Overcharged', desc: 'Increase your suit integrity above 100 HP using the Overheal system.', icon: '⚡' },
    'tactical_drone_denied': { title: 'Tactical Drone Denied', desc: 'Destroy a Controller before destroying any Drones in the current wave.', icon: '📡' },
    'drone_hunter': { title: 'Drone Hunter', desc: 'Destroy 100 Drones.', icon: '🤖' },
    'elite_eliminator': { title: 'Elite Eliminator', desc: 'Destroy 100 Elite Guards.', icon: '🛡️' },
    'boss_slayer': { title: 'Boss Slayer', desc: 'Defeat 10 Juggernaut Bosses.', icon: '💀' },
    'warehouse_survivor': { title: 'Warehouse Survivor', desc: 'Reach Wave 10.', icon: '🏭' },
    'warehouse_champion': { title: 'Warehouse Champion', desc: 'Reach Wave 20.', icon: '🏭' },
    'warehouse_legend': { title: 'Warehouse Legend', desc: 'Reach Wave 50.', icon: '🏭' },
    'no_survivors': { title: 'No Survivors', desc: 'Eliminate every enemy in a wave.', icon: '☠️' }
};

let unlockedAchievements = JSON.parse(localStorage.getItem('tdd_achievements')) || [];

function unlockAchievement(id) {
    if (!ACHIEVEMENTS[id] || unlockedAchievements.includes(id)) return;

    unlockedAchievements.push(id);
    localStorage.setItem('tdd_achievements', JSON.stringify(unlockedAchievements));

    const toast = document.getElementById('achievement-toast');
    document.getElementById('toast-text').innerText = ACHIEVEMENTS[id].title;
    toast.style.top = '20px';
    playSound('heal');

    setTimeout(() => { toast.style.top = '-100px'; }, 4000);
    renderTrophies();

    if (typeof _sendBridgeEvent === 'function') {
        _sendBridgeEvent({
            type: 'achievement_unlock',
            gameId: typeof GAME_ID !== 'undefined' ? GAME_ID : 'tactical_drone_defense_beta',
            data: {
                achievementId: id
            }
        });
    }
}

function renderTrophies() {
    const list = document.getElementById('trophy-list');
    list.innerHTML = '';

    Object.keys(ACHIEVEMENTS).forEach(id => {
        const ach = ACHIEVEMENTS[id];
        const isUnlocked = unlockedAchievements.includes(id);

        const div = document.createElement('div');
        div.className = `trophy-item ${isUnlocked ? '' : 'locked'}`;
        div.innerHTML = `
            <div class="toast-icon">${ach.icon}</div>
            <div class="toast-content">
                <div class="toast-title">${ach.title}</div>
                <div class="toast-desc">${ach.desc}</div>
            </div>
        `;
        list.appendChild(div);
    });
}

// --- MENU SYSTEM ---
let menuState = 'MAIN';
function showMenu(state) {
    menuState = state;
    document.getElementById('menu-main').style.display = state === 'MAIN' ? 'flex' : 'none';
    document.getElementById('menu-pause').style.display = state === 'PAUSED' ? 'flex' : 'none';
    document.getElementById('menu-gameover').style.display = state === 'GAMEOVER' ? 'flex' : 'none';
    document.getElementById('menu-trophy').style.display = state === 'TROPHY' ? 'flex' : 'none';
}

function requestLock() {
    try {
        const lockPromise = document.body.requestPointerLock();
        if (lockPromise !== undefined) lockPromise.catch(e => { console.warn("Pointer lock failed:", e); });
    } catch (e) { console.warn(e); }
}

function updateHUD() {
    document.getElementById('ammo-count').innerText = `${ammo} / ${totalAmmo}`;
    // FIXED: Prevent negative health display
    document.getElementById('health-count').innerText = Math.max(0, Math.ceil(playerHealth));
    const hpPct = Math.max(0, playerHealth);
    // FIXED: Cap visual width at 100% so the bar doesn't break its container
    document.getElementById('health-fill').style.width = `${Math.min(100, hpPct)}%`;

    // FEATURE: Health bar turns Cyan when Overhealed (> 100 HP)
    if (hpPct > 100) { document.getElementById('health-fill').style.backgroundColor = '#00e5ff'; unlockAchievement('overcharged'); }
    else document.getElementById('health-fill').style.backgroundColor = hpPct > 50 ? '#4caf50' : (hpPct > 25 ? '#ffeb3b' : '#f44336');

    document.getElementById('wave-num').innerText = wave;

    if (currentMode === 'DEFEND_PLANE') {
        const pPct = Math.max(0, (planeHealth / MAX_PLANE_HEALTH) * 100);
        document.getElementById('plane-bar-fill').style.width = `${pPct}%`;
        document.getElementById('plane-bar-fill').style.background = pPct > 50 ? 'linear-gradient(90deg, #008ba3, #00e5ff)' : (pPct > 25 ? 'linear-gradient(90deg, #f57f17, #ffff00)' : 'linear-gradient(90deg, #b71c1c, #ff0000)');
    }

    const boss = enemies.find(e => e.userData.type === 'juggernaut');
    if (boss) {
        document.getElementById('boss-hud').style.display = 'block';
        const bPct = Math.max(0, (boss.userData.health / boss.userData.maxHealth) * 100);
        document.getElementById('boss-bar-fill').style.width = `${bPct}%`;
    } else {
        document.getElementById('boss-hud').style.display = 'none';
    }

    const modeBox = document.getElementById('mode-box');
    if (playerStunTimer > 0) {
        modeBox.innerText = `SYSTEM ERROR: STUNNED (${Math.ceil(playerStunTimer)}s)`;
        modeBox.style.color = "#ff0000";
        document.getElementById('crosshair').style.opacity = 0.2;
    }
    else if (isGravityPulled) {
        modeBox.innerText = "GRAVITY CLAMP: JUMP BLOCKED";
        modeBox.style.color = "#ff6200";
        document.getElementById('crosshair').style.opacity = 1.0;
    }
    else if (precisionActive) {
        modeBox.innerText = "PRECISION: ACTIVE (10x DMG)"; modeBox.style.color = "#00ff00";
        document.getElementById('crosshair').style.opacity = 1.0;
    }
    else if (precisionCooldown > 0) {
        modeBox.innerText = `PRECISION: COOLDOWN ${Math.ceil(precisionCooldown)}s`; modeBox.style.color = "#ff0000";
        document.getElementById('crosshair').style.opacity = 1.0;
    }
    else {
        modeBox.innerText = "PRECISION: READY (PRESS Z/D-PAD UP)"; modeBox.style.color = "#ffff00";
        document.getElementById('crosshair').style.opacity = 1.0;
    }

    const critBox = document.getElementById('crit-box');
    if (criticalCooldown > 0) { critBox.innerText = `CRITICAL: COOLDOWN ${Math.ceil(criticalCooldown)}s`; critBox.style.color = "#ff0000"; }
    else {
        if (!(isCrouching || gpCrouching) && lastUncrouchTime > 0 && (performance.now() - lastUncrouchTime < CRITICAL_WINDOW_MS)) { critBox.innerText = "CRITICAL: FIRE NOW!"; critBox.style.color = "#ffaa00"; }
        else { Math.ceil(criticalCooldown) === 0 ? (critBox.innerText = "CRITICAL: READY") : (critBox.innerText = "CRITICAL: READY"); critBox.style.color = "#ffff00"; }
    }

    const radarText = document.getElementById('radar-text');
    if (enemies.length > 0) {
        let minDist = 999; let nearestIsController = false;
        enemies.forEach(e => { const d = e.position.distanceTo(yawObject.position); if (d < minDist) { minDist = d; nearestIsController = e.userData.type === 'controller'; } });
        radarText.innerText = `CONTACT: ${Math.floor(minDist)}m`;
        if (nearestIsController) radarText.style.color = '#00ffff'; else if (minDist < 10) radarText.style.color = '#ff0000'; else radarText.style.color = '#ffaa00';
    } else { radarText.innerText = "AREA CLEAR"; radarText.style.color = '#00ff00'; }
}
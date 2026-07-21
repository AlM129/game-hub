// --- DEVELOPER DEBUG SYSTEM ---
// Tactical Drone Defense v2.0.0-dev40

(function() {
    'use strict';

    // Initialize TDDebug namespace before any command registration
    window.TDDebug = window.TDDebug || {};

    // Only initialize in development builds
    const isDevBuild = typeof ACHIEVEMENT_DEBUG !== 'undefined' && ACHIEVEMENT_DEBUG;
    
    if (!isDevBuild) {
        // Keep empty namespace to avoid console errors
        return;
    }

    console.log('%c[TDDebug] Developer Debug System Initialized', 'color: #00ff00; font-size: 14px; font-weight: bold;');
    console.log('%c[TDDebug] v2.0.0-dev40 | Type TDDebug.help() for available commands', 'color: #00ffff;');

    // ==========================================
    // WAVE COMMANDS
    // ==========================================

    /**
     * Set the current wave number
     * @param {number} number - The wave number to set
     */
    window.TDDebug.setWave = function(number) {
        const v = Number(number);
        if (!Number.isFinite(v) || v < 1 || !Number.isInteger(v)) {
            console.warn('[TDDebug] Invalid wave number. Must be a positive integer.');
            return;
        }
        
        const oldWave = wave;
        wave = v;
        updateHUD();
        
        console.log(`[TDDebug] Wave changed: ${oldWave} → ${wave}`);
        
        // Check for wave milestone achievements
        if (wave === 10) unlockAchievement('warehouse_survivor');
        if (wave === 20) unlockAchievement('warehouse_champion');
        if (wave === 50) unlockAchievement('warehouse_legend');
    };

    /**
     * Start the current wave immediately
     */
    window.TDDebug.startWave = function() {
        console.log(`[TDDebug] Starting wave ${wave}...`);
        startNextWave();
    };

    /**
     * Complete current wave and advance to next
     */
    window.TDDebug.skipWave = function() {
        const oldWave = wave;
        
        // Clear all enemies
        enemies.forEach(e => {
            scene.remove(e);
            score += 10;
        });
        enemies.length = 0;
        
        // Clear enemy bullets
        enemyBullets.forEach(b => scene.remove(b.mesh));
        enemyBullets.length = 0;
        
        // Advance wave
        wave++;
        updateHUD();
        
        console.log(`[TDDebug] Wave completed: ${oldWave} → ${wave}`);
        showMessage(`WAVE ${wave} INCOMING`);
        
        // Start next wave after delay
        setTimeout(() => {
            startNextWave();
        }, 1000);
    };

    // ==========================================
    // ENEMY SPAWN COMMANDS
    // ==========================================

    /**
     * Spawn enemies of a specific type
     * @param {string} type - Enemy type (soldier, elite, controller, drone, rogueDrone, juggernaut)
     * @param {number} amount - Number of enemies to spawn
     */
    window.TDDebug.spawnEnemy = function(type, amount = 1) {
        const validTypes = ['soldier', 'elite', 'controller', 'drone', 'rogueDrone', 'juggernaut'];
        
        if (!validTypes.includes(type)) {
            console.warn(`[TDDebug] Invalid enemy type: ${type}. Valid types: ${validTypes.join(', ')}`);
            return;
        }
        
        const count = Number(amount);
        if (!Number.isFinite(count) || count < 1 || !Number.isInteger(count)) {
            console.warn('[TDDebug] Invalid amount. Must be a positive integer.');
            return;
        }
        
        for (let i = 0; i < count; i++) {
            spawnEnemy(type);
        }
        
        console.log(`[TDDebug] Spawned ${count}x ${type}(s)`);
    };

    /**
     * Spawn a Juggernaut boss
     */
    window.TDDebug.spawnJuggernaut = function() {
        spawnEnemy('juggernaut');
        console.log('[TDDebug] Juggernaut boss spawned');
    };

    /**
     * Spawn a Rogue Drone
     */
    window.TDDebug.spawnRogueDrone = function() {
        spawnEnemy('rogueDrone');
        console.log('[TDDebug] Rogue Drone spawned');
    };

    /**
     * Spawn all boss-tier enemies
     */
    window.TDDebug.spawnAllBossEnemies = function() {
        spawnEnemy('juggernaut');
        spawnEnemy('rogueDrone');
        spawnEnemy('rogueDrone');
        console.log('[TDDebug] Spawned: 1x Juggernaut, 2x Rogue Drones');
    };

    // ==========================================
    // PLAYER TESTING COMMANDS
    // ==========================================

    /**
     * Toggle god mode (invincibility)
     * @param {boolean} enabled - Enable or disable god mode
     */
    window.TDDebug.godMode = function(enabled) {
        if (enabled === undefined) {
            // Toggle mode
            window.TDDebug._godMode = !window.TDDebug._godMode;
        } else {
            window.TDDebug._godMode = Boolean(enabled);
        }
        
        if (window.TDDebug._godMode) {
            console.log('[TDDebug] God Mode: ENABLED');
            showMessage('DEBUG: GOD MODE ENABLED');
        } else {
            console.log('[TDDebug] God Mode: DISABLED');
            showMessage('DEBUG: GOD MODE DISABLED');
        }
    };

    // God mode is handled directly in main.js takeDamage() function
    // which checks window.TDDebug._godMode before applying damage

    /**
     * Set player health
     * @param {number} amount - Health amount to set
     */
    window.TDDebug.setHealth = function(amount) {
        const hp = Number(amount);
        if (!Number.isFinite(hp) || hp < 0) {
            console.warn('[TDDebug] Invalid health amount. Must be a non-negative number.');
            return;
        }
        
        playerHealth = hp;
        updateHUD();
        console.log(`[TDDebug] Player health set to: ${playerHealth}`);
    };

    /**
     * Give precision buff (10x damage)
     */
    window.TDDebug.givePrecision = function() {
        precisionActive = true;
        precisionCooldown = 0;
        console.log('[TDDebug] Precision buff granted');
        showMessage('DEBUG: PRECISION READY');
    };

    /**
     * Clear all enemies from the map
     */
    window.TDDebug.clearEnemies = function() {
        const count = enemies.length;
        
        enemies.forEach(e => {
            scene.remove(e);
            score += 10;
        });
        enemies.length = 0;
        
        // Clear enemy bullets too
        enemyBullets.forEach(b => scene.remove(b.mesh));
        enemyBullets.length = 0;
        
        console.log(`[TDDebug] Cleared ${count} enemies`);
        showMessage(`DEBUG: CLEARED ${count} ENEMIES`);
    };

    // ==========================================
    // ACHIEVEMENT COMMANDS
    // ==========================================

    /**
     * Unlock a specific achievement
     * @param {string} id - Achievement ID
     */
    window.TDDebug.unlockAchievement = function(id) {
        if (!ACHIEVEMENTS[id]) {
            console.warn(`[TDDebug] Invalid achievement ID: ${id}`);
            console.log('[TDDebug] Valid achievements:', Object.keys(ACHIEVEMENTS).join(', '));
            return;
        }
        
        unlockAchievement(id);
        console.log(`[TDDebug] Achievement unlocked: ${ACHIEVEMENTS[id].title} (${id})`);
    };

    /**
     * Unlock all achievements
     */
    window.TDDebug.unlockAllAchievements = function() {
        Object.keys(ACHIEVEMENTS).forEach(id => {
            if (!unlockedAchievements.includes(id)) {
                unlockedAchievements.push(id);
            }
        });
        
        localStorage.setItem('tdd_achievements', JSON.stringify(unlockedAchievements));
        renderTrophies();
        
        console.log(`[TDDebug] Unlocked all ${Object.keys(ACHIEVEMENTS).length} achievements`);
        showMessage('DEBUG: ALL ACHIEVEMENTS UNLOCKED');
    };

    /**
     * Reset all achievements
     */
    window.TDDebug.resetAchievements = function() {
        const count = unlockedAchievements.length;
        localStorage.removeItem('tdd_achievements');
        unlockedAchievements = [];
        renderTrophies();
        
        console.log(`[TDDebug] Reset ${count} achievements`);
        showMessage('DEBUG: ACHIEVEMENTS RESET');
    };

    // ==========================================
    // WEAPON TESTING COMMANDS
    // ==========================================

    /**
     * Give weapon upgrade (reload + full ammo)
     */
    window.TDDebug.giveWeaponUpgrade = function() {
        ammo = CLIP_SIZE;
        totalAmmo = 999;
        isReloading = false;
        updateHUD();
        
        console.log('[TDDebug] Weapon upgraded: Full ammo granted');
        showMessage('DEBUG: AMMO RESTOCKED');
    };

    /**
     * Reset weapons to default state
     */
    window.TDDebug.resetWeapons = function() {
        ammo = CLIP_SIZE;
        totalAmmo = 120;
        isReloading = false;
        precisionActive = false;
        precisionCooldown = 0;
        criticalCooldown = 0;
        updateHUD();
        
        console.log('[TDDebug] Weapons reset to default');
        showMessage('DEBUG: WEAPONS RESET');
    };

    /**
     * Test damage output (spawns a target dummy)
     * @param {number} amount - Damage amount to display
     */
    window.TDDebug.testDamage = function(amount) {
        const dmg = Number(amount) || GUN_DAMAGE;
        console.log(`[TDDebug] Base damage: ${GUN_DAMAGE}`);
        console.log(`[TDDebug] Precision damage (10x): ${GUN_DAMAGE * 10}`);
        console.log(`[TDDebug] Critical damage (2x): ${GUN_DAMAGE * 2}`);
        console.log(`[TDDebug] Airborne Critical (3x): ${GUN_DAMAGE * 3}`);
        console.log(`[TDDebug] Test damage value: ${dmg}`);
        showMessage(`DEBUG: DAMAGE TEST = ${dmg}`);
    };

    // ==========================================
    // GAME STATE COMMANDS
    // ==========================================

    /**
     * Display comprehensive game state information
     */
    window.TDDebug.status = function() {
        const boss = enemies.find(e => e.userData.type === 'juggernaut');
        
        const status = {
            wave: wave,
            playerHealth: Math.ceil(playerHealth),
            enemyCount: enemies.length,
            activeBoss: boss ? 'Juggernaut (HP: ' + Math.ceil(boss.userData.health) + '/' + boss.userData.maxHealth + ')' : 'None',
            activeTimers: {
                precisionCooldown: Math.ceil(precisionCooldown),
                criticalCooldown: Math.ceil(criticalCooldown),
                playerStun: Math.ceil(playerStunTimer),
                disruption: Math.ceil(playerDisruptionTimer)
            },
            achievementProgress: {
                unlocked: unlockedAchievements.length,
                total: Object.keys(ACHIEVEMENTS).length,
                remaining: Object.keys(ACHIEVEMENTS).length - unlockedAchievements.length
            },
            score: score,
            ammo: `${ammo} / ${totalAmmo}`,
            godMode: window.TDDebug._godMode || false
        };
        
        console.log('%c[TDDebug] === GAME STATE ===', 'color: #00ffff; font-size: 12px; font-weight: bold;');
        console.log(`%cWave: ${status.wave}`, 'color: #fff;');
        console.log(`%cPlayer Health: ${status.playerHealth}`, 'color: #0f0;');
        console.log(`%cEnemy Count: ${status.enemyCount}`, 'color: #f00;');
        console.log(`%cActive Boss: ${status.activeBoss}`, 'color: #f0f;');
        console.log('%cActive Timers:', 'color: #ff0;', status.activeTimers);
        console.log('%cAchievement Progress:', 'color: #0ff;', status.achievementProgress);
        console.log(`%cScore: ${status.score}`, 'color: #fff;');
        console.log(`%cAmmo: ${status.ammo}`, 'color: #fff;');
        console.log(`%cGod Mode: ${status.godMode}`, 'color: #f0f;');
        
        return status;
    };

    // ==========================================
    // HELP COMMAND
    // ==========================================

    /**
     * Display all available debug commands
     */
    window.TDDebug.help = function() {
        const helpText = `
%c[TDDebug] === AVAILABLE COMMANDS ===%c

%c--- WAVE COMMANDS ---%c
TDDebug.setWave(number)      - Set current wave number
TDDebug.startWave()          - Start current wave
TDDebug.skipWave()           - Complete wave and advance

%c--- ENEMY SPAWN COMMANDS ---%c
TDDebug.spawnEnemy(type, amount) - Spawn enemies (soldier, elite, controller, drone, rogueDrone, juggernaut)
TDDebug.spawnJuggernaut()    - Spawn Juggernaut boss
TDDebug.spawnRogueDrone()    - Spawn Rogue Drone
TDDebug.spawnAllBossEnemies()- Spawn all boss-tier enemies

%c--- PLAYER TESTING ---%c
TDDebug.godMode(true/false)  - Toggle invincibility
TDDebug.setHealth(amount)     - Set player health
TDDebug.givePrecision()      - Grant precision buff (10x damage)
TDDebug.clearEnemies()       - Remove all enemies

%c--- ACHIEVEMENT COMMANDS ---%c
TDDebug.unlockAchievement(id) - Unlock specific achievement
TDDebug.unlockAllAchievements() - Unlock all achievements
TDDebug.resetAchievements()   - Reset all achievements

%c--- WEAPON COMMANDS ---%c
TDDebug.giveWeaponUpgrade()   - Full ammo + reload
TDDebug.resetWeapons()        - Reset weapons to default
TDDebug.testDamage(amount)    - Display damage values

%c--- GAME STATE ---%c
TDDebug.status()              - Show comprehensive game state
TDDebug.help()                - Display this help message
        `;
        
        console.log(helpText);
        console.log('%c[TDDebug] Example: TDDebug.setWave(10)', 'color: #ffff00;');
        console.log('%c[TDDebug] Example: TDDebug.spawnEnemy("juggernaut", 1)', 'color: #ffff00;');
        console.log('%c[TDDebug] Example: TDDebug.godMode(true)', 'color: #ffff00;');
    };

    // ==========================================
    // MIGRATE LEGACY DEBUG FUNCTIONS
    // ==========================================

    // Map legacy debug functions to TDDebug namespace (NOT the other way around)
    // This ensures legacy window.debugXxx functions still work by delegating to TDDebug

    if (typeof window.debugSetWave === 'function') {
        console.log('[TDDebug] Legacy debugSetWave found, mapping to TDDebug.setWave');
        // Don't overwrite TDDebug.setWave - instead, make legacy point to TDDebug
        window.debugSetWave = window.TDDebug.setWave;
    }

    if (typeof window.debugUnlockAchievement === 'function') {
        console.log('[TDDebug] Legacy debugUnlockAchievement found, mapping to TDDebug.unlockAchievement');
        window.debugUnlockAchievement = window.TDDebug.unlockAchievement;
    }

    if (typeof window.debugResetAchievements === 'function') {
        console.log('[TDDebug] Legacy debugResetAchievements found, mapping to TDDebug.resetAchievements');
        window.debugResetAchievements = window.TDDebug.resetAchievements;
    }

    if (typeof window.debugSpawnRogueDrone === 'function') {
        console.log('[TDDebug] Legacy debugSpawnRogueDrone found, mapping to TDDebug.spawnRogueDrone');
        window.debugSpawnRogueDrone = window.TDDebug.spawnRogueDrone;
    }

    if (typeof window.debugAddDroneKills === 'function') {
        console.log('[TDDebug] Legacy debugAddDroneKills found, mapping to TDDebug.addDroneKills');
        window.debugAddDroneKills = window.TDDebug.addDroneKills;
    }

    if (typeof window.debugAddEliteKills === 'function') {
        console.log('[TDDebug] Legacy debugAddEliteKills found, mapping to TDDebug.addEliteKills');
        window.debugAddEliteKills = window.TDDebug.addEliteKills;
    }

    if (typeof window.debugAddBossKills === 'function') {
        console.log('[TDDebug] Legacy debugAddBossKills found, mapping to TDDebug.addBossKills');
        window.debugAddBossKills = window.TDDebug.addBossKills;
    }

    console.log('%c[TDDebug] System ready. Type TDDebug.help() to see all commands.', 'color: #00ff00;');

})();
// --- PROGRESSIVE WAVE MANAGER ---
function startNextWave() {
    console.log("startNextWave() begin, wave:", wave);
    anyDroneKilled = false;
    // Wave milestone achievements: trigger exactly when the new wave value is reached
    if (wave === 10) unlockAchievement('warehouse_survivor');
    if (wave === 20) unlockAchievement('warehouse_champion');
    if (wave === 50) unlockAchievement('warehouse_legend');
    if (wave % 5 === 0) {
        let j = 1, e = 3, s = 0, d = 0, c = 0;

        let t = 0; // Rogue Drones
        if (wave === 5) { j = 1; e = 0; s = 0; d = 0; c = 0; t = 0; }
        else if (wave === 10) { j = 1; e = 0; s = 0; d = 3; c = 0; t = 2; }
        else if (wave === 15) { j = 1; e = 1; s = 0; d = 4; c = 2; t = 3; }
        else { j = 1; e = 1; s = 2; d = 9; c = 4; t = 4; }

        for (let i = 0; i < j; i++) spawnEnemy('juggernaut');
        for (let i = 0; i < t; i++) spawnEnemy('rogueDrone');
        for (let i = 0; i < e; i++) spawnEnemy('elite');
        for (let i = 0; i < s; i++) spawnEnemy('soldier');
        for (let i = 0; i < d; i++) spawnEnemy('drone');
        for (let i = 0; i < c; i++) spawnEnemy('controller');

        showMessage(`WARNING: THREAT LEVEL ${wave} - JUGGERNAUT DETECTED!`);
    } else {
        if (wave % 3 === 0) spawnEnemy('controller');

        let eliteCount = wave > 5 ? wave - 5 : 0;
        for (let k = 0; k < eliteCount; k++) spawnEnemy('elite');

        const count = Math.max(1, 2 + Math.ceil(wave * 1.5) - eliteCount);
        for (let k = 0; k < count; k++) spawnEnemy();
    }
}

function triggerTowerCannon() {
    if (cannonCooldown > 0) return;
    cannonCooldown = CANNON_COOLDOWN_TIME;
    playSound('cannon');

    document.getElementById('damage-overlay').style.background = 'radial-gradient(circle, transparent 20%, rgba(255,255,0,0.8) 100%)';
    document.getElementById('damage-overlay').style.opacity = 1.0;
    setTimeout(() => {
        document.getElementById('damage-overlay').style.opacity = 0;
        document.getElementById('damage-overlay').style.background = 'radial-gradient(circle, transparent 60%, rgba(180,0,0,0.5) 100%)';
    }, 500);

    showMessage("CANNON FIRED!");
    unlockAchievement('heavy_artillery');

    enemies.forEach(e => {
        e.userData.health = 0;
        createExplosion(e.position, 0xffaa00);
        scene.remove(e);
        score += 10;
    });
    enemies.length = 0;

    console.trace("wave changed in triggerTowerCannon", wave);
    wave++; showMessage(`WAVE ${wave} SECURED`);
    if (wave >= 5 && currentMode === 'DEFEND_PLANE') unlockAchievement('airfield_defender');

    setTimeout(() => { startNextWave(); }, 3000);
}

function spawnEnemy(forceType = null, forcePos = null) {
    let type = forceType;
    if (!type) {
        const r = Math.random();
        if (r < 0.2 && wave > 1) type = 'controller';
        else if (r < 0.6) type = 'soldier';
        else type = 'drone';
    }

    let enemyGroup = new THREE.Group(); let rig = null; let droneData = null;
    if (type === 'drone') { droneData = createDrone(false); droneData.root.rotation.y += Math.PI; enemyGroup.add(droneData.root); }
    else if (type === 'rogueDrone') { droneData = createRogueDrone(); droneData.root.rotation.y += Math.PI; enemyGroup.add(droneData.root); }
    else if (type === 'juggernaut') { rig = createJuggernautBoss(); rig.root.rotation.y += Math.PI; enemyGroup.add(rig.root); }
    else if (type === 'elite') { rig = createEliteGuard(); rig.root.rotation.y += Math.PI; enemyGroup.add(rig.root); }
    else { rig = createHumanoid(type); rig.root.rotation.y += Math.PI; enemyGroup.add(rig.root); }

    let hp = 50, spd = 3;
    if (type === 'soldier') { hp = 80; spd = 3; }
    if (type === 'controller') { hp = 120; spd = currentMode === 'DEFEND_PLANE' ? 5.5 : 6.7; }
    if (type === 'drone') { hp = 40; spd = 3.0; }
    if (type === 'rogueDrone') { hp = 80; spd = 3.5; }
    if (type === 'elite') { hp = 160; spd = 1.5; }
    if (type === 'juggernaut') { hp = 2400; spd = 5; }

    const maxHp = hp + (wave * 10);
    const hpBarMesh = createHealthBar(enemyGroup);
    if (type === 'juggernaut') { hpBarMesh.parent.scale.set(4, 4, 4); hpBarMesh.parent.position.y = 8.0; }

    if (forcePos) {
        enemyGroup.position.copy(forcePos);
    } else {
        const spawnRadius = currentMode === 'DEFEND_PLANE' ? 150 : 30;
        if (type === 'controller' || type === 'juggernaut') {
            let valid = false, attempts = 0;
            while (!valid && attempts < 20) {
                enemyGroup.position.set((Math.random() - 0.5) * spawnRadius * 2, 0, (Math.random() - 0.5) * spawnRadius * 2);
                if (!checkEnemyCollision(enemyGroup.position)) valid = true;
                attempts++;
            }
            if (!valid) enemyGroup.position.set(0, 0, -spawnRadius);
        } else {
            let attempts = 0, valid = false;
            while (!valid && attempts < 20) {
                const angle = Math.random() * Math.PI * 2; const dist = spawnRadius + Math.random() * 20;
                enemyGroup.position.set(Math.cos(angle) * dist, type === 'drone' ? 2 : 0, Math.sin(angle) * dist);
                if (!checkEnemyCollision(enemyGroup.position)) valid = true;
                attempts++;
            }
        }
    }

    enemyGroup.userData = { type: type, maxHealth: maxHp, health: maxHp, speed: spd, id: Math.random(), shootTimer: Math.random() * 2, rig: rig, droneData: droneData, hpBar: hpBarMesh };
    scene.add(enemyGroup); enemies.push(enemyGroup);

    // Start boss music when Juggernaut spawns
    if (type === 'juggernaut') {
        startBossMusic();
    }
}
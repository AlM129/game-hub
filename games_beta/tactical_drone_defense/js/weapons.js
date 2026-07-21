// --- WEAPONS ---
const gunGroup = new THREE.Group();
const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.8 });
const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.5), gunMat);
const gunBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4), gunMat);
gunBarrel.rotation.x = Math.PI / 2; gunBarrel.position.z = -0.4; gunBarrel.position.y = 0.05;
const holoBase = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.02, 0.1), gunMat); holoBase.position.set(0, 0.09, -0.1);
const holoLens = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.04), new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide })); holoLens.position.set(0, 0.12, -0.1);
gunGroup.add(gunBody, gunBarrel, holoBase, holoLens);
const muzzleLight = new THREE.PointLight(0xffaa00, 0, 10); muzzleLight.position.set(0, 0.1, -0.8); gunGroup.add(muzzleLight);

let recoilAmount = 0;

function applyPlayerSkin() {
    if (currentPlayerModel) yawObject.remove(currentPlayerModel);

    if (currentSkin === 'TECH_OPERATOR') currentPlayerRig = createTechOperator();
    else if (currentSkin === 'JETPACK_PILOT') currentPlayerRig = createJetpackPilot();
    else if (currentSkin === 'STEALTH_PILOT') currentPlayerRig = createStealthPilot();
    else if (currentSkin === 'NEON_CYBORG') currentPlayerRig = createNeonCyborg();
    else if (currentSkin === 'HAZMAT_SPECIALIST') currentPlayerRig = createHazmatSpecialist();

    currentPlayerModel = currentPlayerRig.root;
    currentPlayerModel.scale.setScalar(currentPlayerRig.baseScale);
    currentPlayerModel.position.y = currentPlayerRig.baseY;

    if (isThirdPerson) {
        currentPlayerRig.armR.add(gunGroup);
        gunGroup.rotation.set(-Math.PI / 2, 0, 0);
        gunGroup.position.copy(currentPlayerRig.gunOffset);
        currentPlayerModel.visible = true;
    } else {
        pitchObject.add(gunGroup);
        gunGroup.rotation.set(0, 0, 0);
        gunGroup.position.set(0.3, -0.25, -0.4);
        currentPlayerModel.visible = false;
    }
    yawObject.add(currentPlayerModel);
}

function reload() {
    if (isReloading || ammo === CLIP_SIZE || totalAmmo <= 0) return;
    isReloading = true; playSound('reload');
    setTimeout(() => { const take = Math.min(CLIP_SIZE - ammo, totalAmmo); ammo += take; totalAmmo -= take; if (totalAmmo === 0) totalAmmo = 60; isReloading = false; updateHUD(); }, RELOAD_TIME * 1000);
}

function shoot() {
    if (isReloading || ammo <= 0) { playSound('empty'); reload(); return; }
    if (performance.now() - lastShotTime < GUN_FIRE_RATE * 1000) return;
    lastShotTime = performance.now(); ammo--; updateHUD(); playSound('shoot');

    recoilAmount += 0.05; gunGroup.position.z += 0.15;

    let isPrecisionShot = false; let isCriticalShot = false;
    if (precisionActive) { isPrecisionShot = true; precisionActive = false; precisionCooldown = PRECISION_COOLDOWN_TIME; }
    else if (!(isCrouching || gpCrouching) && criticalCooldown <= 0 && lastUncrouchTime > 0 && (performance.now() - lastUncrouchTime < CRITICAL_WINDOW_MS)) {
        isCriticalShot = true; criticalCooldown = CRITICAL_COOLDOWN_TIME; lastUncrouchTime = 0;
    }

    muzzleLight.intensity = 3; setTimeout(() => { muzzleLight.intensity = 0; }, 50);

    const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(scene.children, true);
    let hitObject = null;

    for (let i = 0; i < intersects.length; i++) {
        let obj = intersects[i].object;

        // Removed the bypass! Player bullets will now properly hit barrels and map obstacles
        if (obj.isMesh && obj !== gunBody && !currentPlayerModel.children.includes(obj)) {
            hitObject = intersects[i]; break;
        }
    }

    const startPos = new THREE.Vector3(0, 0.05, -0.4);
    startPos.applyMatrix4(gunGroup.matrixWorld);
    let endPos = new THREE.Vector3();

    if (hitObject) {
        endPos.copy(hitObject.point); let obj = hitObject.object; while (obj.parent && obj.parent !== scene) obj = obj.parent;
        if (obj.userData && obj.userData.health) {
            let dmg = GUN_DAMAGE;
            if (isPrecisionShot) {
                dmg *= 10; playSound('crit'); document.getElementById('crosshair').style.transform = 'translate(-50%, -50%) scale(1.5)'; setTimeout(() => document.getElementById('crosshair').style.transform = 'translate(-50%, -50%) scale(1)', 100); showMessage("PRECISION STRIKE! (10x DMG)");
                unlockAchievement('surgical_precision');
            }
            else if (isCriticalShot) {
                if (!canJump) {
                    dmg *= 3; playSound('crit'); document.getElementById('crosshair').style.transform = 'translate(-50%, -50%) scale(1.4)'; setTimeout(() => document.getElementById('crosshair').style.transform = 'translate(-50%, -50%) scale(1)', 100); showMessage("AIR CRITICAL! (3x DMG)");
                    unlockAchievement('death_from_above');
                } else {
                    dmg *= 2; playSound('crit'); document.getElementById('crosshair').style.transform = 'translate(-50%, -50%) scale(1.3)'; setTimeout(() => document.getElementById('crosshair').style.transform = 'translate(-50%, -50%) scale(1)', 100); showMessage("CRITICAL HIT! (2x DMG)");
                }
            }
            else { playSound('hit'); }

            obj.userData.health -= dmg; const pct = Math.max(0, obj.userData.health / obj.userData.maxHealth);
            if (obj.userData.hpBar) { obj.userData.hpBar.scale.x = pct; obj.userData.hpBar.material.color.setHex(pct > 0.5 ? 0x00ff00 : 0xff0000); }

            if (obj.userData.type === 'drone') {
                const mat = obj.userData.droneData.body.material;
                mat.emissive.setHex(0xffffff);
                setTimeout(() => mat.emissive.setHex(mat.color.getHex()), 50);
            } else {
                const body = obj.userData.rig.torso;
                const flashMesh = (mesh) => {
                    if (mesh.userData.origColor === undefined) mesh.userData.origColor = mesh.material.color.getHex();
                    mesh.material.color.setHex(0xffffff);
                    setTimeout(() => mesh.material.color.setHex(mesh.userData.origColor), 50);
                };
                if (body.isMesh) flashMesh(body);
                else body.traverse(child => { if (child.isMesh) flashMesh(child); });
            }

            if (obj.userData.health <= 0) {
                // Batch 1 session counters (do not persist)
                if (obj.userData.type === 'drone') {
                    droneKillCount++;
                    if (droneKillCount >= 100) unlockAchievement('drone_hunter');
                    anyDroneKilled = true;
                }
                if (obj.userData.type === 'elite') {
                    eliteKillCount++;
                    if (eliteKillCount >= 100) unlockAchievement('elite_eliminator');
                }
                if (obj.userData.type === 'juggernaut') {
                    bossKillCount++;
                    if (bossKillCount >= 10) unlockAchievement('boss_slayer');
                }

                unlockAchievement('first_scrap');
                if (obj.userData.type === 'juggernaut') {
                    unlockAchievement('juggernaut_slayer');
                    // Stop boss music and resume normal gameplay music
                    stopBossMusic();
                    // FEATURE: Massive heal for killing the boss
                    if (playerHealth > 0) { playerHealth += 200; playSound('heal'); showMessage("TITAN DESTROYED! +200 HP"); }
                }
                else if (obj.userData.type === 'soldier' && Math.random() < 0.4 && playerHealth > 0) {
                    // FEATURE: Overheal unlocked (removed max 100 cap)
                    playerHealth += 20; playSound('heal'); showMessage("HEALED +20");
                    if (playerHealth <= 100) unlockAchievement('fresh_supplies');
                } else if (
                    obj.userData.type === 'controller' &&
                    !anyDroneKilled &&
                    enemies.filter(e => e.userData.type === 'controller').length === 1
                ) {
                    unlockAchievement('tactical_drone_denied');
                }

                // Rogue Drone shutdown effect (EMP)
                if (obj.userData.type === 'rogueDrone') {
                    const dd = obj.userData.droneData;
                    // Eye flicker effect
                    if (dd.eye) {
                        dd.eye.material.color.setHex(0x550000);
                        for (let f = 0; f < 3; f++) {
                            setTimeout(() => {
                                if (dd.eye) dd.eye.material.color.setHex(f % 2 === 0 ? 0xff0000 : 0x550000);
                            }, f * 100);
                        }
                    }
                    // Core power down
                    if (dd.core) {
                        dd.core.material.emissiveIntensity = 0;
                    }
                    // Light fade
                    if (dd.light) {
                        dd.light.intensity = 0;
                    }
                    // Armor loses glow
                    if (dd.body) {
                        dd.body.material.emissiveIntensity = 0;
                    }
                } else {
                    createExplosion(obj.position, (obj.userData.type === 'drone') ? 0xffaa00 : (obj.userData.type === 'soldier' ? 0x00ff00 : 0x00ffff));
                }
                scene.remove(obj); enemies.splice(enemies.indexOf(obj), 1); score += 10;
                if (enemies.length === 0) {
                    // Unlock 'No Survivors' if player is alive when wave clears
                    if (playerHealth > 0) unlockAchievement('no_survivors');
                    console.trace("wave changed in enemy-clear progression", wave);
                    wave++;
                    if (obj.userData.type !== 'juggernaut') showMessage(`WAVE ${wave} INCOMING`);
                    else setTimeout(() => { showMessage(`WAVE ${wave} INCOMING`); }, 2000);

                    if (wave >= 5 && currentMode === 'SURVIVAL') unlockAchievement('warehouse_veteran');
                    if (wave >= 5 && currentMode === 'DEFEND_PLANE') unlockAchievement('airfield_defender');

                    setTimeout(() => {
                        startNextWave();
                    }, 3000);
                }
            }
        } else {
            const spark = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.05), new THREE.MeshBasicMaterial({ color: 0xaaaaaa }));
            spark.position.copy(hitObject.point); scene.add(spark); particles.push({ mesh: spark, vel: new THREE.Vector3(0, 0, 0), life: 0.1 });
        }
    } else raycaster.ray.at(50, endPos);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([startPos, endPos]), new THREE.LineBasicMaterial({ color: (isCrouching || gpCrouching) ? 0x00ffff : 0xffff00 }));
    scene.add(line); setTimeout(() => scene.remove(line), 40);
}
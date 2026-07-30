// --- GAME CONSTANTS ---
const PLAYER_SPEED = 2.53;
const SPRINT_SPEED = 4.38;
const JUMP_FORCE = 15.0;
const GRAVITY = 27.5;

const GUN_DAMAGE = 25;
const GUN_FIRE_RATE = 0.59;
const CLIP_SIZE = 30;
const RELOAD_TIME = 1.5;

const PRECISION_COOLDOWN_TIME = 40.0;
const CRITICAL_COOLDOWN_TIME = 5.0;
const CRITICAL_WINDOW_MS = 300;
const CANNON_COOLDOWN_TIME = 30.0;
const MAX_PLANE_HEALTH = 1500;

// ==========================================
// GAME HUB BRIDGE
// ==========================================
const GAME_ID = 'tactical_drone_defense_beta';
const VERSION = '2.0.0-dev40';
const CHANNEL = 'beta';

// True when this session was launched from the Game Hub launcher
const _fromHub = sessionStorage.getItem('game-hub-launched') === '1';

let _bridgeStartSent = false;

// LocalStorage queue transport — works across full-page navigation
const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';

function _sendBridgeEvent(event) {
    try {
        const raw = localStorage.getItem(BRIDGE_QUEUE_KEY);
        const queue = raw ? JSON.parse(raw) : [];
        if (Array.isArray(queue)) {
            queue.push(event);
            localStorage.setItem(BRIDGE_QUEUE_KEY, JSON.stringify(queue));
        }
    } catch (_) {
        // Launcher unavailable or storage full — continue normally
    }
}

function notifyGameStarted() {
    if (_bridgeStartSent) return;
    _bridgeStartSent = true;
    _sendBridgeEvent({
        type:   'game_started',
        gameId: GAME_ID,
        data:   { version: VERSION, channel: CHANNEL, startedAt: Date.now() }
    });
    if (_fromHub) {
        console.log(`GameHub bridge: game_started sent (${CHANNEL} v${VERSION})`);
    }
}

function notifyGameClosed() {
    _sendBridgeEvent({
        type:   'game_closed',
        gameId: GAME_ID
    });
    // Clear the handshake so a subsequent direct launch is clean
    sessionStorage.removeItem('game-hub-launched');
    if (_fromHub) {
        console.log('GameHub bridge: game_closed sent');
    }
}


// --- THREE.JS SETUP & 3RD PERSON CAMERA ---
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
const controls = { isLocked: false, getObject: function () { return camera; } };

const yawObject = new THREE.Object3D();
scene.add(yawObject);

const pitchObject = new THREE.Object3D();
pitchObject.position.y = 1.7; // Default Tall Height
yawObject.add(pitchObject);

pitchObject.add(camera);
camera.position.set(0.7, 0.15, 2.2);

const onMouseMove = (event) => {
    if (!controls.isLocked) return;
    yawObject.rotation.y -= event.movementX * 0.002;
    pitchObject.rotation.x -= event.movementY * 0.002;
    pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObject.rotation.x));
};
document.addEventListener('mousemove', onMouseMove, false);

// --- GAME STATE VARIABLES ---
let currentMode = 'SURVIVAL';
let activeMap = '';
let isThirdPerson = true;
let isDead = false;

let lastTime = performance.now();
const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let moveState = { forward: false, backward: false, left: false, right: false };
let canJump = false;

let isCrouching = false, isSprinting = false, lastWPressTime = 0;
let gpFiring = false, gpCrouching = false, gpSprint = false, gpLastCrouching = false;
const gpLastButtons = [];

let precisionCooldown = 0, precisionActive = false, criticalCooldown = 0, lastUncrouchTime = 0;
let isFiring = false, currentCameraHeight = 1.7;
let anyDroneKilled = false;
// Session-only counters for Batch 1 achievements
let droneKillCount = 0, eliteKillCount = 0, bossKillCount = 0;

let playerStunTimer = 0;
let isGravityPulled = false; // Magne-Gravity Pull mechanic
let playerDisruptionTimer = 0; // Rogue Drone interference effect

let playerHealth = 100, ammo = CLIP_SIZE, totalAmmo = 120, isReloading = false, lastShotTime = 0, score = 0, wave = 1;

let planeHealth = MAX_PLANE_HEALTH;
let cannonCooldown = 0;
let cannonConsole = null;
let planeCenter = new THREE.Vector3(0, 0, 0);
window.ACHIEVEMENT_DEBUG = true;

// --- ASSETS & WORLD BUILDER ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

let worldMeshes = [];
let obstacles = [];

const floorCanvas = document.createElement('canvas'); floorCanvas.width = 512; floorCanvas.height = 512;
const ctx = floorCanvas.getContext('2d'); ctx.fillStyle = '#444444'; ctx.fillRect(0, 0, 512, 512);
for (let i = 0; i < 20; i++) { ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath(); ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 50, 0, Math.PI * 2); ctx.fill(); }
const floorTexture = new THREE.CanvasTexture(floorCanvas); floorTexture.wrapS = THREE.RepeatWrapping; floorTexture.wrapT = THREE.RepeatWrapping;
const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.8, metalness: 0.2 });
const wallMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
const barrelMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.5, metalness: 0.4 });
const barrelRimMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5 });
const barrelGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.5, 16);

function createCeilingLight(x, y, z) {
    const light = new THREE.PointLight(0xffaa55, 1, 60); light.position.set(x, y, z); light.castShadow = true; scene.add(light); worldMeshes.push(light);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 2), new THREE.MeshBasicMaterial({ color: 0xffaa55 })); mesh.position.set(x, y + 0.5, z); scene.add(mesh); worldMeshes.push(mesh);
}

function createWall(x, y, z, w, h, d) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat); mesh.position.set(x, y, z); mesh.receiveShadow = true; scene.add(mesh); worldMeshes.push(mesh);
}

function createBarrel(x, z) {
    const group = new THREE.Group();
    group.userData.isBarrel = true; // TAG FOR RAYCASTER
    const body = new THREE.Mesh(barrelGeo, barrelMat); body.castShadow = true; body.receiveShadow = true; group.add(body);
    const rim1 = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.1, 16), barrelRimMat); rim1.position.y = 0.6; group.add(rim1);
    const rim2 = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.1, 16), barrelRimMat); rim2.position.y = -0.6; group.add(rim2);
    group.position.set(x, 0.75, z); scene.add(group); worldMeshes.push(group);
    // TAG FOR PROJECTILES
    obstacles.push({ position: group.position, radius: 0.7, topY: 1.5, isBarrel: true });
}

function clearWorld() {
    worldMeshes.forEach(mesh => scene.remove(mesh));
    worldMeshes = [];
    obstacles = [];
    cannonConsole = null;
}

function buildWarehouseMap() {
    scene.background = new THREE.Color(0x202020);
    scene.fog = new THREE.FogExp2(0x202020, 0.015);
    floorTexture.repeat.set(20, 20);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor); worldMeshes.push(floor);

    createWall(0, 7.5, -50, 100, 15, 2); createWall(0, 7.5, 50, 100, 15, 2);
    createWall(-50, 7.5, 0, 2, 15, 100); createWall(50, 7.5, 0, 2, 15, 100);
    createWall(0, 15, 0, 100, 1, 100);

    createCeilingLight(0, 14, 0); createCeilingLight(20, 14, 20); createCeilingLight(-20, 14, -20); createCeilingLight(20, 14, -20); createCeilingLight(-20, 14, 20);

    for (let i = 0; i < 30; i++) {
        const x = (Math.random() - 0.5) * 80, z = (Math.random() - 0.5) * 80;
        if (Math.abs(x) < 5 && Math.abs(z) < 5) continue;
        createBarrel(x, z);
        if (Math.random() > 0.5) createBarrel(x + 1, z);
    }
}

function buildAirfieldMap() {
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.FogExp2(0x87ceeb, 0.002);

    const sunLight = new THREE.DirectionalLight(0xffffff, 0.8);
    sunLight.position.set(100, 200, 50);
    sunLight.castShadow = true;
    scene.add(sunLight); worldMeshes.push(sunLight);

    floorTexture.repeat.set(80, 80);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor); worldMeshes.push(floor);

    createWall(0, 10, -200, 400, 20, 2); createWall(0, 10, 200, 400, 20, 2);
    createWall(-200, 10, 0, 2, 20, 400); createWall(200, 10, 0, 2, 20, 400);

    for (let i = -180; i <= 180; i += 20) {
        const light1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: 0x00ffff })); light1.position.set(-15, 0.1, i); scene.add(light1); worldMeshes.push(light1);
        const light2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.5), new THREE.MeshBasicMaterial({ color: 0x00ffff })); light2.position.set(15, 0.1, i); scene.add(light2); worldMeshes.push(light2);
    }

    const hangarMat = new THREE.MeshStandardMaterial({ color: 0x445566, roughness: 0.6 });
    const lWall = new THREE.Mesh(new THREE.BoxGeometry(2, 20, 60), hangarMat); lWall.position.set(-25, 10, 0); scene.add(lWall); worldMeshes.push(lWall);
    for (let z = -30; z <= 30; z += 5) obstacles.push({ position: new THREE.Vector3(-25, 0, z), radius: 2.5, topY: 20 });
    const rWall = new THREE.Mesh(new THREE.BoxGeometry(2, 20, 60), hangarMat); rWall.position.set(25, 10, 0); scene.add(rWall); worldMeshes.push(rWall);
    for (let z = -30; z <= 30; z += 5) obstacles.push({ position: new THREE.Vector3(25, 0, z), radius: 2.5, topY: 20 });
    const bWall = new THREE.Mesh(new THREE.BoxGeometry(50, 20, 2), hangarMat); bWall.position.set(0, 10, -30); scene.add(bWall); worldMeshes.push(bWall);
    for (let x = -25; x <= 25; x += 5) obstacles.push({ position: new THREE.Vector3(x, 0, -30), radius: 2.5, topY: 20 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(52, 2, 62), hangarMat); roof.position.set(0, 21, 0); scene.add(roof); worldMeshes.push(roof);

    const planeMat = new THREE.MeshStandardMaterial({ color: 0x556677, roughness: 0.4 });
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 30, 16), planeMat); fuselage.rotation.x = Math.PI / 2; fuselage.position.set(0, 3, 0);
    const wingGeo = new THREE.BoxGeometry(40, 1, 6); const wings = new THREE.Mesh(wingGeo, planeMat); wings.position.set(0, 3, 0);
    const tailGeo = new THREE.BoxGeometry(1, 6, 4); const tail = new THREE.Mesh(tailGeo, planeMat); tail.position.set(0, 6, -13);
    scene.add(fuselage); scene.add(wings); scene.add(tail); worldMeshes.push(fuselage, wings, tail);

    obstacles.push({ position: new THREE.Vector3(0, 0, 0), radius: 3, topY: 6, isPlane: true });
    obstacles.push({ position: new THREE.Vector3(10, 0, 0), radius: 6, topY: 3.5, isPlane: true });
    obstacles.push({ position: new THREE.Vector3(-10, 0, 0), radius: 6, topY: 3.5, isPlane: true });

    cannonConsole = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshStandardMaterial({ color: 0xffff00, emissive: 0xaa8800 }));
    cannonConsole.position.set(0, 0.75, 40);
    scene.add(cannonConsole); worldMeshes.push(cannonConsole);
    obstacles.push({ position: cannonConsole.position, radius: 1.0, topY: 1.5 });
}

// --- DAMAGE FUNCTIONS ---
function takeDamage(amount) {
    // God mode check (set via TDDebug.godMode())
    if (window.TDDebug && window.TDDebug._godMode) {
        return;
    }
    if (playerHealth <= 0) return;
    playerHealth -= amount; updateHUD();
    document.getElementById('damage-overlay').style.opacity = 0.8; setTimeout(() => { document.getElementById('damage-overlay').style.opacity = 0; }, 300);

    if (playerHealth <= 0 && !isDead) {
        isDead = true;
        // Stop boss music immediately on player death
        stopBossMusic();
        createExplosion(yawObject.position, 0xffaa00);
        createExplosion(yawObject.position.clone().add(new THREE.Vector3(0, 1, 0)), 0xff5500);

        if (currentPlayerModel) currentPlayerModel.visible = false;
        gunGroup.visible = false;

        setTimeout(() => {
            document.getElementById('gameover-title').innerText = "UNIT LOST";
            showMenu('GAMEOVER');
            playGameOverMusic();
            document.exitPointerLock();
            document.getElementById('blocker').style.display = 'flex';
        }, 1500);
    }
}

function takePlaneDamage(amount) {
    if (planeHealth <= 0) return;
    planeHealth -= amount; updateHUD();

    if (planeHealth <= 0 && !isDead) {
        isDead = true;
        createExplosion(planeCenter, 0xff0000); createExplosion(new THREE.Vector3(10, 0, 0), 0xff0000); createExplosion(new THREE.Vector3(-10, 0, 0), 0xff0000);
        playerHealth = 0; updateHUD();

        setTimeout(() => {
            document.getElementById('gameover-title').innerText = "PLANE DESTROYED";
            showMenu('GAMEOVER');
            playGameOverMusic();
            document.exitPointerLock();
            document.getElementById('blocker').style.display = 'flex';
        }, 1500);
    }
}

// --- MAIN ANIMATION LOOP ---
function animate() {
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    if (!controls.isLocked) {
        if (menuState === 'MAIN' && currentPlayerModel) {
            currentPlayerModel.visible = true;
            currentPlayerModel.rotation.y += delta * 1.5;
            camera.position.lerp(new THREE.Vector3(0, 0.5, 4.0), delta * 2);
            pitchObject.rotation.x = THREE.MathUtils.lerp(pitchObject.rotation.x, -0.1, delta * 2);
        }
        renderer.render(scene, camera);
        return;
    }

    if (currentPlayerModel) {
        if (!isDead) currentPlayerModel.visible = isThirdPerson;
        currentPlayerModel.rotation.y = THREE.MathUtils.lerp(currentPlayerModel.rotation.y, 0, delta * 15);
        if (isThirdPerson) {
            camera.position.lerp(new THREE.Vector3(0.7, 0.15, 2.2), delta * 10);
        } else {
            camera.position.lerp(new THREE.Vector3(0, 0, 0), delta * 10);
        }
    }

    updateHUD();

    if (isDead) {
        isFiring = false; gpFiring = false;
        moveState.forward = false; moveState.backward = false; moveState.left = false; moveState.right = false;
    }

    let gpMoveX = 0, gpMoveZ = 0;
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i] && gamepads[i].connected) { gp = gamepads[i]; break; }
    }

    if (gp && controls.isLocked && !isDead) {
        const deadzone = 0.2;
        if (Math.abs(gp.axes[0]) > deadzone) gpMoveX = gp.axes[0];
        if (Math.abs(gp.axes[1]) > deadzone) gpMoveZ = gp.axes[1];

        let lookX = Math.abs(gp.axes[2]) > deadzone ? gp.axes[2] : 0;
        let lookY = Math.abs(gp.axes[3]) > deadzone ? gp.axes[3] : 0;

        let target = null;
        let maxDot = 0.96;
        const camPos = camera.getWorldPosition(new THREE.Vector3());
        const camDir = camera.getWorldDirection(new THREE.Vector3());

        enemies.forEach(e => {
            const ePos = e.position.clone(); ePos.y += 1.0;
            const toEnemy = ePos.sub(camPos).normalize();
            const dot = camDir.dot(toEnemy);
            if (dot > maxDot) { maxDot = dot; target = e; }
        });

        if (target) {
            lookX *= 0.5;
            lookY *= 0.5;

            if (Math.abs(lookX) > 0 || Math.abs(lookY) > 0) {
                const ePos = target.position.clone(); ePos.y += 1.0;
                const toTarget = ePos.sub(camPos).normalize();
                const flatCamDir = new THREE.Vector2(camDir.x, camDir.z).normalize();
                const flatToTarget = new THREE.Vector2(toTarget.x, toTarget.z).normalize();
                const crossYaw = flatCamDir.x * flatToTarget.y - flatCamDir.y * flatToTarget.x;
                yawObject.rotation.y -= crossYaw * delta * 3.0;

                const pitchCam = Math.asin(Math.max(-1, Math.min(1, camDir.y)));
                const pitchTarget = Math.asin(Math.max(-1, Math.min(1, toTarget.y)));
                pitchObject.rotation.x += (pitchTarget - pitchCam) * delta * 3.0;
            }
        }

        yawObject.rotation.y -= lookX * 2.0 * delta;
        pitchObject.rotation.x -= lookY * 2.0 * delta;
        pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObject.rotation.x));

        gpFiring = gp.buttons[7] && (gp.buttons[7].pressed || gp.buttons[7].value > 0.5);
        gpCrouching = gp.buttons[6] && (gp.buttons[6].pressed || gp.buttons[6].value > 0.5);

        if (gp.buttons[0] && gp.buttons[0].pressed && !gpLastButtons[0] && canJump && !(isCrouching || gpCrouching) && playerStunTimer <= 0 && !isGravityPulled) {
            velocity.y += JUMP_FORCE; canJump = false;
        }
        if (gp.buttons[2] && gp.buttons[2].pressed && !gpLastButtons[2]) reload();
        if (gp.buttons[3] && gp.buttons[3].pressed && !gpLastButtons[3]) {
            isThirdPerson = !isThirdPerson;
            if (isThirdPerson) {
                currentPlayerRig.armR.add(gunGroup);
                gunGroup.rotation.set(-Math.PI / 2, 0, 0);
                gunGroup.position.copy(currentPlayerRig.gunOffset);
                if (currentPlayerModel && !isDead) currentPlayerModel.visible = true;
            } else {
                pitchObject.add(gunGroup);
                gunGroup.rotation.set(0, 0, 0);
                gunGroup.position.set(0.3, -0.25, -0.4);
                if (currentPlayerModel) currentPlayerModel.visible = false;
            }
        }
        if (gp.buttons[12] && gp.buttons[12].pressed && !gpLastButtons[12] && precisionCooldown <= 0 && !isGravityPulled && playerStunTimer <= 0) precisionActive = !precisionActive;
        if (gp.buttons[10] && gp.buttons[10].pressed && !gpLastButtons[10]) gpSprint = !gpSprint;
        if (gp.buttons[4] && gp.buttons[4].pressed && !gpLastButtons[4] && currentMode === 'DEFEND_PLANE' && cannonConsole) {
            if (yawObject.position.distanceTo(cannonConsole.position) < 4.0 && cannonCooldown <= 0) triggerTowerCannon();
        }

        if (gpMoveX === 0 && gpMoveZ === 0) gpSprint = false;

        if (gpLastCrouching && !gpCrouching && criticalCooldown <= 0) lastUncrouchTime = performance.now();
        gpLastCrouching = gpCrouching;

        for (let i = 0; i < gp.buttons.length; i++) gpLastButtons[i] = gp.buttons[i].pressed;
    } else {
        for (let i = 0; i < 16; i++) gpLastButtons[i] = false;
    }

    if (isFiring || gpFiring) shoot();
    if (precisionCooldown > 0) precisionCooldown -= delta;
    if (criticalCooldown > 0) criticalCooldown -= delta;
    if (cannonCooldown > 0) cannonCooldown -= delta;

    const prompt = document.getElementById('interaction-prompt');
    if (currentMode === 'DEFEND_PLANE' && cannonConsole) {
        if (yawObject.position.distanceTo(cannonConsole.position) < 4.0) {
            prompt.style.display = 'block';
            if (cannonCooldown <= 0) prompt.innerText = "PRESS [E] OR [LB] TO FIRE TOWER CANNON";
            else prompt.innerText = `CANNON RECHARGING: ${Math.ceil(cannonCooldown)}s`;
        } else { prompt.style.display = 'none'; }
    } else { prompt.style.display = 'none'; }

    let activeGravity = GRAVITY;
    if (isGravityPulled) {
        activeGravity = GRAVITY * 3.5;
    }

    velocity.x -= velocity.x * 10.0 * delta; velocity.z -= velocity.z * 10.0 * delta; velocity.y -= activeGravity * delta;

    direction.z = Number(moveState.forward) - Number(moveState.backward) + gpMoveZ;
    direction.x = Number(moveState.right) - Number(moveState.left) + gpMoveX;
    if (direction.lengthSq() > 1) direction.normalize();

    let speed = (isCrouching || gpCrouching) ? 0 : ((isSprinting || gpSprint) ? SPRINT_SPEED : PLAYER_SPEED);

    if (playerStunTimer > 0) {
        playerStunTimer -= delta;
        speed = 0;
        isFiring = false;
        gpFiring = false;
    }

    // Rogue Drone disruption effect
    if (playerDisruptionTimer > 0) {
        playerDisruptionTimer -= delta;
        // Interference: random screen shake and crosshair distortion
        if (Math.random() < 0.3) {
            camera.position.x += (Math.random() - 0.5) * 0.05;
            camera.position.y += (Math.random() - 0.5) * 0.05;
        }
        // Reduced precision during disruption
        if (precisionActive && playerDisruptionTimer < 2.0) {
            precisionActive = false;
            showMessage("SIGNAL LOST: PRECISION DISABLED");
        }
    }

    let targetH = 1.3;
    if (currentPlayerRig) {
        targetH = (isCrouching || gpCrouching) ? currentPlayerRig.camHeightCrouch : currentPlayerRig.camHeightBase;
    }

    camera.fov = THREE.MathUtils.lerp(camera.fov, (isCrouching || gpCrouching) ? 25 : 75, delta * 5); camera.updateProjectionMatrix();

    currentCameraHeight = THREE.MathUtils.lerp(currentCameraHeight, targetH, delta * 10);

    if (Math.abs(direction.z) > 0) velocity.z -= direction.z * speed * 100.0 * delta;
    if (Math.abs(direction.x) > 0) velocity.x += direction.x * speed * 100.0 * delta;

    let feetY = yawObject.position.y;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(yawObject.quaternion); forward.y = 0; forward.normalize();
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(yawObject.quaternion); right.y = 0; right.normalize();
    const dz = -velocity.z * delta; const dx = velocity.x * delta;

    yawObject.position.x += (forward.x * dz) + (right.x * dx);
    yawObject.position.z += (forward.z * dz) + (right.z * dx);
    resolveCollision(yawObject.position, 0.5, feetY);

    feetY += velocity.y * delta; const floorHeight = getGroundHeight(yawObject.position.x, yawObject.position.z, feetY);
    if (feetY <= floorHeight) { velocity.y = 0; feetY = floorHeight; canJump = !isGravityPulled; } else canJump = false;

    yawObject.position.y = feetY;
    pitchObject.position.y = currentCameraHeight;

    if (currentPlayerRig) {
        let isMoving = (moveState.forward || moveState.backward || moveState.left || moveState.right || Math.abs(gpMoveX) > 0.2 || Math.abs(gpMoveZ) > 0.2) && !(isCrouching || gpCrouching);

        currentPlayerModel.scale.y = (isCrouching || gpCrouching) ? currentPlayerRig.crouchScale : currentPlayerRig.baseScale;

        let targetModelY = currentPlayerRig.baseY;
        let targetLegLX = 0;
        let targetLegRX = 0;

        if (isCrouching || gpCrouching) {
            targetModelY = currentPlayerRig.crouchY;
            targetLegLX = -1.2;
            targetLegRX = -1.2;
        } else if (isMoving) {
            const animSpeed = (isSprinting || gpSprint) ? 0.012 : 0.008;
            targetLegLX = Math.sin(time * animSpeed) * 0.6;
            targetLegRX = Math.sin(time * animSpeed + Math.PI) * 0.6;
            targetModelY += Math.abs(Math.sin(time * animSpeed)) * 0.04;
        }

        currentPlayerRig.legL.rotation.x = THREE.MathUtils.lerp(currentPlayerRig.legL.rotation.x, targetLegLX, delta * 10);
        currentPlayerRig.legR.rotation.x = THREE.MathUtils.lerp(currentPlayerRig.legR.rotation.x, targetLegRX, delta * 10);
        currentPlayerModel.position.y = THREE.MathUtils.lerp(currentPlayerModel.position.y, targetModelY, delta * 10);

        let targetArmPitch = 1.57 + pitchObject.rotation.x;
        currentPlayerRig.armR.rotation.set(targetArmPitch, 0, -0.1);
        currentPlayerRig.armL.rotation.set(targetArmPitch, 0, 0.4);

        if (isThirdPerson) {
            if (recoilAmount > 0) {
                gunGroup.position.z = THREE.MathUtils.lerp(gunGroup.position.z, currentPlayerRig.gunOffset.z + 0.1, delta * 20);
                recoilAmount = Math.max(0, recoilAmount - delta);
            } else {
                gunGroup.position.z = THREE.MathUtils.lerp(gunGroup.position.z, currentPlayerRig.gunOffset.z, delta * 10);
            }

            if (isReloading) {
                gunGroup.rotation.x = THREE.MathUtils.lerp(gunGroup.rotation.x, Math.PI / 2 - 0.5, delta * 5);
            } else {
                gunGroup.rotation.x = THREE.MathUtils.lerp(gunGroup.rotation.x, -Math.PI / 2, delta * 10);
            }
        } else {
            if (recoilAmount > 0) recoilAmount = Math.max(0, recoilAmount - delta);
            if (gunGroup.position.z > -0.4) gunGroup.position.z -= delta * 2;
            if (isReloading) gunGroup.rotation.x = THREE.MathUtils.lerp(gunGroup.rotation.x, -Math.PI / 4, delta * 5); else gunGroup.rotation.x = THREE.MathUtils.lerp(gunGroup.rotation.x, 0, delta * 10);

            if (isMoving) {
                gunGroup.position.x = 0.3 + Math.sin(time * 0.01) * 0.02;
                gunGroup.position.y = -0.25 + Math.abs(Math.cos(time * 0.01)) * 0.02;
            } else {
                gunGroup.position.x = THREE.MathUtils.lerp(gunGroup.position.x, 0.3, delta * 5);
                gunGroup.position.y = THREE.MathUtils.lerp(gunGroup.position.y, -0.25, delta * 5);
            }
        }
    }

    const controllersActive = enemies.some(e => e.userData.type === 'controller');

    enemies.forEach(enemy => {
        const type = enemy.userData.type;
        const distToPlayer = enemy.position.distanceTo(yawObject.position);
        const distToPlane = enemy.position.distanceTo(planeCenter);

        let isTargetingPlane = false;
        let targetPos = yawObject.position.clone();
        if (currentMode === 'DEFEND_PLANE' && type !== 'controller' && type !== 'juggernaut') {
            if (type === 'drone' || distToPlane < distToPlayer + 10) {
                isTargetingPlane = true;
                targetPos = planeCenter.clone();
                targetPos.y = type === 'drone' ? 12.0 : 2.0;
            }
        }

        let moveTarget = targetPos.clone();
        if (currentMode === 'DEFEND_PLANE' && isTargetingPlane) {
            if (enemy.position.z < -30) {
                moveTarget.x = enemy.position.x < 0 ? -40 : 40;
                moveTarget.z = -30;
            } else if (enemy.position.z < 35 && Math.abs(enemy.position.x) > 20) {
                moveTarget.x = enemy.position.x < 0 ? -35 : 35;
                moveTarget.z = 45;
            } else if (enemy.position.z >= 35 && Math.abs(enemy.position.x) > 24) {
                moveTarget.x = 0;
                moveTarget.z = 40;
            }
        }

        if (enemy.userData.hpBar) enemy.userData.hpBar.parent.lookAt(camera.position);

        if (type === 'drone') {
            enemy.lookAt(new THREE.Vector3(moveTarget.x, enemy.position.y, moveTarget.z));
            const dd = enemy.userData.droneData;

            if (isTargetingPlane) enemy.position.y = THREE.MathUtils.lerp(enemy.position.y, targetPos.y, delta * 2);
            else enemy.position.y = THREE.MathUtils.lerp(enemy.position.y, 0, delta * 2);

            dd.root.position.y = 2 + Math.sin(time * 0.005 + enemy.userData.id) * 0.2;
            const actualDist = enemy.position.distanceTo(targetPos);
            let isMoving = true;

            if (isTargetingPlane && actualDist < 15.0) {
                isMoving = false;
                if (enemy.userData.shootTimer === undefined) enemy.userData.shootTimer = Math.random() * 2;
                enemy.userData.shootTimer -= delta;
                if (enemy.userData.shootTimer <= 0) {
                    createBomb(enemy.position.clone(), new THREE.Vector3(0, -10, 0), 20);
                    enemy.userData.shootTimer = 2.0;
                }
            }

            if (controllersActive) {
                dd.body.material.color.setHex(0x00ffff); dd.body.material.emissive.setHex(0x00ffff); dd.body.material.emissiveIntensity = 4.0;
                dd.light.color.setHex(0x00ffff); dd.light.intensity = 6.0;
                if (isMoving) {
                    enemy.position.x += (Math.random() - 0.5) * 0.2;
                    const dir = new THREE.Vector3().subVectors(moveTarget, enemy.position).normalize();
                    const nextPos = enemy.position.clone().add(dir.multiplyScalar((enemy.userData.speed + 8) * delta));
                    if (!checkEnemyCollision(nextPos)) enemy.position.copy(nextPos);
                }
                if (distToPlayer < 2.0) takeDamage(20 * delta);
            } else {
                dd.body.material.color.setHex(0xff0000); dd.body.material.emissive.setHex(0xff0000); dd.body.material.emissiveIntensity = 0.5;
                dd.light.color.setHex(0xff0000); dd.light.intensity = 1.0;
                if (isMoving) {
                    const dir = new THREE.Vector3().subVectors(moveTarget, enemy.position).normalize();
                    const nextPos = enemy.position.clone().add(dir.multiplyScalar((enemy.userData.speed - 1) * delta));
                    if (!checkEnemyCollision(nextPos)) enemy.position.copy(nextPos);
                }
                if (distToPlayer < 2.0) takeDamage(5 * delta);
             }
         }
          else if (type === 'rogueDrone') {
              // Rogue Drone: Hostile AI-controlled drone with intelligent movement
             const dd = enemy.userData.droneData;
             
             // Find Juggernaut reference
             const juggernaut = enemies.find(e => e.userData.type === 'juggernaut');
             
             // Check if player is stunned (Quake attack)
             const isPlayerStunned = playerStunTimer > 0;
             
             // Support mode: when player is stunned, stay near Juggernaut
             if (isPlayerStunned && juggernaut) {
                 // Hover near Juggernaut in defensive formation
                 const supportPos = juggernaut.position.clone();
                 const angle = enemy.userData.id * Math.PI * 2; // Spread around boss
                 supportPos.x += Math.cos(angle) * 5;
                 supportPos.z += Math.sin(angle) * 5;
                 supportPos.y = 2;
                 
                 enemy.lookAt(supportPos);
                 dd.root.position.y = 2 + Math.sin(time * 0.005) * 0.1;
                 
                 // Move toward support position
                 const dir = new THREE.Vector3().subVectors(supportPos, enemy.position).normalize();
                 const nextPos = enemy.position.clone().add(dir.multiplyScalar(enemy.userData.speed * 0.5 * delta));
                 if (!checkEnemyCollision(nextPos)) enemy.position.copy(nextPos);
                 
                 // No attack while in support mode
                 // Visual: Increased core glow for support mode
                 if (dd.core) {
                     dd.core.material.emissiveIntensity = 1.2 + Math.sin(time * 0.01) * 0.3;
                 }
             } else {
                 // Intelligent combat behavior
                 enemy.lookAt(new THREE.Vector3(moveTarget.x, enemy.position.y, moveTarget.z));
                 
                 // Heavy hovering motion
                 dd.root.position.y = 2 + Math.sin(time * 0.003 + enemy.userData.id) * 0.15;
                 
                 const actualDist = enemy.position.distanceTo(targetPos);
                 const idealAttackDist = 10.0; // Maintain this distance for bombing
                 const minAttackDist = 8.0;
                 const maxAttackDist = 12.0;
                 
                 // Initialize reposition timer if needed
                 if (enemy.userData.repositionTimer === undefined) {
                     enemy.userData.repositionTimer = 0;
                 }
                 
                 // Attack: Drop bombs when in range
                 if (actualDist < 15.0) {
                     if (enemy.userData.shootTimer === undefined) enemy.userData.shootTimer = Math.random() * 2;
                     enemy.userData.shootTimer -= delta;
                     
                     if (enemy.userData.shootTimer <= 0) {
                         createBomb(enemy.position.clone(), new THREE.Vector3(0, -15, 0), 15);
                         enemy.userData.shootTimer = 1.5;
                         
                         // Trigger disruption effect when attacking
                         if (actualDist < 10.0 && playerDisruptionTimer <= 0) {
                             playerDisruptionTimer = 3.0; // 3 second disruption
                             showMessage("WARNING: SIGNAL INTERFERENCE DETECTED");
                         }
                         
                         // Set reposition timer to move after attack
                         enemy.userData.repositionTimer = 2.0;
                     }
                 }
                 
                 // Intelligent movement logic
                 let moveDir = new THREE.Vector3();
                 let shouldMove = true;
                 
                 if (actualDist < minAttackDist) {
                     // Too close - back away
                     moveDir = new THREE.Vector3().subVectors(enemy.position, targetPos).normalize();
                 } else if (actualDist > maxAttackDist && enemy.userData.repositionTimer <= 0) {
                     // Too far - pursue player
                     moveDir = new THREE.Vector3().subVectors(targetPos, enemy.position).normalize();
                 } else if (enemy.userData.repositionTimer > 0) {
                     // Repositioning after attack - strafe perpendicular to target
                     enemy.userData.repositionTimer -= delta;
                     const toTarget = new THREE.Vector3().subVectors(targetPos, enemy.position).normalize();
                     const strafeDir = new THREE.Vector3(-toTarget.z, 0, toTarget.x).normalize(); // Perpendicular
                     const strafeSign = Math.sin(enemy.userData.id * 100) > 0 ? 1 : -1; // Consistent direction per drone
                     moveDir = strafeDir.multiplyScalar(strafeSign);
                 } else if (actualDist >= minAttackDist && actualDist <= maxAttackDist) {
                     // In ideal range - maintain position with small adjustments
                     shouldMove = Math.random() < 0.3; // Only move occasionally
                     if (shouldMove) {
                         moveDir = new THREE.Vector3().subVectors(targetPos, enemy.position).normalize();
                     }
                 }
                 
                 // Avoid clustering: check nearby drones and repel
                 const clusterAvoidDist = 6.0;
                 const clusterRepelStrength = 8.0;
                 enemies.forEach(other => {
                     if (other === enemy || other.userData.type !== 'rogueDrone') return;
                     const droneDist = enemy.position.distanceTo(other.position);
                     if (droneDist < clusterAvoidDist && droneDist > 0.1) {
                         const repelDir = new THREE.Vector3().subVectors(enemy.position, other.position).normalize();
                         const repelStrength = (1.0 - droneDist / clusterAvoidDist) * clusterRepelStrength;
                         moveDir.add(repelDir.multiplyScalar(repelStrength));
                     }
                 });
                 
                 // Apply movement
                 if (shouldMove && moveDir.lengthSq() > 0.01) {
                     moveDir.normalize();
                     const nextPos = enemy.position.clone().add(moveDir.multiplyScalar(enemy.userData.speed * delta));
                     if (!checkEnemyCollision(nextPos)) enemy.position.copy(nextPos);
                 }
                 
                 // Damage on contact
                 if (distToPlayer < 1.5) takeDamage(10 * delta);
                 
                 // Visual: Normal glow
                 if (dd.body) {
                     dd.body.material.emissiveIntensity = 0.3 + Math.sin(time * 0.005) * 0.05;
                 }
                 if (dd.core) {
                     dd.core.material.emissiveIntensity = 0.8 + Math.sin(time * 0.008) * 0.2;
                 }
             }
         }
         else if (type === 'soldier' || type === 'elite') {
            enemy.lookAt(new THREE.Vector3(moveTarget.x, enemy.position.y, moveTarget.z));
            let isMoving = false;
            const actualDist = enemy.position.distanceTo(moveTarget);

            if (enemy.userData.shootTimer > 0 && actualDist < 20) {
                let bestCover = null; let minCoverDist = 999;
                for (let o of obstacles) { if (o.isPlane) continue; const d = enemy.position.distanceTo(o.position); if (d < minCoverDist) { minCoverDist = d; bestCover = o; } }
                if (bestCover && minCoverDist < 10) {
                    const coverDir = new THREE.Vector3().subVectors(bestCover.position, targetPos).normalize();
                    const coverPos = bestCover.position.clone().add(coverDir.multiplyScalar(2.0));
                    if (enemy.position.distanceTo(coverPos) > 0.5) {
                        const moveDir = new THREE.Vector3().subVectors(coverPos, enemy.position).normalize();
                        enemy.lookAt(new THREE.Vector3(coverPos.x, enemy.position.y, coverPos.z));
                        const nextPos = enemy.position.clone().add(moveDir.multiplyScalar(enemy.userData.speed * delta));
                        if (!checkEnemyCollision(nextPos)) { enemy.position.copy(nextPos); isMoving = true; }
                    }
                }
            } else if (actualDist > 15) {
                const dir = new THREE.Vector3().subVectors(moveTarget, enemy.position).normalize(); dir.y = 0;
                const nextPos = enemy.position.clone().add(dir.multiplyScalar(enemy.userData.speed * delta));
                if (!checkEnemyCollision(nextPos)) { enemy.position.copy(nextPos); isMoving = true; }
            }

            const rig = enemy.userData.rig;
            if (enemy.userData.shootTimer > 0 && !isMoving) {
                if (type === 'elite') {
                    rig.torso.position.y = 0.6; rig.head.position.y = 1.2; rig.armL.position.y = 0.9; rig.armR.position.y = 0.9;
                } else {
                    rig.torso.position.y = 0.6; rig.head.position.y = 1.15; rig.armL.position.y = 0.9; rig.armR.position.y = 0.9;
                }
                rig.legL.rotation.x = -0.8; rig.legR.rotation.x = 0.8; enemy.lookAt(new THREE.Vector3(targetPos.x, enemy.position.y, targetPos.z)); rig.armR.rotation.x = 1.57;
            } else {
                if (type === 'elite') {
                    rig.torso.position.y = 1.1; rig.head.position.y = 1.7; rig.armL.position.y = 1.4; rig.armR.position.y = 1.4;
                } else {
                    rig.torso.position.y = 1.0; rig.head.position.y = 1.55; rig.armL.position.y = 1.3; rig.armR.position.y = 1.3;
                }
                rig.legL.rotation.x = 0; rig.legR.rotation.x = 0;
            }

            if (isMoving) {
                const s = 10; rig.legL.rotation.x = Math.sin(time * 0.01 * s) * 0.8; rig.legR.rotation.x = Math.sin(time * 0.01 * s + Math.PI) * 0.8;
                rig.armL.rotation.x = Math.sin(time * 0.01 * s + Math.PI) * 0.5; rig.armR.rotation.x = Math.sin(time * 0.01 * s) * 0.4;
            } else if (enemy.userData.shootTimer <= 0) {
                rig.legL.rotation.x = 0; rig.legR.rotation.x = 0; rig.armL.rotation.x = 1.57; rig.armL.rotation.y = 0.5; rig.armR.rotation.x = 1.57;
            }

            enemy.userData.shootTimer -= delta;
            if (enemy.userData.shootTimer <= 0 && !isMoving) {
                const gp = new THREE.Vector3(); rig.gun.getWorldPosition(gp);
                const dir = new THREE.Vector3().subVectors(targetPos, gp).normalize();
                const bulletDmg = type === 'elite' ? 20 : 10;
                createEnemyBullet(gp.add(dir.multiplyScalar(0.6)), dir, bulletDmg);

                enemy.userData.shootTimer = 1.2 + Math.random();
            }
        }
        else if (type === 'controller') {
            const rig = enemy.userData.rig; let isMoving = false;
            const dangerDist = currentMode === 'DEFEND_PLANE' ? 80 : 25;

            if (distToPlayer < dangerDist) {
                const dir = new THREE.Vector3().subVectors(enemy.position, yawObject.position).normalize(); dir.y = 0;
                const nextPos = enemy.position.clone().add(dir.multiplyScalar(enemy.userData.speed * delta));
                if (!checkEnemyCollision(nextPos)) { enemy.lookAt(nextPos); enemy.position.copy(nextPos); isMoving = true; }
                else enemy.lookAt(yawObject.position);
            } else enemy.lookAt(yawObject.position);

            if (isMoving) {
                const s = 10; rig.legL.rotation.x = Math.sin(time * 0.01 * s) * 0.8; rig.legR.rotation.x = Math.sin(time * 0.01 * s + Math.PI) * 0.8;
                rig.armL.rotation.x = 0.8 + Math.sin(time * 0.01 * s) * 0.2; rig.armR.rotation.x = 0.8 + Math.cos(time * 0.01 * s) * 0.2;
            } else {
                rig.legL.rotation.x = 0; rig.legR.rotation.x = 0; if (rig.light) rig.light.intensity = 1.5 + Math.sin(time * 0.01) * 0.5;
                rig.armL.rotation.x = 0.8 + Math.sin(time * 0.005) * 0.05; rig.armR.rotation.x = 0.8 + Math.cos(time * 0.005) * 0.1;
            }
        }
        else if (type === 'juggernaut') {
            enemy.lookAt(new THREE.Vector3(moveTarget.x, enemy.position.y, moveTarget.z));
            let isMoving = false;
            const actualDist = enemy.position.distanceTo(moveTarget);

            if (enemy.userData.bossPhase === undefined) {
                enemy.userData.bossPhase = 0;
                enemy.userData.phaseTimer = 3.0;
            }

            enemy.userData.phaseTimer -= delta;

            let canMove = true;
            if (enemy.userData.bossPhase === 1) canMove = false;
            if (enemy.userData.bossPhase === 2 && enemy.userData.phaseTimer > 3.0) canMove = false;
            if (enemy.userData.bossPhase === 3 && enemy.userData.shotCount === 0) canMove = false;

            if (actualDist > 18 && canMove) {
                const dir = new THREE.Vector3().subVectors(moveTarget, enemy.position).normalize(); dir.y = 0;
                const nextPos = enemy.position.clone().add(dir.multiplyScalar(enemy.userData.speed * delta));
                if (!checkEnemyCollision(nextPos)) { enemy.position.copy(nextPos); isMoving = true; }
            }

            const rig = enemy.userData.rig;

            if (rig.coreLight) rig.coreLight.intensity = 3 + Math.sin(time * 0.005) * 2;

            if (enemy.userData.bossPhase === 1) {
                rig.armL.rotation.x = THREE.MathUtils.lerp(rig.armL.rotation.x, 2.8, delta * 4);
                rig.armR.rotation.x = THREE.MathUtils.lerp(rig.armR.rotation.x, 2.8, delta * 4);
                rig.torso.rotation.x = THREE.MathUtils.lerp(rig.torso.rotation.x, -0.3, delta * 4);
            } else if ((enemy.userData.bossPhase === 2 && enemy.userData.phaseTimer > 3.0) || (enemy.userData.bossPhase === 3 && enemy.userData.shotCount === 0)) {
                rig.armL.rotation.x = THREE.MathUtils.lerp(rig.armL.rotation.x, 0.2, delta * 15);
                rig.armR.rotation.x = THREE.MathUtils.lerp(rig.armR.rotation.x, 0.2, delta * 15);
                rig.torso.rotation.x = THREE.MathUtils.lerp(rig.torso.rotation.x, 0.5, delta * 15);
            } else {
                rig.torso.rotation.x = THREE.MathUtils.lerp(rig.torso.rotation.x, 0, delta * 5);
                if (isMoving) {
                    const s = 4;
                    rig.legL.rotation.x = Math.sin(time * 0.01 * s) * 0.6; rig.legR.rotation.x = Math.sin(time * 0.01 * s + Math.PI) * 0.6;
                    rig.armL.rotation.x = Math.sin(time * 0.01 * s + Math.PI) * 0.3; rig.armR.rotation.x = Math.sin(time * 0.01 * s) * 0.3;
                } else {
                    rig.legL.rotation.x = 0; rig.legR.rotation.x = 0;
                    rig.armL.rotation.x = THREE.MathUtils.lerp(rig.armL.rotation.x, 1.57, delta * 5);
                    rig.armR.rotation.x = THREE.MathUtils.lerp(rig.armR.rotation.x, 1.57, delta * 5);
                }
            }

            if (enemy.userData.phaseTimer <= 0) {
                if (enemy.userData.bossPhase === 0) {
                    isGravityPulled = false;
                    const numBombs = 18;
                    const bossPos = enemy.position.clone();
                    bossPos.y += 2.0;

                    for (let i = 0; i < numBombs; i++) {
                        const angle = (i / numBombs) * Math.PI * 2;
                        const bDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
                        const spawnPos = bossPos.clone().add(bDir.clone().multiplyScalar(3.0));
                        // Nerfed to 11.5 damage, and granted Juggernaut Barrel Pass-Through
                        createBomb(spawnPos, bDir.clone().multiplyScalar(45), 11.5, false, true);
                    }
                    enemy.userData.bossPhase = 1;
                    enemy.userData.phaseTimer = 3.5;
                    showMessage("JUGGERNAUT: RING BARRAGE UNLEASHED! PREPARE TO JUMP!");

                } else if (enemy.userData.bossPhase === 1) {
                    createExplosion(enemy.position, 0xffffff);
                    createExplosion(enemy.position.clone().add(new THREE.Vector3(2, 0, 0)), 0xaaaaaa);
                    createExplosion(enemy.position.clone().add(new THREE.Vector3(-2, 0, 0)), 0xaaaaaa);

                    if (canJump) {
                        playerStunTimer = 5.0;
                        precisionActive = false; // SYSTEM SHOCK: Cancels Precision buff if stunned!
                        showMessage("SYSTEM ERROR: STUNNED BY QUAKE!");
                        playSound('explosion');
                        document.getElementById('damage-overlay').style.background = 'radial-gradient(circle, transparent 20%, rgba(255,255,255,0.8) 100%)';
                        document.getElementById('damage-overlay').style.opacity = 0.8;
                        setTimeout(() => { document.getElementById('damage-overlay').style.opacity = 0; document.getElementById('damage-overlay').style.background = 'radial-gradient(circle, transparent 60%, rgba(180,0,0,0.5) 100%)'; }, 500);

                        enemy.userData.bossPhase = 2;
                        enemy.userData.phaseTimer = 5.0;
                    } else {
                        isGravityPulled = true;
                        velocity.y = -80;
                        showMessage("QUAKE EVADED! MAGNE-CLAMP ACTIVE: JUMP BLOCKED!");

                        enemy.userData.bossPhase = 3;
                        enemy.userData.phaseTimer = 1.5;
                        enemy.userData.shotCount = 0;
                    }

                } else if (enemy.userData.bossPhase === 3) {
                    const gpL = new THREE.Vector3(); rig.gunL.getWorldPosition(gpL);
                    const gpR = new THREE.Vector3(); rig.gun.getWorldPosition(gpR);

                    const aimTarget = targetPos.clone(); aimTarget.y += 1.0;
                    const dirL = new THREE.Vector3().subVectors(aimTarget, gpL).normalize();
                    const dirR = new THREE.Vector3().subVectors(aimTarget, gpR).normalize();

                    if (enemy.userData.shotCount % 2 === 0) {
                        // Juggernaut Barrel Pass-Through
                        createBomb(gpL.add(dirL.clone().multiplyScalar(1.0)), dirL.multiplyScalar(50), 15, false, true);
                    } else {
                        // Juggernaut Barrel Pass-Through
                        createBomb(gpR.add(dirR.clone().multiplyScalar(1.0)), dirR.multiplyScalar(50), 15, false, true);
                    }

                    enemy.userData.shotCount++;
                    if (enemy.userData.shotCount >= 8) {
                        enemy.userData.bossPhase = 2;
                        enemy.userData.phaseTimer = 1.0;
                    } else {
                        enemy.userData.phaseTimer = 0.2;
                    }

                } else if (enemy.userData.bossPhase === 2) {
                    const gpL = new THREE.Vector3(); rig.gunL.getWorldPosition(gpL);
                    const gpR = new THREE.Vector3(); rig.gun.getWorldPosition(gpR);

                    const aimTarget = targetPos.clone(); aimTarget.y += 1.0;
                    const dirL = new THREE.Vector3().subVectors(aimTarget, gpL).normalize();
                    const dirR = new THREE.Vector3().subVectors(aimTarget, gpR).normalize();

                    // Juggernaut Barrel Pass-Through
                    createBomb(gpL.add(dirL.clone().multiplyScalar(1.0)), dirL.multiplyScalar(22), 20, true, true);
                    createBomb(gpR.add(dirR.clone().multiplyScalar(1.0)), dirR.multiplyScalar(22), 20, true, true);

                    setTimeout(() => {
                        if (isDead || !enemies.includes(enemy)) return;
                        const gpL2 = new THREE.Vector3(); rig.gunL.getWorldPosition(gpL2);
                        const gpR2 = new THREE.Vector3(); rig.gun.getWorldPosition(gpR2);
                        const aimTarget2 = yawObject.position.clone(); aimTarget2.y += 1.0;
                        const dirL2 = new THREE.Vector3().subVectors(aimTarget2, gpL2).normalize();
                        const dirR2 = new THREE.Vector3().subVectors(aimTarget2, gpR2).normalize();
                        // Juggernaut Barrel Pass-Through
                        createBomb(gpL2.add(dirL2.clone().multiplyScalar(1.0)), dirL2.multiplyScalar(22), 20, true, true);
                        createBomb(gpR2.add(dirR2.clone().multiplyScalar(1.0)), dirR2.multiplyScalar(22), 20, true, true);
                    }, 500);

                    enemy.userData.bossPhase = 0;
                    enemy.userData.phaseTimer = 5.0;
                    showMessage("WARNING: HOMING BARRAGE UNLEASHED!");
                }
            }
        }
    });

    const playerCenterPos = yawObject.position.clone();
    playerCenterPos.y += 1.0;

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i]; b.life -= delta;

        if (b.isHoming && !isDead) {
            const desiredDir = new THREE.Vector3().subVectors(playerCenterPos, b.mesh.position).normalize();

            const speed = b.velocity.length();
            const desiredVel = desiredDir.multiplyScalar(speed);

            b.velocity.lerp(desiredVel, delta * 12.0);

            if (Math.random() < 0.6) {
                const spark = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 0.25), new THREE.MeshBasicMaterial({ color: 0xcc00ff, transparent: true, opacity: 0.8 }));
                spark.position.copy(b.mesh.position);
                scene.add(spark);
                particles.push({ mesh: spark, vel: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3), life: 0.35 });
            }
        }

        b.mesh.position.add(b.velocity.clone().multiplyScalar(delta));

        if (b.isBomb) {
            if (b.mesh.position.distanceTo(playerCenterPos) < 2.0) {
                takeDamage(b.damage);
                createExplosion(b.mesh.position, 0xff5500);
                scene.remove(b.mesh); enemyBullets.splice(i, 1);
                continue;
            }
            if (currentMode === 'DEFEND_PLANE' && b.mesh.position.y <= 6.0 && b.mesh.position.distanceTo(planeCenter) < 18.0) {
                takePlaneDamage(b.damage);
                createExplosion(b.mesh.position, 0xff5500);
                scene.remove(b.mesh); enemyBullets.splice(i, 1);
                continue;
            }
            // FIXED: enemy bombs only ignore barrels if the flag is true (Juggernaut)
            if (b.life <= 0 || checkCollision(b.mesh.position, 0.4, -999, b.ignoreBarrels)) {
                createExplosion(b.mesh.position, 0xff5500);
                scene.remove(b.mesh); enemyBullets.splice(i, 1);
            }
            continue;
        }

        let hitPlane = false;
        if (currentMode === 'DEFEND_PLANE') {
            if (b.mesh.position.distanceTo(planeCenter) < 4.0 || b.mesh.position.distanceTo(new THREE.Vector3(10, 0, 0)) < 4.0 || b.mesh.position.distanceTo(new THREE.Vector3(-10, 0, 0)) < 4.0) {
                hitPlane = true;
            }
        }

        if (b.mesh.position.distanceTo(playerCenterPos) < 1.5) { takeDamage(b.damage); scene.remove(b.mesh); enemyBullets.splice(i, 1); continue; }
        if (hitPlane) { takePlaneDamage(b.damage); createExplosion(b.mesh.position, 0xff5500); scene.remove(b.mesh); enemyBullets.splice(i, 1); continue; }

        // FIXED: Normal bullets (Soldiers, Elites) never pass through barrels
        if (checkCollision(b.mesh.position, 0.2, -999, false)) { scene.remove(b.mesh); enemyBullets.splice(i, 1); continue; }
        if (b.life <= 0) { scene.remove(b.mesh); enemyBullets.splice(i, 1); }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]; p.life -= delta; p.mesh.position.add(p.vel.clone().multiplyScalar(delta));
        p.mesh.scale.multiplyScalar(0.9); p.mesh.rotation.x += delta;
        if (p.life <= 0) { scene.remove(p.mesh); particles.splice(i, 1); }
    }
    renderer.render(scene, camera);
}

// --- GAME RESET ---
function resetGame() {
    stopGameOverMusic();
    playerHealth = 100; ammo = CLIP_SIZE; totalAmmo = 120; isReloading = false; score = 0; wave = 1;
    precisionCooldown = 0; precisionActive = false; criticalCooldown = 0; lastUncrouchTime = 0;
    playerStunTimer = 0;
    isGravityPulled = false;
    playerDisruptionTimer = 0;
    anyDroneKilled = false;
    planeHealth = MAX_PLANE_HEALTH; cannonCooldown = 0;
    isDead = false;
    gunGroup.visible = true;

    applyPlayerSkin();

    yawObject.position.set(0, 0, currentMode === 'DEFEND_PLANE' ? 30 : 0);
    yawObject.rotation.set(0, 0, 0); pitchObject.rotation.set(0, 0, 0); velocity.set(0, 0, 0);

    enemies.forEach(e => scene.remove(e)); enemies.length = 0;
    enemyBullets.forEach(b => scene.remove(b.mesh)); enemyBullets.length = 0;
    particles.forEach(p => scene.remove(p.mesh)); particles.length = 0;

    clearWorld();
    if (currentMode === 'DEFEND_PLANE') buildAirfieldMap();
    else buildWarehouseMap();
    activeMap = currentMode;

    if (wave % 5 === 0) {
        startNextWave();
    } else {
        spawnEnemy('soldier', new THREE.Vector3(0, 0.9, -20));
        spawnEnemy('drone', new THREE.Vector3(-10, 2, -15));
        spawnEnemy('controller');
    }

    document.getElementById('plane-hud').style.display = currentMode === 'DEFEND_PLANE' ? 'block' : 'none';
    updateHUD();
}

// --- INITIALIZATION ---
function init() {
    // Setup debug functions
    if (typeof ACHIEVEMENT_DEBUG !== 'undefined' && ACHIEVEMENT_DEBUG) {
        window.debugUnlockAchievement = function (id) {
            unlockAchievement(id);
            console.log("Debug unlocked achievement:", id);
        };

        window.debugResetAchievements = function () {
            localStorage.removeItem('tdd_achievements');
            unlockedAchievements = [];
            renderTrophies();
            console.log("Achievements reset");
        };

        window.debugShowAchievements = function () {
            console.log(unlockedAchievements);
        };

        window.debugSetWave = function (value) {
            console.log("debugSetWave() before:", wave, "incoming:", value);
            const v = Number(value);
            if (!Number.isFinite(v)) {
                console.warn("debugSetWave: invalid value", value);
                return;
            }
            console.log("debugSetWave() setting wave to:", v);
            wave = v;
            console.log("debugSetWave() after assign:", wave);
            updateHUD();
            console.log("debugSetWave() after updateHUD:", wave);
            console.log("Debug wave set to: " + wave);
        };

        window.debugAddDroneKills = function (count) {
            const c = Number(count);
            if (!Number.isFinite(c) || c <= 0) {
                console.warn("debugAddDroneKills: invalid count", count);
                return;
            }
            droneKillCount += c;
            console.log("Debug drone kills:", droneKillCount);
            if (droneKillCount >= 100) unlockAchievement('drone_hunter');
        };

        window.debugAddEliteKills = function (count) {
            const c = Number(count);
            if (!Number.isFinite(c) || c <= 0) {
                console.warn("debugAddEliteKills: invalid count", count);
                return;
            }
            eliteKillCount += c;
            console.log("Debug elite kills:", eliteKillCount);
            if (eliteKillCount >= 100) unlockAchievement('elite_eliminator');
        };

        window.debugAddBossKills = function (count) {
            const c = Number(count);
            if (!Number.isFinite(c) || c <= 0) {
                console.warn("debugAddBossKills: invalid count", count);
                return;
            }
            bossKillCount += c;
            console.log("Debug boss kills:", bossKillCount);
            if (bossKillCount >= 10) unlockAchievement('boss_slayer');
        };

        window.debugSpawnRogueDrone = function () {
            spawnEnemy('rogueDrone');
            console.log("Debug: Spawned Rogue Drone");
        };
    }

    // Setup menu button handlers
    const modeBtn = document.getElementById('mode-toggle-btn');
    modeBtn.addEventListener('click', () => {
        if (currentMode === 'SURVIVAL') {
            currentMode = 'DEFEND_PLANE';
            modeBtn.innerText = 'MODE: DEFEND THE PLANE';
            modeBtn.style.background = '#006064';
            modeBtn.style.borderColor = '#00bcd4';
            document.getElementById('hud-objective-text').innerText = 'PROTECT THE ALLIED PLANE';
        } else {
            currentMode = 'SURVIVAL';
            modeBtn.innerText = 'MODE: WAREHOUSE SURVIVAL';
            modeBtn.style.background = '#b71c1c';
            modeBtn.style.borderColor = '#f44336';
            document.getElementById('hud-objective-text').innerText = 'CLEAR WAREHOUSE';
        }
    });

    // Initialize skin preview system
    initSkinPreview();

    // Initialize game
    renderTrophies();
    applyPlayerSkin();
    resetGame();
    animate();

    // Setup pointer lock change handler
    document.addEventListener('pointerlockchange', () => {
        controls.isLocked = document.pointerLockElement === document.body;
        document.getElementById('blocker').style.display = controls.isLocked ? 'none' : 'flex';
        if (controls.isLocked) {
            lastTime = performance.now();
            // Resume boss music when unpausing
            resumeBossMusic();
        } else {
            if (playerHealth > 0) {
                showMenu('PAUSED');
                // Pause boss music when game is paused
                pauseBossMusic();
            } else {
                showMenu('GAMEOVER');
            }
        }
    });

    // Setup play button
    document.getElementById('play-btn').addEventListener('click', () => {
        requestLock();
        lastTime = performance.now();
        if (playerHealth <= 0 || activeMap !== currentMode) resetGame();
    });
    document.getElementById('trophy-btn').addEventListener('click', () => showMenu('TROPHY'));
    document.getElementById('trophy-back-btn').addEventListener('click', () => showMenu('MAIN'));
    document.getElementById('resume-btn').addEventListener('click', () => { requestLock(); });
    document.getElementById('abort-pause-btn').addEventListener('click', () => { stopBossMusic(); showMenu('MAIN'); playerHealth = 0; });
    document.getElementById('deploy-back-btn').addEventListener('click', () => { resetGame(); requestLock(); });
    document.getElementById('abort-gameover-btn').addEventListener('click', () => { stopBossMusic(); showMenu('MAIN'); playerHealth = 0; stopGameOverMusic(); });

    const returnToLauncher = () => { 
        stopBossMusic(); 
        stopGameOverMusic(); 
        if (window.gameHub?.returnToLauncher) {
            window.gameHub.returnToLauncher();
        } else {
            window.location.href = '../../index.html';
        }
    };
    document.getElementById('launcher-main-btn').addEventListener('click', returnToLauncher);
    document.getElementById('launcher-pause-btn').addEventListener('click', returnToLauncher);
    document.getElementById('launcher-gameover-btn').addEventListener('click', returnToLauncher);

    // Setup input handlers
    setupInputHandlers();

    // Setup resize handler
    window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

    // Notify launcher that the game has started (safe — no-op if run outside launcher)
    notifyGameStarted();
    window.addEventListener('pagehide', notifyGameClosed);
}

// Start the game when all modules are loaded
document.addEventListener('DOMContentLoaded', init);
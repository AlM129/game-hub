// --- ENEMY SYSTEM ---
const enemies = [];
const enemyBullets = [];
const particles = [];

function createEnemyGun() {
    const group = new THREE.Group();
    const matBlack = new THREE.MeshStandardMaterial({ color: 0x1a1a1a }); const matDark = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.3), matBlack); group.add(receiver);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5), matBlack); barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.3; barrel.position.y = 0.02; group.add(barrel);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.25), matDark); stock.position.z = 0.25; stock.position.y = -0.02; group.add(stock);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.08), matBlack); mag.rotation.x = 0.2; mag.position.y = -0.12; mag.position.z = -0.1; group.add(mag);
    return group;
}

function createLimb(w, h, d, color, x, y, z) {
    const group = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: color, roughness: 0.7 })); mesh.position.y = -h / 2; group.add(mesh);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(w + 0.02, 0.15, d + 0.02), new THREE.MeshStandardMaterial({ color: 0x111111 })); hand.position.y = -h - 0.075; group.add(hand);
    group.position.set(x, y, z); return { group, hand };
}

function createHumanoid(type) {
    const root = new THREE.Group(); const color = type === 'soldier' ? 0x2e7d32 : 0x29b6f6; root.scale.set(1.2, 1.2, 1.2);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), new THREE.MeshStandardMaterial({ color: color })); torso.position.y = 1.0; root.add(torso);
    const headGroup = new THREE.Group(); headGroup.position.y = 1.55;
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: color })); headGroup.add(headMesh);
    const visorColor = type === 'soldier' ? 0x00ff00 : 0x00ffff;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: visorColor })); visor.position.set(0, 0, -0.16); headGroup.add(visor);
    root.add(headGroup);
    const armL = createLimb(0.15, 0.6, 0.15, color, -0.35, 1.3, 0); const armR = createLimb(0.15, 0.6, 0.15, color, 0.35, 1.3, 0);
    const legL = createLimb(0.2, 0.7, 0.2, 0x111111, -0.15, 0.65, 0); const legR = createLimb(0.2, 0.7, 0.2, 0x111111, 0.15, 0.65, 0);
    root.add(armL.group, armR.group, legL.group, legR.group);

    let gunMesh = null;
    if (type === 'soldier') {
        gunMesh = createEnemyGun();
        gunMesh.rotation.set(-Math.PI / 2, 0, 0);
        gunMesh.position.set(0, -0.05, 0.1);
        armR.hand.add(gunMesh);
        armR.group.rotation.x = 1.57; armL.group.rotation.x = 1.57; armL.group.rotation.y = 0.5;
    } else if (type === 'controller') {
        const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.5), new THREE.MeshStandardMaterial({ color: 0xaaaaaa })); ant.position.set(0.1, 0.3, 0); headGroup.add(ant);
        const light = new THREE.PointLight(0x00ffff, 2, 8); light.position.set(0, 1.5, 0); root.add(light);
        const tablet = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.05), new THREE.MeshStandardMaterial({ color: 0x222222 })); tablet.rotation.x = -Math.PI / 2; tablet.position.y = 0.1;
        const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.52), new THREE.MeshBasicMaterial({ color: 0x00ffff })); screen.position.z = 0.03; tablet.add(screen);
        armL.hand.add(tablet); armL.group.rotation.x = 0.8; armR.group.rotation.x = 0.8;
    }
    return { root, armL: armL.group, armR: armR.group, legL: legL.group, legR: legR.group, torso, head: headGroup, light: root.children.find(c => c.isPointLight), gun: gunMesh };
}

function createDrone(enraged) {
    const group = new THREE.Group(); const color = enraged ? 0x00ffff : 0xff0000;
    const droneMat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.2, metalness: 0.5, emissive: color, emissiveIntensity: enraged ? 2.0 : 0.5 });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), droneMat);
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.4), new THREE.MeshBasicMaterial({ color: 0xffffff })); eye.rotation.x = Math.PI / 2; eye.position.z = -0.6;
    group.add(body); group.add(eye);
    const spikeMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.5), spikeMat); s.position.x = (i % 2 === 0 ? 1 : -1) * 0.6; s.position.y = (i < 2 ? 1 : -1) * 0.6; s.lookAt(0, 0, 0); group.add(s); }
    const light = new THREE.PointLight(color, 4, 15); group.add(light);
    return { root: group, body: body, eye: eye, light: light };
}

function createRogueDrone() {
    const group = new THREE.Group();

    const armorColor = 0x080808;
    const glowColor = 0xff0000;

    // BODY
    const coreMat = new THREE.MeshStandardMaterial({
        color: armorColor,
        roughness: 0.35,
        metalness: 0.9
    });

    const body = new THREE.Mesh(
        new THREE.SphereGeometry(1.0, 20, 20),
        coreMat
    );

    group.add(body);


    // ARMOR PLATES

    const armorMat = new THREE.MeshStandardMaterial({
        color: 0x202020,
        roughness: 0.25,
        metalness: 1.0
    });

    const armorPositions = [
        [0, 0.75, 0],
        [0, -0.75, 0],
        [0.75, 0, 0],
        [-0.75, 0, 0]
    ];

    armorPositions.forEach(pos => {

        const plate = new THREE.Mesh(
            new THREE.BoxGeometry(0.45, 0.9, 0.18),
            armorMat
        );

        plate.position.set(
            pos[0],
            pos[1],
            pos[2]
        );

        plate.lookAt(0,0,0);

        group.add(plate);
    });


    // RED CORE EYE

    const eyeMat = new THREE.MeshStandardMaterial({
        color: glowColor,
        emissive: glowColor,
        emissiveIntensity: 4,
        metalness: 0.4
    });


    const eye = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.22, 0.45, 16),
        eyeMat
    );

    eye.rotation.x = Math.PI / 2;
    eye.position.z = -0.92;

    group.add(eye);


    // PROTECTIVE EYE RING

    const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.32, 0.06, 8, 16),
        armorMat
    );

    ring.rotation.x = Math.PI / 2;
    ring.position.z = -0.94;

    group.add(ring);


    // ARMOR FINS / THRUSTER VANES

    const finMat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.4,
        metalness: 0.8
    });


    for(let i = 0; i < 4; i++) {

        const fin = new THREE.Mesh(
            new THREE.ConeGeometry(0.18, 0.7, 8),
            finMat
        );

        const angle = (Math.PI * 2 / 4) * i;

        fin.position.set(
            Math.cos(angle) * 1.05,
            Math.sin(angle) * 1.05,
            0
        );

        fin.rotation.z = angle;

        group.add(fin);
    }


    // POWER LIGHT

    const light = new THREE.PointLight(
        glowColor,
        5,
        18
    );

    light.position.z = -0.5;

    group.add(light);


    // HOVER SHADOW

    const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.25
    });


    const shadow = new THREE.Mesh(
        new THREE.CircleGeometry(1.5, 32),
        shadowMat
    );

    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -1.1;

    group.add(shadow);

    return {
        root: group,
        body: body,
        eye: eye,
        light: light,
        shadow: shadow
    };
}

function createEliteGuard() {
    const root = new THREE.Group(); const color = 0x2e7d32; const suitColor = 0x111111; root.scale.set(1.4, 1.4, 1.4);

    const torsoGroup = new THREE.Group(); torsoGroup.position.y = 1.1;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: suitColor }));
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.5, 0.45), new THREE.MeshStandardMaterial({ color: color })); chestPlate.position.y = 0.15;
    torsoGroup.add(torso, chestPlate);
    root.add(torsoGroup);

    const headGroup = new THREE.Group(); headGroup.position.y = 1.7;
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: color })); headGroup.add(headMesh);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.15, 0.1), new THREE.MeshBasicMaterial({ color: 0xffff00 })); visor.position.set(0, 0, -0.21); headGroup.add(visor);
    root.add(headGroup);

    const armL = createLimb(0.2, 0.7, 0.2, color, -0.45, 1.4, 0); const armR = createLimb(0.2, 0.7, 0.2, color, 0.45, 1.4, 0);
    const legL = createLimb(0.25, 0.8, 0.25, suitColor, -0.2, 0.75, 0); const legR = createLimb(0.25, 0.8, 0.25, suitColor, 0.2, 0.75, 0);
    root.add(armL.group, armR.group, legL.group, legR.group);

    const gunMesh = createEnemyGun(); gunMesh.scale.set(1.5, 1.5, 1.5);
    gunMesh.rotation.set(-Math.PI / 2, 0, 0);
    gunMesh.position.set(0, -0.05, 0.1);
    armR.hand.add(gunMesh);
    armR.group.rotation.x = 1.57; armL.group.rotation.x = 1.57; armL.group.rotation.y = 0.5;

    root.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });
    return { root, armL: armL.group, armR: armR.group, legL: legL.group, legR: legR.group, torso: torsoGroup, head: headGroup, gun: gunMesh };
}

function createJuggernautBoss() {
    const root = new THREE.Group();
    root.scale.set(2.5, 2.5, 2.5); // MASSIVE SCALE INCREASE

    const armorMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.6, metalness: 0.8 });
    const highlightMat = new THREE.MeshStandardMaterial({ color: 0xff3300, roughness: 0.5 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.8), armorMat); torso.position.y = 1.2;
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.9), highlightMat); core.position.y = 1.2;

    const coreLight = new THREE.PointLight(0xff3300, 5, 40);
    coreLight.position.y = 1.2;

    const head = new THREE.Group(); head.position.y = 1.8;
    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.6), armorMat);
    // FIXED: Wider, taller visor pushed out to the front with an intimidating red glow
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.65), eyeMat); eye.position.set(0, 0, -0.15);
    const eyeLight = new THREE.PointLight(0xff0000, 3, 20); eyeLight.position.set(0, 0, -0.5);
    head.add(headMesh, eye, eyeLight);

    const armL = new THREE.Group(); armL.position.set(-0.9, 1.5, 0);
    const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.6), highlightMat); shoulderL.position.y = 0;
    const armLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 0.4), armorMat); armLMesh.position.y = -0.6;
    armL.add(shoulderL, armLMesh);

    const armR = new THREE.Group(); armR.position.set(0.9, 1.5, 0);
    const shoulderR = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.6), highlightMat); shoulderR.position.y = 0;
    const armRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 0.4), armorMat); armRMesh.position.y = -0.6;
    armR.add(shoulderR, armRMesh);

    const legL = new THREE.Group(); legL.position.set(-0.4, 0.7, 0);
    const legLMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.5), armorMat); legLMesh.position.y = -0.5;
    const footL = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.8), highlightMat); footL.position.set(0, -1.0, -0.1);
    legL.add(legLMesh, footL);

    const legR = new THREE.Group(); legR.position.set(0.4, 0.7, 0);
    const legRMesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.0, 0.5), armorMat); legRMesh.position.y = -0.5;
    const footR = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.8), highlightMat); footR.position.set(0, -1.0, -0.1);
    legR.add(legRMesh, footR);

    const gunL = createEnemyGun(); gunL.scale.set(2, 2, 2);
    gunL.rotation.set(-Math.PI / 2, 0, 0);
    gunL.position.set(0, -1.1, 0.2); armL.add(gunL);

    const gunR = createEnemyGun(); gunR.scale.set(2, 2, 2);
    gunR.rotation.set(-Math.PI / 2, 0, 0);
    gunR.position.set(0, -1.1, 0.2); armR.add(gunR);

    root.add(torso, core, coreLight, head, armL, armR, legL, legR);
    root.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });

    return { root, armL, armR, legL, legR, torso, head, gun: gunR, gunL: gunL, coreLight: coreLight };
}

function createHealthBar(parentGroup) {
    const barContainer = new THREE.Group();
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.15), new THREE.MeshBasicMaterial({ color: 0x330000 }));
    const fgGeo = new THREE.PlaneGeometry(1, 0.15); fgGeo.translate(0.5, 0, 0);
    const fg = new THREE.Mesh(fgGeo, new THREE.MeshBasicMaterial({ color: 0x00ff00 })); fg.position.x = -0.5; fg.scale.x = 1;
    barContainer.add(bg); barContainer.add(fg); barContainer.position.y = 2.5; parentGroup.add(barContainer); return fg;
}

function createEnemyBullet(pos, dir, damage = 10) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4), new THREE.MeshBasicMaterial({ color: 0xffff00 }));
    mesh.position.copy(pos); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    scene.add(mesh); enemyBullets.push({ mesh: mesh, velocity: dir.normalize().multiplyScalar(40), life: 3.0, damage: damage });
    playSound('enemyShot');
}

// Added ignoreBarrels flag strictly for the Juggernaut
function createBomb(pos, vel = new THREE.Vector3(0, -10, 0), damage = 10, isHoming = false, ignoreBarrels = false) {
    const matColor = isHoming ? 0xcc00ff : 0xff3300;
    const emColor = isHoming ? 0xaa00ff : 0xff1100;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 8), new THREE.MeshStandardMaterial({ color: matColor, emissive: emColor, roughness: 0.2 }));
    mesh.position.copy(pos);
    scene.add(mesh);
    enemyBullets.push({ mesh: mesh, velocity: vel, life: 5.0, isBomb: true, damage: damage, isHoming: isHoming, ignoreBarrels: ignoreBarrels });
    playSound('explosion');
}

function createExplosion(pos, color = 0xffaa00) {
    playSound('explosion');
    for (let i = 0; i < 15; i++) {
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), new THREE.MeshBasicMaterial({ color: color })); mesh.position.copy(pos); scene.add(mesh);
        particles.push({ mesh, vel: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10), life: 0.8 });
    }
}
// --- PLAYER MODELS & SKINS ---
let currentSkin = 'TECH_OPERATOR';
let currentPlayerModel = null;
let currentPlayerRig = null;

function buildRigReturn(root, armL, armR, legL, legR, options = {}) {
    return {
        root: root,
        armL: armL,
        armR: armR,
        legL: legL,
        legR: legR,
        baseScale: options.scale || 1.0,
        crouchScale: options.crouchScale || 0.7,
        baseY: options.yOffset !== undefined ? options.yOffset : 1.15,
        crouchY: options.crouchYOffset !== undefined ? options.crouchYOffset : 0.4,
        camHeightBase: options.camHeight || 1.7,
        camHeightCrouch: options.camHeightCrouch || 1.0,
        gunOffset: options.gunOffset || new THREE.Vector3(0, -0.85, 0.05)
    };
}

function createTechOperator() {
    const root = new THREE.Group();
    const suitMat = new THREE.MeshStandardMaterial({ color: 0x1a237e, roughness: 0.8 });
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.6, metalness: 0.4 });
    const detailMat = new THREE.MeshStandardMaterial({ color: 0xff6d00, roughness: 0.4 });
    const visorMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.4), suitMat); torso.position.y = 0.55;
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.3), armorMat); backpack.position.set(0, 0.6, 0.35);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6), detailMat); antenna.position.set(0.25, 1.1, 0.35);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.45, 0.45), armorMat); head.position.y = 1.35;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 0.5), visorMat); visor.position.set(-0.1, 1.4, -0.25);

    const armLGroup = new THREE.Group(); armLGroup.position.set(-0.5, 1.0, 0);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25), suitMat); armL.position.y = -0.4;
    const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.35), detailMat); shoulderL.position.y = 0;
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.26), armorMat); handL.position.y = -0.9;
    armLGroup.add(armL, shoulderL, handL);

    const armRGroup = new THREE.Group(); armRGroup.position.set(0.5, 1.0, 0);
    const armR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.9, 0.25), suitMat); armR.position.y = -0.4;
    const shoulderR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.3, 0.35), detailMat); shoulderR.position.y = 0;
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.26), armorMat); handR.position.y = -0.9;
    armRGroup.add(armR, shoulderR, handR);

    const legLGroup = new THREE.Group(); legLGroup.position.set(-0.2, 0.5, 0);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.3), suitMat); legL.position.y = -0.55;
    const kneeL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.35), armorMat); kneeL.position.set(0, -0.4, -0.15);
    legLGroup.add(legL, kneeL);

    const legRGroup = new THREE.Group(); legRGroup.position.set(0.2, 0.5, 0);
    const legR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.1, 0.3), suitMat); legR.position.y = -0.55;
    const kneeR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 0.35), armorMat); kneeR.position.set(0, -0.4, -0.15);
    legRGroup.add(legR, kneeR);

    root.add(torso, backpack, antenna, head, visor, armLGroup, armRGroup, legLGroup, legRGroup);
    root.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });

    return buildRigReturn(root, armLGroup, armRGroup, legLGroup, legRGroup);
}

function createJetpackPilot() {
    const root = new THREE.Group();
    const suitMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.9 });
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.8 });
    const jetMat = new THREE.MeshStandardMaterial({ color: 0x9c27b0, roughness: 0.5, metalness: 0.5 });
    const visorMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 1.1, 16), suitMat); torso.position.y = 0.55;
    const vest = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.6, 16), strapMat); vest.position.y = 0.7;
    root.add(torso, vest);

    const jetL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 16), jetMat);
    jetL.position.set(-0.2, 0.7, 0.35);
    const jetR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 16), jetMat);
    jetR.position.set(0.2, 0.7, 0.35);
    root.add(jetL, jetR);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), suitMat); head.position.y = 1.35;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.4), visorMat); visor.position.set(0, 1.35, -0.25);
    root.add(head, visor);

    const armLGroup = new THREE.Group(); armLGroup.position.set(-0.5, 1.0, 0);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 16), suitMat); armL.position.y = -0.4;
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.15), strapMat); handL.position.y = -0.9;
    armLGroup.add(armL, handL);

    const armRGroup = new THREE.Group(); armRGroup.position.set(0.5, 1.0, 0);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.9, 16), suitMat); armR.position.y = -0.4;
    const handR = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.15), strapMat); handR.position.y = -0.9;
    armRGroup.add(armR, handR);

    const legLGroup = new THREE.Group(); legLGroup.position.set(-0.2, 0.5, 0);
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 1.1, 16), suitMat); legL.position.y = -0.55;
    const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.35), jetMat); bootL.position.set(0, -1.0, -0.15);
    legLGroup.add(legL, bootL);

    const legRGroup = new THREE.Group(); legRGroup.position.set(0.2, 0.5, 0);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 1.1, 16), suitMat); legR.position.y = -0.55;
    const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.35), jetMat); bootR.position.set(0, -1.0, -0.15);
    legRGroup.add(legR, bootR);

    root.add(armLGroup, armRGroup, legLGroup, legRGroup);
    root.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });

    return buildRigReturn(root, armLGroup, armRGroup, legLGroup, legRGroup);
}

function createStealthPilot() {
    const root = new THREE.Group();
    const robotMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.95, metalness: 0.15 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, roughness: 0.9, metalness: 0.1 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x66ff66 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), robotMat);
    torso.position.y = 0.5;
    const chestTrim = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.62), trimMat); chestTrim.position.set(0, 0.57, 0);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), robotMat);
    head.position.y = 1.0;
    const eye1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), eyeMat);
    eye1.position.set(0.1, 1.0, -0.2);
    const eye2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), eyeMat);
    eye2.position.set(-0.1, 1.0, -0.2);

    const armLGroup = new THREE.Group(); armLGroup.position.set(-0.35, 0.7, 0);
    const armLGeo = new THREE.BoxGeometry(0.15, 0.4, 0.15); armLGeo.translate(0, -0.2, 0);
    const armL = new THREE.Mesh(armLGeo, robotMat);
    armLGroup.add(armL);

    const armRGroup = new THREE.Group(); armRGroup.position.set(0.35, 0.7, 0);
    const armRGeo = new THREE.BoxGeometry(0.15, 0.4, 0.15); armRGeo.translate(0, -0.2, 0);
    const armR = new THREE.Mesh(armRGeo, robotMat);
    armRGroup.add(armR);

    const legLGroup = new THREE.Group(); legLGroup.position.set(-0.15, 0.2, 0);
    const legLGeo = new THREE.BoxGeometry(0.2, 0.4, 0.2); legLGeo.translate(0, -0.2, 0);
    const legL = new THREE.Mesh(legLGeo, robotMat);
    legLGroup.add(legL);

    const legRGroup = new THREE.Group(); legRGroup.position.set(0.15, 0.2, 0);
    const legRGeo = new THREE.BoxGeometry(0.2, 0.4, 0.2); legRGeo.translate(0, -0.2, 0);
    const legR = new THREE.Mesh(legRGeo, robotMat);
    legRGroup.add(legR);

    root.add(torso, chestTrim, head, eye1, eye2, armLGroup, armRGroup, legLGroup, legRGroup);
    root.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });

    return buildRigReturn(root, armLGroup, armRGroup, legLGroup, legRGroup, {
        gunOffset: new THREE.Vector3(0, -0.35, 0.05),
        scale: 0.65,
        crouchScale: 0.45,
        yOffset: 0.13,
        crouchYOffset: -0.1,
        camHeight: 0.8,
        camHeightCrouch: 0.4
    });
}

function createNeonCyborg() {
    const root = new THREE.Group();
    const suitMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
    const armorMat = new THREE.MeshStandardMaterial({ color: 0xff007f, roughness: 0.3, metalness: 0.6 });
    const armorGlowMat = new THREE.MeshStandardMaterial({ color: 0xff007f, roughness: 0.2, metalness: 0.75, emissive: 0xff007f, emissiveIntensity: 0.6 });
    const cyberMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.2, metalness: 0.9 });
    const cyberGlowMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, roughness: 0.15, metalness: 0.85, emissive: 0x00ffff, emissiveIntensity: 0.45 });
    const visorMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x00ffff, emissiveIntensity: 0.35, roughness: 0.15, metalness: 0.4 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.0, 0.35), suitMat); torso.position.y = 0.5;
    const jacket = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.4), armorGlowMat); jacket.position.y = 0.7;
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.45, 16), suitMat); head.position.y = 1.25;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.2), visorMat); visor.position.set(0, 1.25, -0.2);

    const armLGroup = new THREE.Group(); armLGroup.position.set(-0.45, 0.9, 0);
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), suitMat); armL.position.y = -0.4;
    const shoulderL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), armorMat); shoulderL.position.y = 0;
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.2, 0.22), suitMat); handL.position.y = -0.9;
    armLGroup.add(armL, shoulderL, handL);

    const armRGroup = new THREE.Group(); armRGroup.position.set(0.45, 0.9, 0);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.8, 16), cyberMat); armR.position.y = -0.4;
    const shoulderR = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 16), cyberGlowMat); shoulderR.position.y = 0;
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 16), cyberMat); handR.position.y = -0.9;
    armRGroup.add(armR, shoulderR, handR);

    const legLGroup = new THREE.Group(); legLGroup.position.set(-0.15, 0.5, 0);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 1.0, 0.22), suitMat); legL.position.y = -0.5;
    legLGroup.add(legL);

    const legRGroup = new THREE.Group(); legRGroup.position.set(0.15, 0.5, 0);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 1.0, 16), cyberMat); legR.position.y = -0.5;
    legRGroup.add(legR);

    root.add(torso, jacket, head, visor, armLGroup, armRGroup, legLGroup, legRGroup);
    root.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });

    return buildRigReturn(root, armLGroup, armRGroup, legLGroup, legRGroup, { yOffset: 1.05, crouchYOffset: 0.3 });
}

function createHazmatSpecialist() {
    const root = new THREE.Group();
    const suitMat = new THREE.MeshStandardMaterial({ color: 0xffd600, roughness: 0.9 });
    const rubberMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x33ff33 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.1, 0.45), suitMat); torso.position.y = 0.55;
    const tankL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 16), metalMat); tankL.position.set(-0.2, 0.6, 0.35);
    const tankR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.7, 16), metalMat); tankR.position.set(0.2, 0.6, 0.35);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 16, 16), suitMat); head.position.y = 1.35;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.3), glassMat); visor.position.set(0, 1.4, -0.25);
    const filter = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.15, 16), rubberMat);
    filter.rotation.x = Math.PI / 2; filter.position.set(0, 1.25, -0.35);

    const armLGroup = new THREE.Group(); armLGroup.position.set(-0.5, 1.0, 0);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.9, 16), suitMat); armL.position.y = -0.4;
    const padL = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), rubberMat); padL.position.y = 0;
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), rubberMat); handL.position.y = -0.9;
    armLGroup.add(armL, padL, handL);

    const armRGroup = new THREE.Group(); armRGroup.position.set(0.5, 1.0, 0);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.9, 16), suitMat); armR.position.y = -0.4;
    const padR = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), rubberMat); padR.position.y = 0;
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.18, 16, 16), rubberMat); handR.position.y = -0.9;
    armRGroup.add(armR, padR, handR);

    const legLGroup = new THREE.Group(); legLGroup.position.set(-0.2, 0.5, 0);
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 1.1, 16), suitMat); legL.position.y = -0.55;
    const bootL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.4), rubberMat); bootL.position.set(0, -1.0, -0.15);
    legLGroup.add(legL, bootL);

    const legRGroup = new THREE.Group(); legRGroup.position.set(0.2, 0.5, 0);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.14, 1.1, 16), suitMat); legR.position.y = -0.55;
    const bootR = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.25, 0.4), rubberMat); bootR.position.set(0, -1.0, -0.15);
    legRGroup.add(legR, bootR);

    root.add(torso, tankL, tankR, head, visor, filter, armLGroup, armRGroup, legLGroup, legRGroup);
    root.traverse(child => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } });

    return buildRigReturn(root, armLGroup, armRGroup, legLGroup, legRGroup);
}
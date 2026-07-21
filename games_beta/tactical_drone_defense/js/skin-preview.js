// --- SKIN PREVIEW SYSTEM ---
// This file contains the skin selection modal and preview functionality

const skinsList = [
    { id: 'TECH_OPERATOR', name: 'Tech Operator', description: 'Tactical frontline specialist', role: 'ASSAULT', themeLabel: 'Military / Combat', bg: '#1a237e', border: '#3f51b5', color: '#00e5ff', nameColor: '#2bd7ff' },
    { id: 'JETPACK_PILOT', name: 'Jetpack Pilot', description: 'High-altitude mobility operative', role: 'RECON', themeLabel: 'Aerospace / Flight', bg: '#e65100', border: '#ff9800', color: '#ffffff', nameColor: '#ffffff' },
    { id: 'STEALTH_PILOT', name: 'Stealth Pilot', description: 'Covert infiltration expert', role: 'INFILTRATOR', themeLabel: 'Stealth / Covert Ops', bg: '#111111', border: '#00ff00', color: '#00ff00', nameColor: '#00ff00' },
    { id: 'NEON_CYBORG', name: 'Neon Cyborg', description: 'Cybernetically enhanced soldier', role: 'VANGUARD', themeLabel: 'Cyberpunk / Futuristic', bg: '#ff007f', border: '#ff66b2', color: '#00ffff', nameColor: '#ff5dc8' },
    { id: 'HAZMAT_SPECIALIST', name: 'Hazmat Specialist', description: 'Hazard zone containment unit', role: 'SUPPORT', themeLabel: 'Industrial / Safety', bg: '#f57f17', border: '#ffff00', color: '#000000', nameColor: '#ffd600' }
];

const previewFacingOffsets = {
    TECH_OPERATOR: Math.PI,
    JETPACK_PILOT: Math.PI - 0.08,
    STEALTH_PILOT: Math.PI,
    NEON_CYBORG: Math.PI + 0.04,
    HAZMAT_SPECIALIST: Math.PI + 0.02
};

// These will be initialized in initSkinPreview
let skinModalCloseTimer = null;
let selectedSkinId = currentSkin;
let skinPreviewContainer = null;
let skinPreviewName = null;
let skinInfoPanel = null;
let skinInfoName = null;
let skinInfoDescription = null;
let skinInfoRole = null;
let skinInfoTheme = null;
let skinCardList = null;
let skinSelectorUi = null;
let skinModal = null;
let previewScene = null;
let previewCamera = null;
let previewRenderer = null;
let previewModel = null;
let previewRig = null;
let previewRootGroup = null;
let previewSkinId = null;
let previewPlatform = null;
let previewBase = null;
let previewAmbientLight = null;
let previewKeyLight = null;
let previewRimLight = null;
let previewFillLight = null;
let previewLightRig = null;
let previewEyeMeshes = [];
let previewGlowMeshes = [];
let previewJetMeshes = [];
let previewTankMeshes = [];
let previewAnimationFrame = null;
let previewActive = false;
let previewTime = 0;
let previewLastTimestamp = null;
let previewBehaviorState = 'idle';
let previewBehaviorTimer = 0;
let previewBehaviorLength = 0;
let previewBehaviorAge = 0;
let previewBehaviorFlip = 1;
let previewBehaviorSeed = 0;
let previewBlinkTimer = 0;
let previewBlinkOpen = 1;
let previewChestPulse = 0;
let previewJetPulse = 0;
let previewFacingOffset = 0;
let previewEnvGroup = null;
let previewEnvFloor = null;
let previewEnvWalls = [];
let previewEnvTheme = null;
let previewPlatformRing = null;
let previewPlatformGlow = null;
let previewPedestalTrim = null;
let previewParticles = null;
let previewParticleBasePositions = null;
let previewScanLight = null;
let previewAccentMeshes = [];
let previewLightBase = { ambient: 0.75, key: 1.15, rim: 0.55, fill: 0.35 };
let previewStealthScanTimer = 5;
let previewStealthRevealAge = -1;
let previewStealthReveal = 0;
let previewEnvAccent = { ring: 0x3b82f6, glow: 0x3b82f6, particle: 0x60a5fa, trim: 0x4f6fff };

function createPreviewGridTexture(lineColor, bgColor) {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 1;
    const step = 32;
    for (let i = 0; i <= size; i += step) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(size, i);
        ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(4, 3);
    return texture;
}

function createPreviewParticles() {
    const particleCount = 36;
    const positions = new Float32Array(particleCount * 3);
    previewParticleBasePositions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
        const x = (Math.random() - 0.5) * 5.5;
        const y = 0.4 + Math.random() * 3.2;
        const z = -0.8 + Math.random() * 2.4;
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        previewParticleBasePositions[i * 3] = x;
        previewParticleBasePositions[i * 3 + 1] = y;
        previewParticleBasePositions[i * 3 + 2] = z;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    previewParticles = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
            color: 0x60a5fa,
            size: 0.035,
            transparent: true,
            opacity: 0.42,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            sizeAttenuation: true
        })
    );
    return previewParticles;
}

function buildPreviewEnvironment() {
    previewEnvGroup = new THREE.Group();
    previewAccentMeshes = [];

    const backWall = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 5.5),
        new THREE.MeshStandardMaterial({ color: 0x08111f, roughness: 0.92, metalness: 0.35, emissive: 0x000000, emissiveIntensity: 0.08 })
    );
    backWall.position.set(0, 2.6, -3.8);
    previewEnvGroup.add(backWall);
    previewEnvWalls.push(backWall);

    const sideWallMat = new THREE.MeshStandardMaterial({ color: 0x060d18, roughness: 0.9, metalness: 0.25, emissive: 0x000000, emissiveIntensity: 0.08 });
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(6, 5.5), sideWallMat);
    leftWall.position.set(-4.2, 2.6, -0.8);
    leftWall.rotation.y = Math.PI / 2;
    previewEnvGroup.add(leftWall);
    previewEnvWalls.push(leftWall);

    const rightWallMat = new THREE.MeshStandardMaterial({ color: 0x060d18, roughness: 0.9, metalness: 0.25, emissive: 0x000000, emissiveIntensity: 0.08 });
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(6, 5.5), rightWallMat);
    rightWall.position.set(4.2, 2.6, -0.8);
    rightWall.rotation.y = -Math.PI / 2;
    previewEnvGroup.add(rightWall);
    previewEnvWalls.push(rightWall);

    const ceiling = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 6),
        new THREE.MeshStandardMaterial({ color: 0x040a14, roughness: 0.95, metalness: 0.2, emissive: 0x000000, emissiveIntensity: 0.06 })
    );
    ceiling.position.set(0, 5.2, -0.8);
    ceiling.rotation.x = Math.PI / 2;
    previewEnvGroup.add(ceiling);
    previewEnvWalls.push(ceiling);

    const floorTexture = createPreviewGridTexture('rgba(70, 110, 180, 0.22)', '#050b14');
    previewEnvFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(9, 6),
        new THREE.MeshStandardMaterial({
            map: floorTexture,
            color: 0x8899bb,
            roughness: 0.82,
            metalness: 0.45,
            emissive: 0x0a1424,
            emissiveIntensity: 0.08
        })
    );
    previewEnvFloor.rotation.x = -Math.PI / 2;
    previewEnvFloor.position.set(0, -0.55, -0.8);
    previewEnvGroup.add(previewEnvFloor);

    const accentColors = [0x3b82f6, 0xff914d, 0x22c55e, 0xff2fa8, 0xfacc15];
    const accentPositions = [
        [-3.6, 1.2, -3.74],
        [3.6, 1.2, -3.74],
        [-3.95, 2.8, -0.5],
        [3.95, 2.8, -0.5],
        [0, 4.95, -0.8]
    ];
    accentPositions.forEach((pos, index) => {
        const strip = new THREE.Mesh(
            new THREE.BoxGeometry(index === 4 ? 2.8 : 0.08, index === 4 ? 0.06 : 2.4, 0.04),
            new THREE.MeshStandardMaterial({
                color: accentColors[index % accentColors.length],
                emissive: accentColors[index % accentColors.length],
                emissiveIntensity: 0.55,
                roughness: 0.4,
                metalness: 0.6
            })
        );
        strip.position.set(pos[0], pos[1], pos[2]);
        previewEnvGroup.add(strip);
        previewAccentMeshes.push(strip);
    });

    const holoRing = new THREE.Mesh(
        new THREE.TorusGeometry(2.2, 0.015, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.18 })
    );
    holoRing.rotation.x = Math.PI / 2;
    holoRing.position.set(0, 4.6, -0.8);
    previewEnvGroup.add(holoRing);
    previewAccentMeshes.push(holoRing);

    previewScene.add(previewEnvGroup);
    previewScene.add(createPreviewParticles());
}

function updatePreviewEnvironment(skinId) {
    if (!previewScene) return;

    const themes = {
        TECH_OPERATOR: {
            bg: 0x12203d,
            fog: 0x152847,
            fogNear: 2.5,
            fogFar: 11,
            ring: 0xff6b2b,
            glow: 0xff914d,
            particle: 0xffa45c,
            trim: 0xff6b2b,
            accents: [0xff6b2b, 0x2563eb, 0xff914d, 0x1d4ed8, 0xff6b2b],
            floor: 0x7a90b8,
            floorEmissive: 0x1a3058,
            floorEmissiveIntensity: 0.16,
            wall: 0x1a2d4f,
            wallEmissive: 0x1a3058,
            wallEmissiveIntensity: 0.14,
            ceiling: 0x142640,
            accentIntensity: 0.62,
            particleOpacity: 0.38
        },
        JETPACK_PILOT: {
            bg: 0x081828,
            fog: 0x0c2340,
            fogNear: 2.4,
            fogFar: 10.8,
            ring: 0x38bdf8,
            glow: 0x7dd3fc,
            particle: 0x7dd3fc,
            trim: 0x38bdf8,
            accents: [0x38bdf8, 0x0ea5e9, 0x7dd3fc, 0x0284c7, 0x38bdf8],
            floor: 0x5b8fc9,
            floorEmissive: 0x0c2d52,
            floorEmissiveIntensity: 0.18,
            wall: 0x0f2847,
            wallEmissive: 0x0c2d52,
            wallEmissiveIntensity: 0.16,
            ceiling: 0x0a1e38,
            accentIntensity: 0.65,
            particleOpacity: 0.45
        },
        STEALTH_PILOT: {
            bg: 0x0a1628,
            fog: 0x0c1f30,
            fogNear: 2.2,
            fogFar: 9.2,
            bgScan: 0x1e4a66,
            fogScan: 0x2a6a88,
            ring: 0x1d4d3a,
            glow: 0x22c55e,
            particle: 0x166534,
            trim: 0x22c55e,
            accents: [0x1e3a5f, 0x14532d, 0x1e3a5f, 0x14532d, 0x22c55e],
            accentsScan: [0x2a5a8a, 0x22c55e, 0x2a5a8a, 0x22c55e, 0x4ade80],
            floor: 0x2a3f4f,
            floorScan: 0x3d6a82,
            floorEmissive: 0x0f2a3a,
            floorEmissiveIntensity: 0.1,
            wall: 0x122438,
            wallScan: 0x2a4a62,
            wallEmissive: 0x0f2a3a,
            wallEmissiveScan: 0x1a4a3a,
            wallEmissiveIntensity: 0.1,
            ceiling: 0x0e1c2e,
            accentIntensity: 0.24,
            accentIntensityScan: 0.82,
            particleOpacity: 0.22,
            particleOpacityScan: 0.42
        },
        NEON_CYBORG: {
            bg: 0x12061f,
            fog: 0x12061f,
            fogNear: 2.4,
            fogFar: 10,
            ring: 0xff2fa8,
            glow: 0xff5dc8,
            particle: 0x00f5ff,
            trim: 0xff2fa8,
            accents: [0xff2fa8, 0x00f5ff, 0xff2fa8, 0x00f5ff, 0xff2fa8],
            floor: 0x9a78c8,
            floorEmissive: 0x2a1048,
            floorEmissiveIntensity: 0.12,
            wall: 0x1a0a2e,
            wallEmissive: 0x2a1048,
            wallEmissiveIntensity: 0.12,
            ceiling: 0x140820,
            accentIntensity: 0.55,
            particleOpacity: 0.48
        },
        HAZMAT_SPECIALIST: {
            bg: 0x2a2410,
            fog: 0x322c14,
            fogNear: 2.8,
            fogFar: 12,
            ring: 0xfacc15,
            glow: 0xfbbf24,
            particle: 0xa3e635,
            trim: 0xfacc15,
            accents: [0xfacc15, 0x84cc16, 0xfde047, 0x65a30d, 0xfacc15],
            floor: 0xc8b86a,
            floorEmissive: 0x4a4018,
            floorEmissiveIntensity: 0.22,
            wall: 0x4a4428,
            wallEmissive: 0x5a5020,
            wallEmissiveIntensity: 0.2,
            ceiling: 0x3a3418,
            accentIntensity: 0.68,
            particleOpacity: 0.42
        }
    };
    const theme = themes[skinId] || themes.TECH_OPERATOR;
    previewEnvTheme = theme;
    previewEnvAccent = { ring: theme.ring, glow: theme.glow, particle: theme.particle, trim: theme.trim };

    previewScene.background = new THREE.Color(theme.bg);
    if (previewScene.fog) {
        previewScene.fog.color.setHex(theme.fog);
        previewScene.fog.near = theme.fogNear;
        previewScene.fog.far = theme.fogFar;
    }

    if (previewPlatformRing && previewPlatformRing.material) {
        previewPlatformRing.material.color.setHex(theme.ring);
        previewPlatformRing.material.opacity = skinId === 'STEALTH_PILOT' ? 0.34 : 0.62;
    }
    if (previewPlatformGlow && previewPlatformGlow.material) {
        previewPlatformGlow.material.color.setHex(theme.glow);
        previewPlatformGlow.material.opacity = skinId === 'STEALTH_PILOT' ? 0.09 : 0.14;
    }
    if (previewPedestalTrim && previewPedestalTrim.material) {
        previewPedestalTrim.material.color.setHex(theme.trim);
        previewPedestalTrim.material.emissive.setHex(theme.trim);
    }
    if (previewEnvFloor && previewEnvFloor.material) {
        previewEnvFloor.material.color.setHex(theme.floor);
        if (theme.floorEmissive) previewEnvFloor.material.emissive.setHex(theme.floorEmissive);
        previewEnvFloor.material.emissiveIntensity = theme.floorEmissiveIntensity || 0.1;
    }
    if (previewParticles && previewParticles.material) {
        previewParticles.material.color.setHex(theme.particle);
        previewParticles.material.opacity = theme.particleOpacity;
    }
    previewEnvWalls.forEach((mesh, index) => {
        if (!mesh || !mesh.material) return;
        const isCeiling = index === previewEnvWalls.length - 1;
        mesh.material.color.setHex(isCeiling ? (theme.ceiling || theme.wall) : theme.wall);
        if (theme.wallEmissive) mesh.material.emissive.setHex(theme.wallEmissive);
        mesh.material.emissiveIntensity = theme.wallEmissiveIntensity || 0.1;
    });
    previewAccentMeshes.forEach((mesh, index) => {
        if (!mesh || !mesh.material) return;
        const accentColor = theme.accents[index % theme.accents.length];
        mesh.material.color.setHex(accentColor);
        if (mesh.material.emissive) {
            mesh.material.emissive.setHex(accentColor);
            mesh.material.emissiveIntensity = theme.accentIntensity || 0.55;
        }
        if (mesh.material.opacity !== undefined && mesh.geometry && mesh.geometry.type === 'TorusGeometry') {
            mesh.material.opacity = skinId === 'STEALTH_PILOT' ? 0.1 : 0.18;
        }
    });

    previewStealthScanTimer = 5;
    previewStealthRevealAge = -1;
    previewStealthReveal = 0;
    if (previewScanLight) previewScanLight.intensity = 0;
}

function animatePreviewEnvironment(delta) {
    if (!previewScene) return;

    const pulse = 0.5 + Math.sin(previewTime * 1.4) * 0.5;
    const stealthBaseRing = previewSkinId === 'STEALTH_PILOT' ? 0.34 : 0.62;
    const stealthBaseGlow = previewSkinId === 'STEALTH_PILOT' ? 0.09 : 0.14;
    if (previewPlatformRing && previewPlatformRing.material) {
        previewPlatformRing.material.opacity = stealthBaseRing + pulse * 0.08;
    }
    if (previewPlatformGlow && previewPlatformGlow.material) {
        previewPlatformGlow.material.opacity = stealthBaseGlow + pulse * 0.04;
    }
    if (previewPedestalTrim && previewPedestalTrim.material) {
        previewPedestalTrim.material.emissiveIntensity = 0.35 + pulse * 0.2;
    }

    if (previewParticles && previewParticleBasePositions) {
        const positions = previewParticles.geometry.attributes.position.array;
        for (let i = 0; i < positions.length; i += 3) {
            positions[i + 1] = previewParticleBasePositions[i + 1] + Math.sin(previewTime * 0.7 + i) * 0.05;
        }
        previewParticles.geometry.attributes.position.needsUpdate = true;
        previewParticles.rotation.y = previewTime * 0.03;
    }

    if (previewSkinId === 'STEALTH_PILOT' && previewEnvTheme) {
        previewStealthScanTimer -= delta;
        if (previewStealthScanTimer <= 0) {
            previewStealthScanTimer = 5;
            previewStealthRevealAge = 0;
        }
        if (previewStealthRevealAge >= 0) {
            previewStealthRevealAge += delta;
            const duration = 1.2;
            if (previewStealthRevealAge <= duration) {
                previewStealthReveal = Math.sin((previewStealthRevealAge / duration) * Math.PI);
            } else {
                previewStealthReveal = 0;
                previewStealthRevealAge = -1;
            }
        } else {
            previewStealthReveal = 0;
        }

        const reveal = previewStealthReveal;
        const theme = previewEnvTheme;
        const baseBg = new THREE.Color(theme.bg);
        const scanBg = new THREE.Color(theme.bgScan || 0x1e4a66);
        previewScene.background.copy(baseBg).lerp(scanBg, reveal);
        if (previewScene.fog) {
            const baseFog = new THREE.Color(theme.fog);
            const scanFog = new THREE.Color(theme.fogScan || 0x2a6a88);
            previewScene.fog.color.copy(baseFog).lerp(scanFog, reveal);
            previewScene.fog.near = theme.fogNear - reveal * 0.5;
            previewScene.fog.far = theme.fogFar + reveal * 2.8;
        }

        previewEnvWalls.forEach((mesh, index) => {
            if (!mesh || !mesh.material) return;
            const isCeiling = index === previewEnvWalls.length - 1;
            const baseWall = new THREE.Color(isCeiling ? (theme.ceiling || theme.wall) : theme.wall);
            const scanWall = new THREE.Color(theme.wallScan || theme.wall);
            mesh.material.color.copy(baseWall).lerp(scanWall, reveal);
            const baseEmissive = new THREE.Color(theme.wallEmissive || 0x0f2a3a);
            const scanEmissive = new THREE.Color(theme.wallEmissiveScan || 0x1a4a3a);
            mesh.material.emissive.copy(baseEmissive).lerp(scanEmissive, reveal);
            mesh.material.emissiveIntensity = (theme.wallEmissiveIntensity || 0.1) + reveal * 0.42;
        });

        if (previewEnvFloor && previewEnvFloor.material) {
            const baseFloor = new THREE.Color(theme.floor);
            const scanFloor = new THREE.Color(theme.floorScan || theme.floor);
            previewEnvFloor.material.color.copy(baseFloor).lerp(scanFloor, reveal);
            previewEnvFloor.material.emissiveIntensity = (theme.floorEmissiveIntensity || 0.1) + reveal * 0.5;
        }

        previewAccentMeshes.forEach((mesh, index) => {
            if (!mesh || !mesh.material) return;
            const baseAccent = theme.accents[index % theme.accents.length];
            const scanAccent = (theme.accentsScan || theme.accents)[index % theme.accents.length];
            const baseColor = new THREE.Color(baseAccent);
            const scanColor = new THREE.Color(scanAccent);
            mesh.material.color.copy(baseColor).lerp(scanColor, reveal);
            if (mesh.material.emissive) {
                mesh.material.emissive.copy(baseColor).lerp(scanColor, reveal);
                mesh.material.emissiveIntensity = (theme.accentIntensity || 0.24) + reveal * ((theme.accentIntensityScan || 0.82) - (theme.accentIntensity || 0.24));
            }
            if (mesh.material.opacity !== undefined && mesh.geometry && mesh.geometry.type === 'TorusGeometry') {
                mesh.material.opacity = 0.1 + reveal * 0.28;
            }
        });

        if (previewParticles && previewParticles.material) {
            previewParticles.material.opacity = (theme.particleOpacity || 0.22) + reveal * ((theme.particleOpacityScan || 0.42) - (theme.particleOpacity || 0.22));
        }

        if (previewAmbientLight) previewAmbientLight.intensity = previewLightBase.ambient + reveal * 0.95;
        if (previewKeyLight) {
            previewKeyLight.intensity = previewLightBase.key + reveal * 2.0;
            previewKeyLight.color.setHex(0x4b6a8a).lerp(new THREE.Color(0xc8e6ff), reveal);
        }
        if (previewRimLight) {
            previewRimLight.intensity = previewLightBase.rim + reveal * 1.6;
            previewRimLight.color.setHex(0x22c55e).lerp(new THREE.Color(0x86efac), reveal);
        }
        if (previewFillLight) {
            previewFillLight.intensity = previewLightBase.fill + reveal * 0.55;
            previewFillLight.color.setHex(0x0f172a).lerp(new THREE.Color(0x1e3a5f), reveal);
        }
        if (previewScanLight) previewScanLight.intensity = reveal * 3.6;
        if (previewPlatformRing && previewPlatformRing.material) {
            previewPlatformRing.material.opacity = stealthBaseRing + reveal * 0.45;
            previewPlatformRing.material.color.setHex(reveal > 0.05 ? 0x4ade80 : previewEnvAccent.ring);
        }
        if (previewPlatformGlow && previewPlatformGlow.material) {
            previewPlatformGlow.material.opacity = stealthBaseGlow + reveal * 0.28;
            previewPlatformGlow.material.color.setHex(reveal > 0.05 ? 0x86efac : previewEnvAccent.glow);
        }
        if (previewPedestalTrim && previewPedestalTrim.material) {
            previewPedestalTrim.material.emissiveIntensity = 0.35 + reveal * 0.65;
        }
    } else if (previewAmbientLight) {
        previewAmbientLight.intensity = previewLightBase.ambient;
        if (previewKeyLight) {
            previewKeyLight.intensity = previewLightBase.key;
            if (previewSkinId === 'TECH_OPERATOR') previewKeyLight.color.setHex(0xffd8a8);
            else if (previewSkinId === 'JETPACK_PILOT') previewKeyLight.color.setHex(0xdbeafe);
            else if (previewSkinId === 'NEON_CYBORG') previewKeyLight.color.setHex(0x00f5ff);
            else if (previewSkinId === 'HAZMAT_SPECIALIST') previewKeyLight.color.setHex(0xfff9db);
        }
        if (previewRimLight) {
            previewRimLight.intensity = previewLightBase.rim;
            if (previewSkinId === 'TECH_OPERATOR') previewRimLight.color.setHex(0xff6b2b);
            else if (previewSkinId === 'JETPACK_PILOT') previewRimLight.color.setHex(0x38bdf8);
            else if (previewSkinId === 'NEON_CYBORG') previewRimLight.color.setHex(0xff2fa8);
            else if (previewSkinId === 'HAZMAT_SPECIALIST') previewRimLight.color.setHex(0x84cc16);
        }
        if (previewFillLight) {
            previewFillLight.intensity = previewLightBase.fill;
            if (previewSkinId === 'TECH_OPERATOR') previewFillLight.color.setHex(0x3b5bdb);
            else if (previewSkinId === 'JETPACK_PILOT') previewFillLight.color.setHex(0x1e40af);
            else if (previewSkinId === 'NEON_CYBORG') previewFillLight.color.setHex(0x4d1d95);
            else if (previewSkinId === 'HAZMAT_SPECIALIST') previewFillLight.color.setHex(0xfacc15);
        }
        if (previewScanLight) previewScanLight.intensity = 0;
    }
}

function createPreviewScene() {
    if (previewScene) return;

    previewScene = new THREE.Scene();
    previewScene.background = new THREE.Color(0x020617);
    previewScene.fog = new THREE.Fog(0x020617, 2.5, 10);

    previewCamera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    previewCamera.position.set(0, 1.2, 4.0);
    previewCamera.lookAt(0, 0.75, 0);

    previewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    previewRenderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    previewRenderer.shadowMap.enabled = true;
    previewRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    previewRenderer.domElement.style.width = '100%';
    previewRenderer.domElement.style.height = '100%';
    skinPreviewContainer.appendChild(previewRenderer.domElement);

    buildPreviewEnvironment();

    previewAmbientLight = new THREE.AmbientLight(0x8ab4ff, 0.75);
    previewScene.add(previewAmbientLight);

    previewLightRig = new THREE.Group();
    previewLightRig.position.set(0, 0, 0);
    previewScene.add(previewLightRig);

    previewKeyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    previewKeyLight.position.set(2.2, 3.4, 2.6);
    previewKeyLight.castShadow = true;
    previewKeyLight.shadow.mapSize.set(1024, 1024);
    previewLightRig.add(previewKeyLight);

    previewRimLight = new THREE.DirectionalLight(0x7dd3fc, 0.55);
    previewRimLight.position.set(-2.2, 2.2, -2.8);
    previewLightRig.add(previewRimLight);

    previewFillLight = new THREE.DirectionalLight(0x4f46e5, 0.35);
    previewFillLight.position.set(-1.4, 1.4, 2.2);
    previewLightRig.add(previewFillLight);

    previewScanLight = new THREE.SpotLight(0x4ade80, 0, 10, Math.PI / 4.5, 0.45, 1.2);
    previewScanLight.position.set(0.4, 4.2, 2.8);
    previewScanLight.target.position.set(0, 0.9, 0);
    previewLightRig.add(previewScanLight);
    previewLightRig.add(previewScanLight.target);

    previewRootGroup = new THREE.Group();
    previewRootGroup.position.set(0, 0, 0);
    previewScene.add(previewRootGroup);

    previewPlatform = new THREE.Mesh(
        new THREE.CircleGeometry(0.78, 64),
        new THREE.MeshStandardMaterial({
            color: 0x152238,
            roughness: 0.22,
            metalness: 0.88,
            emissive: 0x0b1628,
            emissiveIntensity: 0.18
        })
    );
    previewPlatform.rotation.x = -Math.PI / 2;
    previewPlatform.position.y = -0.02;
    previewPlatform.receiveShadow = true;
    previewScene.add(previewPlatform);

    previewPlatformRing = new THREE.Mesh(
        new THREE.RingGeometry(0.76, 0.9, 64),
        new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.62, side: THREE.DoubleSide })
    );
    previewPlatformRing.rotation.x = -Math.PI / 2;
    previewPlatformRing.position.y = -0.015;
    previewScene.add(previewPlatformRing);

    previewPlatformGlow = new THREE.Mesh(
        new THREE.RingGeometry(0.9, 1.18, 64),
        new THREE.MeshBasicMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.14, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    previewPlatformGlow.rotation.x = -Math.PI / 2;
    previewPlatformGlow.position.y = -0.014;
    previewScene.add(previewPlatformGlow);

    previewBase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.62, 0.72, 0.1, 32),
        new THREE.MeshStandardMaterial({ color: 0x111b2e, roughness: 0.55, metalness: 0.7 })
    );
    previewBase.position.y = -0.08;
    previewBase.castShadow = true;
    previewBase.receiveShadow = true;
    previewScene.add(previewBase);

    previewPedestalTrim = new THREE.Mesh(
        new THREE.TorusGeometry(0.66, 0.012, 8, 48),
        new THREE.MeshStandardMaterial({
            color: 0x4f6fff,
            emissive: 0x4f6fff,
            emissiveIntensity: 0.45,
            roughness: 0.35,
            metalness: 0.8
        })
    );
    previewPedestalTrim.rotation.x = Math.PI / 2;
    previewPedestalTrim.position.y = -0.03;
    previewScene.add(previewPedestalTrim);

    updatePreviewLighting(selectedSkinId);
    updatePreviewEnvironment(selectedSkinId);
}

function updatePreviewLighting(skinId) {
    if (!previewAmbientLight || !previewKeyLight || !previewRimLight || !previewFillLight) return;

    if (skinId === 'TECH_OPERATOR') {
        previewAmbientLight.color.setHex(0x6b8fd4);
        previewAmbientLight.intensity = 0.82;
        previewKeyLight.color.setHex(0xffc9a0);
        previewKeyLight.intensity = 1.25;
        previewRimLight.color.setHex(0xff6b2b);
        previewRimLight.intensity = 0.72;
        previewFillLight.color.setHex(0x3b5bdb);
        previewFillLight.intensity = 0.42;
    } else if (skinId === 'JETPACK_PILOT') {
        previewAmbientLight.color.setHex(0x7eb8ff);
        previewAmbientLight.intensity = 0.85;
        previewKeyLight.color.setHex(0xe0f2fe);
        previewKeyLight.intensity = 1.12;
        previewRimLight.color.setHex(0x38bdf8);
        previewRimLight.intensity = 0.78;
        previewFillLight.color.setHex(0x1e40af);
        previewFillLight.intensity = 0.38;
    } else if (skinId === 'STEALTH_PILOT') {
        previewAmbientLight.color.setHex(0x1e3a5f);
        previewAmbientLight.intensity = 0.34;
        previewKeyLight.color.setHex(0x4b6a8a);
        previewKeyLight.intensity = 0.44;
        previewRimLight.color.setHex(0x22c55e);
        previewRimLight.intensity = 0.4;
        previewFillLight.color.setHex(0x0f172a);
        previewFillLight.intensity = 0.2;
    } else if (skinId === 'NEON_CYBORG') {
        previewAmbientLight.color.setHex(0x13233d);
        previewAmbientLight.intensity = 0.74;
        previewKeyLight.color.setHex(0x00f5ff);
        previewKeyLight.intensity = 1.15;
        previewRimLight.color.setHex(0xff2fa8);
        previewRimLight.intensity = 0.72;
        previewFillLight.color.setHex(0x4d1d95);
        previewFillLight.intensity = 0.34;
    } else {
        previewAmbientLight.color.setHex(0xfff4c2);
        previewAmbientLight.intensity = 0.84;
        previewKeyLight.color.setHex(0xfff9db);
        previewKeyLight.intensity = 1.18;
        previewRimLight.color.setHex(0x84cc16);
        previewRimLight.intensity = 0.74;
        previewFillLight.color.setHex(0xfacc15);
        previewFillLight.intensity = 0.4;
    }

    previewLightBase.ambient = previewAmbientLight.intensity;
    previewLightBase.key = previewKeyLight.intensity;
    previewLightBase.rim = previewRimLight.intensity;
    previewLightBase.fill = previewFillLight.intensity;
}

function framePreviewModel() {
    if (!previewModel || !previewCamera) return;

    previewModel.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(previewModel);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const height = Math.max(size.y, 1.2);
    const fovRad = previewCamera.fov * Math.PI / 180;
    const distance = height / (2 * Math.tan(fovRad / 2)) * 1.15;

    previewCamera.position.set(0, center.y, distance);
    previewCamera.lookAt(center.x, center.y, center.z);
    previewCamera.updateProjectionMatrix();
}

function positionPreviewPlatform() {
    if (!previewModel || !previewPlatform || !previewBase) return;
    previewModel.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(previewModel);
    const feetY = box.min.y;
    const platformY = feetY - 0.06;
    previewPlatform.position.y = platformY;
    previewBase.position.y = feetY - 0.14;
    if (previewPlatformRing) previewPlatformRing.position.y = platformY + 0.001;
    if (previewPlatformGlow) previewPlatformGlow.position.y = platformY + 0.0005;
    if (previewPedestalTrim) previewPedestalTrim.position.y = platformY - 0.03;
}

function resizePreview() {
    if (!previewRenderer || !skinPreviewContainer) return;
    const rect = skinPreviewContainer.getBoundingClientRect();
    const width = Math.max(220, rect.width);
    const height = Math.max(180, rect.height);
    previewRenderer.setSize(width, height, false);
    previewCamera.aspect = width / height;
    previewCamera.updateProjectionMatrix();
    if (previewModel) {
        framePreviewModel();
        positionPreviewPlatform();
    }
}

function stopPreviewLoop() {
    previewActive = false;
    previewLastTimestamp = null;
    if (previewAnimationFrame) {
        cancelAnimationFrame(previewAnimationFrame);
        previewAnimationFrame = null;
    }
}

function resetPreviewPersonality() {
    previewBehaviorState = 'idle';
    previewBehaviorTimer = 0.8 + Math.random() * 0.6;
    previewBehaviorLength = 0;
    previewBehaviorAge = 0;
    previewBehaviorFlip = Math.random() > 0.5 ? 1 : -1;
    previewBehaviorSeed = Math.random() * Math.PI * 2;
    previewBlinkTimer = 0.2 + Math.random() * 0.25;
    previewBlinkOpen = 1;
    previewChestPulse = 0;
    previewJetPulse = 0;
    if (previewRig) {
        previewRig.armL.rotation.set(0, 0, 0);
        previewRig.armR.rotation.set(0, 0, 0);
        previewRig.root.rotation.set(0, 0, 0);
        previewRig.root.position.set(0, 0, 0);
    }
    if (previewModel) {
        previewModel.position.set(0, 0, 0);
        previewModel.rotation.set(0, 0, 0);
    }
    if (previewRootGroup) {
        previewRootGroup.rotation.set(0, previewFacingOffset + 0.2, 0);
    }
}

function collectPreviewMaterials() {
    previewEyeMeshes = [];
    previewGlowMeshes = [];
    previewJetMeshes = [];
    previewTankMeshes = [];
    if (!previewModel || !previewModel.traverse) return;

    previewModel.traverse(child => {
        if (!child || !child.isMesh || !child.material) return;
        const material = child.material;
        if (previewSkinId === 'STEALTH_PILOT' && material.color && material.color.getHex() === 0x66ff66) {
            previewEyeMeshes.push(material);
        }
        if (previewSkinId === 'NEON_CYBORG' && material.emissive && material.emissiveIntensity !== undefined) {
            previewGlowMeshes.push(material);
        }
        if (previewSkinId === 'JETPACK_PILOT' && material.color && material.color.getHex() === 0x9c27b0) {
            previewJetMeshes.push(material);
        }
        if (previewSkinId === 'HAZMAT_SPECIALIST' && child.isMesh && child.position && child.position.x !== undefined && Math.abs(child.position.x) > 0.05) {
            previewTankMeshes.push(child);
        }
    });
}

function animatePreviewModel(delta) {
    if (!previewModel || !previewRig || !previewRootGroup) return;

    try {
        const time = previewTime;
        const baseBob = Math.sin(time * 1.7) * 0.01;
        previewModel.position.y = baseBob;
        previewRootGroup.rotation.y = previewFacingOffset + 0.2 + Math.sin(time * 0.55) * 0.01;
        previewRootGroup.rotation.z = Math.sin(time * 0.35) * 0.005;

        if (previewSkinId === 'TECH_OPERATOR') {
            if (previewBehaviorState === 'idle') {
                previewBehaviorTimer -= delta;
                if (previewBehaviorTimer <= 0) {
                    previewBehaviorState = Math.random() > 0.45 ? 'inspect' : 'listen';
                    previewBehaviorLength = 1.1 + Math.random() * 1.0;
                    previewBehaviorAge = 0;
                    previewBehaviorFlip = Math.random() > 0.5 ? 1 : -1;
                }
            } else {
                previewBehaviorAge += delta;
                if (previewBehaviorAge >= previewBehaviorLength) {
                    previewBehaviorState = 'idle';
                    previewBehaviorTimer = 3.4 + Math.random() * 3.2;
                }
            }
            const activity = previewBehaviorState === 'idle' ? 0 : Math.sin((previewBehaviorAge / Math.max(previewBehaviorLength, 0.001)) * Math.PI);
            previewRig.armL.rotation.z = 0.06 + activity * 0.08 * previewBehaviorFlip;
            previewRig.armR.rotation.z = -0.05 - activity * 0.06 * previewBehaviorFlip;
            previewRig.armL.rotation.x = 0.02 + activity * 0.04;
            previewRig.armR.rotation.x = -0.01 - activity * 0.025;
            previewRig.armL.position.y = 1.0 + activity * 0.02;
            previewRig.armR.position.y = 1.0 + activity * 0.02;
            previewRig.root.rotation.y = 0.2 + activity * 0.16 * previewBehaviorFlip;
            previewRig.root.rotation.z = activity * 0.04 * previewBehaviorFlip;
        } else if (previewSkinId === 'JETPACK_PILOT') {
            previewModel.position.y = 0.05 + Math.sin(time * 2.2) * 0.03;
            previewRig.armL.rotation.z = 0.06 + Math.sin(time * 1.3) * 0.025;
            previewRig.armR.rotation.z = -0.06 + Math.cos(time * 1.3) * 0.025;
            previewRig.armL.rotation.x = 0.03 + Math.sin(time * 1.8) * 0.01;
            previewRig.armR.rotation.x = 0.03 + Math.cos(time * 1.8) * 0.01;
            previewRig.root.rotation.y = 0.2 + Math.sin(time * 0.6) * 0.015;
            previewRig.root.rotation.z = Math.sin(time * 0.95) * 0.015;
            previewJetPulse = Math.max(0.1, Math.sin(time * 5.5) * 0.5 + 0.7);
            previewJetMeshes.forEach(material => {
                material.emissiveIntensity = previewJetPulse;
            });
            if (previewBehaviorState === 'idle') {
                previewBehaviorTimer -= delta;
                if (previewBehaviorTimer <= 0) {
                    previewBehaviorState = 'gear';
                    previewBehaviorLength = 0.9 + Math.random() * 0.6;
                    previewBehaviorAge = 0;
                    previewBehaviorFlip = Math.random() > 0.5 ? 1 : -1;
                }
            } else {
                previewBehaviorAge += delta;
                if (previewBehaviorAge >= previewBehaviorLength) {
                    previewBehaviorState = 'idle';
                    previewBehaviorTimer = 4.2 + Math.random() * 3.0;
                }
            }
            const gearActivity = previewBehaviorState === 'idle' ? 0 : Math.sin((previewBehaviorAge / Math.max(previewBehaviorLength, 0.001)) * Math.PI);
            previewRig.armL.rotation.z += gearActivity * 0.05 * previewBehaviorFlip;
            previewRig.armR.rotation.z -= gearActivity * 0.05 * previewBehaviorFlip;
            previewRig.root.position.y = gearActivity * 0.015;
        } else if (previewSkinId === 'STEALTH_PILOT') {
            previewRig.armL.rotation.z = Math.sin(time * 1.1) * 0.02;
            previewRig.armR.rotation.z = Math.sin(time * 1.1 + Math.PI) * 0.02;
            previewRig.root.rotation.y = 0.16;
            previewRig.root.rotation.z = 0;
            previewModel.position.y = 0.01 + Math.sin(time * 1.1) * 0.004;
            if (previewBehaviorState === 'idle') {
                previewBehaviorTimer -= delta;
                if (previewBehaviorTimer <= 0) {
                    previewBehaviorState = 'scan';
                    previewBehaviorLength = 0.8 + Math.random() * 0.5;
                    previewBehaviorAge = 0;
                    previewBehaviorFlip = Math.random() > 0.5 ? 1 : -1;
                }
            } else {
                previewBehaviorAge += delta;
                if (previewBehaviorAge >= previewBehaviorLength) {
                    previewBehaviorState = 'idle';
                    previewBehaviorTimer = 2.8 + Math.random() * 3.2;
                }
            }
            const scanActivity = previewBehaviorState === 'idle' ? 0 : Math.sin((previewBehaviorAge / Math.max(previewBehaviorLength, 0.001)) * Math.PI);
            previewRig.root.rotation.y = 0.16 + scanActivity * 0.22 * previewBehaviorFlip;
            previewRig.root.rotation.z = scanActivity * 0.05 * previewBehaviorFlip;
            previewBlinkTimer -= delta;
            if (previewBlinkTimer <= 0) {
                previewBlinkOpen = previewBlinkOpen > 0.5 ? 0.18 : 1.0;
                previewBlinkTimer = previewBlinkOpen > 0.5 ? 0.08 + Math.random() * 0.08 : 0.25 + Math.random() * 0.35;
            }
            previewEyeMeshes.forEach(material => {
                material.opacity = previewBlinkOpen;
                material.emissiveIntensity = previewBlinkOpen * 1.2;
            });
        } else if (previewSkinId === 'NEON_CYBORG') {
            if (previewBehaviorState === 'idle') {
                previewBehaviorTimer -= delta;
                if (previewBehaviorTimer <= 0) {
                    previewBehaviorState = 'flex';
                    previewBehaviorLength = 0.8 + Math.random() * 0.5;
                    previewBehaviorAge = 0;
                    previewBehaviorFlip = Math.random() > 0.5 ? 1 : -1;
                }
            } else {
                previewBehaviorAge += delta;
                if (previewBehaviorAge >= previewBehaviorLength) {
                    previewBehaviorState = 'idle';
                    previewBehaviorTimer = 4.2 + Math.random() * 3.2;
                }
            }
            const flexActivity = previewBehaviorState === 'idle' ? 0 : Math.sin((previewBehaviorAge / Math.max(previewBehaviorLength, 0.001)) * Math.PI);
            previewRig.armR.rotation.z = 0.1 + flexActivity * 0.16 * previewBehaviorFlip;
            previewRig.armR.rotation.x = 0.04 + flexActivity * 0.12;
            previewRig.armL.rotation.z = 0.02 + flexActivity * 0.06;
            previewRig.armL.position.y = 0.9 + flexActivity * 0.06;
            previewRig.armR.position.y = 0.9 + flexActivity * 0.06;
            previewRig.root.rotation.y = 0.2 + flexActivity * 0.06;
            previewChestPulse = 0.45 + Math.sin(time * 4.8) * 0.1 + flexActivity * 0.25;
            previewGlowMeshes.forEach(material => {
                material.emissiveIntensity = previewChestPulse;
            });
        } else if (previewSkinId === 'HAZMAT_SPECIALIST') {
            previewModel.position.y = 0.01 + Math.sin(time * 1.4) * 0.024;
            if (previewBehaviorState === 'idle') {
                previewBehaviorTimer -= delta;
                if (previewBehaviorTimer <= 0) {
                    previewBehaviorState = 'adjust';
                    previewBehaviorLength = 1.0 + Math.random() * 0.8;
                    previewBehaviorAge = 0;
                    previewBehaviorFlip = Math.random() > 0.5 ? 1 : -1;
                }
            } else {
                previewBehaviorAge += delta;
                if (previewBehaviorAge >= previewBehaviorLength) {
                    previewBehaviorState = 'idle';
                    previewBehaviorTimer = 3.2 + Math.random() * 3.2;
                }
            }
            const loadActivity = previewBehaviorState === 'idle' ? 0 : Math.sin((previewBehaviorAge / Math.max(previewBehaviorLength, 0.001)) * Math.PI);
            previewRig.armL.rotation.z = 0.06 + loadActivity * 0.09 * previewBehaviorFlip;
            previewRig.armR.rotation.z = -0.06 - loadActivity * 0.09 * previewBehaviorFlip;
            previewRig.root.rotation.z = loadActivity * 0.04 * previewBehaviorFlip;
            previewRig.root.rotation.y = 0.2 + loadActivity * 0.05;
            previewRig.root.position.y = loadActivity * 0.01;
            previewTankMeshes.forEach(mesh => {
                if (!mesh || !mesh.isObject3D || !mesh.position) return;
                try {
                    mesh.position.y = 0.6 + loadActivity * 0.015;
                } catch (innerError) {
                    console.warn('Skipping preview tank update:', innerError);
                }
            });
        }
    } catch (error) {
        console.warn('Preview animation failed for skin:', previewSkinId, error);
        if (previewModel) {
            previewModel.position.set(0, 0, 0);
            previewModel.rotation.set(0, 0, 0);
        }
        if (previewRootGroup) {
            previewRootGroup.rotation.set(0, previewFacingOffset + 0.2, 0);
        }
    }
}

function startPreviewLoop() {
    if (!previewRenderer) createPreviewScene();
    resizePreview();
    stopPreviewLoop();
    previewActive = true;
    previewTime = 0;
    previewLastTimestamp = null;

    const tick = (timestamp) => {
        if (!previewActive || !previewScene || !previewRenderer || !previewCamera) return;
        let delta = 0.016;
        if (previewLastTimestamp !== null) {
            delta = Math.min((timestamp - previewLastTimestamp) / 1000, 0.05);
        }
        previewLastTimestamp = timestamp;
        previewTime += delta;
        animatePreviewEnvironment(delta);
        if (previewModel) {
            animatePreviewModel(delta);
            positionPreviewPlatform();
        }
        previewRenderer.render(previewScene, previewCamera);
        previewAnimationFrame = requestAnimationFrame(tick);
    };
    previewAnimationFrame = requestAnimationFrame(tick);
}

function buildPreviewRigForSkin(skinId) {
    if (skinId === 'TECH_OPERATOR') return createTechOperator();
    if (skinId === 'JETPACK_PILOT') return createJetpackPilot();
    if (skinId === 'STEALTH_PILOT') return createStealthPilot();
    if (skinId === 'NEON_CYBORG') return createNeonCyborg();
    return createHazmatSpecialist();
}

function updatePreviewForSkin(skinId) {
    if (!previewScene) createPreviewScene();
    if (previewModel) {
        if (previewModel.parent) previewModel.parent.remove(previewModel);
        else previewScene.remove(previewModel);
    }

    try {
        const rig = buildPreviewRigForSkin(skinId);
        if (!rig || !rig.root || !rig.root.isObject3D) {
            throw new Error('Invalid preview rig returned');
        }
        previewRig = rig;
        previewSkinId = skinId;
        previewFacingOffset = previewFacingOffsets[skinId] || 0;
        previewModel = rig.root;
        previewModel.position.set(0, 0.0, 0);
        previewModel.rotation.set(0, 0.0, 0);
        previewModel.scale.setScalar(1.0);
        if (previewModel.parent) previewModel.parent.remove(previewModel);
        previewRootGroup.add(previewModel);
        collectPreviewMaterials();
        resetPreviewPersonality();
        updatePreviewLighting(skinId);
        updatePreviewEnvironment(skinId);
        framePreviewModel();
        positionPreviewPlatform();
    } catch (error) {
        console.warn('Preview model creation failed for skin:', skinId, error);
        previewModel = null;
        previewRig = null;
        previewSkinId = skinId;
    }

    const skinData = skinsList.find(skinEntry => skinEntry.id === skinId) || skinsList[0];
    skinPreviewName.innerText = 'SELECTED SKIN: ' + skinData.name.toUpperCase();
    updateSkinInfoPanel(skinData);
}

function updateSkinInfoPanel(skinData) {
    if (!skinData) return;
    if (skinInfoName) skinInfoName.textContent = skinData.name.toUpperCase();
    if (skinInfoDescription) skinInfoDescription.textContent = '"' + skinData.description + '"';
    if (skinInfoRole) {
        skinInfoRole.textContent = skinData.role;
        skinInfoRole.style.color = skinData.nameColor || skinData.color;
    }
    if (skinInfoTheme) {
        skinInfoTheme.textContent = skinData.themeLabel;
        skinInfoTheme.style.color = skinData.nameColor || skinData.color;
    }
    if (skinInfoPanel) skinInfoPanel.style.setProperty('--skin-accent', skinData.border);
}

function renderSkinCards() {
    skinCardList.innerHTML = '';
    skinsList.forEach(skinData => {
        const isSelected = skinData.id === selectedSkinId;
        const isEquipped = skinData.id === currentSkin;
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'skin-card' + (isSelected ? ' skin-card--selected' : '');
        card.style.setProperty('--skin-accent', skinData.border);
        if (isSelected) {
            card.style.borderColor = skinData.border;
            card.style.backgroundColor = '#132347';
        }
        card.innerHTML = `
            ${isEquipped ? '<span class="skin-equipped-badge">Equipped</span>' : ''}
            <span class="ss-card-name" style="color: ${skinData.nameColor || skinData.color}; padding-right: ${isEquipped ? '72px' : '0'};">${skinData.name}</span>
            <span class="ss-card-status${isSelected ? ' ss-card-status--active' : ''}">${isEquipped ? 'Active operator loadout' : 'Preview operator'}</span>
        `;
        card.addEventListener('click', () => {
            selectedSkinId = skinData.id;
            updatePreviewForSkin(selectedSkinId);
            renderSkinCards();
        });
        skinCardList.appendChild(card);
    });
}

function openSkinModal() {
    if (skinModalCloseTimer) {
        clearTimeout(skinModalCloseTimer);
        skinModalCloseTimer = null;
    }
    selectedSkinId = currentSkin;
    renderSkinCards();
    updatePreviewForSkin(selectedSkinId);
    if (skinSelectorUi) skinSelectorUi.classList.remove('skin-modal-closing');
    skinModal.style.display = 'block';
    requestAnimationFrame(() => {
        if (skinSelectorUi) skinSelectorUi.classList.add('skin-modal-visible');
    });
    startPreviewLoop();
}

function closeSkinModal() {
    stopPreviewLoop();
    if (skinSelectorUi) {
        skinSelectorUi.classList.remove('skin-modal-visible');
        skinSelectorUi.classList.add('skin-modal-closing');
    }
    if (skinModalCloseTimer) clearTimeout(skinModalCloseTimer);
    skinModalCloseTimer = setTimeout(() => {
        skinModal.style.display = 'none';
        if (skinSelectorUi) skinSelectorUi.classList.remove('skin-modal-closing');
        skinModalCloseTimer = null;
    }, 160);
}

function initSkinPreview() {
    const skinBtn = document.getElementById('skin-toggle-btn');
    const skinEquipBtn = document.getElementById('skin-equip-btn');
    const skinModalCloseBtn = document.getElementById('skin-modal-close-btn');
    skinModal = document.getElementById('skin-selection-modal');
    skinSelectorUi = document.getElementById('skin-selector-ui');
    skinCardList = document.getElementById('skin-card-list');
    skinPreviewContainer = document.getElementById('skin-preview-container');
    skinPreviewName = document.getElementById('skin-preview-name');
    skinInfoPanel = document.getElementById('skin-info-panel');
    skinInfoName = document.getElementById('skin-info-name');
    skinInfoDescription = document.getElementById('skin-info-description');
    skinInfoRole = document.getElementById('skin-info-role');
    skinInfoTheme = document.getElementById('skin-info-theme');

    skinBtn.addEventListener('click', openSkinModal);
    skinModalCloseBtn.addEventListener('click', closeSkinModal);
    if (skinSelectorUi) {
        skinSelectorUi.addEventListener('click', event => {
            if (event.target === skinSelectorUi) closeSkinModal();
        });
    }
    skinEquipBtn.addEventListener('click', () => {
        currentSkin = selectedSkinId;
        syncSkinSelectionState();
        applyPlayerSkin();
        unlockAchievement('fashion_forward');
        closeSkinModal();
    });

    syncSkinSelectionState();
    updatePreviewForSkin(selectedSkinId);
    window.addEventListener('resize', resizePreview);
}

function syncSkinSelectionState() {
    const currentSkinIndex = skinsList.findIndex(skinData => skinData.id === currentSkin);
    if (currentSkinIndex < 0) currentSkinIndex = 0;
    selectedSkinId = currentSkin;
    const skinBtn = document.getElementById('skin-toggle-btn');
    skinBtn.innerText = 'SELECT SKIN';
    skinBtn.style.background = '#1a237e';
    skinBtn.style.borderColor = '#3f51b5';
    skinBtn.style.color = '#00e5ff';
}
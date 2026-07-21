// --- UTILITY FUNCTIONS ---

function getGroundHeight(x, z, feetY) {
    let maxH = 0;
    for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (o.isPlane) continue;
        const dist = Math.sqrt(Math.pow(x - o.position.x, 2) + Math.pow(z - o.position.z, 2));
        if (dist < (o.radius + 0.5)) {
            if (feetY >= o.topY - 0.3) { if (o.topY > maxH) maxH = o.topY; }
        }
    }
    return maxH;
}

// Updated checkCollision to natively ignore barrels for projectiles
function checkCollision(position, radius = 0.5, feetY = -999, ignoreBarrels = false) {
    const limit = currentMode === 'DEFEND_PLANE' ? 198 : 48;
    if (position.x < -limit || position.x > limit || position.z < -limit || position.z > limit) return true;

    for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (ignoreBarrels && o.isBarrel) continue; // PROJECTILE PASS-THROUGH FOR BARRELS

        if (feetY !== -999) { if (feetY >= o.topY - 0.2) continue; }
        else { if (position.y > o.topY) continue; }

        const dist = Math.sqrt(Math.pow(position.x - o.position.x, 2) + Math.pow(position.z - o.position.z, 2));
        if (dist < (radius + o.radius)) return true;
    }
    return false;
}

function resolveCollision(pos, radius = 0.5, feetY = -999) {
    const limit = currentMode === 'DEFEND_PLANE' ? 198 : 48;

    for (let iter = 0; iter < 3; iter++) {
        if (pos.x < -limit) pos.x = -limit;
        if (pos.x > limit) pos.x = limit;
        if (pos.z < -limit) pos.z = -limit;
        if (pos.z > limit) pos.z = limit;

        for (let i = 0; i < obstacles.length; i++) {
            const o = obstacles[i];
            if (feetY !== -999) { if (feetY >= o.topY - 0.2) continue; }
            else { if (pos.y > o.topY) continue; }

            const dx = pos.x - o.position.x;
            const dz = pos.z - o.position.z;
            const dist = Math.sqrt(dx * dx + dz * dz);
            const minDist = radius + o.radius;

            if (dist < minDist) {
                let pX = dx, pZ = dz, d = dist;
                if (d < 0.0001) { pX = 0.01; pZ = 0.01; d = 0.01414; }

                const push = minDist - d;
                pos.x += (pX / d) * push;
                pos.z += (pZ / d) * push;
            }
        }
    }
}

function checkEnemyCollision(pos) { return checkCollision(pos, 0.8, 0); }

function showMessage(text) {
    const el = document.getElementById('messages');
    el.innerText = text;
    el.style.opacity = 1;
    setTimeout(() => { el.style.opacity = 0; }, 2000);
}
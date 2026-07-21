// --- INPUT HANDLING ---
const onKeyDown = (event) => {
    if (playerStunTimer > 0 && event.code === 'Space') return;
    if (isGravityPulled && event.code === 'Space') return;

    switch (event.code) {
        case 'ArrowUp': case 'KeyW': const now = performance.now(); if (!moveState.forward && (now - lastWPressTime < 300)) isSprinting = true; lastWPressTime = now; moveState.forward = true; break;
        case 'ArrowLeft': case 'KeyA': moveState.left = true; break;
        case 'ArrowDown': case 'KeyS': moveState.backward = true; break;
        case 'ArrowRight': case 'KeyD': moveState.right = true; break;
        case 'ShiftLeft': case 'ShiftRight': isCrouching = true; break;
        case 'KeyZ': if (precisionCooldown <= 0 && !isGravityPulled && playerStunTimer <= 0) precisionActive = !precisionActive; break;
        case 'KeyC':
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
            break;
        case 'KeyE':
            if (currentMode === 'DEFEND_PLANE' && cannonConsole) {
                if (yawObject.position.distanceTo(cannonConsole.position) < 4.0 && cannonCooldown <= 0) triggerTowerCannon();
            }
            break;
        case 'Space': if (canJump && !isCrouching && !isGravityPulled) { velocity.y += JUMP_FORCE; canJump = false; } break;
        case 'KeyR': reload(); break;
    }
};

const onKeyUp = (event) => {
    switch (event.code) {
        case 'ArrowUp': case 'KeyW': moveState.forward = false; isSprinting = false; break;
        case 'ArrowLeft': case 'KeyA': moveState.left = false; break;
        case 'ArrowDown': case 'KeyS': moveState.backward = false; break;
        case 'ArrowRight': case 'KeyD': moveState.right = false; break;
        case 'ShiftLeft': case 'ShiftRight': isCrouching = false; if (criticalCooldown <= 0) lastUncrouchTime = performance.now(); break;
    }
};

function setupInputHandlers() {
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousedown', () => { if (!controls.isLocked) return; isFiring = true; });
    document.addEventListener('mouseup', () => { if (!controls.isLocked) return; isFiring = false; });

    window.addEventListener("gamepadconnected", (e) => {
        const padName = e.gamepad.id ? e.gamepad.id.substring(0, 20) : "CONTROLLER";
        showMessage(`🎮 ${padName} CONNECTED!`);
        document.getElementById('mode-box').innerText = `🎮 ${padName}`;
        document.getElementById('mode-box').style.color = "#4caf50";
    });

    window.addEventListener("gamepaddisconnected", (e) => {
        showMessage("🎮 GAMEPAD DISCONNECTED!");
        document.getElementById('mode-box').innerText = "PRECISION: READY";
        document.getElementById('mode-box').style.color = "#ffff00";
    });
}
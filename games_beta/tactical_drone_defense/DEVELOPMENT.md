# Tactical Drone Defense — Development Guide

## Purpose

This document explains the internal architecture of Tactical Drone Defense. It is intended for developers who need to understand, modify, or extend the game.

---

## Project Structure

```
tactical_drone_defense/
├── index.html              # Entry point, HTML structure, menu UI
├── css/
│   └── main.css            # All game styles
├── js/
│   ├── main.js             # Game initialization, main loop, game state, world building
│   ├── player.js           # Player character models and skin definitions
│   ├── weapons.js          # Weapon system, shooting, damage calculation
│   ├── enemies.js          # Enemy creation, AI behavior, projectiles
│   ├── waves.js            # Wave progression, enemy spawning, Tower Cannon
│   ├── ui.js               # Achievement system, menu system, HUD updates
│   ├── input.js            # Keyboard and mouse input handling
│   ├── audio.js            # Web Audio API sound effects and boss music
│   ├── utils.js            # Collision detection, ground height, utility functions
│   ├── skin-preview.js     # Skin selection modal and 3D preview
│   └── debug.js            # TDDebug developer console commands
├── assets/
│   └── music/
│       ├── juggernaut_boss_intro.ogg   # Boss intro music
│       └── juggernaut_boss_loop.ogg    # Boss loop music
└── README.md               # Project overview
```

### File Responsibilities

| File | Responsibility |
|------|---------------|
| `index.html` | HTML structure, menu screens, HUD elements, script loading order |
| `css/main.css` | All visual styling for menus, HUD, overlays, and UI components |
| `js/main.js` | Game constants, Three.js scene setup, camera controls, game state, world builders (warehouse/airfield), damage functions, main animation loop, initialization |
| `js/player.js` | 5 character skin definitions (Tech Operator, Jetpack Pilot, Stealth Pilot, Neon Cyborg, Hazmat Specialist), rig building, camera height offsets |
| `js/weapons.js` | Gun model, shooting pipeline, raycasting, damage multipliers (Precision/Critical/Airborne), reload logic, achievement triggers on kill |
| `js/enemies.js` | Enemy type definitions (soldier, elite, controller, drone, rogueDrone, juggernaut), 3D model creation, health bars, projectile/bomb creation |
| `js/waves.js` | Wave progression logic, enemy composition per wave, Tower Cannon trigger, `spawnEnemy()` factory function |
| `js/ui.js` | Achievement definitions and unlock logic, localStorage persistence, menu state machine, HUD updates, trophy room rendering |
| `js/input.js` | Keyboard event handlers (keydown/keyup), mouse fire handling, gamepad connect/disconnect events |
| `js/audio.js` | Web Audio API sound synthesis, boss music loading/playback (OGG), game over music, sound effects |
| `js/utils.js` | Collision detection, ground height calculation, collision resolution, enemy collision checks, message display |
| `js/skin-preview.js` | Skin selection modal UI, 3D preview scene with environment, character animation in preview |
| `js/debug.js` | `TDDebug` namespace with developer commands for testing waves, enemies, player, achievements, weapons |

---

## Game Architecture

### Initialization Process

1. `DOMContentLoaded` event fires → calls `init()` in `main.js`
2. `init()` performs:
   - Sets up debug functions (achievement debug commands)
   - Attaches menu button event handlers (mode toggle, play, trophy, etc.)
   - Initializes skin preview system (`initSkinPreview()`)
   - Renders trophy room (`renderTrophies()`)
   - Applies current player skin (`applyPlayerSkin()`)
   - Resets game state (`resetGame()`)
   - Starts animation loop (`animate()`)
   - Sets up pointer lock change handler
   - Sets up input handlers (`setupInputHandlers()`)
   - Sets up window resize handler
   - Notifies Game Hub launcher (`notifyGameStarted()`)

### Main Game Loop

The `animate()` function runs every frame via `requestAnimationFrame()`:

1. **Delta time calculation** — caps at 0.1s to prevent physics explosions
2. **Menu rendering** — if pointer not locked, renders menu scene with rotating character
3. **Player model updates** — visibility, rotation, camera position (third/first person)
4. **HUD update** — health, ammo, wave, mode, boss bar, plane bar
5. **Gamepad input** — reads controller state, applies aim assist
6. **Cooldown updates** — precision, critical, cannon
7. **Interaction prompt** — shows/hides near cannon console
8. **Physics** — gravity, velocity, movement direction, speed
9. **Player effects** — stun timer, disruption timer, camera shake
10. **Camera** — FOV lerp for crouch zoom, height lerp
11. **Movement** — velocity-based movement with collision resolution
12. **Character rig** — leg animation, arm aiming, crouch scaling, recoil
13. **Enemy AI updates** — per-enemy type behavior (movement, targeting, attacks)
14. **Projectile updates** — enemy bullet movement, homing, collision, damage
15. **Particle updates** — explosion particles, spark effects
16. **Render** — `renderer.render(scene, camera)`

### Rendering

- Three.js WebGL renderer with PCFSoftShadowMap
- Scene background and fog change based on game mode
- Warehouse: dark gray (`0x202020`) with exponential fog
- Airfield: sky blue (`0x87ceeb`) with light exponential fog, directional sunlight

### Entity Updates

- **Player**: position, velocity, collision, health, stun, gravity clamp, disruption
- **Enemies**: AI state machine per type, movement, targeting, attack cooldowns
- **Projectiles**: position, homing behavior, lifetime, collision with player/plane/obstacles
- **Particles**: position, velocity, lifetime, scale decay

### Input Handling

- **Keyboard**: `onKeyDown`/`onKeyUp` events in `input.js`
- **Mouse**: `mousemove` for camera, `mousedown`/`mouseup` for firing
- **Gamepad**: Polled every frame in `animate()` via `navigator.getGamepads()`
- **Pointer Lock**: Required for gameplay, toggled via click/escape

---

## Player System

### Movement

- Constants: `PLAYER_SPEED = 2.53`, `SPRINT_SPEED = 4.38`, `JUMP_FORCE = 15.0`, `GRAVITY = 27.5`
- Movement direction calculated from input state (WASD + gamepad)
- Velocity-based physics with ground collision
- Sprint activated by double-tapping W (300ms window)
- Crouch reduces speed to 0, zooms FOV to 25

### Camera

- **Yaw object** (horizontal rotation) — parent of pitch object
- **Pitch object** (vertical rotation) — parent of camera
- Third-person: camera at `(0.7, 0.15, 2.2)` relative to pitch
- First-person: camera at `(0, 0, 0)` relative to pitch
- Camera height adjusts per skin and crouch state

### Character Models

- 5 skins defined in `player.js` using `buildRigReturn()` helper
- Each skin returns: `{ root, armL, armR, legL, legR, baseScale, crouchScale, baseY, crouchY, camHeightBase, camHeightCrouch, gunOffset }`
- Models built from Three.js primitives (BoxGeometry, CylinderGeometry, SphereGeometry)
- Gun attached to right arm in third-person, or to camera in first-person

### Animations

- **Walking**: leg rotation oscillates via `Math.sin(time * animSpeed)`
- **Crouching**: model scale Y reduced, position lowered
- **Arm aiming**: arm pitch follows camera pitch
- **Recoil**: gun position offset on fire, lerps back
- **Reload**: gun rotation during reload animation

### Skins

- Skin selection via modal UI with 3D preview
- `applyPlayerSkin()` in `weapons.js` handles skin switching
- Camera height adjusts per skin (Stealth Pilot is shortest at 0.8m)

### Third-Person System

- Toggle with C key or Y button
- Player model visible when in third-person
- Gun attached to character's right hand
- Weapon firing originates from gun model position

---

## Weapon System

### Shooting Pipeline

1. `shoot()` called from animation loop when `isFiring` or `gpFiring` is true
2. Checks: not reloading, ammo > 0, fire rate cooldown
3. Decrements ammo, updates HUD, plays sound
4. Applies recoil to gun position
5. Determines shot type: Precision (10x), Airborne Critical (3x), Critical (2x), or normal
6. Raycasts from camera center to detect hit
7. If hit enemy: applies damage, triggers hit effects, checks for kill
8. If hit environment: creates spark particle
9. Draws tracer line from gun to hit point (40ms visible)

### Damage Calculations

- Base damage: `GUN_DAMAGE = 25`
- Precision Strike: `25 × 10 = 250` damage
- Critical Hit (ground): `25 × 2 = 50` damage
- Airborne Critical: `25 × 3 = 75` damage
- Enemy HP scales with wave: `maxHp = baseHp + (wave * 10)`

### Critical System

- Triggered by releasing crouch (Shift) and shooting within 300ms
- 5-second cooldown after successful critical
- If player is in the air (not `canJump`): Airborne Critical (3x)
- If player is on ground: normal Critical (2x)

### Precision System

- Toggle with Z key or D-Pad Up
- 40-second cooldown after firing
- Can toggle off without consuming cooldown
- Displays "PRECISION STRIKE!" message
- Unlocks 'surgical_precision' achievement

### Ammo Handling

- Clip size: 30 rounds
- Reserve ammo: 120 (refills to 60 when depleted)
- Reload time: 1.5 seconds
- Auto-reloads when firing with empty clip

---

## Enemy System

### Enemy Creation

- `spawnEnemy(type, position)` in `waves.js` — factory function
- Creates Three.js Group with appropriate model (humanoid, drone, or boss)
- Assigns HP, speed, health bar, and type metadata
- Spawns at random position within radius (or forced position)

### AI Behavior

Each enemy type has unique AI in the main animation loop:

| Type | Movement | Attack | Special |
|------|----------|--------|---------|
| Soldier | Seeks cover when shooting, pursues when far | Shoots projectiles (10 dmg) | 40% health drop on death |
| Elite | Same as soldier | Shoots projectiles (20 dmg) | Higher HP (160) |
| Drone | Flies toward target | Drops bombs (20 dmg) | Buffed by Controller (blue, faster) |
| Rogue Drone | Intelligent distance management, strafing | Drops bombs (15 dmg), causes disruption | Supports Juggernaut, cluster avoidance |
| Controller | Flees from player | Buffs drones | Antenna, tablet, point light |
| Juggernaut | Multi-phase state machine | Ring Barrage, Quake, Homing Missiles | Boss music, 2400+ HP |

### Navigation

- Simple direct movement toward target
- Collision avoidance via `checkEnemyCollision()`
- Defend the Plane mode: waypoint system for hangar navigation
- Enemies navigate around hangar walls using waypoint positions

### Damage Handling

- Projectiles (`createEnemyBullet`) — yellow cylinders, 40 speed, 3s lifetime
- Bombs (`createBomb`) — spheres with emissive color, 5s lifetime
- Homing missiles — purple, track player with 12.0 lerp factor
- Juggernaut bombs ignore barrel collisions (`ignoreBarrels = true`)

### Boss Systems

- Juggernaut uses 3-phase state machine (`bossPhase`: 0, 1, 2, 3)
- Phase 0 → 1: Ring Barrage (18 bombs)
- Phase 1 → 2: Quake Smash (stun or gravity clamp)
- Phase 2 → 0: Homing Barrage (4 missiles, 2 salvos)
- Phase 3: Rapid Punishment (8 rapid shots, then back to phase 2)
- Boss music plays during encounter (intro OGG + loop OGG)

---

## Wave System

### Wave Progression

- Wave counter increments on enemy clear or Tower Cannon use
- Wave 1 starts with 1 soldier, 1 drone, 1 controller
- Every 5th wave: Juggernaut boss wave
- Non-boss waves: elite count scales with wave, random enemy composition

### Wave Composition (Boss Waves)

| Wave | Juggernaut | Rogue Drones | Elite Guards | Soldiers | Drones | Controllers |
|------|-----------|-------------|-------------|----------|--------|-------------|
| 5 | 1 | 0 | 0 | 0 | 0 | 0 |
| 10 | 1 | 2 | 0 | 0 | 3 | 0 |
| 15 | 1 | 3 | 1 | 0 | 4 | 2 |
| 20+ | 1 | 4 | 1 | 2 | 9 | 4 |

### Difficulty Scaling

- Enemy HP scales: `baseHp + (wave * 10)`
- Elite count: `wave - 5` (for wave > 5)
- Random enemy count: `2 + ceil(wave * 1.5)`
- Controller spawns every 3 waves

### Boss Wave Behavior

- Juggernaut spawns alone on Wave 5
- Progressive composition adds more enemies in later boss waves
- Boss music starts on Juggernaut spawn, stops on death

---

## Achievement System

### Achievement Tracking

- 18 achievements defined in `ACHIEVEMENTS` object in `ui.js`
- Each has: `id`, `title`, `desc`, `icon`
- Unlocked achievements stored in `localStorage` key `tdd_achievements`
- Loaded on init: `JSON.parse(localStorage.getItem('tdd_achievements'))`

### Storage

- Persists across sessions via `localStorage`
- `unlockAchievement(id)` saves to localStorage immediately
- `renderTrophies()` renders all achievements in trophy room
- Locked achievements shown with reduced opacity

### Unlock Logic

Achievements unlock based on game events:

| Achievement | Trigger |
|-------------|---------|
| first_scrap | Any enemy killed |
| fashion_forward | Skin changed (in skin-preview.js) |
| heavy_artillery | Tower Cannon fired |
| surgical_precision | Precision Strike hits |
| death_from_above | Airborne Critical hits |
| warehouse_veteran | Wave ≥ 5 in SURVIVAL mode |
| airfield_defender | Wave ≥ 5 in DEFEND_PLANE mode |
| juggernaut_slayer | Juggernaut killed |
| fresh_supplies | Health drop received while HP ≤ 100 |
| overcharged | HP exceeds 100 |
| tactical_drone_denied | Controller killed before any drones in wave |
| drone_hunter | 100 drone kills (session counter) |
| elite_eliminator | 100 elite kills (session counter) |
| boss_slayer | 10 boss kills (session counter) |
| warehouse_survivor | Wave reaches 10 |
| warehouse_champion | Wave reaches 20 |
| warehouse_legend | Wave reaches 50 |
| no_survivors | All enemies cleared in a wave |

### Debug Commands

- `TDDebug.unlockAchievement(id)` — unlock specific achievement
- `TDDebug.unlockAllAchievements()` — unlock all
- `TDDebug.resetAchievements()` — reset all
- Legacy: `window.debugUnlockAchievement`, `window.debugResetAchievements`, `window.debugShowAchievements`

---

## Debug System

### TDDebug Namespace

The `TDDebug` namespace provides developer-only testing tools. Defined in `js/debug.js`.

**Initialization:**
- `window.TDDebug = window.TDDebug || {}` — safe initialization
- Only activates in development builds (`ACHIEVEMENT_DEBUG === true`)
- In production, empty namespace remains to prevent console errors

**Available Commands:**

| Command | Description |
|---------|-------------|
| `TDDebug.help()` | Display all commands |
| `TDDebug.status()` | Show game state |
| `TDDebug.setWave(n)` | Set wave number |
| `TDDebug.startWave()` | Start current wave |
| `TDDebug.skipWave()` | Complete wave and advance |
| `TDDebug.spawnEnemy(type, n)` | Spawn enemies |
| `TDDebug.spawnJuggernaut()` | Spawn Juggernaut |
| `TDDebug.spawnRogueDrone()` | Spawn Rogue Drone |
| `TDDebug.spawnAllBossEnemies()` | Spawn all bosses |
| `TDDebug.godMode(bool)` | Toggle invincibility |
| `TDDebug.setHealth(n)` | Set player health |
| `TDDebug.givePrecision()` | Grant precision buff |
| `TDDebug.clearEnemies()` | Remove all enemies |
| `TDDebug.unlockAchievement(id)` | Unlock achievement |
| `TDDebug.unlockAllAchievements()` | Unlock all |
| `TDDebug.resetAchievements()` | Reset all |
| `TDDebug.giveWeaponUpgrade()` | Full ammo |
| `TDDebug.resetWeapons()` | Reset weapons |
| `TDDebug.testDamage(n)` | Display damage values |

### Adding New Commands

```javascript
// In js/debug.js, inside the IIFE
window.TDDebug.yourCommand = function(params) {
    // Validate inputs
    // Execute logic
    // Log results
};
```

### Debug Safety

- Debug commands only available in development builds
- `ACHIEVEMENT_DEBUG` flag controls debug availability
- Legacy `window.debugXxx` functions mapped to `TDDebug` equivalents
- God mode check in `takeDamage()` prevents damage when enabled

---

## Future Development

### Known Issues

- Movement temporarily broken in v1.2.0 (fixed in v1.2.1)
- Barrel jumping initially non-functional (fixed in v1.2.2)
- See CHANGELOG.md for full history

### Planned Improvements

- Additional enemy types
- More game modes
- Weapon variety
- Map variety
- Sound design improvements
- Performance optimization

### v2.0.0 Release Goals

- Stable boss mechanics
- Complete achievement system
- Balanced difficulty progression
- Polish and bug fixes
- Full controller support
- Game Hub launcher integration complete
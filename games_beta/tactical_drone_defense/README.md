# Tactical Drone Defense

**Tactical Drone Defense** is a sci-fi first-person shooter survival game built with Three.js. Players fight waves of robotic enemies, defend objectives, and survive increasingly difficult encounters in a 3D arena.

> **Current Version:** v2.0.0-dev40  
> **Status:** Beta Development  
> **Engine:** Three.js (WebGL)  
> **Platform:** Browser (Desktop)

---

## Features

### Core Gameplay

- **First-person shooter gameplay** with third-person camera option
- **Wave-based survival combat** with progressive difficulty scaling
- **Enemy spawning system** with multiple enemy types and boss encounters
- **Weapon and ammo systems** with reload mechanics
- **Health system** with overheal capability (exceeding 100 HP)
- **Sprinting** — double-tap W to sprint
- **Crouching** — hold Shift to crouch (triggers critical hit window on release)
- **Jumping** — platform on obstacles and barrels
- **Reloading** — press R to reload weapon
- **HUD system** — health, ammo, wave counter, radar, mode indicators, boss health bar

### Game Modes

#### Warehouse Survival
- Survival-focused gameplay in a warehouse arena
- Fight waves of enemies using movement, obstacles, and weapons
- Barrels provide platforming and cover opportunities
- Foggy, dimly lit environment

#### Defend the Plane
- Objective-based mode on a large airfield
- Protect the Allied Plane from enemy attacks
- Plane integrity system (1500 HP max)
- Enemies target the plane with bombs and projectiles
- Tower Cannon mechanic — press E/LB near the console to clear all enemies (30-second cooldown)
- Hangar structure with waypoint navigation for enemies

### Characters

Five playable character skins, each with unique visual models and adjusted camera heights:

| Skin | Description |
|------|-------------|
| **Tech Operator** | Navy/orange combat robot. Tactical frontline specialist. |
| **Jetpack Pilot** | White flight suit character with purple thrusters. High-altitude mobility operative. |
| **Stealth Pilot** | Small black stealth-focused robot with green eyes. Covert infiltration expert. Shortest skin — camera height reduced. |
| **Neon Cyborg** | Hot pink/chrome cybernetic character with asymmetrical design. Cybernetically enhanced soldier. |
| **Hazmat Specialist** | Yellow biohazard protection suit with dual oxygen tanks and gas mask. Hazard zone containment unit. |

- Each skin has different visual models (torso, limbs, head, accessories)
- Camera height adjusts dynamically based on character
- Third-person model visible when in third-person mode

### Enemies

| Enemy | HP | Speed | Behavior |
|-------|----|-------|----------|
| **Soldier** | 80 | 3.0 | Basic ranged enemy. Shoots projectiles at player/plane. Seeks cover. Drops health (40% chance). |
| **Drone** | 40 | 3.0 | Flying enemy. Drops bombs on targets. Turns blue/empowered when Controller is active. |
| **Rogue Drone** | 80 | 3.5 | Advanced flying enemy with intelligent combat AI. Maintains attack distance, strafes, causes signal interference. Supports Juggernaut. |
| **Controller** | 120 | 5.5-6.7 | Support enemy that buffs nearby drones (blue glow, increased speed/damage). Flees from player. |
| **Elite Guard** | 160 | 1.5 | Advanced soldier unit with higher HP and damage (20 per hit). Green armor with yellow visor. |
| **Juggernaut Boss** | 2400 + wave×10 | 5.0 | Massive boss enemy with multi-phase attack patterns. Spawns on wave 5 and every 5 waves thereafter. |

#### Juggernaut Boss Abilities

The Juggernaut uses a 3-phase state machine:

1. **Ring Barrage** — 18 bombs spawn in a perfect circle around the boss and expand outward. Jump to evade. (11.5 damage per bomb)
2. **Quake Smash** — Ground slam attack. If player is on the ground: 5-second stun. If player jumps: Gravity Clamp activated (jump blocked, heavy gravity pull).
3. **Homing Missile Barrage** — 4 tracking missiles with purple neon trails. Fires in salvos of 8 shots total.

The boss fight is multi-phase, cycling through these abilities. Defeating the Juggernaut heals the player for +200 HP.

### Player Abilities

#### Precision Strike
- **10x damage multiplier** on next shot
- Toggle activated via Z key or D-Pad Up
- 40-second cooldown after firing
- Can be toggled off without consuming cooldown
- Displays "PRECISION STRIKE!" message on hit

#### Critical Hits
- Timing-based increased damage
- Activate by releasing crouch (Shift) and shooting within 300ms
- **2x damage** when on the ground
- **3x damage (Airborne Critical)** when jumping
- 5-second cooldown

### Controls

| Action | Keyboard | Controller |
|--------|----------|------------|
| Move | WASD | Left Stick |
| Aim | Mouse | Right Stick |
| Fire | Left Click | RT |
| Reload | R | X |
| Jump | Space | A |
| Sprint | Double-tap W | L3 (toggle) |
| Crouch | Hold Shift | LT |
| Precision Strike | Z | D-Pad Up |
| Toggle Camera | C | Y |
| Interact | E | LB |
| Pause | Escape | — |

### Controller Support

- Xbox/PlayStation controller support via Gamepad API
- Full gamepad mapping for all actions
- **Aim Assist** features:
  - **Friction** — 50% sensitivity reduction when aiming near enemies
  - **Magnetism** — camera gently pulls toward enemy center of mass

### Achievements

18 achievements tracked via localStorage:

| ID | Title | Description |
|----|-------|-------------|
| first_scrap | First Scrap | Destroy your first enemy |
| fashion_forward | Fashion Forward | Change your character skin |
| heavy_artillery | Heavy Artillery | Fire the Tower Cannon |
| surgical_precision | Surgical Precision | Land a 10x Precision Strike |
| death_from_above | Death From Above | Land a 3x Airborne Critical |
| warehouse_veteran | Warehouse Veteran | Reach Wave 5 in Survival |
| airfield_defender | Airfield Defender | Reach Wave 5 in Defend the Plane |
| juggernaut_slayer | David vs. Goliath | Defeat the Juggernaut Boss |
| fresh_supplies | Fresh Supplies | First health drop without exceeding 100 HP |
| overcharged | Overcharged | Exceed 100 HP via overheal |
| tactical_drone_denied | Tactical Drone Denied | Destroy a Controller before any Drones |
| drone_hunter | Drone Hunter | Destroy 100 Drones |
| elite_eliminator | Elite Eliminator | Destroy 100 Elite Guards |
| boss_slayer | Boss Slayer | Defeat 10 Juggernauts |
| warehouse_survivor | Warehouse Survivor | Reach Wave 10 |
| warehouse_champion | Warehouse Champion | Reach Wave 20 |
| warehouse_legend | Warehouse Legend | Reach Wave 50 |
| no_survivors | No Survivors | Clear an entire wave |

- Achievement notifications appear as toast popups
- Trophy Room accessible from main menu
- Data persists in browser localStorage

### Launcher Integration

- Compatible with Game Hub launcher
- Sends `game_started` and `game_closed` events via localStorage queue bridge
- "Return to Launcher" button on Main Menu, Pause Menu, and Game Over screen
- Redirects to `../../index.html`

---

## Running the Game

### Local Development

1. **Serve the project directory** using any HTTP server (required for Three.js module loading):
   ```bash
   # Using Python
   python3 -m http.server 8000

   # Using Node.js (npx)
   npx serve .
   ```

2. **Open in browser**: Navigate to `http://localhost:8000` (or the port your server uses)

3. **Required browser**: Any modern browser with WebGL support (Chrome, Firefox, Edge recommended)

### Development Workflow

- All game logic is in the `js/` directory
- Three.js library is loaded from `../../engine/three.min.js` (relative to game path)
- Open browser console to access `TDDebug` developer commands
- Refresh browser to reload changes

---

## Project Status

This project is in **Beta Development**. Features are being actively developed and may change. The current development focus is on:

- Boss mechanics and enemy variety
- Game mode content
- Achievement system
- Polish and bug fixes

See [CHANGELOG.md](CHANGELOG.md) for version history.
# Tactical Drone Defense — Testing Guide

## Purpose

This document provides a manual QA checklist for testing Tactical Drone Defense. The goal is to prevent unfinished systems and untested bugs from reaching releases.

## Testing Rules

> **Every feature must be tested in the running game before being considered complete.**

Code review alone is not enough. All changes must be verified by launching the game and testing the modified feature in real-time.

---

## Startup Testing

Before any feature testing, verify the game launches correctly:

- [ ] Game launches successfully (no file loading errors)
- [ ] Main menu loads with all UI elements visible
- [ ] No startup console errors (check browser DevTools console)
- [ ] DEPLOY button works and starts the game
- [ ] HUD loads correctly after deployment
- [ ] Game renders in the browser without WebGL errors

---

## Debug System Testing

Open the browser console and test the `TDDebug` namespace:

### Help and Status
- [ ] `TDDebug.help()` displays all available commands
- [ ] `TDDebug.status()` shows comprehensive game state

### Wave Commands
- [ ] `TDDebug.setWave(5)` changes the wave number
- [ ] `TDDebug.startWave()` starts enemy spawning
- [ ] `TDDebug.skipWave()` completes current wave and advances

### Enemy Spawn Commands
- [ ] `TDDebug.spawnEnemy('soldier', 3)` spawns 3 soldiers
- [ ] `TDDebug.spawnEnemy('elite', 2)` spawns 2 elite guards
- [ ] `TDDebug.spawnEnemy('controller', 1)` spawns a controller
- [ ] `TDDebug.spawnEnemy('drone', 3)` spawns 3 drones
- [ ] `TDDebug.spawnJuggernaut()` spawns a Juggernaut boss
- [ ] `TDDebug.spawnRogueDrone()` spawns a Rogue Drone
- [ ] `TDDebug.spawnAllBossEnemies()` spawns Juggernaut + 2 Rogue Drones
- [ ] Spawned enemies behave correctly (move, attack, take damage)
- [ ] No crashes occur during or after spawning

### Player Testing Commands
- [ ] `TDDebug.godMode(true)` enables invincibility
- [ ] `TDDebug.godMode(false)` disables invincibility
- [ ] `TDDebug.setHealth(50)` sets player health to 50
- [ ] `TDDebug.givePrecision()` grants precision buff
- [ ] `TDDebug.clearEnemies()` removes all enemies from the map

### Achievement Commands
- [ ] `TDDebug.unlockAchievement('first_scrap')` unlocks a specific achievement
- [ ] `TDDebug.unlockAllAchievements()` unlocks all achievements
- [ ] `TDDebug.resetAchievements()` resets all achievements

### Weapon Commands
- [ ] `TDDebug.giveWeaponUpgrade()` gives full ammo
- [ ] `TDDebug.resetWeapons()` resets weapons to default
- [ ] `TDDebug.testDamage(100)` displays damage values

---

## Gameplay Testing

### Player Movement
- [ ] WASD movement works correctly
- [ ] Sprint (double-tap W) works
- [ ] Jump (Space) works
- [ ] Crouch (Hold Shift) works
- [ ] Camera follows player correctly
- [ ] Third-person mode toggle (C) works
- [ ] Character animations play correctly (walking, crouching)
- [ ] Player cannot move while stunned (Juggernaut Quake)
- [ ] Player cannot jump while Gravity Clamped

### Weapons
- [ ] Shooting (Left Click) works
- [ ] Reloading (R) works
- [ ] Ammo decreases on fire and refills on reload
- [ ] Damage is applied to enemies
- [ ] Critical hits (release crouch + shoot within 300ms) work
- [ ] Precision Strike (Z) toggles and applies 10x damage
- [ ] Airborne critical (jump + critical) applies 3x damage
- [ ] Weapon recoil animation plays
- [ ] Muzzle flash appears

### Enemies
- [ ] Enemies spawn correctly at wave start
- [ ] Enemies move toward player/objective
- [ ] Enemy AI behaves correctly (soldiers seek cover, drones fly, etc.)
- [ ] Enemies take damage and health bars update
- [ ] Enemy death effects play (explosions, sounds)
- [ ] Controller buffs nearby drones (blue glow, increased speed)
- [ ] Rogue Drone causes signal interference on attack
- [ ] Enemies target the plane in Defend the Plane mode

### Boss Testing — Juggernaut
- [ ] Juggernaut spawns correctly on wave 5
- [ ] Boss health bar appears at top of screen
- [ ] Ring Barrage attack: 18 bombs expand outward from boss
- [ ] Quake Smash: ground slam stuns player (5s) if on ground
- [ ] Gravity Clamp activates if player jumps over Quake
- [ ] Homing Missile Barrage: 4 tracking missiles fire
- [ ] Boss music plays during encounter
- [ ] Boss death triggers +200 HP heal
- [ ] Boss death stops boss music

### Game Modes
- [ ] Warehouse Survival mode works
- [ ] Defend the Plane mode works
- [ ] Mode toggle on main menu switches correctly
- [ ] Plane integrity bar displays in Defend the Plane
- [ ] Tower Cannon clears all enemies (30s cooldown)
- [ ] Map changes based on selected mode

### HUD
- [ ] Health bar updates correctly
- [ ] Health bar turns cyan when overhealed (>100 HP)
- [ ] Ammo counter updates on fire/reload
- [ ] Wave number displays correctly
- [ ] Mode box shows Precision/Critical status
- [ ] Radar shows enemy distance
- [ ] Interaction prompt appears near cannon console
- [ ] Damage overlay flashes on hit

### Menus
- [ ] Main menu displays correctly
- [ ] Pause menu (Escape) works
- [ ] Game Over screen displays on death
- [ ] Trophy Room shows achievements
- [ ] Skin selector works and previews characters
- [ ] "Return to Launcher" buttons work

### Controller Support
- [ ] Gamepad detected message appears
- [ ] Left Stick moves player
- [ ] Right Stick controls camera
- [ ] RT fires weapon
- [ ] LT crouches/zooms
- [ ] A jumps
- [ ] X reloads
- [ ] Y toggles camera mode
- [ ] LB interacts (cannon console)
- [ ] L3 toggles sprint
- [ ] D-Pad Up toggles Precision
- [ ] Aim assist friction works (reduced sensitivity near enemies)
- [ ] Aim assist magnetism works (camera pulls toward enemies)

### Achievements
- [ ] First Scrap — destroy first enemy
- [ ] Fashion Forward — change skin
- [ ] Heavy Artillery — fire Tower Cannon
- [ ] Surgical Precision — land Precision Strike
- [ ] Death From Above — land Airborne Critical
- [ ] Warehouse Veteran — reach Wave 5 in Survival
- [ ] Airfield Defender — reach Wave 5 in Defend the Plane
- [ ] David vs. Goliath — defeat Juggernaut
- [ ] Fresh Supplies — receive health drop without exceeding 100 HP
- [ ] Overcharged — exceed 100 HP
- [ ] Tactical Drone Denied — destroy Controller before any Drones
- [ ] Drone Hunter — destroy 100 Drones
- [ ] Elite Eliminator — destroy 100 Elite Guards
- [ ] Boss Slayer — defeat 10 Juggernauts
- [ ] Warehouse Survivor — reach Wave 10
- [ ] Warehouse Champion — reach Wave 20
- [ ] Warehouse Legend — reach Wave 50
- [ ] No Survivors — clear an entire wave
- [ ] Achievement toast notification appears on unlock
- [ ] Achievements persist in localStorage after page refresh

---

## Regression Testing

Before every version release:

- [ ] Play normally for 5+ waves in Warehouse Survival
- [ ] Play normally for 5+ waves in Defend the Plane
- [ ] Test all debug commands
- [ ] Check browser console for errors or warnings
- [ ] Check for crashes during gameplay
- [ ] Verify no regression in previously fixed bugs
- [ ] Test on multiple browsers if possible
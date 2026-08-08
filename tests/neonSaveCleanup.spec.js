// ==========================================
// NEON SURVIVAL SAVE-CLEANUP REGRESSION TESTS
// ==========================================
// Verifies the Neon Survival game's own clearSaveData() API only deletes saves
// when explicitly requested (opt-in), never touches preferences unless asked,
// and always preserves the shared game-hub-event-queue.
//
// The real game source (../../games/neon-survival/js/main.js) is read and its
// actual `profileKey` + `clearSaveData` functions are executed in a Node `vm`
// with a stub `localStorage`. This tests the genuine game code (no THREE or
// full DOM required) exactly as shipped.
//
// Also asserts the launcher orchestrator never invokes the game API when
// uninstalling with deleteSaves:false.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { test, expect } = require('@playwright/test');
const { uninstallGameWithSaveHandling } = require('../src/downloader/saveCleanup');

const NEON_MAIN = path.resolve(__dirname, '../../games/neon-survival/js/main.js');
const src = fs.readFileSync(NEON_MAIN, 'utf8');

// Extract the two functions we exercise, straight from the real file.
const profileKeySrc = src.match(/function profileKey\(key\) \{[\s\S]*?\n\}/)[0];
const clearSaveDataSrc = src.match(/window\.gameHub\.clearSaveData = function \(opts\) \{[\s\S]*?\n\};/)[0];

function createNeonEnv(seed = {}) {
    const backing = new Map(Object.entries(seed));
    const context = {
        PROFILE_ID: 'default',
        // profileKey() -> neon_default_<key>
        localStorage: {
            getItem: (k) => (backing.has(k) ? backing.get(k) : null),
            setItem: (k, v) => backing.set(k, String(v)),
            removeItem: (k) => backing.delete(k)
        },
        window: {}
    };
    vm.createContext(context);
    vm.runInContext(
        `${profileKeySrc}\nwindow.gameHub = {};\n${clearSaveDataSrc}`,
        context
    );
    return {
        store: backing,
        clearSaveData: (opts) => context.window.gameHub.clearSaveData(opts)
    };
}

function neonSeed(overrides = {}) {
    return {
        neon_default_stats: '{"kills":5}',
        neon_default_unlocks: '{"first_kill":true}',
        neonStats: '{"kills":3}',
        neonUnlocks: '{"eliminator":true}',
        neon_default_settings_v2: '{"mouseSens":0.002}',
        neonSettings_v2: '{"mouseSens":0.002}',
        'game-hub-event-queue': '[{"type":"achievement_unlock"}]',
        ...overrides
    };
}

const PROGRESS_KEYS = ['neon_default_stats', 'neon_default_unlocks', 'neonStats', 'neonUnlocks'];
const PREF_KEYS = ['neon_default_settings_v2', 'neonSettings_v2'];

test('Neon clearSaveData() with no options preserves saves', () => {
    const { store, clearSaveData } = createNeonEnv(neonSeed());
    const res = clearSaveData();
    expect(res.ok).toBe(true);
    for (const k of [...PROGRESS_KEYS, ...PREF_KEYS, 'game-hub-event-queue']) {
        expect(store.has(k)).toBe(true);
    }
    expect(res.removed).toEqual([]);
});

test('Neon clearSaveData({}) preserves saves', () => {
    const { store, clearSaveData } = createNeonEnv(neonSeed());
    clearSaveData({});
    for (const k of [...PROGRESS_KEYS, ...PREF_KEYS, 'game-hub-event-queue']) {
        expect(store.has(k)).toBe(true);
    }
});

test('Neon clearSaveData({ deleteSaves:false }) preserves saves', () => {
    const { store, clearSaveData } = createNeonEnv(neonSeed());
    clearSaveData({ deleteSaves: false });
    for (const k of [...PROGRESS_KEYS, ...PREF_KEYS, 'game-hub-event-queue']) {
        expect(store.has(k)).toBe(true);
    }
});

test('Neon clearSaveData({ deleteSaves:true }) removes progress/play-history keys', () => {
    const { store, clearSaveData } = createNeonEnv(neonSeed());
    const res = clearSaveData({ deleteSaves: true });
    for (const k of PROGRESS_KEYS) {
        expect(store.has(k)).toBe(false);
    }
    expect(res.removed).toEqual(PROGRESS_KEYS);
});

test('Neon preferences remain when deletePreferences:false (even with deleteSaves:true)', () => {
    const { store, clearSaveData } = createNeonEnv(neonSeed());
    clearSaveData({ deleteSaves: true, deletePreferences: false });
    for (const k of PREF_KEYS) {
        expect(store.has(k)).toBe(true);
    }
    for (const k of PROGRESS_KEYS) {
        expect(store.has(k)).toBe(false);
    }
});

test('game-hub-event-queue always survives every clearSaveData call', () => {
    const { store, clearSaveData } = createNeonEnv(neonSeed());
    clearSaveData({ deleteSaves: true, deletePreferences: true });
    expect(store.get('game-hub-event-queue')).toBe('[{"type":"achievement_unlock"}]');
});

test('uninstallGameWithSaveHandling({deleteSaves:false}) never invokes the game API', async () => {
    let clearCalled = 0;
    const result = await uninstallGameWithSaveHandling({
        app: {},
        gameId: 'neon-survival',
        options: { deleteSaves: false },
        store: {},
        clearFn: async () => { clearCalled += 1; return { success: true }; },
        uninstallFn: (app, id, opts, store) => ({ success: true, gameId: id })
    });
    expect(result.success).toBe(true);
    expect(result.deleteSaves).toBe(false);
    expect(result.saveCleared).toBe(false);
    expect(clearCalled).toBe(0);
});

// ==========================================
// UNINSTALLER TESTS
// ==========================================
// Verifies the safe uninstall system:
//   - successful uninstall removes files and metadata
//   - failed deletion keeps metadata intact
//   - invalid gameId is rejected
//   - deleteSaves=true removes launcher-managed saves only
//   - default uninstall preserves saves
//
// Uses a mock Electron app (temp userData dir) and a mock store so the
// real uninstaller module runs through its actual code paths.

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { uninstallGame, validateGameId, resolveInstallPath } = require('../src/downloader/uninstaller');

// ==========================================
// HELPERS
// ==========================================

/**
 * Create a mock Electron app object.
 * userData points to a fresh temp directory.
 */
function createMockApp() {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gamehub-uninstall-test-'));
    return {
        getPath: (name) => {
            if (name === 'userData') return userData;
            throw new Error(`Unexpected getPath call: ${name}`);
        }
    };
}

/**
 * Create a mock electron-store instance backed by an in-memory object.
 */
function createMockStore(initial = {}) {
    const data = JSON.parse(JSON.stringify(initial));
    return {
        get: (key) => {
            if (!key) return data;
            return key.split('.').reduce((obj, part) => (obj == null ? undefined : obj[part]), data);
        },
        set: (key, value) => {
            const parts = key.split('.');
            let obj = data;
            for (let i = 0; i < parts.length - 1; i++) {
                if (obj[parts[i]] == null || typeof obj[parts[i]] !== 'object') {
                    obj[parts[i]] = {};
                }
                obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = value;
        },
        delete: (key) => {
            const parts = key.split('.');
            let obj = data;
            for (let i = 0; i < parts.length - 1; i++) {
                if (obj[parts[i]] == null) return;
                obj = obj[parts[i]];
            }
            delete obj[parts[parts.length - 1]];
        },
        has: (key) => {
            const parts = key.split('.');
            let obj = data;
            for (let i = 0; i < parts.length - 1; i++) {
                if (obj[parts[i]] == null) return false;
                obj = obj[parts[i]];
            }
            return obj[parts[parts.length - 1]] !== undefined;
        },
        _data: data
    };
}

/**
 * Create a game installation directory with sample files.
 */
function createInstalledGame(app, gameId, content = '<html><body>Test Game</body></html>') {
    const installPath = path.join(app.getPath('userData'), 'games', gameId);
    fs.mkdirSync(installPath, { recursive: true });
    fs.writeFileSync(path.join(installPath, 'index.html'), content, 'utf8');
    fs.writeFileSync(path.join(installPath, 'game.js'), 'console.log("test");', 'utf8');
    return installPath;
}

/**
 * Build a store with a game installed and profile metadata populated.
 */
function buildStoreWithGame(gameId) {
    return createMockStore({
        installedGames: {
            [gameId]: {
                id: gameId,
                version: '1.0.0',
                path: `/fake/stored/path/${gameId}/`, // Stored path must NOT be trusted
                installedAt: '2026-01-01T00:00:00.000Z'
            }
        },
        profiles: {
            default: {
                id: 'default',
                name: 'Default',
                type: 'default',
                settings: { volume: 80, theme: 'dark' },
                achievements: {
                    [gameId]: {
                        first_win: { unlocked: true, date: '2026-01-02' }
                    }
                },
                statistics: {
                    totalSessions: 5,
                    gamePlayHistory: {
                        [gameId]: {
                            lastPlayed: '2026-01-03',
                            playCount: 5,
                            favorite: true,
                            activeChannel: 'beta'
                        }
                    }
                },
                saves: {
                    updateHistory: {
                        [gameId]: {
                            stable: { lastSeenVersion: '1.0.0' },
                            beta: { lastSeenVersion: '1.1.0-beta' }
                        }
                    },
                    [gameId]: {
                        launcherSave: { level: 3, score: 1000 }
                    }
                }
            },
            custom: {
                id: 'custom',
                name: 'Custom',
                type: 'custom',
                settings: { volume: 50, theme: 'dark' },
                achievements: {},
                statistics: {
                    totalSessions: 0,
                    gamePlayHistory: {}
                },
                saves: {
                    updateHistory: {
                        [gameId]: {
                            stable: { lastSeenVersion: '0.9.0' }
                        }
                    },
                    [gameId]: {
                        launcherSave: { level: 1, score: 100 }
                    }
                }
            }
        }
    });
}
/**
 * Build a store with multiple profiles, multiple games, and Game Hub launcher
 * achievements so preservation can be asserted during save-data cleanup.
 *
 * The ACTIVE profile is configurable (defaults to 'default').
 */
function buildAchievementStore(activeProfileId = 'default') {
    return createMockStore({
        metadata: { activeProfileId },
        installedGames: {
            'sky-ace': { id: 'sky-ace', version: '1.0.0', installedAt: '2026-01-01T00:00:00.000Z' }
        },
        profiles: {
            default: {
                id: 'default',
                name: 'Default',
                type: 'default',
                settings: { volume: 80, theme: 'dark' },
                achievements: {
                    'sky-ace': { first_win: { unlocked: true, date: '2026-01-02' } },
                    'tactical-drone-defense': { ace_pilot: { unlocked: true, date: '2026-01-05' } },
                    gamehub: {
                        first_launch: { unlocked: true, date: '2026-07-10' },
                        collector: { unlocked: true, date: '2026-07-11' }
                    }
                },
                statistics: { totalSessions: 5, gamePlayHistory: {} },
                saves: { 'sky-ace': { save: { level: 3 } } }
            },
            custom: {
                id: 'custom',
                name: 'Custom',
                type: 'custom',
                settings: { volume: 50, theme: 'dark' },
                achievements: {
                    'sky-ace': { first_win: { unlocked: true, date: '2026-03-01' } }
                },
                statistics: { totalSessions: 0, gamePlayHistory: {} },
                saves: { 'sky-ace': { save: { level: 9 } } }
            }
        }
    });
}

// ==========================================
// TESTS
// ==========================================

test.describe('Uninstaller', () => {
    test('successful uninstall removes files and metadata', async () => {
        const gameId = 'tactical-drone-defense';
        const app = createMockApp();
        const store = buildStoreWithGame(gameId);

        // Create the actual game files at the resolved path
        const installPath = createInstalledGame(app, gameId);
        expect(fs.existsSync(installPath)).toBe(true);

        try {
            const result = uninstallGame(app, gameId, {}, store);

            // Result indicates success
            expect(result.success).toBe(true);
            expect(result.gameId).toBe(gameId);
            expect(result.deleteSaves).toBe(false);

            // Game files removed
            expect(fs.existsSync(installPath)).toBe(false);

            // installedGames metadata removed
            expect(store.get('installedGames')).toEqual({});

            // Stale updateHistory removed from all profiles
            expect(store.get('profiles.default.saves.updateHistory')).toEqual({});
            expect(store.get('profiles.custom.saves.updateHistory')).toEqual({});

            // Stale activeChannel removed from play history
            const defaultHistory = store.get('profiles.default.statistics.gamePlayHistory');
            expect(defaultHistory[gameId].activeChannel).toBeUndefined();
            expect(defaultHistory[gameId].lastPlayed).toBe('2026-01-03');
            expect(defaultHistory[gameId].playCount).toBe(5);
            expect(defaultHistory[gameId].favorite).toBe(true);

            // Achievements preserved
            expect(store.get('profiles.default.achievements')[gameId]).toBeTruthy();

            // Launcher settings preserved
            expect(store.get('profiles.default.settings')).toEqual({ volume: 80, theme: 'dark' });
        } finally {
            fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
        }
    });

    test('failed deletion keeps metadata', async () => {
        const gameId = 'locked-game';
        const app = createMockApp();
        const store = buildStoreWithGame(gameId);

        // Create the game directory but make it impossible to delete
        // by creating a file with no write permission on the parent dir.
        const installPath = createInstalledGame(app, gameId);
        expect(fs.existsSync(installPath)).toBe(true);

        // Make the games directory read-only so rmSync fails
        const gamesDir = path.join(app.getPath('userData'), 'games');
        fs.chmodSync(gamesDir, 0o555);

        try {
            expect(() => uninstallGame(app, gameId, {}, store)).toThrow();

            // Metadata must remain intact
            expect(store.get('installedGames')[gameId]).toBeTruthy();
            expect(store.get('profiles.default.saves.updateHistory')[gameId]).toBeTruthy();
            expect(store.get('profiles.default.statistics.gamePlayHistory')[gameId].activeChannel).toBe('beta');
            expect(store.get('profiles.default.achievements')[gameId]).toBeTruthy();
        } finally {
            // Restore permissions so cleanup works
            fs.chmodSync(gamesDir, 0o755);
            fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
        }
    });

    test('invalid gameId is rejected', async () => {
        const app = createMockApp();
        const store = buildStoreWithGame('valid-game');

        const invalidIds = [
            'UPPERCASE',
            'has_underscore',
            'has space',
            'has/slash',
            'has\\backslash',
            'has..dots',
            '',
            null,
            undefined,
            123,
            'a'.repeat(65) // 65 chars > 64 max
        ];

        for (const badId of invalidIds) {
            expect(() => uninstallGame(app, badId, {}, store), `Expected rejection for: ${badId}`).toThrow('Invalid gameId');
        }

        // Valid IDs should not throw on validation
        expect(() => validateGameId('valid-game')).not.toThrow();
        expect(() => validateGameId('a')).not.toThrow();
        expect(() => validateGameId('a1')).not.toThrow();
        expect(() => validateGameId('a'.repeat(64))).not.toThrow();
    });

    test('save checkbox deletes launcher saves only', async () => {
        const gameId = 'save-delete-game';
        const app = createMockApp();
        const store = buildStoreWithGame(gameId);

        // Create the actual game files
        const installPath = createInstalledGame(app, gameId);

        try {
            const result = uninstallGame(app, gameId, { deleteSaves: true }, store);

            expect(result.success).toBe(true);
            expect(result.deleteSaves).toBe(true);

            // Game files removed
            expect(fs.existsSync(installPath)).toBe(false);

            // Launcher-managed saves removed from all profiles
            expect(store.get('profiles.default.saves')[gameId]).toBeUndefined();
            expect(store.get('profiles.custom.saves')[gameId]).toBeUndefined();

            // updateHistory still removed as stale metadata
            expect(store.get('profiles.default.saves.updateHistory')).toEqual({});
            expect(store.get('profiles.custom.saves.updateHistory')).toEqual({});

            // Game Hub achievement unlock state for the game is removed
            // (deleteSaves=true clears the unlocked state, not the definitions)
            expect(store.get('profiles.default.achievements')[gameId]).toBeUndefined();

            // Play history preserved (except activeChannel)
            const defaultHistory = store.get('profiles.default.statistics.gamePlayHistory');
            expect(defaultHistory[gameId].lastPlayed).toBe('2026-01-03');
            expect(defaultHistory[gameId].playCount).toBe(5);
            expect(defaultHistory[gameId].favorite).toBe(true);
            expect(defaultHistory[gameId].activeChannel).toBeUndefined();

            // Settings preserved
            expect(store.get('profiles.default.settings')).toEqual({ volume: 80, theme: 'dark' });
        } finally {
            fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
        }
    });

    test('default uninstall preserves saves', async () => {
        const gameId = 'preserve-saves-game';
        const app = createMockApp();
        const store = buildStoreWithGame(gameId);

        // Create the actual game files
        const installPath = createInstalledGame(app, gameId);

        try {
            const result = uninstallGame(app, gameId, {}, store);

            expect(result.success).toBe(true);
            expect(result.deleteSaves).toBe(false);

            // Game files removed
            expect(fs.existsSync(installPath)).toBe(false);

            // Launcher-managed saves preserved
            expect(store.get('profiles.default.saves')[gameId]).toEqual({
                launcherSave: { level: 3, score: 1000 }
            });
            expect(store.get('profiles.custom.saves')[gameId]).toEqual({
                launcherSave: { level: 1, score: 100 }
            });

            // updateHistory removed as stale metadata
            expect(store.get('profiles.default.saves.updateHistory')).toEqual({});
            expect(store.get('profiles.custom.saves.updateHistory')).toEqual({});

            // Achievements preserved
            expect(store.get('profiles.default.achievements')[gameId]).toBeTruthy();

            // Play history preserved (except activeChannel)
            const defaultHistory = store.get('profiles.default.statistics.gamePlayHistory');
            expect(defaultHistory[gameId].lastPlayed).toBe('2026-01-03');
            expect(defaultHistory[gameId].playCount).toBe(5);
            expect(defaultHistory[gameId].favorite).toBe(true);
            expect(defaultHistory[gameId].activeChannel).toBeUndefined();
        } finally {
            fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
        }
    });

    test('resolveInstallPath only uses getGamesDir + gameId', async () => {
        const gameId = 'path-test-game';
        const app = createMockApp();

        try {
            const resolved = resolveInstallPath(app, gameId);
            expect(resolved).toBe(path.join(app.getPath('userData'), 'games', gameId));

            // Even if a malicious stored path exists, resolveInstallPath ignores it
            const store = buildStoreWithGame(gameId);
            store.set('installedGames', {
                [gameId]: {
                    path: '/etc/evil',
                    installPath: '/tmp/evil'
                }
            });

            const result = uninstallGame(app, gameId, {}, store);
            expect(result.success).toBe(true);

            // The resolved path (games dir) was deleted, not the malicious path
            expect(fs.existsSync(path.join(app.getPath('userData'), 'games', gameId))).toBe(false);
        } finally {
            fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
        }
    });
test('delete save data clears the game achievement unlocks but preserves everything else', async () => {
        const gameId = 'sky-ace';
        const app = createMockApp();
        const store = buildAchievementStore('default'); // active profile = default

        // Create the actual game files
        const installPath = createInstalledGame(app, gameId);

        try {
            const result = uninstallGame(app, gameId, { deleteSaves: true }, store);
            expect(result.success).toBe(true);
            expect(result.deleteSaves).toBe(true);

            // Game files removed
            expect(fs.existsSync(installPath)).toBe(false);

            // The uninstalled game's achievement unlock state is cleared on the
            // ACTIVE profile only
            expect(store.get('profiles.default.achievements')[gameId]).toBeUndefined();

            // Game save data deleted
            expect(store.get('profiles.default.saves')[gameId]).toBeUndefined();

            // OTHER games' achievements are preserved
            expect(store.get('profiles.default.achievements')['tactical-drone-defense'])
                .toEqual({ ace_pilot: { unlocked: true, date: '2026-01-05' } });

            // Game Hub launcher achievements are preserved
            expect(store.get('profiles.default.achievements').gamehub).toEqual({
                first_launch: { unlocked: true, date: '2026-07-10' },
                collector: { unlocked: true, date: '2026-07-11' }
            });

            // OTHER profiles' achievements are preserved (only active profile cleared)
            expect(store.get('profiles.custom.achievements')[gameId])
                .toEqual({ first_win: { unlocked: true, date: '2026-03-01' } });
        } finally {
            fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
        }
    });

    test('delete save data clears achievement unlocks on the ACTIVE profile, not others', async () => {
        const gameId = 'sky-ace';
        const app = createMockApp();
        // Active profile is 'custom'
        const store = buildAchievementStore('custom');

        // Create the actual game files
        const installPath = createInstalledGame(app, gameId);

        try {
            const result = uninstallGame(app, gameId, { deleteSaves: true }, store);
            expect(result.success).toBe(true);

            // Active (custom) profile achievements cleared
            expect(store.get('profiles.custom.achievements')[gameId]).toBeUndefined();

            // Inactive (default) profile achievements preserved
            expect(store.get('profiles.default.achievements')[gameId])
                .toEqual({ first_win: { unlocked: true, date: '2026-01-02' } });
        } finally {
            fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
        }
    });

    test('keep save data (deleteSaves=false) preserves achievement unlocks', async () => {
        const gameId = 'sky-ace';
        const app = createMockApp();
        const store = buildAchievementStore('default');

        // Create the actual game files
        const installPath = createInstalledGame(app, gameId);

        try {
            const result = uninstallGame(app, gameId, { deleteSaves: false }, store);
            expect(result.success).toBe(true);
            expect(result.deleteSaves).toBe(false);

            // Achievement unlocks preserved
            expect(store.get('profiles.default.achievements')[gameId])
                .toEqual({ first_win: { unlocked: true, date: '2026-01-02' } });
        } finally {
            fs.rmSync(app.getPath('userData'), { recursive: true, force: true });
        }
    });
});
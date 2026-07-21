// ==========================================
// STORAGE SYSTEM TESTS
// ==========================================
// Tests for the new electron-store-backed storage system.
// Verifies migration, persistence, and data integrity.

const { test, expect } = require('@playwright/test');
const { launchGameHub, waitForLauncher } = require('./helpers/electron');

const testTimeout = 60000;

test.describe('Storage System', () => {
    test.beforeEach(async ({}, testInfo) => {
        testInfo.setTimeout(testTimeout);
    });

    test('save and load settings persistence', async () => {
        const app = await launchGameHub();
        const window = await waitForLauncher(app);

        await window.evaluate(async () => {
            await window.storage.set('profiles.default.settings.volume', 42);
        });

        const volume = await window.evaluate(async () => {
            return await window.storage.get('profiles.default.settings.volume');
        });
        expect(volume).toBe(42);

        await app.close();
    });

    test('save/load persistence across reload', async () => {
        const app = await launchGameHub();
        const window = await waitForLauncher(app);

        await window.evaluate(async () => {
            await window.storage.set('profiles.default.settings.volume', 55);
            await window.storage.set('profiles.default.statistics.gamePlayHistory.test-game', {
                lastPlayed: '2026-07-20',
                playCount: 5,
                favorite: true,
                activeChannel: 'stable'
            });
        });

        await window.reload();
        await window.waitForTimeout(3000);

        const volume = await window.evaluate(async () => {
            return await window.storage.get('profiles.default.settings.volume');
        });
        expect(volume).toBe(55);

        const gameData = await window.evaluate(async () => {
            return await window.storage.get('profiles.default.statistics.gamePlayHistory.test-game');
        });
        expect(gameData.playCount).toBe(5);
        expect(gameData.favorite).toBe(true);
        expect(gameData.lastPlayed).toBe('2026-07-20');

        await app.close();
    });

    test('migration from old localStorage format', async () => {
        const app = await launchGameHub();
        const window = await waitForLauncher(app);

        await window.evaluate(() => {
            const oldData = {
                profile: 'default',
                games: {
                    'sky-ace': { lastPlayed: '2026-07-15', playCount: 10, favorite: true, activeChannel: 'stable' },
                    'neon-survival': { lastPlayed: '2026-07-18', playCount: 3, favorite: false, activeChannel: 'beta' }
                },
                settings: { volume: 75, theme: 'dark' },
                achievements: {
                    gamehub: { first_launch: { unlocked: true, date: '2026-07-10' } },
                    'tactical-drone-defense': {
                        first_scrap: { unlocked: true, date: '2026-07-11' },
                        wave_master: { unlocked: true, date: '2026-07-12' }
                    }
                },
                gameUpdateHistory: {
                    'sky-ace': { stable: { lastSeenVersion: '1.0.0' } }
                }
            };
            localStorage.setItem('gamehub_data', JSON.stringify(oldData));
        });

        await window.evaluate(async () => {
            await window.storage.set('metadata.lastMigration', null);
        });

        await window.reload();
        await window.waitForTimeout(3000);

        const settings = await window.evaluate(async () => {
            const volume = await window.storage.get('profiles.default.settings.volume');
            const theme = await window.storage.get('profiles.default.settings.theme');
            return { volume, theme };
        });
        expect(settings.volume).toBe(75);
        expect(settings.theme).toBe('dark');

        const achievements = await window.evaluate(async () => {
            const gamehub = await window.storage.get('profiles.default.achievements.gamehub');
            const tdd = await window.storage.get('profiles.default.achievements.tactical-drone-defense');
            return { gamehub, tdd };
        });
        expect(achievements.gamehub.first_launch.unlocked).toBe(true);
        expect(achievements.tdd.first_scrap.unlocked).toBe(true);
        expect(achievements.tdd.wave_master.unlocked).toBe(true);

        const gameData = await window.evaluate(async () => {
            return await window.storage.get('profiles.default.statistics.gamePlayHistory.sky-ace');
        });
        expect(gameData.playCount).toBe(10);
        expect(gameData.favorite).toBe(true);
        expect(gameData.lastPlayed).toBe('2026-07-15');

        const updateHistory = await window.evaluate(async () => {
            return await window.storage.get('profiles.default.saves.updateHistory.sky-ace.stable');
        });
        expect(updateHistory.lastSeenVersion).toBe('1.0.0');

        await app.close();
    });

    test('achievement preservation', async () => {
        const app = await launchGameHub();
        const window = await waitForLauncher(app);

        await window.evaluate(async () => {
            const achievements = await window.storage.get('profiles.default.achievements') || {};
            achievements.gamehub = achievements.gamehub || {};
            achievements.gamehub.first_launch = { unlocked: true, date: '2026-07-10' };
            achievements.gamehub.collector = { unlocked: true, date: '2026-07-10' };
            achievements['neon-survival'] = achievements['neon-survival'] || {};
            achievements['neon-survival'].first_kill = { unlocked: true, date: '2026-07-10' };
            await window.storage.set('profiles.default.achievements', achievements);
        });

        await window.reload();
        await window.waitForTimeout(3000);

        const achievements = await window.evaluate(async () => {
            const gamehub = await window.storage.get('profiles.default.achievements.gamehub');
            const neon = await window.storage.get('profiles.default.achievements.neon-survival');
            return { gamehub, neon };
        });
        expect(achievements.gamehub.first_launch.unlocked).toBe(true);
        expect(achievements.gamehub.collector.unlocked).toBe(true);
        expect(achievements.neon.first_kill.unlocked).toBe(true);

        await app.close();
    });

    test('statistics preservation', async () => {
        const app = await launchGameHub();
        const window = await waitForLauncher(app);

        await window.evaluate(async () => {
            const gamePlayHistory = await window.storage.get('profiles.default.statistics.gamePlayHistory') || {};
            gamePlayHistory['sky-ace'] = { playCount: 15, lastPlayed: '2026-07-20', favorite: false, activeChannel: 'stable' };
            gamePlayHistory['neon-survival'] = { playCount: 8, lastPlayed: '2026-07-19', favorite: false, activeChannel: 'stable' };
            gamePlayHistory['tactical-drone-defense'] = { playCount: 22, lastPlayed: '2026-07-18', favorite: false, activeChannel: 'stable' };
            await window.storage.set('profiles.default.statistics.gamePlayHistory', gamePlayHistory);
        });

        await window.reload();
        await window.waitForTimeout(3000);

        const stats = await window.evaluate(async () => {
            const skyAce = await window.storage.get('profiles.default.statistics.gamePlayHistory.sky-ace');
            const neon = await window.storage.get('profiles.default.statistics.gamePlayHistory.neon-survival');
            const tdd = await window.storage.get('profiles.default.statistics.gamePlayHistory.tactical-drone-defense');
            return { skyAce, neon, tdd };
        });

        expect(stats.skyAce.playCount).toBe(15);
        expect(stats.neon.playCount).toBe(8);
        expect(stats.tdd.playCount).toBe(22);
        expect(stats.skyAce.lastPlayed).toBe('2026-07-20');
        expect(stats.neon.lastPlayed).toBe('2026-07-19');
        expect(stats.tdd.lastPlayed).toBe('2026-07-18');

        await app.close();
    });

    test('restart persistence (full app close and reopen)', async () => {
        let app = await launchGameHub();
        let window = await waitForLauncher(app);

        await window.evaluate(async () => {
            await window.storage.set('profiles.default.settings.volume', 33);
            await window.storage.set('profiles.default.statistics.gamePlayHistory.test-restart-game', {
                lastPlayed: '2026-07-20',
                playCount: 7,
                favorite: true,
                activeChannel: 'stable'
            });
            const achievements = await window.storage.get('profiles.default.achievements') || {};
            achievements.gamehub = achievements.gamehub || {};
            achievements.gamehub.collector = { unlocked: true, date: '2026-07-10' };
            await window.storage.set('profiles.default.achievements', achievements);
        });

        await app.close();

        app = await launchGameHub();
        window = await waitForLauncher(app);

        const volume = await window.evaluate(async () => {
            return await window.storage.get('profiles.default.settings.volume');
        });
        expect(volume).toBe(33);

        const gameData = await window.evaluate(async () => {
            return await window.storage.get('profiles.default.statistics.gamePlayHistory.test-restart-game');
        });
        expect(gameData.playCount).toBe(7);
        expect(gameData.favorite).toBe(true);

        const achievements = await window.evaluate(async () => {
            return await window.storage.get('profiles.default.achievements.gamehub');
        });
        expect(achievements.collector).toBeDefined();
        expect(achievements.collector.unlocked).toBe(true);

        await app.close();
    });

    test('resetGameData clears achievements, statistics, and saves but preserves settings', async () => {
    const app = await launchGameHub();
    const window = await waitForLauncher(app);

    await window.evaluate(async () => {
        await window.storage.set('profiles.default.settings.volume', 99);
        await window.storage.set('profiles.default.settings.theme', 'light');
        await window.storage.set('profiles.default.achievements.gamehub.test_ach', { unlocked: true, date: '2026-07-20' });
        await window.storage.set('profiles.default.statistics.totalSessions', 42);
        await window.storage.set('profiles.default.statistics.gamePlayHistory.test-game', { playCount: 5, lastPlayed: '2026-07-20' });
        await window.storage.set('profiles.default.saves.updateHistory.test-game', { lastSeenVersion: '1.0.0' });
        await window.storage.set('profiles.default.saves.manual', 'some-save-data');
    });

    await window.evaluate(async () => {
        await window.storage.resetGameData();
    });

    const result = await window.evaluate(async () => {
        const achievements = await window.storage.get('profiles.default.achievements');
        const statistics = await window.storage.get('profiles.default.statistics');
        const saves = await window.storage.get('profiles.default.saves');
        const volume = await window.storage.get('profiles.default.settings.volume');
        const theme = await window.storage.get('profiles.default.settings.theme');
        return { achievements, statistics, saves, volume, theme };
    });

    // Cleared
    expect(result.achievements).toBeUndefined();
    expect(result.statistics).toBeUndefined();
    expect(result.saves).toBeUndefined();

    // Preserved
    expect(result.volume).toBe(99);
    expect(result.theme).toBe('light');

    await app.close();
});

test('export and import data', async () => {
        const app = await launchGameHub();
        const window = await waitForLauncher(app);

        await window.evaluate(async () => {
            await window.storage.set('profiles.default.settings.volume', 90);
            await window.storage.set('profiles.default.statistics.gamePlayHistory.export-test', {
                playCount: 3,
                favorite: true,
                lastPlayed: '2026-07-20',
                activeChannel: 'stable'
            });
        });

        const exportedData = await window.evaluate(async () => {
            return await window.storage.export();
        });

        expect(exportedData).toBeDefined();
        expect(exportedData.metadata).toBeDefined();
        expect(exportedData.profiles).toBeDefined();
        expect(exportedData.profiles.default).toBeDefined();
        expect(exportedData.profiles.default.settings.volume).toBe(90);

        await window.evaluate(async (data) => {
            const defaults = {
                metadata: { version: 1, lastMigration: Date.now() },
                profiles: {
                    default: {
                        settings: { volume: 80, theme: 'dark' },
                        achievements: {},
                        statistics: { totalSessions: 0, gamePlayHistory: {} },
                        saves: {}
                    }
                },
                preferences: {}
            };
            await window.storage.import(defaults);
            await window.storage.import(data);
        }, exportedData);

        const volume = await window.evaluate(async () => {
            return await window.storage.get('profiles.default.settings.volume');
        });
        expect(volume).toBe(90);

        await app.close();
    });
});
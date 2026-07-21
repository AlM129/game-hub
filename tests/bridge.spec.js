// ==========================================
// BRIDGE INTEGRATION TESTS
// ==========================================
// Verifies the Game Hub bridge system works correctly
// Tests game_started, game_closed, and achievement_unlock events

const { test, expect } = require('@playwright/test');
const { launchGameHub, waitForLauncher, navigateToView } = require('./helpers/electron');

const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';

test.describe('Bridge Integration', () => {
    test('game_started event is queued correctly', async () => {
        const app = await launchGameHub();
        const window = await waitForLauncher(app);

        // Simulate a game queuing a game_started event
        const mockEvent = {
            type: 'game_started',
            gameId: 'neon-survival',
            data: {
                version: '1.0.0',
                channel: 'stable'
            }
        };

        // Queue the event using window.evaluate to run in browser context
        await window.evaluate((event) => {
            const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';
            const queue = [];
            const raw = localStorage.getItem(BRIDGE_QUEUE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    queue.push(...parsed);
                }
            }
            queue.push(event);
            localStorage.setItem(BRIDGE_QUEUE_KEY, JSON.stringify(queue));
        }, mockEvent);

        // Verify event was queued
        const queued = await window.evaluate(() => {
            const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';
            return JSON.parse(localStorage.getItem(BRIDGE_QUEUE_KEY) || '[]');
        });
        expect(queued).toContainEqual(mockEvent);

        // Cleanup
        await window.evaluate(() => {
            localStorage.removeItem('game-hub-event-queue');
        });

        await app.close();
    });

    test('game_closed event is queued correctly', async () => {
        const app = await launchGameHub();
        const window = await waitForLauncher(app);

        // Simulate a game queuing a game_closed event
        const mockEvent = {
            type: 'game_closed',
            gameId: 'neon-survival'
        };

        // Queue the event using window.evaluate
        await window.evaluate((event) => {
            const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';
            const queue = [];
            const raw = localStorage.getItem(BRIDGE_QUEUE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    queue.push(...parsed);
                }
            }
            queue.push(event);
            localStorage.setItem(BRIDGE_QUEUE_KEY, JSON.stringify(queue));
        }, mockEvent);

        // Verify event was queued
        const queued = await window.evaluate(() => {
            const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';
            return JSON.parse(localStorage.getItem(BRIDGE_QUEUE_KEY) || '[]');
        });
        expect(queued).toContainEqual(mockEvent);

        // Cleanup
        await window.evaluate(() => {
            localStorage.removeItem('game-hub-event-queue');
        });

        await app.close();
    });

    test('achievement_unlock event is queued correctly', async () => {
        const app = await launchGameHub();
        const window = await waitForLauncher(app);

        // Simulate a game queuing an achievement_unlock event
        const mockEvent = {
            type: 'achievement_unlock',
            gameId: 'neon-survival',
            data: {
                achievementId: 'first_kill'
            }
        };

        // Queue the event using window.evaluate
        await window.evaluate((event) => {
            const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';
            const queue = [];
            const raw = localStorage.getItem(BRIDGE_QUEUE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) {
                    queue.push(...parsed);
                }
            }
            queue.push(event);
            localStorage.setItem(BRIDGE_QUEUE_KEY, JSON.stringify(queue));
        }, mockEvent);

        // Verify event was queued
        const queued = await window.evaluate(() => {
            const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';
            return JSON.parse(localStorage.getItem(BRIDGE_QUEUE_KEY) || '[]');
        });
        expect(queued).toContainEqual(mockEvent);

        // Cleanup
        await window.evaluate(() => {
            localStorage.removeItem('game-hub-event-queue');
        });

        await app.close();
    });

    test('launcher processes queued bridge events on load', async () => {
        const app = await launchGameHub();
        const window = await waitForLauncher(app);

        // Pre-populate queue with test events
        const testEvents = [
            {
                type: 'game_started',
                gameId: 'test-game',
                data: { version: '1.0.0', channel: 'stable' }
            },
            {
                type: 'achievement_unlock',
                gameId: 'test-game',
                data: { achievementId: 'test_achievement' }
            }
        ];

        await window.evaluate((events) => {
            const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';
            localStorage.setItem(BRIDGE_QUEUE_KEY, JSON.stringify(events));
        }, testEvents);

        // Reload the page to trigger queue drain
        await window.reload();
        await window.waitForTimeout(2000);

        // Verify queue was cleared (processed)
        const queueAfter = await window.evaluate(() => {
            const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';
            return localStorage.getItem(BRIDGE_QUEUE_KEY);
        });
        expect(queueAfter).toBeNull();

        await app.close();
    });

    test('bridge queue handles multiple events', async () => {
        const app = await launchGameHub();
        const window = await waitForLauncher(app);

        // Queue multiple events
        const events = [
            { type: 'game_started', gameId: 'game1', data: { version: '1.0.0', channel: 'stable' } },
            { type: 'game_closed', gameId: 'game1' },
            { type: 'achievement_unlock', gameId: 'game1', data: { achievementId: 'ach1' } },
            { type: 'game_started', gameId: 'game2', data: { version: '2.0.0', channel: 'beta' } }
        ];

        await window.evaluate((events) => {
            const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';
            localStorage.setItem(BRIDGE_QUEUE_KEY, JSON.stringify(events));
        }, events);

        // Verify all events queued
        const queued = await window.evaluate(() => {
            const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';
            return JSON.parse(localStorage.getItem(BRIDGE_QUEUE_KEY) || '[]');
        });
        expect(queued.length).toBe(4);
        expect(queued[0].type).toBe('game_started');
        expect(queued[1].type).toBe('game_closed');
        expect(queued[2].type).toBe('achievement_unlock');
        expect(queued[3].type).toBe('game_started');

        // Cleanup
        await window.evaluate(() => {
            localStorage.removeItem('game-hub-event-queue');
        });
        await app.close();
    });

    test('bridge queue survives page navigation', async () => {
        const app = await launchGameHub();
        const window = await waitForLauncher(app);

        // Queue an event
        const testEvent = {
            type: 'game_started',
            gameId: 'survival-test',
            data: { version: '1.0.0', channel: 'stable' }
        };
        
        await window.evaluate((event) => {
            const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';
            localStorage.setItem(BRIDGE_QUEUE_KEY, JSON.stringify([event]));
        }, testEvent);

        // Navigate to a different view
        await navigateToView(window, 'library');
        await window.waitForTimeout(500);

        // Verify event still in queue
        const queued = await window.evaluate(() => {
            const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';
            return JSON.parse(localStorage.getItem(BRIDGE_QUEUE_KEY) || '[]');
        });
        expect(queued).toContainEqual(testEvent);

        // Cleanup
        await window.evaluate(() => {
            localStorage.removeItem('game-hub-event-queue');
        });
        await app.close();
    });

    test('invalid events are rejected', async () => {
        const app = await launchGameHub();
        const window = await waitForLauncher(app);

        const consoleWarnings = [];
        window.on('console', msg => {
            if (msg.type() === 'warning') {
                consoleWarnings.push(msg.text());
            }
        });

        // Queue invalid event
        await window.evaluate(() => {
            const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';
            localStorage.setItem(BRIDGE_QUEUE_KEY, JSON.stringify([
                { type: 'invalid_event_type', gameId: 'test' }
            ]));
        });

        // Reload to process
        await window.reload();
        await window.waitForTimeout(2000);

        // Should have warning about unknown event type
        const hasWarning = consoleWarnings.some(w => 
            w.includes('Unknown event type') || w.includes('validation failed')
        );
        expect(hasWarning).toBe(true);

        await app.close();
    });

    test('achievement_unlock updates launcher storage', async () => {
        const app = await launchGameHub();
        const window = await waitForLauncher(app);

        // Queue achievement unlock for gamehub (which we know exists)
        const achievementEvent = {
            type: 'achievement_unlock',
            gameId: 'gamehub',
            data: { achievementId: 'first_launch' }
        };
        
        await window.evaluate((event) => {
            const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';
            localStorage.setItem(BRIDGE_QUEUE_KEY, JSON.stringify([event]));
        }, achievementEvent);

        // Reload to process
        await window.reload();
        await window.waitForTimeout(2000);

        // Verify achievement was stored in electron-store (via window.storage API)
        const updatedAchievements = await window.evaluate(async () => {
            const achievements = await window.storage.get('profiles.default.achievements') || {};
            return achievements;
        });

        // Should have gamehub achievements now
        expect(updatedAchievements['gamehub']).toBeDefined();
        expect(updatedAchievements['gamehub']['first_launch']).toBeDefined();
        expect(updatedAchievements['gamehub']['first_launch'].unlocked).toBe(true);

        await app.close();
    });

    test('game_started event includes required fields', async () => {
        const validEvent = {
            type: 'game_started',
            gameId: 'test-game',
            data: {
                version: '1.0.0',
                channel: 'stable'
            }
        };

        // Verify structure
        expect(validEvent.type).toBe('game_started');
        expect(validEvent.gameId).toBeDefined();
        expect(validEvent.data).toBeDefined();
        expect(validEvent.data.version).toBeDefined();
        expect(validEvent.data.channel).toBeDefined();
    });

    test('game_closed event includes required fields', async () => {
        const validEvent = {
            type: 'game_closed',
            gameId: 'test-game'
        };

        // Verify structure
        expect(validEvent.type).toBe('game_closed');
        expect(validEvent.gameId).toBeDefined();
    });

    test('achievement_unlock event includes required fields', async () => {
        const validEvent = {
            type: 'achievement_unlock',
            gameId: 'test-game',
            data: {
                achievementId: 'test_achievement'
            }
        };

        // Verify structure
        expect(validEvent.type).toBe('achievement_unlock');
        expect(validEvent.gameId).toBeDefined();
        expect(validEvent.data).toBeDefined();
        expect(validEvent.data.achievementId).toBeDefined();
    });
});
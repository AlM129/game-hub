// ==========================================
// LAUNCHER STARTUP TESTS
// ==========================================
// Verifies the Electron launcher starts correctly
// and navigation works without errors

const { test, expect } = require('@playwright/test');
const { launchGameHub, waitForLauncher, navigateToView, getConsoleErrors } = require('./helpers/electron');

test.describe('Launcher Startup', () => {
    let app;
    let window;

    test.beforeEach(async () => {
        app = await launchGameHub();
        window = await waitForLauncher(app);
    });

    test.afterEach(async () => {
        if (app) {
            await app.close();
        }
    });

    test('should launch Electron successfully', async () => {
        // App launched without crashing
        expect(app).toBeTruthy();
        expect(window).toBeTruthy();
    });

    test('should have Game Hub window title', async () => {
        const title = await window.title();
        expect(title).toContain('Game Hub');
    });

    test('should load without JavaScript errors', async () => {
        const errors = await getConsoleErrors(window);
        
        // Filter out expected warnings, only fail on actual errors
        const criticalErrors = errors.filter(err => 
            !err.includes('Warning') && 
            !err.includes('DevTools') &&
            !err.includes('favicon')
        );
        
        expect(criticalErrors).toHaveLength(0);
    });

    test('should display main navigation elements', async () => {
        // Check that navigation buttons exist
        const navHome = await window.$('#navHome');
        const navGames = await window.$('#navGames');
        const navAchievements = await window.$('#navAchievements');
        
        expect(navHome).toBeTruthy();
        expect(navGames).toBeTruthy();
        expect(navAchievements).toBeTruthy();
    });

    test('should navigate to Home view', async () => {
        await navigateToView(window, 'home');
        
        // Verify we're on home view
        const homeView = await window.$('#homeView');
        expect(homeView).toBeTruthy();
        
        // Check for expected home content
        const featuredBanner = await window.$('#featuredBanner');
        expect(featuredBanner).toBeTruthy();
    });

    test('should navigate to Games Library', async () => {
        await navigateToView(window, 'library');
        
        // Verify we're on library view
        const libraryView = await window.$('#libraryView');
        expect(libraryView).toBeTruthy();
        
        // Check for games grid
        const gamesGrid = await window.$('#gamesGrid');
        expect(gamesGrid).toBeTruthy();
    });

    test('should navigate to Achievements view', async () => {
        await navigateToView(window, 'achievements');
        
        // Verify we're on achievements view
        const achievementsView = await window.$('#achievementsView');
        expect(achievementsView).toBeTruthy();
        
        // Check for achievement containers
        const unlockedList = await window.$('#achUnlockedList');
        const lockedList = await window.$('#achLockedList');
        expect(unlockedList).toBeTruthy();
        expect(lockedList).toBeTruthy();
    });

    test('should navigate to Statistics view', async () => {
        await navigateToView(window, 'statistics');
        
        // Verify we're on statistics view
        const statsView = await window.$('#statisticsView');
        expect(statsView).toBeTruthy();
    });

    test('should navigate to Settings view', async () => {
        await navigateToView(window, 'settings');
        
        // Verify we're on settings view
        const settingsView = await window.$('#settingsView');
        expect(settingsView).toBeTruthy();
    });

    test('should have no uncaught exceptions', async () => {
        const exceptions = [];
        
        window.on('pageerror', error => {
            exceptions.push(error.message);
        });
        
        // Wait a bit for any async errors
        await window.waitForTimeout(2000);
        
        expect(exceptions).toHaveLength(0);
    });

    test('should display game count', async () => {
        const gameCountDisplay = await window.$('#gameCountDisplay');
        expect(gameCountDisplay).toBeTruthy();
        
        const countText = await gameCountDisplay.textContent();
        expect(countText).toContain('Games Available');
    });
});
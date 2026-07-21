// ==========================================
// ELECTRON TEST HELPERS
// ==========================================
// Reusable Electron launch/setup code for Playwright tests

const { _electron: electron } = require('playwright');
const path = require('path');

/**
 * Launch Game Hub Electron app for testing
 * @returns {Promise<ElectronApplication>}
 */
async function launchGameHub() {
    const appPath = path.join(__dirname, '..', '..');
    const electronApp = await electron.launch({
        args: [appPath],
        // Don't slow down animations for faster tests
        slowMo: 0,
        // Enable console logging
        headless: true
    });
    
    // Disable remote registry for tests to ensure consistent offline behavior
    await electronApp.evaluate(async () => {
        // Import and disable remote registry
        const registrySource = await import('./src/games/registry-source.js');
        if (typeof registrySource.setUseRemoteRegistry === 'function') {
            registrySource.setUseRemoteRegistry(false);
            console.log('Test: Remote registry disabled for testing');
        }
    });
    
    return electronApp;
}

/**
 * Wait for the launcher to fully load
 * @param {ElectronApplication} app 
 * @returns {Promise<ElectronWindow>}
 */
async function waitForLauncher(app) {
    const window = await app.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(1000); // Give time for JS to initialize
    return window;
}

/**
 * Navigate to a specific view in the launcher
 * @param {ElectronWindow} window 
 * @param {string} viewName - 'home', 'library', 'achievements', etc.
 */
async function navigateToView(window, viewName) {
    const navMap = {
        home: 'navHome',
        library: 'navGames',
        achievements: 'navAchievements',
        statistics: 'navStats',
        settings: 'navSettings'
    };
    
    const navId = navMap[viewName];
    if (!navId) {
        throw new Error(`Unknown view: ${viewName}`);
    }
    
    const navButton = await window.$(`#${navId}`);
    if (!navButton) {
        throw new Error(`Navigation button not found: ${navId}`);
    }
    
    await navButton.click();
    await window.waitForTimeout(500); // Wait for view transition
}

/**
 * Get console messages from the window
 * @param {ElectronWindow} window 
 * @returns {Array<{type: string, text: string}>}
 */
async function getConsoleMessages(window) {
    const messages = [];
    window.on('console', msg => {
        messages.push({
            type: msg.type(),
            text: msg.text()
        });
    });
    return messages;
}

/**
 * Check for console errors
 * @param {ElectronWindow} window 
 * @returns {Promise<Array<string>>}
 */
async function getConsoleErrors(window) {
    const errors = [];
    window.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(msg.text());
        }
    });
    return errors;
}

module.exports = {
    launchGameHub,
    waitForLauncher,
    navigateToView,
    getConsoleMessages,
    getConsoleErrors
};
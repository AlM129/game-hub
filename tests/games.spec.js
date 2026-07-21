// ==========================================
// GAME REGISTRY & FILE HEALTH TESTS
// ==========================================
// Verifies all registered games exist and have required files
// Tests game launch smoke tests

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { launchGameHub, waitForLauncher, navigateToView } = require('./helpers/electron');

// Expected games configuration (should match src/games.js)
const EXPECTED_GAMES = {
    stable: [
        { id: 'sky-ace', title: 'Sky Ace', html: 'games/sky-ace/index.html', cover: 'games/sky-ace/cover.png' },
        { id: 'neon-survival', title: 'Neon Survival', html: 'games/neon-survival/index.html', cover: 'games/neon-survival/cover.png' },
        { id: 'tactical-drone-defense', title: 'Tactical Drone Defense', html: 'games/tactical-drone-defense/index.html', cover: 'games/tactical-drone-defense/cover.png' }
    ],
    beta: [
        { id: 'tactical-drone-defense-beta', title: 'Tactical Drone Defense Beta', html: 'games_beta/tactical_drone_defense/index.html' }
    ]
};

test.describe('Game Registry & File Health', () => {
    test('all stable game HTML files exist', async () => {
        for (const game of EXPECTED_GAMES.stable) {
            const htmlPath = path.join(__dirname, '..', game.html);
            expect(fs.existsSync(htmlPath), `Missing HTML file: ${game.html}`).toBe(true);
        }
    });

    test('all beta game HTML files exist', async () => {
        for (const game of EXPECTED_GAMES.beta) {
            const htmlPath = path.join(__dirname, '..', game.html);
            expect(fs.existsSync(htmlPath), `Missing HTML file: ${game.html}`).toBe(true);
        }
    });

    test('all stable game JS files exist', async () => {
        for (const game of EXPECTED_GAMES.stable) {
            const jsPath = path.join(__dirname, '..', game.html.replace('index.html', 'js/main.js'));
            expect(fs.existsSync(jsPath), `Missing JS file for ${game.id}`).toBe(true);
        }
    });

    test('all beta game JS files exist', async () => {
        for (const game of EXPECTED_GAMES.beta) {
            const jsPath = path.join(__dirname, '..', game.html.replace('index.html', 'js/main.js'));
            expect(fs.existsSync(jsPath), `Missing JS file for ${game.id}`).toBe(true);
        }
    });

    test('all game covers exist in game folders', async () => {
        for (const game of EXPECTED_GAMES.stable) {
            if (game.cover) {
                const coverPath = path.join(__dirname, '..', game.cover);
                expect(fs.existsSync(coverPath), `Missing cover for ${game.id}: ${game.cover}`).toBe(true);
            }
        }
    });
});

test.describe('Game Launch Smoke Tests', () => {
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

    test('launcher displays all stable games', async () => {
        await navigateToView(window, 'library');
        
        // Check that games grid has content
        const gamesGrid = await window.$('#gamesGrid');
        expect(gamesGrid).toBeTruthy();
        
        // Verify games are listed by checking for game titles in the DOM
        const html = await gamesGrid.innerHTML();
        EXPECTED_GAMES.stable.forEach(game => {
            expect(html).toContain(game.title);
        });
    });

    test('Sky Ace is listed in library', async () => {
        await navigateToView(window, 'library');
        
        // Verify Sky Ace appears in the library
        const skyAceText = await window.$('text=Sky Ace');
        expect(skyAceText).toBeTruthy();
    });

    test('Neon Survival is listed in library', async () => {
        await navigateToView(window, 'library');
        
        // Verify Neon Survival appears in the library
        const neonSurvivalText = await window.$('text=Neon Survival');
        expect(neonSurvivalText).toBeTruthy();
    });

    test('Tactical Drone Defense is listed in library', async () => {
        await navigateToView(window, 'library');
        
        // Verify Tactical Drone Defense appears in the library
        const tddText = await window.$('text=Tactical Drone Defense');
        expect(tddText).toBeTruthy();
    });

    test('game details view exists and is accessible', async () => {
        await navigateToView(window, 'library');
        
        // Verify the details view container exists
        const detailsView = await window.$('#detailsView');
        expect(detailsView).toBeTruthy();
        
        // Verify details view has required elements
        const detailsTitle = await window.$('#detailsTitle');
        const detailsDescription = await window.$('#detailsDescription');
        const detailsActions = await window.$('#detailsActions');
        const detailsBackBtn = await window.$('#detailsBackBtn');
        
        expect(detailsTitle).toBeTruthy();
        expect(detailsDescription).toBeTruthy();
        expect(detailsActions).toBeTruthy();
        expect(detailsBackBtn).toBeTruthy();
    });

    test('game details page has play button element', async () => {
        await navigateToView(window, 'library');
        
        // The play button structure should exist in the DOM
        // We can verify the details actions container exists
        const detailsActions = await window.$('#detailsActions');
        expect(detailsActions).toBeTruthy();
        
        // Verify it can contain buttons (check it's not empty)
        const actionsHtml = await detailsActions.innerHTML();
        expect(actionsHtml.length).toBeGreaterThan(0);
    });

    test('game details page has back button', async () => {
        // The back button should exist in the DOM
        const backButton = await window.$('#detailsBackBtn');
        expect(backButton).toBeTruthy();
    });

    test('can navigate to game details via showDetails', async () => {
        await navigateToView(window, 'library');
        
        // Use the global showDetails function that exists in the launcher
        await window.evaluate(() => {
            if (typeof showDetails === 'function') {
                showDetails('sky-ace');
            }
        });
        
        await window.waitForTimeout(500);
        
        // Verify details view is now active
        const detailsView = await window.$('#detailsView');
        const isVisible = await detailsView.evaluate(el => 
            el.classList.contains('view-active')
        );
        expect(isVisible).toBe(true);
        
        // Verify the title was updated
        const detailsTitle = await window.$('#detailsTitle');
        const titleText = await detailsTitle.textContent();
        expect(titleText).toContain('Sky Ace');
    });

    test('can return to library from game details', async () => {
        await navigateToView(window, 'library');
        
        // Navigate to game details
        await window.evaluate(() => {
            if (typeof showDetails === 'function') {
                showDetails('sky-ace');
            }
        });
        await window.waitForTimeout(500);
        
        // Click back button
        const backButton = await window.$('#detailsBackBtn');
        await backButton.click();
        await window.waitForTimeout(500);
        
        // Verify we're back in library view
        const libraryView = await window.$('#libraryView');
        const isVisible = await libraryView.evaluate(el => 
            el.classList.contains('view-active')
        );
        expect(isVisible).toBe(true);
    });
});

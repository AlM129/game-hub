// ==========================================
// SAVE CLEANUP
// ==========================================
// Invokes a game's own clearSaveData() API to delete its save data, while the
// game (not the launcher) owns the knowledge of which localStorage keys make
// up its saves.
//
// Design guarantees:
//   - Only the selected, validated gameId is ever targeted.
//   - The launcher never deletes arbitrary localStorage keys and never calls
//     localStorage.clear(). It hosts the game page and calls the game's API.
//   - The shared 'game-hub-event-queue' is never touched (the game APIs do not
//     remove it, and this module never issues a localStorage call of its own).
//   - deleteSaves=true only; preferences are preserved (deletePreferences stays
//     false) in line with the launcher's "Delete save data" semantics, so a
//     game's settings (e.g. Neon Survival) survive the operation.
//   - Save deletion runs BEFORE filesystem deletion and aborts the uninstall
//     when it fails, so saves are never silently left behind while the game
//     files are removed.
//
// This module runs in the main (Node.js) process. The real page host requires
// Electron's BrowserWindow; unit tests inject a fake host via `pageHost`.

const fs = require('fs');
const path = require('path');
const { validateGameId, resolveInstallPath, uninstallGame } = require('./uninstaller');

const DEFAULT_TIMEOUT_MS = 15000;   // budget for the in-page API to appear + run
const LOAD_TIMEOUT_MS = 15000;      // budget to load the game's entry page
const SCRIPT_TIMEOUT_MS = 15000;    // budget to execute the cleanup script
const POLL_INTERVAL_MS = 50;

// The exact options handed to the game API. deletePreferences is deliberately
// always false: the "Delete save data" checkbox means progress / play history
// (including achievements, high scores, stats), never persisted preferences.
const CLEAR_OPTS = { deleteSaves: true, deletePreferences: false };

/**
 * Build a self-contained script to run inside the game page.
 *
 * Polls (with a timeout) until the game's clearSaveData API is present, then
 * invokes it and returns a serializable result { ok, result? } or
 * { ok:false, error, timedOut? }.
 *
 * Runs entirely in the game's own page context and never calls localStorage
 * from the launcher.
 *
 * @param {Object} [opts] - Options forwarded to the game API (defaults to CLEAR_OPTS)
 * @param {number} [timeoutMs] - Timeout for the API to become available
 * @returns {string} JavaScript source to execute in the game page
 */
function buildClearSaveScript(opts = CLEAR_OPTS, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const payload = JSON.stringify({ ...CLEAR_OPTS, ...(opts || {}) });
    return `(async () => {
        const deadline = Date.now() + ${timeoutMs};
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        while (!(window.gameHub && typeof window.gameHub.clearSaveData === 'function')) {
            if (Date.now() > deadline) return { ok: false, error: 'save-api-timeout', timedOut: true };
            await wait(${POLL_INTERVAL_MS});
        }
        try {
            const result = await window.gameHub.clearSaveData(${payload});
            return { ok: true, result: (result && typeof result === 'object') ? result : { ok: true } };
        } catch (e) {
            return { ok: false, error: String((e && e.message) || e) };
        }
    })()`;
}

/**
 * Resolve the canonical entry file for a game (defaults to index.html).
 *
 * Built only from the validated install path (getGamesDir + gameId); a
 * renderer-supplied path is never trusted. The optional `entry` in the game's
 * own manifest is used only if it is a plain, safe relative file name.
 *
 * @param {Object} app - Electron app module
 * @param {string} gameId - Validated game identifier
 * @returns {string} Absolute path to the game's entry HTML file
 */
function resolveGameEntry(app, gameId) {
    const dir = resolveInstallPath(app, gameId);
    let entry = 'index.html';
    try {
        const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'game.json'), 'utf8'));
        if (typeof manifest.entry === 'string' && /^[A-Za-z0-9._-]+$/.test(manifest.entry)) {
            entry = manifest.entry;
        }
    } catch (_) {
        // No manifest readable — fall back to index.html
    }
    return path.join(dir, entry);
}

/**
 * Wrap a promise with a hard timeout.
 */
function withTimeout(promise, ms, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        promise.then(
            (value) => { clearTimeout(timer); resolve(value); },
            (error) => { clearTimeout(timer); reject(error); }
        );
    });
}

/**
 * Default page host: hosts the game's entry page in a hidden BrowserWindow
 * (same default session, so it shares the launcher's localStorage), runs the
 * injected cleanup script in the game's own context, then destroys the window.
 */
function createDefaultPageHost(app, gameId) {
    return async function runInPage(script) {
        // Electron is required lazily so this module stays unit-testable under Node.
        const { BrowserWindow } = require('electron');
        const entry = resolveGameEntry(app, gameId);

        const win = new BrowserWindow({
            show: false,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true
            }
        });

        try {
            await withTimeout(win.loadFile(entry), LOAD_TIMEOUT_MS, 'Game page load');
            return await withTimeout(
                win.webContents.executeJavaScript(script, true),
                SCRIPT_TIMEOUT_MS,
                'Save API call'
            );
        } finally {
            if (!win.isDestroyed()) {
                win.destroy();
            }
        }
    };
}

/**
 * Invoke a game's own clearSaveData() API and verify it reports success.
 *
 * @param {Object} app - Electron app module
 * @param {string} gameId - Validated game identifier (targeted game only)
 * @param {Object} [options]
 * @param {Function} [options.pageHost] - Inject a fake host for tests
 * @param {number} [options.timeoutMs] - Override the in-page API timeout
 * @returns {Promise<{ success: boolean, gameId: string, result: Object }>}
 * @throws {Error} With code 'GAME_SAVE_CLEANUP_FAILED' if the API is missing,
 *   times out, or reports failure.
 */
async function clearGameSaveData(app, gameId, options = {}) {
    validateGameId(gameId);

    const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const pageHost = options.pageHost || createDefaultPageHost(app, gameId);

    // deleteSaves must come from the caller's request, never a default. The
    // launcher never requests save deletion unless the uninstall checkbox was
    // explicitly checked. deletePreferences stays false (never delete a game's
    // settings/preferences via this path).
    const requested = {
        deleteSaves: options?.deleteSaves === true,
        deletePreferences: false
    };

    const out = await pageHost(buildClearSaveScript(requested, timeoutMs));

    if (!out || out.ok !== true) {
        const error = new Error(out && out.error ? out.error : 'Save data deletion failed');
        error.code = 'GAME_SAVE_CLEANUP_FAILED';
        error.details = out || null;
        throw error;
    }

    return { success: true, gameId, result: out.result };
}

/**
 * Orchestrate uninstall with optional save-data deletion.
 *
 * Order of operations:
 *   1. If deleteSaves=true: clear the game's own save data FIRST. If this
 *      fails, abort — do NOT delete files or metadata, and do not falsely
 *      report success.
 *   2. Filesystem deletion + installed-game metadata removal (delegated to
 *      uninstallGame), reported separately and never run when the save step
 *      failed.
 *
 * Returns a structured result instead of throwing so the IPC layer can surface
 * truthful errors to the user.
 *
 * @param {Object} opts
 * @param {Object} opts.app - Electron app module
 * @param {string} opts.gameId - Game identifier
 * @param {Object} [opts.options] - { deleteSaves?: boolean }
 * @param {Object} opts.store - Electron store instance
 * @param {Function} [opts.clearFn] - Inject for tests (defaults to clearGameSaveData)
 * @param {Function} [opts.uninstallFn] - Inject for tests (defaults to uninstallGame)
 * @returns {Promise<Object>} Structured result
 */
async function uninstallGameWithSaveHandling({ app, gameId, options = {}, store, clearFn, uninstallFn }) {
    const deleteSaves = !!(options && options.deleteSaves === true);
    const doClear = clearFn || clearGameSaveData;
    const doUninstall = uninstallFn || uninstallGame;

    let saveCleared = false;

    // Step 1: save-data deletion (only when explicitly requested)
    if (deleteSaves) {
        try {
            await doClear(app, gameId, options);
            saveCleared = true;
        } catch (e) {
            const message = (e && e.message) ? e.message : 'Save data deletion failed';
            // Abort: the game is NOT uninstalled and we do NOT claim its saves
            // were removed.
            return {
                success: false,
                gameId,
                deleteSaves,
                saveCleared: false,
                saveError: message,
                error: `Save data could not be deleted: ${message}`,
                filesDeleted: false
            };
        }
    }

    // Step 2: filesystem deletion + metadata removal (separate from save step)
    try {
        const result = doUninstall(app, gameId, { deleteSaves }, store);
        return {
            success: true,
            gameId,
            deleteSaves,
            saveCleared,
            filesDeleted: true,
            ...result
        };
    } catch (e) {
        const message = (e && e.message) ? e.message : 'Uninstall failed';
        return {
            success: false,
            gameId,
            deleteSaves,
            saveCleared,
            filesDeleted: false,
            error: message
        };
    }
}

module.exports = {
    buildClearSaveScript,
    resolveGameEntry,
    clearGameSaveData,
    createDefaultPageHost,
    uninstallGameWithSaveHandling,
    CLEAR_OPTS
};



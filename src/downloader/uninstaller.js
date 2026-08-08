// ==========================================
// UNINSTALLER
// ==========================================
// Safely removes installed games and their launcher-managed metadata.
//
// Security model:
//   - gameId is validated against a strict pattern
//   - install path is resolved ONLY from getGamesDir(app) + gameId
//     (stored install paths are never trusted)
//   - resolved path is verified to remain inside the games directory
//
// Data preservation:
//   - achievements, play history, favorites, and launcher settings
//     are preserved by default
//   - stale updateHistory and activeChannel are always removed
//   - launcher-managed saves are only removed when deleteSaves=true
//   - the ACTIVE profile's Game Hub achievement unlock state for the game is
//     only removed when deleteSaves=true (definitions/metadata, other games,
//     launcher achievements, and other profiles are always preserved)
//
// This module runs in the main (Node.js) process.

const fs = require('fs');
const path = require('path');
const { getGamesDir } = require('./installer');

const GAME_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;

/**
 * Validate a game ID against the allowed pattern.
 *
 * @param {*} gameId - Game identifier to validate
 * @throws {Error} If the game ID is invalid
 */
function validateGameId(gameId) {
    if (typeof gameId !== 'string' || !GAME_ID_PATTERN.test(gameId)) {
        throw new Error(`Invalid gameId: ${gameId}`);
    }
}

/**
 * Resolve the install path for a game.
 *
 * The path is derived ONLY from getGamesDir(app) + gameId.
 * Stored install paths are never trusted.
 *
 * @param {Object} app - Electron app module
 * @param {string} gameId - Validated game identifier
 * @returns {string} Resolved absolute install path
 * @throws {Error} If the resolved path escapes the games directory
 */
function resolveInstallPath(app, gameId) {
    const gamesDir = path.resolve(getGamesDir(app));
    const installPath = path.resolve(path.join(gamesDir, gameId));

    // Verify the resolved path remains inside the games directory.
    // This is defense-in-depth: gameId is already validated, but this
    // guarantees no path traversal even if the validation changes.
    if (installPath !== gamesDir && !installPath.startsWith(gamesDir + path.sep)) {
        throw new Error(`Install path escapes games directory: ${installPath}`);
    }

    return installPath;
}

/**
 * Remove stale launcher metadata for a game across all profiles.
 *
 * Always removes:
 *   - updateHistory entry (profiles.<id>.saves.updateHistory[gameId])
 *   - activeChannel (profiles.<id>.statistics.gamePlayHistory[gameId].activeChannel)
 *
 * Preserves:
 *   - achievements
 *   - play history (lastPlayed, playCount, favorite)
 *   - launcher settings
 *
 * @param {Object} store - Electron store instance
 * @param {string} gameId - Game identifier
 */
function removeStaleMetadata(store, gameId) {
    const profiles = store.get('profiles') || {};
    for (const profileId of Object.keys(profiles)) {
        const profilePath = `profiles.${profileId}`;

        // Remove stale updateHistory entry
        const updateHistory = store.get(`${profilePath}.saves.updateHistory`) || {};
        if (updateHistory[gameId]) {
            delete updateHistory[gameId];
            store.set(`${profilePath}.saves.updateHistory`, updateHistory);
        }

        // Remove stale activeChannel from game play history
        const gamePlayHistory = store.get(`${profilePath}.statistics.gamePlayHistory`) || {};
        if (gamePlayHistory[gameId] && gamePlayHistory[gameId].activeChannel) {
            delete gamePlayHistory[gameId].activeChannel;
            store.set(`${profilePath}.statistics.gamePlayHistory`, gamePlayHistory);
        }
    }
}

/**
 * Remove launcher-managed save data for a game across all profiles.
 *
 * Only called when deleteSaves=true. Removes game-specific save data
 * from the profile's saves object (e.g. saves[gameId]).
 *
 * updateHistory is NOT handled here — it is always removed as stale
 * metadata by removeStaleMetadata().
 *
 * @param {Object} store - Electron store instance
 * @param {string} gameId - Game identifier
 */
function removeLauncherSaves(store, gameId) {
    const profiles = store.get('profiles') || {};
    for (const profileId of Object.keys(profiles)) {
        const profilePath = `profiles.${profileId}`;
        const saves = store.get(`${profilePath}.saves`) || {};

        // Remove any game-specific launcher-managed save data
        if (saves[gameId]) {
            delete saves[gameId];
            store.set(`${profilePath}.saves`, saves);
        }
    }
}

/**
 * Clear Game Hub achievement unlock state for a game on the ACTIVE profile.
 *
 * Only called when deleteSaves=true. Removes the game's real-time "unlocked"
 * state at profiles.<activeId>.achievements[gameId] so a reinstall shows the
 * achievements locked again.
 *
 * This touches ONLY the game's unlock records and therefore preserves:
 *   - achievement definitions/metadata (those come from the game manifest and
 *     the launcher's achievements system, not from this data)
 *   - every other game's achievement data
 *   - Game Hub's own launcher achievements (gameId === 'gamehub')
 *   - all other profiles' achievement data (only the ACTIVE profile is cleared)
 *
 * It is intentionally generic: it operates on the supplied gameId and the
 * existing profiles.achievements[gameId] storage shape. No game-specific
 * knowledge is used.
 *
 * @param {Object} store - Electron store instance
 * @param {string} gameId - Game identifier
 */
function clearAchievementUnlocks(store, gameId) {
    const activeProfileId = store.get('metadata.activeProfileId') || 'default';
    const achievements = store.get(`profiles.${activeProfileId}.achievements`) || {};

    // Nothing to clear if this game has no unlock state on the active profile.
    // Returning early avoids an unnecessary write and keeps the write window
    // as small as possible.
    if (!achievements[gameId]) {
        return;
    }

    delete achievements[gameId];
    store.set(`profiles.${activeProfileId}.achievements`, achievements);
}

/**
 * Uninstall a game.
 *
 * Order of operations:
 *   1. Validate gameId
 *   2. Resolve install path from getGamesDir(app) + gameId
 *   3. Verify resolved path remains inside games directory
 *   4. Delete game files with fs.rmSync
 *   5. Only after successful deletion: remove installedGames metadata
 *   6. Remove stale updateHistory and activeChannel
 *   7. If deleteSaves=true: remove launcher-managed saves + the game's Game Hub
 *      achievement unlock state on the active profile
 *
 * @param {Object} app - Electron app module
 * @param {string} gameId - Game identifier
 * @param {Object} [options] - Uninstall options
 * @param {boolean} [options.deleteSaves=false] - Delete launcher-managed saves
 *   and the game's Game Hub achievement unlock state
 * @param {Object} store - Electron store instance
 * @returns {{ success: boolean, gameId: string, deleteSaves: boolean }}
 * @throws {Error} If gameId is invalid or deletion fails
 */
function uninstallGame(app, gameId, options = {}, store) {
    validateGameId(gameId);

    const deleteSaves = !!(options && options.deleteSaves);
    const installPath = resolveInstallPath(app, gameId);

    // Delete game files. If this throws, metadata is NOT removed.
    fs.rmSync(installPath, { recursive: true, force: true });

    // Only after successful deletion: remove installedGames metadata
    const installed = store.get('installedGames') || {};
    if (installed[gameId]) {
        delete installed[gameId];
        store.set('installedGames', installed);
    }

    // Remove stale updateHistory and activeChannel from all profiles
    removeStaleMetadata(store, gameId);

    // Remove launcher-managed saves and the game's Game Hub achievement unlock
    // state if requested
    if (deleteSaves) {
        removeLauncherSaves(store, gameId);
        clearAchievementUnlocks(store, gameId);
    }

    return { success: true, gameId, deleteSaves };
}

module.exports = { uninstallGame, validateGameId, resolveInstallPath };
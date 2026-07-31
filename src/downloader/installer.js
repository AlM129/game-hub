// ==========================================
// INSTALLER
// ==========================================
// Creates game directories and extracts downloaded ZIP packages
// into the Electron userData/games/ directory.
//
// Uses adm-zip for extraction (pure JS, no native bindings).
//
// Extraction handles ZIPs with or without a top-level parent folder:
//   - ZIP with parent folder:  game-v1.2.3/index.html, game-v1.2.3/js/...
//     → strips the common parent, extracts files directly to install path
//   - ZIP without parent folder:  index.html, js/...
//     → extracts directly to install path

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

/**
 * Get the base directory for installed games.
 * Uses Electron's app.getPath('userData')/games/
 *
 * @param {Object} app - Electron app module (passed from main process)
 * @returns {string} Path to the games installation directory
 */
function getGamesDir(app) {
    return path.join(app.getPath('userData'), 'games');
}

/**
 * Get the installation path for a specific game.
 *
 * @param {Object} app - Electron app module
 * @param {string} gameId - Game identifier
 * @returns {string} Path to the game's installation directory
 */
function getGameInstallPath(app, gameId) {
    return path.join(getGamesDir(app), gameId);
}

/**
 * Ensure the game's installation directory exists.
 * Creates parent directories if needed.
 *
 * @param {Object} app - Electron app module
 * @param {string} gameId - Game identifier
 * @returns {string} Path to the created/verified directory
 */
function ensureGameDir(app, gameId) {
    const installPath = getGameInstallPath(app, gameId);
    fs.mkdirSync(installPath, { recursive: true });
    return installPath;
}

/**
 * Detect the common top-level directory in a ZIP, if one exists.
 *
 * If all entries share a single parent directory (e.g. "game-v1.2.3/"),
 * returns that directory name. Otherwise returns null.
 *
 * This handles ZIPs created by packaging a folder, which is the
 * most common archive format for game distributions.
 *
 * @param {AdmZip} zip - The ZIP archive
 * @returns {string|null} Common parent directory name, or null
 */
function detectCommonParent(zip) {
    const entries = zip.getEntries();
    if (entries.length === 0) return null;

    // Collect unique top-level directories from entry paths
    const topDirs = new Set();
    for (const entry of entries) {
        if (entry.isDirectory) continue;
        const parts = entry.entryName.split('/');
        if (parts.length > 1) {
            topDirs.add(parts[0]);
        } else {
            // File at root level — no common parent
            return null;
        }
    }

    // If all files share exactly one top-level directory, it's the common parent
    if (topDirs.size === 1) {
        return topDirs.values().next().value;
    }

    return null;
}

/**
 * Extract a ZIP file to the game's installation directory.
 *
 * Automatically strips a common top-level parent folder if one exists,
 * so that game.path + action.url resolves directly to index.html
 * regardless of whether the ZIP was packaged with a parent folder.
 *
 * @param {Object} app - Electron app module
 * @param {string} gameId - Game identifier
 * @param {string} zipPath - Path to the downloaded ZIP file
 * @returns {{ path: string, extractedAt: string }} Installation result
 */
function extractZip(app, gameId, zipPath) {
    const installPath = ensureGameDir(app, gameId);

    try {
        // Debug: log file info before adm-zip extraction
        const stats = fs.statSync(zipPath);
        console.log(`[Installer] Extracting ZIP for ${gameId}:`);
        console.log(`[Installer]   Path: ${zipPath}`);
        console.log(`[Installer]   Size: ${stats.size} bytes`);
        const header = fs.readFileSync(zipPath).subarray(0, 4);
        console.log(`[Installer]   Header (hex): ${header.toString('hex')}`);
        const isValidZip = header[0] === 0x50 && header[1] === 0x4B && header[2] === 0x03 && header[3] === 0x04;
        console.log(`[Installer]   Valid ZIP signature: ${isValidZip}`);

        const zip = new AdmZip(zipPath);
        const entries = zip.getEntries();
        const root = path.resolve(installPath);
        const commonParent = detectCommonParent(zip);

        // Pre-validate all ZIP entries to prevent path traversal (Zip Slip)
        for (const entry of entries) {
            if (entry.isDirectory) continue;

            const relativePath = commonParent
                ? entry.entryName.substring(commonParent.length + 1)
                : entry.entryName;

            if (!relativePath) continue;

            const targetPath = path.resolve(installPath, relativePath);

            if (targetPath !== root && !targetPath.startsWith(root + path.sep)) {
                throw new Error(`Invalid ZIP entry (path traversal detected): ${entry.entryName}`);
            }
        }

        if (commonParent) {
            // Strip the common parent directory — extract each entry
            // relative to the install path, skipping the parent folder
            for (const entry of entries) {
                if (entry.isDirectory) continue;

                // Remove the common parent prefix from the entry path
                const relativePath = entry.entryName.substring(commonParent.length + 1);
                if (!relativePath) continue;

                const targetPath = path.resolve(installPath, relativePath);
                const targetDir = path.dirname(targetPath);

                fs.mkdirSync(targetDir, { recursive: true });
                fs.writeFileSync(targetPath, entry.getData());
            }
        } else {
            // No common parent — extract directly to install path
            zip.extractAllTo(installPath, true);
        }
    } catch (err) {
        throw new Error(`Failed to extract ZIP for ${gameId}: ${err.message}`);
    }

    return {
        path: installPath,
        extractedAt: new Date().toISOString()
    };
}

/**
 * Clean up a temporary ZIP file after successful extraction.
 *
 * @param {string} zipPath - Path to the temp ZIP file
 */
function cleanupTempZip(zipPath) {
    try {
        fs.unlinkSync(zipPath);
    } catch (err) {
        console.warn(`Failed to clean up temp ZIP ${zipPath}: ${err.message}`);
    }
}

/**
 * Install a game from a downloaded ZIP file.
 * Creates the game directory, extracts the ZIP, and cleans up.
 *
 * @param {Object} app - Electron app module
 * @param {string} gameId - Game identifier
 * @param {string} zipPath - Path to the downloaded ZIP file
 * @returns {{ path: string, extractedAt: string }} Installation result
 */
function installGame(app, gameId, zipPath) {
    const result = extractZip(app, gameId, zipPath);
    cleanupTempZip(zipPath);
    return result;
}

module.exports = { getGamesDir, getGameInstallPath, ensureGameDir, extractZip, cleanupTempZip, installGame };
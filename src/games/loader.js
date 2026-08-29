// ==========================================
// GAME LOADER
// ==========================================
// Discovers and loads game manifests from the registry system.
// Supports the new game-hub-registry format (object map with metaUrl)
// while maintaining backwards compatibility.
//
// Architecture (download-only):
//   1. Load registry
//   2. Load installedGames
//   3. Merge installation data into registry entries
//   4. Return game list
//
// All games come from the registry and are installed through the downloader.
// No bundled games are shipped with the launcher.

import { loadRegistry, loadInstalledGames, gamesRegistry, registryMeta, installedGames, isGameInstalled, markAsInstalled, loadGameMetadata, getCachedGameMetadata, getInstalledVersion, getRegistrySource } from './registry.js';
import { resolveMediaUrl, resolveMediaUrls } from '../utils.js';
import { addGameAchievements, setAchievementsEnabled } from '../systems/achievements/manager.js';

// ==========================================
// DEFAULT GAME DATA
// ==========================================
// Default values for games that haven't been installed yet.
// These are used when no local game.json is available.

const DEFAULT_THEME = {
    bg: 'bg-gray-900',
    text: 'text-gray-400',
    borderHover: 'hover:border-blue-500',
    linkText: 'text-blue-400',
    linkHover: 'hover:text-blue-300'
};

const DEFAULT_ACTIONS = [
    { type: 'play', label: 'Play', url: 'index.html' }
];

// ==========================================
// GAME DATA MODEL
// ==========================================

const _games = [];

export function getGames() {
    return _games;
}

/**
 * Build the offline game list from installed-game storage.
 *
 * On offline/startup without a reachable remote registry, the launcher does
 * NOT use any bundled catalog or bundled metadata. Game Hub is download-only:
 * the set of games shown is exactly the set of games installed on this device.
 *
 * For each installed game, the metadata is read from the INSTALLED GAME'S OWN
 * files (its game.json / achievements.json at the install path) using the same
 * metadata schema and field mapping as the online path — not from the Game Hub
 * source tree and not from a fabricated path. No network requests are made.
 *
 * @returns {Array} Built game objects (installed games only)
 */
async function buildGamesFromInstalled() {
    const loadedGames = [];

    for (const [gameId, installData] of Object.entries(installedGames)) {
        try {
            const installPath = installData?.path || installData?.installPath || null;

            // Read the installed game's own metadata from its install directory.
            const metadata = installPath
                ? await readInstalledJson(gameId, 'game.json')
                : null;

            // Map installed metadata the same way the online registry path does.
            const name = metadata?.name || installData?.name || gameId;
            const version = metadata?.version || installData?.version || null;
            const developer = metadata?.developer || '';
            const genre = metadata?.genre || '';
            const description = metadata?.description || '';
            let thumbnail = metadata?.thumbnail || metadata?.cover || '';
            let banner = metadata?.banner || thumbnail;
            let channels = metadata?.channels || null;

            const game = {
                id: gameId,
                title: name,
                name: name,
                version: version,
                path: installPath || null,
                description: description,
                thumbnail: thumbnail,
                banner: banner,
                cover: banner,
                theme: DEFAULT_THEME,
                actions: (metadata?.actions && metadata.actions.length) ? metadata.actions : DEFAULT_ACTIONS,
                source: 'download',
                package: metadata?.package || { available: false, url: null, size: null, checksum: null, format: null },
                developer: developer,
                genre: genre,
                channels: channels,
                metaUrl: null,
                achievementsEnabled: false
            };

            // Resolve media URLs against the installed game's actual path, so
            // screenshots/thumbnails etc. point at the local files (file://).
            if (metadata?.media && installPath) {
                const baseUrl = toFileUrl(installPath);
                game.media = resolveMediaUrls(metadata.media, baseUrl);
                const t = metadata.media.thumbnail?.url
                    ? resolveMediaUrl(metadata.media.thumbnail.url, baseUrl)
                    : thumbnail;
                if (t) { game.thumbnail = t; game.banner = t; game.cover = t; }
            }

            // Merge any extra metadata fields not already set (changelog,
            // goals, controls, themeConfig, releaseDate, etc.), mirroring the
            // online merge in loadGameManifests.
            if (metadata) {
                Object.keys(metadata).forEach(key => {
                    if (!(key in game)) {
                        game[key] = metadata[key];
                    }
                });
            }

            // Achievements are read from the installed game's own files.
            const achievementsEnabled = !!metadata?.achievementsEnabled;
            game.achievementsEnabled = achievementsEnabled;

            if (achievementsEnabled) {
                const achDefs = await loadInstalledAchievements(metadata, gameId, installPath);
                if (achDefs && Object.keys(achDefs).length > 0) {
                    addGameAchievements(gameId, achDefs);
                } else {
                    setAchievementsEnabled(gameId, false);
                }
            } else {
                setAchievementsEnabled(gameId, false);
            }

            loadedGames.push(game);
        } catch (error) {
            console.warn(`GameHub: Error building offline game data for ${gameId}:`, error);
        }
    }

    if (loadedGames.length === 0) {
        console.log('GameHub: Offline — no installed games to show as catalog');
    }

    return loadedGames;
}

/**
 * Read a JSON file from an installed game's directory via the main process.
 * Returns parsed data or null if unavailable (no bridge / missing file / error).
 * @param {string} gameId
 * @param {string} fileName - Safe flat *.json file name (e.g. 'game.json')
 * @returns {Promise<Object|null>}
 */
async function readInstalledJson(gameId, fileName) {
    if (!window.gameHub || typeof window.gameHub.readInstalledFile !== 'function') {
        return null;
    }
    try {
        const res = await window.gameHub.readInstalledFile(gameId, fileName);
        if (res && res.ok && res.data) return res.data;
        return null;
    } catch (error) {
        console.warn(`GameHub: Failed to read installed file ${fileName} for ${gameId}:`, error.message || error);
        return null;
    }
}

/**
 * Convert an installed-game filesystem path to a file:// base URL (with a
 * trailing slash), used as the base for resolving relative media URLs against
 * the installed game's actual files.
 * @param {string} installPath
 * @returns {string}
 */
function toFileUrl(installPath) {
    const normalized = installPath.endsWith('/') ? installPath : installPath + '/';
    return 'file://' + encodeURI(normalized.replace(/\\/g, '/'));
}

/**
 * Load achievement definitions for an installed game from its own files.
 * Mirrors the online loadGameAchievements mapping but reads from the install dir.
 * @param {Object} metadata - Installed game's game.json
 * @param {string} gameId
 * @param {string|null} installPath
 * @returns {Promise<Object|null>} Achievements map (id -> def) or null
 */
async function loadInstalledAchievements(metadata, gameId, installPath) {
    if (!metadata || !metadata.achievementsEnabled) {
        return null;
    }

    // Direct object embedded in game.json (id -> def map).
    if (metadata.achievements && typeof metadata.achievements === 'object' && !Array.isArray(metadata.achievements)) {
        return metadata.achievements;
    }

    // External file reference (achievementsFile or string achievements field).
    const fileRef = metadata.achievementsFile ||
        (typeof metadata.achievements === 'string' ? metadata.achievements : null);
    if (!fileRef || !/^[A-Za-z0-9._-]+$/.test(fileRef)) {
        return null;
    }

    const data = installPath ? await readInstalledJson(gameId, fileRef) : null;
    if (data && typeof data === 'object') {
        return data;
    }
    return null;
}

/**
 * Load the game registry from JSON, then load game manifests.
 * This is called once at startup.
 *
 * Architecture:
 *   1. Load the registry (remote GitHub when online; offline uses installed-game
 *      storage as the catalog instead)
 *   2. Load installed games from persistent storage
 *   3. Build game objects from registry metadata + installation data (online),
 *      or from installed-game storage only (offline)
 *   4. Return game list
 */
export async function loadGameManifests() {
    // Step 1: Load the registry (remote GitHub when online).
    await loadRegistry();

    // Step 2: Load installed games from persistent storage.
    // Needed in both modes: merged into online games, or as the offline catalog.
    await loadInstalledGames();

    // Determine mode:
    //  ONLINE  -> remote registry is the catalog (all downloadable games).
    //  OFFLINE -> installed-game storage is the catalog (only downloaded games).
    const offline = getRegistrySource() !== 'remote';

    // OFFLINE: Show only games that are actually installed/downloaded locally.
    // Game Hub is download-only — there is no bundled catalog or bundled game
    // metadata to load from the source tree.
    if (offline) {
        const loadedGames = await buildGamesFromInstalled();
        _games.length = 0;
        _games.push(...loadedGames);
        return loadedGames;
    }

    if (gamesRegistry.length === 0) {
        console.warn('GameHub: No games found in registry');
        _games.length = 0;
        return [];
    }

    // Step 3: Build game objects from registry metadata + installation data
    const loadedGames = [];

    for (const registry of gamesRegistry) {
        try {
            let metadata = null;
            let title = registry.name || registry.id;
            let version = registry.version || null;
            let description = registry.description || '';
            let thumbnail = registry.thumbnail || '';
            let banner = registry.thumbnail || '';
            let developer = registry.developer || '';
            let genre = registry.genre || '';
            let channels = null;

            // Step A: Try to load metadata from the registry (via metaUrl)
            if (registry.metaUrl) {
                metadata = await loadGameMetadata(registry.id);
                if (metadata) {
                    // Map new metadata fields
                    title = metadata.name || title;
                    developer = metadata.developer || developer;
                    genre = metadata.genre || genre;
                    description = metadata.description || description;
                    channels = metadata.channels || null;

                    // Thumbnail may be an object { url, alt } in new format.
                    // Relative URLs are resolved against the metadata file URL
                    // so the thumbnail works regardless of registry host.
                    if (metadata.media?.thumbnail?.url) {
                        thumbnail = resolveMediaUrl(metadata.media.thumbnail.url, registry.metaUrl);
                        banner = thumbnail;
                    } else if (metadata.media?.thumbnail) {
                        thumbnail = resolveMediaUrl(metadata.media.thumbnail, registry.metaUrl);
                        banner = thumbnail;
                    }

                    // Use stable channel version if available
                    if (metadata.channels?.stable?.version) {
                        version = metadata.channels.stable.version;
                    }
                }
            }

            // Step B: Get installation data (if the game is installed)
            const installData = installedGames[registry.id] || null;
            const installPath = installData?.path || installData?.installPath || null;

            // Build game object from all available data
            const game = {
                id: registry.id,
                title: title,
                name: title,
                version: version,
                path: installPath || null,
                description: description,
                thumbnail: thumbnail,
                banner: banner,
                cover: banner,  // Alias for backward compatibility with app.js
                theme: DEFAULT_THEME,
                actions: DEFAULT_ACTIONS,
                source: 'download',
                package: registry.package || { available: false, url: null, size: null, checksum: null, format: null },
                // New fields from registry metadata
                developer: developer,
                genre: genre,
                channels: channels,
                metaUrl: registry.metaUrl
            };

            // Resolve all URLs in the media object so they work for any future
            // media asset (screenshots, backgrounds, etc.), not just thumbnails.
            if (metadata?.media && registry.metaUrl) {
                const resolvedMedia = resolveMediaUrls(metadata.media, registry.metaUrl);
                game.media = resolvedMedia;
            }

            // Merge any extra metadata fields not already set
            if (metadata) {
                Object.keys(metadata).forEach(key => {
                    if (!(key in game)) {
                        game[key] = metadata[key];
                    }
                });
            }

            // Step C: Process achievements opt-in/opt-out and registration
            const achievementsEnabled = !!metadata?.achievementsEnabled;
            game.achievementsEnabled = achievementsEnabled;

            if (achievementsEnabled) {
                const achDefs = await loadGameAchievements(metadata, registry, installPath);
                if (achDefs && Object.keys(achDefs).length > 0) {
                    addGameAchievements(registry.id, achDefs);
                } else {
                    console.warn(`GameHub: Achievements enabled for "${registry.id}" but no definitions were loaded`);
                }
            } else {
                setAchievementsEnabled(registry.id, false);
            }

            loadedGames.push(game);
        } catch (error) {
            console.warn(`GameHub: Error loading game data for ${registry.id}:`, error);
        }
    }

    // Clear and push to maintain the same array reference
    _games.length = 0;
    _games.push(...loadedGames);
    return loadedGames;
}

/**
 * Load achievement definitions for a game dynamically from embedded metadata or external file.
 */
async function loadGameAchievements(metadata, registry, installPath) {
    if (!metadata || !metadata.achievementsEnabled) {
        return null;
    }

    // Direct object definition embedded in manifest
    if (metadata.achievements && typeof metadata.achievements === 'object') {
        return metadata.achievements;
    }

    // File reference specified via achievementsFile or string achievements field
    const fileRef = metadata.achievementsFile || (typeof metadata.achievements === 'string' ? metadata.achievements : null);
    if (!fileRef) {
        return null;
    }

    const urlsToTry = [];
    if (registry.metaUrl) {
        urlsToTry.push(resolveMediaUrl(fileRef, registry.metaUrl));
    }
    if (installPath) {
        const normPath = installPath.endsWith('/') ? installPath : installPath + '/';
        const fileUrl = normPath + fileRef;
        if (!urlsToTry.includes(fileUrl)) {
            urlsToTry.push(fileUrl);
        }
    }

    for (const url of urlsToTry) {
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data && typeof data === 'object') {
                    return data;
                }
            }
        } catch (e) {
            // Ignore fetch errors to allow fallback attempt
        }
    }

    return null;
}

// ==========================================
// REGISTRY METADATA EXPORTS
// ==========================================

/**
 * Get the ID of the currently featured game from the registry.
 * Returns null if no game is featured.
 */
export function getFeaturedGameId() {
    return registryMeta.featured || null;
}

/**
 * Get the registry version.
 */
export function getRegistryVersion() {
    return registryMeta.version || "1";
}

/**
 * Get the launcher changelog from the registry.
 */
export { registryMeta, launcherChangelog } from './registry.js';

// ==========================================
// PLAY DATA HELPERS
// ==========================================

import { Storage } from '../storage.js';

/**
 * Whether a candidate version is strictly newer than a current version.
 * Compares dot-separated numeric segments (e.g. "2.0.1" vs "2.0.0") so that
 * only a genuinely newer available version flags an update — never an equal or
 * older one. Uses the same existing version format; no new versioning scheme.
 * @param {string} candidate - The (available) version to check
 * @param {string} current - The (installed) baseline version
 * @returns {boolean}
 */
function isVersionNewer(candidate, current) {
    const aSegs = String(candidate || '').split('.').map(s => parseInt(s, 10) || 0);
    const bSegs = String(current || '').split('.').map(s => parseInt(s, 10) || 0);
    const len = Math.max(aSegs.length, bSegs.length);
    for (let i = 0; i < len; i++) {
        const av = i < aSegs.length ? aSegs[i] : 0;
        const bv = i < bSegs.length ? bSegs[i] : 0;
        if (av > bv) return true;
        if (av < bv) return false;
    }
    return false;
}

// Merge static game def with persistent play data from Storage
export async function getGameWithPlayData(game, Storage) {
    const pd = await Storage.getGameData(game.id);
    const activeChannel = await getActiveChannel(game.id, Storage);
    const offline = getRegistrySource() !== 'remote';

    // ONLINE: the available version is the current remote channel version.
    // OFFLINE: the remote/available version is UNKNOWN. The installed game's
    // own version must NOT be treated as a newer "available" release, so the
    // available version is left null here and updateAvailable stays false.
    const channelVersion = offline
        ? null
        : (getChannelVersion(game, activeChannel) || game.version);

    // Get installation state
    const isInstalled = isGameInstalled(game.id);
    const installData = getInstalledGameData(game.id);

    // Resolve the launch path from the installation data
    // Downloaded games use the absolute path stored by the downloader
    let resolvedPath = installData?.path || installData?.installPath || null;

    // Ensure path has a trailing slash so that concatenation with
    // cover/action URLs works correctly (e.g. "path/cover.png"
    // instead of "pathcover.png").
    if (resolvedPath && !resolvedPath.endsWith('/')) {
        resolvedPath += '/';
    }

    const installedVersion = getInstalledVersion(game.id);

    return {
        ...game,
        lastPlayed: pd.lastPlayed || null,
        playCount: pd.playCount || 0,
        favorite: pd.favorite || false,
        activeChannel: activeChannel,
        channelVersion: channelVersion,
        installed: isInstalled,
        path: resolvedPath || game.path,
        installPath: installData?.path || installData?.installPath || null,
        installedAt: installData?.installedAt || null,
        installedVersion: installedVersion,
        updateAvailable: !offline && isInstalled && installedVersion && channelVersion && isVersionNewer(channelVersion, installedVersion)
    };
}

export async function getAllGamesWithPlayData(Storage) {
    const result = [];
    for (const g of _games) {
        result.push(await getGameWithPlayData(g, Storage));
    }
    return result;
}

// ==========================================
// RECENTLY PLAYED HELPER
// ==========================================

export async function getRecentlyPlayed(Storage) {
    const all = await getAllGamesWithPlayData(Storage);
    return all
        .filter(g => g.lastPlayed)
        .sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed));
}

// ==========================================
// CHANNEL HELPERS
// ==========================================

import {
    getActiveChannel,
    setActiveChannel,
    getAvailableChannels,
    getChannelVersion,
    getChannelChangelog,
    getLatestChannelEntry,
    getLatestChangelogEntry,
    getLatestChangelogEntryByGameId,
    hasNewUpdates,
    markUpdatesAsSeen,
    getLatestChannelEntryByGameId,
    getGamesWithNewUpdates
} from './registry.js';

// Re-export all channel helpers for backward compatibility
export {
    getActiveChannel,
    setActiveChannel,
    getAvailableChannels,
    getChannelVersion,
    getChannelChangelog,
    getLatestChannelEntry,
    getLatestChangelogEntry,
    getLatestChangelogEntryByGameId,
    hasNewUpdates,
    markUpdatesAsSeen,
    getLatestChannelEntryByGameId,
    getGamesWithNewUpdates
};

// Wrapper that passes games array to avoid circular dependency
export async function getGamesWithNewUpdatesWrapper(Storage) {
    return await getGamesWithNewUpdates(Storage, getAllGamesWithPlayData, _games);
}

// ==========================================
// INSTALLATION STATE HELPERS
// ==========================================

/**
 * Get installation data for a game.
 * @param {string} gameId - Game identifier
 * @returns {Object|null} Installation data or null
 */
export function getInstalledGameData(gameId) {
    return installedGames[gameId] || null;
}

/**
 * Get all installed games.
 * @returns {Array} Array of { id, ...installData }
 */
export async function getAllInstalledGames() {
    const installed = await Storage.getInstalledGames();
    return Object.entries(installed).map(([id, data]) => ({
        id,
        ...data
    }));
}

/**
 * Refresh the in-memory installed games cache from storage.
 * Call this after a download completes to ensure the renderer
 * sees the updated installation state.
 */
export async function refreshInstalledGames() {
    await loadInstalledGames();
}
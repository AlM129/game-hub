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

import { loadRegistry, loadInstalledGames, gamesRegistry, registryMeta, installedGames, isGameInstalled, markAsInstalled, loadGameMetadata, getCachedGameMetadata } from './registry.js';

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
 * Load the game registry from JSON, then load game manifests.
 * This is called once at startup.
 *
 * Architecture:
 *   1. Load the registry (from remote or local fallback)
 *   2. Load installed games from persistent storage
 *   3. Build game objects from registry metadata + installation data
 *   4. Return game list
 */
export async function loadGameManifests() {
    // Step 1: Load the registry (from the new game-hub-registry or local fallback)
    await loadRegistry();

    if (gamesRegistry.length === 0) {
        console.warn('GameHub: No games found in registry');
        _games.length = 0;
        return [];
    }

    // Step 2: Load installed games from storage
    await loadInstalledGames();

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

                    // Thumbnail may be an object { url, alt } in new format
                    if (metadata.media?.thumbnail?.url) {
                        thumbnail = metadata.media.thumbnail.url;
                        banner = metadata.media.thumbnail.url;
                    } else if (metadata.media?.thumbnail) {
                        thumbnail = metadata.media.thumbnail;
                        banner = metadata.media.thumbnail;
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

            // For registry-only games (not installed), resolve thumbnail as absolute URL
            if (!game.path && game.thumbnail && !game.thumbnail.startsWith('http://') && !game.thumbnail.startsWith('https://') && registry.metaUrl) {
                // The thumbnail is relative to the metadata file location, so resolve it
                const metaBase = registry.metaUrl.substring(0, registry.metaUrl.lastIndexOf('/') + 1);
                if (metaBase) {
                    const absoluteCover = metaBase + game.thumbnail;
                    game.cover = absoluteCover;
                    game.banner = absoluteCover;
                    game.thumbnail = absoluteCover;
                }
            }

            // Merge any extra metadata fields not already set
            if (metadata) {
                Object.keys(metadata).forEach(key => {
                    if (!(key in game)) {
                        game[key] = metadata[key];
                    }
                });
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

// Merge static game def with persistent play data from Storage
export async function getGameWithPlayData(game, Storage) {
    const pd = await Storage.getGameData(game.id);
    const activeChannel = await getActiveChannel(game.id, Storage);
    const channelVersion = getChannelVersion(game, activeChannel) || game.version;

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
        installedAt: installData?.installedAt || null
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
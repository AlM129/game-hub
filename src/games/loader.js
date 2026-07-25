// ==========================================
// GAME LOADER
// ==========================================
// Discovers and loads game manifests from the registry system.
// Supports the new game-hub-registry format (object map with metaUrl)
// while maintaining backwards compatibility.
//
// Game manifests now come from two sources:
//   1. Registry metadata (remote, via metaUrl) — for display info, channels, versions
//   2. Local game.json (bundled) — for actions, themes, and actual game code

import { loadRegistry, loadInstalledGames, gamesRegistry, registryMeta, installedGames, isGameInstalled, markAsInstalled, loadGameMetadata, getCachedGameMetadata } from './registry.js';

// ==========================================
// BUNDLED GAME MAPPING
// ==========================================
// Maps game IDs to their local bundled paths.
// This is a launcher-side configuration — the remote registry
// provides metadata only, not source locations.
// Each entry points to the local game directory containing game.json.

const BUNDLED_GAMES = {
    "tactical-drone-defense": "games/tactical-drone-defense/",
    "sky-ace": "games/sky-ace/",
    "neon-survival": "games/neon-survival/"
};

/**
 * Get the local bundled path for a game, if it exists.
 * @param {string} gameId
 * @returns {string|null}
 */
function getBundledPath(gameId) {
    return BUNDLED_GAMES[gameId] || null;
}

/**
 * Check if a game is bundled locally.
 * @param {string} gameId
 * @returns {boolean}
 */
function isBundledGame(gameId) {
    return gameId in BUNDLED_GAMES;
}

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
 */
export async function loadGameManifests() {
    // Step 1: Load the registry (from the new game-hub-registry or local fallback)
    await loadRegistry();
    
    if (gamesRegistry.length === 0) {
        console.warn('GameHub: No games found in registry');
        _games.length = 0;
        return [];
    }
    
    // Step 2: Load each game's data from registry metadata + local game.json
    const loadedGames = [];
    
    for (const registry of gamesRegistry) {
        try {
            let manifest = null;
            let metadata = null;
            let title = registry.name || registry.id;
            let actions = [];
            let theme = {};
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

            // Step B: Determine local path — from registry (legacy) or bundled mapping
            const localPath = registry.path || getBundledPath(registry.id);

            // Step C: Load local game.json for bundled games (actions, theme, etc.)
            if (localPath) {
                const response = await fetch(`${localPath}game.json`);
                if (response.ok) {
                    const gameJsonManifest = await response.json();
                    manifest = gameJsonManifest;
                    
                    // Use themeConfig if available, otherwise fallback to theme string
                    theme = gameJsonManifest.themeConfig || gameJsonManifest.theme || {};
                    
                    // Map manifest fields
                    title = gameJsonManifest.title || gameJsonManifest.name || title;
                    
                    // Actions URLs are relative to game folder
                    actions = (gameJsonManifest.actions || []).map(a => ({
                        ...a,
                        url: a.url || 'index.html'
                    }));
                    
                    // Local cover image takes priority
                    if (gameJsonManifest.cover) {
                        thumbnail = gameJsonManifest.cover;
                        banner = gameJsonManifest.cover;
                    }
                    
                    // Local manifest version as fallback
                    if (gameJsonManifest.version && !version) {
                        version = gameJsonManifest.version;
                    }
                } else {
                    console.warn(`GameHub: Failed to load local manifest for ${registry.id}, using registry metadata`);
                }
            } else {
                console.log(`GameHub: Registry-only entry for ${registry.id}, no local path for manifest`);
            }
            
            // Build game object from all available data
            const game = {
                id: registry.id,
                title: title,
                name: title,
                version: version,
                path: localPath,
                description: description,
                thumbnail: thumbnail,
                banner: banner,
                cover: banner,  // Alias for backward compatibility with app.js
                theme: theme,
                actions: actions,
                source: localPath ? 'bundled' : (registry.source || 'registry'),
                package: registry.package || { available: false, url: null, size: null, checksum: null, format: null },
                // New fields from registry metadata
                developer: developer,
                genre: genre,
                channels: channels,
                metaUrl: registry.metaUrl
            };
            
            // For registry-only games (no local path), resolve thumbnail as absolute URL
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
            
            // Merge any extra manifest fields (for built-in games that have them)
            if (manifest) {
                Object.keys(manifest).forEach(key => {
                    if (!(key in game)) {
                        game[key] = manifest[key];
                    }
                });
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
// BUNDLED GAME AUTO-DETECTION
// ==========================================
// Automatically detects and registers locally bundled games.
// Works with both old format (path-based) and new format
// (where bundled games are tracked by their local path).

/**
 * Detect bundled games by checking registry entries with local paths.
 * This runs after registry load to mark existing local games as installed.
 */
export async function detectBundledGames() {
    console.log('GameHub: Detecting bundled games...');
    let detectedCount = 0;

    for (const registryEntry of gamesRegistry) {
        // Determine local path — from registry (legacy) or bundled mapping
        const localPath = registryEntry.path || getBundledPath(registryEntry.id);

        // Skip if no local path (registry-only games — not bundled locally)
        if (!localPath) {
            continue;
        }

        // Skip if already marked as installed
        if (isGameInstalled(registryEntry.id)) {
            continue;
        }

        // Try to load manifest to verify the game exists locally
        try {
            const response = await fetch(`${localPath}game.json`);
            if (!response.ok) {
                console.warn(`GameHub: Bundled game manifest not found: ${registryEntry.id}`);
                continue;
            }

            const manifest = await response.json();

            // Get version from manifest, or from channels metadata, or from registry
            let installedVersion = manifest.version || registryEntry.version || '1.0.0';
            
            // Try to get metadata for better version info
            if (registryEntry.metaUrl) {
                const metadata = getCachedGameMetadata(registryEntry.id);
                if (metadata?.channels?.stable?.version) {
                    installedVersion = metadata.channels.stable.version;
                }
            }

            // Mark as installed with 'bundled' source
            await markAsInstalled(registryEntry.id, {
                version: installedVersion,
                installPath: localPath,
                installedAt: new Date().toISOString(),
                source: 'bundled'
            });

            console.log(`GameHub: Auto-detected bundled game: ${registryEntry.id} v${installedVersion}`);
            detectedCount++;
        } catch (error) {
            console.warn(`GameHub: Could not detect ${registryEntry.id}:`, error.message);
        }
    }

    console.log(`GameHub: Detected ${detectedCount} bundled games`);
    return detectedCount;
}

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

    return {
        ...game,
        lastPlayed: pd.lastPlayed || null,
        playCount: pd.playCount || 0,
        favorite: pd.favorite || false,
        activeChannel: activeChannel,
        channelVersion: channelVersion,
        installed: isInstalled,
        installPath: installData?.installPath || game.path,
        installSource: installData?.source || (game.path ? 'bundled' : null),
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
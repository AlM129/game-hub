// ==========================================
// GAME LOADER
// ==========================================
// Discovers and loads game manifests from game.json files
// Uses the registry system (loaded from registry.json) instead of hardcoded lists.

import { loadRegistry, loadInstalledGames, gamesRegistry, registryMeta, installedGames, isGameInstalled, markAsInstalled } from './registry.js';

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
    // Step 1: Load the registry (from JSON file, or eventually a remote URL)
    await loadRegistry();
    
    if (gamesRegistry.length === 0) {
        console.warn('GameHub: No games found in registry');
        _games.length = 0;
        return [];
    }
    
    // Step 2: Load each game's manifest from its game.json
    const loadedGames = [];
    
    for (const registry of gamesRegistry) {
        try {
            let manifest = null;
            let title = registry.name || registry.id;
            let actions = [];
            let theme = {};
            let version = registry.version;
            let thumbnail = registry.thumbnail || '';
            let banner = registry.thumbnail || '';
            
            // Only attempt to load manifest if there's a local path
            if (registry.path) {
                const response = await fetch(`${registry.path}game.json`);
                if (response.ok) {
                    manifest = await response.json();
                    
                    // Use themeConfig if available, otherwise fallback to theme string
                    theme = manifest.themeConfig || manifest.theme || {};
                    
                    // Map manifest fields to what the launcher expects
                    title = manifest.title || manifest.name || registry.name || registry.id;
                    
                    // Actions URLs are relative to game folder, but need to be resolved
                    actions = (manifest.actions || []).map(a => ({
                        ...a,
                        url: a.url || 'index.html'
                    }));
                    
                    thumbnail = manifest.cover || registry.thumbnail || '';
                    banner = manifest.cover || registry.thumbnail || '';
                    
                    // Manifest version takes priority over registry version
                    if (manifest.version) {
                        version = manifest.version;
                    }
                } else {
                    console.warn(`GameHub: Failed to load manifest for ${registry.id}, using registry metadata`);
                }
            } else {
                console.log(`GameHub: Remote-only registry entry for ${registry.id}, no local path to load manifest`);
            }
            
            // Build game object from available data (manifest + registry fallback)
            const game = {
                id: registry.id,
                title: title,
                name: title,
                version: version,
                path: registry.path,
                description: registry.description || '',
                thumbnail: thumbnail,
                banner: banner,
                theme: theme,
                actions: actions,
                source: registry.source || 'bundled',
                package: registry.package || { available: false, url: null, size: null, checksum: null, format: null }
            };
            
            // Merge any extra manifest fields (for built-in games that have them)
            if (manifest) {
                Object.keys(manifest).forEach(key => {
                    if (!(key in game)) {
                        game[key] = manifest[key];
                    }
                });
            }
            
            loadedGames.push(game);
        } catch (error) {
            console.warn(`GameHub: Error loading manifest for ${registry.id}:`, error);
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
// Automatically detects and registers locally bundled games

/**
 * Detect bundled games by checking registry entries with local paths.
 * This runs after registry load to mark existing local games as installed.
 */
export async function detectBundledGames() {
    console.log('GameHub: Detecting bundled games...');
    let detectedCount = 0;

    for (const registryEntry of gamesRegistry) {
        // Skip if no path (remote-only games)
        if (!registryEntry.path) {
            continue;
        }

        // Skip if already marked as installed
        if (isGameInstalled(registryEntry.id)) {
            continue;
        }

        // Try to load manifest to verify the game exists locally
        try {
            const response = await fetch(`${registryEntry.path}game.json`);
            if (!response.ok) {
                console.warn(`GameHub: Bundled game manifest not found: ${registryEntry.id}`);
                continue;
            }

            const manifest = await response.json();

            // Mark as installed with 'bundled' source
            await markAsInstalled(registryEntry.id, {
                version: manifest.version || registryEntry.version || '1.0.0',
                installPath: registryEntry.path,
                installedAt: new Date().toISOString(),
                source: 'bundled'
            });

            console.log(`GameHub: Auto-detected bundled game: ${registryEntry.id} v${manifest.version}`);
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

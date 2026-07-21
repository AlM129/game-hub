// ==========================================
// GAME LOADER
// ==========================================
// Discovers and loads game manifests from game.json files
// Uses the registry system (loaded from registry.json) instead of hardcoded lists.

import { loadRegistry, gamesRegistry, registryMeta } from './registry.js';

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
            const response = await fetch(`${registry.path}game.json`);
            if (!response.ok) {
                console.warn(`GameHub: Failed to load manifest for ${registry.id}`);
                continue;
            }
            const manifest = await response.json();
            
            // Use themeConfig if available, otherwise fallback to theme string
            const theme = manifest.themeConfig || manifest.theme || {};
            
            // Map manifest fields to what the launcher expects
            // Manifest uses "name" but launcher expects "title"
            const title = manifest.title || manifest.name || registry.id;
            // Actions URLs are relative to game folder, but need to be resolved
            const actions = (manifest.actions || []).map(a => ({
                ...a,
                url: a.url || 'index.html'
            }));
            
            // Merge registry path with manifest data
            loadedGames.push({
                ...manifest,
                title: title,
                actions: actions,
                thumbnail: manifest.cover,
                banner: manifest.cover,
                path: registry.path,
                theme: theme
            });
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
// PLAY DATA HELPERS
// ==========================================

import { Storage } from '../storage.js';

// Merge static game def with persistent play data from Storage
export async function getGameWithPlayData(game, Storage) {
    const pd = await Storage.getGameData(game.id);
    const activeChannel = await getActiveChannel(game.id, Storage);
    const channelVersion = getChannelVersion(game, activeChannel) || game.version;

    return {
        ...game,
        lastPlayed: pd.lastPlayed || null,
        playCount: pd.playCount || 0,
        favorite: pd.favorite || false,
        activeChannel: activeChannel,
        channelVersion: channelVersion
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

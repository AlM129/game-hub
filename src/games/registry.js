// ==========================================
// GAME REGISTRY
// ==========================================
// Loads game registry from an external JSON file.
// This allows adding new games, changing the featured game,
// and eventually fetching from a remote URL without modifying Game Hub code.

import { getRegistryUrl, LOCAL_REGISTRY_URL, getUseRemoteRegistry, setUseRemoteRegistry } from './registry-source.js';
import { Storage } from '../storage.js';

// Mutable registry state — populated from registry.json at startup
export let gamesRegistry = [];
export let registryMeta = {
    version: "1",
    featured: null
};
export let launcherChangelog = [];

// ==========================================
// INSTALLATION STATE TRACKING
// ==========================================
// Profile-independent tracking of installed games

export let installedGames = {};  // { gameId: { version, installPath, installedAt, source } }

/**
 * Load installed games from storage.
 * Should be called after loadRegistry().
 */
export async function loadInstalledGames() {
    try {
        const data = await Storage.getInstalledGames();
        installedGames = data || {};
        console.log(`GameHub: Loaded ${Object.keys(installedGames).length} installed games from storage`);
    } catch (error) {
        console.warn('GameHub: Failed to load installed games:', error);
        installedGames = {};
    }
}

/**
 * Check if a game is installed.
 * @param {string} gameId - Game identifier
 * @returns {boolean}
 */
export function isGameInstalled(gameId) {
    return !!installedGames[gameId];
}

/**
 * Get installation data for a game.
 * @param {string} gameId - Game identifier
 * @returns {Object|null} Installation data or null
 */
export function getInstalledGameData(gameId) {
    return installedGames[gameId] || null;
}

/**
 * Get the installed version of a game.
 * @param {string} gameId - Game identifier
 * @returns {string|null} Version string or null
 */
export function getInstalledVersion(gameId) {
    return installedGames[gameId]?.version || null;
}

/**
 * Get the install path of a game.
 * @param {string} gameId - Game identifier
 * @returns {string|null} Install path or null
 */
export function getInstallPath(gameId) {
    return installedGames[gameId]?.installPath || null;
}

/**
 * Mark a game as installed.
 * @param {string} gameId - Game identifier
 * @param {Object} data - Installation data { version, installPath, installedAt, source }
 */
export async function markAsInstalled(gameId, data) {
    installedGames[gameId] = data;
    await Storage.setInstalledGame(gameId, data);
    console.log(`GameHub: Marked ${gameId} as installed (source: ${data.source})`);
}

/**
 * Remove installed game entry.
 * @param {string} gameId - Game identifier
 */
export async function uninstallGame(gameId) {
    delete installedGames[gameId];
    await Storage.removeInstalledGame(gameId);
    console.log(`GameHub: Uninstalled ${gameId}`);
}

// ==========================================
// REGISTRY LOADER
// ==========================================

export async function loadRegistry() {
    let data = null;
    let source = null;
    
    // Try remote registry first if enabled
    if (getUseRemoteRegistry()) {
        try {
            const remoteUrl = getRegistryUrl();
            console.log('GameHub: Attempting to load remote registry from:', remoteUrl);
            
            const response = await fetch(remoteUrl);
            
            if (!response.ok) {
                // Explicitly throw for non-OK responses to trigger fallback
                throw new Error(`Remote registry returned status: ${response.status}`);
            }
            
            data = await response.json();
            source = 'remote';
            console.log('GameHub: Successfully loaded registry from remote URL');
        } catch (error) {
            console.warn('GameHub: Failed to load remote registry (offline or network error):', error.message);
            // Continue to local fallback
        }
    } else {
        console.log('GameHub: Remote registry disabled, using local registry');
    }
    
    // Fall back to local registry if remote failed or is disabled
    if (!data) {
        try {
            console.log('GameHub: Falling back to local registry:', LOCAL_REGISTRY_URL);
            const response = await fetch(LOCAL_REGISTRY_URL);
            
            if (!response.ok) {
                throw new Error(`Local registry returned status: ${response.status}`);
            }
            
            data = await response.json();
            source = 'local';
            console.log('GameHub: Successfully loaded registry from local fallback');
        } catch (error) {
            console.error('GameHub: Failed to load local registry:', error);
            // Fall back to empty state — don't crash the app
            gamesRegistry = [];
            registryMeta = { version: "1", featured: null };
            launcherChangelog = [];
            return { gamesRegistry, registryMeta, launcherChangelog };
        }
    }
    
    try {
        // Validate minimal structure
        if (!data || !Array.isArray(data.games)) {
            throw new Error('Invalid registry format: missing games array');
        }

        // Store registry metadata
        registryMeta = {
            version: data.version || "1",
            featured: data.featured || null
        };

        // Store launcher changelog
        launcherChangelog = data.launcherChangelog || [];

        // Build the games registry array from JSON data
        const DEFAULT_PACKAGE = {
            available: false,
            url: null,
            size: null,
            checksum: null,
            format: null
        };

        gamesRegistry = data.games.map(game => ({
            id: game.id,
            path: game.path,
            version: game.version || null,
            featured: game.featured || false,
            description: game.description || '',
            thumbnail: game.thumbnail || '',
            name: game.name || game.id,
            source: game.source || 'bundled',
            package: game.package || { ...DEFAULT_PACKAGE }
        }));

        console.log(`GameHub: Registry loaded successfully from ${source} source (${gamesRegistry.length} games, version ${registryMeta.version})`);
        return { gamesRegistry, registryMeta, launcherChangelog };
    } catch (error) {
        console.error('GameHub: Failed to parse registry data:', error);
        // Fall back to empty state — don't crash the app
        gamesRegistry = [];
        registryMeta = { version: "1", featured: null };
        launcherChangelog = [];
        return { gamesRegistry, registryMeta, launcherChangelog };
    }
}

// ==========================================
// CHANNEL CONFIGURATION
// ==========================================

export const CHANNEL_CONFIG = {
    stable: { label: "Stable", color: "text-green-400", bg: "bg-green-900/30" },
    beta: { label: "Beta", color: "text-amber-400", bg: "bg-amber-900/30" },
    alpha: { label: "Alpha", color: "text-blue-400", bg: "bg-blue-900/30" },
    demo: { label: "Demo", color: "text-purple-400", bg: "bg-purple-900/30" }
};

// ==========================================
// CHANNEL HELPERS
// ==========================================
// Note: Storage is passed as parameter to avoid circular imports

// Get the active release channel for a game (from storage)
export async function getActiveChannel(gameId, Storage) {
    const data = await Storage.load();
    return data.games?.[gameId]?.activeChannel || 'stable';
}

// Set the active release channel for a game
export async function setActiveChannel(gameId, channel, Storage) {
    const data = await Storage.load();
    if (!data.games[gameId]) {
        data.games[gameId] = {};
    }
    data.games[gameId].activeChannel = channel;
    await Storage.save(data);
}

// Get all available channels for a game
export function getAvailableChannels(game) {
    if (game.releases) {
        return Object.keys(game.releases);
    }
    // Backwards compatibility: single changelog = stable channel
    if (game.changelog && game.changelog.length > 0) {
        return ['stable'];
    }
    return ['stable'];
}

// Get the version for a specific channel
export function getChannelVersion(game, channel) {
    if (game.releases && game.releases[channel]) {
        return game.releases[channel].version;
    }
    // Backwards compatibility: return game.version for stable
    if (channel === 'stable') {
        return game.version;
    }
    return null;
}

// Get changelog for a specific channel
export function getChannelChangelog(game, channel) {
    if (game.releases && game.releases[channel]) {
        return game.releases[channel].changelog || [];
    }
    // Backwards compatibility: return game.changelog for stable
    if (channel === 'stable' && game.changelog) {
        return game.changelog;
    }
    return [];
}

// Get the latest changelog entry for a specific channel
export function getLatestChannelEntry(game, channel) {
    const changelog = getChannelChangelog(game, channel);
    if (changelog.length === 0) return null;
    return changelog.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
}

// Get the latest changelog entry for a game (for backwards compatibility)
export function getLatestChangelogEntry(game) {
    // If game has releases, get the latest from the active/stable channel
    if (game.releases) {
        const stableChangelog = getChannelChangelog(game, 'stable');
        if (stableChangelog.length > 0) {
            return stableChangelog.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        }
    }
    // Backwards compatibility: use the old changelog
    const changelog = game.changelog || [];
    if (changelog.length === 0) return null;
    return changelog.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
}

// Get the latest changelog entry for a game by ID
export function getLatestChangelogEntryByGameId(gameId, games = []) {
    const game = games.find(g => g.id === gameId);
    if (!game) return null;
    return getLatestChangelogEntry(game);
}

// Check if a game has new updates the user hasn't seen (for a specific channel)
export async function hasNewUpdates(gameId, Storage, channel = null, games = []) {
    const game = games.find(g => g.id === gameId);
    if (!game) return false;

    // If no channel specified, use the active channel
    const targetChannel = channel || await getActiveChannel(gameId, Storage);

    // Get changelog for the channel
    const changelog = getChannelChangelog(game, targetChannel);
    if (changelog.length === 0) return false;

    const latest = getLatestChannelEntry(game, targetChannel);
    const history = await Storage.getUpdateHistory(gameId, targetChannel);

    return latest && latest.version !== history.lastSeenVersion;
}

// Mark updates as seen for a game (for a specific channel)
export async function markUpdatesAsSeen(gameId, Storage, channel = null) {
    const targetChannel = channel || await getActiveChannel(gameId, Storage);
    const latest = getLatestChannelEntryByGameId(gameId, targetChannel);
    if (latest) {
        await Storage.setUpdateHistory(gameId, latest.version, targetChannel);
    }
}

// Get the latest changelog entry for a game by ID and channel
export function getLatestChannelEntryByGameId(gameId, channel, games = []) {
    const game = games.find(g => g.id === gameId);
    if (!game) return null;
    return getLatestChannelEntry(game, channel);
}

// Get all games with new updates, sorted by date (newest first)
export async function getGamesWithNewUpdates(Storage, getAllGamesWithPlayData, games = []) {
    const allWithData = await getAllGamesWithPlayData(Storage);
    const filtered = [];
    for (const g of allWithData) {
        if (await hasNewUpdates(g.id, Storage, null, games)) {
            filtered.push(g);
        }
    }
    return filtered.sort((a, b) => {
        const aChannel = a.activeChannel || 'stable';
        const bChannel = b.activeChannel || 'stable';
        const aLatest = getLatestChannelEntryByGameId(a.id, aChannel, games);
        const bLatest = getLatestChannelEntryByGameId(b.id, bChannel, games);
        return new Date(bLatest?.date || 0) - new Date(aLatest?.date || 0);
    });
}

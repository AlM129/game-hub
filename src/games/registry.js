// ==========================================
// GAME REGISTRY
// ==========================================
// Loads game registry from an external JSON file.
// This allows adding new games, changing the featured game,
// and eventually fetching from a remote URL without modifying Game Hub code.

import { getRegistryUrl } from './registry-source.js';

// Mutable registry state — populated from registry.json at startup
export let gamesRegistry = [];
export let registryMeta = {
    version: "1",
    featured: null
};
export let launcherChangelog = [];

// ==========================================
// REGISTRY LOADER
// ==========================================

export async function loadRegistry() {
    try {
        const url = getRegistryUrl();
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to load registry: ${response.status}`);
        }
        const data = await response.json();

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
        gamesRegistry = data.games.map(game => ({
            id: game.id,
            path: game.path,
            featured: game.featured || false,
            description: game.description || '',
            thumbnail: game.thumbnail || '',
            name: game.name || game.id
        }));

        return { gamesRegistry, registryMeta, launcherChangelog };
    } catch (error) {
        console.error('GameHub: Failed to load game registry:', error);
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

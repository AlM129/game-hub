// ==========================================
// GAME REGISTRY
// ==========================================
// Simple registry mapping game IDs to their folder paths.
// Game metadata is loaded dynamically from game.json manifests.

export const gamesRegistry = [
    {
        id: "sky-ace",
        path: "games/sky-ace/"
    },
    {
        id: "tactical-drone-defense",
        path: "games/tactical-drone-defense/"
    },
    {
        id: "neon-survival",
        path: "games/neon-survival/"
    }
];

// ==========================================
// GAME DATA MODEL
// ==========================================
// Static game definitions. Play data (lastPlayed, playCount, favorite)
// now comes from Storage, not from these objects. The getGameWithPlayData()
// helper merges both for rendering.

// ==========================================
// LAUNCHER CHANGELOG
// ==========================================
// Changelog for the Game Hub launcher itself.
// Future stages can use this for update detection and notifications.
export const launcherChangelog = [
    {
        version: "1.3.0",
        date: "2026-07-10",
        changes: [
            "Added statistics dashboard",
            "Added Game Hub Bridge"
        ]
    }
];

export let games = [];

// ==========================================
// GAME MANIFEST LOADER
// ==========================================
// Loads game metadata from game.json manifests

export async function loadGameManifests() {
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
    
    games = loadedGames;
    return loadedGames;
}

// ==========================================
// CHANGELOG HELPERS
// ==========================================
// Channel badge configuration for different release types
export const CHANNEL_CONFIG = {
    stable: { label: "Stable", color: "text-green-400", bg: "bg-green-900/30" },
    beta: { label: "Beta", color: "text-amber-400", bg: "bg-amber-900/30" },
    alpha: { label: "Alpha", color: "text-blue-400", bg: "bg-blue-900/30" },
    demo: { label: "Demo", color: "text-purple-400", bg: "bg-purple-900/30" }
};

// Get the active release channel for a game (from storage)
export function getActiveChannel(gameId, Storage) {
    const data = Storage.load();
    return data.games?.[gameId]?.activeChannel || 'stable';
}

// Set the active release channel for a game
export function setActiveChannel(gameId, channel, Storage) {
    const data = Storage.load();
    if (!data.games[gameId]) {
        data.games[gameId] = {};
    }
    data.games[gameId].activeChannel = channel;
    Storage.save(data);
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
export function getLatestChangelogEntryByGameId(gameId) {
    const game = games.find(g => g.id === gameId);
    if (!game) return null;
    return getLatestChangelogEntry(game);
}

// Check if a game has new updates the user hasn't seen (for a specific channel)
export function hasNewUpdates(gameId, Storage, channel = null) {
    const game = games.find(g => g.id === gameId);
    if (!game) return false;

    // If no channel specified, use the active channel
    const targetChannel = channel || getActiveChannel(gameId, Storage);

    // Get changelog for the channel
    const changelog = getChannelChangelog(game, targetChannel);
    if (changelog.length === 0) return false;

    const latest = getLatestChannelEntry(game, targetChannel);
    const history = Storage.getUpdateHistory(gameId, targetChannel);

    return latest && latest.version !== history.lastSeenVersion;
}

// Mark updates as seen for a game (for a specific channel)
export function markUpdatesAsSeen(gameId, Storage, channel = null) {
    const targetChannel = channel || getActiveChannel(gameId, Storage);
    const latest = getLatestChannelEntryByGameId(gameId, targetChannel);
    if (latest) {
        Storage.setUpdateHistory(gameId, latest.version, targetChannel);
    }
}

// Get the latest changelog entry for a game by ID and channel
export function getLatestChannelEntryByGameId(gameId, channel) {
    const game = games.find(g => g.id === gameId);
    if (!game) return null;
    return getLatestChannelEntry(game, channel);
}

// Get all games with new updates, sorted by date (newest first)
export function getGamesWithNewUpdates(Storage, getAllGamesWithPlayData) {
    return getAllGamesWithPlayData(Storage)
        .filter(g => hasNewUpdates(g.id, Storage))
        .sort((a, b) => {
            const aChannel = a.activeChannel || 'stable';
            const bChannel = b.activeChannel || 'stable';
            const aLatest = getLatestChannelEntryByGameId(a.id, aChannel);
            const bLatest = getLatestChannelEntryByGameId(b.id, bChannel);
            return new Date(bLatest?.date || 0) - new Date(aLatest?.date || 0);
        });
}

// Merge static game def with persistent play data from Storage
export function getGameWithPlayData(game, Storage) {
    const pd = Storage.getGameData(game.id);
    const activeChannel = getActiveChannel(game.id, Storage);
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

export function getAllGamesWithPlayData(Storage) {
    return games.map(g => getGameWithPlayData(g, Storage));
}
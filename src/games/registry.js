// ==========================================
// GAME REGISTRY
// ==========================================
// Loads game registry from an external JSON file.
// Supports the new game-hub-registry format (object map with metaUrl)
// while maintaining backwards compatibility with the old array format.
//
// New registry format:
//   { games: { "game-id": { id, name, developer, genre, featured, thumbnail, metaUrl } } }
// Old registry format:
//   { games: [{ id, name, version, description, thumbnail, featured, source, package }] }
//
// Per-game metadata (loaded lazily via metaUrl):
//   { channels: { stable: { version, ... }, development: { version, ... } }, ... }
//
// All games are download-only — no bundled games are shipped with the launcher.

import {
    getRegistryUrl,
    getUseRemoteRegistry,
    getRegistryBaseUrl,
    setRegistryBaseUrl,
    REMOTE_REGISTRY_BASE
} from './registry-source.js';
import { Storage } from '../storage.js';

// ==========================================
// CACHE CONFIGURATION
// ==========================================

const CACHE_KEY = 'gamehub-registry-cache';

// ==========================================
// MUTABLE STATE
// ==========================================

// Games registry array (populated from registry.json at startup)
export let gamesRegistry = [];
export let registryMeta = {
    version: "1",
    featured: null
};
export let launcherChangelog = [];

// Actual source of the most recently loaded registry.
// One of 'remote' | 'local' | 'cache' | null.
let registrySource = null;

/**
 * Get the source the registry was actually loaded from.
 * @returns {string|null} 'remote', 'local', 'cache', or null if none
 */
export function getRegistrySource() {
    return registrySource;
}

/**
 * Record the registry source and keep the active base URL in sync with where
 * the registry came from. Online, relative metaUrls resolve against the GitHub
 * registry base. Offline, there is no bundled catalog, so there is no source
 * tree base to resolve against (relative metaUrls are never used offline).
 */
function setRegistrySource(source) {
    registrySource = source;
    if (source === 'remote') {
        setRegistryBaseUrl(REMOTE_REGISTRY_BASE);
    } else {
        setRegistryBaseUrl('');
    }
}

// Per-game metadata cache (lazy-loaded from metaUrl)
const metadataCache = {};

// ==========================================
// INSTALLATION STATE TRACKING
// ==========================================
// Profile-independent tracking of installed games

export let installedGames = {};  // { gameId: { id, version, path, installedAt } }

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
    const entry = installedGames[gameId];
    return entry?.path || entry?.installPath || null;
}

/**
 * Mark a game as installed.
 * @param {string} gameId - Game identifier
 * @param {Object} data - Installation data { id, version, path, installedAt }
 */
export async function markAsInstalled(gameId, data) {
    installedGames[gameId] = data;
    await Storage.setInstalledGame(gameId, data);
    console.log(`GameHub: Marked ${gameId} as installed`);
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
// CACHE HELPERS
// ==========================================

/**
 * Save registry data to cache.
 */
function saveCache(registryData, metadata = {}) {
    try {
        const cache = {
            registry: registryData,
            metadata: metadata,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
        console.log('GameHub: Registry cache saved');
    } catch (error) {
        console.warn('GameHub: Failed to save registry cache:', error.message);
    }
}

/**
 * Load registry data from cache.
 * The cached registry is treated as a persistent offline snapshot: it is
 * considered usable regardless of how old it is. The timestamp is kept only
 * for informational/debugging purposes — it must not determine validity.
 * @returns {Object|null} Cached data or null if missing/unusable
 */
function loadCache() {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;

        const cache = JSON.parse(raw);

        // Informational only — the age never invalidates the offline snapshot.
        const age = Date.now() - (cache.timestamp || 0);
        console.log(`GameHub: Using cached registry (${Math.round(age / 1000)}s old)`);

        return cache;
    } catch (error) {
        console.warn('GameHub: Failed to load registry cache:', error.message);
        return null;
    }
}

/**
 * Validate that metadata has the expected structure.
 * Checks that metadata has channels and at least one channel has download.url.
 * @param {Object} metadata
 * @returns {boolean}
 */
function isValidMetadataCache(metadata) {
    if (!metadata?.channels) return false;

    return Object.values(metadata.channels).some(
        channel => channel.download?.url
    );
}

/**
 * Get the raw cached registry snapshot, if one exists.
 * Used offline to enrich installed-game display metadata (names/covers) from a
 * previous successful online fetch. It is NOT a catalog of downloadable games —
 * offline the catalog is the installed-game storage.
 * @returns {Object|null} Raw cached registry (object map or legacy array), or null
 */
export function getCachedRegistryEntries() {
    const cache = loadCache();
    if (!cache || !cache.registry) return null;
    return cache.registry;
}

/**
 * Get cached metadata for a specific game.
 * @param {string} gameId
 * @returns {Object|null}
 */
function getCachedMetadata(gameId) {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const cache = JSON.parse(raw);
        const metadata = cache.metadata?.[gameId];
        
        if (!metadata) return null;
        
        // Validate metadata structure
        if (!isValidMetadataCache(metadata)) {
            console.log(`GameHub: Ignoring stale metadata cache for ${gameId}`);
            return null;
        }
        
        return metadata;
    } catch {
        return null;
    }
}

/**
 * Save metadata for a specific game to cache.
 */
function saveCachedMetadata(gameId, metadata) {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return;
        const cache = JSON.parse(raw);
        if (!cache.metadata) cache.metadata = {};
        cache.metadata[gameId] = metadata;
        cache.timestamp = Date.now();
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch (error) {
        console.warn(`GameHub: Failed to cache metadata for ${gameId}:`, error.message);
    }
}

// ==========================================
// REGISTRY LOADER
// ==========================================

export async function loadRegistry() {
    let data = null;
    let source = null;
    
    // Try remote registry first if enabled.
    // The remote GitHub registry is the ONLY catalog when online (download-only).
    if (getUseRemoteRegistry()) {
        try {
            const remoteUrl = getRegistryUrl();
            console.log('GameHub: Attempting to load remote registry from:', remoteUrl);
            
            const response = await fetch(remoteUrl);
            
            if (!response.ok) {
                throw new Error(`Remote registry returned status: ${response.status}`);
            }
            
            data = await response.json();
            source = 'remote';
            console.log('GameHub: Successfully loaded registry from remote URL');
        } catch (error) {
            console.warn('GameHub: Failed to load remote registry (offline):', error.message);
            // OFFLINE path — handled below. Game Hub is download-only and ships
            // NO bundled catalog, so there is no local/cached registry fallback
            // for downloadable games.
        }
    } else {
        console.log('GameHub: Remote registry disabled — using installed-game catalog (offline)');
    }
    
    // If the remote registry is unavailable (offline/disabled), leave the
    // catalog empty. The installed-game storage (loaded in loadGameManifests)
    // becomes the catalog here, showing only games the user has installed.
    if (!data) {
        console.log('GameHub: No remote registry available; catalog will be installed games only');
        setRegistrySource('offline');
        gamesRegistry = [];
        registryMeta = { version: "1", featured: null };
        launcherChangelog = [];
        return { gamesRegistry, registryMeta, launcherChangelog };
    }

    // Record the actual source (online) so relative metaUrls resolve against GitHub.
    setRegistrySource(source);

    try {
        // Persist a snapshot of the fresh online registry for offline enrichment.
        if (source === 'remote') {
            saveCache(data);
        }

        // Parse registry data — supports both new and old formats
        const result = parseRegistryData(data);
        
        gamesRegistry = result.gamesRegistry;
        registryMeta = result.registryMeta;
        launcherChangelog = result.launcherChangelog;

        console.log(`GameHub: Registry loaded successfully from ${source} source (${gamesRegistry.length} games, version ${registryMeta.version})`);
        return { gamesRegistry, registryMeta, launcherChangelog };
    } catch (error) {
        console.error('GameHub: Failed to parse registry data:', error);
        // Treat an unusable (online) response like offline: empty catalog with
        // installed games only. Cached snapshots are not a downloadable catalog.
        console.log('GameHub: Falling back to installed-games catalog (offline)');
        setRegistrySource('offline');
        gamesRegistry = [];
        registryMeta = { version: "1", featured: null };
        launcherChangelog = [];
        return { gamesRegistry, registryMeta, launcherChangelog };
    }
}

/**
 * Parse registry data supporting both new and old formats.
 * 
 * New format (game-hub-registry):
 *   { registryVersion: 1, lastUpdated: "...", games: { "game-id": { id, name, metaUrl, ... } } }
 * 
 * Old format (legacy):
 *   { version: "1", featured: "...", launcherChangelog: [...], games: [{ id, name, ... }] }
 */
function parseRegistryData(data) {
    // Store registry metadata
    const meta = {
        version: data.version || String(data.registryVersion || "1"),
        featured: data.featured || null
    };

    // Store launcher changelog (old format only — new registry doesn't have this)
    const changelog = data.launcherChangelog || [];

    // Detect format: new format uses object map, old format uses array
    let gamesList = [];

    if (data.games && !Array.isArray(data.games)) {
        // NEW FORMAT: games is an object map { "game-id": { ... } }
        console.log('GameHub: Detected new registry format (object map)');
        for (const [gameId, entry] of Object.entries(data.games)) {
            gamesList.push({
                id: entry.id || gameId,
                name: entry.name || gameId,
                developer: entry.developer || '',
                genre: entry.genre || '',
                featured: entry.featured || false,
                thumbnail: entry.thumbnail || '',
                metaUrl: entry.metaUrl || null,
                source: 'download',
                package: { available: false, url: null, size: null, checksum: null, format: null }
            });
        }
    } else if (data.games && Array.isArray(data.games)) {
        // OLD FORMAT: games is an array
        console.log('GameHub: Detected old registry format (array)');
        gamesList = data.games.map(game => ({
            id: game.id,
            version: game.version || null,
            featured: game.featured || false,
            description: game.description || '',
            thumbnail: game.thumbnail || '',
            name: game.name || game.id,
            // Migrate old bundled entries to download source
            source: 'download',
            package: game.package || { available: false, url: null, size: null, checksum: null, format: null },
            // Old format entries may also have metaUrl if partially migrated
            metaUrl: game.metaUrl || null,
            developer: game.developer || '',
            genre: game.genre || ''
        }));
    } else {
        throw new Error('Invalid registry format: missing games field');
    }

    return {
        gamesRegistry: gamesList,
        registryMeta: meta,
        launcherChangelog: changelog
    };
}

// ==========================================
// METADATA LOADER (Lazy)
// ==========================================

/**
 * Load metadata for a specific game from its metaUrl.
 * Results are cached in memory and localStorage.
 * 
 * @param {string} gameId - Game identifier
 * @returns {Object|null} Game metadata or null if unavailable
 */
export async function loadGameMetadata(gameId) {
    // Check in-memory cache first
    if (metadataCache[gameId]) {
        return metadataCache[gameId];
    }

    // Find the registry entry
    const entry = gamesRegistry.find(g => g.id === gameId);
    if (!entry) {
        console.warn(`GameHub: No registry entry for ${gameId}`);
        return null;
    }

    // If no metaUrl, no metadata available
    if (!entry.metaUrl) {
        return null;
    }

    // Resolve metaUrl — could be relative or absolute.
    // This runs BEFORE the cache lookup so entry.metaUrl is always a valid,
    // resolvable location (https when online) even when the metadata itself is
    // satisfied from cache. Without this, relative media paths (cover.png,
    // achievements.json) would be resolved against a raw relative metaUrl.
    let metaUrl = entry.metaUrl;
    if (!metaUrl.startsWith('http://') && !metaUrl.startsWith('https://')) {
        // Relative URL — resolve against the registry base, which reflects the
        // actual source (the GitHub registry when online).
        const base = getRegistryBaseUrl();
        metaUrl = base + metaUrl;
    }

    // Store the resolved absolute URL on the entry so it can be used
    // as the base for resolving relative media URLs (e.g., cover.png
    // resolves against the metadata file's URL, not the registry root).
    entry.metaUrl = metaUrl;

    // Check localStorage cache
    const cached = getCachedMetadata(gameId);
    if (cached) {
        metadataCache[gameId] = cached;
        return cached;
    }

    try {
        console.log(`GameHub: Loading metadata for ${gameId} from ${metaUrl}`);
        const response = await fetch(metaUrl);
        if (!response.ok) {
            throw new Error(`Metadata fetch returned status: ${response.status}`);
        }
        const metadata = await response.json();
        
        // Cache it
        metadataCache[gameId] = metadata;
        saveCachedMetadata(gameId, metadata);
        
        return metadata;
    } catch (error) {
        console.warn(`GameHub: Failed to load metadata for ${gameId}:`, error.message);
        return null;
    }
}

/**
 * Get cached metadata for a game without fetching.
 * @param {string} gameId
 * @returns {Object|null}
 */
export function getCachedGameMetadata(gameId) {
    return metadataCache[gameId] || null;
}

// ==========================================
// CHANNEL CONFIGURATION
// ==========================================

export const CHANNEL_CONFIG = {
    stable: { label: "Stable", color: "text-green-400", bg: "bg-green-900/30" },
    beta: { label: "Beta", color: "text-amber-400", bg: "bg-amber-900/30" },
    alpha: { label: "Alpha", color: "text-blue-400", bg: "bg-blue-900/30" },
    demo: { label: "Demo", color: "text-purple-400", bg: "bg-purple-900/30" },
    development: { label: "Development", color: "text-cyan-400", bg: "bg-cyan-900/30" }
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

/**
 * Get all available channels for a game.
 * Supports both new format (channels) and old format (releases).
 */
export function getAvailableChannels(game) {
    // New format: channels object
    if (game.channels) {
        return Object.keys(game.channels);
    }
    // Old format: releases object
    if (game.releases) {
        return Object.keys(game.releases);
    }
    // Backwards compatibility: single changelog = stable channel
    if (game.changelog && game.changelog.length > 0) {
        return ['stable'];
    }
    return ['stable'];
}

/**
 * Get the version for a specific channel.
 * Supports both new format (channels) and old format (releases).
 */
export function getChannelVersion(game, channel) {
    // New format: channels[channel].version
    if (game.channels && game.channels[channel]) {
        return game.channels[channel].version;
    }
    // Old format: releases[channel].version
    if (game.releases && game.releases[channel]) {
        return game.releases[channel].version;
    }
    // Backwards compatibility: return game.version for stable
    if (channel === 'stable') {
        return game.version;
    }
    return null;
}

/**
 * Get changelog for a specific channel.
 * Supports both new format (channels with releaseNotes) and old format (releases with changelog).
 */
export function getChannelChangelog(game, channel) {
    // New format: channels[channel].releaseNotes as a single entry, plus changelog array filtered by channel
    if (game.channels && game.channels[channel]) {
        const channelData = game.channels[channel];
        const entries = [];
        
        // Add releaseNotes as a changelog entry if present
        if (channelData.releaseNotes) {
            entries.push({
                version: channelData.releaseNotes.version || channelData.version,
                date: channelData.releaseNotes.date || channelData.releaseDate,
                changes: channelData.releaseNotes.changes || []
            });
        }
        
        // Also include entries from the global changelog that match this channel
        if (game.changelog && Array.isArray(game.changelog)) {
            const channelEntries = game.changelog
                .filter(entry => entry.channel === channel || !entry.channel)
                .map(entry => ({
                    version: entry.version,
                    date: entry.date,
                    changes: entry.changes || []
                }));
            entries.push(...channelEntries);
        }
        
        return entries;
    }
    
    // Old format: releases[channel].changelog
    if (game.releases && game.releases[channel]) {
        return game.releases[channel].changelog || [];
    }
    
    // Backwards compatibility: return game.changelog for stable
    if (channel === 'stable' && game.changelog) {
        return game.changelog;
    }
    return [];
}

/**
 * Get the latest changelog entry for a specific channel.
 */
export function getLatestChannelEntry(game, channel) {
    const changelog = getChannelChangelog(game, channel);
    if (changelog.length === 0) return null;
    return changelog.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
}

/**
 * Get the latest changelog entry for a game (for backwards compatibility).
 */
export function getLatestChangelogEntry(game) {
    // If game has channels, get the latest from stable
    if (game.channels) {
        const stableChangelog = getChannelChangelog(game, 'stable');
        if (stableChangelog.length > 0) {
            return stableChangelog.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        }
    }
    // If game has releases, get the latest from stable
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

/**
 * Get the latest changelog entry for a game by ID.
 */
export function getLatestChangelogEntryByGameId(gameId, games = []) {
    const game = games.find(g => g.id === gameId);
    if (!game) return null;
    return getLatestChangelogEntry(game);
}

/**
 * Check if a game has new updates the user hasn't seen (for a specific channel).
 */
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

/**
 * Mark updates as seen for a game (for a specific channel).
 */
export async function markUpdatesAsSeen(gameId, Storage, channel = null) {
    const targetChannel = channel || await getActiveChannel(gameId, Storage);
    const latest = getLatestChannelEntryByGameId(gameId, targetChannel);
    if (latest) {
        await Storage.setUpdateHistory(gameId, latest.version, targetChannel);
    }
}

/**
 * Get the latest changelog entry for a game by ID and channel.
 */
export function getLatestChannelEntryByGameId(gameId, channel, games = []) {
    const game = games.find(g => g.id === gameId);
    if (!game) return null;
    return getLatestChannelEntry(game, channel);
}

/**
 * Get all games with new updates, sorted by date (newest first).
 */
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
// ==========================================
// GAME HUB - MAIN APPLICATION MODULE
// ==========================================
// Thin entry point that wires all modules together

import { Storage } from './storage.js';
import { getGames, loadGameManifests, getAllGamesWithPlayData, getRecentlyPlayed, getGameWithPlayData, markUpdatesAsSeen, getChannelChangelog, getFeaturedGameId, refreshInstalledGames } from './games/loader.js';
import { initialize as initAchievements, achievements, getAchievementDefinitions, addGameAchievements, isAchievementsEnabled, RARITY_CONFIG } from './systems/achievements/manager.js';
import { navigateTo, getCurrentView as getRouterCurrentView } from './core/router.js';
import { GameHub } from './core/events.js';
import { formatDate, formatLastPlayed, getChannelBadge, getRarityBadge, getRarityBg, resolveCoverUrl, resolveGameUrl } from './utils.js';
import { showError, showSuccess } from './ui/components/notification.js';
import { CHANNEL_CONFIG } from './games/registry.js';

// Re-export games for backward compatibility
const games = getGames();

// ==========================================
// APPLICATION STATE
// ==========================================

let currentView = 'home';
let previousView = 'home';
let pendingBetaUrl = null;
let currentSearchTerm = '';
let currentLibraryFilter = 'all';
let currentDetailGameId = null;

// ==========================================
// DOWNLOAD STATE
// ==========================================

const downloadStates = new Map(); // gameId -> { downloadId, status, percentage, bytes, total }
let downloadCleanup = null;
let downloadModalGameId = null; // Tracks which game's download is shown in the modal
let downloadModalGameDef = null; // The game definition for the current modal (used for retry/launch)

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Step 1: Check if migration from old localStorage format is needed
        await checkAndMigrate();

        // Step 2: Load game manifests from registry and installed games from storage
        // loadGameManifests() handles both registry loading and installed games loading
        await loadGameManifests();

        // Step 3: Initialize achievements system
        initAchievements();

        // Step 4: Set up event listeners and download listener
        setupEventListeners();
        setupDownloadListener();

        // Step 5: Make GameHub available on window (needed for bridge queue processing)
        window.GameHub = GameHub;

        // Step 6: Drain any events queued by games during their session
        await drainBridgeQueue();

        // Step 7: Render initial views
        await renderHome();
        await renderLibrary();
        updateGameCount();

        console.log('GameHub: initialization complete');
        window.__gameHubInitialized = true;
    } catch (error) {
        console.error('GameHub: initialization failed', error);
    }
});

// ==========================================
// MIGRATION
// ==========================================

async function checkAndMigrate() {
    try {
        // Check if migration has already been done
        const lastMigration = await window.storage.get('metadata.lastMigration');
        
        if (lastMigration) {
            // Migration already completed
            return;
        }

        // Check if old localStorage data exists
        const oldDataRaw = localStorage.getItem('gamehub_data');
        if (!oldDataRaw) {
            // No old data to migrate, just set migration flag
            await window.storage.set('metadata.lastMigration', Date.now());
            await window.storage.set('metadata.version', 1);
            return;
        }

        // Parse old data
        const oldData = JSON.parse(oldDataRaw);

        // Perform migration using the IPC handler
        const result = await window.storage.migrate({
            settings: oldData.settings || {},
            achievements: oldData.achievements || {},
            games: oldData.games || {},
            gameUpdateHistory: oldData.gameUpdateHistory || {}
        });

        if (result) {
            console.log('GameHub: migration from localStorage completed successfully');
            // Clear old localStorage data
            localStorage.removeItem('gamehub_data');
        }
    } catch (e) {
        console.warn('GameHub: migration failed', e);
        // Don't block app startup if migration fails
    }
}

// ==========================================
// EVENT LISTENERS
// ==========================================

function setupEventListeners() {
    const backBtn = document.getElementById('detailsBackBtn');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            navigateTo('library');
        });
    }
}

// ==========================================
// BRIDGE QUEUE
// ==========================================

const BRIDGE_QUEUE_KEY = 'game-hub-event-queue';

async function drainBridgeQueue() {
    try {
        const raw = localStorage.getItem(BRIDGE_QUEUE_KEY);
        if (!raw) return;
        const queue = JSON.parse(raw);
        if (!Array.isArray(queue) || queue.length === 0) return;
        
        // Process each event with async iteration
        for (const event of queue) {
            if (typeof window.GameHub?.handleEvent === 'function') {
                try {
                    await window.GameHub.handleEvent(event);
                } catch (e) {
                    console.warn('GameHub: error processing bridge event', e);
                }
            }
        }
        
        // Clear the queue after processing
        localStorage.removeItem(BRIDGE_QUEUE_KEY);
    } catch (e) {
        console.warn('GameHub: error draining bridge queue', e);
        localStorage.removeItem(BRIDGE_QUEUE_KEY);
    }
}

// ==========================================
// RENDERING
// ==========================================

async function renderHome() {
    const allWithData = await getAllGamesWithPlayData(Storage);
    const recent = await getRecentlyPlayed(Storage);
    const favs = allWithData.filter(g => g.favorite);
    
    // Featured Banner — use the registry's designated featured game
    const featuredGameId = getFeaturedGameId();
    let featured;
    if (featuredGameId) {
        featured = allWithData.find(g => g.id === featuredGameId) || recent[0] || allWithData[0];
    } else {
        featured = recent[0] || allWithData[0];
    }
    const featuredContainer = document.getElementById('featuredBanner');
    if (featured && featuredContainer) {
        const playAction = featured.actions.find(a => a.type === 'play');
        const playUrl = playAction ? resolveGameUrl(featured, playAction.url) : '#';
        
        featuredContainer.innerHTML = `
            <div class="relative h-56 md:h-72 ${featured.theme.bg}">
                <img src="${resolveCoverUrl(featured)}" alt="${featured.title}" class="featured-img absolute inset-0 w-full h-full object-cover opacity-60">
                <div class="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/70 to-transparent z-10"></div>
                <div class="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent z-10"></div>
                <div class="relative z-20 h-full flex flex-col justify-end p-8">
                    <div class="text-[10px] uppercase tracking-widest font-bold text-blue-400 mb-2">Featured</div>
                    <h2 class="text-3xl md:text-4xl font-extrabold text-white mb-2">${featured.title}</h2>
                    <p class="text-gray-300 text-sm max-w-lg mb-5 line-clamp-2">${featured.description}</p>
                    <div class="flex gap-3">
                        <button onclick="launchGame('${featured.id}', '${playUrl}')" class="btn-action btn-play">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                            Play Now
                        </button>
                        <button onclick="showDetails('${featured.id}')" class="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2.5 px-6 rounded-lg transition-colors duration-200 text-sm btn-press">
                            View Details
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Recently Played
    const recentContainer = document.getElementById('recentlyPlayedRow');
    if (recentContainer) {
        recentContainer.innerHTML = '';
        if (recent.length === 0) {
            recentContainer.innerHTML = '<p class="text-gray-600 text-sm col-span-3">No games played yet. Launch a game to start tracking!</p>';
        } else {
            recent.forEach((game, index) => {
                const installedIndicator = game.installed
                    ? '<span class="installed-badge" style="font-size:8px;padding:0 0.375rem;">✓</span>'
                    : '';
                const updateIndicator = game.updateAvailable
                    ? '<span class="text-amber-500" style="font-size:10px;font-weight:700;">⬆</span>'
                    : '';
                const card = document.createElement('div');
                card.className = `bg-gray-800 rounded-xl overflow-hidden border border-gray-700 game-card cursor-pointer group flex gap-4 p-4 card-animate ${game.theme.borderHover}`;
                card.style.animationDelay = `${index * 80}ms`;
                card.onclick = () => showDetails(game.id);
                card.innerHTML = `
                    <div class="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 ${game.theme.bg} relative flex items-center justify-center">
                        <span class="absolute ${game.theme.text} font-bold text-[10px] uppercase select-none z-0">${game.title.substring(0, 2)}</span>
                        <img src="${resolveCoverUrl(game)}" alt="${game.title}" class="absolute inset-0 w-full h-full object-cover z-10" onerror="this.style.opacity='0';">
                    </div>
                    <div class="flex flex-col justify-center min-w-0">
                        <h4 class="text-white font-bold text-sm truncate flex items-center gap-1.5">${installedIndicator} ${updateIndicator} ${game.title}</h4>
                        <p class="text-gray-500 text-xs mt-0.5">${formatLastPlayed(game.lastPlayed)}</p>
                        <p class="text-gray-600 text-[11px] mt-0.5">${game.playCount} session${game.playCount !== 1 ? 's' : ''}</p>
                    </div>
                `;
                recentContainer.appendChild(card);
            });
        }
    }

    // Overview Stats
    const statTotalGames = document.getElementById('statTotalGames');
    const statTotalPlays = document.getElementById('statTotalPlays');
    const statAchievements = document.getElementById('statAchievements');
    
    if (statTotalGames) statTotalGames.textContent = games.length;
    if (statTotalPlays) {
        const totalPlays = allWithData.reduce((sum, g) => sum + (g.playCount || 0), 0);
        statTotalPlays.textContent = totalPlays || '—';
    }
    if (statAchievements) {
        const loadedData = await Storage.load();
        const storedAchievements = loadedData.achievements || {};
        let totalAchievements = 0;
        for (const gameId in storedAchievements) {
            totalAchievements += Object.keys(storedAchievements[gameId]).length;
        }
        statAchievements.textContent = totalAchievements > 0 ? totalAchievements : '—';
    }
}

// ==========================================
// RENDER MUTEX
// ==========================================
// Serializes concurrent renderLibrary() calls so that only one render
// executes at a time. If a render is requested while another is in
// progress, the request is queued with the latest filter term. When the
// current render finishes, the queued request runs with the most recent
// state — ensuring no duplicate DOM cards and no dropped updates.
//
// This is necessary because updateGameUI() is called without await from
// download progress callbacks, which can fire multiple concurrent
// renderLibrary() calls that would otherwise race and produce duplicates.

let _renderInProgress = false;
let _pendingRender = false;
let _pendingFilterTerm = '';

async function renderLibrary(filterTerm = '') {
    // If a render is already in flight, queue the latest request.
    // The _pendingFilterTerm is overwritten so only the most recent
    // filter term is retained — stale intermediate renders collapse.
    if (_renderInProgress) {
        _pendingRender = true;
        _pendingFilterTerm = filterTerm;
        return;
    }

    _renderInProgress = true;
    _pendingRender = false;

    try {
        const grid = document.getElementById('gamesGrid');
        const noResults = document.getElementById('noResults');
        if (!grid || !noResults) return;

        grid.innerHTML = '';

        const allWithData = await getAllGamesWithPlayData(Storage);

        // Apply installation filter first
        let filtered = allWithData;
        if (currentLibraryFilter === 'installed') {
            filtered = filtered.filter(g => g.installed);
        } else if (currentLibraryFilter === 'not_installed') {
            filtered = filtered.filter(g => !g.installed);
        }

        // Then apply search term filter
        if (filterTerm) {
            filtered = filtered.filter(g => g.title.toLowerCase().includes(filterTerm.toLowerCase()));
        }

        if (filtered.length === 0) {
            noResults.classList.remove('hidden');
            return;
        }
        noResults.classList.add('hidden');

        filtered.forEach((game, index) => {
            const favBadge = game.favorite ? '<span class="text-yellow-400 text-xs">⭐</span>' : '';
            const updateBadge = game.updateAvailable
                ? '<span class="update-badge">⬆ Update Available</span>'
                : '';
            const installedBadge = game.installed
                ? '<span class="installed-badge">✓ Installed</span>'
                : '<span class="not-installed-badge">Not Installed</span>';
            const card = document.createElement('div');
            card.className = `bg-gray-800 rounded-2xl overflow-hidden shadow-lg border border-gray-700 game-card ${game.theme.borderHover} group flex flex-col cursor-pointer card-animate`;
            card.style.animationDelay = `${index * 60}ms`;
            card.onclick = () => showDetails(game.id);

            card.innerHTML = `
                <div class="w-full h-48 ${game.theme.bg} relative overflow-hidden flex items-center justify-center">
                    <span class="absolute ${game.theme.text} font-bold tracking-wider text-lg uppercase select-none text-center px-4 z-0">${game.title}</span>
                    <img src="${resolveCoverUrl(game)}" alt="${game.title}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 z-10" onerror="this.style.opacity='0';">
                </div>
                <div class="p-5 flex flex-col flex-grow justify-between">
                    <div>
                        <div class="flex items-center justify-between mb-1.5">
                            <h2 class="text-xl font-bold text-white flex items-center gap-1.5">${favBadge} ${game.title}</h2>
                            <div class="flex items-center gap-2">
                                ${installedBadge}
                                ${updateBadge}
                                <span class="text-[11px] text-gray-500 font-medium bg-gray-700/50 px-2 py-0.5 rounded">${game.genre}</span>
                            </div>
                        </div>
                        <p class="text-gray-400 text-xs leading-relaxed mb-5 line-clamp-2">${game.description}</p>
                    </div>
                    <div class="mt-auto ${game.theme.linkText} ${game.theme.linkHover} text-sm font-bold flex items-center gap-1 transition-colors">
                        View Details
                        <svg class="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    } finally {
        _renderInProgress = false;

        // If a render was queued while we were busy, run it now with the
        // latest filter term. This ensures the UI always reflects the most
        // recent state without dropping legitimate updates.
        if (_pendingRender) {
            _pendingRender = false;
            await renderLibrary(_pendingFilterTerm);
        }
    }
}

/**
 * Set the library filter and re-render.
 * @param {string} filter - 'all', 'installed', or 'not_installed'
 */
function setLibraryFilter(filter) {
    currentLibraryFilter = filter;

    // Update active pill styling
    document.getElementById('filterAll')?.classList.toggle('active', filter === 'all');
    document.getElementById('filterInstalled')?.classList.toggle('active', filter === 'installed');
    document.getElementById('filterNotInstalled')?.classList.toggle('active', filter === 'not_installed');

    // Re-render with current search term
    renderLibrary(currentSearchTerm);
}

function updateGameCount() {
    const countDisplay = document.getElementById('gameCountDisplay');
    if (countDisplay) {
        countDisplay.textContent = `${games.length} Games Available`;
    }
}

// ==========================================
// GAME ACTIONS
// ==========================================

async function launchGame(gameId, url) {
    const pd = await Storage.getGameData(gameId);
    await Storage.setGameData(gameId, {
        lastPlayed: new Date().toISOString().split('T')[0],
        playCount: (pd.playCount || 0) + 1
    });
    await checkAchievements();

    // Pass the active profile ID to the game via URL query parameter
    let profileId = 'default';
    try {
        if (window.profiles && typeof window.profiles.get === 'function') {
            const activeProfile = await window.profiles.get();
            if (activeProfile && activeProfile.id) {
                profileId = activeProfile.id;
            }
        }
    } catch (e) {
        // window.profiles may not be available
    }

    const separator = url.includes('?') ? '&' : '?';
    window.location.href = `${url}${separator}profile=${encodeURIComponent(profileId)}`;
}

async function showDetails(gameId) {
    console.log("[DEBUG] app.js showDetails called for:", gameId);
    const gameDef = games.find(g => g.id === gameId);
    if (!gameDef) return;

    const game = await getGameWithPlayData(gameDef, Storage);
    currentDetailGameId = gameId;
    
    // Mark updates as seen when viewing game details
    await markUpdatesAsSeen(gameId, Storage);

    document.getElementById('detailsTitle').textContent = game.title;
    document.getElementById('detailsDescription').textContent = game.description;

    document.getElementById('detailsBannerBg').src = resolveCoverUrl(game);
    document.getElementById('detailsBannerImg').src = resolveCoverUrl(game);

    const bannerContainer = document.getElementById('detailsBannerContainer');
    bannerContainer.className = `w-full h-64 md:h-80 relative overflow-hidden flex items-center justify-center ${game.theme.bg}`;

    // Build metadata
    const metaContainer = document.getElementById('detailsMeta');
    if (metaContainer) {
        const activeChannel = game.activeChannel || 'stable';
        const channelVersion = game.channelVersion || game.version;
        const items = [
            { icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4', label: game.developer },
            { icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z', label: `v${channelVersion}` },
            { icon: 'M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z', label: game.genre }
        ];
        metaContainer.innerHTML = items.map((item, i) => `
            ${i > 0 ? '<span class="text-gray-600">&bull;</span>' : ''}
            <span class="flex items-center gap-1.5">
                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${item.icon}"></path></svg>
                ${item.label}
            </span>
        `).join('');
    }

    // Build sidebar installation info and actions
    updateDetailsSidebar(game);
    await updateDetailsActions(game);

    // Build achievements section
    await buildDetailsAchievements(game.id);

    // Build changelog
    const changelogContainer = document.getElementById('detailsChangelog');
    if (changelogContainer) {
        const activeChannel = game.activeChannel || 'stable';
        const changelog = getChannelChangelog(game, activeChannel);

        if (changelog.length === 0) {
            changelogContainer.innerHTML = '<p class="text-gray-500 text-xs italic">No changelog entries available.</p>';
        } else {
            const sortedChangelog = [...changelog].sort((a, b) => new Date(b.date) - new Date(a.date));
            let html = '';
            sortedChangelog.forEach(entry => {
                const formattedDate = formatDate(entry.date);
                const channelBadge = getChannelBadge(activeChannel, CHANNEL_CONFIG);
                html += `
                    <div class="border-b border-gray-700/50 last:border-b-0 pb-3 mb-3 last:pb-0 last:mb-0">
                        <div class="flex items-center justify-between mb-1">
                            <span class="text-white font-bold text-sm">${entry.version}</span>
                            ${channelBadge}
                        </div>
                        <div class="text-gray-500 text-[11px] mb-2">${formattedDate}</div>
                        <ul class="space-y-1">
                `;
                entry.changes.forEach(change => {
                    html += `<li class="text-gray-400 text-xs flex items-start gap-1"><span class="text-green-400 flex-shrink-0">✓</span> <span>${change}</span></li>`;
                });
                html += '</ul></div>';
            });
            changelogContainer.innerHTML = html;
        }
    }

    navigateTo('details');
}

// ==========================================
// DOWNLOAD INTEGRATION
// ==========================================

/**
 * Set up the download progress listener.
 * Listens for progress events from the main process and updates the UI.
 */
function setupDownloadListener() {
    if (typeof window.downloader?.onProgress !== 'function') {
        console.warn('GameHub: window.downloader.onProgress not available');
        return;
    }

    // Store cleanup function
    downloadCleanup = window.downloader.onProgress((data) => {
        const { gameId, status, percentage, bytes, total, downloadId, error } = data;

        if (!gameId) return;

        if (status === 'completed') {
            // Download complete — refresh installed games cache and re-render
            downloadStates.delete(gameId);
            refreshInstalledGames().then(() => {
                // Show completed state in modal
                showDownloadCompleted(gameId);
                // Update all UI views
                updateGameUI(gameId);
            });
        } else if (status === 'error' || status === 'failed') {
            console.error(`GameHub: Download failed for ${gameId}:`, error);
            downloadStates.delete(gameId);
            // Show error state in modal
            showDownloadError(gameId, error || 'An unknown error occurred');
            updateGameUI(gameId);
        } else if (status === 'cancelled') {
            downloadStates.delete(gameId);
            // Close modal and restore UI
            closeDownloadModal();
            updateGameUI(gameId);
        } else {
            // Update progress
            downloadStates.set(gameId, {
                downloadId,
                status,
                percentage: percentage || 0,
                bytes: bytes || 0,
                total: total || 0
            });
            // Update the modal live
            updateDownloadModal(gameId);
            updateGameUI(gameId);
        }
    });
}

/**
 * Update the UI for a specific game after download state changes.
 * Refreshes the details view (if visible) and library/home cards.
 */
async function updateGameUI(gameId) {
    // Use the router's current view to determine if we're on the details page
    const routerCurrentView = getRouterCurrentView();
    // If the details view is showing this game, refresh the actions
    if (routerCurrentView === 'details' && currentDetailGameId === gameId) {
        const gameDef = games.find(g => g.id === gameId);
        if (gameDef) {
            const game = await getGameWithPlayData(gameDef, Storage);
            await updateDetailsActions(game);
            updateDetailsSidebar(game);
        }
    }
    // Refresh library and home so cards reflect new state
    await renderLibrary(currentSearchTerm);
    await renderHome();
}

/**
 * Start installing (downloading) a game.
 * @param {string} gameId - Game identifier
 */
async function installGame(gameId) {
    // Prevent duplicate downloads
    if (downloadStates.has(gameId)) {
        console.log(`GameHub: Download already in progress for ${gameId}`);
        return;
    }

    const gameDef = games.find(g => g.id === gameId);
    if (!gameDef) {
        console.error(`GameHub: No game definition found for ${gameId}`);
        return;
    }

    // Get the active channel and its download metadata
    const activeChannel = gameDef.activeChannel || 'stable';
    const channelData = gameDef.channels?.[activeChannel];

    if (!channelData?.download?.url) {
        console.error(`GameHub: No download URL for ${gameId} channel ${activeChannel}`);
        return;
    }

    const metadata = {
        version: channelData.version || gameDef.version || '1.0.0',
        channel: activeChannel,
        download: {
            url: channelData.download.url,
            checksum: channelData.download.checksum || null
        }
    };

    try {
        const result = await window.downloader.start(gameId, metadata);
        if (result && result.downloadId) {
            downloadStates.set(gameId, {
                downloadId: result.downloadId,
                status: 'pending',
                percentage: 0,
                bytes: 0,
                total: 0
            });
            // Open the download progress modal
            openDownloadModal(gameId);
            updateGameUI(gameId);
        }
    } catch (err) {
        console.error(`GameHub: Failed to start download for ${gameId}:`, err);
        downloadStates.delete(gameId);
        // Show error in modal if it was open, otherwise update UI
        showDownloadError(gameId, err.message || 'Failed to start download');
        updateGameUI(gameId);
    }
}

/**
 * Cancel an ongoing download.
 * @param {string} gameId - Game identifier
 */
async function cancelDownload(gameId) {
    const dl = downloadStates.get(gameId);
    if (!dl?.downloadId) return;

    try {
        await window.downloader.cancel(dl.downloadId);
    } catch (err) {
        console.error(`GameHub: Failed to cancel download for ${gameId}:`, err);
    }

    downloadStates.delete(gameId);
    updateGameUI(gameId);
}

/**
 * Determine the action state for a game.
 * @param {Object} game - Game object with play data
 * @returns {string} 'play' | 'install' | 'update' | 'downloading'
 */
function getGameActionState(game) {
    // Check if currently downloading
    const dl = downloadStates.get(game.id);
    if (dl && (dl.status === 'downloading' || dl.status === 'verifying' || dl.status === 'installing' || dl.status === 'pending')) {
        return 'downloading';
    }

    // Not installed
    if (!game.installed) {
        return 'install';
    }

    // Update available (derived in loader.js getGameWithPlayData)
    if (game.updateAvailable) {
        return 'update';
    }

    // Installed and up to date
    return 'play';
}

/**
 * Update just the actions section in the details view.
 * Used for live progress updates during download.
 */
async function updateDetailsActions(game) {
    const actionsContainer = document.getElementById('detailsActions');
    if (!actionsContainer) return;

    const state = getGameActionState(game);
    const dl = downloadStates.get(game.id);

    // Get favorite state first to avoid race condition
    const gameData = await Storage.getGameData(game.id);
    const fav = gameData.favorite || false;

    let html = '';

    if (state === 'downloading' && dl) {
        // Show progress bar during download
        const pct = dl.percentage || 0;
        const sizeText = (dl.bytes > 0 && dl.total > 0)
            ? `${formatBytes(dl.bytes)} / ${formatBytes(dl.total)}`
            : '';
        const statusLabel = dl.status === 'verifying' ? 'Verifying...'
            : dl.status === 'installing' ? 'Installing...'
            : 'Downloading...';

        html = `
            <div class="w-full max-w-md">
                <div class="flex items-center justify-between mb-1.5">
                    <span class="text-sm font-medium text-gray-300">${statusLabel}</span>
                    <span class="text-xs font-mono text-gray-400">${pct}%</span>
                </div>
                <div class="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
                    <div class="bg-blue-500 h-2.5 rounded-full transition-all duration-200" style="width: ${pct}%"></div>
                </div>
                ${sizeText ? `<div class="text-xs text-gray-500 mt-1">${sizeText}</div>` : ''}
                <button onclick="cancelDownload('${game.id}')" class="mt-3 text-xs bg-red-900/30 text-red-400 hover:bg-red-900/50 px-3 py-1.5 rounded-lg font-bold transition-colors btn-press">
                    Cancel
                </button>
            </div>
        `;
    } else if (state === 'install') {
        html = `
            <button onclick="installGame('${game.id}')" class="btn-action btn-download">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                Download
            </button>
        `;
    } else if (state === 'update') {
        html = `
            <button onclick="installGame('${game.id}')" class="btn-action btn-update">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                Update
            </button>
        `;
    } else if (state === 'play') {
        // Show the play button for installed games
        // Downloaded games may not have actions defined — inject a default if missing
        if (!game.actions.some(a => a.type === 'play')) {
            game.actions.push({ type: 'play', label: 'Play', url: 'index.html' });
        }
        game.actions.forEach(action => {
            if (action.type === 'play') {
                const playUrl = resolveGameUrl(game, action.url);
                html += `
                    <button onclick="launchGame('${game.id}', '${playUrl}')" class="btn-action btn-play">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        Play
                    </button>
                `;
            }
        });

        // Add uninstall button for installed games
        html += `
            <button onclick="openUninstallModal('${game.id}')" class="btn-action btn-danger">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                Uninstall
            </button>
        `;
    }

    // Always add favorite button
    html += `
        <button id="favToggleBtn" class="fav-btn ${fav ? 'favorited' : ''}" onclick="toggleFavorite('${game.id}')">
            <svg class="w-5 h-5 star-icon" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
            </svg>
            ${fav ? 'Favorited' : 'Favorite'}
        </button>
    `;

    actionsContainer.innerHTML = html;
}

/**
 * Build the achievements section in the details view.
 * Shows a compact summary of the game's achievements with unlock progress.
 * @param {string} gameId - Game identifier
 */
async function buildDetailsAchievements(gameId) {
    const container = document.getElementById('detailsAchievements');
    if (!container) return;

    const header = container.previousElementSibling;

    if (!isAchievementsEnabled(gameId)) {
        if (header && header.tagName === 'H3') header.style.display = 'none';
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    if (header && header.tagName === 'H3') header.style.display = '';
    container.style.display = '';

    const defs = getAchievementDefinitions(gameId);
    const unlockedData = await Storage.getAchievements(gameId);

    const defsArray = Object.values(defs);
    if (defsArray.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-xs italic">No achievements defined for this game yet.</p>';
        return;
    }

    const unlockedCount = Object.keys(unlockedData).length;
    const totalCount = defsArray.length;
    const pct = totalCount > 0 ? Math.round((unlockedCount / totalCount) * 100) : 0;

    let html = `
        <div class="flex items-center justify-between mb-3">
            <span class="text-gray-400 text-xs font-medium">${unlockedCount} / ${totalCount} unlocked</span>
            <span class="text-gray-500 text-[10px] font-mono">${pct}%</span>
        </div>
        <div class="w-full bg-gray-700 rounded-full h-1.5 mb-3">
            <div class="bg-blue-500 h-1.5 rounded-full transition-all" style="width: ${pct}%"></div>
        </div>
    `;

    // Show first 3 achievements as compact items
    const shown = defsArray.slice(0, 3);
    shown.forEach(ach => {
        const isUnlocked = !!unlockedData[ach.id];
        html += `
            <div class="flex items-center gap-2 py-1 ${isUnlocked ? '' : 'opacity-50'}">
                <span class="text-sm">${ach.icon}</span>
                <span class="text-xs text-gray-400 truncate flex-grow">${ach.title}</span>
                <span class="text-[10px] ${isUnlocked ? 'text-green-400' : 'text-gray-600'}">${isUnlocked ? '✅' : '🔒'}</span>
            </div>
        `;
    });

    if (defsArray.length > 3) {
        html += `<div class="text-[10px] text-gray-600 mt-1">+${defsArray.length - 3} more</div>`;
    }

    container.innerHTML = html;
}

/**
 * Update the sidebar installation info section in the details view.
 */
function updateDetailsSidebar(game) {
    const sidebar = document.getElementById('detailsSidebar');
    if (!sidebar) return;

    const installedStatus = game.installed
        ? '<span class="installed-badge">✓ Installed</span>'
        : '<span class="not-installed-badge">Not Installed</span>';

    const sourceLabel = game.installed ? 'Downloaded' : '—';

    const installedDate = game.installedAt ? formatDate(game.installedAt) : '—';

    const installedVersion = game.installed ? (game.installedVersion || '—') : '—';
    const availableVersion = game.installed ? (game.channelVersion || game.version || '—') : '—';

    const updateStatusRow = game.updateAvailable
        ? `<div class="details-info-row">
                <span class="details-info-label">Update Available</span>
                <span class="details-info-value text-amber-500">Yes</span>
            </div>`
        : '';

    sidebar.innerHTML = `
        <div>
            <div class="details-section-title">Installation</div>
            <div class="space-y-0">
                <div class="details-info-row">
                    <span class="details-info-label">Status</span>
                    <span class="details-info-value">${installedStatus}</span>
                </div>
                <div class="details-info-row">
                    <span class="details-info-label">Source</span>
                    <span class="details-info-value">${sourceLabel}</span>
                </div>
                <div class="details-info-row">
                    <span class="details-info-label">Installed</span>
                    <span class="details-info-value">${installedDate}</span>
                </div>
                <div class="details-info-row">
                    <span class="details-info-label">Installed Version</span>
                    <span class="details-info-value">${installedVersion}</span>
                </div>
                <div class="details-info-row">
                    <span class="details-info-label">Available Version</span>
                    <span class="details-info-value">${availableVersion}</span>
                </div>
                ${updateStatusRow}
            </div>
        </div>
    `;
}

/**
 * Format bytes to a human-readable string.
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const val = bytes / Math.pow(1024, i);
    return `${val.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

// ==========================================
// FAVORITES
// ==========================================

async function toggleFavorite(gameId) {
    const pd = await Storage.getGameData(gameId);
    const newFav = !pd.favorite;
    await Storage.setGameData(gameId, { favorite: newFav });
    await checkAchievements();

    // Update the favorite button in the details view immediately
    const favBtn = document.getElementById('favToggleBtn');
    if (favBtn) {
        const isFav = newFav;
        favBtn.classList.toggle('favorited', isFav);
        favBtn.querySelector('.star-icon').setAttribute('fill', isFav ? 'currentColor' : 'none');
        favBtn.lastChild.textContent = isFav ? 'Favorited' : 'Favorite';
    }

    // Re-render home and library views so badges reflect the new favorite state
    await renderHome();
    await renderLibrary();
}

// ==========================================
// ACHIEVEMENT CHECKING
// ==========================================

async function checkAchievements() {
    const allGames = await getAllGamesWithPlayData(Storage);
    const totalSessions = allGames.reduce((sum, g) => sum + (g.playCount || 0), 0);
    const favoriteCount = allGames.filter(g => g.favorite).length;
    
    // First Launch: Launch any game once
    const hasAnyPlays = allGames.some(g => g.playCount > 0);
    if (hasAnyPlays) {
        await Storage.unlockAchievement('gamehub', 'first_launch');
    }
    
    // Collector: Favorite a game
    if (favoriteCount > 0) {
        await Storage.unlockAchievement('gamehub', 'collector');
    }
    
    // Explorer: Launch every installed game
    const allGamesPlayed = allGames.every(g => g.playCount > 0);
    if (allGamesPlayed && allGames.length > 0) {
        await Storage.unlockAchievement('gamehub', 'explorer');
    }
    
    // Regular Player: Reach 10 total sessions
    if (totalSessions >= 10) {
        await Storage.unlockAchievement('gamehub', 'regular_player');
    }
}

// ==========================================
// SEARCH
// ==========================================

async function handleSearch(term) {
    currentSearchTerm = term;
    await renderLibrary(term);
}

async function clearSearch() {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.value = '';
    }
    currentSearchTerm = '';
    await renderLibrary();
}

// ==========================================
// SETTINGS
// ==========================================

async function renderSettings() {
    const vol = await Storage.getSetting('volume') ?? 80;
    const settingVolume = document.getElementById('settingVolume');
    const settingVolumeLabel = document.getElementById('settingVolumeLabel');
    const settingStorageSize = document.getElementById('settingStorageSize');
    const settingProfile = document.getElementById('settingProfile');
    const settingAppVersion = document.getElementById('settingAppVersion');
    const settingAboutProfile = document.getElementById('settingAboutProfile');
    
    if (settingVolume) settingVolume.value = vol;
    if (settingVolumeLabel) settingVolumeLabel.textContent = vol;
    if (settingStorageSize) settingStorageSize.textContent = await Storage.getStorageSize();

    // Load profile info
    if (window.profiles) {
        try {
            const activeProfile = await window.profiles.get();
            const displayName = activeProfile && activeProfile.name ? activeProfile.name : 'Default';
            if (settingProfile) settingProfile.textContent = displayName;
            if (settingAboutProfile) settingAboutProfile.textContent = displayName;
        } catch (e) {
            console.warn('Settings: failed to load profile', e);
            if (settingProfile) settingProfile.textContent = 'Default';
            if (settingAboutProfile) settingAboutProfile.textContent = 'Default';
        }
    } else {
        const loadedData = await Storage.load();
        if (settingProfile) settingProfile.textContent = loadedData.profile || 'default';
        if (settingAboutProfile) settingAboutProfile.textContent = loadedData.profile || 'default';
    }

    // Load app version
    if (window.appInfo) {
        try {
            const info = await window.appInfo.get();
            if (settingAppVersion) settingAppVersion.textContent = 'v' + info.version;
        } catch (e) {
            if (settingAppVersion) settingAppVersion.textContent = 'v2.0.0-development';
        }
    } else {
        if (settingAppVersion) settingAppVersion.textContent = 'v2.0.0-development';
    }
}

async function updateSetting(key, value) {
    await Storage.setSetting(key, Number(value));
    if (key === 'volume') {
        const settingVolumeLabel = document.getElementById('settingVolumeLabel');
        if (settingVolumeLabel) {
            settingVolumeLabel.textContent = value;
        }
    }
}

// ==========================================
// MODAL HELPERS
// ==========================================

function openModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        const content = modal.querySelector('[class*="scale-95"]');
        if (content) content.classList.remove('scale-95');
    }, 10);
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.add('opacity-0');
    const content = modal.querySelector('[class*="scale-95"]');
    if (content) content.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

// ==========================================
// PROFILE SWITCHER
// ==========================================

async function openProfileSwitcher() {
    const list = document.getElementById('profileSwitcherList');
    if (!list) return;
    list.innerHTML = '<p class="text-gray-500 text-sm text-center">Loading...</p>';

    try {
        const profiles = await window.profiles.list();
        const activeProfile = await window.profiles.get();
        const activeId = activeProfile ? activeProfile.id : 'default';

        list.innerHTML = '';
        for (const [id, profile] of Object.entries(profiles)) {
            const isActive = id === activeId;
            const btn = document.createElement('button');
            btn.className = `w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors btn-press ${
                isActive
                    ? 'bg-blue-900/30 text-blue-400 border border-blue-800/50'
                    : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700 border border-transparent'
            }`;
            btn.disabled = isActive;
            btn.innerHTML = `<span class="flex items-center justify-between">
                <span>${profile.name}</span>
                ${isActive ? '<span class="text-[10px] text-blue-400 font-bold">Active</span>' : ''}
            </span>`;
            if (!isActive) {
                btn.onclick = () => confirmSwitchProfile(id);
            }
            list.appendChild(btn);
        }
    } catch (e) {
        list.innerHTML = '<p class="text-red-400 text-sm text-center">Failed to load profiles.</p>';
        return;
    }

    openModal('profileSwitcherModal');
}

function closeProfileSwitcher() {
    closeModal('profileSwitcherModal');
}

async function confirmSwitchProfile(profileId) {
    try {
        await window.profiles.switch(profileId);
        closeProfileSwitcher();
        await renderSettings();
    } catch (e) {
        console.error('Failed to switch profile:', e);
    }
}

// ==========================================
// CREATE PROFILE
// ==========================================

function openCreateProfile() {
    const input = document.getElementById('createProfileInput');
    if (input) input.value = '';
    openModal('createProfileModal');
    setTimeout(() => {
        if (input) input.focus();
    }, 350);
}

function closeCreateProfile() {
    closeModal('createProfileModal');
}

async function confirmCreateProfile() {
    const input = document.getElementById('createProfileInput');
    if (!input) return;
    const name = input.value.trim();
    if (!name) return;

    try {
        await window.profiles.create(name);
        closeCreateProfile();
        await renderSettings();
    } catch (e) {
        console.error('Failed to create profile:', e);
    }
}

// ==========================================
// DELETE PROFILE
// ==========================================

async function openDeleteProfile() {
    const list = document.getElementById('deleteProfileList');
    const message = document.getElementById('deleteProfileMessage');
    if (!list || !message) return;

    list.innerHTML = '<p class="text-gray-500 text-sm text-center">Loading...</p>';

    try {
        const profiles = await window.profiles.list();
        const activeProfile = await window.profiles.get();
        const activeId = activeProfile ? activeProfile.id : 'default';

        const customProfiles = Object.entries(profiles).filter(([id, p]) => p.type === 'custom');

        if (customProfiles.length === 0) {
            message.textContent = 'No custom profiles available to delete.';
            list.innerHTML = '';
            openModal('deleteProfileModal');
            return;
        }

        message.textContent = 'Select a custom profile to delete.';
        list.innerHTML = '';

        for (const [id, profile] of customProfiles) {
            const isActive = id === activeId;
            const btn = document.createElement('button');
            btn.className = `w-full text-left px-4 py-3 rounded-lg text-sm font-medium transition-colors btn-press ${
                isActive
                    ? 'bg-gray-700/30 text-gray-500 border border-gray-700 cursor-not-allowed'
                    : 'bg-gray-700/50 text-gray-300 hover:bg-red-900/30 hover:text-red-400 border border-transparent'
            }`;
            btn.disabled = isActive;
            btn.innerHTML = `<span class="flex items-center justify-between">
                <span>${profile.name}</span>
                ${isActive ? '<span class="text-[10px] text-gray-500">Active — switch first</span>' : ''}
            </span>`;
            if (!isActive) {
                btn.onclick = () => confirmDeleteProfile(id);
            }
            list.appendChild(btn);
        }
    } catch (e) {
        list.innerHTML = '<p class="text-red-400 text-sm text-center">Failed to load profiles.</p>';
        return;
    }

    openModal('deleteProfileModal');
}

function closeDeleteProfile() {
    closeModal('deleteProfileModal');
}

async function confirmDeleteProfile(profileId) {
    try {
        await window.profiles.delete(profileId);
        closeDeleteProfile();
        await renderSettings();
    } catch (e) {
        console.error('Failed to delete profile:', e);
    }
}

// ==========================================
// EXPORT PROFILE
// ==========================================

async function exportProfile() {
    try {
        const activeProfile = await window.profiles.get();
        if (!activeProfile) return;

        const data = await window.profiles.exportProfile(activeProfile.id);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `profile-${activeProfile.id}.json`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Failed to export profile:', e);
    }
}

// ==========================================
// IMPORT PROFILE
// ==========================================

function importProfile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            await window.profiles.importProfile(data);
            await renderSettings();
        } catch (err) {
            console.error('Failed to import profile:', err);
        }
    };
    input.click();
}

// ==========================================
// RESET DATA
// ==========================================

function openResetDataModal() {
    openModal('resetDataModal');
}

function closeResetDataModal() {
    closeModal('resetDataModal');
}

async function confirmResetData() {
    closeResetDataModal();
    try {
        await window.storage.resetGameData();
        await renderHome();
        await renderLibrary();
        await renderSettings();
        if (typeof window.getCurrentView === 'function' && window.getCurrentView() === 'statistics') {
            await renderStatistics();
        }
    } catch (e) {
        console.error('Failed to reset game data:', e);
    }
}

// ==========================================
// UNINSTALL
// ==========================================

let uninstallModalGameId = null;

/**
 * Open the uninstall confirmation modal for a game.
 * @param {string} gameId - Game identifier
 */
function openUninstallModal(gameId) {
    const gameDef = games.find(g => g.id === gameId);
    if (!gameDef) return;

    uninstallModalGameId = gameId;

    // Set the modal title with the game name
    const titleEl = document.getElementById('uninstallModalTitle');
    if (titleEl) {
        titleEl.textContent = `Uninstall ${gameDef.title}?`;
    }

    // Reset the checkbox to unchecked by default
    const checkbox = document.getElementById('uninstallDeleteSavesCheckbox');
    if (checkbox) {
        checkbox.checked = false;
    }

    openModal('uninstallModal');
}

/**
 * Close the uninstall confirmation modal.
 */
function closeUninstallModal() {
    uninstallModalGameId = null;
    closeModal('uninstallModal');
}

/**
 * Confirm and execute the uninstall.
 * Refreshes installed games and updates the UI after success.
 */
async function confirmUninstall() {
    if (!uninstallModalGameId) return;

    const gameId = uninstallModalGameId;
    const checkbox = document.getElementById('uninstallDeleteSavesCheckbox');
    const deleteSaves = !!(checkbox && checkbox.checked);

    closeUninstallModal();

    try {
        const result = await window.downloader.uninstall(gameId, { deleteSaves });

        // The launcher reports truthful per-step results. If save deletion was
        // requested but failed, the game is intentionally NOT uninstalled and
        // we must not refresh the UI as if it were.
        if (!result || result.success === false) {
            const detail = (result && result.error) ? result.error : 'Unknown error';
            console.error(`GameHub: Failed to uninstall ${gameId}:`, detail);
            showError(`Could not uninstall ${gameId}: ${detail}`, 6000);
            return;
        }

        // Refresh installed games cache and update all UI views
        await refreshInstalledGames();
        await updateGameUI(gameId);
        showSuccess(deleteSaves
            ? `${gameId} uninstalled (save data deleted)`
            : `${gameId} uninstalled (save data preserved)`);
    } catch (e) {
        console.error(`GameHub: Failed to uninstall ${gameId}:`, e);
        showError(`Failed to uninstall ${gameId}.`, 6000);
    }
}

// ==========================================
// STATISTICS
// ==========================================

async function renderStatistics() {
    const allGames = await getAllGamesWithPlayData(Storage);
    
    const statPageTotalGames = document.getElementById('statPageTotalGames');
    const statPageTotalSessions = document.getElementById('statPageTotalSessions');
    const statPageTotalFavs = document.getElementById('statPageTotalFavs');
    const statPageMostPlayed = document.getElementById('statPageMostPlayed');
    const statPageLastPlayed = document.getElementById('statPageLastPlayed');
    
    if (statPageTotalGames) statPageTotalGames.textContent = allGames.length;
    if (statPageTotalSessions) statPageTotalSessions.textContent = allGames.reduce((sum, g) => sum + (g.playCount || 0), 0);
    if (statPageTotalFavs) statPageTotalFavs.textContent = allGames.filter(g => g.favorite).length;

    const mostPlayed = allGames.filter(g => g.playCount > 0).sort((a, b) => b.playCount - a.playCount)[0];
    if (statPageMostPlayed) statPageMostPlayed.textContent = mostPlayed ? mostPlayed.title : '—';

    const lastPlayed = allGames.filter(g => g.lastPlayed).sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed))[0];
    if (statPageLastPlayed) statPageLastPlayed.textContent = lastPlayed ? lastPlayed.title : '—';

    // Per-Game Statistics List
    const listContainer = document.getElementById('statPageGamesList');
    if (listContainer) {
        listContainer.innerHTML = '';
        allGames.forEach(game => {
            const card = document.createElement('div');
            card.className = 'bg-gray-800 rounded-xl border border-gray-700 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm';
            
            let statsHtml = '';
            if (game.playCount > 0) {
                statsHtml = `
                    <div class="flex flex-wrap gap-8 text-sm md:mr-4">
                        <div>
                            <span class="text-gray-500 block text-[10px] font-bold uppercase tracking-wider mb-1">Play Count</span>
                            <span class="text-white font-medium text-base">${game.playCount} session${game.playCount !== 1 ? 's' : ''}</span>
                        </div>
                        <div>
                            <span class="text-gray-500 block text-[10px] font-bold uppercase tracking-wider mb-1">Last Played</span>
                            <span class="text-white font-medium text-base">${formatDate(game.lastPlayed)}</span>
                        </div>
                        <div>
                            <span class="text-gray-500 block text-[10px] font-bold uppercase tracking-wider mb-1">Favorite</span>
                            <span class="text-white font-medium text-base flex items-center gap-1">${game.favorite ? '<span class="text-yellow-400">⭐</span> Yes' : 'No'}</span>
                        </div>
                    </div>
                `;
            } else {
                statsHtml = `<div class="text-gray-500 text-sm italic md:mr-4">No sessions recorded yet</div>`;
            }

            card.innerHTML = `
                <div class="flex items-center gap-4">
                    <img src="${resolveCoverUrl(game)}" alt="${game.title}" class="w-14 h-14 rounded-lg object-cover shadow border border-gray-700">
                    <h4 class="text-lg font-bold text-white">${game.title}</h4>
                </div>
                ${statsHtml}
            `;
            listContainer.appendChild(card);
        });
    }
}

// ==========================================
// ACHIEVEMENTS
// ==========================================

async function renderAchievements() {
    const allDefs = [];
    for (const gameId in achievements) {
        for (const achId in achievements[gameId]) {
            allDefs.push({ ...achievements[gameId][achId], gameId });
        }
    }
    
    const loadedData = await Storage.load();
    const unlockedData = loadedData.achievements || {};
    
    const totalAchievements = allDefs.length;
    let unlockedCount = 0;
    allDefs.forEach(ach => {
        if (unlockedData[ach.gameId] && unlockedData[ach.gameId][ach.id]) {
            unlockedCount++;
        }
    });

    const achTotalCount = document.getElementById('achTotalCount');
    const achUnlockedCount = document.getElementById('achUnlockedCount');
    if (achTotalCount) achTotalCount.textContent = totalAchievements;
    if (achUnlockedCount) achUnlockedCount.textContent = unlockedCount;

    // Group achievements by game
    const groupedByGame = {};
    allDefs.forEach(ach => {
        if (!groupedByGame[ach.gameId]) {
            groupedByGame[ach.gameId] = { unlocked: [], locked: [] };
        }
        if (unlockedData[ach.gameId] && unlockedData[ach.gameId][ach.id]) {
            groupedByGame[ach.gameId].unlocked.push(ach);
        } else {
            groupedByGame[ach.gameId].locked.push(ach);
        }
    });

    // Render unlocked achievements
    const unlockedContainer = document.getElementById('achUnlockedList');
    if (unlockedContainer) {
        unlockedContainer.innerHTML = '';
        let hasUnlocked = false;
        for (const gameId in groupedByGame) {
            const group = groupedByGame[gameId];
            if (group.unlocked.length === 0) continue;
            hasUnlocked = true;
            
            const gameLabel = gameId === 'gamehub' ? 'Game Hub' : (games.find(g => g.id === gameId)?.title || gameId);
            const header = document.createElement('div');
            header.className = 'text-xs font-bold uppercase tracking-widest text-gray-500 mt-4 mb-2';
            header.textContent = `🏆 ${gameLabel}`;
            unlockedContainer.appendChild(header);
            
            group.unlocked.forEach(ach => {
                const unlockDate = unlockedData[ach.gameId][ach.id].date;
                const rarityBg = getRarityBg(ach.rarity, RARITY_CONFIG);
                const card = document.createElement('div');
                card.className = `bg-gray-800 rounded-xl border border-gray-700 p-4 flex items-center gap-4 ${rarityBg}`;
                card.innerHTML = `
                    <div class="text-3xl">${ach.icon}</div>
                    <div class="flex-grow min-w-0">
                        <h4 class="text-white font-bold text-sm flex items-center gap-2">
                            <span>✅</span> ${ach.title}
                            ${getRarityBadge(ach.rarity, RARITY_CONFIG)}
                        </h4>
                        <p class="text-gray-400 text-xs mt-1">${ach.description}</p>
                    </div>
                    <div class="text-gray-500 text-[10px] flex-shrink-0">${formatDate(unlockDate)}</div>
                `;
                unlockedContainer.appendChild(card);
            });
        }
        if (!hasUnlocked) {
            unlockedContainer.innerHTML = '<p class="text-gray-600 text-sm mt-2">No achievements unlocked yet. Start playing to earn some!</p>';
        }
    }

    // Render locked achievements
    const lockedContainer = document.getElementById('achLockedList');
    if (lockedContainer) {
        lockedContainer.innerHTML = '';
        let hasLocked = false;
        for (const gameId in groupedByGame) {
            const group = groupedByGame[gameId];
            if (group.locked.length === 0) continue;
            hasLocked = true;
            
            const gameLabel = gameId === 'gamehub' ? 'Game Hub' : (games.find(g => g.id === gameId)?.title || gameId);
            const header = document.createElement('div');
            header.className = 'text-xs font-bold uppercase tracking-widest text-gray-500 mt-4 mb-2';
            header.textContent = `🎮 ${gameLabel}`;
            lockedContainer.appendChild(header);
            
            group.locked.forEach(ach => {
                const card = document.createElement('div');
                card.className = 'bg-gray-800 rounded-xl border border-gray-700 p-4 flex items-center gap-4 opacity-60';
                card.innerHTML = `
                    <div class="text-3xl">${ach.icon}</div>
                    <div class="flex-grow min-w-0">
                        <h4 class="text-white font-bold text-sm flex items-center gap-2">
                            <span>🔒</span> ${ach.title}
                            ${getRarityBadge(ach.rarity, RARITY_CONFIG)}
                        </h4>
                        <p class="text-gray-400 text-xs mt-1">${ach.description}</p>
                    </div>
                `;
                lockedContainer.appendChild(card);
            });
        }
        if (!hasLocked) {
            lockedContainer.innerHTML = '<p class="text-gray-600 text-sm mt-2">All achievements unlocked! 🎉</p>';
        }
    }
}

// ==========================================
// MODALS
// ==========================================

function openBetaModal() {
    pendingBetaUrl = 'games_beta/tactical_drone_defense/index.html';
    const betaModal = document.getElementById('betaModal');
    if (betaModal) {
        betaModal.classList.remove('hidden');
        setTimeout(() => {
            betaModal.classList.remove('opacity-0');
            const betaModalContent = document.getElementById('betaModalContent');
            if (betaModalContent) {
                betaModalContent.classList.remove('scale-95');
            }
        }, 10);
    }
}

function closeBetaModal() {
    const betaModal = document.getElementById('betaModal');
    if (betaModal) {
        betaModal.classList.add('opacity-0');
        const betaModalContent = document.getElementById('betaModalContent');
        if (betaModalContent) {
            betaModalContent.classList.add('scale-95');
        }
        setTimeout(() => {
            betaModal.classList.add('hidden');
        }, 300);
    }
}

async function confirmBetaLaunch() {
    const pd = await Storage.getGameData('tactical-drone-defense');
    await Storage.setGameData('tactical-drone-defense', {
        lastPlayed: new Date().toISOString().split('T')[0],
        playCount: (pd.playCount || 0) + 1
    });
    if (pendingBetaUrl) {
        sessionStorage.setItem('game-hub-launched', '1');
        window.location.href = pendingBetaUrl;
    }
    closeBetaModal();
}

// ==========================================
// DOWNLOAD MODAL
// ==========================================

/**
 * Open the download progress modal for a game.
 * @param {string} gameId - Game identifier
 */
function openDownloadModal(gameId) {
    const gameDef = games.find(g => g.id === gameId);
    if (!gameDef) return;

    downloadModalGameId = gameId;
    downloadModalGameDef = gameDef;

    // Set cover image
    const coverImg = document.getElementById('downloadModalCoverImg');
    const coverFallback = document.getElementById('downloadModalCoverFallback');
    const coverUrl = resolveCoverUrl(gameDef);
    if (coverUrl) {
        coverImg.src = coverUrl;
        coverImg.classList.remove('hidden');
        coverFallback.classList.add('hidden');
    } else {
        coverImg.classList.add('hidden');
        coverFallback.classList.remove('hidden');
    }

    // Set title
    document.getElementById('downloadModalTitle').textContent = `Downloading ${gameDef.title}`;

    // Reset to progress view
    document.getElementById('downloadModalProgress').classList.remove('hidden');
    document.getElementById('downloadModalCompleted').classList.add('hidden');
    document.getElementById('downloadModalError').classList.add('hidden');

    // Reset progress
    document.getElementById('downloadModalBar').style.width = '0%';
    document.getElementById('downloadModalPercent').textContent = '0%';
    document.getElementById('downloadModalBytes').textContent = '';
    document.getElementById('downloadModalStatus').textContent = 'Starting...';

    // Show modal
    openModal('downloadModal');
}

/**
 * Close the download modal and clean up state.
 */
function closeDownloadModal() {
    downloadModalGameId = null;
    downloadModalGameDef = null;
    closeModal('downloadModal');
}

/**
 * Update the download modal with live progress.
 * @param {string} gameId - Game identifier
 */
function updateDownloadModal(gameId) {
    if (downloadModalGameId !== gameId) return;

    const dl = downloadStates.get(gameId);
    if (!dl) return;

    const pct = dl.percentage || 0;
    const sizeText = (dl.bytes > 0 && dl.total > 0)
        ? `${formatBytes(dl.bytes)} / ${formatBytes(dl.total)}`
        : '';

    let statusText = 'Downloading...';
    if (dl.status === 'verifying') {
        statusText = 'Verifying files...';
    } else if (dl.status === 'installing') {
        statusText = 'Installing...';
    }

    document.getElementById('downloadModalBar').style.width = `${pct}%`;
    document.getElementById('downloadModalPercent').textContent = `${pct}%`;
    document.getElementById('downloadModalBytes').textContent = sizeText;
    document.getElementById('downloadModalStatus').textContent = statusText;
}

/**
 * Show the completed state in the download modal.
 * @param {string} gameId - Game identifier
 */
function showDownloadCompleted(gameId) {
    if (downloadModalGameId !== gameId) return;

    // Hide progress, show completed
    document.getElementById('downloadModalProgress').classList.add('hidden');
    document.getElementById('downloadModalError').classList.add('hidden');
    document.getElementById('downloadModalCompleted').classList.remove('hidden');

    // Update title
    const gameDef = games.find(g => g.id === gameId);
    if (gameDef) {
        document.getElementById('downloadModalTitle').textContent = gameDef.title;

        // Use the universal btn-action btn-play classes so the Play Now button
        // is visually identical to every other Play button in the launcher
        const playBtn = document.getElementById('downloadModalPlayBtn');
        if (playBtn) {
            playBtn.className = 'btn-action btn-play';
        }
    }
}

/**
 * Show the error state in the download modal.
 * @param {string} gameId - Game identifier
 * @param {string} errorMessage - Error description
 */
function showDownloadError(gameId, errorMessage) {
    if (downloadModalGameId !== gameId) return;

    // Hide progress, show error
    document.getElementById('downloadModalProgress').classList.add('hidden');
    document.getElementById('downloadModalCompleted').classList.add('hidden');
    document.getElementById('downloadModalError').classList.remove('hidden');

    // Set error reason
    document.getElementById('downloadModalErrorReason').textContent = errorMessage;

    // Update title
    const gameDef = games.find(g => g.id === gameId);
    if (gameDef) {
        document.getElementById('downloadModalTitle').textContent = gameDef.title;
    }
}

/**
 * Cancel the current download from the modal.
 */
async function cancelDownloadFromModal() {
    if (!downloadModalGameId) return;
    await cancelDownload(downloadModalGameId);
    closeDownloadModal();
}

/**
 * Retry the failed download.
 */
async function retryDownload() {
    if (!downloadModalGameId || !downloadModalGameDef) return;

    // Reset modal to progress view
    document.getElementById('downloadModalError').classList.add('hidden');
    document.getElementById('downloadModalProgress').classList.remove('hidden');
    document.getElementById('downloadModalBar').style.width = '0%';
    document.getElementById('downloadModalPercent').textContent = '0%';
    document.getElementById('downloadModalBytes').textContent = '';
    document.getElementById('downloadModalStatus').textContent = 'Starting...';

    const gameDef = downloadModalGameDef;
    document.getElementById('downloadModalTitle').textContent = `Downloading ${gameDef.title}`;

    // Start the download again
    await installGame(downloadModalGameId);
}

/**
 * Launch the game that was just downloaded from the modal.
 */
async function launchDownloadedGame() {
    if (!downloadModalGameId || !downloadModalGameDef) return;

    const gameDef = downloadModalGameDef;
    const game = await getGameWithPlayData(gameDef, Storage);

    // Find play action
    let playUrl = null;
    if (game.actions && game.actions.length > 0) {
        const playAction = game.actions.find(a => a.type === 'play');
        if (playAction) {
            playUrl = resolveGameUrl(game, playAction.url);
        }
    }

    if (!playUrl) {
        // Fallback: try index.html in the game path
        playUrl = resolveGameUrl(game, 'index.html');
    }

    closeDownloadModal();
    await launchGame(downloadModalGameId, playUrl);
}

// ==========================================
// GLOBAL FUNCTION EXPORTS FOR HTML
// ==========================================

window.navigateTo = navigateTo;
window.launchGame = launchGame;
window.showDetails = showDetails;
window.installGame = installGame;
window.cancelDownload = cancelDownload;
window.handleSearch = handleSearch;
window.clearSearch = clearSearch;
window.setLibraryFilter = setLibraryFilter;
window.toggleFavorite = toggleFavorite;
window.updateSetting = updateSetting;
window.confirmResetData = confirmResetData;
window.openBetaModal = openBetaModal;
window.closeBetaModal = closeBetaModal;
window.confirmBetaLaunch = confirmBetaLaunch;
window.GameHub = GameHub;
window.renderHome = renderHome;
window.renderLibrary = renderLibrary;
window.renderSettings = renderSettings;
window.renderStatistics = renderStatistics;
window.renderAchievements = renderAchievements;
window.getCurrentView = () => currentView;
window.getPreviousView = () => previousView;
window.getCurrentDetailGameId = () => currentDetailGameId;
window.buildDetailsAchievements = buildDetailsAchievements;

// Profile functions
window.openProfileSwitcher = openProfileSwitcher;
window.closeProfileSwitcher = closeProfileSwitcher;
window.confirmSwitchProfile = confirmSwitchProfile;
window.openCreateProfile = openCreateProfile;
window.closeCreateProfile = closeCreateProfile;
window.confirmCreateProfile = confirmCreateProfile;
window.openDeleteProfile = openDeleteProfile;
window.closeDeleteProfile = closeDeleteProfile;
window.confirmDeleteProfile = confirmDeleteProfile;
window.exportProfile = exportProfile;
window.importProfile = importProfile;

// Modal functions
window.openModal = openModal;
window.closeModal = closeModal;
window.openResetDataModal = openResetDataModal;
window.closeResetDataModal = closeResetDataModal;

// Download modal functions
window.openDownloadModal = openDownloadModal;
window.closeDownloadModal = closeDownloadModal;
window.cancelDownloadFromModal = cancelDownloadFromModal;
window.retryDownload = retryDownload;
window.launchDownloadedGame = launchDownloadedGame;

// Uninstall modal functions
window.openUninstallModal = openUninstallModal;
window.closeUninstallModal = closeUninstallModal;
window.confirmUninstall = confirmUninstall;

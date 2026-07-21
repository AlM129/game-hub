// ==========================================
// GAME HUB - MAIN APPLICATION MODULE
// ==========================================
// Thin entry point that wires all modules together

import { Storage } from './storage.js';
import { getGames, loadGameManifests, getAllGamesWithPlayData, getRecentlyPlayed, getGameWithPlayData, markUpdatesAsSeen, getChannelChangelog, getFeaturedGameId } from './games/loader.js';
import { initialize as initAchievements, achievements, getAchievementDefinitions, addGameAchievements, RARITY_CONFIG } from './systems/achievements/manager.js';
import { navigateTo } from './core/router.js';
import { GameHub } from './core/events.js';
import { formatDate, formatLastPlayed, getChannelBadge, getRarityBadge, getRarityBg } from './utils.js';
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
let currentDetailGameId = null;

// ==========================================
// INITIALIZATION
// ==========================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Step 1: Check if migration from old localStorage format is needed
        await checkAndMigrate();

        // Step 2: Load game manifests from game.json files
        await loadGameManifests();

        // Step 3: Initialize achievements system
        initAchievements();

        // Step 4: Set up event listeners
        setupEventListeners();

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
        const playUrl = playAction ? (featured.path + playAction.url) : '#';
        
        featuredContainer.innerHTML = `
            <div class="relative h-56 md:h-72 ${featured.theme.bg}">
                <img src="${featured.path + featured.cover}" alt="${featured.title}" class="featured-img absolute inset-0 w-full h-full object-cover opacity-60">
                <div class="absolute inset-0 bg-gradient-to-r from-gray-900 via-gray-900/70 to-transparent z-10"></div>
                <div class="absolute inset-0 bg-gradient-to-t from-gray-900/80 to-transparent z-10"></div>
                <div class="relative z-20 h-full flex flex-col justify-end p-8">
                    <div class="text-[10px] uppercase tracking-widest font-bold text-blue-400 mb-2">Featured</div>
                    <h2 class="text-3xl md:text-4xl font-extrabold text-white mb-2">${featured.title}</h2>
                    <p class="text-gray-300 text-sm max-w-lg mb-5 line-clamp-2">${featured.description}</p>
                    <div class="flex gap-3">
                        <button onclick="launchGame('${featured.id}', '${playUrl}')" class="${featured.theme.btn} ${featured.theme.btnHover} text-white font-bold py-2.5 px-6 rounded-lg transition-colors duration-200 flex items-center gap-2 text-sm btn-press shadow-lg">
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
                const card = document.createElement('div');
                card.className = `bg-gray-800 rounded-xl overflow-hidden border border-gray-700 game-card cursor-pointer group flex gap-4 p-4 card-animate ${game.theme.borderHover}`;
                card.style.animationDelay = `${index * 80}ms`;
                card.onclick = () => showDetails(game.id);
                card.innerHTML = `
                    <div class="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 ${game.theme.bg} relative flex items-center justify-center">
                        <span class="absolute ${game.theme.text} font-bold text-[10px] uppercase select-none z-0">${game.title.substring(0, 2)}</span>
                        <img src="${game.path + game.cover}" alt="${game.title}" class="absolute inset-0 w-full h-full object-cover z-10" onerror="this.style.opacity='0';">
                    </div>
                    <div class="flex flex-col justify-center min-w-0">
                        <h4 class="text-white font-bold text-sm truncate">${game.title}</h4>
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

async function renderLibrary(filterTerm = '') {
    const grid = document.getElementById('gamesGrid');
    const noResults = document.getElementById('noResults');
    if (!grid || !noResults) return;
    
    grid.innerHTML = '';

    const allWithData = await getAllGamesWithPlayData(Storage);
    const filtered = filterTerm
        ? allWithData.filter(g => g.title.toLowerCase().includes(filterTerm.toLowerCase()))
        : allWithData;

    if (filtered.length === 0) {
        noResults.classList.remove('hidden');
        return;
    }
    noResults.classList.add('hidden');

    filtered.forEach((game, index) => {
        const favBadge = game.favorite ? '<span class="text-yellow-400 text-xs">⭐</span>' : '';
        const card = document.createElement('div');
        card.className = `bg-gray-800 rounded-2xl overflow-hidden shadow-lg border border-gray-700 game-card ${game.theme.borderHover} group flex flex-col cursor-pointer card-animate`;
        card.style.animationDelay = `${index * 60}ms`;
        card.onclick = () => showDetails(game.id);

        card.innerHTML = `
            <div class="w-full h-48 ${game.theme.bg} relative overflow-hidden flex items-center justify-center">
                <span class="absolute ${game.theme.text} font-bold tracking-wider text-lg uppercase select-none text-center px-4 z-0">${game.title}</span>
                <img src="${game.path + game.cover}" alt="${game.title}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 z-10" onerror="this.style.opacity='0';">
            </div>
            <div class="p-5 flex flex-col flex-grow justify-between">
                <div>
                    <div class="flex items-center justify-between mb-1.5">
                        <h2 class="text-xl font-bold text-white flex items-center gap-1.5">${favBadge} ${game.title}</h2>
                        <span class="text-[11px] text-gray-500 font-medium bg-gray-700/50 px-2 py-0.5 rounded">${game.genre}</span>
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
    window.location.href = url;
}

async function showDetails(gameId) {
    const gameDef = games.find(g => g.id === gameId);
    if (!gameDef) return;

    const game = await getGameWithPlayData(gameDef, Storage);
    currentDetailGameId = gameId;
    
    // Mark updates as seen when viewing game details
    await markUpdatesAsSeen(gameId, Storage);

    document.getElementById('detailsTitle').textContent = game.title;
    document.getElementById('detailsDescription').textContent = game.description;

    document.getElementById('detailsBannerBg').src = game.path + game.cover;
    document.getElementById('detailsBannerImg').src = game.path + game.cover;

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

    // Build actions
    const actionsContainer = document.getElementById('detailsActions');
    if (actionsContainer) {
        actionsContainer.innerHTML = '';
        game.actions.forEach(action => {
            if (action.type === 'play') {
                actionsContainer.innerHTML += `
                    <button onclick="launchGame('${game.id}', '${game.path + action.url}')" class="${game.theme.btn} ${game.theme.btnHover} text-white font-bold py-3 px-8 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl btn-press">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                        ${action.label}
                    </button>
                `;
            }
        });
        const gameData = await Storage.getGameData(game.id);
        const fav = gameData.favorite || false;
        actionsContainer.innerHTML += `
            <button id="favToggleBtn" class="fav-btn ${fav ? 'favorited' : ''}" onclick="toggleFavorite('${game.id}')">
                <svg class="w-5 h-5 star-icon" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
                </svg>
                ${fav ? 'Favorited' : 'Favorite'}
            </button>
        `;
    }

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
    
    if (settingVolume) settingVolume.value = vol;
    if (settingVolumeLabel) settingVolumeLabel.textContent = vol;
    if (settingStorageSize) settingStorageSize.textContent = await Storage.getStorageSize();
    const loadedData = await Storage.load();
    if (settingProfile) settingProfile.textContent = loadedData.profile;
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

async function confirmResetData() {
    if (confirm('Are you sure you want to reset all Game Hub data? This will clear play history, favorites, and settings.')) {
        await Storage.reset();
        await renderHome();
        await renderLibrary();
        await renderSettings();
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
                    <img src="${game.path + game.cover}" alt="${game.title}" class="w-14 h-14 rounded-lg object-cover shadow border border-gray-700">
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
// GLOBAL FUNCTION EXPORTS FOR HTML
// ==========================================

window.navigateTo = navigateTo;
window.launchGame = launchGame;
window.showDetails = showDetails;
window.handleSearch = handleSearch;
window.clearSearch = clearSearch;
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
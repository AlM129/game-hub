// ==========================================
// HOME VIEW
// ==========================================
// Renders the home page with featured banner, recently played, favorites, and updates

import { Storage } from '../../storage.js';
import { 
    getAllGamesWithPlayData, 
    getRecentlyPlayed, 
    getFavoriteGames, 
    getGamesWithNewUpdates 
} from '../../games/loader.js';
import { 
    getLatestChannelEntryByGameId, 
    getActiveChannel, 
    CHANNEL_CONFIG 
} from '../../games/registry.js';
import { formatDate, formatLastPlayed, getChannelBadge, resolveCoverUrl } from '../../utils.js';

export async function renderHome() {
    await renderFeaturedBanner();
    await renderRecentlyPlayed();
    await renderHomeFavorites();
    await renderHomeNewUpdates();
    await updateOverviewStats();
}

async function renderFeaturedBanner() {
    const allWithData = await getAllGamesWithPlayData(Storage);
    const recent = await getRecentlyPlayed();
    const featured = recent[0] || allWithData[0];
    const container = document.getElementById('featuredBanner');

    if (!featured || !container) return;

    const playAction = featured.actions.find(a => a.type === 'play');
    const playUrl = playAction ? (featured.path + playAction.url) : '#';

    container.innerHTML = `
        <div class="relative h-56 md:h-72 ${featured.theme.bg}">
            <img src="${resolveCoverUrl(featured)}" alt="${featured.title}" class="featured-img absolute inset-0 w-full h-full object-cover opacity-60">
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

async function renderRecentlyPlayed() {
    const recent = await getRecentlyPlayed();
    const container = document.getElementById('recentlyPlayedRow');
    if (!container) return;
    
    container.innerHTML = '';

    if (recent.length === 0) {
        container.innerHTML = '<p class="text-gray-600 text-sm col-span-3">No games played yet. Launch a game to start tracking!</p>';
        return;
    }

    recent.forEach((game, index) => {
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
                <h4 class="text-white font-bold text-sm truncate">${game.title}</h4>
                <p class="text-gray-500 text-xs mt-0.5">${formatLastPlayed(game.lastPlayed)}</p>
                <p class="text-gray-600 text-[11px] mt-0.5">${game.playCount} session${game.playCount !== 1 ? 's' : ''}</p>
            </div>
        `;
        container.appendChild(card);
    });
}

async function renderHomeFavorites() {
    const favs = await getFavoriteGames();
    const section = document.getElementById('homeFavoritesSection');
    const container = document.getElementById('homeFavoritesRow');
    if (!section || !container) return;

    if (favs.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    container.innerHTML = '';

    favs.forEach((game, index) => {
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
                <h4 class="text-white font-bold text-sm truncate">⭐ ${game.title}</h4>
                <p class="text-gray-500 text-xs mt-0.5">${game.genre}</p>
            </div>
        `;
        container.appendChild(card);
    });
}

async function renderHomeNewUpdates() {
    const section = document.getElementById('homeNewUpdatesSection');
    const container = document.getElementById('homeNewUpdatesRow');
    if (!section || !container) return;

    const gamesWithUpdates = await getGamesWithNewUpdates(Storage, getAllGamesWithPlayData);

    if (gamesWithUpdates.length === 0) {
        section.classList.add('hidden');
        return;
    }

    section.classList.remove('hidden');
    container.innerHTML = '';

    for (const [index, game] of gamesWithUpdates.entries()) {
        // Get the latest entry for the user's active channel
        const activeChannel = await getActiveChannel(game.id, Storage);
        const latest = getLatestChannelEntryByGameId(game.id, activeChannel);
        const channelBadge = latest ? getChannelBadge(activeChannel, CHANNEL_CONFIG) : '';

        const card = document.createElement('div');
        card.className = `bg-gray-800 rounded-xl border border-gray-700 p-5 card-animate`;
        card.style.animationDelay = `${index * 60}ms`;

        card.innerHTML = `
            <div class="flex items-start justify-between mb-3">
                <div class="flex items-center gap-2">
                    <span class="text-lg">🚁</span>
                    <h4 class="text-white font-bold text-sm">${game.title}</h4>
                </div>
                ${channelBadge}
            </div>
            <div class="text-gray-300 font-bold text-xs mb-1">${latest?.version || ''}</div>
            <div class="text-gray-500 text-[10px] mb-3">${formatDate(latest?.date) || ''}</div>
            <ul class="space-y-1 mb-4">
                ${latest?.changes.map(c => `<li class="text-gray-400 text-xs flex items-start gap-1"><span class="text-green-400 flex-shrink-0">•</span> <span>${c}</span></li>`).join('') || ''}
            </ul>
            <button onclick="showDetails('${game.id}')" class="text-xs text-blue-400 hover:text-blue-300 font-medium transition-colors">View Details →</button>
        `;
        container.appendChild(card);
    }
}

async function updateOverviewStats() {
    const statTotalGames = document.getElementById('statTotalGames');
    const statTotalPlays = document.getElementById('statTotalPlays');
    const statAchievements = document.getElementById('statAchievements');
    
    if (statTotalGames) statTotalGames.textContent = games.length;
    const allWithData = await getAllGamesWithPlayData(Storage);
    const totalPlays = allWithData.reduce((sum, g) => sum + (g.playCount || 0), 0);
    if (statTotalPlays) statTotalPlays.textContent = totalPlays || '—';
    
    const loadedData = await Storage.load();
    const achievements = loadedData.achievements || {};
    let totalAchievements = 0;
    for (const gameId in achievements) {
        totalAchievements += Object.keys(achievements[gameId]).length;
    }
    if (statAchievements) statAchievements.textContent = totalAchievements > 0 ? totalAchievements : '—';
}

// Export for global access
window.renderHome = renderHome;
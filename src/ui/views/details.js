// ==========================================
// DETAILS VIEW
// ==========================================
// Renders the game details page with metadata, actions, achievements, and changelog

import { Storage } from '../../storage.js';
import { 
    getGameWithPlayData, 
    getChannelChangelog, 
    getLatestChannelEntryByGameId, 
    getActiveChannel, 
    CHANNEL_CONFIG 
} from '../../games/registry.js';
import { 
    getAchievementDefinitions, 
    RARITY_CONFIG 
} from '../../systems/achievements/manager.js';
import { formatDate, formatLastPlayed, getChannelBadge, getRarityBadge, getRarityBg } from '../../utils.js';

export async function showDetails(gameId) {
    const gameDef = games.find(g => g.id === gameId);
    if (!gameDef) return;

    const game = await getGameWithPlayData(gameDef, Storage);
    
    // Mark updates as seen when viewing game details
    await markUpdatesAsSeen(gameId, Storage);

    // Track current detail game
    if (typeof window.setCurrentDetailGameId === 'function') {
        window.setCurrentDetailGameId(gameId);
    }

    document.getElementById('detailsTitle').textContent = game.title;
    document.getElementById('detailsDescription').textContent = game.description;

    document.getElementById('detailsBannerBg').src = game.path + game.cover;
    document.getElementById('detailsBannerImg').src = game.path + game.cover;

    const bannerContainer = document.getElementById('detailsBannerContainer');
    bannerContainer.className = `w-full h-64 md:h-80 relative overflow-hidden flex items-center justify-center ${game.theme.bg}`;

    buildMetadata(game);
    buildSidebarInfo(game);
    await buildActions(game);
    await buildDetailsAchievements(game.id);
    buildChangelog(game);

    // Navigate to details view
    if (typeof window.navigateTo === 'function') {
        window.navigateTo('details');
    }
}

function buildMetadata(game) {
    const metaContainer = document.getElementById('detailsMeta');
    if (!metaContainer) return;
    
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

function buildSidebarInfo(game) {
    const sidebar = document.getElementById('detailsSidebar');
    if (!sidebar) return;
    
    const activeChannel = game.activeChannel || 'stable';
    const latestEntry = getLatestChannelEntryByGameId(game.id, activeChannel);
    const availableChannels = getAvailableChannels(game);
    
    // Build available channels list
    const channelsHtml = availableChannels.map(ch => {
        const chVersion = getChannelVersion(game, ch);
        const chConfig = CHANNEL_CONFIG[ch] || CHANNEL_CONFIG.stable;
        const isCurrent = ch === activeChannel;
        return `
            <div class="flex items-center justify-between py-1 ${isCurrent ? 'font-bold' : ''}">
                <span class="text-gray-400 text-xs flex items-center gap-1.5">
                    <span class="w-2 h-2 rounded-full ${chConfig.color.replace('text-', 'bg-')}"></span>
                    ${chConfig.label}
                </span>
                <span class="text-gray-300 text-xs font-mono">${chVersion || '—'}</span>
            </div>
        `;
    }).join('');

    const info = [
        { label: 'Developer', value: game.developer },
        { label: 'Genre', value: game.genre },
        { label: 'Version', value: game.channelVersion || game.version },
        { label: 'Released', value: formatDate(game.releaseDate) },
        { label: 'Last Updated', value: latestEntry ? formatDate(latestEntry.date) : '—' },
        { label: 'Last Played', value: formatLastPlayed(game.lastPlayed) },
        { label: 'Play Count', value: `${game.playCount} session${game.playCount !== 1 ? 's' : ''}` }
    ];

    let html = info.map(item => `
        <div class="flex justify-between">
            <dt class="text-gray-500">${item.label}</dt>
            <dd class="text-gray-300 font-medium text-right">${item.value}</dd>
        </div>
    `).join('');

    // Add Release Status and Available Channels section
    html += `
        <div class="border-t border-gray-700/50 pt-3 mt-3">
            <dt class="text-gray-500 mb-2">Release Status</dt>
            <dd class="text-green-400 font-bold text-sm mb-3">${activeChannel.charAt(0).toUpperCase() + activeChannel.slice(1)}</dd>
            
            <dt class="text-gray-500 mb-2">Available Channels</dt>
            <dd class="text-xs space-y-1">
                ${channelsHtml}
            </dd>
        </div>
    `;

    sidebar.innerHTML = html;
}

async function buildActions(game) {
    const actionsContainer = document.getElementById('detailsActions');
    if (!actionsContainer) return;
    actionsContainer.innerHTML = '';

    // Play / Beta buttons
    game.actions.forEach(action => {
        if (action.type === 'play') {
            actionsContainer.innerHTML += `
                <button onclick="launchGame('${game.id}', '${game.path + action.url}')" class="${game.theme.btn} ${game.theme.btnHover} text-white font-bold py-3 px-8 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl btn-press">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    ${action.label}
                </button>
            `;
        } else if (action.type === 'beta') {
            actionsContainer.innerHTML += `
                <button onclick="${action.onClick}" class="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-6 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2 shadow-lg hover:shadow-xl btn-press">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"></path></svg>
                    ${action.label}
                </button>
            `;
        }
    });

    // Favorite toggle button
    const fav = await isFavorite(game.id);
    actionsContainer.innerHTML += `
        <button id="favToggleBtn" class="fav-btn ${fav ? 'favorited' : ''}" onclick="toggleFavorite('${game.id}')">
            <svg class="w-5 h-5 star-icon" fill="${fav ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
            </svg>
            ${fav ? 'Favorited' : 'Favorite'}
        </button>
    `;
}

async function buildDetailsAchievements(gameId) {
    const container = document.getElementById('detailsAchievements');
    if (!container) return;
    
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

function buildChangelog(game) {
    const container = document.getElementById('detailsChangelog');
    if (!container) return;
    
    const activeChannel = game.activeChannel || 'stable';
    const changelog = getChannelChangelog(game, activeChannel);

    if (changelog.length === 0) {
        container.innerHTML = '<p class="text-gray-500 text-xs italic">No changelog entries available.</p>';
        return;
    }

    // Show newest entries first
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

    container.innerHTML = html;
}

async function isFavorite(gameId) {
    const data = await Storage.getGameData(gameId);
    return data.favorite || false;
}

// Export for global access
window.showDetails = showDetails;
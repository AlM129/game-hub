// ==========================================
// STATISTICS MANAGER
// ==========================================
// Handles play statistics calculation and rendering

import { Storage } from '../../storage.js';

// ==========================================
// CALCULATION HELPERS
// ==========================================

export async function calculateTotalSessions() {
    const allGames = await getAllGamesWithPlayData(Storage);
    return allGames.reduce((sum, g) => sum + (g.playCount || 0), 0);
}

export async function getMostPlayedGame() {
    const allGames = await getAllGamesWithPlayData(Storage);
    const playedGames = allGames.filter(g => g.playCount > 0);
    if (playedGames.length === 0) return null;
    return playedGames.sort((a, b) => b.playCount - a.playCount)[0];
}

export async function getLastPlayedGame() {
    const recent = await getRecentlyPlayed();
    return recent.length > 0 ? recent[0] : null;
}

export async function getRecentlyPlayed() {
    const all = await getAllGamesWithPlayData(Storage);
    return all
        .filter(g => g.lastPlayed)
        .sort((a, b) => new Date(b.lastPlayed) - new Date(a.lastPlayed));
}

export async function getAllGamesWithPlayData(storage) {
    // This will be provided by the games system
    if (typeof window.getAllGamesWithPlayData === 'function') {
        return await window.getAllGamesWithPlayData(storage);
    }
    return [];
}

// ==========================================
// RENDERING
// ==========================================

export async function renderStatistics() {
    const allGames = await getAllGamesWithPlayData(Storage);
    
    // Overview Cards
    const statPageTotalGames = document.getElementById('statPageTotalGames');
    const statPageTotalSessions = document.getElementById('statPageTotalSessions');
    const statPageTotalFavs = document.getElementById('statPageTotalFavs');
    const statPageMostPlayed = document.getElementById('statPageMostPlayed');
    const statPageLastPlayed = document.getElementById('statPageLastPlayed');
    
    if (statPageTotalGames) statPageTotalGames.textContent = allGames.length;
    if (statPageTotalSessions) statPageTotalSessions.textContent = await calculateTotalSessions();
    if (statPageTotalFavs) statPageTotalFavs.textContent = (await getFavoriteGames()).length;

    const mostPlayed = await getMostPlayedGame();
    if (statPageMostPlayed) statPageMostPlayed.textContent = mostPlayed ? mostPlayed.title : '—';

    const lastPlayed = await getLastPlayedGame();
    if (statPageLastPlayed) statPageLastPlayed.textContent = lastPlayed ? lastPlayed.title : '—';

    // Per-Game Statistics List
    const listContainer = document.getElementById('statPageGamesList');
    if (!listContainer) return;
    
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
            statsHtml = `
                <div class="text-gray-500 text-sm italic md:mr-4">
                    No sessions recorded yet
                </div>
            `;
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

// ==========================================
// FAVORITES
// ==========================================

export async function getFavoriteGames() {
    const all = await getAllGamesWithPlayData(Storage);
    return all.filter(g => g.favorite);
}

// ==========================================
// UTILITIES
// ==========================================

function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ==========================================
// INITIALIZATION
// ==========================================

export function initialize() {
    console.log('Statistics system initialized');
}
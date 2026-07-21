// ==========================================
// ACHIEVEMENTS VIEW
// ==========================================
// Renders the achievements page with unlocked and locked achievements

import { Storage } from '../../storage.js';
import { 
    getAllAchievementDefinitions, 
    RARITY_CONFIG 
} from '../../systems/achievements/manager.js';
import { formatDate, getRarityBadge, getRarityBg } from '../../utils.js';
import { getGames } from '../../games/loader.js';

export async function renderAchievements() {
    const allDefs = getAllAchievementDefinitions();
    const loadedData = await Storage.load();
    const unlockedData = loadedData.achievements || {};
    
    // Calculate totals
    const totalAchievements = allDefs.length;
    let unlockedCount = 0;
    allDefs.forEach(ach => {
        if (unlockedData[ach.gameId] && unlockedData[ach.gameId][ach.id]) {
            unlockedCount++;
        }
    });

    // Update header stats
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

    // Helper to render a single achievement card
    function renderAchCard(ach, isUnlocked) {
        const unlockDate = isUnlocked ? unlockedData[ach.gameId][ach.id].date : null;
        const rarityBg = getRarityBg(ach.rarity, RARITY_CONFIG);
        const card = document.createElement('div');
        card.className = `bg-gray-800 rounded-xl border border-gray-700 p-4 flex items-center gap-4 ${isUnlocked ? rarityBg : 'opacity-60'}`;
        card.innerHTML = `
            <div class="text-3xl">${ach.icon}</div>
            <div class="flex-grow min-w-0">
                <h4 class="text-white font-bold text-sm flex items-center gap-2">
                    <span>${isUnlocked ? '✅' : '🔒'}</span> ${ach.title}
                    ${getRarityBadge(ach.rarity, RARITY_CONFIG)}
                </h4>
                <p class="text-gray-400 text-xs mt-1">${ach.description}</p>
            </div>
            ${isUnlocked ? `<div class="text-gray-500 text-[10px] flex-shrink-0">${formatDate(unlockDate)}</div>` : ''}
        `;
        return card;
    }

    // Render unlocked achievements (grouped by game)
    const unlockedContainer = document.getElementById('achUnlockedList');
    if (unlockedContainer) {
        unlockedContainer.innerHTML = '';

        let hasUnlocked = false;
        for (const gameId in groupedByGame) {
            const group = groupedByGame[gameId];
            if (group.unlocked.length === 0) continue;
            hasUnlocked = true;
            
            // Game group header
            const gameLabel = gameId === 'gamehub' ? 'Game Hub' : (getGames().find(g => g.id === gameId)?.title || gameId);
            const header = document.createElement('div');
            header.className = 'text-xs font-bold uppercase tracking-widest text-gray-500 mt-4 mb-2';
            header.textContent = `🏆 ${gameLabel}`;
            unlockedContainer.appendChild(header);
            
            group.unlocked.forEach(ach => {
                unlockedContainer.appendChild(renderAchCard(ach, true));
            });
        }

        if (!hasUnlocked) {
            unlockedContainer.innerHTML = '<p class="text-gray-600 text-sm mt-2">No achievements unlocked yet. Start playing to earn some!</p>';
        }
    }

    // Render locked achievements (grouped by game)
    const lockedContainer = document.getElementById('achLockedList');
    if (lockedContainer) {
        lockedContainer.innerHTML = '';

        let hasLocked = false;
        for (const gameId in groupedByGame) {
            const group = groupedByGame[gameId];
            if (group.locked.length === 0) continue;
            hasLocked = true;
            
            // Game group header
            const gameLabel = gameId === 'gamehub' ? 'Game Hub' : (getGames().find(g => g.id === gameId)?.title || gameId);
            const header = document.createElement('div');
            header.className = 'text-xs font-bold uppercase tracking-widest text-gray-500 mt-4 mb-2';
            header.textContent = `🎮 ${gameLabel}`;
            lockedContainer.appendChild(header);
            
            group.locked.forEach(ach => {
                lockedContainer.appendChild(renderAchCard(ach, false));
            });
        }

        if (!hasLocked) {
            lockedContainer.innerHTML = '<p class="text-gray-600 text-sm mt-2">All achievements unlocked! 🎉</p>';
        }
    }
}

// Export for global access
window.renderAchievements = renderAchievements;
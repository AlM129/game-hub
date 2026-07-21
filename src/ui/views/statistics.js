// ==========================================
// STATISTICS VIEW
// ==========================================
// Renders the statistics dashboard with play data

import { Storage } from '../../storage.js';
import { 
    calculateTotalSessions, 
    getMostPlayedGame, 
    getLastPlayedGame, 
    getFavoriteGames,
    renderStatistics as renderStats 
} from '../../systems/statistics/manager.js';

export async function renderStatistics() {
    await renderStats();
}

// Re-export the render function from the statistics manager
// This maintains backward compatibility with the global window.renderStatistics

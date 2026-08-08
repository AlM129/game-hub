// ==========================================
// ACHIEVEMENTS MANAGER
// ==========================================
// Centralized achievement database and management
// Game-specific achievements are registered dynamically at runtime
// Launcher-wide achievements use "gamehub" as the ID

// ==========================================
// RARITY CONFIGURATION
// ==========================================

export const RARITY_CONFIG = {
    common:     { label: "Common",    color: "text-gray-400",  bg: "bg-gray-700/50" },
    uncommon:   { label: "Uncommon",  color: "text-green-400", bg: "bg-green-900/30" },
    rare:       { label: "Rare",      color: "text-blue-400",  bg: "bg-blue-900/30" },
    epic:       { label: "Epic",      color: "text-purple-400",bg: "bg-purple-900/30" },
    legendary:  { label: "Legendary", color: "text-amber-400", bg: "bg-amber-900/30" },
    gold:       { label: "Gold",      color: "text-yellow-400", bg: "bg-yellow-900/30" }
};

// Set of game IDs that have opted into achievements
const enabledGames = new Set(['gamehub']);

export function setAchievementsEnabled(gameId, enabled) {
    if (enabled) {
        enabledGames.add(gameId);
    } else {
        enabledGames.delete(gameId);
    }
}

export function isAchievementsEnabled(gameId) {
    return enabledGames.has(gameId);
}

// ==========================================
// ACHIEVEMENT DEFINITIONS
// ==========================================
// Launcher-owned achievements are hardcoded here.
// Game-owned achievements are loaded dynamically via addGameAchievements().

export const achievements = {
    gamehub: {
        first_launch: {
            id: "first_launch",
            gameId: "gamehub",
            title: "First Launch",
            description: "Launch your first game",
            icon: "🎮",
            rarity: "common"
        },
        collector: {
            id: "collector",
            gameId: "gamehub",
            title: "Collector",
            description: "Favorite a game",
            icon: "⭐",
            rarity: "common"
        },
        explorer: {
            id: "explorer",
            gameId: "gamehub",
            title: "Explorer",
            description: "Launch every installed game",
            icon: "🗺️",
            rarity: "uncommon"
        },
        regular_player: {
            id: "regular_player",
            gameId: "gamehub",
            title: "Regular Player",
            description: "Reach 10 total sessions",
            icon: "🔥",
            rarity: "rare"
        }
    }
};

// ==========================================
// HELPER FUNCTIONS
// ==========================================

export function getAllAchievements(gameId) {
    const all = [];
    if (achievements[gameId]) {
        for (const achId in achievements[gameId]) {
            all.push({ ...achievements[gameId][achId], gameId });
        }
    }
    return all;
}

export function getAchievementDefinitions(gameId) {
    return getAllAchievements(gameId);
}

export function getAllAchievementDefinitions() {
    const all = [];
    for (const gameId in achievements) {
        for (const achId in achievements[gameId]) {
            all.push({ ...achievements[gameId][achId], gameId });
        }
    }
    return all;
}

export function addGameAchievements(gameId, achDefs) {
    if (!achievements[gameId]) {
        achievements[gameId] = {};
    }
    for (const achId in achDefs) {
        achievements[gameId][achId] = {
            id: achId,
            gameId: gameId,
            ...achDefs[achId]
        };
    }
    setAchievementsEnabled(gameId, true);
}

// ==========================================
// INITIALIZATION
// ==========================================

export function initialize() {
    console.log('Achievements system initialized');
}
// ==========================================
// ACHIEVEMENT DEFINITIONS
// ==========================================
// Centralized achievement database. Game-specific achievements can be added
// under their respective game IDs. Launcher-wide achievements use "gamehub" as the ID.
//
// Each achievement definition includes:
//   id          - Unique identifier within the game
//   gameId      - The game this achievement belongs to
//   title       - Display name
//   description - How to unlock
//   icon        - Emoji or icon string
//   rarity      - "common" | "uncommon" | "rare" | "epic" | "legendary"
//
// Future games can register achievements at runtime via addGameAchievements().

// Rarity display configuration
export const RARITY_CONFIG = {
    common:     { label: "Common",    color: "text-gray-400",  bg: "bg-gray-700/50" },
    uncommon:   { label: "Uncommon",  color: "text-green-400", bg: "bg-green-900/30" },
    rare:       { label: "Rare",      color: "text-blue-400",  bg: "bg-blue-900/30" },
    epic:       { label: "Epic",      color: "text-purple-400",bg: "bg-purple-900/30" },
    legendary:  { label: "Legendary", color: "text-amber-400", bg: "bg-amber-900/30" },
    gold:       { label: "Gold",      color: "text-yellow-400", bg: "bg-yellow-900/30" }
};

// Centralized achievement database
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
    },
    tactical_drone_defense: {
        wave_master: {
            id: "wave_master",
            gameId: "tactical_drone_defense",
            title: "Wave Master",
            description: "Survive wave 25",
            icon: "🏆",
            rarity: "gold"
        },
        first_scrap: {
            id: "first_scrap",
            gameId: "tactical_drone_defense",
            title: "First Scrap",
            description: "Complete your first wave",
            icon: "🔧",
            rarity: "common"
        },
        overcharged: {
            id: "overcharged",
            gameId: "tactical_drone_defense",
            title: "Overcharged",
            description: "Reach maximum overheat level",
            icon: "⚡",
            rarity: "uncommon"
        },
        warehouse_veteran: {
            id: "warehouse_veteran",
            gameId: "tactical_drone_defense",
            title: "Warehouse Veteran",
            description: "Survive 50 waves total",
            icon: "💪",
            rarity: "rare"
        },
        surgical_precision: {
            id: "surgical_precision",
            gameId: "tactical_drone_defense",
            title: "Surgical Precision",
            description: "Achieve 90% accuracy in a game",
            icon: "🎯",
            rarity: "epic"
        },
        juggernaut_killer: {
            id: "juggernaut_killer",
            gameId: "tactical_drone_defense",
            title: "Juggernaut Killer",
            description: "Defeat the Juggernaut boss",
            icon: "🤖",
            rarity: "epic"
        },
        legend: {
            id: "legend",
            gameId: "tactical_drone_defense",
            title: "Legend",
            description: "Survive wave 100",
            icon: "👑",
            rarity: "legendary"
        }
    },
    tactical_drone_defense_beta: {
        first_scrap: {
            id: "first_scrap",
            gameId: "tactical_drone_defense_beta",
            title: "First Scrap",
            description: "Destroy your very first enemy robot.",
            icon: "💥",
            rarity: "common"
        },
        fashion_forward: {
            id: "fashion_forward",
            gameId: "tactical_drone_defense_beta",
            title: "Fashion Forward",
            description: "Change your character skin in the main menu.",
            icon: "🧥",
            rarity: "common"
        },
        heavy_artillery: {
            id: "heavy_artillery",
            gameId: "tactical_drone_defense_beta",
            title: "Heavy Artillery",
            description: "Fire the Tower Cannon in Defend the Plane.",
            icon: "☢️",
            rarity: "uncommon"
        },
        surgical_precision: {
            id: "surgical_precision",
            gameId: "tactical_drone_defense_beta",
            title: "Surgical Precision",
            description: "Successfully land a 10x Damage Precision Strike.",
            icon: "🎯",
            rarity: "epic"
        },
        death_from_above: {
            id: "death_from_above",
            gameId: "tactical_drone_defense_beta",
            title: "Death From Above",
            description: "Successfully land a 3x Damage Airborne Critical.",
            icon: "🦅",
            rarity: "epic"
        },
        warehouse_veteran: {
            id: "warehouse_veteran",
            gameId: "tactical_drone_defense_beta",
            title: "Warehouse Veteran",
            description: "Reach Wave 5 in Warehouse Survival.",
            icon: "🏭",
            rarity: "uncommon"
        },
        airfield_defender: {
            id: "airfield_defender",
            gameId: "tactical_drone_defense_beta",
            title: "Airfield Defender",
            description: "Reach Wave 5 in Defend the Plane.",
            icon: "✈️",
            rarity: "uncommon"
        },
        juggernaut_slayer: {
            id: "juggernaut_slayer",
            gameId: "tactical_drone_defense_beta",
            title: "David vs. Goliath",
            description: "Defeat the massive Juggernaut Boss.",
            icon: "🦾",
            rarity: "epic"
        },
        fresh_supplies: {
            id: "fresh_supplies",
            gameId: "tactical_drone_defense_beta",
            title: "Fresh Supplies",
            description: "Receive health from defeating a Soldier for the first time without exceeding 100 HP.",
            icon: "💚",
            rarity: "common"
        },
        overcharged: {
            id: "overcharged",
            gameId: "tactical_drone_defense_beta",
            title: "Overcharged",
            description: "Increase your suit integrity above 100 HP using the Overheal system.",
            icon: "⚡",
            rarity: "uncommon"
        },
        tactical_drone_denied: {
            id: "tactical_drone_denied",
            gameId: "tactical_drone_defense_beta",
            title: "Tactical Drone Denied",
            description: "Destroy a Controller before destroying any Drones in the current wave.",
            icon: "📡",
            rarity: "rare"
        },
        drone_hunter: {
            id: "drone_hunter",
            gameId: "tactical_drone_defense_beta",
            title: "Drone Hunter",
            description: "Destroy 100 Drones.",
            icon: "🤖",
            rarity: "rare"
        },
        elite_eliminator: {
            id: "elite_eliminator",
            gameId: "tactical_drone_defense_beta",
            title: "Elite Eliminator",
            description: "Destroy 5 Elite Guards.",
            icon: "⭐",
            rarity: "rare"
        },
        boss_slayer: {
            id: "boss_slayer",
            gameId: "tactical_drone_defense_beta",
            title: "Boss Slayer",
            description: "Defeat any boss enemy.",
            icon: "👹",
            rarity: "epic"
        },
        warehouse_survivor: {
            id: "warehouse_survivor",
            gameId: "tactical_drone_defense_beta",
            title: "Warehouse Survivor",
            description: "Survive wave 10 in Warehouse Survival.",
            icon: "🛡️",
            rarity: "uncommon"
        },
        warehouse_champion: {
            id: "warehouse_champion",
            gameId: "tactical_drone_defense_beta",
            title: "Warehouse Champion",
            description: "Survive wave 20 in Warehouse Survival.",
            icon: "🏆",
            rarity: "rare"
        },
        warehouse_legend: {
            id: "warehouse_legend",
            gameId: "tactical_drone_defense_beta",
            title: "Warehouse Legend",
            description: "Survive wave 30 in Warehouse Survival.",
            icon: "👑",
            rarity: "legendary"
        },
        no_survivors: {
            id: "no_survivors",
            gameId: "tactical_drone_defense_beta",
            title: "No Survivors",
            description: "Complete a wave without taking any damage.",
            icon: "💀",
            rarity: "epic"
        }
    },
    neon_survival: {
        first_kill: {
            id: "first_kill",
            gameId: "neon_survival",
            title: "First Target",
            description: "Kill your first enemy",
            icon: "🎯",
            rarity: "common"
        },
        eliminator: {
            id: "eliminator",
            gameId: "neon_survival",
            title: "Eliminator",
            description: "Kill 100 enemies",
            icon: "⚡",
            rarity: "uncommon"
        },
        destroyer: {
            id: "destroyer",
            gameId: "neon_survival",
            title: "Destroyer",
            description: "Kill 1000 enemies",
            icon: "💥",
            rarity: "rare"
        },
        high_score: {
            id: "high_score",
            gameId: "neon_survival",
            title: "High Score",
            description: "Reach 1,000 score",
            icon: "🏆",
            rarity: "uncommon"
        },
        legend: {
            id: "legend",
            gameId: "neon_survival",
            title: "Legend",
            description: "Reach 10,000 score",
            icon: "👑",
            rarity: "rare"
        },
        neon_survivor: {
            id: "neon_survivor",
            gameId: "neon_survival",
            title: "Neon Survivor",
            description: "Reach 100,000 score",
            icon: "🌟",
            rarity: "legendary"
        },
        survivor: {
            id: "survivor",
            gameId: "neon_survival",
            title: "Survivor",
            description: "Stay alive for 5 minutes",
            icon: "⏱️",
            rarity: "uncommon"
        },
        endurance: {
            id: "endurance",
            gameId: "neon_survival",
            title: "Endurance",
            description: "Stay alive for 30 minutes",
            icon: "🔥",
            rarity: "epic"
        },
        dash_master: {
            id: "dash_master",
            gameId: "neon_survival",
            title: "Dash Master",
            description: "Dash 100 times",
            icon: "💨",
            rarity: "uncommon"
        },
        power_collector: {
            id: "power_collector",
            gameId: "neon_survival",
            title: "Power Collector",
            description: "Collect 50 powerups",
            icon: "⚡",
            rarity: "uncommon"
        },
        deadeye: {
            id: "deadeye",
            gameId: "neon_survival",
            title: "Deadeye",
            description: "Achieve 80% accuracy (>100 shots)",
            icon: "🎯",
            rarity: "epic"
        },
        explorer: {
            id: "explorer",
            gameId: "neon_survival",
            title: "Explorer",
            description: "Travel 10,000 units",
            icon: "🗺️",
            rarity: "uncommon"
        },
        completionist: {
            id: "completionist",
            gameId: "neon_survival",
            title: "Achievement Hunter",
            description: "Unlock all other achievements",
            icon: "🏅",
            rarity: "legendary"
        }
    }
};

// Helper function to get all achievements for a game
export function getAllAchievements(gameId) {
    const all = [];
    for (const achId in achievements[gameId]) {
        all.push({ ...achievements[gameId][achId], gameId });
    }
    return all;
}

// Get achievement definitions for a specific game (used by app.js)
export function getAchievementDefinitions(gameId) {
    return getAllAchievements(gameId);
}

// Get all achievement definitions across all games (used by app.js)
export function getAllAchievementDefinitions() {
    const all = [];
    for (const gameId in achievements) {
        for (const achId in achievements[gameId]) {
            all.push({ ...achievements[gameId][achId], gameId });
        }
    }
    return all;
}

// Function to add achievements for a new game
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
}

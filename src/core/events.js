// ==========================================
// EVENTS - Game Hub Bridge System
// ==========================================
// Centralized event handling for game-launcher communication
// Handles game_started, game_closed, and achievement_unlock events

import { Storage } from '../storage.js';
import { getAchievementDefinitions, addGameAchievements, achievements } from '../systems/achievements/manager.js';

// ==========================================
// EVENT SCHEMA
// ==========================================

const EventSchema = {
    achievement_unlock: {
        required: ['gameId', 'data'],
        dataRequired: ['achievementId']
    },
    game_started: {
        required: ['gameId', 'data'],
        dataRequired: ['version', 'channel']
    },
    game_closed: {
        required: ['gameId'],
        dataRequired: []
    }
};

// ==========================================
// VALIDATION
// ==========================================

export function validateEvent(event) {
    if (!event || typeof event !== 'object') {
        console.warn('GameHub: event validation failed - Event must be an object');
        return { valid: false, error: 'Event must be an object' };
    }
    
    if (!event.type || typeof event.type !== 'string') {
        console.warn('GameHub: event validation failed - Event must have a valid type string');
        return { valid: false, error: 'Event must have a valid type string' };
    }
    
    const schema = EventSchema[event.type];
    if (!schema) {
        console.warn(`GameHub: event validation failed - Unknown event type: ${event.type}`);
        return { valid: false, error: `Unknown event type: ${event.type}` };
    }
    
    // Check required top-level fields
    for (const field of schema.required) {
        if (event[field] === undefined || event[field] === null) {
            return { valid: false, error: `Missing required field: ${field}` };
        }
    }
    
    // Check required data fields
    if (event.data && schema.dataRequired) {
        for (const field of schema.dataRequired) {
            if (event.data[field] === undefined || event.data[field] === null) {
                return { valid: false, error: `Missing required data field: ${field}` };
            }
        }
    }
    
    return { valid: true };
}

// ==========================================
// EVENT HANDLERS
// ==========================================

export async function processAchievementUnlock(event) {
    const { gameId, data } = event;
    const { achievementId } = data;
    
    // Ensure the achievement is registered (games may self-register at runtime)
    if (!achievements[gameId] || !achievements[gameId][achievementId]) {
        console.warn(`GameHub: unknown achievement "${achievementId}" for game "${gameId}"`);
        return false;
    }
    
    const gameAchievements = await Storage.getAchievements(gameId);
    const wasUnlocked = !!gameAchievements[achievementId];
    await Storage.unlockAchievement(gameId, achievementId);
    
    // Refresh visible achievement UI if the user is currently viewing it
    if (typeof window.getCurrentView === 'function' && window.getCurrentView() === 'achievements') {
        if (typeof window.renderAchievements === 'function') {
            window.renderAchievements();
        }
    }
    if (typeof window.getCurrentView === 'function' && 
        window.getCurrentView() === 'details' && 
        typeof window.getCurrentDetailGameId === 'function' &&
        window.getCurrentDetailGameId() === gameId) {
        if (typeof window.buildDetailsAchievements === 'function') {
            window.buildDetailsAchievements(gameId);
        }
    }
    
    return !wasUnlocked;
}

export function processGameStarted(event) {
    const { gameId, data } = event;
    console.log(`GameHub: "${gameId}" session started (${data.channel} v${data.version})`);
    return {
        received: true,
        timestamp: Date.now()
    };
}

export function processGameClosed(event) {
    const { gameId } = event;
    console.log(`GameHub: "${gameId}" session closed`);
    return {
        received: true,
        timestamp: Date.now()
    };
}

const EventHandlers = {
    achievement_unlock: processAchievementUnlock,
    game_started:       processGameStarted,
    game_closed:        processGameClosed
};

// ==========================================
// GAME HUB BRIDGE API
// ==========================================

export const GameHub = {
    // Handle an incoming event from a game
    // Returns { success: true, result: ... } or { success: false, error: "..." }
    async handleEvent(event) {
        // Validate the event
        const validation = validateEvent(event);
        if (!validation.valid) {
            console.warn(`GameHub: event validation failed - ${validation.error}`);
            return { success: false, error: validation.error };
        }
        
        // Route to appropriate handler
        const handler = EventHandlers[event.type];
        if (!handler) {
            return { success: false, error: `No handler for event type: ${event.type}` };
        }
        
        try {
            const result = await handler(event);
            return { success: true, result };
        } catch (e) {
            console.error(`GameHub: error processing event`, e);
            return { success: false, error: e.message };
        }
    },
    
    // Legacy method - kept for backward compatibility
    // Report that a game's achievement was earned. Returns true if newly unlocked.
    async reportAchievement(gameId, achievementId) {
        const result = await this.handleEvent({
            type: 'achievement_unlock',
            gameId,
            data: { achievementId }
        });
        return result.result;
    },
    
    // Register achievements for a game (callable from game pages before reporting)
    registerAchievements(gameId, achievementsMap) {
        addGameAchievements(gameId, achievementsMap);
    },
    
    // Query whether an achievement is unlocked
    async isUnlocked(gameId, achievementId) {
        const achievements = await Storage.getAchievements(gameId);
        return !!achievements[achievementId];
    }
};

// Export for global access
window.GameHub = GameHub;
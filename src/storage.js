// ==========================================
// STORAGE LAYER (Compatibility Layer)
// ==========================================
// This module provides the same API as before but routes all data
// through the new electron-store-backed core storage system.
//
// Exported API matches the original Storage object so that existing
// launcher code (app.js) works without modification.
//
// IMPORTANT: All profile-owned data (achievements, statistics, settings,
// saves) is resolved against the ACTIVE profile at runtime. This ensures
// profiles are fully isolated — switching profiles switches all data.

import { Storage as CoreStorage } from './core/storage.js';

/**
 * Resolve the active profile's storage prefix dynamically.
 * This ensures all reads/writes target the currently active profile,
 * not a hardcoded default.
 */
async function _getActiveProfilePrefix() {
    try {
        if (window.profiles && typeof window.profiles.get === 'function') {
            const activeProfile = await window.profiles.get();
            if (activeProfile && activeProfile.id) {
                return `profiles.${activeProfile.id}`;
            }
        }
    } catch (e) {
        // window.profiles may not be available during early initialization
    }
    return 'profiles.default';
}

export const Storage = {
    _defaults() {
        return {
            profile: 'default',
            games: {},
            settings: { volume: 80, theme: 'dark' },
            achievements: {},
            gameUpdateHistory: {}
        };
    },

    async load() {
        try {
            const prefix = await _getActiveProfilePrefix();
            const settings = await CoreStorage.get(`${prefix}.settings`) || {};
            const achievements = await CoreStorage.get(`${prefix}.achievements`) || {};
            const gamePlayHistory = await CoreStorage.get(`${prefix}.statistics.gamePlayHistory`) || {};
            const updateHistory = await CoreStorage.get(`${prefix}.saves.updateHistory`) || {};

            const games = {};
            for (const [gameId, stats] of Object.entries(gamePlayHistory)) {
                games[gameId] = {
                    lastPlayed: stats.lastPlayed || null,
                    playCount: stats.playCount || 0,
                    favorite: stats.favorite || false,
                    activeChannel: stats.activeChannel || 'stable'
                };
            }

            const activeProfile = await _getActiveProfile();
            return {
                profile: activeProfile ? activeProfile.id : 'default',
                games,
                settings: { volume: settings.volume ?? 80, theme: settings.theme ?? 'dark' },
                achievements,
                gameUpdateHistory: updateHistory
            };
        } catch (e) {
            console.warn('Storage: failed to load, using defaults', e);
            return this._defaults();
        }
    },

    async save(data) {
        try {
            const prefix = await _getActiveProfilePrefix();
            if (data.settings) {
                await CoreStorage.set(`${prefix}.settings`, {
                    volume: data.settings.volume ?? 80,
                    theme: data.settings.theme ?? 'dark'
                });
            }
            if (data.achievements) {
                await CoreStorage.set(`${prefix}.achievements`, data.achievements);
            }
            if (data.games) {
                const gameStats = {};
                for (const [gameId, gameData] of Object.entries(data.games)) {
                    gameStats[gameId] = {
                        lastPlayed: gameData.lastPlayed || null,
                        playCount: gameData.playCount || 0,
                        favorite: gameData.favorite || false,
                        activeChannel: gameData.activeChannel || 'stable'
                    };
                }
                await CoreStorage.set(`${prefix}.statistics.gamePlayHistory`, gameStats);
            }
            if (data.gameUpdateHistory) {
                await CoreStorage.set(`${prefix}.saves.updateHistory`, data.gameUpdateHistory);
            }
        } catch (e) {
            console.warn('Storage: failed to save', e);
        }
    },

    async getGameData(gameId) {
        const prefix = await _getActiveProfilePrefix();
        const gamePlayHistory = await CoreStorage.get(`${prefix}.statistics.gamePlayHistory`) || {};
        const gameData = gamePlayHistory[gameId];
        return gameData || { lastPlayed: null, playCount: 0, favorite: false, activeChannel: 'stable' };
    },

    async setGameData(gameId, updates) {
        const prefix = await _getActiveProfilePrefix();
        const gamePlayHistory = await CoreStorage.get(`${prefix}.statistics.gamePlayHistory`) || {};
        const existing = gamePlayHistory[gameId] || { lastPlayed: null, playCount: 0, favorite: false, activeChannel: 'stable' };
        gamePlayHistory[gameId] = { ...existing, ...updates };
        await CoreStorage.set(`${prefix}.statistics.gamePlayHistory`, gamePlayHistory);
    },

    async getSetting(key) {
        const prefix = await _getActiveProfilePrefix();
        const settings = await CoreStorage.get(`${prefix}.settings`) || {};
        return settings[key];
    },

    async setSetting(key, value) {
        const prefix = await _getActiveProfilePrefix();
        const settings = await CoreStorage.get(`${prefix}.settings`) || {};
        settings[key] = value;
        await CoreStorage.set(`${prefix}.settings`, settings);
    },

    async getAchievements(gameId) {
        const prefix = await _getActiveProfilePrefix();
        const achievements = await CoreStorage.get(`${prefix}.achievements`) || {};
        return achievements[gameId] || {};
    },

    async unlockAchievement(gameId, achievementId) {
        const prefix = await _getActiveProfilePrefix();
        const achievements = await CoreStorage.get(`${prefix}.achievements`) || {};
        if (!achievements[gameId]) {
            achievements[gameId] = {};
        }
        if (!achievements[gameId][achievementId]) {
            achievements[gameId][achievementId] = {
                unlocked: true,
                date: new Date().toISOString().split('T')[0]
            };
            await CoreStorage.set(`${prefix}.achievements`, achievements);
        }
    },

    async getStorageSize() {
        try {
            const data = await CoreStorage.export();
            const raw = JSON.stringify(data);
            const bytes = new Blob([raw]).size;
            if (bytes < 1024) return `${bytes} B`;
            return `${(bytes / 1024).toFixed(1)} KB`;
        } catch {
            return '0 B';
        }
    },

    async getUpdateHistory(gameId, channel = 'stable') {
        const prefix = await _getActiveProfilePrefix();
        const updateHistory = await CoreStorage.get(`${prefix}.saves.updateHistory`) || {};
        if (updateHistory[gameId]) {
            if (typeof updateHistory[gameId] === 'object' && !Array.isArray(updateHistory[gameId])) {
                return updateHistory[gameId][channel] || { lastSeenVersion: null };
            }
        }
        return updateHistory[gameId] || { lastSeenVersion: null };
    },

    async setUpdateHistory(gameId, version, channel = 'stable') {
        const prefix = await _getActiveProfilePrefix();
        const updateHistory = await CoreStorage.get(`${prefix}.saves.updateHistory`) || {};
        if (!updateHistory[gameId]) {
            updateHistory[gameId] = {};
        }
        updateHistory[gameId][channel] = { lastSeenVersion: version };
        await CoreStorage.set(`${prefix}.saves.updateHistory`, updateHistory);
    },

    async reset() {
        await CoreStorage.reset();
    },

    // ==========================================
    // INSTALLED GAMES STORAGE (Launcher-level)
    // ==========================================
    // Profile-independent storage for tracking installed games

    /**
     * Get all installed games.
     * @returns {Object} Map of gameId -> { version, path, installedAt, source }
     */
    async getInstalledGames() {
        return await CoreStorage.getInstalledGames();
    },

    /**
     * Set installed game data.
     * @param {string} gameId - Game identifier
     * @param {Object} data - Installation data { version, path, installedAt, source }
     */
    async setInstalledGame(gameId, data) {
        await CoreStorage.setInstalledGame(gameId, data);
    },

    /**
     * Remove installed game entry.
     * @param {string} gameId - Game identifier
     */
    async removeInstalledGame(gameId) {
        await CoreStorage.removeInstalledGame(gameId);
    },

    /**
     * Check if a game is installed.
     * @param {string} gameId - Game identifier
     * @returns {boolean}
     */
    async isGameInstalled(gameId) {
        return await CoreStorage.hasInstalledGame(gameId);
    },

    /**
     * Get installation data for a specific game.
     * @param {string} gameId - Game identifier
     * @returns {Object|null} Installation data or null
     */
    async getInstalledGame(gameId) {
        return await CoreStorage.getInstalledGame(gameId);
    }
};

// ==========================================
// INTERNAL HELPERS
// ==========================================

async function _getActiveProfile() {
    try {
        if (window.profiles && typeof window.profiles.get === 'function') {
            return await window.profiles.get();
        }
    } catch (e) {
        // Not available during early initialization
    }
    return null;
}
// ==========================================
// STORAGE LAYER (Compatibility Layer)
// ==========================================
// This module provides the same API as before but routes all data
// through the new electron-store-backed core storage system.
//
// Exported API matches the original Storage object so that existing
// launcher code (app.js, games.js) works without modification.

import { Storage as CoreStorage } from './core/storage.js';

const PROFILE = CoreStorage.defaultProfile;
const PROF_PREFIX = `profiles.${PROFILE}`;

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
            const settings = await CoreStorage.get(`${PROF_PREFIX}.settings`) || {};
            const achievements = await CoreStorage.get(`${PROF_PREFIX}.achievements`) || {};
            const gamePlayHistory = await CoreStorage.get(`${PROF_PREFIX}.statistics.gamePlayHistory`) || {};
            const updateHistory = await CoreStorage.get(`${PROF_PREFIX}.saves.updateHistory`) || {};

            const games = {};
            for (const [gameId, stats] of Object.entries(gamePlayHistory)) {
                games[gameId] = {
                    lastPlayed: stats.lastPlayed || null,
                    playCount: stats.playCount || 0,
                    favorite: stats.favorite || false,
                    activeChannel: stats.activeChannel || 'stable'
                };
            }

            return {
                profile: PROFILE,
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
            if (data.settings) {
                await CoreStorage.set(`${PROF_PREFIX}.settings`, {
                    volume: data.settings.volume ?? 80,
                    theme: data.settings.theme ?? 'dark'
                });
            }
            if (data.achievements) {
                await CoreStorage.set(`${PROF_PREFIX}.achievements`, data.achievements);
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
                await CoreStorage.set(`${PROF_PREFIX}.statistics.gamePlayHistory`, gameStats);
            }
            if (data.gameUpdateHistory) {
                await CoreStorage.set(`${PROF_PREFIX}.saves.updateHistory`, data.gameUpdateHistory);
            }
        } catch (e) {
            console.warn('Storage: failed to save', e);
        }
    },

    async getGameData(gameId) {
        const gamePlayHistory = await CoreStorage.get(`${PROF_PREFIX}.statistics.gamePlayHistory`) || {};
        const gameData = gamePlayHistory[gameId];
        return gameData || { lastPlayed: null, playCount: 0, favorite: false, activeChannel: 'stable' };
    },

    async setGameData(gameId, updates) {
        const gamePlayHistory = await CoreStorage.get(`${PROF_PREFIX}.statistics.gamePlayHistory`) || {};
        const existing = gamePlayHistory[gameId] || { lastPlayed: null, playCount: 0, favorite: false, activeChannel: 'stable' };
        gamePlayHistory[gameId] = { ...existing, ...updates };
        await CoreStorage.set(`${PROF_PREFIX}.statistics.gamePlayHistory`, gamePlayHistory);
    },

    async getSetting(key) {
        const settings = await CoreStorage.get(`${PROF_PREFIX}.settings`) || {};
        return settings[key];
    },

    async setSetting(key, value) {
        const settings = await CoreStorage.get(`${PROF_PREFIX}.settings`) || {};
        settings[key] = value;
        await CoreStorage.set(`${PROF_PREFIX}.settings`, settings);
    },

    async getAchievements(gameId) {
        const achievements = await CoreStorage.get(`${PROF_PREFIX}.achievements`) || {};
        return achievements[gameId] || {};
    },

    async unlockAchievement(gameId, achievementId) {
        const achievements = await CoreStorage.get(`${PROF_PREFIX}.achievements`) || {};
        if (!achievements[gameId]) {
            achievements[gameId] = {};
        }
        if (!achievements[gameId][achievementId]) {
            achievements[gameId][achievementId] = {
                unlocked: true,
                date: new Date().toISOString().split('T')[0]
            };
            await CoreStorage.set(`${PROF_PREFIX}.achievements`, achievements);
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
        const updateHistory = await CoreStorage.get(`${PROF_PREFIX}.saves.updateHistory`) || {};
        if (updateHistory[gameId]) {
            if (typeof updateHistory[gameId] === 'object' && !Array.isArray(updateHistory[gameId])) {
                return updateHistory[gameId][channel] || { lastSeenVersion: null };
            }
        }
        return updateHistory[gameId] || { lastSeenVersion: null };
    },

    async setUpdateHistory(gameId, version, channel = 'stable') {
        const updateHistory = await CoreStorage.get(`${PROF_PREFIX}.saves.updateHistory`) || {};
        if (!updateHistory[gameId]) {
            updateHistory[gameId] = {};
        }
        updateHistory[gameId][channel] = { lastSeenVersion: version };
        await CoreStorage.set(`${PROF_PREFIX}.saves.updateHistory`, updateHistory);
    },

    async reset() {
        await CoreStorage.reset();
    }
};

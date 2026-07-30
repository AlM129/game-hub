// ==========================================
// CORE STORAGE SYSTEM
// ==========================================
// Renderer-side storage abstraction.
// Uses window.storage (exposed by preload.js) to communicate with the main process.
// No Node/Electron modules are imported here.

const DEFAULT_PROFILE = 'default';
const PROF_PREFIX = `profiles.${DEFAULT_PROFILE}`;

function getDefaultSettings() {
    return { volume: 80, theme: 'dark' };
}

function getDefaultProfile() {
    return {
        settings: getDefaultSettings(),
        achievements: {},
        statistics: { totalSessions: 0, gamePlayHistory: {} },
        saves: {}
    };
}

function getDefaultStore() {
    return {
        metadata: { version: 1, lastMigration: null },
        profiles: { [DEFAULT_PROFILE]: getDefaultProfile() },
        preferences: {}
    };
}

export const Storage = {
    /**
     * Get a value by dot-notation key path.
     */
    async get(key) {
        if (!window.storage) {
            console.warn('[Storage] window.storage not available');
            return undefined;
        }
        return await window.storage.get(key);
    },

    /**
     * Set a value by dot-notation key path.
     */
    async set(key, value) {
        if (!window.storage) {
            console.warn('[Storage] window.storage not available');
            return;
        }
        await window.storage.set(key, value);
    },

    /**
     * Delete a key.
     */
    async delete(key) {
        if (!window.storage) {
            console.warn('[Storage] window.storage not available');
            return;
        }
        await window.storage.delete(key);
    },

    /**
     * Check if a key exists.
     */
    async has(key) {
        if (!window.storage) {
            console.warn('[Storage] window.storage not available');
            return false;
        }
        return await window.storage.has(key);
    },

    /**
     * Export all data.
     */
    async export() {
        if (!window.storage) {
            console.warn('[Storage] window.storage not available');
            return getDefaultStore();
        }
        return await window.storage.export();
    },

    /**
     * Import data (replaces all existing data).
     */
    async import(data) {
        if (!window.storage) {
            console.warn('[Storage] window.storage not available');
            return;
        }
        await window.storage.import(data);
    },

    /**
     * Get the full store object.
     */
    async getAll() {
        return await this.export();
    },

    /**
     * Reset to defaults.
     */
    async reset() {
        if (!window.storage) {
            console.warn('[Storage] window.storage not available');
            return;
        }
        await window.storage.import(getDefaultStore());
    },

    /**
     * Get all profiles.
     */
    async getProfiles() {
        return (await this.get('profiles')) || {};
    },

    /**
     * Get the active profile object.
     */
    async getProfile() {
        const activeProfileId = await this.get('metadata.activeProfileId') || DEFAULT_PROFILE;
        return await this.get(`profiles.${activeProfileId}`) || null;
    },

    /**
     * Set a profile by ID.
     */
    async setProfile(id, profile) {
        await this.set(`profiles.${id}`, profile);
    },

    /**
     * Set the active profile ID.
     */
    async setActiveProfileId(profileId) {
        await this.set('metadata.activeProfileId', profileId);
        return profileId;
    },

    /**
     * Delete a profile by ID.
     */
    async deleteProfile(profileId) {
        await this.delete(`profiles.${profileId}`);
        return true;
    },

    get defaultProfile() {
        return DEFAULT_PROFILE;
    },

    get version() {
        return 1;
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
        return (await this.get('installedGames')) || {};
    },

    /**
     * Set installed game data.
     * @param {string} gameId - Game identifier
     * @param {Object} data - Installation data { version, path, installedAt, source }
     */
    async setInstalledGame(gameId, data) {
        const installed = await this.getInstalledGames();
        installed[gameId] = data;
        await this.set('installedGames', installed);
    },

    /**
     * Remove installed game entry.
     * @param {string} gameId - Game identifier
     */
    async removeInstalledGame(gameId) {
        const installed = await this.getInstalledGames();
        delete installed[gameId];
        await this.set('installedGames', installed);
    },

    /**
     * Check if a game is installed.
     * @param {string} gameId - Game identifier
     * @returns {boolean}
     */
    async hasInstalledGame(gameId) {
        const installed = await this.getInstalledGames();
        return !!installed[gameId];
    },

    /**
     * Get installation data for a specific game.
     * @param {string} gameId - Game identifier
     * @returns {Object|null} Installation data or null
     */
    async getInstalledGame(gameId) {
        const installed = await this.getInstalledGames();
        return installed[gameId] || null;
    }
};

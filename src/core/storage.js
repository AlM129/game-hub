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

    get defaultProfile() {
        return DEFAULT_PROFILE;
    },

    get version() {
        return 1;
    }
};
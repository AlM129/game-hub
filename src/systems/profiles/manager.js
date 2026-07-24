// ==========================================
// PROFILES MANAGER
// ==========================================
// Foundation API for user profile management.
// Backed by CoreStorage which handles persistence.
// No UI — this is the data layer only.

import { Storage as CoreStorage } from '../../core/storage.js';

const DEFAULT_PROFILE = 'default';

function nowIso() {
    return new Date().toISOString();
}

/**
 * Get all profiles.
 * @returns {Promise<Object>} Map of profileId -> profile
 */
export async function getProfiles() {
    return await CoreStorage.getProfiles();
}

/**
 * Get the active profile object.
 * @returns {Promise<Object|null>}
 */
export async function getActiveProfile() {
    return await CoreStorage.getProfile();
}

/**
 * Create a new profile.
 * @param {string} name - Display name for the profile
 * @param {Object} [overrides] - Optional overrides for settings/achievements/etc.
 * @returns {Promise<Object>} The created profile
 */
export async function createProfile(name, overrides = {}) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('Profile name is required');
    }

    const profiles = await CoreStorage.getProfiles();
    const id = generateProfileId(name, profiles);

    const profile = {
        id,
        name: name.trim(),
        type: 'custom',
        settings: { volume: 80, theme: 'dark', ...(overrides.settings || {}) },
        achievements: { ...(overrides.achievements || {}) },
        statistics: {
            totalSessions: 0,
            gamePlayHistory: {},
            ...(overrides.statistics || {}),
            gamePlayHistory: {
                ...((overrides.statistics && overrides.statistics.gamePlayHistory) || {})
            }
        },
        saves: { ...(overrides.saves || {}) },
        createdAt: nowIso()
    };

    await CoreStorage.setProfile(id, profile);
    return profile;
}

/**
 * Switch the active profile.
 * @param {string} profileId
 * @returns {Promise<string>} The active profile ID
 */
export async function switchProfile(profileId) {
    const profiles = await CoreStorage.getProfiles();
    if (!profiles[profileId]) {
        throw new Error(`Profile not found: ${profileId}`);
    }
    return await CoreStorage.setActiveProfileId(profileId);
}

/**
 * Delete a profile. Cannot delete the 'default' profile.
 * If the deleted profile was active, falls back to 'default'.
 * @param {string} profileId
 * @returns {Promise<boolean>} Whether deletion succeeded
 */
export async function deleteProfile(profileId) {
    if (profileId === DEFAULT_PROFILE) {
        throw new Error('Cannot delete the default profile');
    }
    return await CoreStorage.deleteProfile(profileId);
}

/**
 * Export a profile as a portable JSON object.
 * @param {string} profileId
 * @returns {Promise<Object>} Serializable profile data
 */
export async function exportProfile(profileId) {
    const profiles = await CoreStorage.getProfiles();
    const profile = profiles[profileId];
    if (!profile) {
        throw new Error(`Profile not found: ${profileId}`);
    }
    return {
        id: profile.id,
        name: profile.name,
        type: profile.type,
        settings: { ...profile.settings },
        achievements: JSON.parse(JSON.stringify(profile.achievements)),
        statistics: JSON.parse(JSON.stringify(profile.statistics)),
        saves: JSON.parse(JSON.stringify(profile.saves)),
        exportedAt: nowIso()
    };
}

/**
 * Import a profile from a portable JSON object.
 * Always generates a new profile ID and forces type to 'custom'
 * to avoid overwriting the built-in Default profile.
 * @param {Object} data - Profile data (as exported by exportProfile)
 * @returns {Promise<Object>} The imported profile
 */
export async function importProfile(data) {
    if (!data || !data.name) {
        throw new Error('Invalid profile data: name is required');
    }

    const profiles = await CoreStorage.getProfiles();
    // Always generate a new ID for imported profiles to prevent:
    // - overwriting the built-in Default profile
    // - ID collisions with existing profiles
    // - imported profiles retaining "default" type (preventing deletion)
    const id = generateProfileId(data.name, profiles);

    // Preserve "Backup" suffix on name if it's the default profile being imported
    const importedName = data.type === 'default' ? `${data.name} Backup` : data.name;

    const profile = {
        id,
        name: importedName,
        type: 'custom', // Force imported profiles to 'custom' type so they can be deleted
        settings: { volume: 80, theme: 'dark', ...(data.settings || {}) },
        achievements: { ...(data.achievements || {}) },
        statistics: {
            totalSessions: Number(data.statistics?.totalSessions || 0),
            gamePlayHistory: { ...((data.statistics && data.statistics.gamePlayHistory) || {}) }
        },
        saves: { ...(data.saves || {}) },
        createdAt: nowIso()
    };

    await CoreStorage.setProfile(id, profile);
    return profile;
}

/**
 * Initialize the profiles system.
 * Ensures the default profile exists.
 */
export async function initialize() {
    const profiles = await CoreStorage.getProfiles();
    if (!profiles[DEFAULT_PROFILE]) {
        await CoreStorage.setProfile(DEFAULT_PROFILE, {
            id: DEFAULT_PROFILE,
            name: 'Default',
            type: 'default',
            settings: { volume: 80, theme: 'dark' },
            achievements: {},
            statistics: { totalSessions: 0, gamePlayHistory: {} },
            saves: {}
        });
    }
    console.log('Profiles system initialized');
}

// ==========================================
// INTERNAL HELPERS
// ==========================================

function generateProfileId(name, existingProfiles) {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile';
    let id = base;
    let counter = 1;
    while (existingProfiles[id]) {
        id = `${base}-${counter}`;
        counter++;
    }
    return id;
}
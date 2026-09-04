// ==========================================
// GAME HUB PROFILE BACKUP (.gamehub)
// ==========================================
// Exports and imports a portable .gamehub profile container.
//
// The .gamehub file is a ZIP containing:
//   manifest.json   - format/version metadata
//   profile.json    - Game Hub profile data (existing export format)
//   games/<id>/backup.json - per-game save-data snapshot (optional)
//
// Game save data lives in the SHARED localStorage that Game Hub and every
// installed game share (same Electron default session / same origin). This is
// the storage the existing "keep save data on uninstall" flow already protects
// (see saveCleanup.js: createDefaultPageHost runs in the default session, so a
// hosted game page reads/writes the game's own localStorage).
//
// Backup = snapshot those shared localStorage entries (excluding keys Game Hub
// itself owns). Restore = write them back into the same shared localStorage,
// non-destructively (only fills keys that are absent, so newer progress is
// never overwritten). No game-specific keys or schemas are hard-coded and no
// game backup API is required.
//
// This module runs in the main (Node.js) process.

const AdmZip = require('adm-zip');
const { createDefaultPageHost } = require('../../downloader/saveCleanup');

const FORMAT = 'gamehub';
const FORMAT_VERSION = 1;

// localStorage keys owned by Game Hub itself (registry cache, the game<->launcher
// bridge queue, and the legacy pre-migration store). These must never be treated
// as game save data.
const LAUNCHER_LS_KEYS = [
    'gamehub-registry-cache',
    'game-hub-event-queue',
    'gamehub_data'
];

// Any localStorage key prefixed with "gamehub" is launcher-owned (reserved).
const LAUNCHER_LS_PREFIX = 'gamehub';

function nowIso() {
    return new Date().toISOString();
}

// ==========================================
// SELF-CONTAINED IN-PAGE SCRIPTS
// ==========================================
// These run inside a game page hosted via createDefaultPageHost(), which shares
// the launcher's default session — so its `localStorage` IS the game's save
// store. No game API is required: we snapshot/restore the shared localStorage
// directly, excluding Game Hub's own reserved keys.

function buildLocalStorageSnapshotScript() {
    const excluded = JSON.stringify(LAUNCHER_LS_KEYS);
    const prefix = JSON.stringify(LAUNCHER_LS_PREFIX);
    return `(async () => {
        try {
            const excluded = new Set(${excluded});
            const prefix = ${prefix};
            const entries = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (!key) continue;
                if (excluded.has(key) || key.startsWith(prefix)) continue;
                entries[key] = localStorage.getItem(key);
            }
            return { ok: true, data: { format: 'localstorage-v1', entries } };
        } catch (e) {
            return { ok: false, error: String((e && e.message) || e) };
        }
    })()`;
}

function buildLocalStorageRestoreScript(entries, opts = {}) {
    const payload = JSON.stringify(entries || {});
    // Optional sourceProfileId / profileId allow rewriting profile-scoped game
    // keys (e.g. skyace_<oldProfile>_...) to the imported profile's ID.
    const src = opts.sourceProfileId;
    const tgt = opts.profileId;
    return `(async () => {
        try {
            const map = ${payload};
            const src = ${JSON.stringify(src)};
            const tgt = ${JSON.stringify(tgt)};
            const restored = [];
            const skipped = [];
            for (const key in map) {
                let targetKey = key;
                if (src && tgt) {
                    // Rewrite the exported profile's ID wherever it appears as a
                    // key segment (e.g. skyace_<src>_achievements ->
                    // skyace_<tgt>_achievements). Profile IDs are launcher-owned;
                    // this stays generic and does not assume any game's key layout.
                    targetKey = key.split(src).join(tgt);
                }
                // Non-destructive: only write when the key is absent, so newer
                // existing progress is never overwritten by older imported data.
                if (localStorage.getItem(targetKey) !== null) {
                    skipped.push(targetKey);
                    continue;
                }
                localStorage.setItem(targetKey, map[key]);
                restored.push(targetKey);
            }
            return { ok: true, result: { restored, skipped } };
        } catch (e) {
            return { ok: false, error: String((e && e.message) || e) };
        }
    })()`;
}

// ==========================================
// GAME DATA COLLECTION / RESTORE
// ==========================================

/**
 * Snapshot a game's save data from the shared localStorage via the page host.
 * Returns { format:'localstorage-v1', entries } or null on failure.
 * @param {Object} app - Electron app
 * @param {string} gameId
 * @param {Object} [opts]
 * @param {Function} [opts.pageHost] - inject for tests
 * @returns {Promise<Object|null>}
 */
async function collectGameBackupData(app, gameId, { pageHost } = {}) {
    const host = pageHost || createDefaultPageHost(app, gameId);
    const out = await host(buildLocalStorageSnapshotScript());
    if (!out || out.ok !== true) {
        // Page could not be hosted / localStorage unavailable. Not fatal.
        return null;
    }
    return out.data || null;
}

/**
 * Restore a game's save data into the shared localStorage via the page host.
 * Non-destructive: only fills absent keys. Profile-scoped keys are
 * rewritten to the target profile when sourceProfileId/profileId are supplied.
 * @param {Object} app - Electron app
 * @param {string} gameId
 * @param {Object} data - localStorage snapshot ({ entries })
 * @param {Object} [opts]
 * @param {Function} [opts.pageHost]
 * @param {string} [opts.sourceProfileId]
 * @param {string} [opts.profileId]
 * @returns {Promise<Object>} { success, result }
 */
async function restoreGameBackupData(app, gameId, data, { pageHost, sourceProfileId, profileId } = {}) {
    const entries = (data && data.entries) || {};
    const host = pageHost || createDefaultPageHost(app, gameId);
    const out = await host(buildLocalStorageRestoreScript(entries, { sourceProfileId, profileId }));
    if (!out || out.ok !== true) {
        const error = new Error(out && out.error ? out.error : 'Game restore failed');
        error.code = 'GAME_RESTORE_FAILED';
        error.details = out || null;
        throw error;
    }
    return { success: true, result: out.result };
}

// ==========================================
// MANIFEST
// ==========================================

function buildManifest(profile, gameIds) {
    return {
        format: FORMAT,
        formatVersion: FORMAT_VERSION,
        exportedAt: nowIso(),
        profileId: profile.id,
        profileName: profile.name,
        gameHubVersion: require('../../../package.json').version,
        games: gameIds
    };
}

function validateManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') {
        throw new Error('Invalid .gamehub: manifest must be an object');
    }
    if (manifest.format !== FORMAT) {
        throw new Error(`Invalid .gamehub: unexpected format "${manifest.format}"`);
    }
    if (!Number.isInteger(manifest.formatVersion) || manifest.formatVersion < 1) {
        throw new Error(`Invalid .gamehub: bad formatVersion`);
    }
    // We can only import versions we understand.
    if (manifest.formatVersion > FORMAT_VERSION) {
        throw new Error(`Unsupported .gamehub format version: ${manifest.formatVersion} (this launcher supports up to ${FORMAT_VERSION})`);
    }
    return true;
}

// ==========================================
// ZIP CONTAINER
// ==========================================

function profileToJson(profile) {
    return {
        id: profile.id,
        name: profile.name,
        type: profile.type,
        settings: { ...(profile.settings || {}) },
        achievements: JSON.parse(JSON.stringify(profile.achievements || {})),
        statistics: JSON.parse(JSON.stringify(profile.statistics || {})),
        saves: JSON.parse(JSON.stringify(profile.saves || {})),
        exportedAt: nowIso()
    };
}

/**
 * Build the .gamehub ZIP buffer.
 * @param {Object} args
 * @param {Object} args.manifest
 * @param {Object} args.profile - profile object (will be serialized via profileToJson)
 * @param {Object} args.games - map of gameId -> native backup data
 * @returns {Buffer} ZIP file buffer
 */
function createGameHubZip({ manifest, profile, games }) {
    const zip = new AdmZip();
    zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2)));
    zip.addFile('profile.json', Buffer.from(JSON.stringify(profileToJson(profile), null, 2)));

    for (const [gameId, data] of Object.entries(games || {})) {
        zip.addFile(`games/${gameId}/backup.json`, Buffer.from(JSON.stringify(data, null, 2)));
    }

    return zip.toBuffer();
}

/**
 * Read and validate a .gamehub ZIP buffer.
 * @param {Buffer} buffer
 * @returns {Object} { manifest, profile, games }
 */
function readGameHubZip(buffer) {
    let zip;
    try {
        zip = new AdmZip(buffer);
    } catch (e) {
        throw new Error('Invalid .gamehub file: not a valid ZIP archive');
    }

    const manifestEntry = zip.getEntry('manifest.json');
    const profileEntry = zip.getEntry('profile.json');
    if (!manifestEntry) {
        throw new Error('Invalid .gamehub file: missing manifest.json');
    }
    if (!profileEntry) {
        throw new Error('Invalid .gamehub file: missing profile.json');
    }

    let manifest, profile;
    try {
        manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
    } catch (e) {
        throw new Error('Invalid .gamehub file: manifest.json is not valid JSON');
    }
    validateManifest(manifest);

    try {
        profile = JSON.parse(profileEntry.getData().toString('utf8'));
    } catch (e) {
        throw new Error('Invalid .gamehub file: profile.json is not valid JSON');
    }
    if (!profile || !profile.name) {
        throw new Error('Invalid .gamehub file: profile.json missing name');
    }

    // Collect any per-game backups.
    const games = {};
    for (const entry of zip.getEntries()) {
        const m = entry.entryName.match(/^games\/([a-zA-Z0-9_-]+)\/backup\.json$/);
        if (m) {
            try {
                games[m[1]] = JSON.parse(entry.getData().toString('utf8'));
            } catch (e) {
                throw new Error(`Invalid .gamehub file: games/${m[1]}/backup.json is not valid JSON`);
            }
        }
    }

    return { manifest, profile, games };
}

module.exports = {
    FORMAT,
    FORMAT_VERSION,
    LAUNCHER_LS_KEYS,
    LAUNCHER_LS_PREFIX,
    buildLocalStorageSnapshotScript,
    buildLocalStorageRestoreScript,
    collectGameBackupData,
    restoreGameBackupData,
    buildManifest,
    validateManifest,
    createGameHubZip,
    readGameHubZip,
    profileToJson
};

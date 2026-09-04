const { app, BrowserWindow, ipcMain } = require('electron');
const Store = require('electron-store').default;
const pkg = require('./package.json');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const AdmZip = require('adm-zip');

// Download Manager
const {
    startDownload,
    cancelDownload,
    getDownloadStatus,
    getActiveDownloads
} = require('./src/downloader/manager');

// Save-data cleanup + uninstall orchestration
const { uninstallGameWithSaveHandling } = require('./src/downloader/saveCleanup');
// Validated install-path resolution (reused for reading installed-game metadata)
const { validateGameId, resolveInstallPath } = require('./src/downloader/uninstaller');

// .gamehub profile backup/restore engine
const {
    collectGameBackupData,
    restoreGameBackupData,
    buildManifest,
    createGameHubZip,
    readGameHubZip
} = require('./src/systems/profiles/backup');

// Launcher self-update detection (updates GAME HUB itself, not games).
// Electron-updater is loaded LAZILY so development mode (npm start /
// app.isPackaged === false) never instantiates the updater. Accessing
// require('electron-updater').autoUpdater constructs the updater, which reads
// app.getVersion() and app-update.yml; that is only ever done by setupUpdater()
// on packaged builds.
let appUpdater = null;
function getAutoUpdater() {
    if (appUpdater === null) {
        appUpdater = require('electron-updater').autoUpdater;
    }
    return appUpdater;
}

let launcherUpdateReady = false;
let cachedUpdateAssetUrl = null;
let cachedUpdateVersion = null;
let mainWindow = null;

const SCHEMA_VERSION = 2;
const DEFAULT_PROFILE_ID = 'default';
const DEFAULT_PROFILE_NAME = 'Default';

function nowIso() {
    return new Date().toISOString();
}

function createDefaultProfile(id = DEFAULT_PROFILE_ID, overrides = {}) {
    return {
        id,
        name: id === DEFAULT_PROFILE_ID ? DEFAULT_PROFILE_NAME : overrides.name || id,
        type: id === DEFAULT_PROFILE_ID ? 'default' : overrides.type || 'custom',
        settings: {
            volume: 80,
            theme: 'dark',
            ...(overrides.settings || {})
        },
        achievements: { ...(overrides.achievements || {}) },
        statistics: {
            totalSessions: 0,
            gamePlayHistory: {},
            ...(overrides.statistics || {}),
            gamePlayHistory: {
                ...((overrides.statistics && overrides.statistics.gamePlayHistory) || {})
            }
        },
        saves: { ...(overrides.saves || {}) }
    };
}

function normalizeProfile(id, profile = {}) {
    const statistics = profile.statistics && typeof profile.statistics === 'object'
        ? profile.statistics
        : {};
    const gamePlayHistory = statistics.gamePlayHistory && typeof statistics.gamePlayHistory === 'object'
        ? statistics.gamePlayHistory
        : {};

    return {
        ...profile,
        id: profile.id || id,
        name: profile.name || (id === DEFAULT_PROFILE_ID ? DEFAULT_PROFILE_NAME : id),
        type: profile.type || (id === DEFAULT_PROFILE_ID ? 'default' : 'custom'),
        settings: {
            volume: 80,
            theme: 'dark',
            ...(profile.settings || {})
        },
        achievements: profile.achievements && typeof profile.achievements === 'object'
            ? { ...profile.achievements }
            : {},
        statistics: {
            totalSessions: Number(statistics.totalSessions || 0),
            gamePlayHistory: { ...gamePlayHistory }
        },
        saves: profile.saves && typeof profile.saves === 'object' ? { ...profile.saves } : {}
    };
}

function normalizeStore(rawStore = {}) {
    const metadata = rawStore.metadata && typeof rawStore.metadata === 'object'
        ? rawStore.metadata
        : {};
    const rawProfiles = rawStore.profiles && typeof rawStore.profiles === 'object'
        ? rawStore.profiles
        : {};
    const profiles = {};

    for (const [profileId, profile] of Object.entries(rawProfiles)) {
        profiles[profileId] = normalizeProfile(profileId, profile);
    }

    if (!profiles[DEFAULT_PROFILE_ID]) {
        profiles[DEFAULT_PROFILE_ID] = createDefaultProfile(DEFAULT_PROFILE_ID, {
            settings: rawStore.settings,
            achievements: rawStore.achievements,
            statistics: rawStore.statistics || {
                totalSessions: rawStore.totalSessions,
                gamePlayHistory: rawStore.games
            },
            saves: rawStore.saves
        });
    }

    const activeProfileId = profiles[metadata.activeProfileId] ? metadata.activeProfileId : DEFAULT_PROFILE_ID;
    const createdAt = metadata.createdAt || rawStore.createdAt || nowIso();
    const lastMigration = metadata.lastMigration ?? rawStore.lastMigration ?? null;

    return {
        ...rawStore,
        metadata: {
            ...metadata,
            schemaVersion: SCHEMA_VERSION,
            version: SCHEMA_VERSION,
            activeProfileId,
            createdAt,
            lastMigration
        },
        profiles,
        preferences: rawStore.preferences && typeof rawStore.preferences === 'object'
            ? { ...rawStore.preferences }
            : {}
    };
}

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

let store = null;

function createStore() {
    const s = new Store({
        name: 'gamehub-data',
        cwd: require('path').join(app.getPath('userData'), 'config'),
        projectName: 'game-hub',
        defaults: normalizeStore({
            metadata: {
                schemaVersion: SCHEMA_VERSION,
                version: SCHEMA_VERSION,
                activeProfileId: DEFAULT_PROFILE_ID,
                createdAt: nowIso(),
                lastMigration: null
            },
            profiles: {
                [DEFAULT_PROFILE_ID]: createDefaultProfile(DEFAULT_PROFILE_ID)
            },
            preferences: {}
        })
    });
    s.store = normalizeStore(s.store);
    return s;
}

/**
 * Configure Game Hub launcher update DETECTION (packaged builds only).
 *
 * This updates GAME HUB itself - it is deliberately separate from the
 * per-game update flow (registry-driven game updates use their own logic).
 *
 * Guarantees:
 *   - Completely inert in development (app.isPackaged === false), so
 *     `npm start` never performs an updater check.
 *   - DETECTS a newer release only: autoDownload stays false and
 *     quitAndInstall() is never called from here (download/install belong to a
 *     later phase).
 *   - Never blocks launch: the network check is fire-and-forget and every
 *     failure path (offline, GitHub unreachable, updater error, malformed
 *     metadata) is caught and only logged.
 */
function setupUpdater() {
    if (!app.isPackaged) {
        console.log('[Updater] Skipping launcher update check (development mode)');
        return;
    }

    const autoUpdater = getAutoUpdater();
    autoUpdater.autoDownload = false;
    autoUpdater.logger = console;

    // ==========================================
    // TEST-ONLY FAKE UPDATE
    // Remove this block after updater testing.
    // ==========================================
    if (process.env.GAMEHUB_TEST_UPDATE === '1') {
        const testVersion = '2.0.1';
        const testUrl =
            process.env.GAMEHUB_TEST_UPDATE_URL ||
            'http://127.0.0.1:8123/Game-Hub-2.0.1-arm64-mac.zip';

        cachedUpdateVersion = testVersion;
        cachedUpdateAssetUrl = testUrl;

        console.log(`[Updater] TEST MODE: fake update available: ${testVersion}`);
        console.log(`[Updater] TEST MODE: asset URL: ${testUrl}`);

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('launcher-update-available', {
                version: testVersion
            });
        }

        return;
    }

    // ==========================================
    // REAL UPDATE DETECTION
    // ==========================================
    autoUpdater.on('update-available', async (info) => {
        const version =
            (info && typeof info.version === 'string')
                ? info.version
                : 'unknown';

        cachedUpdateVersion = version;

        console.log(`[Updater] Launcher update available: ${version}`);

        try {
            const result = await autoUpdater.getUpdateInfoAndProvider();
            const files = result.provider.resolveFiles(result.info);

            // Normalize a release asset's download URL whether it is represented
            // as a plain string or as a URL object (exposing .href), matching the
            // existing handling of architecture-specific assets.
            const normalizeAssetUrl = (item) =>
                typeof item.url === 'string'
                    ? item.url
                    : (item.url && item.url.href)
                        ? item.url.href
                        : String(item.url);

            // Preferred: a universal macOS ZIP matching the current release. Our
            // public macOS release ships a single universal ZIP, so automatically
            // select it over any legacy architecture-specific build when present.
            let file = files.find((item) => {
                const url = normalizeAssetUrl(item);
                return url.includes('universal') && url.includes('.zip');
            });

            // Fallback: preserve the existing architecture-specific selection for
            // x64/arm64 releases, using process.arch detection as before.
            if (!file) {
                const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

                file = files.find((item) => {
                    const url = normalizeAssetUrl(item);
                    return url.includes(`-${arch}.`) ||
                        url.includes(`-${arch}.zip`);
                }) || files[0];
            }

            if (file) {
                cachedUpdateAssetUrl = normalizeAssetUrl(file);
            }
        } catch (e) {
            console.warn(
                '[Updater] Failed to resolve update asset URL:',
                e.message || e
            );
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(
                'launcher-update-available',
                { version }
            );
        }
    });

    autoUpdater.on('update-not-available', () => {
        console.log('[Updater] No launcher update available');
    });

    autoUpdater.on('error', (err) => {
        const message =
            (err && err.message)
                ? err.message
                : String(err);

        console.warn(
            `[Updater] Launcher update error (continuing normally): ${message}`
        );

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(
                'launcher-update-error',
                { message }
            );
        }
    });

    autoUpdater.checkForUpdates().catch((err) => {
        const message =
            (err && err.message)
                ? err.message
                : String(err);

        console.warn(
            `[Updater] Launcher update check failed (continuing normally): ${message}`
        );
    });
}



function createWindow() {
    const win = new BrowserWindow({
        width: 1400,
        height: 900,
        autoHideMenuBar: true,
        title: "Game Hub",
        icon: "icon.png",
        webPreferences: {
            preload: require('path').join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    win.loadFile('index.html');

    // Run launcher update detection only after the main window has finished
    // loading. setupUpdater() is fire-and-forget and packaged-build-only, so a
    // slow/failed network check can never hold up the window.
    win.webContents.once('did-finish-load', () => {
        setupUpdater();
    });

    mainWindow = win;
    return win;
}

const singleInstanceLock = app.requestSingleInstanceLock();

if (!singleInstanceLock) {
    app.quit();
} else {
    app.on('second-instance', () => {
        const win = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });
}

app.whenReady().then(() => {
    // Initialize store (requires app to be ready for getPath)
    store = createStore();

    // IPC Handlers for storage
    ipcMain.handle('storage:get', (event, key) => {
        return store.get(key);
    });

    ipcMain.handle('storage:set', (event, key, value) => {
        store.set(key, value);
        store.store = normalizeStore(store.store);
        return true;
    });

    ipcMain.handle('storage:delete', (event, key) => {
        store.delete(key);
        return true;
    });

    ipcMain.handle('storage:has', (event, key) => {
        return store.has(key);
    });

    ipcMain.handle('storage:migrate', (event, data) => {
        const profileId = store.get('metadata.activeProfileId') || DEFAULT_PROFILE_ID;
        const profilePath = `profiles.${profileId}`;
        const existingProfile = normalizeProfile(profileId, store.get(profilePath) || {});
        const mergedAchievements = {
            ...(existingProfile.achievements || {})
        };
        const mergedGameStats = {
            ...((existingProfile.statistics && existingProfile.statistics.gamePlayHistory) || {})
        };
        const mergedSaves = {
            ...(existingProfile.saves || {})
        };

        if (data.settings) {
            store.set(`${profilePath}.settings`, {
                ...(existingProfile.settings || {}),
                volume: data.settings.volume ?? 80,
                theme: data.settings.theme ?? 'dark'
            });
        }

        if (data.achievements) {
            for (const [gameId, gameAchievements] of Object.entries(data.achievements)) {
                mergedAchievements[gameId] = {
                    ...(mergedAchievements[gameId] || {}),
                    ...gameAchievements
                };
            }
            store.set(`${profilePath}.achievements`, mergedAchievements);
        }

        if (data.games) {
            for (const [gameId, gameData] of Object.entries(data.games)) {
                mergedGameStats[gameId] = {
                    lastPlayed: gameData.lastPlayed || null,
                    playCount: gameData.playCount || 0,
                    favorite: gameData.favorite || false,
                    activeChannel: gameData.activeChannel || 'stable'
                };
            }
            store.set(`${profilePath}.statistics.gamePlayHistory`, mergedGameStats);
        }

        if (data.gameUpdateHistory) {
            mergedSaves.updateHistory = {
                ...(mergedSaves.updateHistory || {}),
                ...data.gameUpdateHistory
            };
            store.set(`${profilePath}.saves`, mergedSaves);
        }

        store.set('metadata.lastMigration', {
            fromSchemaVersion: store.get('metadata.schemaVersion') || 1,
            toSchemaVersion: SCHEMA_VERSION,
            at: nowIso(),
            source: 'legacy-localStorage'
        });
        store.set('metadata.schemaVersion', SCHEMA_VERSION);
        store.set('metadata.version', SCHEMA_VERSION);
        store.store = normalizeStore(store.store);

        return true;
    });

    ipcMain.handle('storage:export', () => {
        return normalizeStore(store.store);
    });

    ipcMain.handle('storage:import', (event, data) => {
        store.store = normalizeStore(data);
        return true;
    });

    // ==========================================
    // Reset Data
    // ==========================================
    // Clears launcher-owned data for the active profile only.
    //
    // This resets:
    //   - achievements
    //   - statistics (totalSessions, gamePlayHistory)
    //   - saves (update history, etc.)
    //
    // This does NOT clear:
    //   - Game-owned localStorage data (e.g. Tactical Drone Defense saves)
    //   - Game-specific settings
    //   - Other game save data
    //
    // Game-owned data deletion/reset requires a future Game Hub game-data API
    // that games would implement to expose their save data for management.
    // ==========================================

    ipcMain.handle('storage:resetGameData', () => {
        const activeProfileId = store.get('metadata.activeProfileId') || DEFAULT_PROFILE_ID;
        const profilePath = `profiles.${activeProfileId}`;
        const profile = normalizeProfile(activeProfileId, store.get(profilePath) || {});
        store.set(`${profilePath}.achievements`, {});
        store.set(`${profilePath}.statistics`, {
            totalSessions: 0,
            gamePlayHistory: {}
        });
        store.set(`${profilePath}.saves`, {});
        store.set(`${profilePath}.settings`, profile.settings || { volume: 80, theme: 'dark' });
        store.store = normalizeStore(store.store);
        return true;
    });

    ipcMain.handle('storage:getInstalledGames', () => {
        return store.get('installedGames') || {};
    });

    ipcMain.handle('storage:setInstalledGame', (event, gameId, data) => {
        const installed = store.get('installedGames') || {};
        installed[gameId] = data;
        store.set('installedGames', installed);
        store.store = normalizeStore(store.store);
        return true;
    });

    ipcMain.handle('storage:removeInstalledGame', (event, gameId) => {
        const installed = store.get('installedGames') || {};
        delete installed[gameId];
        store.set('installedGames', installed);
        store.store = normalizeStore(store.store);
        return true;
    });

    ipcMain.handle('storage:hasInstalledGame', (event, gameId) => {
        const installed = store.get('installedGames') || {};
        return !!installed[gameId];
    });

    ipcMain.handle('storage:getInstalledGame', (event, gameId) => {
        const installed = store.get('installedGames') || {};
        return installed[gameId] || null;
    });

    // ==========================================
    // Profiles IPC Handlers
    // ==========================================

    ipcMain.handle('profiles:list', () => {
        const profiles = store.get('profiles') || {};
        return profiles;
    });

    ipcMain.handle('profiles:get', () => {
        const activeProfileId = store.get('metadata.activeProfileId') || DEFAULT_PROFILE_ID;
        const profilePath = `profiles.${activeProfileId}`;
        return normalizeProfile(activeProfileId, store.get(profilePath) || {});
    });

    ipcMain.handle('profiles:create', (event, name, overrides) => {
        const profiles = store.get('profiles') || {};
        const id = generateProfileId(name, profiles);

        const profile = {
            id,
            name: name.trim(),
            type: 'custom',
            settings: { volume: 80, theme: 'dark', ...(overrides?.settings || {}) },
            achievements: { ...(overrides?.achievements || {}) },
            statistics: {
                totalSessions: 0,
                gamePlayHistory: {},
                ...(overrides?.statistics || {}),
                gamePlayHistory: {
                    ...((overrides?.statistics && overrides.statistics.gamePlayHistory) || {})
                }
            },
            saves: { ...(overrides?.saves || {}) },
            createdAt: nowIso()
        };

        store.set(`profiles.${id}`, normalizeProfile(id, profile));
        store.store = normalizeStore(store.store);
        return store.get(`profiles.${id}`);
    });

    ipcMain.handle('profiles:switch', (event, profileId) => {
        const profiles = store.get('profiles') || {};
        if (!profiles[profileId]) {
            throw new Error(`Profile not found: ${profileId}`);
        }
        store.set('metadata.activeProfileId', profileId);
        store.store = normalizeStore(store.store);
        return profileId;
    });

    ipcMain.handle('profiles:delete', (event, profileId) => {
        if (profileId === DEFAULT_PROFILE_ID) {
            throw new Error('Cannot delete the default profile');
        }
        const profiles = store.get('profiles') || {};
        if (!profiles[profileId]) {
            return false;
        }
        store.delete(`profiles.${profileId}`);

        const remainingProfiles = store.get('profiles') || {};
        if (Object.keys(remainingProfiles).length === 0) {
            store.set(`profiles.${DEFAULT_PROFILE_ID}`, createDefaultProfile(DEFAULT_PROFILE_ID));
        }

        const activeProfileId = store.get('metadata.activeProfileId') || DEFAULT_PROFILE_ID;
        if (activeProfileId === profileId) {
            store.set('metadata.activeProfileId', DEFAULT_PROFILE_ID);
        }

        store.store = normalizeStore(store.store);
        return true;
    });

    ipcMain.handle('profiles:exportProfile', (event, profileId) => {
        const profiles = store.get('profiles') || {};
        if (!profiles[profileId]) {
            throw new Error(`Profile not found: ${profileId}`);
        }
        const profile = normalizeProfile(profileId, profiles[profileId]);
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
    });

    ipcMain.handle('profiles:importProfile', (event, data) => {
        if (!data || !data.name) {
            throw new Error('Invalid profile data: name is required');
        }

        const profiles = store.get('profiles') || {};
        // Always generate a new ID for imported profiles to avoid:
        // - overwriting the built-in Default profile
        // - ID collisions with existing profiles
        // - imported profiles retaining "default" type
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

        store.set(`profiles.${id}`, normalizeProfile(id, profile));
        store.store = normalizeStore(store.store);
        return store.get(`profiles.${id}`);
    });

    // ==========================================
    // .gamehub Profile Backup / Restore
    // ==========================================
    // Builds/reads the portable .gamehub ZIP container. Game save data is a
    // snapshot of the shared localStorage (reachable via the page host) —
    // Game Hub never understands a game's internal save format and needs no
    // game backup API. Games that can't be hosted are omitted from the backup.

    ipcMain.handle('profiles:exportGameHub', async (event, profileId) => {
        const profiles = store.get('profiles') || {};
        if (!profiles[profileId]) {
            throw new Error(`Profile not found: ${profileId}`);
        }
        const profile = normalizeProfile(profileId, profiles[profileId]);

        // Collect native backup data for every installed game (best-effort).
        const installed = store.get('installedGames') || {};
        const games = {};
        for (const gameId of Object.keys(installed)) {
            try {
                const data = await collectGameBackupData(app, gameId);
                if (data && typeof data === 'object') {
                    games[gameId] = data;
                }
            } catch (e) {
                console.warn(`GameHub: skipping backup for "${gameId}" (unsupported or failed): ${e.message}`);
            }
        }

        const manifest = buildManifest(profile, Object.keys(games));
        const buffer = createGameHubZip({ manifest, profile, games });
        return { base64: buffer.toString('base64'), manifest };
    });

    ipcMain.handle('profiles:importGameHub', async (event, base64) => {
        if (!base64 || typeof base64 !== 'string') {
            throw new Error('Invalid .gamehub data: expected a base64 string');
        }
        const { manifest, profile, games } = readGameHubZip(Buffer.from(base64, 'base64'));

        // Import the Game Hub profile (mirrors profiles:importProfile).
        const profiles = store.get('profiles') || {};
        const id = generateProfileId(profile.name, profiles);
        const importedName = profile.type === 'default' ? `${profile.name} Backup` : profile.name;
        const newProfile = {
            id,
            name: importedName,
            type: 'custom', // Force imported profiles to 'custom' type so they can be deleted
            settings: { volume: 80, theme: 'dark', ...(profile.settings || {}) },
            achievements: { ...(profile.achievements || {}) },
            statistics: {
                totalSessions: Number(profile.statistics?.totalSessions || 0),
                gamePlayHistory: { ...((profile.statistics && profile.statistics.gamePlayHistory) || {}) }
            },
            saves: { ...(profile.saves || {}) },
            createdAt: nowIso()
        };
        store.set(`profiles.${id}`, normalizeProfile(id, newProfile));

        // Restore game data when installed; otherwise hold as pending restore.
        const installed = store.get('installedGames') || {};
        const restored = [];
        const pending = [];
        // Profile-scoped game keys in the backup are rewritten from the source
        // profile's ID to the newly imported profile's ID.
        const sourceProfileId = (profile && profile.id) || null;
        for (const [gameId, data] of Object.entries(games || {})) {
            if (installed[gameId]) {
                try {
                    await restoreGameBackupData(app, gameId, data, { sourceProfileId, profileId: id });
                    restored.push(gameId);
                } catch (e) {
                    console.warn(`GameHub: restore for "${gameId}" failed, keeping pending: ${e.message}`);
                    pending.push(gameId);
                }
            } else {
                pending.push(gameId);
            }
        }

        // Persist pending restores against the imported profile so they can be
        // applied when the game is later installed/launched under this profile.
        if (pending.length > 0) {
            const saves = store.get(`profiles.${id}.saves`) || {};
            const pendingRestores = { ...((saves && saves.pendingGameRestores) || {}) };
            for (const gameId of pending) {
                pendingRestores[gameId] = {
                    data: games[gameId],
                    sourceProfileId
                };
            }
            store.set(`profiles.${id}.saves`, { ...saves, pendingGameRestores: pendingRestores });
        }

        store.store = normalizeStore(store.store);
        return {
            profile: store.get(`profiles.${id}`),
            restored,
            pending,
            manifest
        };
    });

    // Apply any pending restore data held for the active profile for this game.
    // Runs entirely in the main process: the game data is restored into the
    // shared localStorage via the page host. No game backup API is required.
    ipcMain.handle('game:consumePendingRestore', async (event, gameId) => {
        try {
            validateGameId(gameId);
        } catch (e) {
            return { data: null };
        }
        const activeProfileId = store.get('metadata.activeProfileId') || DEFAULT_PROFILE_ID;
        const saves = store.get(`profiles.${activeProfileId}.saves`) || {};
        const pending = (saves && saves.pendingGameRestores) || {};
        if (!pending[gameId]) {
            return { data: null };
        }
        const entry = pending[gameId] || {};
        const data = entry.data || null;
        const sourceProfileId = entry.sourceProfileId || null;
        delete pending[gameId];
        store.set(`profiles.${activeProfileId}.saves`, { ...saves, pendingGameRestores: pending });
        store.store = normalizeStore(store.store);

        if (data) {
            try {
                // Non-destructive restore, remapping profile-scoped keys to the
                // current profile.
                await restoreGameBackupData(app, gameId, data, {
                    sourceProfileId,
                    profileId: activeProfileId
                });
            } catch (e) {
                console.warn(`GameHub: pending restore for "${gameId}" failed: ${e.message}`);
            }
        }
        return { data: null, applied: true };
    });

    // ==========================================
    // Download IPC Handlers
    // ==========================================

    // Keep a reference to the main window for sending progress events
    let mainWindow = null;

    // Override createWindow to capture the window reference
    const originalCreateWindow = createWindow;
    createWindow = function () {
        mainWindow = originalCreateWindow();
        return mainWindow;
    };

    /**
     * Apply any pending .gamehub restores for the given game across all profiles.
     * Runs in the main process (no game API). Non-destructive.
     */
    async function applyPendingGameRestores(gameId) {
        try {
            validateGameId(gameId);
        } catch (_) {
            return;
        }
        const profiles = store.get('profiles') || {};
        for (const profileId of Object.keys(profiles)) {
            const saves = store.get(`profiles.${profileId}.saves`) || {};
            const pending = (saves && saves.pendingGameRestores) || {};
            if (!pending[gameId]) continue;
            const entry = pending[gameId] || {};
            const data = entry.data || null;
            const sourceProfileId = entry.sourceProfileId || null;
            delete pending[gameId];
            store.set(`profiles.${profileId}.saves`, { ...saves, pendingGameRestores: pending });

            if (data) {
                try {
                    await restoreGameBackupData(app, gameId, data, {
                        sourceProfileId,
                        profileId
                    });
                    console.log(`GameHub: applied pending restore for "${gameId}" on profile "${profileId}"`);
                } catch (e) {
                    console.warn(`GameHub: pending restore for "${gameId}" failed: ${e.message}`);
                }
            }
        }
        store.store = normalizeStore(store.store);
    }

    ipcMain.handle('download:start', (event, gameId, metadata) => {
        const { downloadId } = startDownload(app, gameId, metadata, (progress) => {
            // When download completes, persist to installedGames store
            if (progress.status === 'completed') {
                // Ensure path has a trailing slash for path concatenation
                const installPath = progress.path
                    ? (progress.path.endsWith('/') ? progress.path : progress.path + '/')
                    : progress.path;
                const installData = {
                    id: gameId,
                    version: metadata.version || '1.0.0',
                    path: installPath,
                    installedAt: progress.extractedAt || new Date().toISOString()
                };
                const installed = store.get('installedGames') || {};
                installed[gameId] = installData;
                store.set('installedGames', installed);
                store.store = normalizeStore(store.store);
                console.log(`GameHub: Saved downloaded game ${gameId} to installedGames`);

                // A freshly installed/updated game may have pending restores
                // imported earlier (exported while the game was uninstalled).
                // Apply them into the shared localStorage now so the installed
                // game immediately sees its restored save data. Non-destructive.
                applyPendingGameRestores(gameId);
            }

            // Forward progress to the renderer
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('download:progress', progress);
            }
        });
        return { downloadId };
    });

    ipcMain.handle('download:cancel', (event, downloadId) => {
        const result = cancelDownload(downloadId);
        return { success: result };
    });

    ipcMain.handle('download:install', async (event, downloadId) => {
        // Get the download status to find the gameId and metadata
        const status = getDownloadStatus(downloadId);
        if (!status) {
            throw new Error(`Download not found: ${downloadId}`);
        }

        // The pipeline already handles install on completion.
        // This handler is for manual re-install from a completed download state.
        // For now, we return the status — the pipeline auto-installs.
        return { status: status.state };
    });

    ipcMain.handle('download:status', (event, downloadId) => {
        return getDownloadStatus(downloadId);
    });

    ipcMain.handle('download:list', () => {
        return getActiveDownloads();
    });

    // ==========================================
    // Uninstall IPC Handlers
    // ==========================================

    ipcMain.handle('game:uninstall', (event, gameId, options) => {
        // Orchestrates optional save-data deletion (via the game's own
        // clearSaveData API) BEFORE filesystem/registry uninstall, and reports
        // truthful success/failure for each step.
        return uninstallGameWithSaveHandling({
            app,
            gameId,
            options: options || {},
            store
        });
    });

    // ==========================================
    // App Info
    // ==========================================

    ipcMain.handle('app:info', () => {
        return {
            version: pkg.version,
            schemaVersion: SCHEMA_VERSION
        };
    });

    ipcMain.handle('app:downloadUpdate', async () => {
        if (!cachedUpdateAssetUrl) {
            throw new Error('No update asset URL available. Please check for updates first.');
        }

        const tempDir = app.getPath('temp');
        const zipPath = path.join(tempDir, 'gamehub-update.zip');

        // Remove any stale/failed/corrupt download before starting fresh so it
        // can never be mistaken for a valid cached update.
        if (fs.existsSync(zipPath)) {
            try {
                fs.unlinkSync(zipPath);
            } catch (err) {
                throw new Error(`Failed to remove stale update archive: ${err.message}`);
            }
        }

        console.log(`[Updater] Downloading update from: ${cachedUpdateAssetUrl}`);

        // We'll stream the download manually so we can emit progress events.
        return new Promise((resolve, reject) => {
            const url = new URL(cachedUpdateAssetUrl);
            const transport = url.protocol === 'https:' ? https : require('http');

            const request = transport.get(url, (response) => {
                if (response.statusCode === 301 || response.statusCode === 302) {
                    transport.get(response.headers.location, (followResponse) => {
                        pump(followResponse, null, zipPath, resolve, reject);
                    });
                } else {
                    pump(response, null, zipPath, resolve, reject);
                }
            });

            request.on('error', (err) => {
                reject(new Error(`Download failed: ${err.message}`));
            });
        });
    });

    function pump(response, destination, zipPath, resolve, reject) {
        // Only treat 2xx responses as a successful download. Anything else (e.g.
        // a 404 HTML error page) must never be written to gamehub-update.zip.
        if (response.statusCode < 200 || response.statusCode >= 300) {
            // Drain/resume the response so the connection can close cleanly.
            response.resume();
            reject(new Error(`Update download returned HTTP ${response.statusCode}`));
            return;
        }

        const totalSize = parseInt(response.headers['content-length'], 10) || 0;
        let transferred = 0;
        const fileStream = fs.createWriteStream(zipPath);

        response.pipe(fileStream);

        response.on('data', (chunk) => {
            transferred += chunk.length;
            const percent = totalSize > 0 ? Math.round((transferred / totalSize) * 100) : 0;
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('launcher-update-download-progress', {
                    percent,
                    transferred,
                    total: totalSize,
                    bytesPerSecond: 0
                });
            }
        });

        fileStream.on('finish', () => {
            fileStream.close();
            launcherUpdateReady = true;
            console.log(`[Updater] Download complete: ${zipPath}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('launcher-update-downloaded', { version: cachedUpdateVersion });
            }
            resolve({ success: true });
        });

        fileStream.on('error', (err) => {
            // Ensure a partial/corrupt archive does not remain to be reused later.
            try {
                if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
            } catch (cleanupErr) {
                // Ignore cleanup failure; the download is already failing.
            }
            reject(new Error(`Failed to save update: ${err.message}`));
        });
    }

    ipcMain.handle('app:installUpdate', async () => {
        if (!launcherUpdateReady) {
            return { success: false, error: 'No downloaded update is ready.' };
        }

        const tempDir = app.getPath('temp');
        const zipPath = path.join(tempDir, 'gamehub-update.zip');

        if (!fs.existsSync(zipPath)) {
            return { success: false, error: 'Update archive not found.' };
        }

        // Resolve the actual .app bundle path.
        const appPath = path.resolve(path.dirname(process.execPath), '..', '..');
        if (!fs.existsSync(path.join(appPath, 'Contents'))) {
            return { success: false, error: `Could not resolve .app bundle path from ${process.execPath}` };
        }
        const resolvedAppPath = appPath;

        const updaterDir = fs.mkdtempSync(path.join(tempDir, 'gamehub-update-'));
        const manifestPath = path.join(updaterDir, 'gamehub-update-manifest.json');
        const manifest = {
            zipPath,
            appPath: resolvedAppPath,
            arch: process.arch,
            version: cachedUpdateVersion,
            // Pass the current Game Hub PID so the external updater can wait for
            // this process to fully exit before replacing/relaunching the app.
            parentPid: process.pid
        };
        fs.writeFileSync(manifestPath, JSON.stringify(manifest));

        const scriptPath = path.join(__dirname, '..', 'src', 'updater', 'macExternalUpdater.js');
        const copiedScriptPath = path.join(updaterDir, 'macExternalUpdater.js');
        fs.copyFileSync(scriptPath, copiedScriptPath);

        const admZipSrc = path.join(process.resourcesPath, 'node_modules', 'adm-zip');
        if (!fs.existsSync(admZipSrc)) {
            throw new Error(`[Updater] Packaged adm-zip not found: ${admZipSrc}`);
        }
        const admZipDest = path.join(updaterDir, 'node_modules', 'adm-zip');
        fs.cpSync(admZipSrc, admZipDest, { recursive: true });

        // ── DIAGNOSTIC: resolve and verify node binary ──────────────────────────
        // In a packaged Electron app, process.env.PATH is minimal. We scan all
        // candidates verbosely so the log tells us exactly what was tried.
        const nodeCandidates = (process.env.PATH || '')
            .split(':')
            .filter(Boolean)
            .map(dir => path.join(dir, 'node'))
            .concat([
                '/opt/homebrew/bin/node',
                '/usr/local/bin/node',
                '/usr/bin/node',
                '/usr/local/nvm/versions/node/current/bin/node',
            ]);

        let nodeBin = null;
        const diagLines = [];
        diagLines.push('[Updater][DIAG] === installUpdate diagnostic start ===');
        diagLines.push(`[Updater][DIAG] process.execPath:     ${process.execPath}`);
        diagLines.push(`[Updater][DIAG] process.resourcesPath: ${process.resourcesPath}`);
        diagLines.push(`[Updater][DIAG] process.arch:          ${process.arch}`);
        diagLines.push(`[Updater][DIAG] process.env.PATH:      ${process.env.PATH || '(empty)'}`);
        diagLines.push(`[Updater][DIAG] updaterDir:            ${updaterDir}`);
        diagLines.push(`[Updater][DIAG] copiedScriptPath:      ${copiedScriptPath}`);
        diagLines.push(`[Updater][DIAG] manifestPath:          ${manifestPath}`);
        diagLines.push(`[Updater][DIAG] admZipDest:            ${admZipDest}`);
        diagLines.push(`[Updater][DIAG] zipPath:               ${zipPath}`);

        diagLines.push('[Updater][DIAG] --- node candidate scan ---');
        for (const candidate of nodeCandidates) {
            try {
                const st = fs.statSync(candidate);
                if (st.isFile()) {
                    diagLines.push(`[Updater][DIAG]   FOUND: ${candidate}`);
                    if (!nodeBin) nodeBin = candidate;
                } else {
                    diagLines.push(`[Updater][DIAG]   NOT-FILE: ${candidate}`);
                }
            } catch (e) {
                diagLines.push(`[Updater][DIAG]   MISSING: ${candidate} (${e.code || e.message})`);
            }
        }

        if (!nodeBin) {
            nodeBin = 'node'; // fallback
            diagLines.push(`[Updater][DIAG] node binary: FALLBACK ('node') — no candidate found on disk`);
        } else {
            diagLines.push(`[Updater][DIAG] node binary resolved: ${nodeBin}`);
            // Verify the resolved binary is executable
            try {
                fs.accessSync(nodeBin, fs.constants.X_OK);
                diagLines.push(`[Updater][DIAG] node binary is executable: YES`);
            } catch (e) {
                diagLines.push(`[Updater][DIAG] node binary is executable: NO (${e.message})`);
            }
        }

        // ── DIAGNOSTIC: verify all files are in place before spawning ───────────
        diagLines.push('[Updater][DIAG] --- file presence check ---');
        for (const [label, p] of [
            ['copiedScriptPath', copiedScriptPath],
            ['manifestPath',     manifestPath],
            ['admZipDest',       admZipDest],
            ['zipPath',          zipPath],
        ]) {
            const exists = fs.existsSync(p);
            diagLines.push(`[Updater][DIAG]   ${label}: ${exists ? 'EXISTS' : 'MISSING'} — ${p}`);
        }

        // ── Write the pre-spawn diagnostic log NOW, before spawning ─────────────
        // Writing before spawn means we know the log exists even if spawn fails.
        const updaterLogPath = path.join(tempDir, 'gamehub-updater.log');
        diagLines.push(`[Updater][DIAG] updaterLogPath:        ${updaterLogPath}`);
        diagLines.push('[Updater][DIAG] --- about to spawn ---');
        const diagText = diagLines.join('\n') + '\n';

        // Also echo to Electron console so it's visible in packaged app logs
        diagLines.forEach(l => console.log(l));

        // Write the pre-spawn block to the log file synchronously
        try { fs.writeFileSync(updaterLogPath, diagText); } catch (_) {}

        // ── Spawn ─────────────────────────────────────────────────────────────────
        // Open the log for append so both parent writes and child writes go there.
        const logFd = fs.openSync(updaterLogPath, 'a');

        let child;
        try {
            child = spawn(nodeBin, [copiedScriptPath, manifestPath], {
                detached: true,
                stdio: ['ignore', logFd, logFd]
            });
        } catch (spawnErr) {
            // spawn() itself threw synchronously (ENOENT, EACCES, etc.)
            const errMsg = `[Updater][DIAG] spawn() threw synchronously: ${spawnErr.message}\n`;
            console.error(errMsg);
            try { fs.appendFileSync(updaterLogPath, errMsg); } catch (_) {}
            fs.closeSync(logFd);
            return { success: false, error: `spawn failed: ${spawnErr.message}` };
        }

        // Attach diagnostic listeners BEFORE unref so we capture early exits.
        // These do NOT prevent the child from running independently.
        // Guard with typeof check so test environments with minimal mock
        // child objects (no .on) don't throw.
        if (typeof child.on === 'function') {
            child.on('error', (err) => {
                const msg = `[Updater][DIAG] child error event: ${err.message} (code=${err.code})\n`;
                console.error(msg);
                // Write synchronously — the parent may quit any moment
                try { fs.appendFileSync(updaterLogPath, msg); } catch (_) {}
            });

            child.on('exit', (code, signal) => {
                const msg = `[Updater][DIAG] child exit: pid=${child.pid} code=${code} signal=${signal}\n`;
                console.log(msg);
                try { fs.appendFileSync(updaterLogPath, msg); } catch (_) {}
            });

            child.on('close', (code, signal) => {
                const msg = `[Updater][DIAG] child close: pid=${child.pid} code=${code} signal=${signal}\n`;
                console.log(msg);
                try { fs.appendFileSync(updaterLogPath, msg); } catch (_) {}
            });
        }

        const spawnedMsg = `[Updater][DIAG] spawn() returned: pid=${child.pid}\n`;
        console.log(spawnedMsg);
        try { fs.appendFileSync(updaterLogPath, spawnedMsg); } catch (_) {}

        // Detach from parent so Electron can quit without killing the child.
        child.unref();
        fs.closeSync(logFd);

        // Give the updater time to start before quitting.
        // The diagnostic listeners above use appendFileSync so they survive after
        // parent closes logFd (each call re-opens the file).
        setTimeout(() => {
            app.quit();
        }, 1500);

        return { success: true };
    });

    ipcMain.handle('app:dismissUpdate', () => {
        return { dismissed: true };
    });

    ipcMain.handle('app:checkForUpdates', () => {
        if (!app.isPackaged) {
            return { checked: false, message: 'Not available in development mode.' };
        }
        const autoUpdater = getAutoUpdater();
        autoUpdater.checkForUpdates().catch((err) => {
            const message = (err && err.message) ? err.message : String(err);
            console.warn(`[Updater] Manual check failed: ${message}`);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('launcher-update-error', { message: 'Couldn\'t check for updates. Try again later.' });
            }
        });
        return { checked: true };
    });

    ipcMain.handle('game:readInstalledFile', (event, gameId, fileName = 'game.json') => {
        // Safely read a JSON metadata file from an installed game's directory.
        // The path is derived ONLY from the validated gameId + games dir; a
        // renderer-supplied path is never trusted. fileName must be a safe,
        // flat *.json name (no separators / path traversal).
        try {
            validateGameId(gameId);
            if (typeof fileName !== 'string' || !/^[A-Za-z0-9._-]+$/.test(fileName) || !fileName.endsWith('.json')) {
                return { ok: false, error: `Invalid file name: ${fileName}` };
            }
            const installPath = resolveInstallPath(app, gameId);
            const filePath = path.join(installPath, fileName);
            if (!fs.existsSync(filePath)) {
                return { ok: false, error: 'not-found', file: fileName };
            }
            return { ok: true, data: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
        } catch (error) {
            return { ok: false, error: error.message || String(error) };
        }
    });

    ipcMain.handle('game:returnToLauncher', () => {
        const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
        if (mainWindow) {
            const launcherPath = require('path').join(__dirname, 'index.html');
            mainWindow.loadFile(launcherPath);
        }
    });

    createWindow();
});

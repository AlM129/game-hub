const { app, BrowserWindow, ipcMain } = require('electron');
const Store = require('electron-store').default;
const pkg = require('./package.json');

// Download Manager
const {
    startDownload,
    cancelDownload,
    getDownloadStatus,
    getActiveDownloads
} = require('./src/downloader/manager');

// Save-data cleanup + uninstall orchestration
const { uninstallGameWithSaveHandling } = require('./src/downloader/saveCleanup');

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
    return win;
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
    // Download IPC Handlers
    // ==========================================

    // Keep a reference to the main window for sending progress events
    let mainWindow = null;

    // Override createWindow to capture the window reference
    const originalCreateWindow = createWindow;
    createWindow = function() {
        mainWindow = originalCreateWindow();
        return mainWindow;
    };

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

    ipcMain.handle('game:returnToLauncher', () => {
        const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
        if (mainWindow) {
            const launcherPath = require('path').join(__dirname, 'index.html');
            mainWindow.loadFile(launcherPath);
        }
    });

    createWindow();
});

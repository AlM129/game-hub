const { app, BrowserWindow, ipcMain } = require('electron');
const Store = require('electron-store').default;

const store = new Store({
    name: 'gamehub-data',
    defaults: {
        metadata: { version: 1, lastMigration: null },
        profiles: {
            default: {
                settings: { volume: 80, theme: 'dark' },
                achievements: {},
                statistics: { totalSessions: 0, gamePlayHistory: {} },
                saves: {}
            }
        },
        preferences: {}
    }
});


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
}

app.whenReady().then(() => {
    // IPC Handlers for storage
    ipcMain.handle('storage:get', (event, key) => {
        return store.get(key);
    });

    ipcMain.handle('storage:set', (event, key, value) => {
        store.set(key, value);
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
        const profilePath = 'profiles.default';
        
        if (data.settings) {
            store.set(`${profilePath}.settings`, {
                volume: data.settings.volume ?? 80,
                theme: data.settings.theme ?? 'dark'
            });
        }
        
        if (data.achievements) {
            store.set(`${profilePath}.achievements`, data.achievements);
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
            store.set(`${profilePath}.statistics.gamePlayHistory`, gameStats);
        }
        
        if (data.gameUpdateHistory) {
            store.set(`${profilePath}.saves.updateHistory`, data.gameUpdateHistory);
        }
        
        store.set('metadata.lastMigration', Date.now());
        store.set('metadata.version', 1);
        
        return true;
    });

    ipcMain.handle('storage:export', () => {
        return store.store;
    });

    ipcMain.handle('storage:import', (event, data) => {
        store.store = data;
        return true;
    });

    ipcMain.handle('storage:resetGameData', () => {
        const profilePath = 'profiles.default';
        store.delete(`${profilePath}.achievements`);
        store.delete(`${profilePath}.statistics`);
        store.delete(`${profilePath}.saves`);
        return true;
    });

    createWindow();
});
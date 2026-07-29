const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('downloader', {
    start: (gameId, metadata) => ipcRenderer.invoke('download:start', gameId, metadata),
    cancel: (downloadId) => ipcRenderer.invoke('download:cancel', downloadId),
    install: (downloadId) => ipcRenderer.invoke('download:install', downloadId),
    status: (downloadId) => ipcRenderer.invoke('download:status', downloadId),
    list: () => ipcRenderer.invoke('download:list'),
    onProgress: (callback) => {
        const handler = (event, data) => callback(data);
        ipcRenderer.on('download:progress', handler);
        // Return cleanup function
        return () => ipcRenderer.removeListener('download:progress', handler);
    }
});

contextBridge.exposeInMainWorld('storage', {
    get: (key) => ipcRenderer.invoke('storage:get', key),
    set: (key, value) => ipcRenderer.invoke('storage:set', key, value),
    delete: (key) => ipcRenderer.invoke('storage:delete', key),
    has: (key) => ipcRenderer.invoke('storage:has', key),
    export: () => ipcRenderer.invoke('storage:export'),
    import: (data) => ipcRenderer.invoke('storage:import', data),
    migrate: (data) => ipcRenderer.invoke('storage:migrate', data),
    resetGameData: () => ipcRenderer.invoke('storage:resetGameData'),
    getInstalledGames: () => ipcRenderer.invoke('storage:getInstalledGames'),
    setInstalledGame: (gameId, data) => ipcRenderer.invoke('storage:setInstalledGame', gameId, data),
    removeInstalledGame: (gameId) => ipcRenderer.invoke('storage:removeInstalledGame', gameId),
    hasInstalledGame: (gameId) => ipcRenderer.invoke('storage:hasInstalledGame', gameId),
    getInstalledGame: (gameId) => ipcRenderer.invoke('storage:getInstalledGame', gameId)
});

contextBridge.exposeInMainWorld('profiles', {
    list: () => ipcRenderer.invoke('profiles:list'),
    get: () => ipcRenderer.invoke('profiles:get'),
    create: (name, overrides) => ipcRenderer.invoke('profiles:create', name, overrides),
    switch: (profileId) => ipcRenderer.invoke('profiles:switch', profileId),
    delete: (profileId) => ipcRenderer.invoke('profiles:delete', profileId),
    exportProfile: (profileId) => ipcRenderer.invoke('profiles:exportProfile', profileId),
    importProfile: (data) => ipcRenderer.invoke('profiles:importProfile', data)
});

contextBridge.exposeInMainWorld('appInfo', {
    get: () => ipcRenderer.invoke('app:info')
});

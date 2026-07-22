const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('storage', {
    get: (key) => ipcRenderer.invoke('storage:get', key),
    set: (key, value) => ipcRenderer.invoke('storage:set', key, value),
    delete: (key) => ipcRenderer.invoke('storage:delete', key),
    has: (key) => ipcRenderer.invoke('storage:has', key),
    export: () => ipcRenderer.invoke('storage:export'),
    import: (data) => ipcRenderer.invoke('storage:import', data),
    migrate: (data) => ipcRenderer.invoke('storage:migrate', data),
    resetGameData: () => ipcRenderer.invoke('storage:resetGameData')
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
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

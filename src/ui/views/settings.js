// ==========================================
// SETTINGS VIEW
// ==========================================
// Renders the settings page with volume, storage, and profile controls

import { Storage } from '../../storage.js';

export async function renderSettings() {
    const vol = await Storage.getSetting('volume') ?? 80;
    const settingVolume = document.getElementById('settingVolume');
    const settingVolumeLabel = document.getElementById('settingVolumeLabel');
    const settingStorageSize = document.getElementById('settingStorageSize');
    const settingProfile = document.getElementById('settingProfile');
    
    if (settingVolume) settingVolume.value = vol;
    if (settingVolumeLabel) settingVolumeLabel.textContent = vol;
    if (settingStorageSize) settingStorageSize.textContent = await Storage.getStorageSize();
    const loadedData = await Storage.load();
    if (settingProfile) settingProfile.textContent = loadedData.profile;
}

export async function updateSetting(key, value) {
    await Storage.setSetting(key, Number(value));
    const settingVolumeLabel = document.getElementById('settingVolumeLabel');
    if (key === 'volume' && settingVolumeLabel) {
        settingVolumeLabel.textContent = value;
    }
}

export async function confirmResetData() {
    if (confirm('Are you sure you want to reset all Game Hub data? This will clear play history, favorites, and settings.')) {
        await Storage.reset();
        await renderHome();
        await renderLibrary();
        await renderSettings();
        if (typeof window.getCurrentView === 'function' && window.getCurrentView() === 'statistics') {
            await renderStatistics();
        }
    }
}

// Export for global access
window.renderSettings = renderSettings;
window.updateSetting = updateSetting;
window.confirmResetData = confirmResetData;
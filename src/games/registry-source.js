// ==========================================
// REGISTRY SOURCE
// ==========================================
// Provides the URL for the game registry.
//
// Currently loads from a local JSON file.
// Future enhancement: set REGISTRY_URL to a remote endpoint
// to enable dynamic game distribution without code changes.

const LOCAL_REGISTRY_URL = 'src/games/registry.json';

// In the future, this could be an environment variable or setting:
// const REMOTE_REGISTRY_URL = 'https://example.com/registry.json';

let registryUrl = LOCAL_REGISTRY_URL;

/**
 * Set a custom registry URL (for remote registry support).
 * Call this before loadRegistry() to override the default.
 */
export function setRegistryUrl(url) {
    registryUrl = url;
}

/**
 * Get the current registry URL.
 */
export function getRegistryUrl() {
    return registryUrl;
}
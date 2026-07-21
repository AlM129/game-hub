// ==========================================
// REGISTRY SOURCE
// ==========================================
// Provides URLs for the game registry with remote-first loading.
// Tries remote GitHub-hosted registry first, falls back to local file.

export const LOCAL_REGISTRY_URL = 'src/games/registry.json';

// Default remote registry URL (GitHub raw content URL)
// Points to the v1.5.0-development branch
export const REMOTE_REGISTRY_URL = "https://raw.githubusercontent.com/AlM129/game-hub-registry/main/src/games/registry.json";
let registryUrl = REMOTE_REGISTRY_URL;

// Flag to track if we should use remote registry
// Can be set to false for testing or offline scenarios
let useRemoteRegistry = true;

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

/**
 * Set whether to use remote registry or force local.
 * Useful for testing or offline scenarios.
 */
export function setUseRemoteRegistry(useRemote) {
    useRemoteRegistry = useRemote;
}

/**
 * Check if remote registry is enabled.
 */
export function getUseRemoteRegistry() {
    return useRemoteRegistry;
}

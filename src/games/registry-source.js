// ==========================================
// REGISTRY SOURCE
// ==========================================
// Provides URLs for the game registry with remote-first loading.
// Tries remote GitHub-hosted registry first, falls back to local file.
//
// The new registry (game-hub-registry) contains only metadata and release info.
// Game source code remains in the local games/ directory.

export const LOCAL_REGISTRY_URL = 'src/games/registry.json';

// Default remote registry URL (GitHub raw content URL)
// Points to the new game-hub-registry repository's registry.json
export const REMOTE_REGISTRY_URL = "https://raw.githubusercontent.com/AlM129/game-hub-registry/main/registry.json";
let registryUrl = REMOTE_REGISTRY_URL;

// Base URL for resolving relative metaUrls from the registry
// e.g. "games/tactical-drone-defense.json" resolves to this base + that path
export const REMOTE_REGISTRY_BASE = "https://raw.githubusercontent.com/AlM129/game-hub-registry/main/";
let registryBaseUrl = REMOTE_REGISTRY_BASE;

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
 * Set the base URL for resolving relative metaUrls.
 */
export function setRegistryBaseUrl(url) {
    registryBaseUrl = url;
}

/**
 * Get the current registry base URL.
 */
export function getRegistryBaseUrl() {
    return registryBaseUrl;
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
// ==========================================
// UTILITY FUNCTIONS
// ==========================================
// Shared helper functions used across multiple modules

export function formatDate(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatLastPlayed(dateStr) {
    if (!dateStr) return 'Never';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatDate(dateStr);
}

export function getChannelBadge(channel, CHANNEL_CONFIG) {
    const config = CHANNEL_CONFIG[channel] || CHANNEL_CONFIG.stable;
    return `<span class="${config.color} ${config.bg} text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded">${config.label}</span>`;
}

export function getRarityBadge(rarity, RARITY_CONFIG) {
    const config = RARITY_CONFIG[rarity] || RARITY_CONFIG.common;
    return `<span class="${config.color} text-[10px] font-bold uppercase tracking-wider">${config.label}</span>`;
}

export function getRarityBg(rarity, RARITY_CONFIG) {
    const config = RARITY_CONFIG[rarity] || RARITY_CONFIG.common;
    return config.bg;
}

/**
 * Resolve a media URL relative to a metadata file URL.
 *
 * Absolute URLs (http://, https://, file://) are returned as-is.
 * Relative URLs are resolved against the metadata file's URL using
 * JavaScript's built-in URL constructor, so they work regardless of
 * where the registry is hosted.
 *
 * @param {string} mediaUrl - The media URL to resolve (relative or absolute)
 * @param {string} metadataUrl - The URL of the metadata file that contained the mediaUrl
 * @returns {string} The resolved absolute URL
 */
export function resolveMediaUrl(mediaUrl, metadataUrl) {
    if (!mediaUrl) return '';
    // Absolute URLs are returned as-is
    if (mediaUrl.startsWith('http://') || mediaUrl.startsWith('https://') || mediaUrl.startsWith('file://')) {
        return mediaUrl;
    }
    // Absolute/root-relative paths are returned as-is
    if (mediaUrl.startsWith('/')) {
        return mediaUrl;
    }
    // Relative URL
    if (metadataUrl) {
        // Absolute (remote) metadata URL — resolve using the URL constructor.
        // This preserves remote registry behavior.
        if (metadataUrl.startsWith('http://') || metadataUrl.startsWith('https://')) {
            try {
                return new URL(mediaUrl, metadataUrl).href;
            } catch (e) {
                console.warn(`GameHub: Failed to resolve media URL "${mediaUrl}" against "${metadataUrl}":`, e.message);
                return mediaUrl;
            }
        }
        // Relative/local metadata file (offline packaged fallback) — join the
        // media path next to the metadata file (e.g. cover.png next to
        // src/games/games/sky-ace/game.json) with a plain path join. Using the
        // URL constructor here would throw "Invalid base URL" for relative bases.
        const separator = metadataUrl.lastIndexOf('/');
        const baseDir = separator >= 0 ? metadataUrl.slice(0, separator + 1) : '';
        return baseDir + mediaUrl;
    }
    return mediaUrl;
}

/**
 * Recursively resolve all URL fields in a media object against a metadata URL.
 *
 * Handles structures like:
 *   { thumbnail: { url: "cover.png" } }
 *   { screenshots: [{ url: "screenshots/1.png" }, { url: "screenshots/2.png" }] }
 *   { background: { url: "bg.png" } }
 *
 * Absolute URLs are left unchanged. Relative URLs are resolved using
 * JavaScript's built-in URL constructor.
 *
 * @param {Object} media - The media object from game metadata
 * @param {string} metadataUrl - The URL of the metadata file
 * @returns {Object} A new media object with all URLs resolved
 */
export function resolveMediaUrls(media, metadataUrl) {
    if (!media || !metadataUrl) return media;
    
    const resolved = Array.isArray(media) ? [] : {};
    for (const [key, value] of Object.entries(media)) {
        if (value && typeof value === 'object') {
            if (value.url) {
                // Object with a url property: { url: "...", ... }
                resolved[key] = { ...value, url: resolveMediaUrl(value.url, metadataUrl) };
            } else if (Array.isArray(value)) {
                // Array of objects: may contain objects with url fields
                resolved[key] = value.map(item => {
                    if (item && typeof item === 'object' && item.url) {
                        return { ...item, url: resolveMediaUrl(item.url, metadataUrl) };
                    }
                    return item;
                });
            } else {
                // Nested object without direct url — recurse
                resolved[key] = resolveMediaUrls(value, metadataUrl);
            }
        } else {
            resolved[key] = value;
        }
    }
    return resolved;
}

/**
 * Convert an absolute filesystem path to a file:// URL if needed.
 * Relative paths are returned as-is (they resolve against the page origin
 * in Electron's file:// environment).
 *
 * This is critical for downloaded games, whose install paths live outside
 * the app bundle (e.g. userData/games/<id>/) and may contain spaces or
 * other characters that are invalid in unencoded URLs.
 *
 * @param {string} fullPath - The full path to convert
 * @returns {string} A URL suitable for use in src/href attributes
 */
function toFileUrlIfNeeded(fullPath) {
    if (!fullPath) return '';
    // Absolute Unix path (e.g. /Users/.../games/sky-ace/cover.png)
    // or Windows drive path (e.g. C:\Users\...\games\sky-ace\cover.png)
    if (fullPath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(fullPath)) {
        // Normalise backslashes to forward slashes for Windows, then encode
        return 'file://' + encodeURI(fullPath.replace(/\\/g, '/'));
    }
    return fullPath;
}

/**
 * Default placeholder cover image used when no cover is available from
 * any source. Uses a self-contained SVG data URI to avoid external
 * file dependencies.
 */
const PLACEHOLDER_COVER = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">' +
    '<rect fill="#374151" width="400" height="300"/>' +
    '<rect fill="none" stroke="#6B7280" stroke-width="2" x="140" y="100" width="120" height="100" rx="8"/>' +
    '<circle fill="#6B7280" cx="200" cy="150" r="12"/>' +
    '<rect fill="#6B7280" x="195" y="130" width="10" height="40" rx="2"/>' +
    '<text fill="#9CA3AF" font-family="sans-serif" font-size="13" text-anchor="middle" x="200" y="240">No Cover Available</text>' +
    '</svg>'
);

/**
 * Resolve a game's cover image URL with priority-based resolution.
 *
 * Priority order:
 *   1. Installed game with local cover.png:
 *      Constructs a file:// URL pointing to cover.png in the game's
 *      install directory (e.g., file:///Users/.../games/sky-ace/cover.png).
 *      The HTML onerror handler hides broken images if the file doesn't exist.
 *
 *   2. Registry-resolved cover URL:
 *      - HTTP(S) URLs are returned as-is (remote registry thumbnails).
 *      - Relative paths are converted to properly-encoded file:// URLs
 *        using the game's install path.
 *
 *   3. Default placeholder:
 *      A self-contained SVG data URI is returned when no cover source
 *      is available.
 *
 * @param {Object} game - Game object with path, cover, and installed properties
 * @returns {string} Resolved cover URL
 */
export function resolveCoverUrl(game) {
    if (!game) return PLACEHOLDER_COVER;

    // Priority 1: Installed game — use local cover.png from the game directory
    if (game.installed && game.path) {
        const normalizedPath = game.path.endsWith('/') ? game.path : game.path + '/';
        return toFileUrlIfNeeded(normalizedPath + 'cover.png');
    }

    // Priority 2: Registry-resolved cover URL (remote thumbnail or relative asset)
    if (game.cover) {
        // Absolute remote URLs are returned as-is
        if (game.cover.startsWith('http://') || game.cover.startsWith('https://')) {
            return game.cover;
        }
        // Relative paths are resolved against the game path
        return toFileUrlIfNeeded((game.path || '') + game.cover);
    }

    // Priority 3: Default placeholder when no cover source exists
    return PLACEHOLDER_COVER;
}

/**
 * Resolve a game action URL (e.g. for launching games).
 *
 * Works the same way as resolveCoverUrl but for action URLs like
 * "index.html". Downloaded games with absolute install paths are
 * converted to file:// URLs so the browser can navigate to them.
 *
 * @param {Object} game - Game object with path property
 * @param {string} relativeUrl - Relative URL (e.g. 'index.html')
 * @returns {string} Resolved URL suitable for window.location.href
 */
export function resolveGameUrl(game, relativeUrl) {
    if (!game) return relativeUrl || '';
    const fullPath = (game.path || '') + (relativeUrl || '');
    return toFileUrlIfNeeded(fullPath);
}

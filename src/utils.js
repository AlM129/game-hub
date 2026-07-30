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
 * Resolve a game's cover image URL.
 *
 * - HTTP(S) URLs are returned as-is (remote registry thumbnails).
 * - Absolute filesystem paths (downloaded games) are converted to
 *   properly-encoded file:// URLs so covers load correctly even when
 *   the install path contains spaces (e.g. "Application Support").
 *
 * @param {Object} game - Game object with path and cover properties
 * @returns {string} Resolved cover URL
 */
export function resolveCoverUrl(game) {
    if (!game) return '';
    if (!game.cover) return '';
    if (game.cover.startsWith('http://') || game.cover.startsWith('https://')) {
        return game.cover;
    }
    return toFileUrlIfNeeded((game.path || '') + game.cover);
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

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
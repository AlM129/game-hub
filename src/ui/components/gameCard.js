// ==========================================
// GAME CARD COMPONENT
// ==========================================
// Reusable game card component for library and home views

export function createGameCard(game, index, onClick) {
    const favBadge = game.favorite ? '<span class="text-yellow-400 text-xs">⭐</span>' : '';
    const card = document.createElement('div');
    card.className = `bg-gray-800 rounded-2xl overflow-hidden shadow-lg border border-gray-700 game-card ${game.theme.borderHover} group flex flex-col cursor-pointer card-animate`;
    card.style.animationDelay = `${index * 60}ms`;
    card.onclick = () => onClick(game.id);

    card.innerHTML = `
        <div class="w-full h-48 ${game.theme.bg} relative overflow-hidden flex items-center justify-center">
            <span class="absolute ${game.theme.text} font-bold tracking-wider text-lg uppercase select-none text-center px-4 z-0">${game.title}</span>
            <img src="${game.path + game.cover}" alt="${game.title}" class="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 z-10" onerror="this.style.opacity='0';">
        </div>
        <div class="p-5 flex flex-col flex-grow justify-between">
            <div>
                <div class="flex items-center justify-between mb-1.5">
                    <h2 class="text-xl font-bold text-white flex items-center gap-1.5">${favBadge} ${game.title}</h2>
                    <span class="text-[11px] text-gray-500 font-medium bg-gray-700/50 px-2 py-0.5 rounded">${game.genre}</span>
                </div>
                <p class="text-gray-400 text-xs leading-relaxed mb-5 line-clamp-2">${game.description}</p>
            </div>
            <div class="mt-auto ${game.theme.linkText} ${game.theme.linkHover} text-sm font-bold flex items-center gap-1 transition-colors">
                View Details
                <svg class="w-4 h-4 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg>
            </div>
        </div>
    `;
    
    return card;
}
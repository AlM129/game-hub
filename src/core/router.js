// ==========================================
// ROUTER - Navigation & View State Management
// ==========================================
// Handles view switching, navigation state, and current view tracking

// ==========================================
// APPLICATION STATE
// ==========================================

let currentView = 'home';
let previousView = 'home';
let currentDetailGameId = null;

// ==========================================
// VIEW CONFIGURATION
// ==========================================

const viewTitles = {
    home: 'Home',
    library: 'Games Library',
    details: 'Game Details',
    achievements: 'Achievements',
    statistics: 'Statistics',
    settings: 'Settings'
};

const navMap = {
    home: 'navHome',
    library: 'navGames',
    achievements: 'navAchievements',
    statistics: 'navStats',
    settings: 'navSettings'
};

const allViews = ['home', 'library', 'details', 'achievements', 'statistics', 'settings'];

// ==========================================
// NAVIGATION
// ==========================================

export function navigateTo(viewName) {
    if (!allViews.includes(viewName)) return;

    // Re-render views that depend on live data when navigating to them
    if (viewName === 'home' && typeof window.renderHome === 'function') {
        window.renderHome();
    }
    if (viewName === 'settings' && typeof window.renderSettings === 'function') {
        window.renderSettings();
    }
    if (viewName === 'statistics' && typeof window.renderStatistics === 'function') {
        window.renderStatistics();
    }
    if (viewName === 'achievements' && typeof window.renderAchievements === 'function') {
        window.renderAchievements();
    }

    // Hide all views
    allViews.forEach(v => {
        const el = document.getElementById(v + 'View');
        if (el && el.classList.contains('view-active')) {
            el.classList.replace('view-active', 'view-hidden');
        }
    });

    // Show target view
    const target = document.getElementById(viewName + 'View');
    if (target) {
        target.classList.replace('view-hidden', 'view-active');
    }

    // Update page title
    document.getElementById('pageTitle').textContent = viewTitles[viewName] || viewName;

    // Update navigation active state
    Object.values(navMap).forEach(id => {
        const navEl = document.getElementById(id);
        if (navEl) {
            navEl.classList.remove('active');
        }
    });

    const navId = navMap[viewName === 'details' ? 'library' : viewName];
    if (navId) {
        const navEl = document.getElementById(navId);
        if (navEl) {
            navEl.classList.add('active');
        }
    }

    // Track previous view (but not for details)
    if (viewName !== 'details') {
        previousView = viewName;
    }

    currentView = viewName;
    
    // Scroll to top
    const appContent = document.querySelector('.app-content');
    if (appContent) {
        appContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
}

// ==========================================
// STATE ACCESSORS
// ==========================================

export function getCurrentView() {
    return currentView;
}

export function getPreviousView() {
    return previousView;
}

export function getCurrentDetailGameId() {
    return currentDetailGameId;
}

export function setCurrentDetailGameId(gameId) {
    currentDetailGameId = gameId;
}

// ==========================================
// EXPORT FOR GLOBAL ACCESS
// ==========================================

// Make navigateTo available globally for HTML onclick handlers
window.navigateTo = navigateTo;
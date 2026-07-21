// ==========================================
// NOTIFICATION COMPONENT
// ==========================================
// Reusable notification component for user feedback

export function showNotification(message, type = 'info', duration = 3000) {
    const container = document.getElementById('notificationContainer');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    
    const colors = {
        info: 'bg-blue-600',
        success: 'bg-green-600',
        warning: 'bg-amber-600',
        error: 'bg-red-600'
    };
    
    notification.innerHTML = `
        <div class="${colors[type] || colors.info} text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2">
            <span class="text-sm">${message}</span>
        </div>
    `;
    
    container.appendChild(notification);
    
    // Auto-remove after duration
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, duration);
}

export function showSuccess(message, duration) {
    showNotification(message, 'success', duration);
}

export function showError(message, duration) {
    showNotification(message, 'error', duration);
}

export function showWarning(message, duration) {
    showNotification(message, 'warning', duration);
}

export function showInfo(message, duration) {
    showNotification(message, 'info', duration);
}
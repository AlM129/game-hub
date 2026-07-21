// ==========================================
// MODAL COMPONENT
// ==========================================
// Reusable modal component for dialogs and confirmations

export function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        const content = modal.querySelector('.modal-content');
        if (content) {
            content.classList.remove('scale-95');
        }
    }, 10);
}

export function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.classList.add('opacity-0');
    const content = modal.querySelector('.modal-content');
    if (content) {
        content.classList.add('scale-95');
    }
    
    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
}

export function setupModalCloseOnOutsideClick(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal(modalId);
        }
    });
}
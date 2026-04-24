/* ═══════════════════════════════════════════
   toast.js — Toast notification utility
═══════════════════════════════════════════ */

/**
 * Show a brief toast notification.
 * @param {string} msg          - Message text
 * @param {'success'|'error'|''} type - Optional semantic type
 */
function toast(msg, type = '') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const el = document.createElement('div');
  el.className = `toast ${type}`.trim();

  const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : '→';
  el.innerHTML = `<span>${icon}</span>${msg}`;

  container.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

export default toast;

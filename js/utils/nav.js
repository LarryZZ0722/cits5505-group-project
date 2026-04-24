/* ═══════════════════════════════════════════
   nav.js — Navigation helpers
   Badge count, user avatar, active link,
   share modal wiring.
═══════════════════════════════════════════ */

import State from './state.js';
import toast from './toast.js';

/* ── Badge ──────────────────────────────── */
function updateNavBadge() {
  const count = State.get().selected.length;
  document.querySelectorAll('[data-badge="sel"]').forEach(b => {
    b.textContent   = count;
    b.style.display = count > 0 ? 'inline-flex' : 'none';
  });
}

/* ── User avatar / auth links ───────────── */
function renderNavUser() {
  const right = document.getElementById('navRight');
  if (!right) return;

  const { user } = State.get();
  if (user) {
    right.innerHTML = `
      <div class="flex items-center gap-2 text-[13px] text-[var(--text2)]">
        <div class="w-[30px] h-[30px] rounded-full bg-[var(--accent-glow)] border border-[var(--accent-line)] flex items-center justify-center font-mono text-[11px] text-[var(--accent)] font-medium">${user.initials}</div>
        <span class="hidden sm:inline">${user.name}</span>
      </div>
      <a href="index.html" class="btn btn-ghost btn-sm" id="logoutBtn">Log out</a>`;

    document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      State.set({ user: null });
      window.location.href = 'index.html';
    });
  } else {
    right.innerHTML = `
      <a href="auth.html" class="btn btn-sm hidden md:inline-flex">Log in</a>
      <a href="auth.html?tab=signup" class="btn btn-sm btn-primary hidden md:inline-flex">Sign up</a>`;
  }

}

/* ── Active nav link ────────────────────── */
function markActiveLink() {
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-link').forEach(link => {
    const href = link.getAttribute('href') || '';
    link.classList.toggle('active', href === page);
  });
}

export { updateNavBadge, renderNavUser, markActiveLink };

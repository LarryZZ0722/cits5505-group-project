/* ═══════════════════════════════════════════
   nav.js — Navigation helpers
═══════════════════════════════════════════ */

import State from './state.js';

/* ── Badge ──────────────────────────────── */
function updateNavBadge(selCount = 0) {
  document.querySelectorAll('[data-badge="sel"]').forEach(b => {
    b.textContent   = selCount;
    b.style.display = selCount > 0 ? 'inline-flex' : 'none';
  });
}

/* ── User avatar / auth links ───────────── */
function renderNavUser() {
  const right = document.getElementById('navRight');
  if (!right) return;

  const user = State.getUser();
  if (user) {
    right.innerHTML = `
      <a href="profile.html" class="hidden md:flex items-center gap-2 text-[13px] text-[var(--text2)] hover:text-[var(--text)] transition-colors cursor-pointer no-underline">
        <div class="w-[30px] h-[30px] rounded-full bg-[var(--accent-glow)] border border-[var(--accent-line)] flex items-center justify-center font-mono text-[11px] text-[var(--accent)] font-medium">${user.initials}</div>
        <span class="hidden sm:inline">${user.name}</span>
      </a>
      <a href="index.html" class="btn btn-ghost btn-sm hidden md:inline-flex" id="logoutBtn">Log out</a>`;

    document.getElementById('logoutBtn')?.addEventListener('click', e => {
      e.preventDefault();
      State.clearUser();
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

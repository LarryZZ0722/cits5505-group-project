/* ═══════════════════════════════════════════
   components.js — Shared UI shell
   Injects nav, mobile sidebar, toast container.
   Owns the per-page nav init so individual
   page scripts never repeat those calls.

   Import this as a side-effect in every page:
     import './utils/components.js';
═══════════════════════════════════════════ */

import { updateNavBadge, renderNavUser, markActiveLink } from './nav.js';
import State from './state.js';

/* ── Nav HTML ───────────────────────────── */
const nav = document.createElement('nav');
nav.id        = 'appNav';
nav.className = [
  'fixed top-0 inset-x-0 z-50 h-[58px]',
  'border-b border-[var(--border)]',
  'items-center px-4 md:px-8',
  'backdrop-blur-[16px]',
].join(' ');
nav.style.cssText = 'background:var(--nav-bg);display:grid;grid-template-columns:1fr auto 1fr;';
nav.innerHTML = `
  <!-- Left: Logo -->
  <a class="font-display text-[18px] font-extrabold tracking-tight
            text-[var(--text)] flex items-center gap-2"
     href="index.html">
    <div class="nav-logo-dot"></div>
    UWA Planner
  </a>

  <!-- Center: Nav links (hidden below 768px) -->
  <div class="hidden md:flex gap-1 items-center">
    <a class="nav-link" href="courses.html">Browse Units</a>
    <a class="nav-link" href="selected.html">
      My Selection
      <span class="min-w-[16px] h-4 rounded-xl px-1 bg-[var(--accent)] text-white font-mono text-[9px] inline-flex items-center justify-center" data-badge="sel" style="display:none">0</span>
    </a>
    <a class="nav-link" href="schedule.html">Schedule</a>
    <a class="nav-link" href="friends.html">
      Friends
      <span class="min-w-[16px] h-4 rounded-xl px-1 bg-[var(--accent)] text-white font-mono text-[9px] inline-flex items-center justify-center" data-badge="req" style="display:none">0</span>
    </a>
  </div>

  <!-- Right: User / auth -->
  <div class="flex items-center gap-2 justify-end" id="navRight">
    <a class="btn btn-sm hidden md:inline-flex" href="auth.html">Log in</a>
    <a class="btn btn-sm btn-primary hidden md:inline-flex"
       href="auth.html?tab=signup">Sign up</a>
  </div>
`;
document.body.prepend(nav);

/* ── Sidebar HTML ───────────────────────── */
const sidebarOverlay = document.createElement('div');
sidebarOverlay.id        = 'sidebarOverlay';
sidebarOverlay.className = 'sidebar-overlay';

const sidebar = document.createElement('aside');
sidebar.id        = 'sidebar';
sidebar.className = 'sidebar';
sidebar.innerHTML = `
  <div class="flex items-center justify-between h-14 px-4 border-b border-[var(--border)]">
    <a class="font-display text-[16px] font-extrabold tracking-tight text-[var(--text)] flex items-center gap-2" href="index.html">
      <div class="nav-logo-dot"></div>
      UWA Planner
    </a>
    <button class="w-8 h-8 rounded border-0 bg-transparent flex items-center justify-center text-[var(--text3)] text-[20px] leading-none cursor-pointer hover:text-[var(--text)]" id="sidebarCloseBtn" aria-label="Close menu">×</button>
  </div>

  <nav class="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
    <a class="sidebar-link" href="courses.html">
      <span>Browse Units</span>
    </a>
    <a class="sidebar-link" href="selected.html">
      <span>My Selection</span>
      <span class="min-w-[16px] h-4 rounded-xl px-1 bg-[var(--accent)] text-white font-mono text-[9px] inline-flex items-center justify-center" data-badge="sel" style="display:none">0</span>
    </a>
    <a class="sidebar-link" href="schedule.html">
      <span>Schedule</span>
    </a>
    <a class="sidebar-link" href="friends.html">
      <span>Friends</span>
      <span class="min-w-[16px] h-4 rounded-xl px-1 bg-[var(--accent)] text-white font-mono text-[9px] inline-flex items-center justify-center" data-badge="req" style="display:none">0</span>
    </a>
  </nav>

  <div class="p-4 border-t border-[var(--border)]" id="sidebarFooter">
    <!-- populated by renderSidebarFooter() -->
  </div>
`;

/* ── Floating sidebar trigger (mobile only) ─ */
const fabTrigger = document.createElement('button');
fabTrigger.id        = 'sidebarFab';
fabTrigger.className = 'sidebar-fab';
fabTrigger.setAttribute('aria-label', 'Open menu');
fabTrigger.innerHTML = `<span class="sidebar-fab-icon">‹</span>`;

document.body.appendChild(sidebarOverlay);
document.body.appendChild(sidebar);
document.body.appendChild(fabTrigger);

/* ── Toast container ────────────────────── */
if (!document.getElementById('toast-container')) {
  const tc = document.createElement('div');
  tc.id = 'toast-container';
  document.body.appendChild(tc);
}

/* ── Sidebar open / close ───────────────── */
function openSidebar() {
  sidebar.classList.add('open');
  sidebarOverlay.classList.add('open');
  fabTrigger.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  sidebar.classList.remove('open');
  sidebarOverlay.classList.remove('open');
  fabTrigger.classList.remove('open');
  document.body.style.overflow = '';
}

/* ── Render user section in sidebar footer ─ */
function renderSidebarFooter() {
  const footer = document.getElementById('sidebarFooter');
  if (!footer) return;
  const { user } = State.get();

  if (user) {
    footer.innerHTML = `
      <div class="flex items-center gap-2.5 mb-3">
        <div class="w-9 h-9 rounded-full bg-[var(--accent-glow)] border border-[var(--accent-line)] flex items-center justify-center font-mono text-[12px] text-[var(--accent)] font-medium flex-shrink-0">${user.initials}</div>
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-medium text-[var(--text)] truncate">${user.name}</div>
          <div class="text-[11px] text-[var(--text3)] truncate">${user.email || ''}</div>
        </div>
      </div>
      <div class="h-px bg-[var(--border)] my-2"></div>
      <button class="sidebar-link" id="sidebarLogoutBtn" style="width:100%;border:none;cursor:pointer">
        Log out
      </button>
    `;
    document.getElementById('sidebarLogoutBtn')?.addEventListener('click', () => {
      State.set({ user: null });
      closeSidebar();
      window.location.href = 'index.html';
    });
  } else {
    footer.innerHTML = `
      <a class="btn btn-primary btn-full" href="auth.html">Log in</a>
      <a class="btn btn-full" href="auth.html?tab=signup" style="margin-top:8px">Sign up free</a>
    `;
  }
}

/* ── Mark active sidebar link ───────────── */
function markSidebarActiveLink() {
  const page = location.pathname.split('/').pop() || 'index.html';
  sidebar.querySelectorAll('.sidebar-link').forEach(link => {
    const href = link.getAttribute('href') || '';
    link.classList.toggle('active', href === page);
  });
}

/* ── Per-page init ──────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  updateNavBadge();
  renderNavUser();
  markActiveLink();
  markSidebarActiveLink();
  renderSidebarFooter();

  /* Floating trigger toggle */
  fabTrigger.addEventListener('click', () => {
    sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
  });

  /* Overlay click closes */
  sidebarOverlay.addEventListener('click', closeSidebar);

  /* Close button */
  document.getElementById('sidebarCloseBtn')?.addEventListener('click', closeSidebar);

  /* Escape key */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSidebar();
  });

  /* Close sidebar + navigate on sidebar link click */
  sidebar.querySelectorAll('.sidebar-link[href]').forEach(link => {
    link.addEventListener('click', () => closeSidebar());
  });

  /* Close sidebar if window resized to desktop */
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) closeSidebar();
  });
});

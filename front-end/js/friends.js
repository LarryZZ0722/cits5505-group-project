/* ═══════════════════════════════════════════
   friends.js — Friends page logic
═══════════════════════════════════════════ */

import State from './utils/state.js';
import API from './utils/api.js';
import toast from './utils/toast.js';
import { getColor, getActiveSessions } from './utils/schedule-utils.js';
import { updateNavBadge } from './utils/nav.js';
import './utils/components.js';

const SLOT_H  = 52;
const START_H = 8;
const TOTAL_H = 12;

let allCourses      = [];
let friends         = [];
let pendingRequests = [];
let sentRequests    = [];
let myTimetable     = { selected: [], isPublic: false, name: '' };

document.addEventListener('DOMContentLoaded', async () => {
  if (!State.getUser()) { window.location.href = 'auth.html'; return; }

  try {
    [allCourses, friends, pendingRequests, sentRequests, myTimetable] = await Promise.all([
      API.getCourses(),
      API.getFriends(),
      API.getPendingRequests(),
      API.getSentRequests(),
      API.getTimetable(),
    ]);
  } catch {
    toast('Could not load data', 'error');
  }

  updateNavBadge(myTimetable.selected?.length || 0);
  renderRequestBadge();
  checkAuth();
  renderPage();
  bindAddFriend();
  bindModal();
});

/* ── Auth check ─────────────────────────── */
function checkAuth() {
  if (!State.getUser()) {
    document.getElementById('guestBanner')?.classList.remove('hidden');
  }
  updatePrivacyStatus();
}

/* ── Request badge in nav ────────────────── */
function renderRequestBadge() {
  const count = pendingRequests.length;
  document.querySelectorAll('[data-badge="req"]').forEach(b => {
    b.textContent   = count;
    b.style.display = count > 0 ? 'inline-flex' : 'none';
  });
}

/* ── Full page render ────────────────────── */
function renderPage() {
  renderRequests();
  renderSentRequests();
  renderFriends();
}

/* ── Friend requests section ─────────────── */
function renderRequests() {
  const section = document.getElementById('requestsSection');
  const list    = document.getElementById('requestsList');
  const count   = document.getElementById('reqCount');
  if (!section || !list) return;

  if (!pendingRequests.length) { section.classList.add('hidden'); return; }

  section.classList.remove('hidden');
  if (count) count.textContent = pendingRequests.length;

  const avatarCls = 'w-10 h-10 rounded-full bg-[var(--accent-glow)] border border-[var(--accent-line)] flex items-center justify-center font-mono text-[11px] font-medium text-[var(--accent)] flex-shrink-0';
  list.innerHTML = pendingRequests.map(req => `
    <div class="bg-[var(--bg2)] border border-[var(--border)] rounded-[var(--r-lg)] p-4 flex items-center gap-3.5">
      <div class="${avatarCls}">${req.initials}</div>
      <div class="flex-1 min-w-0">
        <div class="text-[13px] font-medium text-[var(--text)]">${req.name}</div>
        <div class="text-[11px] text-[var(--text3)] mt-0.5">${req.studentNumber} · wants to be your friend</div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button class="btn btn-sm btn-primary accept-btn" data-sn="${req.studentNumber}" data-name="${req.name}">Accept</button>
        <button class="btn btn-sm decline-btn" data-sn="${req.studentNumber}">Decline</button>
      </div>
    </div>`
  ).join('');

  list.querySelectorAll('.accept-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await API.acceptFriendRequest(btn.dataset.sn);
      toast(`${btn.dataset.name} added!`, 'success');
      await reloadSocial();
      renderPage();
      renderRequestBadge();
    });
  });

  list.querySelectorAll('.decline-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await API.declineFriendRequest(btn.dataset.sn);
      await reloadSocial();
      renderPage();
      renderRequestBadge();
    });
  });
}

/* ── Sent requests section ───────────────── */
function renderSentRequests() {
  const section = document.getElementById('sentSection');
  const list    = document.getElementById('sentList');
  if (!section || !list) return;

  if (!sentRequests.length) { section.classList.add('hidden'); return; }

  section.classList.remove('hidden');
  const pendingCls = 'inline-flex items-center gap-1 font-mono text-[10px] px-[7px] py-0.5 rounded-lg bg-[rgba(245,166,35,.1)] border border-[rgba(245,166,35,.3)] text-[#f5a623]';
  const avatarCls  = 'w-10 h-10 rounded-full bg-[var(--accent-glow)] border border-[var(--accent-line)] flex items-center justify-center font-mono text-[14px] font-medium text-[var(--accent)] flex-shrink-0';
  list.innerHTML = sentRequests.map(req => `
    <div class="bg-[var(--bg2)] border border-[var(--border2)] rounded-[var(--r-lg)] p-4 flex items-center gap-3.5">
      <div class="${avatarCls}">${req.initials}</div>
      <div class="flex-1 min-w-0">
        <div class="text-[13px] font-medium text-[var(--text)]">${req.name}</div>
        <div class="text-[11px] text-[var(--text3)] mt-0.5">${req.studentNumber} · <span class="${pendingCls}">⏳ Pending</span></div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button class="btn btn-sm cancel-req-btn" data-sn="${req.studentNumber}">Cancel</button>
      </div>
    </div>`
  ).join('');

  list.querySelectorAll('.cancel-req-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await API.cancelFriendRequest(btn.dataset.sn);
      toast('Request cancelled');
      await reloadSocial();
      renderPage();
    });
  });
}

/* ── Friends list ────────────────────────── */
function renderFriends() {
  const list  = document.getElementById('friendsList');
  const empty = document.getElementById('friendsEmpty');
  if (!list) return;

  if (!friends.length) {
    list.innerHTML = '';
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  const pubBadgeCls  = 'inline-flex items-center gap-1 font-mono text-[10px] px-[7px] py-0.5 rounded-lg bg-[var(--green-bg)] border border-[rgba(45,212,160,.3)] text-[var(--green)]';
  const privBadgeCls = 'inline-flex items-center gap-1 font-mono text-[10px] px-[7px] py-0.5 rounded-lg bg-[var(--bg3)] border border-[var(--border2)] text-[var(--text3)]';

  list.innerHTML = friends.map((f, i) => {
    const col = getColor(i);
    return `
      <div class="bg-[var(--bg2)] border border-[var(--border)] rounded-[var(--r-lg)] p-4 flex items-center gap-3.5 transition-[border-color] hover:border-[var(--border2)]">
        <div class="w-10 h-10 rounded-full border flex items-center justify-center font-mono text-[11px] font-medium flex-shrink-0" style="background:${col.bg};border-color:${col.border};color:${col.border}">
          ${f.initials}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-medium text-[var(--text)]">${f.name}</div>
          <div class="text-[11px] text-[var(--text3)] mt-0.5">${f.studentNumber} · <span class="tt-status-badge" data-sn="${f.studentNumber}"><span class="${privBadgeCls}">🔒 Private</span></span></div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          <button class="btn btn-sm btn-primary view-tt-btn" data-sn="${f.studentNumber}" style="display:none">View Timetable</button>
          <button class="btn btn-sm" data-sn="${f.studentNumber}" data-private="1" style="opacity:.4;cursor:not-allowed;display:none" disabled title="This friend's timetable is private">Private</button>
          <button class="btn btn-sm btn-danger remove-friend-btn" data-sn="${f.studentNumber}" data-name="${f.name}" title="Remove friend">✕</button>
        </div>
      </div>`;
  }).join('');

  // Load each friend's timetable visibility asynchronously
  friends.forEach(f => {
    API.getFriendTimetable(f.studentNumber).then(pub => {
      const badge = list.querySelector(`.tt-status-badge[data-sn="${f.studentNumber}"]`);
      if (badge) badge.innerHTML = pub
        ? `<span class="${pubBadgeCls}">🌐 Public</span>`
        : `<span class="${privBadgeCls}">🔒 Private</span>`;

      const viewBtn    = list.querySelector(`.view-tt-btn[data-sn="${f.studentNumber}"]`);
      const privateBtn = list.querySelector(`[data-private="1"][data-sn="${f.studentNumber}"]`);
      if (pub) {
        viewBtn?.removeAttribute('style');
      } else {
        privateBtn?.removeAttribute('style');
      }
    });
  });

  list.querySelectorAll('.view-tt-btn').forEach(btn => {
    btn.addEventListener('click', () => openTimetableModal(btn.dataset.sn));
  });

  list.querySelectorAll('.remove-friend-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await API.removeFriend(btn.dataset.sn);
      toast(`${btn.dataset.name} removed from friends`);
      await reloadSocial();
      renderPage();
    });
  });
}

/* ── Privacy status (right sidebar) ─────── */
function updatePrivacyStatus() {
  const badge = document.getElementById('myPublicBadge');
  if (!badge) return;
  badge.className   = myTimetable.isPublic
    ? 'inline-flex items-center gap-1 font-mono text-[10px] px-[7px] py-0.5 rounded-lg bg-[var(--green-bg)] border border-[rgba(45,212,160,.3)] text-[var(--green)]'
    : 'inline-flex items-center gap-1 font-mono text-[10px] px-[7px] py-0.5 rounded-lg bg-[var(--bg3)] border border-[var(--border2)] text-[var(--text3)]';
  badge.textContent = myTimetable.isPublic ? '🌐 Public' : '🔒 Private';
}

/* ── Reload social data after mutations ──── */
async function reloadSocial() {
  [friends, pendingRequests, sentRequests] = await Promise.all([
    API.getFriends(),
    API.getPendingRequests(),
    API.getSentRequests(),
  ]);
}

/* ── Add friend ─────────────────────────── */
function bindAddFriend() {
  const btn   = document.getElementById('addFriendBtn');
  const input = document.getElementById('addStudentNum');
  const err   = document.getElementById('addErr');
  if (!btn || !input) return;

  btn.addEventListener('click', () => doAddFriend(input, err));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doAddFriend(input, err); });
}

async function doAddFriend(input, errEl) {
  const sn = input.value.trim();

  if (!/^2\d{7}$/.test(sn)) {
    showErr(errEl, 'Must be an 8-digit number starting with 2.');
    return;
  }
  const user = State.getUser();
  if (user?.studentNumber === sn) {
    showErr(errEl, "That's your own student number!");
    return;
  }
  if (friends.some(f => f.studentNumber === sn)) {
    showErr(errEl, 'Already in your friends list.');
    return;
  }
  if (sentRequests.some(r => r.studentNumber === sn)) {
    showErr(errEl, 'Request already sent — waiting for them to accept.');
    return;
  }

  try {
    await API.sendFriendRequest(sn);
    await reloadSocial();
    hideErr(errEl);
    input.value = '';
    const profile = await API.lookupUser(sn);
    toast(`Request sent to ${profile.name}!`, 'success');
    renderPage();
  } catch (err) {
    showErr(errEl, err.message || 'Could not send request');
  }
}

function showErr(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideErr(el) {
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
}

/* ── Timetable modal ─────────────────────── */
function bindModal() {
  document.getElementById('ttModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('ttModal')) closeTimetableModal();
  });
  document.getElementById('ttModalClose')?.addEventListener('click', closeTimetableModal);
}

async function openTimetableModal(studentNumber) {
  const pub = await API.getFriendTimetable(studentNumber);
  if (!pub) { toast('Timetable not available', 'error'); return; }

  document.getElementById('ttModalAvatar').textContent = pub.owner?.initials || '?';
  document.getElementById('ttModalName').textContent   = pub.owner?.name    || 'Friend';
  document.getElementById('ttModalMeta').textContent   =
    `${pub.semester || 'S1'} · ${pub.timetableName || 'Timetable'} · Public`;

  const unitEl = document.getElementById('ttModalUnits');
  if (unitEl) {
    unitEl.innerHTML = (pub.selected || []).map((s, i) => {
      const col = getColor(i);
      return `<span class="inline-flex items-center px-[7px] py-[2px] rounded-md text-[10px] font-mono border" style="background:${col.bg};border-color:${col.border};color:${col.border}">${s.code}</span>`;
    }).join('');
  }

  renderModalGrid(pub.selected || []);
  document.getElementById('ttModal')?.classList.add('open');
}

function closeTimetableModal() {
  document.getElementById('ttModal')?.classList.remove('open');
}

function renderModalGrid(selected) {
  const body = document.getElementById('ttModalBody');
  if (!body) return;

  let html = '';
  for (let r = 0; r < TOTAL_H; r++) {
    html += `<div class="tt-time">${START_H + r}:00</div>`;
    for (let d = 0; d < 5; d++) {
      html += `<div class="tt-cell" data-row="${r}" data-day="${d}"></div>`;
    }
  }
  body.innerHTML = html;

  selected.forEach(({ code, altIdx }, ci) => {
    const course = allCourses.find(c => c.code === code);
    if (!course) return;
    const col = getColor(ci);

    getActiveSessions(course, altIdx).forEach(sess => {
      const row  = sess.hour - START_H;
      const cell = body.querySelector(`[data-row="${row}"][data-day="${sess.day}"]`);
      if (!cell) return;

      const pill = document.createElement('div');
      pill.className = 'class-pill';
      pill.style.cssText = `
        top: 3px;
        height: ${sess.duration * SLOT_H - 6}px;
        background: ${col.bg};
        border-left-color: ${col.border};
        color: ${col.text};
      `;
      pill.innerHTML = `
        <div class="pill-code">${code}</div>
        <div class="pill-type">${sess.type}</div>
        <div class="pill-name">${course.name}</div>
      `;
      cell.appendChild(pill);
    });
  });
}

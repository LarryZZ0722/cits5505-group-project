/* ═══════════════════════════════════════════
   friends.js — Friends page logic
═══════════════════════════════════════════ */

import State from './utils/state.js';
import API from './utils/api.js';
import toast from './utils/toast.js';
import { getColor, getActiveSessions } from './utils/schedule-utils.js';
import './utils/components.js';

/* ── Mock friend profiles for demo ─────── */
const MOCK_PROFILES = {
  '21234567': { id: 1, name: 'Alex Smith',   initials: 'AS', email: '21234567@student.uwa.edu.au', studentNumber: '21234567' },
  '21345678': { id: 2, name: 'Jordan Lee',   initials: 'JL', email: '21345678@student.uwa.edu.au', studentNumber: '21345678' },
  '21456789': { id: 3, name: 'Riley Morgan', initials: 'RM', email: '21456789@student.uwa.edu.au', studentNumber: '21456789' },
  '21567890': { id: 4, name: 'Casey Park',   initials: 'CP', email: '21567890@student.uwa.edu.au', studentNumber: '21567890' },
};

const SLOT_H  = 52;
const START_H = 8;
const TOTAL_H = 12;

let allCourses = [];

document.addEventListener('DOMContentLoaded', async () => {
  try {
    allCourses = await API.getCourses();
  } catch {
    toast('Could not load unit data', 'error');
  }

  seedMockData();
  State.checkInbox();
  State.checkAccepted();
  checkAuth();
  renderRequestBadge();
  renderPage();
  bindAddFriend();
  bindModal();
});

/* ── Seed demo data ─────────────────────── */
function seedMockData() {
  // Pre-populate Alex's public timetable so the demo is useful out of the box
  State.seedMockPublicTimetable('21234567', {
    timetableName: 'Semester 1 Plan',
    semester:      'S1',
    owner:         { name: 'Alex Smith', initials: 'AS', studentNumber: '21234567' },
    selected:      [
      { code: 'CITS1001', altIdx: 0 },
      { code: 'MATH1001', altIdx: 0 },
    ],
    updatedAt: new Date().toISOString(),
  });
  // Jordan has no public timetable (private by default)
}

/* ── Auth check ─────────────────────────── */
function checkAuth() {
  const { user } = State.get();
  if (!user) {
    document.getElementById('guestBanner')?.classList.remove('hidden');
  }
  updatePrivacyStatus();
}

/* ── Render request badge in nav + sidebar ── */
function renderRequestBadge() {
  const { friendRequests } = State.get();
  const count = friendRequests.length;
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
  const { friendRequests } = State.get();
  const section = document.getElementById('requestsSection');
  const list    = document.getElementById('requestsList');
  const count   = document.getElementById('reqCount');
  if (!section || !list) return;

  if (!friendRequests.length) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  if (count) count.textContent = friendRequests.length;

  const avatarCls = 'w-10 h-10 rounded-full bg-[var(--accent-glow)] border border-[var(--accent-line)] flex items-center justify-center font-mono text-[11px] font-medium text-[var(--accent)] flex-shrink-0';
  list.innerHTML = friendRequests.map(req => `
    <div class="bg-[var(--bg2)] border border-[var(--border)] rounded-[var(--r-lg)] p-4 flex items-center gap-3.5">
      <div class="${avatarCls}">${req.initials}</div>
      <div class="flex-1 min-w-0">
        <div class="text-[13px] font-medium text-[var(--text)]">${req.name}</div>
        <div class="text-[11px] text-[var(--text3)] mt-0.5">${req.studentNumber} · wants to be your friend</div>
      </div>
      <div class="flex items-center gap-2 flex-shrink-0">
        <button class="btn btn-sm btn-primary accept-btn" data-sn="${req.studentNumber}">Accept</button>
        <button class="btn btn-sm decline-btn" data-sn="${req.studentNumber}">Decline</button>
      </div>
    </div>`
  ).join('');

  list.querySelectorAll('.accept-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      State.acceptFriendRequest(btn.dataset.sn);
      toast(`${btn.closest('.request-card').querySelector('.friend-name').textContent} added!`, 'success');
      renderPage();
      renderRequestBadge();
    });
  });

  list.querySelectorAll('.decline-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      State.declineFriendRequest(btn.dataset.sn);
      renderPage();
      renderRequestBadge();
    });
  });
}

/* ── Sent requests section ───────────────── */
function renderSentRequests() {
  const { sentRequests } = State.get();
  const section = document.getElementById('sentSection');
  const list    = document.getElementById('sentList');
  if (!section || !list) return;

  if (!sentRequests.length) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  const pendingCls = 'inline-flex items-center gap-1 font-mono text-[10px] px-[7px] py-0.5 rounded-lg bg-[rgba(245,166,35,.1)] border border-[rgba(245,166,35,.3)] text-[#f5a623]';
  const avatarCls2 = 'w-10 h-10 rounded-full bg-[var(--accent-glow)] border border-[var(--accent-line)] flex items-center justify-center font-mono text-[14px] font-medium text-[var(--accent)] flex-shrink-0';
  list.innerHTML = sentRequests.map(req => `
    <div class="bg-[var(--bg2)] border border-[var(--border2)] rounded-[var(--r-lg)] p-4 flex items-center gap-3.5">
      <div class="${avatarCls2}">${req.initials}</div>
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
    btn.addEventListener('click', () => {
      State.cancelSentRequest(btn.dataset.sn);
      toast('Request cancelled');
      renderPage();
    });
  });
}

/* ── Friends list ────────────────────────── */
function renderFriends() {
  const { friends } = State.get();
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
    const pub = State.getFriendPublicTimetable(f.studentNumber);
    const col = getColor(i);
    const badgeHtml = pub
      ? `<span class="${pubBadgeCls}">🌐 Public</span>`
      : `<span class="${privBadgeCls}">🔒 Private</span>`;

    return `
      <div class="bg-[var(--bg2)] border border-[var(--border)] rounded-[var(--r-lg)] p-4 flex items-center gap-3.5 transition-[border-color] hover:border-[var(--border2)]">
        <div class="w-10 h-10 rounded-full border flex items-center justify-center font-mono text-[11px] font-medium flex-shrink-0" style="background:${col.bg};border-color:${col.border};color:${col.border}">
          ${f.initials}
        </div>
        <div class="flex-1 min-w-0">
          <div class="text-[13px] font-medium text-[var(--text)]">${f.name}</div>
          <div class="text-[11px] text-[var(--text3)] mt-0.5">${f.studentNumber} · ${badgeHtml}</div>
        </div>
        <div class="flex items-center gap-2 flex-shrink-0">
          ${pub
            ? `<button class="btn btn-sm btn-primary view-tt-btn" data-sn="${f.studentNumber}">View Timetable</button>`
            : `<button class="btn btn-sm" disabled title="This friend's timetable is private" style="opacity:.4;cursor:not-allowed">Private</button>`
          }
          <button class="btn btn-sm btn-danger remove-friend-btn" data-sn="${f.studentNumber}" title="Remove friend">✕</button>
        </div>
      </div>`;
  }).join('');

  list.querySelectorAll('.view-tt-btn').forEach(btn => {
    btn.addEventListener('click', () => openTimetableModal(btn.dataset.sn));
  });

  list.querySelectorAll('.remove-friend-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const friend = State.get().friends.find(f => f.studentNumber === btn.dataset.sn);
      if (friend) {
        State.removeFriend(btn.dataset.sn);
        toast(`${friend.name} removed from friends`);
        renderPage();
      }
    });
  });
}

/* ── Privacy status (right sidebar) ─────── */
function updatePrivacyStatus() {
  const { isPublic } = State.get();
  const badge = document.getElementById('myPublicBadge');
  if (!badge) return;
  badge.className   = isPublic
    ? 'inline-flex items-center gap-1 font-mono text-[10px] px-[7px] py-0.5 rounded-lg bg-[var(--green-bg)] border border-[rgba(45,212,160,.3)] text-[var(--green)]'
    : 'inline-flex items-center gap-1 font-mono text-[10px] px-[7px] py-0.5 rounded-lg bg-[var(--bg3)] border border-[var(--border2)] text-[var(--text3)]';
  badge.textContent = isPublic ? '🌐 Public' : '🔒 Private';
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

function doAddFriend(input, errEl) {
  const sn = input.value.trim();

  // Validate format
  if (!/^2\d{7}$/.test(sn)) {
    showErr(errEl, 'Must be an 8-digit number starting with 2.');
    return;
  }
  // Can't add yourself
  const { user } = State.get();
  if (user?.studentNumber === sn) {
    showErr(errEl, 'That\'s your own student number!');
    return;
  }
  // Already a friend?
  if (State.hasFriend(sn)) {
    showErr(errEl, 'Already in your friends list.');
    return;
  }
  // Already sent a request?
  if (State.hasSentRequest(sn)) {
    showErr(errEl, 'Request already sent — waiting for them to accept.');
    return;
  }

  // Look up profile (mock lookup)
  const profile = MOCK_PROFILES[sn] || {
    id:            Date.now(),
    name:          `Student ${sn}`,
    initials:      sn.slice(-2),
    email:         `${sn}@student.uwa.edu.au`,
    studentNumber: sn,
  };

  State.sendFriendRequest(profile);
  hideErr(errEl);
  input.value = '';
  toast(`Request sent to ${profile.name}!`, 'success');
  renderPage();
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

function openTimetableModal(studentNumber) {
  const pub = State.getFriendPublicTimetable(studentNumber);
  if (!pub) { toast('Timetable not available', 'error'); return; }

  // Header
  document.getElementById('ttModalAvatar').textContent = pub.owner?.initials || '?';
  document.getElementById('ttModalName').textContent   = pub.owner?.name    || 'Friend';
  document.getElementById('ttModalMeta').textContent   =
    `${pub.semester || 'S1'} · ${pub.timetableName || 'Timetable'} · Public`;

  // Render unit badge list
  const unitEl = document.getElementById('ttModalUnits');
  if (unitEl) {
    unitEl.innerHTML = (pub.selected || []).map((s, i) => {
      const col = getColor(i);
      return `<span class="inline-flex items-center px-[7px] py-[2px] rounded-md text-[10px] font-mono border" style="background:${col.bg};border-color:${col.border};color:${col.border}">${s.code}</span>`;
    }).join('');
  }

  // Render timetable grid
  renderModalGrid(pub.selected || []);

  // Open modal
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

/* ═══════════════════════════════════════════
   schedule.js — My Schedule page
   Multi-timetable management
═══════════════════════════════════════════ */

import State  from './utils/state.js';
import API    from './utils/api.js';
import toast  from './utils/toast.js';
import { DAYS, getColor, getActiveSessions, getDaysUsed } from './utils/schedule-utils.js';
import { updateNavBadge } from './utils/nav.js';
import './utils/components.js';

const SLOT_H  = 52;
const START_H = 8;
const TOTAL_H = 12;

let allTimetables    = [];
let activeTtId       = null;
let allCourses       = [];
let selected         = [];
let conflicts        = new Set();
let isPublic         = false;
let timetableName    = '';
let activeGhostCode = null;

document.addEventListener('DOMContentLoaded', async () => {
  if (!State.getUser()) { window.location.href = '/auth'; return; }

  try {
    [allCourses, allTimetables] = await Promise.all([
      API.getCourses(),
      API.getTimetables(),
    ]);
    allTimetables = allTimetables || [];
    try {
      const custom = await API.getCustomCourses();
      custom.forEach(c => {
        if (!allCourses.find(x => x.code === c.code)) allCourses.push(c);
      });
    } catch {}
  } catch {
    toast('Could not load data', 'error');
  }

  // Determine active timetable
  const savedId = State.getActiveTimetableId();
  const match   = allTimetables.find(t => t.id === savedId);
  activeTtId    = match ? savedId : (allTimetables[0]?.id ?? null);

  // Auto-create first timetable for new users
  if (!activeTtId) {
    try {
      const tt      = await API.createTimetable({ name: 'My Timetable' });
      allTimetables = [tt];
      activeTtId    = tt.id;
    } catch {}
  }

  State.setActiveTimetableId(activeTtId);
  await loadActiveTimetable();
  updateNavBadge(selected.length);
  renderTimetableList();
  renderUI();
  bindControls();
});

/* ── Load full data for the active timetable ── */
async function loadActiveTimetable() {
  if (!activeTtId) { selected = []; isPublic = false; timetableName = ''; return; }
  try {
    const tt  = await API.getTimetableById(activeTtId);
    selected      = tt.selected  || [];
    isPublic      = tt.isPublic;
    timetableName = tt.name;
    const cached  = allTimetables.find(t => t.id === activeTtId);
    if (cached) { cached.isPublic = tt.isPublic; cached.name = tt.name; }
  } catch {
    selected = []; isPublic = false; timetableName = '';
  }
  await refreshConflicts();
}

/* ── Conflict detection (backend) ──────────── */
async function refreshConflicts() {
  if (!activeTtId) { conflicts = new Set(); return; }
  try {
    const { conflicts: list } = await API.detectConflicts(activeTtId, selected);
    conflicts = new Set(list);
  } catch { conflicts = new Set(); }
}

/* ── Save + re-render ──────────────────────── */
async function saveAndRefresh() {
  if (!activeTtId) return;
  await API.updateTimetable(activeTtId, { selected });
  updateNavBadge(selected.length);
  await refreshConflicts();
  renderUI();
  renderTimetableList();
}

/* ── Timetable list sidebar ─────────────────── */
function renderTimetableList() {
  const el = document.getElementById('ttList');
  if (!el) return;

  if (!allTimetables.length) {
    el.innerHTML = '<div class="px-4 py-3 text-[12px] text-[var(--text3)] italic">No timetables</div>';
    return;
  }

  el.innerHTML = allTimetables.map(tt => {
    const isActive = tt.id === activeTtId;
    const badge    = tt.isPublic
      ? `<span style="font-size:10px;color:var(--green);flex-shrink:0" title="Visible to friends">🌐</span>`
      : `<span style="font-size:10px;color:var(--text3);flex-shrink:0" title="Private">🔒</span>`;
    const del = allTimetables.length > 1
      ? `<button class="tt-item-del" data-id="${tt.id}" title="Delete timetable">×</button>`
      : '';
    return `<button class="tt-list-item${isActive ? ' active' : ''}" data-id="${tt.id}">
      <span class="tt-item-dot"></span>
      <span class="tt-item-name">${escHtml(tt.name)}</span>
      ${badge}${del}
    </button>`;
  }).join('');

  el.querySelectorAll('.tt-list-item').forEach(btn => {
    btn.addEventListener('click', e => {
      if (e.target.closest('.tt-item-del')) return;
      switchTimetable(parseInt(btn.dataset.id));
    });
  });
  el.querySelectorAll('.tt-item-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      confirmDelete(parseInt(btn.dataset.id));
    });
  });
}

async function switchTimetable(id) {
  if (id === activeTtId) return;
  activeTtId = id;
  State.setActiveTimetableId(id);
  await loadActiveTimetable();
  updateNavBadge(selected.length);
  renderTimetableList();
  renderUI();
}

async function confirmDelete(id) {
  const tt = allTimetables.find(t => t.id === id);
  if (!tt || !confirm(`Delete "${tt.name}"? This cannot be undone.`)) return;
  try {
    await API.deleteTimetable(id);
    allTimetables = allTimetables.filter(t => t.id !== id);
    if (activeTtId === id) {
      activeTtId = allTimetables[0]?.id ?? null;
      State.setActiveTimetableId(activeTtId);
      await loadActiveTimetable();
    }
    renderTimetableList();
    renderUI();
    updateNavBadge(selected.length);
    toast(`"${tt.name}" deleted`);
  } catch { toast('Could not delete timetable', 'error'); }
}

/* ── Full UI render ──────────────────────────── */
function renderUI() {
  const nameEl = document.getElementById('activeTtName');
  if (nameEl) nameEl.textContent = timetableName || 'My Timetable';

  const toggle = document.getElementById('publicToggle');
  if (toggle) toggle.checked = isPublic;

  const drawer = document.getElementById('altDrawer');
  if (drawer) drawer.style.display = 'none';

  renderSummaryBar(conflicts);
  renderConflictAlert(conflicts);
  renderLegend();
  renderVariantButtons();
  renderTimetable(conflicts);
  renderUnitCards(conflicts);
}

/* ── Summary bar ─────────────────────────────── */
function renderSummaryBar(conflicts) {
  const el = document.getElementById('summaryBar');
  if (!el) return;
  if (!selected.length) { el.style.display = 'none'; return; }
  el.style.display = '';

  const days = getDaysUsed(selected, allCourses);
  el.innerHTML = `
    <div class="text-center px-4 py-5">
      <div class="text-[28px] font-display font-extrabold tracking-tight text-[var(--text)]">${selected.length}</div>
      <div class="text-[11px] text-[var(--text3)] uppercase tracking-widest font-mono mt-1">Units</div>
    </div>
    <div class="text-center px-4 py-5">
      <div class="text-[28px] font-display font-extrabold tracking-tight text-[var(--text)]">${days}</div>
      <div class="text-[11px] text-[var(--text3)] uppercase tracking-widest font-mono mt-1">Days on campus</div>
    </div>
    <div class="text-center px-4 py-5">
      <div class="text-[28px] font-display font-extrabold tracking-tight" style="color:${conflicts.size ? 'var(--red)' : 'var(--green)'}">
        ${conflicts.size ? '⚠' : '✓'}
      </div>
      <div class="text-[11px] text-[var(--text3)] uppercase tracking-widest font-mono mt-1">${conflicts.size ? 'Clashes' : 'No conflicts'}</div>
    </div>`;
}

/* ── Conflict alert ──────────────────────────── */
function renderConflictAlert(conflicts) {
  const el = document.getElementById('conflictAlert');
  if (el) el.style.display = conflicts.size ? 'flex' : 'none';
}

/* ── Unit legend ─────────────────────────────── */
function renderLegend() {
  const el = document.getElementById('legendList');
  if (!el) return;
  if (!selected.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3)">No units selected</div>';
    return;
  }
  el.innerHTML = selected.map(({ code }, i) => {
    const col    = getColor(i);
    const course = allCourses.find(c => c.code === code);
    return `<div class="flex items-center gap-2.5">
      <div class="w-3 h-3 rounded-full flex-shrink-0" style="background:${col.border}"></div>
      <span class="font-mono text-[11px] font-medium text-[var(--text)]">${code}</span>
      <span class="text-[12px] text-[var(--text2)] truncate">${course?.name || 'Unknown unit'}</span>
    </div>`;
  }).join('');
}

/* ── Variant buttons ─────────────────────────── */
function renderVariantButtons() {
  const el = document.getElementById('variantList');
  if (!el) return;

  const withAlts = selected.filter(({ code }) => allCourses.find(x => x.code === code)?.alternatives?.length);

  if (!withAlts.length) {
    el.innerHTML = '<div style="font-size:12px;color:var(--text3)">No alternatives available</div>';
    return;
  }

  el.innerHTML = withAlts.map(({ code, altIdx }) =>
    `<button class="variant-btn active" data-code="${code}">
      <div class="variant-dot"></div>
      ${code} — ${altIdx === 0 ? 'default' : 'option ' + altIdx}
    </button>`
  ).join('');

  el.querySelectorAll('.variant-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const code   = btn.dataset.code;
      const course = allCourses.find(c => c.code === code);
      const ci     = selected.findIndex(s => s.code === code);
      const altType = (course?.alternatives?.[0] || [])[0]?.type || 'LAB';
      showGhostAlternatives(code, altType, ci);
    });
  });
}

/* ── Timetable grid ──────────────────────────── */
function renderTimetable(conflicts) {
  const body = document.getElementById('ttBody');
  if (!body) return;

  let html = '';
  for (let r = 0; r < TOTAL_H; r++) {
    html += `<div class="tt-time">${START_H + r}:00</div>`;
    for (let d = 0; d < 5; d++) {
      html += `<div class="tt-cell" data-row="${r}" data-day="${d}"></div>`;
    }
  }
  body.innerHTML = html;

  body.addEventListener('click', clearGhosts);

  selected.forEach(({ code, altIdx }, ci) => {
    const course     = allCourses.find(c => c.code === code);
    if (!course) return;
    const col        = getColor(ci);
    const isConflict = conflicts.has(code);

    getActiveSessions(course, altIdx).forEach(sess => {
      const row  = sess.hour - START_H;
      const cell = body.querySelector(`[data-row="${row}"][data-day="${sess.day}"]`);
      if (!cell) return;
      const pill = document.createElement('div');
      pill.className = 'class-pill' + (isConflict ? ' conflict' : '');
      pill.dataset.code  = code;
      pill.dataset.stype = sess.type;
      pill.style.cssText = `
        top: 3px;
        height: ${sess.duration * SLOT_H - 6}px;
        background: ${isConflict ? 'rgba(247,111,111,.18)' : col.bg};
        border-left-color: ${isConflict ? '#f76f6f' : col.border};
        color: ${isConflict ? '#fca5a5' : col.text};
      `;
      pill.innerHTML = `
        <div class="pill-code">${code}</div>
        <div class="pill-type">${sess.type}</div>
        <div class="pill-name">${course.name}</div>
      `;
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        showGhostAlternatives(code, sess.type, ci);
      });
      cell.appendChild(pill);
    });
  });
}

/* ── Unit cards ──────────────────────────────── */
const SESSION_TYPE_CLS = {
  lec: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  lab: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  tut: 'bg-green-500/10 border-green-500/30 text-green-400',
};

function renderUnitCards(conflicts) {
  const grid  = document.getElementById('unitsGrid');
  const empty = document.getElementById('emptyState');
  if (!grid) return;

  if (!selected.length) {
    grid.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }
  grid.style.display = '';
  if (empty) empty.style.display = 'none';

  grid.innerHTML = selected.map(({ code, altIdx }, i) => {
    const course     = allCourses.find(c => c.code === code);
    const col        = getColor(i);
    const isConflict = conflicts.has(code);
    return course ? buildUnitCard(course, altIdx, col, isConflict) : buildUnknownCard(code, col);
  }).join('');

  grid.querySelectorAll('.remove-unit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code   = btn.dataset.code;
      const course = allCourses.find(c => c.code === code);
      selected     = selected.filter(x => x.code !== code);
      if (course?.custom) {
        allCourses = allCourses.filter(c => c.code !== code);
        await API.deleteCustomCourse(code);
      }
      toast(`${code} removed`);
      await saveAndRefresh();
    });
  });

  grid.querySelectorAll('.swap-btn').forEach(btn => {
    btn.addEventListener('click', () => showAltDrawer(btn.dataset.code));
  });
}

function buildUnitCard(course, altIdx, col, isConflict) {
  const sessions    = getActiveSessions(course, altIdx);
  const sessionHTML = sessions.map(s => {
    const typeCls = SESSION_TYPE_CLS[s.type.toLowerCase()] || 'border-[var(--border2)] text-[var(--text2)] bg-[var(--bg3)]';
    const hasAlts = course.alternatives?.length && s.type !== 'LEC';
    return `<div class="flex items-center gap-2 text-[12px]">
      <span class="font-mono text-[10px] font-medium px-[7px] py-[2px] rounded-md border ${typeCls}">${s.type}</span>
      <span class="text-[var(--text2)]">${DAYS[s.day]} ${s.hour}:00 – ${s.hour + s.duration}:00</span>
      ${hasAlts ? `<button class="ml-auto text-[var(--accent)] text-[11px] font-mono hover:underline bg-transparent border-0 cursor-pointer swap-btn" data-code="${course.code}">swap →</button>` : ''}
    </div>`;
  }).join('');

  const tagCls  = 'inline-flex items-center px-[7px] py-[2px] rounded-md text-[10px] font-mono border border-[var(--border2)] bg-[var(--bg3)] text-[var(--text2)]';
  const tagHTML = [
    ...course.sems.map(s => `<span class="${tagCls}">${s}</span>`),
    `<span class="${tagCls}">${course.faculty}</span>`,
    isConflict ? `<span class="inline-flex items-center px-[7px] py-[2px] rounded-md text-[10px] font-mono border border-[rgba(247,111,111,.35)] bg-[var(--red-bg)] text-[var(--red)]">Conflict</span>` : '',
  ].join('');

  const cardBorder = isConflict ? 'border-[var(--red)]' : 'border-[var(--border)] hover:border-[var(--border2)]';
  return `<div class="bg-[var(--bg2)] border ${cardBorder} rounded-[var(--r-xl)] overflow-hidden transition-[border-color,transform] hover:-translate-y-0.5">
    <div class="flex items-start gap-3 p-4">
      <div class="w-[3px] self-stretch rounded-full flex-shrink-0" style="background:${col.border}"></div>
      <div class="flex-1 min-w-0">
        <div class="font-mono text-[11px] font-medium text-[var(--text3)] uppercase tracking-wider">${course.code}</div>
        <div class="font-display text-[15px] font-semibold text-[var(--text)] leading-tight mt-0.5">${course.name}</div>
      </div>
      <button class="btn btn-sm btn-danger remove-unit-btn flex-shrink-0" data-code="${course.code}">Remove</button>
    </div>
    <div class="px-4 pb-4 flex flex-col gap-3">
      <div class="flex flex-col gap-1.5">${sessionHTML}</div>
      <div class="flex flex-wrap gap-1.5">${tagHTML}</div>
    </div>
  </div>`;
}

function buildUnknownCard(code, col) {
  return `<div class="bg-[var(--bg2)] border border-[var(--border)] rounded-[var(--r-xl)] overflow-hidden">
    <div class="flex items-start gap-3 p-4">
      <div class="w-[3px] self-stretch rounded-full flex-shrink-0" style="background:${col.border}"></div>
      <div class="flex-1 min-w-0">
        <div class="font-mono text-[11px] font-medium text-[var(--text3)] uppercase tracking-wider">${code}</div>
        <div class="font-display text-[15px] font-semibold leading-tight mt-0.5" style="color:var(--text2)">Custom / unknown unit</div>
      </div>
      <button class="btn btn-sm btn-danger remove-unit-btn flex-shrink-0" data-code="${code}">Remove</button>
    </div>
  </div>`;
}

/* ── Ghost alternative overlays ──────────────── */
function showGhostAlternatives(code, sessType, colorIdx) {
  clearGhosts();

  const course = allCourses.find(c => c.code === code);
  const entry  = selected.find(s => s.code === code);
  if (!course) return;

  const ci  = colorIdx ?? selected.findIndex(s => s.code === code);
  const col = getColor(ci);
  const currentAltIdx = entry?.altIdx ?? 0;

  // Collect all slot options for this session type
  const typeAlts = [];
  const defSess = course.sessions.filter(s => s.type === sessType);
  if (defSess.length) typeAlts.push({ idx: 0, sessions: defSess });
  (course.alternatives || []).forEach((alt, i) => {
    const match = alt.filter(s => s.type === sessType);
    if (match.length) typeAlts.push({ idx: i + 1, sessions: match });
  });

  if (typeAlts.length <= 1) return; // nothing to swap

  activeGhostCode = code;

  // Ring around the currently active pill(s) of this type
  document.querySelectorAll(`.class-pill[data-code="${code}"][data-stype="${sessType}"]`)
    .forEach(el => el.classList.add('editing'));

  const body = document.getElementById('ttBody');
  if (!body) return;

  typeAlts.filter(a => a.idx !== currentAltIdx).forEach(({ idx, sessions }) => {
    sessions.forEach(sess => {
      const row = sess.hour - START_H;
      if (row < 0 || row >= TOTAL_H) return;
      const cell = body.querySelector(`[data-row="${row}"][data-day="${sess.day}"]`);
      if (!cell) return;

      const ghost = document.createElement('div');
      ghost.className = 'class-pill ghost-pill';
      ghost.dataset.code = code;
      ghost.style.cssText = `
        top: 3px;
        height: ${sess.duration * SLOT_H - 6}px;
        background: ${col.bg};
        border-left-color: ${col.border};
        color: ${col.text};
      `;
      ghost.innerHTML = `<div class="pill-code">${code}</div><div class="pill-type">${sess.type}</div>`;
      ghost.addEventListener('click', async (e) => {
        e.stopPropagation();
        const selIdx = selected.findIndex(s => s.code === code);
        if (selIdx !== -1) selected[selIdx] = { ...selected[selIdx], altIdx: idx };
        clearGhosts();
        await saveAndRefresh();
      });
      cell.appendChild(ghost);
    });
  });
}

function clearGhosts() {
  document.querySelectorAll('.ghost-pill').forEach(el => el.remove());
  document.querySelectorAll('.class-pill.editing').forEach(el => el.classList.remove('editing'));
  activeGhostCode = null;
}

/* ── Bind controls ───────────────────────────── */
function bindControls() {
  document.getElementById('newTtBtn')?.addEventListener('click', openNewTtModal);
  bindNewTtModal();

  document.getElementById('publicToggle')?.addEventListener('change', async e => {
    isPublic = e.target.checked;
    if (!activeTtId) return;
    await API.updateTimetable(activeTtId, { isPublic });
    const cached = allTimetables.find(t => t.id === activeTtId);
    if (cached) cached.isPublic = isPublic;
    renderTimetableList();
    toast(isPublic ? 'Timetable is now visible to friends 🌐' : 'Timetable is now private 🔒');
  });

  document.getElementById('autoBtn')?.addEventListener('click', async () => {
    if (!activeTtId || !selected.length) { toast('No units to schedule'); return; }
    const prefs = {
      avoid8am:    document.getElementById('prefNo8')?.checked    || false,
      compactDays: document.getElementById('prefCompact')?.checked || false,
      freeFridays: document.getElementById('prefFri')?.checked     || false,
    };
    try {
      const { selected: newSel } = await API.autoSchedule(activeTtId, { selected, preferences: prefs });
      selected = newSel;
      await saveAndRefresh();
      toast('Timetable auto-scheduled', 'success');
    } catch { toast('Auto-schedule failed', 'error'); }
  });

}

/* ── New timetable modal ─────────────────────── */
function bindNewTtModal() {
  document.getElementById('cancelNewTtBtn')?.addEventListener('click', closeNewTtModal);
  document.getElementById('confirmNewTtBtn')?.addEventListener('click', doCreateTimetable);
  document.getElementById('newTtModal')?.addEventListener('click', e => {
    if (e.target === document.getElementById('newTtModal')) closeNewTtModal();
  });
  document.getElementById('newTtName')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') doCreateTimetable();
    if (e.key === 'Escape') closeNewTtModal();
  });
}

function openNewTtModal() {
  const input = document.getElementById('newTtName');
  if (input) input.value = '';
  document.getElementById('newTtModal')?.classList.add('open');
  setTimeout(() => input?.focus(), 50);
}

function closeNewTtModal() {
  document.getElementById('newTtModal')?.classList.remove('open');
}

async function doCreateTimetable() {
  const name = document.getElementById('newTtName')?.value.trim();
  if (!name) { toast('Enter a timetable name', 'error'); return; }
  try {
    const tt      = await API.createTimetable({ name });
    allTimetables = [tt, ...allTimetables];
    closeNewTtModal();
    await switchTimetable(tt.id);
    toast(`"${tt.name}" created`, 'success');
  } catch { toast('Could not create timetable', 'error'); }
}

/* ── HTML escape ─────────────────────────────── */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ═══════════════════════════════════════════
   schedule.js — My Schedule page
   (merged from selected.js + schedule.js)
═══════════════════════════════════════════ */

import State from './utils/state.js';
import API from './utils/api.js';
import toast from './utils/toast.js';
import { DAYS, getColor, getActiveSessions, detectConflicts, getTotalCp, getDaysUsed } from './utils/schedule-utils.js';
import { updateNavBadge } from './utils/nav.js';
import './utils/components.js';

const SLOT_H  = 52;
const START_H = 8;
const TOTAL_H = 12;

let allCourses       = [];
let selected         = [];
let isPublic         = false;
let timetableName    = '';
let activeDrawerCode = null;

document.addEventListener('DOMContentLoaded', async () => {
  try {
    [allCourses, { selected, isPublic, name: timetableName }] = await Promise.all([
      API.getCourses(),
      API.getTimetable(),
    ]);
    selected      = selected      || [];
    timetableName = timetableName || '';
  } catch {
    toast('Could not load data', 'error');
  }

  updateNavBadge(selected.length);
  renderAll();
  bindControls();
  bindPublicToggle();
});

/* ── Render everything ───────────────────── */
function renderAll() {
  const conflicts = detectConflicts(selected, allCourses);
  renderSummaryBar(conflicts);
  renderConflictAlert(conflicts);
  renderLegend();
  renderVariantButtons();
  renderTimetable(conflicts);
  renderUnitCards(conflicts);
}

/* ── Summary stats bar ───────────────────── */
function renderSummaryBar(conflicts) {
  const el = document.getElementById('summaryBar');
  if (!el) return;
  if (!selected.length) { el.style.display = 'none'; return; }
  el.style.display = '';

  const cp   = getTotalCp(selected, allCourses);
  const days = getDaysUsed(selected, allCourses);

  el.innerHTML = `
    <div class="text-center px-4 py-5">
      <div class="text-[28px] font-display font-extrabold tracking-tight text-[var(--text)]">${selected.length}</div>
      <div class="text-[11px] text-[var(--text3)] uppercase tracking-widest font-mono mt-1">Units</div>
    </div>
    <div class="text-center px-4 py-5">
      <div class="text-[28px] font-display font-extrabold tracking-tight text-[var(--text)]">${cp}</div>
      <div class="text-[11px] text-[var(--text3)] uppercase tracking-widest font-mono mt-1">Credit points</div>
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

/* ── Conflict alert ──────────────────────── */
function renderConflictAlert(conflicts) {
  const el = document.getElementById('conflictAlert');
  if (el) el.style.display = conflicts.size ? 'flex' : 'none';
}

/* ── Unit legend ─────────────────────────── */
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

/* ── Variant slot buttons ────────────────── */
function renderVariantButtons() {
  const el = document.getElementById('variantList');
  if (!el) return;

  const withAlts = selected.filter(({ code }) => {
    const c = allCourses.find(x => x.code === code);
    return c?.alternatives?.length;
  });

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
    btn.addEventListener('click', () => showAltDrawer(btn.dataset.code));
  });
}

/* ── Timetable grid ──────────────────────── */
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

  if (!selected.length) return;

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
      pill.addEventListener('click', () => showAltDrawer(code));
      cell.appendChild(pill);
    });
  });
}

/* ── Unit cards ──────────────────────────── */
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
    grid.style.display          = 'none';
    if (empty) empty.style.display = 'flex';
    return;
  }
  grid.style.display          = '';
  if (empty) empty.style.display = 'none';

  grid.innerHTML = selected.map(({ code, altIdx }, i) => {
    const course     = allCourses.find(c => c.code === code);
    const col        = getColor(i);
    const isConflict = conflicts.has(code);
    return course
      ? buildUnitCard(course, altIdx, col, isConflict)
      : buildUnknownCard(code, col);
  }).join('');

  grid.querySelectorAll('.remove-unit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      selected = selected.filter(x => x.code !== btn.dataset.code);
      await API.saveTimetable({ selected });
      updateNavBadge(selected.length);
      toast(`${btn.dataset.code} removed`);
      renderAll();
    });
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
    `<span class="${tagCls}">${course.cp} cp</span>`,
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

/* ── Alt drawer ──────────────────────────── */
function showAltDrawer(code) {
  const course = allCourses.find(c => c.code === code);
  if (!course) return;
  activeDrawerCode = code;

  const entry = selected.find(s => s.code === code);
  const alts  = course.alternatives || [];
  const opts  = [
    { label: 'Default (original)', idx: 0 },
    ...alts.map((a, i) => ({
      label: `Option ${i + 1}: ${a.map(s => DAYS[s.day].slice(0, 3) + ' ' + s.hour + ':00 ' + s.type).join(', ')}`,
      idx: i + 1,
    })),
  ];

  const drawer = document.getElementById('altDrawer');
  drawer.style.display = '';
  drawer.innerHTML = `
    <div class="alt-drawer">
      <div class="alt-drawer-header">
        <div class="alt-drawer-title">${code} — choose a time slot</div>
        <button class="btn btn-sm btn-ghost" id="closeDrawerBtn">Close</button>
      </div>
      <div class="alt-chips">
        ${opts.map(o =>
          `<div class="alt-chip ${entry?.altIdx === o.idx ? 'chosen' : ''}" data-idx="${o.idx}">${o.label}</div>`
        ).join('')}
      </div>
    </div>`;

  drawer.querySelectorAll('.alt-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const idx = parseInt(chip.dataset.idx);
      selected  = selected.map(s => s.code === code ? { ...s, altIdx: idx } : s);
      await API.saveTimetable({ selected });
      renderAll();
      drawer.querySelectorAll('.alt-chip').forEach(c => c.classList.remove('chosen'));
      chip.classList.add('chosen');
    });
  });

  document.getElementById('closeDrawerBtn')?.addEventListener('click', () => {
    drawer.style.display = 'none';
    activeDrawerCode     = null;
  });
}

/* ── Controls ────────────────────────────── */
function bindControls() {
  ['prefNo8', 'prefCompact', 'prefFri'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', renderAll);
  });

  document.getElementById('startRange')?.addEventListener('input', function () {
    document.getElementById('startVal').textContent = this.value + ':00';
  });

  document.getElementById('autoBtn')?.addEventListener('click', autoSchedule);

  // Swap buttons inside unit cards (delegated — re-binds on each render via renderAll)
  document.getElementById('unitsGrid')?.addEventListener('click', e => {
    const btn = e.target.closest('.swap-btn');
    if (btn) showAltDrawer(btn.dataset.code);
  });
}

/* ── Public toggle ───────────────────────── */
function bindPublicToggle() {
  const toggle  = document.getElementById('publicToggle');
  const nameIn  = document.getElementById('timetableNameInput');
  const saveBtn = document.getElementById('saveNameBtn');
  if (!toggle) return;

  toggle.checked = isPublic;
  if (nameIn) nameIn.value = timetableName;
  syncPublicUI(isPublic);

  toggle.addEventListener('change', async () => {
    if (!State.getUser() && toggle.checked) {
      toggle.checked = false;
      toast('Log in to share your timetable with friends', 'error');
      return;
    }
    isPublic = toggle.checked;
    await API.saveTimetable({ isPublic });
    syncPublicUI(isPublic);
    toast(isPublic ? 'Timetable shared with friends' : 'Timetable set to private', isPublic ? 'success' : '');
  });

  saveBtn?.addEventListener('click', async () => {
    const name = nameIn?.value.trim();
    if (!name) return;
    timetableName = name;
    await API.saveTimetable({ name, isPublic });
    toast('Timetable name saved', 'success');
  });
}

function syncPublicUI(isPublic) {
  document.getElementById('publicStatus')?.classList.toggle('hidden', !isPublic);
  document.getElementById('publicNameRow')?.classList.toggle('hidden', !isPublic);
}

/* ── Auto-schedule ───────────────────────── */
async function autoSchedule() {
  if (!selected.length) { toast('Add some units first!'); return; }

  const preferences = {
    avoid8am:    document.getElementById('prefNo8')?.checked    || false,
    compactDays: document.getElementById('prefCompact')?.checked || false,
    freeFridays: document.getElementById('prefFri')?.checked    || false,
  };

  try {
    const result = await API.autoSchedule({ selected, preferences });
    selected     = result.selected;
    await API.saveTimetable({ selected });
    const drawer = document.getElementById('altDrawer');
    if (drawer) drawer.style.display = 'none';
    renderAll();
    toast('Schedule optimised!', 'success');
  } catch {
    toast('Auto-schedule failed', 'error');
  }
}

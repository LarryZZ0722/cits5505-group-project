/* ═══════════════════════════════════════════
   selected.js — My Selection page
═══════════════════════════════════════════ */

import State from './utils/state.js';
import API from './utils/api.js';
import toast from './utils/toast.js';
import { DAYS, getColor, getActiveSessions, detectConflicts, getTotalCp, getDaysUsed } from './utils/schedule-utils.js';
import { updateNavBadge } from './utils/nav.js';
import './utils/components.js';

let allCourses = [];

document.addEventListener('DOMContentLoaded', async () => {
  try {
    allCourses = await API.getCourses();
  } catch {
    toast('Could not load unit data', 'error');
  }
  renderPage();
});

/* ── Full page render ────────────────────── */
function renderPage() {
  const { selected } = State.get();
  const conflicts    = detectConflicts(selected, allCourses);
  renderSummaryBar(selected, conflicts);
  renderConflictAlert(conflicts);
  renderGrid(selected, conflicts);
}

/* ── Summary stats bar ───────────────────── */
function renderSummaryBar(selected, conflicts) {
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

/* ── Conflict alert banner ───────────────── */
function renderConflictAlert(conflicts) {
  const el = document.getElementById('conflictAlert');
  if (el) el.style.display = conflicts.size ? 'flex' : 'none';
}

/* ── Unit cards grid ─────────────────────── */
function renderGrid(selected, conflicts) {
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
    btn.addEventListener('click', () => {
      State.removeCourse(btn.dataset.code);
      updateNavBadge();
      toast(`${btn.dataset.code} removed`);
      renderPage();
    });
  });
}

const SESSION_TYPE_CLS = {
  lec: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  lab: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  tut: 'bg-green-500/10 border-green-500/30 text-green-400',
};

/* ── Unit card HTML builder ──────────────── */
function buildUnitCard(course, altIdx, col, isConflict) {
  const sessions    = getActiveSessions(course, altIdx);
  const sessionHTML = sessions.map(s => {
    const typeCls = SESSION_TYPE_CLS[s.type.toLowerCase()] || 'border-[var(--border2)] text-[var(--text2)] bg-[var(--bg3)]';
    const hasAlts = course.alternatives?.length && s.type !== 'LEC';
    return `<div class="flex items-center gap-2 text-[12px]">
      <span class="font-mono text-[10px] font-medium px-[7px] py-[2px] rounded-md border ${typeCls}">${s.type}</span>
      <span class="text-[var(--text2)]">${DAYS[s.day]} ${s.hour}:00 – ${s.hour + s.duration}:00</span>
      ${hasAlts ? `<a href="schedule.html" class="ml-auto text-[var(--accent)] text-[11px] font-mono hover:underline">swap →</a>` : ''}
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
      <div class="flex-shrink-0">
        <button class="btn btn-sm btn-danger remove-unit-btn" data-code="${course.code}">Remove</button>
      </div>
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
      <div class="flex-shrink-0">
        <button class="btn btn-sm btn-danger remove-unit-btn" data-code="${code}">Remove</button>
      </div>
    </div>
  </div>`;
}

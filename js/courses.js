/* ═══════════════════════════════════════════
   courses.js — Course Input / Browse page
═══════════════════════════════════════════ */

import State from './utils/state.js';
import API from './utils/api.js';
import toast from './utils/toast.js';
import { DAYS, getColor, getTotalCp } from './utils/schedule-utils.js';
import { updateNavBadge } from './utils/nav.js';
import './utils/components.js';

let allCourses  = [];
let activeSems  = ['S1', 'S2'];
let tablePage   = 0;
let manualSem   = 'S1';
const PAGE_SIZE = 8;

document.addEventListener('DOMContentLoaded', async () => {
  await loadCourses();
  bindFilters();
  bindSearch();
  bindManualAdd();
  renderTable();
  renderBasket();
});

/* ── Data ────────────────────────────────── */
async function loadCourses() {
  try {
    allCourses = await API.getCourses();
  } catch (err) {
    console.error(err);
    toast('Could not load unit data', 'error');
  }
}

/* ── Filters ─────────────────────────────── */
function bindFilters() {
  document.querySelectorAll('.filter-chip[data-sem]').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('on');
      activeSems = [...document.querySelectorAll('.filter-chip[data-sem].on')]
        .map(c => c.dataset.sem);
      tablePage = 0;
      renderTable();
    });
  });
}

function bindSearch() {
  document.getElementById('unitSearch')?.addEventListener('input', () => {
    tablePage = 0;
    renderTable();
  });
}

function getFilteredCourses() {
  const q = (document.getElementById('unitSearch')?.value || '').toLowerCase();
  return allCourses.filter(c => {
    const semOk = activeSems.length === 0 || c.sems.some(s => activeSems.includes(s));
    const qOk   = !q || c.code.toLowerCase().includes(q)
                     || c.name.toLowerCase().includes(q)
                     || c.faculty.toLowerCase().includes(q);
    return semOk && qOk;
  });
}

/* ── Table ───────────────────────────────── */
function renderTable() {
  const courses = getFilteredCourses();
  const start   = tablePage * PAGE_SIZE;
  const slice   = courses.slice(start, start + PAGE_SIZE);
  const tbody   = document.getElementById('courseTableBody');
  if (!tbody) return;

  tbody.innerHTML = slice.length
    ? slice.map(buildTableRow).join('')
    : `<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--text3);font-style:italic">No units found</td></tr>`;

  tbody.querySelectorAll('.add-row-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleCourse(btn.dataset.code));
  });

  document.getElementById('tableCount').textContent =
    `${courses.length} unit${courses.length !== 1 ? 's' : ''}`;
  renderPagination(courses.length);
}

const TYPE_TAG_CLS = {
  lec: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  lab: 'bg-purple-500/10 border-purple-500/30 text-purple-400',
  tut: 'bg-green-500/10 border-green-500/30 text-green-400',
};
const TAG_BASE = 'inline-flex items-center px-[7px] py-[2px] rounded-md text-[10px] font-mono border';

function buildTableRow(c) {
  const isAdded = State.hasCourse(c.code);
  const tags    = c.sessions.map(s => {
    const cls = TYPE_TAG_CLS[s.type.toLowerCase()] || 'border-[var(--border2)] text-[var(--text2)] bg-[var(--bg3)]';
    return `<span class="${TAG_BASE} ${cls}">${s.type} ${DAYS[s.day].slice(0, 3)}</span>`;
  }).join('');
  const sems = c.sems.map(s =>
    `<span class="${TAG_BASE} bg-[var(--accent-glow)] border-[var(--accent-line)] text-[var(--accent)]">${s}</span>`
  ).join('');

  return `<tr class="${isAdded ? 'row-selected' : ''}">
    <td class="font-mono text-[12px] font-medium text-[var(--text)]">${c.code}</td>
    <td>
      <div class="font-medium text-[13px] text-[var(--text)]">${c.name}</div>
      <div class="text-[11px] text-[var(--text3)] mt-0.5">${c.faculty}</div>
    </td>
    <td><span class="font-mono text-[10px] px-[7px] py-0.5 rounded-md border border-[var(--border2)] bg-[var(--bg3)] text-[var(--text2)] whitespace-nowrap">${c.cp} cp</span></td>
    <td><div class="flex flex-wrap gap-1">${sems}</div></td>
    <td><div class="flex flex-wrap gap-1">${tags}</div></td>
    <td>
      <button class="add-row-btn ${isAdded ? 'added' : ''}" data-code="${c.code}"
        title="${isAdded ? 'Remove from selection' : 'Add to selection'}">
        ${isAdded ? '✓' : '+'}
      </button>
    </td>
  </tr>`;
}

/* ── Pagination ──────────────────────────── */
function renderPagination(total) {
  const pages = Math.ceil(total / PAGE_SIZE);
  const el    = document.getElementById('pagination');
  if (!el) return;
  el.innerHTML = Array.from({ length: pages }, (_, i) =>
    `<button class="page-btn ${i === tablePage ? 'current' : ''}" data-page="${i}">${i + 1}</button>`
  ).join('');
  el.querySelectorAll('.page-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      tablePage = parseInt(btn.dataset.page);
      renderTable();
    });
  });
}

/* ── Toggle course in/out of selection ───── */
function toggleCourse(code) {
  if (State.hasCourse(code)) {
    State.removeCourse(code);
    toast(`${code} removed`);
  } else {
    State.addCourse(code);
    toast(`${code} added`, 'success');
  }
  updateNavBadge();
  renderTable();
  renderBasket();
}

/* ── Basket (right sidebar) ──────────────── */
function renderBasket() {
  const { selected } = State.get();
  const body         = document.getElementById('basketBody');
  const footer       = document.getElementById('basketFooter');
  if (!body) return;

  if (!selected.length) {
    body.innerHTML        = '<div class="p-8 text-center text-[var(--text3)] text-[13px] italic">Add units from the table</div>';
    if (footer) footer.style.display = 'none';
    return;
  }

  if (footer) footer.style.display = '';

  const cp  = getTotalCp(selected, allCourses);
  const pct = Math.min(100, Math.round((cp / 24) * 100));

  document.getElementById('cpLabel').textContent    = `${cp} / 24 cp`;
  document.getElementById('cpPercent').textContent  = `${pct}%`;

  const fill = document.getElementById('cpFill');
  fill.style.width      = pct + '%';
  fill.style.background = cp > 24 ? 'var(--red)' : cp >= 18 ? 'var(--green)' : 'var(--accent)';

  body.innerHTML = `<div class="flex flex-col gap-2">${
    selected.map(({ code }, i) => {
      const c   = allCourses.find(x => x.code === code);
      const col = getColor(i);
      return `<div class="flex items-center gap-2.5">
        <div class="w-2 h-2 rounded-full flex-shrink-0" style="background:${col.border}"></div>
        <div class="flex-1 min-w-0">
          <div class="font-mono text-[11px] font-medium text-[var(--text)]">${code}</div>
          <div class="text-[11px] text-[var(--text3)] truncate">${c ? c.name : 'Custom unit'}</div>
        </div>
        <div class="text-[10px] font-mono text-[var(--text3)] whitespace-nowrap">${c ? c.cp + ' cp' : ''}</div>
        <button class="w-5 h-5 rounded flex items-center justify-center border-0 bg-transparent text-[var(--text3)] text-[14px] cursor-pointer hover:text-[var(--red)] hover:bg-[var(--red-bg)] flex-shrink-0 rm-btn" data-code="${code}" aria-label="Remove ${code}">×</button>
      </div>`;
    }).join('')
  }</div>`;

  body.querySelectorAll('.rm-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleCourse(btn.dataset.code));
  });
}

/* ── Manual unit add ─────────────────────── */
function bindManualAdd() {
  document.getElementById('addManualBtn')?.addEventListener('click', addManual);
  document.getElementById('manualCode')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') addManual();
  });

  document.querySelectorAll('.sem-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.sem-btn').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      manualSem = btn.dataset.sem;
    });
  });
}

function addManual() {
  const input = document.getElementById('manualCode');
  const code  = input.value.trim().toUpperCase();
  if (!code) return;
  if (State.hasCourse(code)) {
    toast(`${code} is already in your selection`);
    return;
  }
  State.addCourse(code);
  updateNavBadge();
  renderBasket();
  renderTable();
  toast(`${code} added manually`, 'success');
  input.value = '';
}

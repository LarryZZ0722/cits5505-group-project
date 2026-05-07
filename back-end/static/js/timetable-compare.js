import API from './utils/api.js';
import State from './utils/state.js';

const modal      = document.getElementById('compareModal');
const content    = document.getElementById('compareContent');
const select     = document.getElementById('compareSelect');
const openBtn    = document.getElementById('compareBtn');
const closeBtn   = document.getElementById('closeCompareBtn');
const runBtn     = document.getElementById('runCompareBtn');

async function open() {
  modal.style.display = 'flex';
  content.innerHTML = '';
  await populateSelect();
}

function close() { modal.style.display = 'none'; }

openBtn?.addEventListener('click', open);
closeBtn?.addEventListener('click', close);
modal?.addEventListener('click', e => { if (e.target === modal) close(); });
runBtn?.addEventListener('click', runCompare);

async function populateSelect() {
  try {
    const tts      = await API.getTimetables();
    const activeId = State.getActiveTimetableId();
    select.innerHTML = '<option value="">Select a timetable…</option>';
    tts.forEach(tt => {
      if (tt.id === activeId) return;
      const opt = document.createElement('option');
      opt.value = tt.id;
      opt.textContent = tt.name;
      select.appendChild(opt);
    });
  } catch {
    select.innerHTML = '<option value="">Failed to load timetables</option>';
  }
}

async function runCompare() {
  const activeId = State.getActiveTimetableId();
  const otherId  = select.value;
  if (!activeId || !otherId) return;

  content.innerHTML = '<p class="text-[13px] text-[var(--text3)] italic">Comparing…</p>';

  try {
    const r = await API.compareTimetables(activeId, otherId);

    const section = (title, items, emptyMsg) => {
      if (!items.length) return `
        <div class="mb-4">
          <div class="font-mono text-[10px] tracking-[.08em] uppercase text-[var(--text3)] mb-2">${title}</div>
          <p class="text-[12px] text-[var(--text3)] italic">${emptyMsg}</p>
        </div>`;
      return `
        <div class="mb-4">
          <div class="font-mono text-[10px] tracking-[.08em] uppercase text-[var(--text3)] mb-2">${title}</div>
          <div class="flex flex-col gap-1">
            ${items.map(u => `
              <div class="flex items-center gap-2 bg-[var(--bg3)] rounded px-3 py-2">
                <span class="font-mono text-[12px] text-[var(--accent)]">${u.code}</span>
                <span class="text-[12px] text-[var(--text2)] flex-1 truncate">${u.name}</span>
              </div>`).join('')}
          </div>
        </div>`;
    };

    const conflictSection = r.cross_conflicts.length ? `
      <div class="mb-4">
        <div class="font-mono text-[10px] tracking-[.08em] uppercase text-[var(--text3)] mb-2">Time conflicts between timetables</div>
        <div class="flex flex-col gap-1.5">
          ${r.cross_conflicts.map(c => `
            <div class="bg-[var(--red-bg)] border border-[rgba(247,111,111,0.25)] rounded px-3 py-2 text-[12px] text-[var(--red)]">
              ${c.detail}
            </div>`).join('')}
        </div>
      </div>` : '';

    content.innerHTML = `
      <div class="flex gap-3 mb-5 text-center">
        <div class="flex-1 bg-[var(--bg3)] rounded-lg p-3">
          <div class="font-mono text-[11px] text-[var(--text3)] mb-1">Timetable A</div>
          <div class="text-[13px] font-semibold text-[var(--text)]">${r.timetable_a.name}</div>
        </div>
        <div class="flex items-center text-[var(--text3)] text-[18px]">⚖</div>
        <div class="flex-1 bg-[var(--bg3)] rounded-lg p-3">
          <div class="font-mono text-[11px] text-[var(--text3)] mb-1">Timetable B</div>
          <div class="text-[13px] font-semibold text-[var(--text)]">${r.timetable_b.name}</div>
        </div>
      </div>
      ${section(`Only in ${r.timetable_a.name}`, r.only_in_a, 'None')}
      ${section(`Only in ${r.timetable_b.name}`, r.only_in_b, 'None')}
      ${section('In both', r.in_both, 'No shared units')}
      ${conflictSection}
    `;
  } catch {
    content.innerHTML = '<p class="text-[13px] text-[var(--red)]">Failed to compare timetables.</p>';
  }
}

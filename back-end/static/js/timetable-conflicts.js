import API from './utils/api.js';
import State from './utils/state.js';

const modal    = document.getElementById('conflictsModal');
const content  = document.getElementById('conflictsContent');
const closeBtn = document.getElementById('closeConflictsBtn');

function open()  { modal.style.display = 'flex'; loadConflicts(); }
function close() { modal.style.display = 'none'; }

closeBtn?.addEventListener('click', close);
modal?.addEventListener('click', e => { if (e.target === modal) close(); });

// Trigger 1: click the red conflict alert banner
document.getElementById('conflictAlert')?.addEventListener('click', open);

// Trigger 2: click the "Clashes" cell in the summary bar
// The cell is dynamically generated, so use event delegation on summaryBar
document.getElementById('summaryBar')?.addEventListener('click', e => {
  const cell = e.target.closest('[class*="text-center"]');
  if (cell && cell.textContent.toLowerCase().includes('clash')) open();
});

async function loadConflicts() {
  const id = State.getActiveTimetableId();
  if (!id) {
    content.innerHTML = '<p class="text-[13px] text-[var(--text3)]">No active timetable.</p>';
    return;
  }

  content.innerHTML = '<p class="text-[13px] text-[var(--text3)] italic">Checking…</p>';

  try {
    const tt = await API.getTimetableById(id);
    const r  = await API.detectConflicts(id, tt.selected || []);

    if (!r.conflicts || r.conflicts.length === 0) {
      content.innerHTML = `
        <div class="bg-[var(--bg3)] rounded-lg p-5 text-center">
          <div class="text-[28px] mb-2">✓</div>
          <div class="text-[13px] text-[var(--text)] font-semibold">No conflicts</div>
          <div class="text-[12px] text-[var(--text3)] mt-1">All sessions fit together nicely.</div>
        </div>`;
      return;
    }

    content.innerHTML = `
      <div class="text-[13px] text-[var(--red)] mb-4">
        <strong class="font-semibold">${r.conflict_count} conflict${r.conflict_count === 1 ? '' : 's'} found.</strong>
        Use slot alternatives in the schedule to resolve them.
      </div>
      <div class="flex flex-col gap-2">
        ${r.conflicts.map(c => `
          <div class="bg-[var(--red-bg)] border border-[rgba(247,111,111,0.25)] rounded-lg px-4 py-3">
            <div class="font-mono text-[10px] tracking-[.08em] uppercase text-[var(--red)] mb-2">${c.day}</div>
            <div class="flex items-center gap-3">
              <div class="flex-1 min-w-0">
                <div class="font-mono text-[12px] font-semibold text-[var(--text)]">${c.unit_a.code} ${c.unit_a.type}</div>
                <div class="text-[11px] text-[var(--text2)] truncate">${c.unit_a.name}</div>
                <div class="text-[11px] text-[var(--text3)] font-mono">${c.unit_a.start} – ${c.unit_a.end}</div>
              </div>
              <div class="text-[var(--red)] text-[16px] flex-shrink-0">⚡</div>
              <div class="flex-1 min-w-0">
                <div class="font-mono text-[12px] font-semibold text-[var(--text)]">${c.unit_b.code} ${c.unit_b.type}</div>
                <div class="text-[11px] text-[var(--text2)] truncate">${c.unit_b.name}</div>
                <div class="text-[11px] text-[var(--text3)] font-mono">${c.unit_b.start} – ${c.unit_b.end}</div>
              </div>
            </div>
          </div>`).join('')}
      </div>
    `;
  } catch {
    content.innerHTML = '<p class="text-[13px] text-[var(--red)]">Failed to load conflicts.</p>';
  }
}

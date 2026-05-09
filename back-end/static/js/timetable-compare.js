import API from './utils/api.js';
import State from './utils/state.js';

const modal    = document.getElementById('compareModal');
const content  = document.getElementById('compareContent');
const select   = document.getElementById('compareSelect');
const openBtn  = document.getElementById('compareBtn');
const closeBtn = document.getElementById('closeCompareBtn');
const runBtn   = document.getElementById('runCompareBtn');

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

    const codesInBoth = new Set(r.in_both.map(u => u.code));

    // Build full unit lists for each timetable (all units including shared)
    const allA = [...r.only_in_a, ...r.in_both];
    const allB = [...r.only_in_b, ...r.in_both];

    const unitCard = (u, side) => {
      const shared   = codesInBoth.has(u.code);
      const bgClass  = shared ? 'bg-[var(--accent-glow)] border-[var(--accent)]' : 'bg-[var(--bg3)] border-[var(--border)]';
      const badge    = shared
        ? `<span class="text-[10px] font-mono text-[var(--accent)] border border-[var(--accent)] rounded px-1.5 py-0.5 flex-shrink-0">shared</span>`
        : '';
      return `
        <div class="flex items-center gap-2 border ${bgClass} rounded px-3 py-2 mb-1.5">
          <div class="flex-1 min-w-0">
            <div class="font-mono text-[12px] font-semibold text-[var(--accent)] truncate">${u.code}</div>
            <div class="text-[11px] text-[var(--text2)] truncate">${u.name}</div>
          </div>
          ${badge}
        </div>`;
    };

    const crossConflictSection = r.cross_conflicts.length ? `
      <div class="mt-5 pt-5 border-t border-[var(--border)]">
        <div class="font-mono text-[10px] tracking-[.08em] uppercase text-[var(--red)] mb-2">
          ⚡ ${r.cross_conflicts.length} cross-timetable conflict${r.cross_conflicts.length === 1 ? '' : 's'}
        </div>
        <div class="flex flex-col gap-1.5">
          ${r.cross_conflicts.map(c => `
            <div class="bg-[var(--red-bg)] border border-[rgba(247,111,111,0.25)] rounded px-3 py-2 text-[11px] text-[var(--red)]">
              ${c.day}: <strong>${c.from_a.code}</strong> ${c.from_a.type} (${c.from_a.start}–${c.from_a.end})
              vs <strong>${c.from_b.code}</strong> ${c.from_b.type} (${c.from_b.start}–${c.from_b.end})
            </div>`).join('')}
        </div>
      </div>` : '';

    content.innerHTML = `
      <!-- Column headers -->
      <div class="grid grid-cols-2 gap-4 mb-3">
        <div class="bg-[var(--bg3)] rounded-lg p-3 text-center">
          <div class="font-mono text-[10px] text-[var(--text3)] mb-0.5">Timetable A</div>
          <div class="text-[13px] font-semibold text-[var(--text)]">${r.timetable_a.name}</div>
          <div class="font-mono text-[11px] text-[var(--text3)] mt-1">${allA.length} unit${allA.length === 1 ? '' : 's'}</div>
        </div>
        <div class="bg-[var(--bg3)] rounded-lg p-3 text-center">
          <div class="font-mono text-[10px] text-[var(--text3)] mb-0.5">Timetable B</div>
          <div class="text-[13px] font-semibold text-[var(--text)]">${r.timetable_b.name}</div>
          <div class="font-mono text-[11px] text-[var(--text3)] mt-1">${allB.length} unit${allB.length === 1 ? '' : 's'}</div>
        </div>
      </div>

      <!-- Side-by-side unit lists -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          ${allA.length
            ? allA.map(u => unitCard(u, 'a')).join('')
            : '<p class="text-[12px] text-[var(--text3)] italic">No units</p>'}
        </div>
        <div>
          ${allB.length
            ? allB.map(u => unitCard(u, 'b')).join('')
            : '<p class="text-[12px] text-[var(--text3)] italic">No units</p>'}
        </div>
      </div>

      <!-- Legend -->
      <div class="mt-3 flex items-center gap-3">
        <div class="flex items-center gap-1.5">
          <div class="w-3 h-3 rounded bg-[var(--accent-glow)] border border-[var(--accent)]"></div>
          <span class="text-[11px] text-[var(--text3)]">Shared by both</span>
        </div>
        <div class="flex items-center gap-1.5">
          <div class="w-3 h-3 rounded bg-[var(--bg3)] border border-[var(--border)]"></div>
          <span class="text-[11px] text-[var(--text3)]">Unique to this timetable</span>
        </div>
      </div>

      ${crossConflictSection}
    `;
  } catch {
    content.innerHTML = '<p class="text-[13px] text-[var(--red)]">Failed to compare timetables.</p>';
  }
}

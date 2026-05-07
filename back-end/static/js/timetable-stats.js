import API from './utils/api.js';
import State from './utils/state.js';

const modal   = document.getElementById('statsModal');
const content = document.getElementById('statsContent');
const openBtn = document.getElementById('statsBtn');
const closeBtn = document.getElementById('closeStatsBtn');

function open() { modal.style.display = 'flex'; loadStats(); }
function close() { modal.style.display = 'none'; }

openBtn?.addEventListener('click', open);
closeBtn?.addEventListener('click', close);
modal?.addEventListener('click', e => { if (e.target === modal) close(); });

async function loadStats() {
  const id = State.getActiveTimetableId();
  if (!id) {
    content.innerHTML = '<p class="text-[13px] text-[var(--text3)]">No active timetable.</p>';
    return;
  }

  content.innerHTML = '<p class="text-[13px] text-[var(--text3)] italic">Loading…</p>';

  try {
    const s = await API.getTimetableStats(id);

    if (s.message) {
      content.innerHTML = `<p class="text-[13px] text-[var(--text3)]">${s.message}</p>`;
      return;
    }

    const dayRows = Object.entries(s.daily_hours)
      .map(([day, hrs]) => `
        <div class="flex items-center justify-between py-[6px] border-b border-[var(--border)] last:border-0">
          <span class="text-[13px] text-[var(--text2)]">${day}</span>
          <span class="font-mono text-[12px] text-[var(--text)]">${hrs}h</span>
        </div>`)
      .join('');

    content.innerHTML = `
      <!-- Top stats -->
      <div class="grid grid-cols-3 gap-3 mb-5">
        <div class="bg-[var(--bg3)] rounded-lg p-3 text-center">
          <div class="font-mono text-[22px] font-bold text-[var(--accent)]">${s.total_units}</div>
          <div class="text-[11px] text-[var(--text3)] mt-0.5">Units</div>
        </div>
        <div class="bg-[var(--bg3)] rounded-lg p-3 text-center">
          <div class="font-mono text-[22px] font-bold text-[var(--accent)]">${s.total_cp}</div>
          <div class="text-[11px] text-[var(--text3)] mt-0.5">Credit points</div>
        </div>
        <div class="bg-[var(--bg3)] rounded-lg p-3 text-center">
          <div class="font-mono text-[22px] font-bold text-[var(--accent)]">${s.days_with_class.length}</div>
          <div class="text-[11px] text-[var(--text3)] mt-0.5">Days/week</div>
        </div>
      </div>

      <!-- Time range -->
      <div class="flex gap-3 mb-5">
        <div class="flex-1 bg-[var(--bg3)] rounded-lg p-3">
          <div class="text-[11px] text-[var(--text3)] mb-1">Earliest start</div>
          <div class="font-mono text-[15px] font-bold text-[var(--text)]">${s.earliest_start ?? '—'}</div>
        </div>
        <div class="flex-1 bg-[var(--bg3)] rounded-lg p-3">
          <div class="text-[11px] text-[var(--text3)] mb-1">Latest finish</div>
          <div class="font-mono text-[15px] font-bold text-[var(--text)]">${s.latest_end ?? '—'}</div>
        </div>
        <div class="flex-1 bg-[var(--bg3)] rounded-lg p-3">
          <div class="text-[11px] text-[var(--text3)] mb-1">Busiest day</div>
          <div class="font-mono text-[15px] font-bold text-[var(--text)]">${s.busiest_day?.day?.slice(0,3) ?? '—'} <span class="text-[12px] text-[var(--text2)]">${s.busiest_day?.hours ?? ''}h</span></div>
        </div>
      </div>

      <!-- Daily breakdown -->
      <div class="font-mono text-[10px] tracking-[.08em] uppercase text-[var(--text3)] mb-2">Hours per day</div>
      <div class="bg-[var(--bg3)] rounded-lg px-3 py-1">${dayRows}</div>
    `;
  } catch (e) {
    content.innerHTML = `<p class="text-[13px] text-[var(--red)]">Failed to load stats.</p>`;
  }
}

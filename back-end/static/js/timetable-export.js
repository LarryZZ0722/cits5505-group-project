import API from './utils/api.js';
import State from './utils/state.js';

const modal       = document.getElementById('exportModal');
const content     = document.getElementById('exportContent');
const openBtn     = document.getElementById('exportBtn');
const closeBtn    = document.getElementById('closeExportBtn');
const copyBtn     = document.getElementById('copyExportBtn');
const downloadBtn = document.getElementById('downloadExportBtn');

let currentText = '';
let currentName = 'timetable';

function open()  { modal.style.display = 'flex'; loadExport(); }
function close() { modal.style.display = 'none'; }

openBtn?.addEventListener('click', open);
closeBtn?.addEventListener('click', close);
modal?.addEventListener('click', e => { if (e.target === modal) close(); });

copyBtn?.addEventListener('click', async () => {
  if (!currentText) return;
  try {
    await navigator.clipboard.writeText(currentText);
    copyBtn.textContent = '✓ Copied';
    setTimeout(() => { copyBtn.textContent = '📋 Copy to clipboard'; }, 1500);
  } catch {
    copyBtn.textContent = 'Copy failed';
  }
});

downloadBtn?.addEventListener('click', () => {
  if (!currentText) return;
  const blob = new Blob([currentText], { type: 'text/plain' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${currentName.replace(/\s+/g, '_')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
});

async function loadExport() {
  const id = State.getActiveTimetableId();
  if (!id) {
    content.textContent = 'No active timetable.';
    return;
  }

  content.textContent = 'Loading…';
  currentText = '';

  try {
    const r = await API.exportTimetable(id);
    currentText = r.text || '';
    currentName = (r.text?.match(/=== (.+?) /)?.[1]) || 'timetable';
    content.textContent = currentText || 'Empty timetable.';
  } catch {
    content.textContent = 'Failed to load export.';
  }
}

/* ═══════════════════════════════════════════
   schedule-utils.js — Scheduling helpers
   
   Pure functions — no DOM, no side effects.
   Used by courses.js, selected.js, schedule.js
═══════════════════════════════════════════ */

/** Day names indexed 0–4 (Mon–Fri) */
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/** Per-unit colour palette (cycles) */
const PALETTE = [
  { bg: 'rgba(79,142,247,.18)',  border: '#4f8ef7', text: '#a8c4ff' },
  { bg: 'rgba(45,212,160,.15)',  border: '#2dd4a0', text: '#6eeacc' },
  { bg: 'rgba(245,166,35,.15)',  border: '#f5a623', text: '#fcd34d' },
  { bg: 'rgba(247,111,111,.15)', border: '#f76f6f', text: '#fca5a5' },
  { bg: 'rgba(167,139,250,.18)', border: '#a78bfa', text: '#c4b5fd' },
  { bg: 'rgba(251,146,60,.15)',  border: '#fb923c', text: '#fdba74' },
];

/**
 * Returns the colour swatch for a unit at the given index.
 * @param {number} index
 * @returns {{ bg, border, text }}
 */
function getColor(index) {
  return PALETTE[index % PALETTE.length];
}

/**
 * Resolves the active sessions for a unit, respecting the
 * chosen alternative slot index.
 *
 * @param {Object} course  - course object from courses.json
 * @param {number} altIdx  - 0 = default sessions, 1+ = alternatives[altIdx-1]
 * @returns {Array}        - array of session objects
 */
function getActiveSessions(course, altIdx) {
  if (altIdx === 0 || !course.alternatives || !course.alternatives[altIdx - 1]) {
    return course.sessions;
  }
  const alt      = course.alternatives[altIdx - 1];
  const altTypes = alt.map(s => s.type);
  // Keep non-conflicting base sessions + replace with alt
  return [
    ...course.sessions.filter(s => !altTypes.includes(s.type)),
    ...alt,
  ];
}

/**
 * Detects which unit codes have time conflicts.
 *
 * @param {Array} selected  - [{ code, altIdx }]
 * @param {Array} courses   - full course list
 * @returns {Set<string>}   - set of conflicting unit codes
 */
function detectConflicts(selected, courses) {
  // Flatten all scheduled blocks
  const blocks = [];
  selected.forEach(({ code, altIdx }) => {
    const course = courses.find(c => c.code === code);
    if (!course) return;
    getActiveSessions(course, altIdx).forEach(s => {
      blocks.push({
        code,
        day:   s.day,
        start: s.hour,
        end:   s.hour + s.duration,
      });
    });
  });

  // O(n²) overlap check — fine for ≤ 30 units
  const conflicts = new Set();
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i];
      const b = blocks[j];
      if (a.day === b.day && a.start < b.end && b.start < a.end) {
        conflicts.add(a.code);
        conflicts.add(b.code);
      }
    }
  }
  return conflicts;
}

/**
 * Total credit points across all selected units.
 *
 * @param {Array} selected - [{ code, altIdx }]
 * @param {Array} courses  - full course list
 * @returns {number}
 */
function getTotalCp(selected, courses) {
  return selected.reduce((sum, { code }) => {
    const c = courses.find(x => x.code === code);
    return sum + (c ? c.cp : 0);
  }, 0);
}

/**
 * Number of unique campus days across all sessions.
 *
 * @param {Array} selected - [{ code, altIdx }]
 * @param {Array} courses  - full course list
 * @returns {number}
 */
function getDaysUsed(selected, courses) {
  const days = new Set();
  selected.forEach(({ code, altIdx }) => {
    const c = courses.find(x => x.code === code);
    if (!c) return;
    getActiveSessions(c, altIdx).forEach(s => days.add(s.day));
  });
  return days.size;
}

export { DAYS, PALETTE, getColor, getActiveSessions, detectConflicts, getTotalCp, getDaysUsed };

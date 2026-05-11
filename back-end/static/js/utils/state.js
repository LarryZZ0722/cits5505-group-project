/* ═══════════════════════════════════════════
   state.js — User session (localStorage)
═══════════════════════════════════════════ */

const STORE_KEY    = 'uwa_planner_user';
const ACTIVE_TT_KEY = 'uwa_planner_active_tt';

const State = {
  getUser() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch { return null; }
  },
  setUser(user) {
    localStorage.setItem(STORE_KEY, JSON.stringify(user));
  },
  clearUser() {
    localStorage.removeItem(STORE_KEY);
  },
  getActiveTimetableId() {
    try { return JSON.parse(localStorage.getItem(ACTIVE_TT_KEY)); } catch { return null; }
  },
  setActiveTimetableId(id) {
    if (id == null) localStorage.removeItem(ACTIVE_TT_KEY);
    else localStorage.setItem(ACTIVE_TT_KEY, JSON.stringify(id));
  },
};

export default State;

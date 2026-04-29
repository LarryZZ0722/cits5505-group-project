/* ═══════════════════════════════════════════
   state.js — User session (localStorage)

   Only stores who is logged in.
   All other data lives in the API layer.
═══════════════════════════════════════════ */

const STORE_KEY = 'uwa_planner_user';

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
};

export default State;

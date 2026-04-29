/* ═══════════════════════════════════════════
   api.js — API entry point

   Two-line switch to go live:
     1. Set USE_MOCK = false
     2. Set BASE_URL to your Flask server origin

   Pages always import from this file only.
═══════════════════════════════════════════ */

const BASE_URL = 'http://localhost:5000';  // ← Flask dev server

/* ── Real fetch helpers ────────────────── */
function getToken() {
  try { return JSON.parse(localStorage.getItem('uwa_planner_user'))?.token ?? null; } catch { return null; }
}

async function request(path, options = {}) {
  const token   = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE_URL + path, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    // Only auto-logout when we sent a token that the server rejected.
    // A plain 401 with no token sent (e.g. wrong password) should not redirect.
    if (res.status === 401 && token) {
      localStorage.removeItem('uwa_planner_user');
      window.location.href = 'auth.html';
      return;
    }
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

async function nullable(fn) {
  try { return await fn(); } catch { return null; }
}

/* ── Real API (Flask backend) ──────────── */
const REAL = {

  /* ════════════════════════════════════════
     AUTH
  ════════════════════════════════════════ */

  async login(email, password) {
    return nullable(async () => {
      const d = await request('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      return { ...d.user, token: d.access_token };
    });
  },

  async register({ name, studentNumber, email, password }) {
    const d = await request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, studentNumber, email, password }),
    });
    return { ...d.user, token: d.access_token };
  },

  async logout() {
    return nullable(() => request('/api/auth/logout', { method: 'POST' }));
  },

  async changePassword({ currentPassword, newPassword }) {
    return request('/api/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  /* ════════════════════════════════════════
     PROFILE
  ════════════════════════════════════════ */

  async getProfile() {
    const data = await request('/api/profile');
    return data.user;
  },

  async updateProfile({ name, studentNumber }) {
    const data = await request('/api/profile', {
      method: 'PUT',
      body: JSON.stringify({ name, studentNumber }),
    });
    return data.user;
  },

  /* ════════════════════════════════════════
     COURSES
  ════════════════════════════════════════ */

  async getCourses() {
    return request('/api/courses');
  },

  async getCourse(code) {
    return request(`/api/courses/${code}`);
  },

  /* ════════════════════════════════════════
     TIMETABLE
  ════════════════════════════════════════ */

  async getTimetable() {
    return request('/api/timetable');
  },

  async saveTimetable({ selected, semester, name, isPublic }) {
    return request('/api/timetable', {
      method: 'POST',
      body: JSON.stringify({ selected, semester, name, isPublic }),
    });
  },

  /* ════════════════════════════════════════
     SCHEDULING
  ════════════════════════════════════════ */

  async detectConflicts(selected) {
    return request('/api/timetable/conflicts', {
      method: 'POST',
      body: JSON.stringify({ selected }),
    });
  },

  async autoSchedule({ selected, preferences }) {
    return request('/api/timetable/auto-schedule', {
      method: 'POST',
      body: JSON.stringify({ selected, preferences }),
    });
  },

  /* ════════════════════════════════════════
     FRIENDS
  ════════════════════════════════════════ */

  async getFriends() {
    return request('/api/friends');
  },

  async removeFriend(studentNumber) {
    return request(`/api/friends/${studentNumber}`, { method: 'DELETE' });
  },

  async sendFriendRequest(studentNumber) {
    return request('/api/friends/requests', {
      method: 'POST',
      body: JSON.stringify({ studentNumber }),
    });
  },

  async getSentRequests() {
    return request('/api/friends/requests/sent');
  },

  async cancelFriendRequest(studentNumber) {
    return request(`/api/friends/requests/sent/${studentNumber}`, { method: 'DELETE' });
  },

  async getPendingRequests() {
    return request('/api/friends/requests/pending');
  },

  async acceptFriendRequest(studentNumber) {
    return request(`/api/friends/requests/${studentNumber}/accept`, { method: 'PUT' });
  },

  async declineFriendRequest(studentNumber) {
    return request(`/api/friends/requests/${studentNumber}`, { method: 'DELETE' });
  },

  async getFriendTimetable(studentNumber) {
    return nullable(() => request(`/api/friends/${studentNumber}/timetable`));
  },

  /* ════════════════════════════════════════
     USERS
  ════════════════════════════════════════ */

  async lookupUser(studentNumber) {
    return nullable(() => request(`/api/users/${studentNumber}`));
  },

};

export default REAL;

/* ═══════════════════════════════════════════
   api.js — API entry point (Flask backend)
═══════════════════════════════════════════ */

import State from './state.js';

const BASE_URL = 'http://localhost:5000';

/* ── Fetch helpers ─────────────────────── */
function getToken() {
  try { return JSON.parse(localStorage.getItem('uwa_planner_user'))?.token ?? null; } catch { return null; }
}

function getCsrfToken() {
  return document.querySelector('meta[name="csrf-token"]')?.content ?? '';
}

async function request(path, options = {}) {
  const token   = getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method?.toUpperCase())) {
    headers['X-CSRF-Token'] = getCsrfToken();
  }
  const res = await fetch(BASE_URL + path, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    if (res.status === 401 && token) {
      localStorage.removeItem('uwa_planner_user');
      window.location.href = '/auth';
      return;
    }
    throw new Error(body.message || `Request failed (${res.status})`);
  }
  return res.json();
}

async function nullable(fn) {
  try { return await fn(); } catch { return null; }
}

const API = {

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

  async getCustomCourses() {
    return request('/api/courses/custom');
  },

  async saveCustomCourse(course) {
    return request('/api/courses/custom', {
      method: 'POST',
      body: JSON.stringify(course),
    });
  },

  async deleteCustomCourse(code) {
    return request(`/api/courses/custom/${code}`, { method: 'DELETE' });
  },

  /* ════════════════════════════════════════
     TIMETABLES (multi)
  ════════════════════════════════════════ */

  async getTimetables() {
    return request('/api/timetables');
  },

  async createTimetable({ name, semester = 'S1' } = {}) {
    return request('/api/timetables', {
      method: 'POST',
      body: JSON.stringify({ name, semester }),
    });
  },

  async getTimetableById(id) {
    return request(`/api/timetables/${id}`);
  },

  async updateTimetable(id, data) {
    return request(`/api/timetables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteTimetable(id) {
    return request(`/api/timetables/${id}`, { method: 'DELETE' });
  },

  async detectConflicts(ttId, selected) {
    return request(`/api/timetables/${ttId}/conflicts`, {
      method: 'POST',
      body: JSON.stringify({ selected }),
    });
  },

  async autoSchedule(ttId, { selected, preferences }) {
    return request(`/api/timetables/${ttId}/auto-schedule`, {
      method: 'POST',
      body: JSON.stringify({ selected, preferences }),
    });
  },

  /* ── Backwards-compat wrappers (courses.js uses these) ── */

  async getTimetable() {
    let id = State.getActiveTimetableId();
    if (id) {
      try { return await this.getTimetableById(id); }
      catch { State.setActiveTimetableId(null); }
    }
    const tts = await this.getTimetables();
    if (!tts?.length) return { selected: [], isPublic: false, name: 'My Timetable', id: null };
    State.setActiveTimetableId(tts[0].id);
    return this.getTimetableById(tts[0].id);
  },

  async saveTimetable(data) {
    let id = State.getActiveTimetableId();
    if (!id) {
      const tt = await this.createTimetable({ name: 'My Timetable' });
      id = tt.id;
      State.setActiveTimetableId(id);
    }
    return this.updateTimetable(id, data);
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

  async getFriendTimetables(studentNumber) {
    return nullable(() => request(`/api/friends/${studentNumber}/timetables`));
  },

  /* ════════════════════════════════════════
     USERS
  ════════════════════════════════════════ */

  async lookupUser(studentNumber) {
    return nullable(() => request(`/api/users/${studentNumber}`));
  },

};

export default API;

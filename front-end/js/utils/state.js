/* ═══════════════════════════════════════════
   state.js — Global application state

   Persists to localStorage so selections
   survive page-to-page navigation.
   Shape: { selected, semester, user, friends,
            friendRequests, isPublic, timetableName }
═══════════════════════════════════════════ */

const State = {
  _key: 'uwa_planner_state',

  /* ── Defaults ───────────────────────── */
  _defaults() {
    return {
      selected:       [],     // [{ code: string, altIdx: number }]
      semester:       'S1',   // active semester filter
      user:           null,   // { name, initials, email, studentNumber } | null
      friends:        [],     // [{ id, name, initials, email, studentNumber, addedAt }]
      friendRequests: [],     // [{ id, name, initials, email, studentNumber, requestedAt }]
      sentRequests:   [],     // [{ id, name, initials, email, studentNumber, sentAt }]
      isPublic:       false,  // whether timetable is shared with friends
      timetableName:  '',     // label shown to friends
    };
  },

  /* ── Core read / write ──────────────── */
  _load() {
    try {
      const raw = localStorage.getItem(this._key);
      return raw ? { ...this._defaults(), ...JSON.parse(raw) } : this._defaults();
    } catch {
      return this._defaults();
    }
  },

  _save(state) {
    localStorage.setItem(this._key, JSON.stringify(state));
  },

  /** Read the full state object */
  get() { return this._load(); },

  /** Shallow-merge a patch into state */
  set(patch) {
    this._save({ ...this._load(), ...patch });
  },

  /* ── Course selection helpers ───────── */
  addCourse(code) {
    const s = this._load();
    if (!s.selected.find(x => x.code === code)) {
      s.selected.push({ code, altIdx: 0 });
      this._save(s);
    }
  },

  removeCourse(code) {
    const s = this._load();
    s.selected = s.selected.filter(x => x.code !== code);
    this._save(s);
  },

  setAlt(code, altIdx) {
    const s = this._load();
    const entry = s.selected.find(x => x.code === code);
    if (entry) {
      entry.altIdx = altIdx;
      this._save(s);
    }
  },

  hasCourse(code) {
    return !!this._load().selected.find(x => x.code === code);
  },

  clearAll() {
    const s = this._load();
    s.selected = [];
    this._save(s);
  },

  /* ── Friends helpers ────────────────── */

  /** Add a friend. Silently ignores duplicates. */
  addFriend(friend) {
    const s = this._load();
    if (!s.friends.find(f => f.studentNumber === friend.studentNumber)) {
      s.friends.push({ ...friend, addedAt: new Date().toISOString() });
      this._save(s);
    }
  },

  /** Remove a friend by student number. */
  removeFriend(studentNumber) {
    const s = this._load();
    s.friends = s.friends.filter(f => f.studentNumber !== studentNumber);
    this._save(s);
    // Remove their public timetable snapshot
    localStorage.removeItem(`uwa_planner_public_${studentNumber}`);
  },

  hasFriend(studentNumber) {
    return !!this._load().friends.find(f => f.studentNumber === studentNumber);
  },

  /* ── Friend requests ────────────────── */

  addFriendRequest(request) {
    const s = this._load();
    if (!s.friendRequests.find(r => r.studentNumber === request.studentNumber)) {
      s.friendRequests.push({ ...request, requestedAt: new Date().toISOString() });
      this._save(s);
    }
  },

  acceptFriendRequest(studentNumber) {
    const s = this._load();
    const req = s.friendRequests.find(r => r.studentNumber === studentNumber);
    if (!req) return;
    s.friendRequests = s.friendRequests.filter(r => r.studentNumber !== studentNumber);
    if (!s.friends.find(f => f.studentNumber === studentNumber)) {
      s.friends.push({ ...req, addedAt: new Date().toISOString() });
    }
    this._save(s);
    // Notify the sender their request was accepted
    if (s.user?.studentNumber) {
      const acceptedKey = `uwa_planner_accepted_${studentNumber}`;
      try {
        const accepted = JSON.parse(localStorage.getItem(acceptedKey) || '[]');
        if (!accepted.includes(s.user.studentNumber)) {
          accepted.push(s.user.studentNumber);
          localStorage.setItem(acceptedKey, JSON.stringify(accepted));
        }
      } catch {}
    }
  },

  declineFriendRequest(studentNumber) {
    const s = this._load();
    s.friendRequests = s.friendRequests.filter(r => r.studentNumber !== studentNumber);
    this._save(s);
  },

  /** Send a friend request (writes to their localStorage inbox) */
  sendFriendRequest(target) {
    const s = this._load();
    if (!s.sentRequests.find(r => r.studentNumber === target.studentNumber)) {
      s.sentRequests.push({ ...target, sentAt: new Date().toISOString() });
      this._save(s);
    }
    if (s.user) {
      const inboxKey = `uwa_planner_inbox_${target.studentNumber}`;
      try {
        const inbox = JSON.parse(localStorage.getItem(inboxKey) || '[]');
        if (!inbox.find(r => r.studentNumber === s.user.studentNumber)) {
          inbox.push({ ...s.user, sentAt: new Date().toISOString() });
          localStorage.setItem(inboxKey, JSON.stringify(inbox));
        }
      } catch {}
    }
  },

  /** Cancel a sent request */
  cancelSentRequest(studentNumber) {
    const s = this._load();
    s.sentRequests = s.sentRequests.filter(r => r.studentNumber !== studentNumber);
    this._save(s);
    if (s.user) {
      const inboxKey = `uwa_planner_inbox_${studentNumber}`;
      try {
        const inbox = JSON.parse(localStorage.getItem(inboxKey) || '[]');
        const filtered = inbox.filter(r => r.studentNumber !== s.user.studentNumber);
        filtered.length
          ? localStorage.setItem(inboxKey, JSON.stringify(filtered))
          : localStorage.removeItem(inboxKey);
      } catch {}
    }
  },

  hasSentRequest(studentNumber) {
    return !!this._load().sentRequests.find(r => r.studentNumber === studentNumber);
  },

  /** Poll your inbox: pull in any requests others have sent you */
  checkInbox() {
    const s = this._load();
    if (!s.user?.studentNumber) return;
    const inboxKey = `uwa_planner_inbox_${s.user.studentNumber}`;
    try {
      const inbox = JSON.parse(localStorage.getItem(inboxKey) || '[]');
      if (!inbox.length) return;
      let changed = false;
      inbox.forEach(req => {
        const alreadyReq    = s.friendRequests.find(r => r.studentNumber === req.studentNumber);
        const alreadyFriend = s.friends.find(f => f.studentNumber === req.studentNumber);
        if (!alreadyReq && !alreadyFriend) {
          s.friendRequests.push({ ...req, requestedAt: req.sentAt || new Date().toISOString() });
          changed = true;
        }
      });
      if (changed) this._save(s);
      localStorage.removeItem(inboxKey);
    } catch {}
  },

  /** Poll acceptances: move any accepted sentRequests into friends */
  checkAccepted() {
    const s = this._load();
    if (!s.user?.studentNumber) return;
    const acceptedKey = `uwa_planner_accepted_${s.user.studentNumber}`;
    try {
      const accepted = JSON.parse(localStorage.getItem(acceptedKey) || '[]');
      if (!accepted.length) return;
      let changed = false;
      accepted.forEach(sn => {
        const sent = s.sentRequests.find(r => r.studentNumber === sn);
        if (sent && !s.friends.find(f => f.studentNumber === sn)) {
          s.friends.push({ ...sent, addedAt: new Date().toISOString() });
          s.sentRequests = s.sentRequests.filter(r => r.studentNumber !== sn);
          changed = true;
        }
      });
      if (changed) this._save(s);
      localStorage.removeItem(acceptedKey);
    } catch {}
  },

  /* ── Public timetable ───────────────── */

  /**
   * Mark the current timetable as public (visible to friends)
   * or private. Also writes/removes the public snapshot in
   * localStorage so friends can read it.
   */
  setPublic(isPublic) {
    const s = this._load();
    s.isPublic = isPublic;
    this._save(s);

    if (s.user?.studentNumber) {
      const key = `uwa_planner_public_${s.user.studentNumber}`;
      if (isPublic) {
        localStorage.setItem(key, JSON.stringify({
          isPublic:      true,
          selected:      s.selected,
          semester:      s.semester,
          timetableName: s.timetableName || 'My Timetable',
          owner:         { name: s.user.name, initials: s.user.initials, studentNumber: s.user.studentNumber },
          updatedAt:     new Date().toISOString(),
        }));
      } else {
        localStorage.removeItem(key);
      }
    }
  },

  setTimetableName(name) {
    this.set({ timetableName: name });
  },

  /**
   * Read a friend's public timetable snapshot.
   * Returns null if they haven't published one.
   */
  getFriendPublicTimetable(studentNumber) {
    try {
      const raw = localStorage.getItem(`uwa_planner_public_${studentNumber}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  /**
   * Seed a mock public timetable for a friend (used for demo).
   * Only writes if the key doesn't already exist.
   */
  seedMockPublicTimetable(studentNumber, data) {
    const key = `uwa_planner_public_${studentNumber}`;
    if (!localStorage.getItem(key)) {
      localStorage.setItem(key, JSON.stringify({ isPublic: true, ...data }));
    }
  },
};

export default State;

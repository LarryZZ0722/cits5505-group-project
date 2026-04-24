# CITS5505 Group Project — Implementation Plan
**Application: UWA Timetable Planner**
Branch: `hung` | Last updated: 2026-04-21

---

## 1. Application Description

**UWA Timetable Planner** is a web application that lets UWA students browse real unit offerings, build a conflict-free weekly timetable, swap between alternative lab/tutorial slots, and share their schedule with classmates — all before enrolment day.

Key features:
- Search 250+ units by code, name, faculty, credit points, and semester
- Instant clash detection when adding units
- Auto-scheduler that picks the best slot combination based on user preferences
- Friend system — send/accept requests, view friends' public timetables

---

## 2. User Stories

| # | As a… | I want to… | So that… |
|---|--------|------------|----------|
| 1 | UWA student | browse all available units filtered by semester | I can see what's on offer before I commit to anything |
| 2 | UWA student | search units by code, name, or faculty | I can quickly find a specific unit without scrolling the whole catalogue |
| 3 | UWA student | add a unit to my selection with one click | I can build my semester basket quickly and intuitively |
| 4 | UWA student | see an instant warning when two of my units clash in time | I know about conflicts before I head to enrolment |
| 5 | UWA student | swap between alternative lab/tutorial times for a unit | I can manually resolve clashes without dropping the unit entirely |
| 6 | UWA student | use the Auto-schedule button with preferences (avoid 8am, free Fridays, compact days) | I get a suggested conflict-free timetable without manually trying every combination |
| 7 | UWA student | send and accept friend requests by student number | I can connect with classmates |
| 8 | UWA student | view a friend's public timetable | I can coordinate shared free periods and avoid scheduling conflicts with friends |
| 9 | UWA student | control whether my timetable is visible to friends | I keep my schedule private by default |
| 10 | UWA student | log in and have my selections saved across sessions | I don't lose my timetable when I close the tab |
| 11 | UWA student | update my display name and student number on my profile | my friends see the correct identity when I send requests |
| 12 | UWA student | change my password from my profile page | I can keep my account secure without contacting support |

---

## 3. Pages

| Page | File | Status |
|------|------|--------|
| **Home / Landing** | `index.html` | ✅ Built |
| **Browse Units** | `courses.html` | ✅ Built |
| **My Selection** | `selected.html` | ✅ Built |
| **Schedule Generator** | `schedule.html` | ✅ Built |
| **Login / Sign up** | `auth.html` | ✅ Built |
| **Friends** | `friends.html` | ✅ Built |
| **Profile** | `profile.html` | ⬜ Planned |

---

## 4. Architecture

### CSS

Two-file CSS system — no separate per-page files:

| File | Responsibility |
|------|---------------|
| `css/tokens.css` | Design tokens — colours, spacing, radius, shadows, dark/light theme vars |
| `css/custom.css` | All non-Tailwind styles: resets, keyframes, component classes referenced by JS, mobile responsive rules |

**Tailwind CSS CDN** (`https://cdn.tailwindcss.com`) handles all layout, spacing, and responsive utilities in HTML. Dark mode is via `['selector', '[data-theme="dark"]']`. Custom fonts (Syne, Instrument Sans, JetBrains Mono) via Google Fonts.

### JavaScript — ES Modules

All JS files use `type="module"`. No global scope. Files import from each other explicitly.

| File | Responsibility |
|------|---------------|
| `js/utils/state.js` | Single localStorage state store — selected units, user, friends, sent requests, timetable sharing |
| `js/utils/api.js` | `getCourses()` — loads `data/courses.json` |
| `js/utils/components.js` | **Side-effect import** — injects nav (CSS Grid centered), mobile sidebar + FAB trigger, toast container. Owns per-page nav init. |
| `js/utils/nav.js` | `updateNavBadge`, `renderNavUser`, `markActiveLink` |
| `js/utils/theme.js` | Dark/light toggle, FOUC prevention via inline `<head>` script |
| `js/utils/toast.js` | Toast notification helper |
| `js/utils/schedule-utils.js` | `DAYS`, `PALETTE`, `getColor`, `getActiveSessions`, `detectConflicts`, `getTotalCp`, `getDaysUsed` |
| `js/home.js` | Imports components (nav only) |
| `js/auth.js` | Login / sign-up forms, demo login, tab switching |
| `js/courses.js` | Unit table, filters, search, pagination, basket |
| `js/selected.js` | Unit cards, conflict detection, summary bar |
| `js/schedule.js` | Timetable grid, auto-schedule, preferences, slot alternatives, friend visibility toggle |
| `js/friends.js` | Friend requests (send/pending/accept/cancel), friend list, timetable modal |
| `js/profile.js` | Display name / student number update, password change form |

### Nav / Mobile

- **Desktop (≥ 768px):** CSS Grid nav — logo left, links centered, user/auth right
- **Mobile (< 768px):** Nav shows logo + user only. A floating pill button (left-center edge of screen) opens a slide-in sidebar drawer with all nav links + user info/auth buttons

### Friend Request Flow

Simulated with localStorage (no backend yet):
- `sendFriendRequest(target)` → writes to target's `uwa_planner_inbox_${sn}`
- `checkInbox()` → reads own inbox on page load, moves to `friendRequests`
- `acceptFriendRequest()` → writes to sender's `uwa_planner_accepted_${sn}`
- `checkAccepted()` → reads accepted notifications, moves to `friends`
- Sent requests show as **⏳ Pending** until accepted; can be cancelled

---

## 5. Progress

### Completed
- [x] All 6 HTML pages built (index, auth, courses, selected, schedule, friends)
- [x] `data/data-model.json` — API contract agreed with Flask back-end team
- [x] `data/courses.json` — 250+ sample units for front-end development
- [x] Full JS utility module suite (state, api, theme, toast, nav, schedule-utils)
- [x] DRY nav via `components.js` — nav injected once, never written per-page
- [x] ES module architecture — all files use `type="module"`, explicit imports
- [x] Friend system — send/pending/accept/cancel flow with localStorage simulation
- [x] Mobile sidebar with floating FAB trigger (< 768px)
- [x] Responsive layouts on all pages (Tailwind grid breakpoints)
- [x] Dark / light theme with FOUC prevention (inline head script)
- [x] Auto-schedule with preferences (avoid 8am, compact days, free Fridays)
- [x] Public timetable toggle with friend visibility control

### In Progress / Pending
- [ ] `profile.html` — display name / student number update, password change
- [ ] Flask back-end (intentionally deferred until after mid-semester break)
- [ ] OAuth (Google/GitHub buttons present, wired after back-end)
- [ ] Replace localStorage friend simulation with real API calls

---

## 6. Flask Back-end Plan (post mid-sem)

Endpoints defined in `data/data-model.json`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/auth/register` | POST | Create account |
| `/api/auth/login` | POST | Log in, return session |
| `/api/units` | GET | Return unit catalogue |
| `/api/timetable` | GET / POST | Save / load user timetable |
| `/api/friends` | GET / POST / DELETE | Friend list management |
| `/api/friends/requests` | GET / POST | Incoming / outgoing requests |
| `/api/profile` | GET / PUT | Fetch and update display name, student number |
| `/api/auth/password` | PUT | Change password (requires current password) |

---

*Branch: `hung` — front-end only until back-end integration sprint.*

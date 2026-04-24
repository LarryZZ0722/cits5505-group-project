# UWA Timetable Planner

A client-side timetable planning tool for UWA students. Browse units, detect scheduling conflicts, swap tutorial/lab slots, auto-generate conflict-free schedules, and share timetables with classmates.

Built with plain HTML, CSS, and JavaScript. Designed to connect to a **Flask backend** for live UWA timetable data.

---

## Table of Contents

- [Project Structure](#project-structure)
- [Pages](#pages)
- [Getting Started](#getting-started)
- [Connecting the Flask Backend](#connecting-the-flask-backend)
- [Data Model](#data-model)
- [API Contract](#api-contract)
- [Frontend Architecture](#frontend-architecture)
- [Theme System](#theme-system)
- [State Management](#state-management)

---

## Project Structure

```
uwa-planner/
│
├── index.html              # Home / landing page
├── auth.html               # Login & signup
├── courses.html            # Browse & search units
├── selected.html           # Review selected units
├── schedule.html           # Generate & view timetable
│
├── css/
│   ├── global.css          # @import manifest — links all base partials
│   ├── base/               # Shared style modules
│   │   ├── tokens.css      # CSS variables (dark + light themes)
│   │   ├── reset.css       # Browser normalisation
│   │   ├── theme.css       # Theme toggle + transitions
│   │   ├── animations.css  # All @keyframes
│   │   ├── nav.css         # Navigation bar
│   │   ├── buttons.css     # Button variants
│   │   ├── forms.css       # Inputs, labels, tags, badges
│   │   └── components.css  # Panel, modal, toast, empty state
│   ├── home.css            # Landing page styles
│   ├── auth.css            # Login/signup styles
│   ├── courses.css         # Course table + basket
│   ├── selected.css        # Unit cards
│   └── schedule.css        # Timetable grid + controls
│
├── js/
│   ├── app.js              # Load-order documentation
│   ├── utils/              # Shared utility modules
│   │   ├── theme.js        # Dark/light theme toggle
│   │   ├── state.js        # localStorage state management
│   │   ├── api.js          # Data fetching layer (swap URL here)
│   │   ├── schedule-utils.js  # Conflict detection, session logic
│   │   ├── toast.js        # Toast notifications
│   │   └── nav.js          # Nav badge, user avatar, share modal
│   ├── home.js             # Landing page logic
│   ├── auth.js             # Login/signup validation
│   ├── courses.js          # Course table, filters, basket
│   ├── selected.js         # Unit cards, conflict display
│   └── schedule.js         # Grid render, alt drawer, auto-schedule
│
└── data/
    └── courses.json        # Dummy data (replaced by Flask API)
```

---

## Pages

| Page | File | Description |
|------|------|-------------|
| Home | `index.html` | Landing page with feature overview |
| Login / Signup | `auth.html` | Authentication — use `?tab=signup` for signup |
| Browse Units | `courses.html` | Searchable unit table with semester filters |
| My Selection | `selected.html` | Review chosen units, view conflicts |
| Schedule Generator | `schedule.html` | Weekly timetable grid, alt slots, auto-schedule |

---

## Getting Started

### Running the frontend only (dummy data)

No build step required. Open any HTML file directly in a browser:

```bash
# Option 1 — Python dev server (recommended, avoids CORS on fetch)
cd uwa-planner
python3 -m http.server 8080
# Open: http://localhost:8080

# Option 2 — VS Code Live Server extension
# Right-click index.html → "Open with Live Server"
```

> **Why a server?** The frontend fetches `data/courses.json` via `fetch()`. Browsers block `fetch()` on `file://` URLs due to CORS policy. A local HTTP server fixes this.

---

## Connecting the Flask Backend

### 1. Install Flask

```bash
pip install flask flask-cors
```

### 2. Minimal Flask app skeleton

```python
# app.py
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # Allow requests from the frontend origin

# ── Courses ──────────────────────────────────────────────────────────────────

@app.route('/api/courses', methods=['GET'])
def get_courses():
    """
    Returns all courses.
    Optional query params:
      ?semester=S1        filter by semester code
      ?faculty=CSSE       filter by faculty
      ?q=data             search by code or name
    """
    # TODO: query your database here
    # Must return a JSON array matching the Course schema (see Data Model)
    courses = []  # db.session.query(Course).all()
    return jsonify(courses)


@app.route('/api/courses/<code>', methods=['GET'])
def get_course(code):
    """Returns a single course by unit code."""
    # TODO: query your database here
    course = {}  # db.session.query(Course).filter_by(code=code).first()
    return jsonify(course)


# ── Auth ─────────────────────────────────────────────────────────────────────

@app.route('/api/auth/login', methods=['POST'])
def login():
    """
    Body: { "email": "...", "password": "..." }
    Returns: { "user": { "name": "...", "initials": "...", "email": "..." } }
    """
    data = request.get_json()
    # TODO: validate credentials
    return jsonify({ 'user': { 'name': 'Alex', 'initials': 'A', 'email': data['email'] } })


@app.route('/api/auth/register', methods=['POST'])
def register():
    """
    Body: { "firstName": "...", "lastName": "...", "studentNumber": "...",
            "email": "...", "password": "..." }
    Returns: { "user": { ... } }
    """
    data = request.get_json()
    # TODO: create user in database
    return jsonify({ 'user': { 'name': data['firstName'], 'initials': data['firstName'][0] } })


# ── Timetables ───────────────────────────────────────────────────────────────

@app.route('/api/timetables', methods=['GET'])
def get_timetables():
    """Returns saved timetables for the authenticated user."""
    return jsonify([])


@app.route('/api/timetables', methods=['POST'])
def save_timetable():
    """
    Body: { "name": "...", "semester": "S1", "selected": [{...}] }
    Returns: { "id": "...", "shareCode": "..." }
    """
    data = request.get_json()
    return jsonify({ 'id': '1', 'shareCode': 'x8k2mq' })


@app.route('/api/timetables/share/<share_code>', methods=['GET'])
def get_shared_timetable(share_code):
    """Returns a timetable by its public share code."""
    return jsonify({})


if __name__ == '__main__':
    app.run(debug=True, port=5000)
```

### 3. Point the frontend at Flask

Open `js/utils/api.js` and update the base URL:

```js
// js/utils/api.js
const BASE_URL = 'http://localhost:5000/api';  // ← change this

const API = {
  async getCourses(params = {}) {
    const qs  = new URLSearchParams(params).toString();
    const url = qs ? `${BASE_URL}/courses?${qs}` : `${BASE_URL}/courses`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to load courses (${res.status})`);
    return res.json();
  },

  async getCourse(code) {
    const res = await fetch(`${BASE_URL}/courses/${code}`);
    if (!res.ok) return null;
    return res.json();
  },

  async login(email, password) {
    const res = await fetch(`${BASE_URL}/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Login failed');
    return res.json();
  },

  async register(data) {
    const res = await fetch(`${BASE_URL}/auth/register`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Registration failed');
    return res.json();
  },
};
```

### 4. Run both together

```bash
# Terminal 1 — Flask backend
python app.py
# Listening on http://localhost:5000

# Terminal 2 — Frontend
cd uwa-planner
python3 -m http.server 8080
# Open http://localhost:8080
```

---

## Data Model

### Course

The core data object. Matches the shape in `data/courses.json` and what the Flask API must return.

```json
{
  "code":     "CITS1003",
  "name":     "Introduction to Cybersecurity",
  "cp":       6,
  "faculty":  "CSSE",
  "sems":     ["S1"],
  "sessions": [
    { "type": "LEC", "day": 0, "hour": 9,  "duration": 2 },
    { "type": "LAB", "day": 2, "hour": 14, "duration": 2 }
  ],
  "alternatives": [
    [{ "type": "LAB", "day": 3, "hour": 10, "duration": 2 }],
    [{ "type": "LAB", "day": 4, "hour": 14, "duration": 2 }]
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `code` | `string` | Unique unit code e.g. `"CITS1003"` |
| `name` | `string` | Full unit name |
| `cp` | `number` | Credit points (typically `6`) |
| `faculty` | `string` | Faculty/school name |
| `sems` | `string[]` | Offered semesters — `"S1"`, `"S2"`, `"SUM"` |
| `sessions` | `Session[]` | Default weekly sessions (all types) |
| `alternatives` | `Session[][]` | Alternative groups for swappable session types |

### Session

```json
{ "type": "LAB", "day": 2, "hour": 14, "duration": 2 }
```

| Field | Type | Description |
|-------|------|-------------|
| `type` | `"LEC"` \| `"LAB"` \| `"TUT"` | Session type |
| `day` | `0–4` | Day of week — `0` = Monday, `4` = Friday |
| `hour` | `8–19` | Start hour in 24h format |
| `duration` | `1–3` | Length in hours |

### How `alternatives` works

`alternatives` is an array of **slot groups**. Each group replaces sessions of the same `type` in the base `sessions` array.

```
sessions:     [ LEC Mon 9:00, LAB Wed 14:00 ]
alternatives: [
  [ LAB Thu 10:00 ],   ← option 1: replaces the LAB
  [ LAB Fri 14:00 ]    ← option 2: replaces the LAB
]
```

When `altIdx = 0` → use `sessions` as-is.
When `altIdx = 1` → replace matching types with `alternatives[0]`.
When `altIdx = 2` → replace matching types with `alternatives[1]`.

### User

```json
{
  "name":          "Alex Smith",
  "initials":      "A",
  "email":         "21234567@student.uwa.edu.au",
  "studentNumber": "21234567"
}
```

### Saved timetable (for Flask DB)

```json
{
  "id":         "tmt_abc123",
  "userId":     "usr_xyz",
  "name":       "My Semester 1",
  "semester":   "S1",
  "createdAt":  "2025-02-14T10:30:00Z",
  "shareCode":  "x8k2mq",
  "selected": [
    { "code": "CITS1003", "altIdx": 1 },
    { "code": "MATH1001", "altIdx": 0 },
    { "code": "STAT1400", "altIdx": 2 }
  ]
}
```

### Suggested Flask / SQLAlchemy models

```python
# models.py
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
import json

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'users'
    id            = db.Column(db.Integer, primary_key=True)
    student_number = db.Column(db.String(8), unique=True, nullable=False)
    email         = db.Column(db.String(120), unique=True, nullable=False)
    name          = db.Column(db.String(100), nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    created_at    = db.Column(db.DateTime, default=datetime.utcnow)
    timetables    = db.relationship('Timetable', backref='user', lazy=True)

    def to_dict(self):
        return {
            'id':            self.id,
            'name':          self.name,
            'initials':      self.name[0].upper(),
            'email':         self.email,
            'studentNumber': self.student_number,
        }


class Course(db.Model):
    __tablename__ = 'courses'
    id           = db.Column(db.Integer, primary_key=True)
    code         = db.Column(db.String(10), unique=True, nullable=False)
    name         = db.Column(db.String(200), nullable=False)
    cp           = db.Column(db.Integer, nullable=False, default=6)
    faculty      = db.Column(db.String(100))
    sems         = db.Column(db.JSON)          # ["S1", "S2"]
    sessions     = db.Column(db.JSON)          # [{ type, day, hour, duration }]
    alternatives = db.Column(db.JSON)          # [[{ type, day, hour, duration }]]

    def to_dict(self):
        return {
            'code':         self.code,
            'name':         self.name,
            'cp':           self.cp,
            'faculty':      self.faculty,
            'sems':         self.sems or [],
            'sessions':     self.sessions or [],
            'alternatives': self.alternatives or [],
        }


class Timetable(db.Model):
    __tablename__ = 'timetables'
    id          = db.Column(db.Integer, primary_key=True)
    user_id     = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    name        = db.Column(db.String(100), default='My Timetable')
    semester    = db.Column(db.String(5))            # "S1", "S2", "SUM"
    selected    = db.Column(db.JSON)                 # [{ code, altIdx }]
    share_code  = db.Column(db.String(10), unique=True)
    created_at  = db.Column(db.DateTime, default=datetime.utcnow)

    def to_dict(self):
        return {
            'id':        self.id,
            'name':      self.name,
            'semester':  self.semester,
            'selected':  self.selected or [],
            'shareCode': self.share_code,
            'createdAt': self.created_at.isoformat(),
        }
```

---

## API Contract

All endpoints return JSON. All request bodies are `Content-Type: application/json`.

### Courses

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/courses` | List all courses (supports `?semester=S1&q=cits`) |
| `GET` | `/api/courses/<code>` | Get single course by unit code |

**`GET /api/courses` response:**
```json
[
  {
    "code": "CITS1003",
    "name": "Introduction to Cybersecurity",
    "cp": 6,
    "faculty": "CSSE",
    "sems": ["S1"],
    "sessions": [...],
    "alternatives": [...]
  }
]
```

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login with email + password |
| `POST` | `/api/auth/register` | Create a new account |

**`POST /api/auth/login` body:**
```json
{ "email": "21234567@student.uwa.edu.au", "password": "secret" }
```

**Response:**
```json
{ "user": { "name": "Alex", "initials": "A", "email": "..." } }
```

### Timetables

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/timetables` | Get user's saved timetables |
| `POST` | `/api/timetables` | Save a timetable |
| `GET` | `/api/timetables/share/<code>` | Load a shared timetable |

---

## Frontend Architecture

### Script load order

Every HTML page loads scripts in this fixed order:

```html
<script src="js/utils/theme.js"></script>         <!-- 1. apply theme before paint -->
<script src="js/utils/state.js"></script>          <!-- 2. localStorage state -->
<script src="js/utils/api.js"></script>            <!-- 3. fetch layer -->
<script src="js/utils/schedule-utils.js"></script> <!-- 4. pure scheduling logic -->
<script src="js/utils/toast.js"></script>          <!-- 5. notifications -->
<script src="js/utils/nav.js"></script>            <!-- 6. nav badge, user, modal -->
<script src="js/[page].js"></script>               <!-- 7. page-specific logic -->
```

### Utility modules

| File | Exports | Purpose |
|------|---------|---------|
| `theme.js` | `Theme` | `init()`, `toggle()`, `get()`, `set()` |
| `state.js` | `State` | `get()`, `set()`, `addCourse()`, `removeCourse()`, `setAlt()` |
| `api.js` | `API` | `getCourses()`, `getCourse(code)` |
| `schedule-utils.js` | globals | `DAYS`, `PALETTE`, `getColor()`, `getActiveSessions()`, `detectConflicts()`, `getTotalCp()`, `getDaysUsed()` |
| `toast.js` | `toast()` | `toast(msg, type)` |
| `nav.js` | globals | `updateNavBadge()`, `renderNavUser()`, `markActiveLink()`, `openShare()`, `closeShare()` |

---

## Theme System

The app supports **dark** (default) and **light** themes.

- Theme choice is saved to `localStorage` under the key `uwa_theme`
- `theme.js` applies `[data-theme]` to `<html>` immediately on load — before CSS renders — to prevent a flash
- All colours are CSS variables defined in `css/base/tokens.css`
- Adding a new theme only requires adding a new `[data-theme="mytheme"]` block in `tokens.css`

---

## State Management

Client-side state lives in `localStorage` under the key `uwa_planner_state`.

```json
{
  "selected": [
    { "code": "CITS1003", "altIdx": 1 },
    { "code": "MATH1001", "altIdx": 0 }
  ],
  "semester": "S1",
  "user": {
    "name": "Alex",
    "initials": "A",
    "email": "21234567@student.uwa.edu.au"
  }
}
```

`altIdx` values:
- `0` — use the unit's default sessions
- `1+` — use `alternatives[altIdx - 1]` (replacing matching session types)

When the Flask backend is connected, the `selected` array should be sent to `POST /api/timetables` to persist it server-side.

# UWA Timetable Planner

A web application that helps University of Western Australia students plan their semester timetable, resolve scheduling conflicts, and share schedules with friends.

**Features**
- Browse and search UWA units by semester, faculty, or code
- Build a weekly timetable across multiple saved plans
- Click session blocks to preview and swap alternative time slots
- Auto-schedule to minimise conflicts based on preferences (avoid 8am, compact days, free Fridays)
- Share timetables with friends — toggle visibility per plan
- Add custom units with your own session times
- Register with a UWA student email, manage profile and password

**Stack** — Flask · SQLite · SQLAlchemy · JWT · Jinja2 · Flask-WTF (CSRF) · Tailwind CSS · Vanilla JS

---

## Group members

| UWA ID | Name | GitHub username |
|--------|------|-----------------|
| 24701844 | Thanh Hung Nguyen | 24701844 |
| 23456790 | Student Two | github-username-2 |
| 23456791 | Student Three | github-username-3 |
| 23456792 | Student Four | github-username-4 |

---

## Project structure

```
cits5505-group-project/
├── back-end/
│   ├── app.py            # Flask entry point — CORS, CSRF, blueprints, startup
│   ├── pages.py          # Jinja page routes: /  /auth  /courses  /schedule  /friends  /profile
│   ├── auth.py           # /api/health  /api/auth/*
│   ├── users.py          # /api/profile  /api/users/*
│   ├── timetables.py     # /api/timetables/*  (conflict detection, auto-schedule)
│   ├── friends.py        # /api/friends/*
│   ├── courses.py        # /api/courses/*
│   ├── models.py         # SQLAlchemy models (User, Timetable, Friendship, …)
│   ├── utils.py          # Shared helpers (current_user, ok, err, load_courses, …)
│   ├── seed.py           # Demo data — runs automatically on every startup
│   ├── requirements.txt
│   ├── templates/        # Jinja2 templates (served at clean URLs by pages.py)
│   │   ├── base.html     # Shared head: fonts, CSS, CSRF meta tag
│   │   ├── index.html
│   │   ├── auth.html
│   │   ├── courses.html
│   │   ├── schedule.html
│   │   ├── friends.html
│   │   └── profile.html
│   └── static/           # Served at /static/ by Flask
│       ├── css/
│       │   ├── tokens.css        # Design tokens (colours, spacing, dark mode)
│       │   └── custom.css        # Component styles
│       ├── js/
│       │   ├── home.js
│       │   ├── auth.js
│       │   ├── courses.js
│       │   ├── schedule.js
│       │   ├── friends.js
│       │   ├── profile.js
│       │   └── utils/
│       │       ├── api.js            # All fetch calls — attaches JWT + CSRF headers
│       │       ├── state.js          # Auth state + localStorage
│       │       ├── nav.js            # Active-link highlighting
│       │       ├── components.js     # Nav, sidebar, toast shell
│       │       ├── schedule-utils.js
│       │       └── toast.js
│       └── data/
│           └── courses.json          # UWA unit catalogue
└── tests/
```

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Python | 3.11 |

---

## Setup and run

### Start Flask

**Windows**

```cmd
cd back-end

:: Create virtual environment (first time only)
python -m venv venv
venv\Scripts\activate

:: Install dependencies (first time only)
pip install -r requirements.txt

:: Start the server
python app.py
```

**macOS / Linux**

```bash
cd back-end

# Create virtual environment (first time only)
python3 -m venv venv
source venv/bin/activate

# Install dependencies (first time only)
pip install -r requirements.txt

# Start the server
python app.py
```

Then open **http://localhost:5000** in your browser.

Flask serves both the Jinja-rendered HTML pages and the JSON API. No separate frontend server is needed.

---

## How it works

| Layer | Technology | Details |
|-------|-----------|---------|
| Pages | Jinja2 | `pages.py` renders HTML templates from `front-end/`. Every page inherits `base.html` which injects the CSRF token into a `<meta>` tag. |
| API | Flask blueprints | REST JSON endpoints under `/api/` — protected with JWT Bearer tokens. |
| CSRF | Flask-WTF | Token generated per session, embedded in `<meta name="csrf-token">`. All mutating fetch calls send it as `X-CSRF-Token`. |
| Auth | flask-jwt-extended | 7-day access tokens stored in `localStorage`. |
| Database | SQLAlchemy + SQLite | Auto-created and seeded with demo data on first run. |

---

## Demo accounts

All demo accounts use password `demo1234`.

| Name | Student number | Notes |
|------|---------------|-------|
| Hung Nguyen | 21000001 | 2 timetables (S1 public, S2 private), friends with Alex and Jordan |
| Alex Smith | 21234567 | 1 public timetable (CS Focus) |
| Jordan Lee | 21345678 | 2 public timetables |
| Sam Chen | 21111111 | 2 private timetables, friend with Hung |
| Riley Morgan | 21456789 | Pending request to Hung |
| Casey Park | 21567890 | Pending request from Hung |

---

## Running the tests

```bash
cd back-end
python -m pytest
```

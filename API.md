# API Reference

Base URL: `http://localhost:5000`

🔒 = requires `Authorization: Bearer <token>` header.
Tokens are issued on login/register and expire after **7 days**.

---

## Response format

All endpoints return JSON. Mutations return `{ "ok": true }` on success.
Errors return `{ "message": "..." }` with the appropriate HTTP status.

---

## Health

### `GET /api/health`

Server liveness check. No auth required.

```json
{ "status": "ok" }
```

---

## Auth

### `POST /api/auth/register`

Create a new account.

**Body**
```json
{
  "name": "Alex Smith",
  "studentNumber": "21234567",
  "email": "21234567@student.uwa.edu.au",
  "password": "yourpassword"
}
```

**Response `201`**
```json
{ "user": { "id": 1, "name": "Alex Smith", "initials": "AS", "email": "...", "studentNumber": "21234567" }, "access_token": "<jwt>" }
```

| Status | Reason |
|--------|--------|
| 400 | Name is required |
| 400 | Must use a UWA student email |
| 400 | Student number must be 8 digits starting with 2 |
| 400 | Password must be at least 8 characters |
| 409 | Email already registered |
| 409 | Student number already registered |

---

### `POST /api/auth/login`

Authenticate with email or student number.

**Body**
```json
{ "email": "21234567@student.uwa.edu.au", "password": "yourpassword" }
```

> The `email` field accepts either a full email address or a bare student number (e.g. `"21234567"`).

**Response `200`**
```json
{ "user": { ... }, "access_token": "<jwt>" }
```

| Status | Reason |
|--------|--------|
| 401 | Invalid email/student ID or password |

---

### `POST /api/auth/logout`

Signals logout. JWT is stateless — the client must discard its stored token.

**Response `200`** `{ "ok": true }`

---

### `PUT /api/auth/password` 🔒

Change the authenticated user's password.

**Body**
```json
{ "currentPassword": "oldpassword", "newPassword": "newpassword" }
```

| Status | Reason |
|--------|--------|
| 400 | New password must be at least 8 characters |
| 403 | Current password is incorrect |

---

## Profile

### `GET /api/profile` 🔒

Fetch the authenticated user's profile.

**Response `200`**
```json
{ "user": { "id": 1, "name": "Alex Smith", "initials": "AS", "email": "...", "studentNumber": "21234567" } }
```

---

### `PUT /api/profile` 🔒

Update name or student number. Only provided fields are changed.

**Body**
```json
{ "name": "Alexander Smith", "studentNumber": "21234567" }
```

**Response `200`** `{ "user": { ... } }`

| Status | Reason |
|--------|--------|
| 409 | Student number already in use |

---

### `GET /api/users/{student_number}` 🔒

Look up any user by student number (used when adding friends).

**Response `200`** — user object (same shape as profile)

| Status | Reason |
|--------|--------|
| 404 | User not found |

---

## Timetables

Each user can have multiple named timetables. `altIdx` in a selected entry picks the time-slot variant for that unit (`0` = default, `1+` = alternative index).

### `GET /api/timetables` 🔒

List all timetables for the authenticated user. Creates a default one if none exist.

**Response `200`** — array of summary objects
```json
[
  { "id": 1, "name": "Semester 1 Plan", "semester": "S1", "isPublic": true, "updatedAt": "2025-05-01T10:00:00Z" }
]
```

---

### `POST /api/timetables` 🔒

Create a new timetable.

**Body**
```json
{ "name": "Semester 2 Plan", "semester": "S2" }
```

**Response `201`** — full timetable object (see GET below)

---

### `GET /api/timetables/{id}` 🔒

Fetch a single timetable with its selected units.

**Response `200`**
```json
{
  "id": 1,
  "name": "Semester 1 Plan",
  "semester": "S1",
  "isPublic": true,
  "updatedAt": "2025-05-01T10:00:00Z",
  "selected": [
    { "code": "CITS1401", "altIdx": 0 },
    { "code": "CITS1003", "altIdx": 1 }
  ]
}
```

| Status | Reason |
|--------|--------|
| 404 | Timetable not found |

---

### `PUT /api/timetables/{id}` 🔒

Update a timetable. Only provided fields are changed.

**Body** (all fields optional)
```json
{
  "name": "Updated Name",
  "semester": "S1",
  "isPublic": true,
  "selected": [{ "code": "CITS1401", "altIdx": 0 }]
}
```

| Status | Reason |
|--------|--------|
| 404 | Timetable not found |

---

### `DELETE /api/timetables/{id}` 🔒

Delete a timetable and all its entries.

| Status | Reason |
|--------|--------|
| 404 | Timetable not found |

---

### `POST /api/timetables/{id}/conflicts` 🔒

Detect time conflicts in a selection of units.

**Body**
```json
{ "selected": [{ "code": "CITS1401", "altIdx": 0 }, { "code": "CITS1003", "altIdx": 0 }] }
```

> If `selected` is omitted, the timetable's saved entries are used.

**Response `200`**
```json
{ "conflicts": ["CITS1401", "CITS1003"] }
```

Returns an empty array when there are no conflicts.

---

### `POST /api/timetables/{id}/auto-schedule` 🔒

Reassign `altIdx` for each unit to minimise conflicts, optionally respecting preferences.

**Body**
```json
{
  "selected": [{ "code": "CITS1401", "altIdx": 0 }],
  "preferences": {
    "avoid8am":    true,
    "compactDays": false,
    "freeFridays": false
  }
}
```

> `compactDays` — prefer fewer campus days per week.
> `freeFridays` — penalise Friday sessions.
> `avoid8am` — penalise 8:00 starts.

**Response `200`**
```json
{ "selected": [{ "code": "CITS1401", "altIdx": 2 }] }
```

---

## Friends

Friendships are mutual (stored as two rows). The API always operates from the perspective of the authenticated user.

### `GET /api/friends` 🔒

List confirmed friends.

**Response `200`**
```json
[
  { "id": 2, "name": "Jordan Lee", "initials": "JL", "email": "...", "studentNumber": "21345678", "addedAt": "2025-04-01T08:00:00Z" }
]
```

---

### `DELETE /api/friends/{student_number}` 🔒

Remove a friend (both directions). Silently succeeds if not friends.

---

### `GET /api/friends/requests/pending` 🔒

List incoming friend requests awaiting a response.

**Response `200`**
```json
[
  { "id": 4, "name": "Riley Morgan", "initials": "RM", "email": "...", "studentNumber": "21456789", "requestedAt": "2025-04-22T09:00:00Z" }
]
```

---

### `GET /api/friends/requests/sent` 🔒

List outgoing friend requests still pending acceptance.

**Response `200`**
```json
[
  { "id": 5, "name": "Casey Park", "initials": "CP", "email": "...", "studentNumber": "21567890", "sentAt": "2025-04-20T12:00:00Z" }
]
```

---

### `POST /api/friends/requests` 🔒

Send a friend request.

**Body**
```json
{ "studentNumber": "21345678" }
```

| Status | Reason |
|--------|--------|
| 404 | User not found |
| 409 | Already friends |
| 422 | Cannot send a request to yourself |

---

### `PUT /api/friends/requests/{student_number}/accept` 🔒

Accept an incoming request and create a mutual friendship.

| Status | Reason |
|--------|--------|
| 404 | User not found |

---

### `DELETE /api/friends/requests/{student_number}` 🔒

Decline an incoming request. Silently succeeds if the request does not exist.

---

### `DELETE /api/friends/requests/sent/{student_number}` 🔒

Cancel an outgoing request. Silently succeeds if the request does not exist.

---

### `GET /api/friends/{student_number}/timetables` 🔒

Fetch all public timetables belonging to a friend.

**Response `200`** — array of timetable objects, each with an extra `owner` field:
```json
[
  {
    "id": 5,
    "name": "CS Focus",
    "semester": "S1",
    "isPublic": true,
    "updatedAt": "2025-04-25T14:00:00Z",
    "selected": [{ "code": "CITS2200", "altIdx": 0 }],
    "owner": { "name": "Alex Smith", "initials": "AS", "studentNumber": "21234567" }
  }
]
```

Returns an empty array if the friend has no public timetables.

| Status | Reason |
|--------|--------|
| 403 | Not friends |
| 404 | User not found |

---

## Courses

### `GET /api/courses`

Full unit catalogue. No auth required.

**Response `200`** — array of course objects
```json
[
  {
    "code": "CITS1401",
    "name": "Computational Thinking with Python",
    "faculty": "Computer Science and Software Engineering",
    "cp": 6,
    "sems": ["S1", "S2"],
    "sessions": [
      { "type": "LEC", "day": 0, "hour": 10, "duration": 2 }
    ],
    "alternatives": [
      [{ "type": "LAB", "day": 1, "hour": 13, "duration": 2 }]
    ]
  }
]
```

Session fields: `day` 0–4 = Mon–Fri · `hour` 24-hour · `duration` in hours.
Each entry in `alternatives` is a set of sessions that replaces the matching `type` from the default.

---

### `GET /api/courses/{code}`

Single course by unit code (case-insensitive).

| Status | Reason |
|--------|--------|
| 404 | Course not found |

---

### `GET /api/courses/custom` 🔒

List the authenticated user's custom units.

**Response `200`** — array of course objects (same shape as above, with `"custom": true`)

---

### `POST /api/courses/custom` 🔒

Create or update a custom unit. If `code` already exists for this user, it is overwritten.

**Body**
```json
{
  "code": "PROJ9999",
  "name": "Research Project",
  "sems": ["S1", "S2"],
  "sessions": [{ "type": "LEC", "day": 2, "hour": 14, "duration": 2 }]
}
```

| Status | Reason |
|--------|--------|
| 400 | Unit code is required |

---

### `DELETE /api/courses/custom/{code}` 🔒

Delete a custom unit. Silently succeeds if it does not exist.

# API Documentation

Base URL: `http://localhost:5000`

All protected endpoints require a Bearer token in the `Authorization` header:

```
Authorization: Bearer <access_token>
```

Tokens are valid for **7 days** and are returned on login and register.

---

## Response conventions

**Success**
```json
{ "ok": true }
```

**Error**
```json
{ "message": "Description of the error" }
```

---

## Health

### GET /api/health

Check that the server is running. No authentication required.

**Response `200`**
```json
{ "status": "ok" }
```

---

## Auth

### POST /api/auth/login

Authenticate with an email address or student number.

**Request body**
```json
{
  "email": "21234567@student.uwa.edu.au",
  "password": "yourpassword"
}
```

> The `email` field accepts either a full email address or an 8-digit student number.

**Response `200`**
```json
{
  "user": {
    "id": 1,
    "name": "Alex Smith",
    "initials": "AS",
    "email": "21234567@student.uwa.edu.au",
    "studentNumber": "21234567"
  },
  "access_token": "<jwt>"
}
```

**Errors**
| Status | Message |
|--------|---------|
| 401 | Invalid email/student ID or password |

---

### POST /api/auth/register

Create a new account. Email must be a UWA student address.

**Request body**
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
{
  "user": { ... },
  "access_token": "<jwt>"
}
```

**Errors**
| Status | Message |
|--------|---------|
| 400 | Name is required |
| 400 | Must use a UWA student email |
| 400 | Student number must be 8 digits starting with 2 |
| 400 | Password must be at least 8 characters |
| 409 | Email already registered |
| 409 | Student number already registered |

---

### POST /api/auth/logout

Signals logout. The client should discard its stored token. JWT is stateless — no server-side invalidation occurs.

**Response `200`**
```json
{ "ok": true }
```

---

### PUT /api/auth/password 🔒

Change the authenticated user's password.

**Request body**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword"
}
```

**Response `200`**
```json
{ "ok": true }
```

**Errors**
| Status | Message |
|--------|---------|
| 400 | New password must be at least 8 characters |
| 403 | Current password is incorrect |

---

## Profile

### GET /api/profile 🔒

Fetch the authenticated user's profile.

**Response `200`**
```json
{
  "user": {
    "id": 1,
    "name": "Alex Smith",
    "initials": "AS",
    "email": "21234567@student.uwa.edu.au",
    "studentNumber": "21234567"
  }
}
```

---

### PUT /api/profile 🔒

Update the authenticated user's name or student number. Only provided fields are updated.

**Request body**
```json
{
  "name": "Alexander Smith",
  "studentNumber": "21234567"
}
```

**Response `200`**
```json
{
  "user": { ... }
}
```

**Errors**
| Status | Message |
|--------|---------|
| 409 | Student number already in use |

---

## Courses

### GET /api/courses

Return the full list of available units. No authentication required.

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
      { "type": "LEC", "day": 0, "hour": 10, "duration": 1 }
    ],
    "alternatives": []
  }
]
```

Session fields: `day` 0–4 = Mon–Fri, `hour` in 24-hour format, `duration` in hours.

---

### GET /api/courses/{code}

Return a single course by unit code (case-insensitive).

**Response `200`** — single course object (same shape as above)

**Errors**
| Status | Message |
|--------|---------|
| 404 | Course not found |

---

## Timetable

### GET /api/timetable 🔒

Fetch the authenticated user's saved timetable. Creates an empty one if none exists.

**Response `200`**
```json
{
  "id": 1,
  "name": null,
  "semester": null,
  "isPublic": false,
  "updatedAt": "2025-04-28T10:00:00Z",
  "selected": [
    { "code": "CITS1401", "altIdx": 0 },
    { "code": "CITS1003", "altIdx": 1 }
  ]
}
```

---

### POST /api/timetable 🔒

Save the user's timetable. All fields are optional — only provided fields are updated.

**Request body**
```json
{
  "selected": [
    { "code": "CITS1401", "altIdx": 0 },
    { "code": "CITS1003", "altIdx": 0 }
  ],
  "name": "Semester 1 Plan",
  "semester": "S1",
  "isPublic": false
}
```

**Response `200`**
```json
{ "ok": true }
```

---

### POST /api/timetable/conflicts 🔒

Detect time conflicts in a list of selected units.

**Request body**
```json
{
  "selected": [
    { "code": "CITS1401", "altIdx": 0 },
    { "code": "CITS1003", "altIdx": 0 }
  ]
}
```

**Response `200`**
```json
{
  "conflicts": ["CITS1401", "CITS1003"]
}
```

Returns an empty array if there are no conflicts.

---

### POST /api/timetable/auto-schedule 🔒

Automatically assign alternative time slots to minimise conflicts based on preferences.

**Request body**
```json
{
  "selected": [
    { "code": "CITS1401", "altIdx": 0 }
  ],
  "preferences": {
    "avoid8am": true,
    "compactDays": false,
    "freeFridays": false
  }
}
```

**Response `200`**
```json
{
  "selected": [
    { "code": "CITS1401", "altIdx": 2 }
  ]
}
```

Returns the same list with `altIdx` values updated to the best-scoring slots.

---

## Friends

### GET /api/friends 🔒

List the authenticated user's friends.

**Response `200`**
```json
[
  {
    "id": 2,
    "name": "Jordan Lee",
    "initials": "JL",
    "email": "21345678@student.uwa.edu.au",
    "studentNumber": "21345678",
    "addedAt": "2025-04-01T08:00:00Z"
  }
]
```

---

### DELETE /api/friends/{student_number} 🔒

Remove a friend. Silently succeeds if the friendship does not exist.

**Response `200`**
```json
{ "ok": true }
```

---

### POST /api/friends/requests 🔒

Send a friend request to another user by student number.

**Request body**
```json
{
  "studentNumber": "21345678"
}
```

**Response `200`**
```json
{ "ok": true }
```

**Errors**
| Status | Message |
|--------|---------|
| 404 | User not found |
| 409 | Already friends |
| 422 | Cannot send a request to yourself |

---

### GET /api/friends/requests/sent 🔒

List outgoing friend requests the authenticated user has sent.

**Response `200`**
```json
[
  {
    "id": 3,
    "name": "Riley Morgan",
    "initials": "RM",
    "email": "21456789@student.uwa.edu.au",
    "studentNumber": "21456789",
    "sentAt": "2025-04-20T12:00:00Z"
  }
]
```

---

### DELETE /api/friends/requests/sent/{student_number} 🔒

Cancel a sent friend request. Silently succeeds if the request does not exist.

**Response `200`**
```json
{ "ok": true }
```

---

### GET /api/friends/requests/pending 🔒

List incoming friend requests waiting for the authenticated user to accept or decline.

**Response `200`**
```json
[
  {
    "id": 4,
    "name": "Casey Park",
    "initials": "CP",
    "email": "21567890@student.uwa.edu.au",
    "studentNumber": "21567890",
    "requestedAt": "2025-04-22T09:00:00Z"
  }
]
```

---

### PUT /api/friends/requests/{student_number}/accept 🔒

Accept an incoming friend request. Creates a mutual friendship.

**Response `200`**
```json
{ "ok": true }
```

**Errors**
| Status | Message |
|--------|---------|
| 404 | User not found |

---

### DELETE /api/friends/requests/{student_number} 🔒

Decline an incoming friend request. Silently succeeds if the request does not exist.

**Response `200`**
```json
{ "ok": true }
```

---

### GET /api/friends/{student_number}/timetable 🔒

Fetch a friend's timetable. Returns `null` if the friend has no timetable or has not made it public.

**Response `200`**
```json
{
  "id": 5,
  "name": "Semester 1 Plan",
  "semester": "S1",
  "isPublic": true,
  "updatedAt": "2025-04-25T14:00:00Z",
  "selected": [
    { "code": "CITS1401", "altIdx": 0 }
  ],
  "timetableName": "Semester 1 Plan",
  "owner": {
    "name": "Jordan Lee",
    "initials": "JL",
    "studentNumber": "21345678"
  }
}
```

---

## Users

### GET /api/users/{student_number} 🔒

Look up a user by student number. Used when adding friends.

**Response `200`**
```json
{
  "id": 2,
  "name": "Jordan Lee",
  "initials": "JL",
  "email": "21345678@student.uwa.edu.au",
  "studentNumber": "21345678"
}
```

**Errors**
| Status | Message |
|--------|---------|
| 404 | User not found |

"""
app.py — UWA Planner Flask backend  (JWT auth)

Run:
    pip install -r requirements.txt
    python app.py
"""

import json
import os
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, make_response
from flask_jwt_extended import (
    JWTManager, create_access_token,
    jwt_required, get_jwt_identity,
)
from models import db, User, Timetable, TimetableEntry, Friendship, FriendRequest

# ── App & config ──────────────────────────────────────────────────────
BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
COURSES_PATH = os.path.join(BASE_DIR, '..', 'front-end', 'data', 'courses.json')

app = Flask(__name__)
app.config.update(
    SECRET_KEY                     = os.environ.get('SECRET_KEY', 'dev-secret-change-in-production'),
    SQLALCHEMY_DATABASE_URI        = f'sqlite:///{os.path.join(BASE_DIR, "planner.db")}',
    SQLALCHEMY_TRACK_MODIFICATIONS = False,
    JWT_SECRET_KEY                 = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-key-change-in-production'),
    JWT_ACCESS_TOKEN_EXPIRES       = timedelta(days=7),
)

db.init_app(app)
jwt = JWTManager(app)

# ── CORS ──────────────────────────────────────────────────────────────
_ALLOWED_ORIGINS = {
    'http://localhost:5500', 'http://127.0.0.1:5500',
    'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://localhost:8080', 'http://127.0.0.1:8080',
}

@app.before_request
def handle_preflight():
    if request.method == 'OPTIONS':
        return make_response('', 204)   # headers added by after_request below

@app.after_request
def add_cors(response):
    origin = request.headers.get('Origin', '')
    if origin in _ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin']      = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers']     = 'Content-Type, Authorization'
        response.headers['Access-Control-Allow-Methods']     = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Max-Age']           = '86400'
        response.headers['Access-Control-Expose-Headers']    = 'Authorization'
    return response

# ── Helpers ───────────────────────────────────────────────────────────
def get_initials(name: str) -> str:
    parts = name.strip().split()
    return ''.join(p[0] for p in parts if p)[:2].upper()

_courses_cache = None

def load_courses() -> list:
    global _courses_cache
    if _courses_cache is None:
        with open(COURSES_PATH, encoding='utf-8') as f:
            _courses_cache = json.load(f)
    return _courses_cache

def current_user() -> User:
    return db.session.get(User, int(get_jwt_identity()))

def make_token(user: User) -> str:
    return create_access_token(identity=str(user.id))

def ok():
    return jsonify({'ok': True})

def err(msg: str, status: int = 400):
    return jsonify({'message': msg}), status

def user_dict(u: User) -> dict:
    return {
        'id':            u.id,
        'name':          u.name,
        'initials':      u.initials,
        'email':         u.email,
        'studentNumber': u.student_number,
    }

# ── Scheduling logic ──────────────────────────────────────────────────
def get_active_sessions(course: dict, alt_idx: int) -> list:
    """Return sessions for a unit given the chosen alternative index."""
    base = list(course.get('sessions', []))
    alts = course.get('alternatives', [])
    if alt_idx == 0 or not alts:
        return base
    alt = alts[alt_idx - 1] if alt_idx - 1 < len(alts) else []
    if alt:
        alt_type = alt[0]['type']
        base = [s for s in base if s['type'] != alt_type]
    return base + alt

def detect_conflicts(selected: list, courses: list) -> set:
    """Return set of unit codes involved in a time clash."""
    slots = []
    for entry in selected:
        course = next((c for c in courses if c['code'] == entry.get('code')), None)
        if not course:
            continue
        for s in get_active_sessions(course, entry.get('altIdx', 0)):
            slots.append((s['day'], s['hour'], s['hour'] + s['duration'], entry['code']))

    conflicts = set()
    for i in range(len(slots)):
        for j in range(i + 1, len(slots)):
            a, b = slots[i], slots[j]
            if a[0] == b[0] and a[1] < b[2] and b[1] < a[2]:
                conflicts.add(a[3])
                conflicts.add(b[3])
    return conflicts

def run_auto_schedule(selected: list, courses: list, prefs: dict) -> list:
    """Greedy: for each unit pick the alt slot with the lowest penalty score."""
    avoid_8am    = prefs.get('avoid8am', False)
    compact_days = prefs.get('compactDays', False)
    free_fridays = prefs.get('freeFridays', False)
    result = [dict(e) for e in selected]

    for i, entry in enumerate(result):
        course = next((c for c in courses if c['code'] == entry['code']), None)
        if not course or not course.get('alternatives'):
            continue

        best_alt, best_score = entry.get('altIdx', 0), float('inf')

        for alt in range(len(course['alternatives']) + 1):
            test = [dict(e) for e in result]
            test[i]['altIdx'] = alt
            n_clash    = len(detect_conflicts(test, courses))
            sessions   = get_active_sessions(course, alt)
            pen_8am    = 10 if avoid_8am    and any(s['hour'] == 8 for s in sessions) else 0
            pen_fri    = 10 if free_fridays and any(s['day']  == 4 for s in sessions) else 0
            pen_spread = len({s['day'] for s in sessions}) if compact_days else 0
            score      = n_clash * 100 + pen_8am + pen_fri + pen_spread

            if score < best_score:
                best_score, best_alt = score, alt

        result[i]['altIdx'] = best_alt
    return result

# ── Timetable helpers ─────────────────────────────────────────────────
def ensure_timetable(user: User) -> Timetable:
    if not user.timetable:
        tt = Timetable(user_id=user.id)
        db.session.add(tt)
        db.session.flush()
        return tt
    return user.timetable

def replace_entries(tt: Timetable, selected: list) -> None:
    TimetableEntry.query.filter_by(timetable_id=tt.id).delete()
    for pos, item in enumerate(selected):
        db.session.add(TimetableEntry(
            timetable_id = tt.id,
            unit_code    = item['code'],
            alt_idx      = item.get('altIdx', 0),
            position     = pos,
        ))

# ── Error handlers ────────────────────────────────────────────────────
@app.errorhandler(404)
def not_found(_):
    return err('Not found', 404)

@app.errorhandler(405)
def method_not_allowed(_):
    return err('Method not allowed', 405)

@app.errorhandler(500)
def internal_error(e):
    db.session.rollback()
    app.logger.error(str(e))
    return err('Internal server error', 500)

@jwt.unauthorized_loader
def missing_token(_):
    return err('Not authenticated', 401)

@jwt.invalid_token_loader
def invalid_token(_):
    return err('Invalid token', 401)

@jwt.expired_token_loader
def expired_token(*_):
    return err('Token expired — please log in again', 401)

# ════════════════════════════════════════
# HEALTH
# ════════════════════════════════════════
@app.get('/api/health')
def health():
    return jsonify({'status': 'ok'})

# ════════════════════════════════════════
# AUTH  /api/auth/*
# ════════════════════════════════════════
@app.post('/api/auth/login')
def auth_login():
    data       = request.get_json(silent=True) or {}
    identifier = (data.get('email') or '').strip()
    user = (
        User.query.filter_by(email=identifier.lower()).first() or
        User.query.filter_by(student_number=identifier).first()
    )
    if not user or not user.check_password(data.get('password', '')):
        return err('Invalid email/student ID or password', 401)
    return jsonify({'user': user_dict(user), 'access_token': make_token(user)})


@app.post('/api/auth/register')
def auth_register():
    data  = request.get_json(silent=True) or {}
    name  = (data.get('name')          or '').strip()
    email = (data.get('email')         or '').strip().lower()
    sn    = (data.get('studentNumber') or '').strip()
    pw    =  data.get('password')      or ''

    if not name:
        return err('Name is required')
    if not email.endswith('@student.uwa.edu.au'):
        return err('Must use a UWA student email')
    if not (len(sn) == 8 and sn.startswith('2') and sn.isdigit()):
        return err('Student number must be 8 digits starting with 2')
    if len(pw) < 8:
        return err('Password must be at least 8 characters')
    if User.query.filter_by(email=email).first():
        return err('Email already registered', 409)
    if User.query.filter_by(student_number=sn).first():
        return err('Student number already registered', 409)

    user = User(name=name, initials=get_initials(name), email=email, student_number=sn)
    user.set_password(pw)
    db.session.add(user)
    db.session.flush()
    db.session.add(Timetable(user_id=user.id))
    db.session.commit()
    return jsonify({'user': user_dict(user), 'access_token': make_token(user)}), 201


@app.post('/api/auth/logout')
def auth_logout():
    # JWT is stateless — client discards the token; nothing to invalidate server-side
    return ok()


@app.put('/api/auth/password')
@jwt_required()
def auth_password():
    user = current_user()
    data = request.get_json(silent=True) or {}
    if not user.check_password(data.get('currentPassword', '')):
        return err('Current password is incorrect', 403)
    new_pw = data.get('newPassword', '')
    if len(new_pw) < 8:
        return err('New password must be at least 8 characters')
    user.set_password(new_pw)
    db.session.commit()
    return ok()


# ════════════════════════════════════════
# PROFILE  /api/profile
# ════════════════════════════════════════
@app.get('/api/profile')
@jwt_required()
def get_profile():
    return jsonify({'user': user_dict(current_user())})


@app.put('/api/profile')
@jwt_required()
def update_profile():
    user = current_user()
    data = request.get_json(silent=True) or {}
    name = (data.get('name')          or '').strip()
    sn   = (data.get('studentNumber') or '').strip()

    if name:
        user.name     = name
        user.initials = get_initials(name)
    if sn and sn != user.student_number:
        if User.query.filter_by(student_number=sn).first():
            return err('Student number already in use', 409)
        user.student_number = sn

    db.session.commit()
    return jsonify({'user': user_dict(user)})


# ════════════════════════════════════════
# COURSES  /api/courses
# ════════════════════════════════════════
@app.get('/api/courses')
def get_courses():
    return jsonify(load_courses())


@app.get('/api/courses/<code>')
def get_course(code):
    course = next((c for c in load_courses() if c['code'] == code.upper()), None)
    if not course:
        return err('Course not found', 404)
    return jsonify(course)


# ════════════════════════════════════════
# TIMETABLE  /api/timetable
# ════════════════════════════════════════
@app.get('/api/timetable')
@jwt_required()
def get_timetable():
    user = current_user()
    tt   = ensure_timetable(user)
    db.session.commit()
    return jsonify(tt.to_dict())


@app.post('/api/timetable')
@jwt_required()
def save_timetable():
    user = current_user()
    data = request.get_json(silent=True) or {}
    tt   = ensure_timetable(user)

    if data.get('selected') is not None:
        replace_entries(tt, data['selected'])
    if data.get('semester') is not None:
        tt.semester = data['semester']
    if data.get('name') is not None:
        tt.name = data['name']
    if data.get('isPublic') is not None:
        tt.is_public = bool(data['isPublic'])
    tt.updated_at = datetime.utcnow()

    db.session.commit()
    return ok()


@app.post('/api/timetable/conflicts')
@jwt_required()
def timetable_conflicts():
    data     = request.get_json(silent=True) or {}
    selected = data.get('selected', [])
    return jsonify({'conflicts': list(detect_conflicts(selected, load_courses()))})


@app.post('/api/timetable/auto-schedule')
@jwt_required()
def timetable_auto_schedule():
    data     = request.get_json(silent=True) or {}
    selected = data.get('selected', [])
    prefs    = data.get('preferences', {})
    return jsonify({'selected': run_auto_schedule(selected, load_courses(), prefs)})


# ════════════════════════════════════════
# FRIENDS  /api/friends
# ════════════════════════════════════════
@app.get('/api/friends')
@jwt_required()
def get_friends():
    user = current_user()
    return jsonify([
        {**user_dict(fs.friend), 'addedAt': fs.created_at.isoformat() + 'Z'}
        for fs in user.friendships
    ])


@app.delete('/api/friends/<student_number>')
@jwt_required()
def remove_friend(student_number):
    user   = current_user()
    friend = User.query.filter_by(student_number=student_number).first()
    if friend:
        Friendship.query.filter(
            ((Friendship.user_id   == user.id)   & (Friendship.friend_id == friend.id)) |
            ((Friendship.user_id   == friend.id) & (Friendship.friend_id == user.id))
        ).delete(synchronize_session=False)
        db.session.commit()
    return ok()


@app.post('/api/friends/requests')
@jwt_required()
def send_friend_request():
    user      = current_user()
    data      = request.get_json(silent=True) or {}
    recipient = User.query.filter_by(student_number=data.get('studentNumber', '')).first()
    if not recipient:
        return err('User not found', 404)
    if recipient.id == user.id:
        return err('Cannot send a request to yourself', 422)
    if Friendship.query.filter_by(user_id=user.id, friend_id=recipient.id).first():
        return err('Already friends', 409)
    if not FriendRequest.query.filter_by(sender_id=user.id, recipient_id=recipient.id).first():
        db.session.add(FriendRequest(sender_id=user.id, recipient_id=recipient.id))
        db.session.commit()
    return ok()


@app.get('/api/friends/requests/sent')
@jwt_required()
def get_sent_requests():
    user = current_user()
    return jsonify([
        {**user_dict(r.recipient), 'sentAt': r.sent_at.isoformat() + 'Z'}
        for r in user.sent_requests
    ])


@app.delete('/api/friends/requests/sent/<student_number>')
@jwt_required()
def cancel_friend_request(student_number):
    user      = current_user()
    recipient = User.query.filter_by(student_number=student_number).first()
    if recipient:
        FriendRequest.query.filter_by(
            sender_id=user.id, recipient_id=recipient.id
        ).delete()
        db.session.commit()
    return ok()


@app.get('/api/friends/requests/pending')
@jwt_required()
def get_pending_requests():
    user = current_user()
    return jsonify([
        {**user_dict(r.sender), 'requestedAt': r.sent_at.isoformat() + 'Z'}
        for r in user.recv_requests
    ])


@app.put('/api/friends/requests/<student_number>/accept')
@jwt_required()
def accept_friend_request(student_number):
    user   = current_user()
    sender = User.query.filter_by(student_number=student_number).first()
    if not sender:
        return err('User not found', 404)

    req = FriendRequest.query.filter_by(
        sender_id=sender.id, recipient_id=user.id
    ).first()
    if not req:
        return ok()

    db.session.delete(req)
    for row in Friendship.make(user.id, sender.id):
        if not Friendship.query.filter_by(
            user_id=row.user_id, friend_id=row.friend_id
        ).first():
            db.session.add(row)
    db.session.commit()
    return ok()


@app.delete('/api/friends/requests/<student_number>')
@jwt_required()
def decline_friend_request(student_number):
    user   = current_user()
    sender = User.query.filter_by(student_number=student_number).first()
    if sender:
        FriendRequest.query.filter_by(
            sender_id=sender.id, recipient_id=user.id
        ).delete()
        db.session.commit()
    return ok()


@app.get('/api/friends/<student_number>/timetable')
@jwt_required()
def get_friend_timetable(student_number):
    friend = User.query.filter_by(student_number=student_number).first()
    if not friend or not friend.timetable or not friend.timetable.is_public:
        return jsonify(None)
    data = friend.timetable.to_dict()
    data['timetableName'] = data.get('name')
    data['owner'] = {
        'name':          friend.name,
        'initials':      friend.initials,
        'studentNumber': friend.student_number,
    }
    return jsonify(data)


# ════════════════════════════════════════
# USERS  /api/users
# ════════════════════════════════════════
@app.get('/api/users/<student_number>')
@jwt_required()
def lookup_user(student_number):
    user = User.query.filter_by(student_number=student_number).first()
    if not user:
        return err('User not found', 404)
    return jsonify(user_dict(user))


# ════════════════════════════════════════
# SEED & STARTUP
# ════════════════════════════════════════
DEMO_USERS = [
    ('Hung Nguyen',  '21000001', 'demo1234'),
    ('Alex Smith',   '21234567', 'demo1234'),
    ('Jordan Lee',   '21345678', 'demo1234'),
    ('Riley Morgan', '21456789', 'demo1234'),
    ('Casey Park',   '21567890', 'demo1234'),
]

def seed():
    for name, sn, pw in DEMO_USERS:
        if not User.query.filter_by(student_number=sn).first():
            u = User(
                name=name,
                initials=get_initials(name),
                email=f'{sn}@student.uwa.edu.au',
                student_number=sn,
            )
            u.set_password(pw)
            db.session.add(u)
    db.session.flush()

    for name, sn, pw in DEMO_USERS:
        u = User.query.filter_by(student_number=sn).first()
        if u and not u.timetable:
            db.session.add(Timetable(user_id=u.id))

    alex = User.query.filter_by(student_number='21234567').first()
    if alex and not alex.timetable:
        tt = Timetable(
            user_id=alex.id, name='Semester 1 Plan',
            semester='S1', is_public=True,
        )
        db.session.add(tt)
        db.session.flush()
        for pos, (code, alt) in enumerate([('CITS1401', 0), ('CITS1003', 0)]):
            db.session.add(TimetableEntry(
                timetable_id=tt.id, unit_code=code, alt_idx=alt, position=pos,
            ))

    db.session.commit()


if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        seed()
        print('[ok] Database ready')
        print('[ok] Demo users seeded  (password: demo1234)')
        print('[ok] Running on http://localhost:5000')
    app.run(debug=True, port=5000)

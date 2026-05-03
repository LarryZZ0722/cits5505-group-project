# auth.py — Authentication endpoints
# Kalp Riteshkumar Prajapati (25073034)
# Handles: register, login, logout, change password

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, create_access_token, get_jwt_identity
from models import db, User, Timetable

auth_bp = Blueprint('auth', __name__)

# ── Helpers ───────────────────────────────────────────────────────────

def get_initials(name: str) -> str:
    parts = name.strip().split()
    return ''.join(p[0] for p in parts if p)[:2].upper()

def user_dict(u: User) -> dict:
    return {
        'id':            u.id,
        'name':          u.name,
        'initials':      u.initials,
        'email':         u.email,
        'studentNumber': u.student_number,
    }

def make_token(user: User) -> str:
    return create_access_token(identity=str(user.id))

def err(msg: str, status: int = 400):
    return jsonify({'message': msg}), status

def ok():
    return jsonify({'ok': True})

# ── POST /api/auth/register ───────────────────────────────────────────

@auth_bp.post('/api/auth/register')
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


# ── POST /api/auth/login ──────────────────────────────────────────────

@auth_bp.post('/api/auth/login')
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


# ── POST /api/auth/logout ─────────────────────────────────────────────

@auth_bp.post('/api/auth/logout')
def auth_logout():
    # JWT is stateless — client discards token, nothing to do server side
    return ok()


# ── PUT /api/auth/password ────────────────────────────────────────────

@auth_bp.put('/api/auth/password')
@jwt_required()
def auth_password():
    user_id = int(get_jwt_identity())
    user    = db.session.get(User, user_id)
    data    = request.get_json(silent=True) or {}

    if not user.check_password(data.get('currentPassword', '')):
        return err('Current password is incorrect', 403)

    new_pw = data.get('newPassword', '')
    if len(new_pw) < 8:
        return err('New password must be at least 8 characters')

    user.set_password(new_pw)
    db.session.commit()
    return ok()
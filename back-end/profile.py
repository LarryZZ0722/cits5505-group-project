# profile.py — Profile endpoints
# Kalp Riteshkumar Prajapati (25073034)
# Handles: get profile, update profile

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, User

profile_bp = Blueprint('profile', __name__)

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

def err(msg: str, status: int = 400):
    return jsonify({'message': msg}), status

# ── GET /api/profile ──────────────────────────────────────────────────

@profile_bp.get('/api/profile')
@jwt_required()
def get_profile():
    user_id = int(get_jwt_identity())
    user    = db.session.get(User, user_id)
    return jsonify({'user': user_dict(user)})


# ── PUT /api/profile ──────────────────────────────────────────────────

@profile_bp.put('/api/profile')
@jwt_required()
def update_profile():
    user_id = int(get_jwt_identity())
    user    = db.session.get(User, user_id)
    data    = request.get_json(silent=True) or {}

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
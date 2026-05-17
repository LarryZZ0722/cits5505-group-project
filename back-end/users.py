"""
users.py — Profile and user lookup routes

  GET  /api/profile
  PUT  /api/profile
  GET  /api/profile/viewers
  GET  /api/users/<student_number>
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from models import db, User, TimetableView
from utils import ok, err, current_user, user_dict, get_initials

users_bp = Blueprint('users', __name__)


@users_bp.get('/api/profile')
@jwt_required()
def get_profile():
    return jsonify({'user': user_dict(current_user())})


@users_bp.put('/api/profile')
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
        # Validate student number format — same rules as registration (closes #36)
        if not (len(sn) == 8 and sn.startswith('2') and sn.isdigit()):
            return err('Student number must be 8 digits starting with 2')
        if User.query.filter_by(student_number=sn).first():
            return err('Student number already in use', 409)
        user.student_number = sn

    db.session.commit()
    return jsonify({'user': user_dict(user)})


@users_bp.get('/api/profile/viewers')
@jwt_required()
def get_timetable_viewers():
    """
    Returns recent viewers of the current user's public timetables.
    Used by the profile page 'Recent Viewers' section (issue #15).
    Kalp Prajapati (25073034)
    """
    user   = current_user()
    tt_ids = [tt.id for tt in user.timetables if tt.is_public]
    if not tt_ids:
        return jsonify([])

    views = (
        TimetableView.query
        .filter(TimetableView.timetable_id.in_(tt_ids))
        .order_by(TimetableView.viewed_at.desc())
        .limit(20)
        .all()
    )

    return jsonify([
        {
            'viewerName':     v.viewer.name,
            'viewerInitials': v.viewer.initials,
            'timetableName':  v.timetable.name,
            'viewedAt':       v.viewed_at.isoformat() + 'Z',
        }
        for v in views
    ])


@users_bp.get('/api/users/<student_number>')
@jwt_required()
def lookup_user(student_number):
    user = User.query.filter_by(student_number=student_number).first()
    if not user:
        return err('User not found', 404)
    return jsonify(user_dict(user))
"""
users.py — Profile and user lookup routes

  GET  /api/profile
  PUT  /api/profile
  GET  /api/users/<student_number>
"""

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from models import db, User
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
        if User.query.filter_by(student_number=sn).first():
            return err('Student number already in use', 409)
        user.student_number = sn

    db.session.commit()
    return jsonify({'user': user_dict(user)})


@users_bp.get('/api/users/<student_number>')
@jwt_required()
def lookup_user(student_number):
    user = User.query.filter_by(student_number=student_number).first()
    if not user:
        return err('User not found', 404)
    return jsonify(user_dict(user))

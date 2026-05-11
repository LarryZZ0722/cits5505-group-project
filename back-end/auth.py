"""
auth.py — Authentication routes  /api/auth/*
Fix issue #14: Move JWT from localStorage to httpOnly cookie
Kalp Prajapati (25073034)
"""

from flask import Blueprint, request, jsonify, make_response
from flask_jwt_extended import jwt_required, unset_jwt_cookies
from models import db, User, Timetable
from utils import ok, err, current_user, user_dict, get_initials, make_token

auth_bp = Blueprint('auth', __name__)


@auth_bp.get('/api/health')
def health():
    return jsonify({'status': 'ok'})


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

    token    = make_token(user)
    response = make_response(jsonify({'user': user_dict(user), 'access_token': token}))

    # Set JWT as httpOnly cookie so JavaScript cannot access it (closes #14)
    response.set_cookie(
        'access_token_cookie',
        token,
        httponly=True,       # JS cannot read this cookie
        samesite='Lax',      # protects against CSRF
        secure=False,        # set True in production (requires HTTPS)
        max_age=7 * 24 * 60 * 60  # 7 days, matches JWT expiry
    )
    return response


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
    db.session.add(Timetable(user_id=user.id, name='My Timetable'))
    db.session.commit()

    token    = make_token(user)
    response = make_response(jsonify({'user': user_dict(user), 'access_token': token}), 201)

    # Set httpOnly cookie on register too (closes #14)
    response.set_cookie(
        'access_token_cookie',
        token,
        httponly=True,
        samesite='Lax',
        secure=False,
        max_age=7 * 24 * 60 * 60
    )
    return response


@auth_bp.post('/api/auth/logout')
def auth_logout():
    response = make_response(ok())
    # Clear the httpOnly cookie on logout (closes #14)
    response.delete_cookie('access_token_cookie')
    return response


@auth_bp.put('/api/auth/password')
@jwt_required()
def auth_password():
    user   = current_user()
    data   = request.get_json(silent=True) or {}
    new_pw = data.get('newPassword', '')
    if not user.check_password(data.get('currentPassword', '')):
        return err('Current password is incorrect', 403)
    if len(new_pw) < 8:
        return err('New password must be at least 8 characters')
    user.set_password(new_pw)
    db.session.commit()
    return ok()
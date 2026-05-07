"""
utils.py — Shared helpers for app.py and scheduling.py
"""

import json
import os
from flask import jsonify
from flask_jwt_extended import get_jwt_identity, create_access_token
from models import db, User

BASE_DIR     = os.path.dirname(os.path.abspath(__file__))
COURSES_PATH = os.path.join(BASE_DIR, 'static', 'data', 'courses.json')

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

def get_initials(name: str) -> str:
    parts = name.strip().split()
    return ''.join(p[0] for p in parts if p)[:2].upper()

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

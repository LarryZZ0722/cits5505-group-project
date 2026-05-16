"""
courses.py — Unit catalogue and custom course management

  GET    /api/courses               ?semester=S1 &faculty=CSSE &search=python
  GET    /api/courses/<code>
  GET    /api/courses/custom
  POST   /api/courses/custom
  DELETE /api/courses/custom/<code>
"""

import json as _json
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from models import db, CustomCourse
from utils import ok, err, current_user, load_courses

courses_bp = Blueprint('courses', __name__)


@courses_bp.get('/api/courses')
def get_courses():
    courses  = load_courses()
    semester = request.args.get('semester', '').strip()
    faculty  = request.args.get('faculty',  '').strip()
    search   = request.args.get('search',   '').strip().lower()

    if semester:
        courses = [c for c in courses if semester in c.get('sems', [])]
    if faculty:
        courses = [c for c in courses if c.get('faculty') == faculty]
    if search:
        courses = [c for c in courses if search in c.get('code', '').lower()
                                      or search in c.get('name', '').lower()]
    return jsonify(courses)


@courses_bp.get('/api/courses/<code>')
def get_course(code):
    course = next((c for c in load_courses() if c['code'] == code.upper()), None)
    if not course:
        return err('Course not found', 404)
    return jsonify(course)


@courses_bp.get('/api/courses/custom')
@jwt_required()
def get_custom_courses():
    user = current_user()
    return jsonify([r.to_dict() for r in CustomCourse.query.filter_by(user_id=user.id).all()])


@courses_bp.post('/api/courses/custom')
@jwt_required()
def save_custom_course():
    user = current_user()
    data = request.get_json(silent=True) or {}
    code = (data.get('code') or '').strip().upper()
    name = (data.get('name') or '').strip() or code
    if not code:
        return err('Unit code is required')
    row = CustomCourse.query.filter_by(user_id=user.id, code=code).first()
    if row:
        row.name     = name
        row.sems     = _json.dumps(data.get('sems', ['S1']))
        row.sessions = _json.dumps(data.get('sessions', []))
    else:
        db.session.add(CustomCourse(
            user_id  = user.id,
            code     = code,
            name     = name,
            sems     = _json.dumps(data.get('sems', ['S1'])),
            sessions = _json.dumps(data.get('sessions', [])),
        ))
    db.session.commit()
    return ok()


@courses_bp.delete('/api/courses/custom/<code>')
@jwt_required()
def delete_custom_course(code):
    user = current_user()
    CustomCourse.query.filter_by(user_id=user.id, code=code.upper()).delete()
    db.session.commit()
    return ok()


@courses_bp.put('/api/courses/custom/<code>')
@jwt_required()
def update_custom_course(code):
    """Update name, sems, and sessions of an existing custom unit (issue #23)."""
    user = current_user()
    data = request.get_json(silent=True) or {}
    row  = CustomCourse.query.filter_by(user_id=user.id, code=code.upper()).first()
    if not row:
        return err('Custom unit not found', 404)
    new_name = (data.get('name') or '').strip()
    if not new_name:
        return err('Unit name is required')
    # Prevent duplicate names across this user's custom units
    dup = CustomCourse.query.filter(
        CustomCourse.user_id == user.id,
        CustomCourse.name    == new_name,
        CustomCourse.code    != code.upper()
    ).first()
    if dup:
        return err(f'You already have a custom unit named "{new_name}"')
    row.name     = new_name
    row.sems     = _json.dumps(data.get('sems',     _json.loads(row.sems)))
    row.sessions = _json.dumps(data.get('sessions', _json.loads(row.sessions)))
    db.session.commit()
    return jsonify(row.to_dict())

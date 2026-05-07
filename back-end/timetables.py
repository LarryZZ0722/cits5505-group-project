"""
timetables.py — Timetable CRUD, conflict detection, and auto-scheduling

  GET    /api/timetables
  POST   /api/timetables
  GET    /api/timetables/<id>
  PUT    /api/timetables/<id>
  DELETE /api/timetables/<id>
  POST   /api/timetables/<id>/conflicts
  POST   /api/timetables/<id>/auto-schedule
"""

from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from models import db, User, Timetable, TimetableEntry, CustomCourse
from utils import ok, err, current_user, load_courses

timetables_bp = Blueprint('timetables', __name__)


# ── Pure scheduling helpers ───────────────────────────────────────────

def get_active_sessions(course: dict, alt_idx: int) -> list:
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
    avoid_8am    = prefs.get('avoid8am', False)
    compact_days = prefs.get('compactDays', False)
    free_fridays = prefs.get('freeFridays', False)
    result = [dict(e) for e in selected]

    for i, entry in enumerate(result):
        course = next((c for c in courses if c['code'] == entry['code']), None)
        if not course or not course.get('alternatives'):
            continue

        best_alt, best_score = entry.get('altIdx', 0), float('inf')

        # Days already occupied by every other unit (for compact scoring)
        other_days = set()
        if compact_days:
            for j, other in enumerate(result):
                if j == i:
                    continue
                other_course = next((c for c in courses if c['code'] == other['code']), None)
                if other_course:
                    for s in get_active_sessions(other_course, other.get('altIdx', 0)):
                        other_days.add(s['day'])

        for alt in range(len(course['alternatives']) + 1):
            test = [dict(e) for e in result]
            test[i]['altIdx'] = alt
            n_clash  = len(detect_conflicts(test, courses))
            sessions = get_active_sessions(course, alt)
            pen_8am     = 10 if avoid_8am    and any(s['hour'] == 8 for s in sessions) else 0
            pen_fri     = 10 if free_fridays and any(s['day']  == 4 for s in sessions) else 0
            pen_compact = len({s['day'] for s in sessions} - other_days) * 5 if compact_days else 0
            score = n_clash * 100 + pen_8am + pen_fri + pen_compact

            if score < best_score:
                best_score, best_alt = score, alt

        result[i]['altIdx'] = best_alt
    return result


# ── DB helpers ────────────────────────────────────────────────────────

def _replace_entries(tt: Timetable, selected: list) -> None:
    TimetableEntry.query.filter_by(timetable_id=tt.id).delete()
    for pos, item in enumerate(selected):
        db.session.add(TimetableEntry(
            timetable_id = tt.id,
            unit_code    = item['code'],
            alt_idx      = item.get('altIdx', 0),
            position     = pos,
        ))


def _get_tt(user: User, tt_id: int):
    tt = db.session.get(Timetable, tt_id)
    return tt if tt and tt.user_id == user.id else None


def _sorted(user: User) -> list:
    return sorted(user.timetables, key=lambda t: t.updated_at or datetime.min, reverse=True)


# ── Routes ────────────────────────────────────────────────────────────

@timetables_bp.get('/api/timetables')
@jwt_required()
def list_timetables():
    user = current_user()
    if not user.timetables:
        db.session.add(Timetable(user_id=user.id, name='My Timetable'))
        db.session.commit()
    return jsonify([tt.to_summary() for tt in _sorted(user)])


@timetables_bp.post('/api/timetables')
@jwt_required()
def create_timetable():
    user = current_user()
    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip() or 'New Timetable'
    tt   = Timetable(user_id=user.id, name=name, semester=data.get('semester', 'S1'))
    db.session.add(tt)
    db.session.commit()
    return jsonify(tt.to_dict()), 201


@timetables_bp.get('/api/timetables/<int:tt_id>')
@jwt_required()
def get_timetable(tt_id):
    tt = _get_tt(current_user(), tt_id)
    if not tt:
        return err('Timetable not found', 404)
    return jsonify(tt.to_dict())


@timetables_bp.put('/api/timetables/<int:tt_id>')
@jwt_required()
def update_timetable(tt_id):
    user = current_user()
    tt   = _get_tt(user, tt_id)
    if not tt:
        return err('Timetable not found', 404)
    data = request.get_json(silent=True) or {}
    if data.get('name')     is not None: tt.name      = data['name'].strip() or tt.name
    if data.get('isPublic') is not None: tt.is_public = bool(data['isPublic'])
    if data.get('semester') is not None: tt.semester  = data['semester']
    if data.get('selected') is not None: _replace_entries(tt, data['selected'])
    tt.updated_at = datetime.utcnow()
    db.session.commit()
    return ok()


@timetables_bp.delete('/api/timetables/<int:tt_id>')
@jwt_required()
def delete_timetable(tt_id):
    tt = _get_tt(current_user(), tt_id)
    if not tt:
        return err('Timetable not found', 404)
    db.session.delete(tt)
    db.session.commit()
    return ok()


@timetables_bp.post('/api/timetables/<int:tt_id>/conflicts')
@jwt_required()
def timetable_conflicts(tt_id):
    user = current_user()
    tt   = _get_tt(user, tt_id)
    if not tt:
        return err('Timetable not found', 404)
    data     = request.get_json(silent=True) or {}
    selected = data.get('selected', [e.to_dict() for e in tt.entries])
    courses  = load_courses() + [r.to_dict() for r in CustomCourse.query.filter_by(user_id=user.id).all()]
    return jsonify({'conflicts': list(detect_conflicts(selected, courses))})


@timetables_bp.post('/api/timetables/<int:tt_id>/auto-schedule')
@jwt_required()
def timetable_auto_schedule(tt_id):
    user = current_user()
    tt   = _get_tt(user, tt_id)
    if not tt:
        return err('Timetable not found', 404)
    data     = request.get_json(silent=True) or {}
    selected = data.get('selected', [e.to_dict() for e in tt.entries])
    prefs    = data.get('preferences', {})
    courses  = load_courses() + [r.to_dict() for r in CustomCourse.query.filter_by(user_id=user.id).all()]
    return jsonify({'selected': run_auto_schedule(selected, courses, prefs)})

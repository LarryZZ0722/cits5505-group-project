"""
timetables.py — Timetable CRUD, conflict detection, and auto-scheduling

  GET    /api/timetables
  POST   /api/timetables
  GET    /api/timetables/<id>
  PUT    /api/timetables/<id>
  DELETE /api/timetables/<id>
  GET    /api/timetables/<id>/export
  POST   /api/timetables/<id>/conflicts
  GET    /api/timetables/<id>/compare/<other_id>
  POST   /api/timetables/<id>/auto-schedule
"""

from datetime import datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required
from models import db, User, Timetable, TimetableEntry, CustomCourse
from utils import ok, err, current_user, load_courses

timetables_bp = Blueprint('timetables', __name__)

DAY_NAMES = {0: 'Monday', 1: 'Tuesday', 2: 'Wednesday', 3: 'Thursday', 4: 'Friday'}


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


def _fmt(hour: int) -> str:
    return f'{hour:02d}:00'


def _all_courses(user: User) -> list:
    return load_courses() + [r.to_dict() for r in CustomCourse.query.filter_by(user_id=user.id).all()]


def _course_map(courses: list) -> dict:
    return {c['code']: c for c in courses}


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


@timetables_bp.get('/api/timetables/<int:tt_id>/export')
@jwt_required()
def export_timetable(tt_id):
    user = current_user()
    tt   = _get_tt(user, tt_id)
    if not tt:
        return err('Timetable not found', 404)

    cmap = _course_map(_all_courses(user))
    rows = []
    for entry in tt.entries:
        course = cmap.get(entry.unit_code, {})
        for s in get_active_sessions(course, entry.alt_idx):
            rows.append({
                'day_int': s['day'],
                'day':     DAY_NAMES.get(s['day'], '?'),
                'hour':    s['hour'],
                'end':     s['hour'] + s['duration'],
                'type':    s.get('type', ''),
                'code':    entry.unit_code,
                'name':    course.get('name', ''),
            })

    rows.sort(key=lambda r: (r['day_int'], r['hour']))

    lines = [f"=== {tt.name} ({tt.semester}) ===", '']
    current_day = None
    for r in rows:
        if r['day'] != current_day:
            current_day = r['day']
            lines.append(f"[ {r['day']} ]")
        lines.append(f"  {_fmt(r['hour'])} - {_fmt(r['end'])}  {r['type']}  {r['code']}  {r['name']}")

    lines += ['', f"Total units: {len(tt.entries)}"]
    return jsonify({'timetable_id': tt_id, 'text': '\n'.join(lines)})


@timetables_bp.post('/api/timetables/<int:tt_id>/conflicts')
@jwt_required()
def timetable_conflicts(tt_id):
    user = current_user()
    tt   = _get_tt(user, tt_id)
    if not tt:
        return err('Timetable not found', 404)

    data     = request.get_json(silent=True) or {}
    selected = data.get('selected', [e.to_dict() for e in tt.entries])
    courses  = _all_courses(user)
    cmap     = _course_map(courses)

    # Build (day, start, end, code, type) slots for every active session
    slots = []
    for entry in selected:
        course = cmap.get(entry.get('code', ''))
        if not course:
            continue
        for s in get_active_sessions(course, entry.get('altIdx', 0)):
            slots.append({
                'code':  entry['code'],
                'name':  course.get('name', ''),
                'type':  s.get('type', ''),
                'day':   s['day'],
                'start': s['hour'],
                'end':   s['hour'] + s['duration'],
            })

    conflicts = []
    seen = set()
    for i in range(len(slots)):
        for j in range(i + 1, len(slots)):
            a, b = slots[i], slots[j]
            if a['day'] == b['day'] and a['start'] < b['end'] and b['start'] < a['end']:
                key = tuple(sorted([
                    (a['code'], a['type'], a['day'], a['start']),
                    (b['code'], b['type'], b['day'], b['start']),
                ]))
                if key in seen:
                    continue
                seen.add(key)
                conflicts.append({
                    'day':    DAY_NAMES.get(a['day']),
                    'unit_a': {'code': a['code'], 'name': a['name'], 'type': a['type'],
                               'start': _fmt(a['start']), 'end': _fmt(a['end'])},
                    'unit_b': {'code': b['code'], 'name': b['name'], 'type': b['type'],
                               'start': _fmt(b['start']), 'end': _fmt(b['end'])},
                    'detail': (f"{DAY_NAMES.get(a['day'])}: "
                               f"{a['code']} {a['type']} ({_fmt(a['start'])}–{_fmt(a['end'])}) "
                               f"overlaps {b['code']} {b['type']} ({_fmt(b['start'])}–{_fmt(b['end'])})"),
                })

    return jsonify({'conflict_count': len(conflicts), 'conflicts': conflicts})


@timetables_bp.get('/api/timetables/<int:tt_id>/compare/<int:other_id>')
@jwt_required()
def compare_timetables(tt_id, other_id):
    user = current_user()
    tt_a = _get_tt(user, tt_id)
    tt_b = _get_tt(user, other_id)
    if not tt_a:
        return err(f'Timetable {tt_id} not found', 404)
    if not tt_b:
        return err(f'Timetable {other_id} not found', 404)

    courses = _all_courses(user)
    cmap    = _course_map(courses)

    codes_a = {e.unit_code for e in tt_a.entries}
    codes_b = {e.unit_code for e in tt_b.entries}

    def _entry_info(e):
        return {'code': e.unit_code, 'name': cmap.get(e.unit_code, {}).get('name', ''), 'altIdx': e.alt_idx}

    only_in_a = [_entry_info(e) for e in tt_a.entries if e.unit_code not in codes_b]
    only_in_b = [_entry_info(e) for e in tt_b.entries if e.unit_code not in codes_a]
    in_both   = [_entry_info(e) for e in tt_a.entries if e.unit_code in codes_b]

    cross_conflicts = []
    for ea in tt_a.entries:
        ca = cmap.get(ea.unit_code, {})
        for eb in tt_b.entries:
            if ea.unit_code == eb.unit_code:
                continue
            cb = cmap.get(eb.unit_code, {})
            for sa in get_active_sessions(ca, ea.alt_idx):
                for sb in get_active_sessions(cb, eb.alt_idx):
                    if sa['day'] == sb['day'] and sa['hour'] < sb['hour'] + sb['duration'] and sb['hour'] < sa['hour'] + sa['duration']:
                        cross_conflicts.append({
                            'day':    DAY_NAMES.get(sa['day']),
                            'from_a': {'code': ea.unit_code, 'type': sa.get('type'),
                                       'start': _fmt(sa['hour']), 'end': _fmt(sa['hour'] + sa['duration'])},
                            'from_b': {'code': eb.unit_code, 'type': sb.get('type'),
                                       'start': _fmt(sb['hour']), 'end': _fmt(sb['hour'] + sb['duration'])},
                        })

    return jsonify({
        'timetable_a':     {'id': tt_id,    'name': tt_a.name},
        'timetable_b':     {'id': other_id, 'name': tt_b.name},
        'only_in_a':       only_in_a,
        'only_in_b':       only_in_b,
        'in_both':         in_both,
        'cross_conflicts': cross_conflicts,
    })


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
    courses  = _all_courses(user)
    return jsonify({'selected': run_auto_schedule(selected, courses, prefs)})

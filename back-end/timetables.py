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
    """
    Auto-scheduler with weighted, priority-ranked preferences (issue #24).

    New preferences format
    ──────────────────────
    earliestStart       int  (8–12)  — no sessions before this hour
    maxConsecutiveHours int  (1–6)   — cap on back-to-back class hours per day
    targetDaysOff       list[str]    — e.g. ["Friday", "Monday"]
    compactDays         bool         — prefer sessions on already-used days
    priorities          list[str]    — ordered from most to least important:
                                       ["targetDaysOff","earliestStart",
                                        "maxConsecutive","compactDays"]

    Backward-compatible with old format
    ─────────────────────────────────────
    avoid8am    bool → treated as earliestStart = 9
    freeFridays bool → treated as targetDaysOff = ["Friday"]
    """
    # ── Parse preferences (new + legacy) ─────────────────────────────────────
    earliest_start = prefs.get('earliestStart',
                               9 if prefs.get('avoid8am') else 8)

    max_consecutive = int(prefs.get('maxConsecutiveHours', 6))
    compact_days    = bool(prefs.get('compactDays', False))

    _DAY_TO_INT = {
        'Monday': 0, 'Mon': 0, 'Tuesday': 1, 'Tue': 1,
        'Wednesday': 2, 'Wed': 2, 'Thursday': 3, 'Thu': 3,
        'Friday': 4, 'Fri': 4,
    }
    raw_days_off   = list(prefs.get('targetDaysOff', []))
    if prefs.get('freeFridays') and 'Friday' not in raw_days_off and 'Fri' not in raw_days_off:
        raw_days_off.append('Friday')
    target_days_off = {_DAY_TO_INT[d] for d in raw_days_off if d in _DAY_TO_INT}

    # ── Priority weights (rank 0 = most important → highest multiplier) ───────
    PREF_KEYS       = ['targetDaysOff', 'earliestStart', 'maxConsecutive', 'compactDays']
    user_priorities = prefs.get('priorities', PREF_KEYS)

    def _weight(key: str) -> int:
        try:
            rank = user_priorities.index(key)
        except ValueError:
            rank = len(PREF_KEYS) - 1
        # rank 0 → weight 8, rank 1 → 4, rank 2 → 2, rank 3 → 1
        return 2 ** (len(PREF_KEYS) - 1 - rank)

    w_days_off  = _weight('targetDaysOff')
    w_earliest  = _weight('earliestStart')
    w_consec    = _weight('maxConsecutive')
    w_compact   = _weight('compactDays')

    # ── Per-day consecutive-hours penalty ─────────────────────────────────────
    def _consecutive_penalty(all_sessions: list) -> float:
        """Return total penalty for exceeding max_consecutive on any day."""
        by_day: dict = {}
        for s in all_sessions:
            by_day.setdefault(s['day'], []).append(s)
        penalty = 0.0
        for day_sess in by_day.values():
            sorted_s  = sorted(day_sess, key=lambda x: x['hour'])
            cur_end   = 0
            cur_block = 0
            for s in sorted_s:
                if s['hour'] <= cur_end:          # adjacent / overlapping
                    cur_block += s['hour'] + s['duration'] - cur_end
                    cur_end    = s['hour'] + s['duration']
                else:                             # gap → reset
                    cur_block  = s['duration']
                    cur_end    = s['hour'] + s['duration']
                if cur_block > max_consecutive:
                    penalty += (cur_block - max_consecutive) * 3
        return penalty

    # ── Scoring function ──────────────────────────────────────────────────────
    def score(entry_index: int, alt: int, current: list) -> float:
        test = [dict(e) for e in current]
        test[entry_index]['altIdx'] = alt

        course = next((c for c in courses if c['code'] == test[entry_index]['code']), None)
        if not course:
            return float('inf')
        sessions = get_active_sessions(course, alt)

        # 1. Conflict count (absolute priority — always dominates)
        n_clash = len(detect_conflicts(test, courses))

        # 2. Earliest-start penalty: proportional to how early the session is
        pen_earliest = sum(max(0, earliest_start - s['hour']) * 4
                           for s in sessions if s['hour'] < earliest_start)

        # 3. Target-days-off penalty
        pen_days_off = sum(5 for s in sessions if s['day'] in target_days_off)

        # 4. Consecutive-hours penalty (whole schedule after applying this alt)
        all_sessions: list = []
        for j, entry in enumerate(test):
            c = next((x for x in courses if x['code'] == entry['code']), None)
            if c:
                all_sessions.extend(get_active_sessions(c, entry.get('altIdx', 0)))
        pen_consec = _consecutive_penalty(all_sessions)

        # 5. Compact-days penalty
        if compact_days:
            other_days: set = set()
            for j, other in enumerate(current):
                if j == entry_index:
                    continue
                oc = next((c for c in courses if c['code'] == other['code']), None)
                if oc:
                    for s in get_active_sessions(oc, other.get('altIdx', 0)):
                        other_days.add(s['day'])
            pen_compact = len({s['day'] for s in sessions} - other_days) * 2
        else:
            pen_compact = 0

        # Weighted sum of soft penalties (conflict penalty is hard and always wins)
        soft = (w_days_off * pen_days_off +
                w_earliest * pen_earliest +
                w_consec   * pen_consec   +
                w_compact  * pen_compact)

        return n_clash * 10_000 + soft

    # ── Multi-pass optimisation ────────────────────────────────────────────────
    result = [dict(e) for e in selected]

    for _ in range(10):
        improved = False
        for i, entry in enumerate(result):
            course = next((c for c in courses if c['code'] == entry['code']), None)
            if not course:
                continue

            num_alts   = len(course.get('alternatives', []))
            best_alt   = entry.get('altIdx', 0)
            best_score = score(i, best_alt, result)

            for alt in range(num_alts + 1):
                s = score(i, alt, result)
                if s < best_score:
                    best_score = s
                    best_alt   = alt

            if best_alt != result[i].get('altIdx', 0):
                result[i]['altIdx'] = best_alt
                improved            = True

        if not improved:
            break

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

"""
stats.py — Timetable statistics

  GET /api/timetables/<id>/stats
"""

from collections import defaultdict
from flask import Blueprint, jsonify
from models import Timetable, CustomCourse
from utils import err, current_user, load_courses
from flask_jwt_extended import jwt_required
from timetables import get_active_sessions, DAY_NAMES, _get_tt, _all_courses, _course_map, _fmt

stats_bp = Blueprint('stats', __name__)


@stats_bp.get('/api/timetables/<int:tt_id>/stats')
@jwt_required()
def timetable_stats(tt_id):
    user = current_user()
    tt   = _get_tt(user, tt_id)
    if not tt:
        return err('Timetable not found', 404)

    if not tt.entries:
        return jsonify({'timetable_id': tt_id, 'timetable_name': tt.name, 'message': 'No units added yet.'})

    cmap     = _course_map(_all_courses(user))
    daily    = defaultdict(float)
    starts   = []
    ends     = []
    total_cp = 0

    for entry in tt.entries:
        course    = cmap.get(entry.unit_code, {})
        total_cp += course.get('cp', 0)
        for s in get_active_sessions(course, entry.alt_idx):
            day_name = DAY_NAMES.get(s['day'], 'Unknown')
            daily[day_name] += s['duration']
            starts.append(s['hour'])
            ends.append(s['hour'] + s['duration'])

    sorted_daily = {
        DAY_NAMES[i]: round(daily[DAY_NAMES[i]], 1)
        for i in range(5) if DAY_NAMES[i] in daily
    }

    busiest = max(daily, key=daily.get) if daily else None

    return jsonify({
        'timetable_id':    tt_id,
        'timetable_name':  tt.name,
        'semester':        tt.semester,
        'total_units':     len(tt.entries),
        'total_cp':        total_cp,
        'days_with_class': list(sorted_daily.keys()),
        'daily_hours':     sorted_daily,
        'busiest_day':     {'day': busiest, 'hours': round(daily[busiest], 1)} if busiest else None,
        'earliest_start':  _fmt(min(starts)) if starts else None,
        'latest_end':      _fmt(max(ends))   if ends   else None,
    })

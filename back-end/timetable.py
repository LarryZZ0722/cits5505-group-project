# timetable.py - Timetable endpoints
# Zicheng Zeng(24728085)
# Handles :GET /api/timetable, POST /api/timetable
#          POST /api/timetable/conflicts, POST /api/timetable/auto-schedule

import json
import os
from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, get_jwt_identity
from models import db, Timetable, TimetableEntry, User
from courses import load_courses

timetable_bp = Blueprint('timetable', __name__)

def current_user():
    user_id = get_jwt_identity()
    return db.session.get(User, int(user_id))

def ensure_timetable(user):
    if not user.timetable:
        tt = Timetable(user_id=user.id)
        db.session.add(tt)
        db.session.commit()
        return tt
    return user.timetable

def replace_entries(tt, selected):
    TimetableEntry.query.filter_by(timetable_id = tt.id).delete()
    for pos, item in enumerate(selected):
        db.session.add(TimetableEntry(
            timetable_id = tt.id,
            unit_code = item['code'],
            alt_idx = item.get('altIdx', 0),
            position = pos, # make sure the order of entries is the same as selected list (for auto-schedule
        ))

def detect_conflicts(selected, courses):
    slots = []
    for entry in selected:
        for course in courses:
            if entry['code'] == course['code']:
                for s in course['sessions']:
                    slots.append((s['day'],s['hour'],s['hour']+s['duration'], entry['code']))
    conflicts = set()
    for i in range(len(slots)):
        for j in range(i+1, len(slots)):
            a = slots[i]
            b = slots[j]
            if a[0] == b[0] and a[2] > b[1]:
                conflicts.add(a[3])
                conflicts.add(b[3])
    return conflicts

def run_auto_schedule(selected, courses, prefs):
    avoid_8am = prefs.get('avoid8am', False)
    free_fridays = prefs.get('freeFridays', False)
    compact_days = prefs.get('compactDays', False)

    result = []
    for entry in selected:
        for course in courses:
            if entry['code'] == course['code']:
                best_alt = 0
                best_score = float('inf')

                for alt in range(len(course.get('alternatives',[])) + 1):
                    if alt == 0:
                        sessions = course['sessions']
                    else:
                        sessions = course['alternatives'][alt - 1]

                    score = 0

                    test = result + [{'code': entry['code'], 'altIdx': alt}]
                    if entry['code'] in detect_conflicts(test,courses):
                        score += 100
                    for s in sessions:
                        if avoid_8am and s['hour'] == 8:
                            score += 10
                        if free_fridays and s['day'] == 4:
                            score += 10
                    
                    if compact_days:
                        days = []
                        for s in sessions:
                            if s['day'] not in days:
                                days.append(s['day'])
                        score += len(days)
                    if score < best_score:
                        best_score = score
                        best_alt = alt
                result.append({'code': entry['code'], 'altIdx': best_alt})
    return result


@timetable_bp.route('/api/timetable', methods=['GET'])
@jwt_required()
def get_timetable():
    user = current_user()
    tt = ensure_timetable(user) # helper function ensures timetable exists for user
    return jsonify(tt.to_dict())

@timetable_bp.route('/api/timetable', methods=['POST'])
@jwt_required()
def save_timetable():
    user = current_user()
    tt = ensure_timetable(user)
    data = request.get_json(silent=True) or {}
    if data.get('selected') is not None:
        replace_entries(tt, data['selected'])
    if data.get('name') is not None :
        tt.name = data['name']
    if data.get('semester') is not None:
        tt.semester = data['semester']
    if data.get('isPublic') is not None:
        tt.is_Public = bool(data['isPuplic'])
    db.session.commit()
    return jsonify({'ok':True})

@timetable_bp.route('/api/timetable/conflicts', methods=['POST'])
@jwt_required()
def timetable_conflicts():
    data = request.get_json(silent=True) or {}
    selected = data.get('selected', [])
    return jsonify({'conflicts':list(detect_conflicts(selected, load_courses()))})

    

@timetable_bp.route('/api/timetable/auto-schedule', methods=['POST'])
@jwt_required()
def timetable_auto_schedule():
    data = request.get_json(silent=True) or {}
    selected = data.get('selected', [])
    preferences = data.get('preferences', {})
    result = run_auto_schedule(selected, load_courses(), preferences)
    return jsonify({'selected':result})




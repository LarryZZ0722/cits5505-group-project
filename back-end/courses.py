# courses.py - Courses endpoints
# Zicheng  Zeng (24728085)
# Handles: GET /api/courses, GET /api/courses/<code>

import json
import os
from flask import Blueprint, jsonify


courses_bp = Blueprint('courses', __name__)

COURSES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'front-end', 'data', 'courses.json')

_courses_cache = None

def load_courses():
    global _courses_cache
    if _courses_cache == None:
        with open(COURSES_PATH,encoding = 'utf-8') as f:
            _courses_cache = json.load(f)
    return _courses_cache

def err(msg,status=400):
    return jsonify({'message':msg}), status

@courses_bp.route('/api/courses', methods=['GET'])
def get_courses():
    return jsonify(load_courses())

@courses_bp.route('/api/courses/<code>', methods=['GET'])
def get_course(code):
    for i in load_courses():  # _courses_cache is None if load_courses() is not called. It show the importance of load_courses()
        if i['code'] == code.upper():
            return jsonify(i)
    return err('Course not found', 404)
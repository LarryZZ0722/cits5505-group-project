"""
pages.py — Jinja-rendered page routes

  GET  /           → index.html
  GET  /auth       → auth.html
  GET  /courses    → courses.html
  GET  /schedule   → schedule.html
  GET  /friends    → friends.html
  GET  /profile    → profile.html
"""

from flask import Blueprint, render_template

pages_bp = Blueprint('pages', __name__)


@pages_bp.get('/')
def index():
    return render_template('index.html')


@pages_bp.get('/auth')
def auth():
    return render_template('auth.html')


@pages_bp.get('/courses')
def courses():
    return render_template('courses.html')


@pages_bp.get('/schedule')
def schedule():
    return render_template('schedule.html')


@pages_bp.get('/friends')
def friends():
    return render_template('friends.html')


@pages_bp.get('/profile')
def profile():
    return render_template('profile.html')

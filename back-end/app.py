"""
app.py — UWA Planner Flask application entry point

Blueprints
  auth.py       →  /api/health  /api/auth/*
  users.py      →  /api/profile  /api/users/*
  timetables.py →  /api/timetables/*
  friends.py    →  /api/friends/*
  courses.py    →  /api/courses/*
  pages.py      →  /  /auth  /schedule  /courses  /friends  /profile

Other modules
  models.py  — SQLAlchemy models (User, Timetable, Friendship, …)
  utils.py   — Shared helpers (current_user, ok, err, load_courses, …)
  seed.py    — Demo data, runs automatically on every startup

Start the server
    cd back-end
    python app.py          # also seeds the database
"""

import os
from datetime import timedelta
from flask import Flask, request, make_response, jsonify
from flask_jwt_extended import JWTManager
from flask_wtf.csrf import CSRFProtect, CSRFError
from models import db, User, Friendship
from utils import err
from auth import auth_bp
from users import users_bp
from timetables import timetables_bp
from friends import friends_bp
from courses import courses_bp
from pages import pages_bp
from seed import seed

# ── App & config ──────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = Flask(__name__)  # templates/ and static/ live inside back-end/ by convention
app.config.update(
    SECRET_KEY                     = os.environ.get('SECRET_KEY', 'dev-secret-change-in-production'),
    SQLALCHEMY_DATABASE_URI        = f'sqlite:///{os.path.join(BASE_DIR, "planner.db")}',
    SQLALCHEMY_TRACK_MODIFICATIONS = False,
    JWT_SECRET_KEY                 = os.environ.get('JWT_SECRET_KEY', 'jwt-secret-key-change-in-production'),
    JWT_ACCESS_TOKEN_EXPIRES       = timedelta(days=7),
    WTF_CSRF_TIME_LIMIT            = None,
)

db.init_app(app)
jwt = JWTManager(app)
csrf = CSRFProtect(app)
app.register_blueprint(auth_bp)
app.register_blueprint(users_bp)
app.register_blueprint(timetables_bp)
app.register_blueprint(friends_bp)
app.register_blueprint(courses_bp)
app.register_blueprint(pages_bp)

# ── CSRF ──────────────────────────────────────────────────────────────
_CSRF_EXEMPT = ('/api/auth/login', '/api/auth/register', '/api/health')

@app.before_request
def check_csrf():
    if request.method not in ('POST', 'PUT', 'PATCH', 'DELETE'):
        return
    if any(request.path.startswith(p) for p in _CSRF_EXEMPT):
        return
    from flask_wtf.csrf import validate_csrf
    try:
        validate_csrf(request.headers.get('X-CSRF-Token', ''))
    except Exception:
        return err('CSRF validation failed', 400)

@app.errorhandler(CSRFError)
def csrf_error(_):
    return err('CSRF validation failed', 400)

# ── CORS ──────────────────────────────────────────────────────────────
_ALLOWED_ORIGINS = {
    'http://localhost:5500', 'http://127.0.0.1:5500',
    'http://localhost:3000', 'http://127.0.0.1:3000',
    'http://localhost:8080', 'http://127.0.0.1:8080',
}

@app.before_request
def handle_preflight():
    if request.method == 'OPTIONS':
        return make_response('', 204)

@app.after_request
def add_cors(response):
    origin = request.headers.get('Origin', '')
    if origin in _ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin']      = origin
        response.headers['Access-Control-Allow-Credentials'] = 'true'
        response.headers['Access-Control-Allow-Headers']     = 'Content-Type, Authorization'
        response.headers['Access-Control-Allow-Methods']     = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Max-Age']           = '86400'
        response.headers['Access-Control-Expose-Headers']    = 'Authorization'
    return response

# ── Error handlers ────────────────────────────────────────────────────
@app.errorhandler(404)
def not_found(_):
    return err('Not found', 404)

@app.errorhandler(405)
def method_not_allowed(_):
    return err('Method not allowed', 405)

@app.errorhandler(500)
def internal_error(e):
    db.session.rollback()
    app.logger.error(str(e))
    return err('Internal server error', 500)

@jwt.unauthorized_loader
def missing_token(_):
    return err('Not authenticated', 401)

@jwt.invalid_token_loader
def invalid_token(_):
    return err('Invalid token', 401)

@jwt.expired_token_loader
def expired_token(*_):
    return err('Token expired — please log in again', 401)

@app.get('/api/debug/seed')
def debug_seed():
    rows = []
    for u in User.query.all():
        for tt in u.timetables:
            rows.append({'user': u.name, 'tt': tt.name, 'public': tt.is_public})
    fs = [{'user': f.user_id, 'friend': f.friend_id} for f in Friendship.query.all()]
    return jsonify({'timetables': rows, 'friendships': fs})

# ── Startup ───────────────────────────────────────────────────────────
with app.app_context():
    db.create_all()
    seed()
    print('[ok] Database ready')
    print('[ok] Demo users seeded  (password: demo1234)')

if __name__ == '__main__':
    print('[ok] Running on http://localhost:5000')
    app.run(debug=True, port=5000)

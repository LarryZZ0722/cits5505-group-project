"""
limiter.py — Shared Flask-Limiter instance

Initialised here to avoid circular imports between app.py and the blueprints.
Call limiter.init_app(app) in app.py after creating the Flask application.
"""

from flask import request
from flask_jwt_extended import get_jwt_identity
from flask_limiter import Limiter


def _rate_limit_key():
    """Rate-limit by authenticated user ID; fall back to remote IP."""
    identity = get_jwt_identity()
    return str(identity) if identity else request.remote_addr


limiter = Limiter(key_func=_rate_limit_key, default_limits=[])

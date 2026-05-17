"""
limiter.py — Shared Flask-Limiter instance (closes #35)
Kalp Prajapati (25073034)
"""

from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
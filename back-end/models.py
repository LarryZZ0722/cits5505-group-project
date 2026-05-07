"""
models.py — SQLite database models (Flask-SQLAlchemy)

Tables
------
users            — student accounts
timetables       — one timetable per user
timetable_entries — units inside a timetable (with altIdx)
friendships      — accepted friend pairs (bidirectional)
friend_requests  — pending / declined requests
"""

import json
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


# ── User ──────────────────────────────────────────────────────────────
class User(db.Model):
    __tablename__ = 'users'

    id             = db.Column(db.Integer,     primary_key=True)
    name           = db.Column(db.String(100), nullable=False)
    initials       = db.Column(db.String(4),   nullable=False)
    email          = db.Column(db.String(120), unique=True, nullable=False)
    student_number = db.Column(db.String(8),   unique=True, nullable=False)
    password_hash  = db.Column(db.String(256), nullable=False)
    created_at     = db.Column(db.DateTime,    default=datetime.utcnow)

    # one-to-many timetables
    timetables = db.relationship(
        'Timetable', back_populates='user',
        cascade='all, delete-orphan'
    )
    # friend requests sent / received
    sent_requests = db.relationship(
        'FriendRequest', foreign_keys='FriendRequest.sender_id',
        back_populates='sender', cascade='all, delete-orphan'
    )
    recv_requests = db.relationship(
        'FriendRequest', foreign_keys='FriendRequest.recipient_id',
        back_populates='recipient', cascade='all, delete-orphan'
    )
    # friendships (this user's side)
    friendships = db.relationship(
        'Friendship', foreign_keys='Friendship.user_id',
        back_populates='user', cascade='all, delete-orphan'
    )

    # ── helpers ──
    def set_password(self, password: str) -> None:
        self.password_hash = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password_hash, password)

    def to_dict(self) -> dict:
        return {
            'id':            self.id,
            'name':          self.name,
            'initials':      self.initials,
            'email':         self.email,
            'studentNumber': self.student_number,
        }


# ── Timetable ─────────────────────────────────────────────────────────
class Timetable(db.Model):
    __tablename__ = 'timetables'

    id         = db.Column(db.Integer,    primary_key=True)
    user_id    = db.Column(db.Integer,    db.ForeignKey('users.id'), nullable=False)
    name       = db.Column(db.String(100), default='My Timetable')
    semester   = db.Column(db.String(4),   default='S1')   # S1 | S2 | SUM
    is_public  = db.Column(db.Boolean,     default=False)
    updated_at = db.Column(db.DateTime,    default=datetime.utcnow, onupdate=datetime.utcnow)

    user    = db.relationship('User', back_populates='timetables')
    entries = db.relationship(
        'TimetableEntry', back_populates='timetable',
        cascade='all, delete-orphan',
        order_by='TimetableEntry.position'
    )

    def to_summary(self) -> dict:
        return {
            'id':        self.id,
            'name':      self.name,
            'semester':  self.semester,
            'isPublic':  self.is_public,
            'updatedAt': self.updated_at.isoformat() + 'Z' if self.updated_at else None,
        }

    def to_dict(self) -> dict:
        return {
            'id':        self.id,
            'userId':    self.user_id,
            'name':      self.name,
            'semester':  self.semester,
            'isPublic':  self.is_public,
            'selected':  [e.to_dict() for e in self.entries],
            'updatedAt': self.updated_at.isoformat() + 'Z' if self.updated_at else None,
        }


# ── TimetableEntry ────────────────────────────────────────────────────
class TimetableEntry(db.Model):
    __tablename__ = 'timetable_entries'

    id           = db.Column(db.Integer, primary_key=True)
    timetable_id = db.Column(db.Integer, db.ForeignKey('timetables.id'), nullable=False)
    unit_code    = db.Column(db.String(12), nullable=False)
    alt_idx      = db.Column(db.Integer,    default=0)  # 0 = default slot
    position     = db.Column(db.Integer,    default=0)  # display order

    timetable = db.relationship('Timetable', back_populates='entries')

    def to_dict(self) -> dict:
        return {'code': self.unit_code, 'altIdx': self.alt_idx}


# ── Friendship ────────────────────────────────────────────────────────
# Stored as two rows (A→B and B→A) so queries stay simple.
class Friendship(db.Model):
    __tablename__ = 'friendships'

    id         = db.Column(db.Integer, primary_key=True)
    user_id    = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    friend_id  = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('user_id', 'friend_id', name='uq_friendship'),
    )

    user   = db.relationship('User', foreign_keys=[user_id],   back_populates='friendships')
    friend = db.relationship('User', foreign_keys=[friend_id])

    @staticmethod
    def make(user_id: int, friend_id: int):
        """Create both directions of a friendship atomically."""
        return [
            Friendship(user_id=user_id,   friend_id=friend_id),
            Friendship(user_id=friend_id, friend_id=user_id),
        ]


# ── CustomCourse ──────────────────────────────────────────────────────
class CustomCourse(db.Model):
    __tablename__ = 'custom_courses'

    id       = db.Column(db.Integer,     primary_key=True)
    user_id  = db.Column(db.Integer,     db.ForeignKey('users.id'), nullable=False)
    code     = db.Column(db.String(20),  nullable=False)
    name     = db.Column(db.String(200), nullable=False)
    cp       = db.Column(db.Integer,     default=0)
    sems     = db.Column(db.Text,        nullable=False, default='["S1"]')
    sessions = db.Column(db.Text,        nullable=False, default='[]')

    __table_args__ = (
        db.UniqueConstraint('user_id', 'code', name='uq_user_custom_course'),
    )

    def to_dict(self) -> dict:
        return {
            'code':         self.code,
            'name':         self.name,
            'cp':           self.cp,
            'faculty':      'Custom',
            'sems':         json.loads(self.sems),
            'sessions':     json.loads(self.sessions),
            'alternatives': [],
            'custom':       True,
        }


# ── FriendRequest ─────────────────────────────────────────────────────
class FriendRequest(db.Model):
    __tablename__ = 'friend_requests'

    id           = db.Column(db.Integer, primary_key=True)
    sender_id    = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    recipient_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    sent_at      = db.Column(db.DateTime, default=datetime.utcnow)

    __table_args__ = (
        db.UniqueConstraint('sender_id', 'recipient_id', name='uq_friend_request'),
    )

    sender    = db.relationship('User', foreign_keys=[sender_id],    back_populates='sent_requests')
    recipient = db.relationship('User', foreign_keys=[recipient_id], back_populates='recv_requests')

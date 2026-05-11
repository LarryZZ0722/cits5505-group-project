"""
seed.py — Demo data for development
"""

import json as _json
from models import db, User, Timetable, TimetableEntry, Friendship, FriendRequest, CustomCourse
from utils import get_initials

DEMO_USERS = [
    ('Hung Nguyen',  '21000001', 'demo1234'),
    ('Alex Smith',   '21234567', 'demo1234'),
    ('Jordan Lee',   '21345678', 'demo1234'),
    ('Riley Morgan', '21456789', 'demo1234'),
    ('Casey Park',   '21567890', 'demo1234'),
    ('Sam Chen',     '21111111', 'demo1234'),
]


def _add_tt(user, name, semester, is_public, units):
    """Create or update a timetable (always syncs is_public)."""
    existing = next((t for t in user.timetables if t.name == name), None)
    if existing:
        existing.is_public = is_public
        return
    tt = Timetable(user_id=user.id, name=name, semester=semester, is_public=is_public)
    db.session.add(tt)
    db.session.flush()
    for pos, (code, alt) in enumerate(units):
        db.session.add(TimetableEntry(timetable_id=tt.id, unit_code=code, alt_idx=alt, position=pos))


def _add_friendship(a, b):
    """Add each direction of a friendship only if it does not already exist."""
    for uid, fid in [(a.id, b.id), (b.id, a.id)]:
        if not Friendship.query.filter_by(user_id=uid, friend_id=fid).first():
            db.session.add(Friendship(user_id=uid, friend_id=fid))


def _add_request(sender, recipient):
    """Add friend request only if not already friends and not already requested."""
    if Friendship.query.filter_by(user_id=sender.id, friend_id=recipient.id).first():
        return
    if not FriendRequest.query.filter_by(sender_id=sender.id, recipient_id=recipient.id).first():
        db.session.add(FriendRequest(sender_id=sender.id, recipient_id=recipient.id))


def seed():
    # ── 1. Users ──────────────────────────────────────────────────────
    for name, sn, pw in DEMO_USERS:
        if not User.query.filter_by(student_number=sn).first():
            u = User(name=name, initials=get_initials(name),
                     email=f'{sn}@student.uwa.edu.au', student_number=sn)
            u.set_password(pw)
            db.session.add(u)
    db.session.flush()

    hung   = User.query.filter_by(student_number='21000001').first()
    alex   = User.query.filter_by(student_number='21234567').first()
    jordan = User.query.filter_by(student_number='21345678').first()
    riley  = User.query.filter_by(student_number='21456789').first()
    casey  = User.query.filter_by(student_number='21567890').first()
    sam    = User.query.filter_by(student_number='21111111').first()

    # ── 2. Timetables ─────────────────────────────────────────────────
    # Hung — public S1 + private S2
    _add_tt(hung, 'Semester 1 Plan', 'S1', True, [
        ('CITS1401', 0), ('CITS1003', 0), ('MATH1001', 0),
    ])
    _add_tt(hung, 'Semester 2 Plan', 'S2', False, [
        ('CITS1402', 0), ('CITS2401', 0),
    ])

    # Alex — private default + public CS focus
    _add_tt(alex, 'My Timetable', 'S1', False, [
        ('CITS1401', 0), ('CITS1402', 0),
    ])
    _add_tt(alex, 'CS Focus', 'S1', True, [
        ('CITS2200', 0), ('CITS3002', 0), ('CITS3003', 0),
    ])

    # Jordan — two public timetables (S1 and S2)
    _add_tt(jordan, 'My Timetable', 'S2', True, [
        ('CITS3001', 0), ('CITS3007', 0), ('CITS3200', 0),
    ])
    _add_tt(jordan, 'S1 Plan', 'S1', True, [
        ('CITS2200', 0), ('CITS2401', 0), ('MATH1002', 0),
    ])

    # Sam — two private timetables (friend of Hung, but nothing visible)
    _add_tt(sam, 'My Timetable', 'S1', False, [
        ('CITS1401', 0), ('CITS3003', 0),
    ])
    _add_tt(sam, 'Backup Plan', 'S2', False, [
        ('CITS2200', 0),
    ])

    # Riley and Casey — empty default timetables
    for u in (riley, casey):
        if not u.timetables:
            db.session.add(Timetable(user_id=u.id, name='My Timetable'))

    db.session.flush()

    # ── 3. Custom course for Hung ──────────────────────────────────────
    if not CustomCourse.query.filter_by(user_id=hung.id, code='PROJ9999').first():
        db.session.add(CustomCourse(
            user_id  = hung.id,
            code     = 'PROJ9999',
            name     = 'Research Project',
            sems     = _json.dumps(['S1', 'S2']),
            sessions = _json.dumps([{'type': 'LEC', 'day': 2, 'hour': 14, 'duration': 2}]),
        ))

    # ── 4. Friendships ────────────────────────────────────────────────
    _add_friendship(hung, alex)    # Alex has 1 public timetable
    _add_friendship(hung, jordan)  # Jordan has 2 public timetables
    _add_friendship(hung, sam)     # Sam has 0 public timetables

    db.session.flush()

    # ── 5. Friend requests ────────────────────────────────────────────
    _add_request(riley, hung)   # incoming: Hung can accept or decline
    _add_request(hung, casey)   # outgoing: Hung can cancel

    db.session.commit()

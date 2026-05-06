"""
test_models.py — unit tests for SQLAlchemy models and utility helpers

All DB-backed tests push an explicit app context so SQLAlchemy can bind to
the in-memory test database created in conftest.py.
"""

import pytest
from models import User, Timetable, TimetableEntry, Friendship
from utils import get_initials


# ── User model ────────────────────────────────────────────────────────────────

class TestUserPassword:
    def test_correct_password_accepted(self):
        u = User(name='Test User', initials='TU',
                 email='test@student.uwa.edu.au', student_number='20000001')
        u.set_password('securepass')
        assert u.check_password('securepass') is True

    def test_wrong_password_rejected(self):
        u = User(name='Test User', initials='TU',
                 email='test@student.uwa.edu.au', student_number='20000001')
        u.set_password('securepass')
        assert u.check_password('wrongpass') is False

    def test_hash_is_not_plaintext(self):
        u = User(name='Test User', initials='TU',
                 email='test@student.uwa.edu.au', student_number='20000001')
        u.set_password('mysecret')
        assert u.password_hash != 'mysecret'
        assert len(u.password_hash) > 20

    def test_to_dict_keys(self, app):
        with app.app_context():
            u = User.query.filter_by(student_number='21000001').first()
            d = u.to_dict()
        assert set(d.keys()) == {'id', 'name', 'initials', 'email', 'studentNumber'}
        assert d['studentNumber'] == '21000001'


# ── get_initials helper ───────────────────────────────────────────────────────

class TestGetInitials:
    def test_two_words(self):
        assert get_initials('John Doe') == 'JD'

    def test_one_word(self):
        assert get_initials('Madonna') == 'M'

    def test_three_words_capped_at_two(self):
        assert get_initials('Mary Jane Watson') == 'MJ'

    def test_uppercase_output(self):
        assert get_initials('alice bob') == 'AB'

    def test_extra_whitespace(self):
        assert get_initials('  Jane   Smith  ') == 'JS'


# ── Friendship model ──────────────────────────────────────────────────────────

class TestFriendship:
    def test_make_returns_two_rows(self):
        rows = Friendship.make(1, 2)
        assert len(rows) == 2

    def test_make_is_bidirectional(self):
        rows = Friendship.make(3, 7)
        pairs = {(r.user_id, r.friend_id) for r in rows}
        assert (3, 7) in pairs
        assert (7, 3) in pairs


# ── Timetable model ───────────────────────────────────────────────────────────

class TestTimetable:
    def test_to_summary_keys(self, app):
        with app.app_context():
            tt = Timetable.query.first()
            summary = tt.to_summary()
        assert set(summary.keys()) == {'id', 'name', 'semester', 'isPublic', 'updatedAt'}

    def test_to_dict_has_selected_list(self, app):
        with app.app_context():
            tt = Timetable.query.first()
            d = tt.to_dict()
        assert 'selected' in d
        assert isinstance(d['selected'], list)

    def test_to_dict_has_user_id(self, app):
        with app.app_context():
            tt = Timetable.query.first()
            d = tt.to_dict()
        assert 'userId' in d
        assert isinstance(d['userId'], int)

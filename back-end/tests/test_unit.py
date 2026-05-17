"""
test_unit.py — Unit tests for UWA Timetable Planner API
Issue #26

Run:
    cd back-end
    pytest tests/test_unit.py -v
"""

import json
import pytest
from app import app as flask_app
from models import db as _db, User, Timetable, Friendship, FriendRequest, CustomCourse


# ── App & DB fixtures ────────────────────────────────────────────────────────

@pytest.fixture(scope='session')
def app():
    flask_app.config.update(
        TESTING=True,
        SQLALCHEMY_DATABASE_URI='sqlite:///:memory:',
        JWT_SECRET_KEY='test-secret',
        JWT_TOKEN_LOCATION=['headers'],
        JWT_HEADER_NAME='Authorization',
        JWT_HEADER_TYPE='Bearer',
        JWT_COOKIE_CSRF_PROTECT=False,
        WTF_CSRF_ENABLED=False,
    )
    with flask_app.app_context():
        _db.create_all()
        yield flask_app
        _db.drop_all()


@pytest.fixture
def client(app):
    """Fresh test client per test — no stale cookies."""
    with app.test_client() as c:
        yield c


@pytest.fixture(autouse=True)
def clean_db(app):
    """Wipe all rows before each test."""
    with app.app_context():
        for table in reversed(_db.metadata.sorted_tables):
            _db.session.execute(table.delete())
        _db.session.commit()
    yield


# ── Helpers ──────────────────────────────────────────────────────────────────

def register(client, name='Test User', email='test@student.uwa.edu.au',
             sn='22000001', pw='Password123!'):
    return client.post('/api/auth/register', json={
        'name': name, 'email': email, 'studentNumber': sn, 'password': pw
    })


def login(client, identifier='test@student.uwa.edu.au', pw='Password123!'):
    return client.post('/api/auth/login', json={
        'email': identifier, 'password': pw
    })


def auth_headers(client, email='test@student.uwa.edu.au', pw='Password123!'):
    """Register (if needed) and return Authorization header."""
    r = login(client, email, pw)
    if r.status_code == 401:
        register(client, email=email, pw=pw)
        r = login(client, email, pw)
    token = r.get_json().get('access_token', '')
    return {'Authorization': f'Bearer {token}'}


def make_user(client, name, email, sn, pw='Password123!'):
    register(client, name=name, email=email, sn=sn, pw=pw)
    return auth_headers(client, email=email, pw=pw)


# ── Health ───────────────────────────────────────────────────────────────────

class TestHealth:
    def test_health_returns_ok(self, client):
        r = client.get('/api/health')
        assert r.status_code == 200
        assert r.get_json()['status'] == 'ok'


# ── Auth — Register ──────────────────────────────────────────────────────────

class TestRegister:
    def test_register_success(self, client):
        r = register(client)
        assert r.status_code == 201
        data = r.get_json()
        assert 'access_token' in data
        assert data['user']['email'] == 'test@student.uwa.edu.au'

    def test_register_creates_default_timetable(self, client, app):
        register(client)
        with app.app_context():
            user = User.query.filter_by(email='test@student.uwa.edu.au').first()
            assert len(user.timetables) == 1
            assert user.timetables[0].name == 'My Timetable'

    def test_register_requires_uwa_email(self, client):
        r = register(client, email='test@gmail.com')
        assert r.status_code == 400

    def test_register_requires_valid_student_number(self, client):
        r = register(client, sn='12345678')   # doesn't start with 2
        assert r.status_code == 400

    def test_register_student_number_must_be_8_digits(self, client):
        r = register(client, sn='2200001')    # 7 digits
        assert r.status_code == 400

    def test_register_password_min_8_chars(self, client):
        r = register(client, pw='short')
        assert r.status_code == 400

    def test_register_duplicate_email_rejected(self, client):
        register(client)
        r = register(client, sn='22000002')   # different SN, same email
        assert r.status_code == 409

    def test_register_duplicate_student_number_rejected(self, client):
        register(client)
        r = register(client, email='other@student.uwa.edu.au')  # same SN
        assert r.status_code == 409

    def test_register_name_required(self, client):
        r = register(client, name='')
        assert r.status_code == 400


# ── Auth — Login ─────────────────────────────────────────────────────────────

class TestLogin:
    def setup_method(self, _):
        pass

    def test_login_with_email(self, client):
        register(client)
        r = login(client, 'test@student.uwa.edu.au')
        assert r.status_code == 200
        assert 'access_token' in r.get_json()

    def test_login_with_student_number(self, client):
        register(client)
        r = login(client, '22000001')
        assert r.status_code == 200

    def test_login_wrong_password(self, client):
        register(client)
        r = login(client, pw='wrongpassword')
        assert r.status_code == 401

    def test_login_unknown_user(self, client):
        r = login(client, 'nobody@student.uwa.edu.au')
        assert r.status_code == 401

    def test_login_sets_cookie(self, client):
        register(client)
        r = login(client)
        assert 'access_token_cookie' in r.headers.get('Set-Cookie', '')


# ── Auth — Password change ────────────────────────────────────────────────────

class TestPasswordChange:
    def test_change_password_success(self, client):
        register(client)
        h = auth_headers(client)
        r = client.put('/api/auth/password', json={
            'currentPassword': 'Password123!',
            'newPassword':     'NewPassword456!'
        }, headers=h)
        assert r.status_code == 200

    def test_change_password_wrong_current(self, client):
        register(client)
        h = auth_headers(client)
        r = client.put('/api/auth/password', json={
            'currentPassword': 'wrongpassword',
            'newPassword':     'NewPassword456!'
        }, headers=h)
        assert r.status_code == 403

    def test_change_password_too_short(self, client):
        register(client)
        h = auth_headers(client)
        r = client.put('/api/auth/password', json={
            'currentPassword': 'Password123!',
            'newPassword':     'short'
        }, headers=h)
        assert r.status_code == 400

    def test_change_password_requires_auth(self, client):
        r = client.put('/api/auth/password', json={
            'currentPassword': 'Password123!', 'newPassword': 'NewPassword456!'
        })
        assert r.status_code == 401


# ── Profile ───────────────────────────────────────────────────────────────────

class TestProfile:
    def test_get_profile(self, client):
        register(client)
        h = auth_headers(client)
        r = client.get('/api/profile', headers=h)
        assert r.status_code == 200
        assert r.get_json()['user']['email'] == 'test@student.uwa.edu.au'

    def test_get_profile_requires_auth(self, client):
        r = client.get('/api/profile')
        assert r.status_code == 401

    def test_update_profile_name(self, client):
        register(client)
        h = auth_headers(client)
        r = client.put('/api/profile', json={'name': 'New Name'}, headers=h)
        assert r.status_code == 200
        assert r.get_json()['user']['name'] == 'New Name'

    def test_update_profile_duplicate_student_number(self, client):
        make_user(client, 'Alice', 'alice@student.uwa.edu.au', '22000001')
        h2 = make_user(client, 'Bob', 'bob@student.uwa.edu.au', '22000002')
        r = client.put('/api/profile', json={'studentNumber': '22000001'}, headers=h2)
        assert r.status_code == 409

    def test_lookup_user(self, client):
        register(client)
        h = auth_headers(client)
        r = client.get('/api/users/22000001', headers=h)
        assert r.status_code == 200
        assert r.get_json()['studentNumber'] == '22000001'

    def test_lookup_nonexistent_user(self, client):
        register(client)
        h = auth_headers(client)
        r = client.get('/api/users/99999999', headers=h)
        assert r.status_code == 404


# ── Courses ───────────────────────────────────────────────────────────────────

class TestCourses:
    def test_get_courses(self, client):
        r = client.get('/api/courses')
        assert r.status_code == 200
        assert isinstance(r.get_json(), list)

    def test_get_courses_filter_semester(self, client):
        r = client.get('/api/courses?semester=S1')
        assert r.status_code == 200

    def test_get_courses_search(self, client):
        r = client.get('/api/courses?search=cits')
        assert r.status_code == 200
        results = r.get_json()
        assert all('CITS' in c['code'].upper() or 'cits' in c.get('name', '').lower()
                   for c in results)

    def test_get_single_course(self, client):
        courses = client.get('/api/courses').get_json()
        if courses:
            code = courses[0]['code']
            r = client.get(f'/api/courses/{code}')
            assert r.status_code == 200
            assert r.get_json()['code'] == code

    def test_get_nonexistent_course(self, client):
        r = client.get('/api/courses/FAKE9999')
        assert r.status_code == 404


# ── Custom Courses ────────────────────────────────────────────────────────────

class TestCustomCourses:
    def test_create_custom_course(self, client):
        register(client)
        h = auth_headers(client)
        r = client.post('/api/courses/custom', json={
            'code': 'CUST001', 'name': 'My Custom Unit',
            'sems': ['S1'], 'sessions': []
        }, headers=h)
        assert r.status_code == 200

    def test_get_custom_courses(self, client):
        register(client)
        h = auth_headers(client)
        client.post('/api/courses/custom', json={
            'code': 'CUST001', 'name': 'My Unit', 'sems': ['S1'], 'sessions': []
        }, headers=h)
        r = client.get('/api/courses/custom', headers=h)
        assert r.status_code == 200
        data = r.get_json()
        assert len(data) == 1
        assert data[0]['code'] == 'CUST001'

    def test_custom_course_requires_code(self, client):
        register(client)
        h = auth_headers(client)
        r = client.post('/api/courses/custom', json={
            'name': 'No Code Unit', 'sems': ['S1'], 'sessions': []
        }, headers=h)
        assert r.status_code == 400

    def test_update_custom_course(self, client):
        register(client)
        h = auth_headers(client)
        client.post('/api/courses/custom', json={
            'code': 'CUST001', 'name': 'Old Name', 'sems': ['S1'], 'sessions': []
        }, headers=h)
        r = client.put('/api/courses/custom/CUST001', json={
            'name': 'New Name', 'sems': ['S2'], 'sessions': []
        }, headers=h)
        assert r.status_code == 200
        assert r.get_json()['name'] == 'New Name'

    def test_update_custom_course_duplicate_name(self, client):
        register(client)
        h = auth_headers(client)
        client.post('/api/courses/custom', json={
            'code': 'CUST001', 'name': 'Unit A', 'sems': ['S1'], 'sessions': []
        }, headers=h)
        client.post('/api/courses/custom', json={
            'code': 'CUST002', 'name': 'Unit B', 'sems': ['S1'], 'sessions': []
        }, headers=h)
        r = client.put('/api/courses/custom/CUST002', json={
            'name': 'Unit A', 'sems': ['S1'], 'sessions': []
        }, headers=h)
        assert r.status_code == 400

    def test_update_nonexistent_custom_course(self, client):
        register(client)
        h = auth_headers(client)
        r = client.put('/api/courses/custom/FAKE999', json={
            'name': 'Doesnt Exist', 'sems': ['S1'], 'sessions': []
        }, headers=h)
        assert r.status_code == 404

    def test_delete_custom_course(self, client):
        register(client)
        h = auth_headers(client)
        client.post('/api/courses/custom', json={
            'code': 'CUST001', 'name': 'Delete Me', 'sems': ['S1'], 'sessions': []
        }, headers=h)
        r = client.delete('/api/courses/custom/CUST001', headers=h)
        assert r.status_code == 200
        remaining = client.get('/api/courses/custom', headers=h).get_json()
        assert len(remaining) == 0

    def test_custom_courses_isolated_per_user(self, client):
        h1 = make_user(client, 'Alice', 'alice@student.uwa.edu.au', '22000001')
        h2 = make_user(client, 'Bob',   'bob@student.uwa.edu.au',   '22000002')
        client.post('/api/courses/custom', json={
            'code': 'CUST001', 'name': 'Alice Unit', 'sems': ['S1'], 'sessions': []
        }, headers=h1)
        r = client.get('/api/courses/custom', headers=h2)
        assert len(r.get_json()) == 0


# ── Timetables ────────────────────────────────────────────────────────────────

class TestTimetables:
    def test_list_timetables(self, client):
        register(client)
        h = auth_headers(client)
        r = client.get('/api/timetables', headers=h)
        assert r.status_code == 200
        assert len(r.get_json()) >= 1

    def test_create_timetable(self, client):
        register(client)
        h = auth_headers(client)
        r = client.post('/api/timetables', json={'name': 'Sem 2 Plan'}, headers=h)
        assert r.status_code == 201
        assert r.get_json()['name'] == 'Sem 2 Plan'

    def test_get_timetable(self, client):
        register(client)
        h = auth_headers(client)
        tt_id = client.get('/api/timetables', headers=h).get_json()[0]['id']
        r = client.get(f'/api/timetables/{tt_id}', headers=h)
        assert r.status_code == 200
        assert r.get_json()['id'] == tt_id

    def test_get_timetable_not_found(self, client):
        register(client)
        h = auth_headers(client)
        r = client.get('/api/timetables/99999', headers=h)
        assert r.status_code == 404

    def test_update_timetable_name(self, client):
        register(client)
        h = auth_headers(client)
        tt_id = client.get('/api/timetables', headers=h).get_json()[0]['id']
        r = client.put(f'/api/timetables/{tt_id}', json={'name': 'Renamed'}, headers=h)
        assert r.status_code == 200

    def test_update_timetable_public(self, client):
        register(client)
        h = auth_headers(client)
        tt_id = client.get('/api/timetables', headers=h).get_json()[0]['id']
        client.put(f'/api/timetables/{tt_id}', json={'isPublic': True}, headers=h)
        tt = client.get(f'/api/timetables/{tt_id}', headers=h).get_json()
        assert tt['isPublic'] is True

    def test_delete_timetable(self, client):
        register(client)
        h = auth_headers(client)
        r = client.post('/api/timetables', json={'name': 'To Delete'}, headers=h)
        tt_id = r.get_json()['id']
        client.delete(f'/api/timetables/{tt_id}', headers=h)
        r = client.get(f'/api/timetables/{tt_id}', headers=h)
        assert r.status_code == 404

    def test_cannot_access_other_users_timetable(self, client):
        h1 = make_user(client, 'Alice', 'alice@student.uwa.edu.au', '22000001')
        h2 = make_user(client, 'Bob',   'bob@student.uwa.edu.au',   '22000002')
        tt_id = client.get('/api/timetables', headers=h1).get_json()[0]['id']
        r = client.get(f'/api/timetables/{tt_id}', headers=h2)
        assert r.status_code == 404

    def test_timetable_requires_auth(self, client):
        r = client.get('/api/timetables')
        assert r.status_code == 401


# ── Timetable — Conflicts & Auto-schedule ────────────────────────────────────

class TestTimetableConflicts:
    def test_detect_no_conflicts(self, client):
        register(client)
        h = auth_headers(client)
        tt_id = client.get('/api/timetables', headers=h).get_json()[0]['id']
        r = client.post(f'/api/timetables/{tt_id}/conflicts',
                        json={'selected': []}, headers=h)
        assert r.status_code == 200
        assert r.get_json()['conflict_count'] == 0

    def test_detect_overlapping_sessions(self, client):
        register(client)
        h = auth_headers(client)
        # Create two custom units that clash (both Mon 9–11)
        for code, name in [('A001', 'Unit A'), ('B001', 'Unit B')]:
            client.post('/api/courses/custom', json={
                'code': code, 'name': name, 'sems': ['S1'],
                'sessions': [{'type': 'LEC', 'day': 0, 'hour': 9, 'duration': 2}]
            }, headers=h)
        tt_id = client.get('/api/timetables', headers=h).get_json()[0]['id']
        r = client.post(f'/api/timetables/{tt_id}/conflicts', json={
            'selected': [{'code': 'A001', 'altIdx': 0}, {'code': 'B001', 'altIdx': 0}]
        }, headers=h)
        assert r.status_code == 200
        assert r.get_json()['conflict_count'] > 0

    def test_auto_schedule_returns_selected(self, client):
        register(client)
        h = auth_headers(client)
        tt_id = client.get('/api/timetables', headers=h).get_json()[0]['id']
        r = client.post(f'/api/timetables/{tt_id}/auto-schedule', json={
            'selected': [],
            'preferences': {'earliestStart': 9, 'targetDaysOff': [], 'compactDays': False}
        }, headers=h)
        assert r.status_code == 200
        assert 'selected' in r.get_json()

    def test_auto_schedule_backward_compat(self, client):
        """Old-format preferences (avoid8am/freeFridays) still accepted."""
        register(client)
        h = auth_headers(client)
        tt_id = client.get('/api/timetables', headers=h).get_json()[0]['id']
        r = client.post(f'/api/timetables/{tt_id}/auto-schedule', json={
            'selected': [],
            'preferences': {'avoid8am': True, 'freeFridays': True, 'compactDays': False}
        }, headers=h)
        assert r.status_code == 200


# ── Friends ───────────────────────────────────────────────────────────────────

class TestFriends:
    def test_get_friends_empty(self, client):
        register(client)
        h = auth_headers(client)
        r = client.get('/api/friends', headers=h)
        assert r.status_code == 200
        assert r.get_json() == []

    def test_send_friend_request(self, client):
        h1 = make_user(client, 'Alice', 'alice@student.uwa.edu.au', '22000001')
        make_user(client,      'Bob',   'bob@student.uwa.edu.au',   '22000002')
        r = client.post('/api/friends/requests',
                        json={'studentNumber': '22000002'}, headers=h1)
        assert r.status_code == 200

    def test_cannot_friend_yourself(self, client):
        register(client)
        h = auth_headers(client)
        r = client.post('/api/friends/requests',
                        json={'studentNumber': '22000001'}, headers=h)
        assert r.status_code == 422

    def test_friend_request_user_not_found(self, client):
        register(client)
        h = auth_headers(client)
        r = client.post('/api/friends/requests',
                        json={'studentNumber': '99999999'}, headers=h)
        assert r.status_code == 404

    def test_accept_friend_request(self, client):
        h1 = make_user(client, 'Alice', 'alice@student.uwa.edu.au', '22000001')
        h2 = make_user(client, 'Bob',   'bob@student.uwa.edu.au',   '22000002')
        client.post('/api/friends/requests',
                    json={'studentNumber': '22000002'}, headers=h1)
        r = client.put('/api/friends/requests/22000001/accept', headers=h2)
        assert r.status_code == 200
        friends = client.get('/api/friends', headers=h2).get_json()
        assert any(f['studentNumber'] == '22000001' for f in friends)

    def test_decline_friend_request(self, client):
        h1 = make_user(client, 'Alice', 'alice@student.uwa.edu.au', '22000001')
        h2 = make_user(client, 'Bob',   'bob@student.uwa.edu.au',   '22000002')
        client.post('/api/friends/requests',
                    json={'studentNumber': '22000002'}, headers=h1)
        r = client.delete('/api/friends/requests/22000001', headers=h2)
        assert r.status_code == 200
        friends = client.get('/api/friends', headers=h2).get_json()
        assert len(friends) == 0

    def test_cancel_sent_request(self, client):
        h1 = make_user(client, 'Alice', 'alice@student.uwa.edu.au', '22000001')
        make_user(client,      'Bob',   'bob@student.uwa.edu.au',   '22000002')
        client.post('/api/friends/requests',
                    json={'studentNumber': '22000002'}, headers=h1)
        r = client.delete('/api/friends/requests/sent/22000002', headers=h1)
        assert r.status_code == 200
        sent = client.get('/api/friends/requests/sent', headers=h1).get_json()
        assert len(sent) == 0

    def test_remove_friend(self, client):
        h1 = make_user(client, 'Alice', 'alice@student.uwa.edu.au', '22000001')
        h2 = make_user(client, 'Bob',   'bob@student.uwa.edu.au',   '22000002')
        client.post('/api/friends/requests',
                    json={'studentNumber': '22000002'}, headers=h1)
        client.put('/api/friends/requests/22000001/accept', headers=h2)
        r = client.delete('/api/friends/22000002', headers=h1)
        assert r.status_code == 200
        assert client.get('/api/friends', headers=h1).get_json() == []

    def test_duplicate_friend_request_ignored(self, client):
        h1 = make_user(client, 'Alice', 'alice@student.uwa.edu.au', '22000001')
        make_user(client,      'Bob',   'bob@student.uwa.edu.au',   '22000002')
        client.post('/api/friends/requests',
                    json={'studentNumber': '22000002'}, headers=h1)
        r = client.post('/api/friends/requests',
                        json={'studentNumber': '22000002'}, headers=h1)
        assert r.status_code == 200  # idempotent

    def test_get_friend_timetables(self, client):
        h1 = make_user(client, 'Alice', 'alice@student.uwa.edu.au', '22000001')
        h2 = make_user(client, 'Bob',   'bob@student.uwa.edu.au',   '22000002')
        # Make friends
        client.post('/api/friends/requests',
                    json={'studentNumber': '22000002'}, headers=h1)
        client.put('/api/friends/requests/22000001/accept', headers=h2)
        # Make Bob's timetable public
        tt_id = client.get('/api/timetables', headers=h2).get_json()[0]['id']
        client.put(f'/api/timetables/{tt_id}', json={'isPublic': True}, headers=h2)
        # Alice reads Bob's timetables
        r = client.get('/api/friends/22000002/timetables', headers=h1)
        assert r.status_code == 200
        assert len(r.get_json()) >= 1

    def test_non_friend_cannot_see_timetables(self, client):
        h1 = make_user(client, 'Alice', 'alice@student.uwa.edu.au', '22000001')
        make_user(client,      'Bob',   'bob@student.uwa.edu.au',   '22000002')
        r = client.get('/api/friends/22000002/timetables', headers=h1)
        assert r.status_code == 403

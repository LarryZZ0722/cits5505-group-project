"""
test_auth.py — unit tests for auth routes via Flask test client

Tests exercise /api/health, /api/auth/login, /api/auth/register, and
/api/auth/password using the in-memory DB seeded in conftest.py.
"""


class TestHealth:
    def test_health_returns_ok(self, client):
        resp = client.get('/api/health')
        assert resp.status_code == 200
        assert resp.get_json()['status'] == 'ok'


class TestLogin:
    def test_login_with_student_number_succeeds(self, client):
        resp = client.post('/api/auth/login', json={
            'email': '21000001',
            'password': 'demo1234',
        })
        data = resp.get_json()
        assert resp.status_code == 200
        assert 'access_token' in data
        assert data['user']['studentNumber'] == '21000001'

    def test_login_with_email_succeeds(self, client):
        resp = client.post('/api/auth/login', json={
            'email': '21000001@student.uwa.edu.au',
            'password': 'demo1234',
        })
        assert resp.status_code == 200
        assert 'access_token' in resp.get_json()

    def test_login_wrong_password_rejected(self, client):
        resp = client.post('/api/auth/login', json={
            'email': '21000001',
            'password': 'wrongpassword',
        })
        assert resp.status_code == 401

    def test_login_unknown_user_rejected(self, client):
        resp = client.post('/api/auth/login', json={
            'email': 'nobody@student.uwa.edu.au',
            'password': 'demo1234',
        })
        assert resp.status_code == 401


class TestRegister:
    def test_register_valid_user(self, client):
        resp = client.post('/api/auth/register', json={
            'name': 'New Student',
            'email': '29000001@student.uwa.edu.au',
            'studentNumber': '29000001',
            'password': 'password123',
        })
        data = resp.get_json()
        assert resp.status_code == 201
        assert 'access_token' in data
        assert data['user']['name'] == 'New Student'

    def test_register_non_uwa_email_rejected(self, client):
        resp = client.post('/api/auth/register', json={
            'name': 'Bad Email',
            'email': 'student@gmail.com',
            'studentNumber': '29000002',
            'password': 'password123',
        })
        assert resp.status_code == 400
        assert 'UWA' in resp.get_json()['message']

    def test_register_invalid_student_number_rejected(self, client):
        resp = client.post('/api/auth/register', json={
            'name': 'Bad SN',
            'email': '29000003@student.uwa.edu.au',
            'studentNumber': '1234',       # too short, doesn't start with 2
            'password': 'password123',
        })
        assert resp.status_code == 400
        assert 'Student number' in resp.get_json()['message']

    def test_register_short_password_rejected(self, client):
        resp = client.post('/api/auth/register', json={
            'name': 'Short Pass',
            'email': '29000004@student.uwa.edu.au',
            'studentNumber': '29000004',
            'password': 'abc',
        })
        assert resp.status_code == 400
        assert 'Password' in resp.get_json()['message']

    def test_register_duplicate_email_rejected(self, client):
        resp = client.post('/api/auth/register', json={
            'name': 'Dup Email',
            'email': '21000001@student.uwa.edu.au',    # already seeded
            'studentNumber': '29000005',
            'password': 'password123',
        })
        assert resp.status_code == 409

    def test_register_missing_name_rejected(self, client):
        resp = client.post('/api/auth/register', json={
            'name': '',
            'email': '29000006@student.uwa.edu.au',
            'studentNumber': '29000006',
            'password': 'password123',
        })
        assert resp.status_code == 400
        assert 'Name' in resp.get_json()['message']


class TestChangePassword:
    def test_change_password_requires_auth(self, client):
        resp = client.put('/api/auth/password', json={
            'currentPassword': 'demo1234',
            'newPassword': 'newpassword123',
        })
        assert resp.status_code == 401

    def test_change_password_wrong_current_rejected(self, client, auth_headers):
        resp = client.put('/api/auth/password',
                          json={'currentPassword': 'wrongpass', 'newPassword': 'newpassword123'},
                          headers=auth_headers)
        assert resp.status_code == 403

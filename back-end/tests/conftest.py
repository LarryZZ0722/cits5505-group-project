"""
conftest.py — shared pytest fixtures

Fixtures
  app             session-scoped Flask app with in-memory SQLite, CSRF off
  client          function-scoped test client
  auth_headers    Bearer token for the seeded demo user (Hung Nguyen)
  live_server_url session-scoped live server on port 5001 for Selenium tests
  driver          function-scoped Chrome WebDriver (headless)
"""

import sys
import os
import time
import threading
import urllib.request

import pytest

# Ensure back-end/ is on the path when tests are discovered from the repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from models import db as _db
from seed import seed

_TEST_CONFIG = {
    'TESTING': True,
    'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
    'WTF_CSRF_ENABLED': False,
    'JWT_SECRET_KEY': 'test-jwt-secret-key-at-least-32-bytes-long',
    'SECRET_KEY': 'test-secret',
}


# ── Unit-test fixtures ────────────────────────────────────────────────────────

@pytest.fixture(scope='session')
def app():
    application = create_app(_TEST_CONFIG)
    with application.app_context():
        _db.create_all()
        seed()
    yield application


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def auth_headers(client):
    """Return Authorization header for the seeded demo user Hung Nguyen."""
    resp = client.post('/api/auth/login', json={
        'email': '21000001',
        'password': 'demo1234',
    })
    token = resp.get_json()['access_token']
    return {'Authorization': f'Bearer {token}'}


# ── Selenium fixtures ─────────────────────────────────────────────────────────

_SELENIUM_PORT = 5001


@pytest.fixture(scope='session')
def live_server_url():
    """Start a Flask server on port 5001 backed by a fresh test_planner.db."""
    import os
    test_db = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'test_planner.db')

    server_app = create_app({
        'SQLALCHEMY_DATABASE_URI': f'sqlite:///{test_db}',
    })
    with server_app.app_context():
        _db.drop_all()
        _db.create_all()
        seed()

    thread = threading.Thread(
        target=lambda: server_app.run(
            host='127.0.0.1',
            port=_SELENIUM_PORT,
            use_reloader=False,
            threaded=True,
        ),
        daemon=True,
    )
    thread.start()

    # Wait up to 5 s for the server to accept connections
    base = f'http://127.0.0.1:{_SELENIUM_PORT}'
    for _ in range(25):
        try:
            urllib.request.urlopen(f'{base}/api/health', timeout=1)
            break
        except Exception:
            time.sleep(0.2)

    yield base


@pytest.fixture(scope='session')
def driver(live_server_url):  # noqa: F811 — depends on live_server_url to start first
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options

    opts = Options()
    opts.add_argument('--no-sandbox')
    opts.add_argument('--disable-dev-shm-usage')
    opts.add_argument('--window-size=1280,800')

    d = webdriver.Chrome(options=opts)
    d.implicitly_wait(5)
    yield d
    d.quit()

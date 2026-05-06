"""
test_selenium.py — end-to-end browser tests against the live Flask server

The `live_server_url` and `driver` fixtures in conftest.py start a seeded
Flask server on port 5001 and launch a headless Chrome instance.

Demo credentials used: student number 21000001 / demo1234 (Hung Nguyen).
"""

import pytest
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC


# Helper: short explicit wait
def wait_for(driver, by, value, timeout=8):
    return WebDriverWait(driver, timeout).until(
        EC.presence_of_element_located((by, value))
    )


def wait_visible(driver, by, value, timeout=8):
    return WebDriverWait(driver, timeout).until(
        EC.visibility_of_element_located((by, value))
    )


# ── Home page ─────────────────────────────────────────────────────────────────

class TestHomePage:
    def test_home_page_loads(self, driver, live_server_url):
        driver.get(live_server_url + '/')
        assert 'UWA' in driver.title

    def test_home_hero_text_visible(self, driver, live_server_url):
        driver.get(live_server_url + '/')
        heading = wait_for(driver, By.TAG_NAME, 'h1')
        assert 'semester' in heading.text.lower()


# ── Auth page ─────────────────────────────────────────────────────────────────

class TestAuthPage:
    def test_auth_page_loads(self, driver, live_server_url):
        driver.get(live_server_url + '/auth')
        wait_for(driver, By.ID, 'loginForm')
        assert driver.find_element(By.ID, 'loginForm').is_displayed()

    def test_login_tab_active_by_default(self, driver, live_server_url):
        driver.get(live_server_url + '/auth')
        login_tab = wait_for(driver, By.ID, 'loginTab')
        assert 'active' in login_tab.get_attribute('class')

    def test_signup_tab_switches_form(self, driver, live_server_url):
        driver.get(live_server_url + '/auth')
        wait_for(driver, By.ID, 'signupTab').click()
        wait_visible(driver, By.ID, 'signupForm')
        assert driver.find_element(By.ID, 'signupForm').is_displayed()
        assert not driver.find_element(By.ID, 'loginForm').is_displayed()

    def test_demo_login_succeeds(self, driver, live_server_url):
        driver.get(live_server_url + '/auth')
        wait_for(driver, By.ID, 'loginEmail').send_keys('21000001')
        driver.find_element(By.ID, 'loginPass').send_keys('demo1234')
        driver.find_element(By.ID, 'loginBtn').click()
        # auth.js redirects to /courses after 500 ms on success
        WebDriverWait(driver, 8).until(
            lambda d: '/courses' in d.current_url
        )
        assert '/auth' not in driver.current_url


# ── Protected pages ───────────────────────────────────────────────────────────

class TestProtectedPages:
    @pytest.fixture(autouse=True)
    def _login(self, driver, live_server_url):
        """Log in before each test. Clear localStorage first so auth.js shows the form."""
        driver.get(live_server_url + '/auth')
        driver.execute_script("localStorage.clear()")
        driver.get(live_server_url + '/auth')
        wait_for(driver, By.ID, 'loginEmail').send_keys('21000001')
        driver.find_element(By.ID, 'loginPass').send_keys('demo1234')
        driver.find_element(By.ID, 'loginBtn').click()
        WebDriverWait(driver, 8).until(lambda d: '/courses' in d.current_url)

    def test_courses_page_loads(self, driver, live_server_url):
        driver.get(live_server_url + '/courses')
        WebDriverWait(driver, 8).until(lambda d: 'Browse' in d.title or 'Units' in d.title)

    def test_schedule_page_loads(self, driver, live_server_url):
        driver.get(live_server_url + '/schedule')
        WebDriverWait(driver, 8).until(lambda d: 'Schedule' in d.title)

    def test_friends_page_loads(self, driver, live_server_url):
        driver.get(live_server_url + '/friends')
        WebDriverWait(driver, 8).until(lambda d: 'Friends' in d.title)

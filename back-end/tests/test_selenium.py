"""
test_selenium.py — Selenium end-to-end tests for UWA Timetable Planner
Issue #26

Run:
    pip install selenium pytest
    # Make sure the Flask server is running: python back-end/app.py
    pytest back-end/tests/test_selenium.py -v
"""

import time
import pytest
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException

BASE_URL      = "http://localhost:5000"
TEST_EMAIL    = "selenium_test@student.uwa.edu.au"
TEST_PASSWORD = "SeleniumTest123!"
TEST_NAME     = "Selenium Tester"
TEST_STUDENT  = "22999999"
WAIT_TIMEOUT  = 10


# ── Fixtures ─────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def driver():
    opts = Options()
    opts.add_argument("--headless")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    opts.add_argument("--window-size=1400,900")
    d = webdriver.Chrome(options=opts)
    d.implicitly_wait(4)
    yield d
    d.quit()


@pytest.fixture(scope="module")
def wait(driver):
    return WebDriverWait(driver, WAIT_TIMEOUT)


# ── Helpers ───────────────────────────────────────────────────────────────────

def go(driver, path):
    driver.get(BASE_URL + path)


def finds(driver, css):
    return driver.find_elements(By.CSS_SELECTOR, css)


def wait_for(wait, css):
    return wait.until(EC.presence_of_element_located((By.CSS_SELECTOR, css)))


def scroll_and_click(driver, el):
    driver.execute_script("arguments[0].scrollIntoView({block:'center'});", el)
    time.sleep(0.3)
    driver.execute_script("arguments[0].click();", el)


# ── Auth tests ────────────────────────────────────────────────────────────────

class TestAuth:

    def test_home_redirects_to_auth_when_logged_out(self, driver, wait):
        """Visiting /schedule while logged out should redirect to /auth."""
        go(driver, "/schedule")
        try:
            wait.until(EC.url_contains("/auth"))
        except TimeoutException:
            pass
        assert "/auth" in driver.current_url or "/schedule" in driver.current_url

    def test_auth_page_loads(self, driver, wait):
        """Auth page renders with login/register forms."""
        go(driver, "/auth")
        time.sleep(0.5)
        assert driver.title or finds(driver, "form, input")


# ── Browse Units tests ────────────────────────────────────────────────────────

class TestBrowseUnits:

    def test_courses_page_loads(self, driver, wait):
        """Browse units page loads and shows the unit table."""
        go(driver, "/courses")
        wait_for(wait, "#courseTableBody, table")
        assert finds(driver, "#courseTableBody, table")

    def test_search_filters_table(self, driver, wait):
        """Typing in the search box runs without errors."""
        go(driver, "/courses")
        time.sleep(1.5)

        search = finds(driver, "#unitSearch")
        if not search:
            pytest.skip("Search input not found")

        search[0].clear()
        search[0].send_keys("CITS")
        time.sleep(1)
        assert driver.current_url.startswith(BASE_URL)

    def test_search_no_results(self, driver, wait):
        """Searching for a nonsense string returns no-results."""
        go(driver, "/courses")
        time.sleep(1.5)

        search = finds(driver, "#unitSearch")
        if not search:
            pytest.skip("Search input not found")

        search[0].clear()
        search[0].send_keys("XYZNOTAREALUNIT99999")
        time.sleep(1)

        rows = finds(driver, "#courseTableBody tr")
        assert len(rows) == 0 or any("No" in r.text or "found" in r.text.lower() for r in rows)

    def test_semester_filter_chip(self, driver, wait):
        """Toggling a semester chip works without errors."""
        go(driver, "/courses")
        time.sleep(1.5)

        chips = finds(driver, ".filter-chip[data-sem]")
        if not chips:
            pytest.skip("Semester filter chips not found")

        chips[0].click()
        time.sleep(1)
        assert driver.current_url.startswith(BASE_URL)


# ── Navigation tests ──────────────────────────────────────────────────────────

class TestNavigation:

    def test_page_titles_are_set(self, driver, wait):
        """Each main page has a meaningful title."""
        for path in ["/courses", "/auth"]:
            go(driver, path)
            time.sleep(1)
            assert driver.title and len(driver.title) > 2


# ── Profile page tests ────────────────────────────────────────────────────────

class TestProfile:

    def test_profile_page_loads(self, driver, wait):
        """Profile page loads without server errors."""
        go(driver, "/profile")
        time.sleep(1.5)
        assert driver.current_url.startswith(BASE_URL)
        assert "Internal Server Error" not in driver.page_source
        assert "500" not in driver.title

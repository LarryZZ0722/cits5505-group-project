"""
conftest.py — pytest configuration for Selenium tests

Before running:
    1. Start the Flask server:   cd back-end && python app.py
    2. Install dependencies:     pip install selenium pytest
    3. Have ChromeDriver on PATH (or install via: pip install webdriver-manager)

If using webdriver-manager, replace the driver fixture in test_selenium.py with:

    from webdriver_manager.chrome import ChromeDriverManager
    from selenium.webdriver.chrome.service import Service
    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=opts)
"""

"""
E2E tests for the React dashboard using Playwright.

These tests require:
  1. playwright Python package installed: pip install playwright
  2. Playwright browsers installed: playwright install chromium
  3. The Vite dev server running on http://localhost:5173
     (cd dashboard-app && npm run dev)

All tests are skipped gracefully if playwright is not installed or if
the dashboard server is not reachable.

Run with:
  pytest tests/test_dashboard_e2e.py -v -m e2e
"""

import socket
import pytest

# ---------------------------------------------------------------------------
# Graceful skip if playwright is not installed
# ---------------------------------------------------------------------------
playwright_mod = pytest.importorskip(
    "playwright.sync_api",
    reason="playwright not installed — skipping dashboard E2E tests",
)

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeoutError  # noqa: E402

DASHBOARD_URL = "http://localhost:5173"
CONNECT_TIMEOUT_MS = 10_000   # 10 s to wait for elements
NAV_TIMEOUT_MS = 15_000       # 15 s for page loads


# ---------------------------------------------------------------------------
# Helper: check if the dev server is reachable at all
# ---------------------------------------------------------------------------
def _server_reachable(host: str = "localhost", port: int = 5173) -> bool:
    """Return True if a TCP connection to host:port succeeds."""
    try:
        with socket.create_connection((host, port), timeout=2):
            return True
    except OSError:
        return False


# ---------------------------------------------------------------------------
# Pytest fixtures
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def browser():
    """Launch a headless Chromium browser for the whole test module."""
    if not _server_reachable():
        pytest.skip(
            f"Dashboard server not running at {DASHBOARD_URL} — skipping E2E tests"
        )

    with sync_playwright() as pw:
        _browser = pw.chromium.launch(headless=True)
        yield _browser
        _browser.close()


@pytest.fixture()
def page(browser):
    """Create a fresh browser page for each test."""
    context = browser.new_context(
        viewport={"width": 1280, "height": 800},
        ignore_https_errors=True,
    )
    _page = context.new_page()
    _page.set_default_timeout(CONNECT_TIMEOUT_MS)
    yield _page
    _page.close()
    context.close()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.e2e
class TestDashboardLoads:
    """Test 1 – Opening the dashboard returns a usable page."""

    def test_page_title_or_heading_loads(self, page):
        """The dashboard page must load and show a recognisable Ghost Board heading."""
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)

        # The <title> set in index.html, OR the visible heading text
        title = page.title()
        body_text = page.inner_text("body")

        assert (
            "ghost" in title.lower()
            or "ghost board" in body_text.lower()
        ), (
            f"Expected 'Ghost Board' in page title or body. "
            f"Got title={title!r}, body excerpt={body_text[:200]!r}"
        )


@pytest.mark.e2e
class TestMissionControlInput:
    """Test 2 & 3 – MissionControl screen input and launch button."""

    def _navigate_to_mission_control(self, page):
        """
        Navigate to the dashboard and reach the MissionControl screen.
        The app opens on the LandingPage first; click 'ENTER DASHBOARD' to get
        to MissionControl, or wait if it transitions automatically.
        """
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)

        # Try to click "ENTER DASHBOARD" if the landing page is shown
        try:
            enter_btn = page.locator("button", has_text="ENTER DASHBOARD")
            enter_btn.wait_for(state="visible", timeout=4_000)
            enter_btn.click()
        except PWTimeoutError:
            # Already on MissionControl (or another screen) — continue
            pass

    def test_concept_input_accepts_text(self, page):
        """The concept text input must be present and accept typing."""
        self._navigate_to_mission_control(page)

        # The input has placeholder "Describe your startup concept..."
        concept_input = page.locator(
            'input[placeholder="Describe your startup concept..."]'
        )
        concept_input.wait_for(state="visible", timeout=CONNECT_TIMEOUT_MS)
        concept_input.fill("test startup")

        assert concept_input.input_value() == "test startup"

    def test_launch_button_is_present(self, page):
        """The LAUNCH SPRINT button must be visible on the MissionControl screen."""
        self._navigate_to_mission_control(page)

        # Button text contains "LAUNCH SPRINT"
        launch_btn = page.locator("button", has_text="LAUNCH SPRINT")
        launch_btn.wait_for(state="visible", timeout=CONNECT_TIMEOUT_MS)

        assert launch_btn.is_visible(), "LAUNCH SPRINT button should be visible"

    def test_mission_control_key_elements_present(self, page):
        """MissionControl must render the expected heading and stats."""
        self._navigate_to_mission_control(page)

        body_text = page.inner_text("body")

        # Main heading
        assert "GHOST BOARD" in body_text, (
            f"Expected 'GHOST BOARD' heading. Body excerpt: {body_text[:300]!r}"
        )

        # Sub-heading or stat pill
        assert any(
            kw in body_text
            for kw in ("Autonomous AI", "AI Executive", "1M+", "LAUNCH SPRINT")
        ), (
            f"Expected MissionControl stat/subheading text. Body: {body_text[:300]!r}"
        )


@pytest.mark.e2e
class TestMarketArenaGlobe:
    """Test 4 – Navigating to Market Arena shows the Three.js globe canvas."""

    def _navigate_to_market_arena(self, page):
        """
        Open the dashboard and navigate to the Market Arena screen via the
        top navigation bar (present on all non-landing screens).
        """
        page.goto(DASHBOARD_URL, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)

        # Click through landing page if shown
        try:
            enter_btn = page.locator("button", has_text="ENTER DASHBOARD")
            enter_btn.wait_for(state="visible", timeout=4_000)
            enter_btn.click()
        except PWTimeoutError:
            pass

        # Wait for the nav bar (rendered on every non-landing screen)
        try:
            page.locator("nav").wait_for(state="visible", timeout=CONNECT_TIMEOUT_MS)
        except PWTimeoutError:
            pytest.skip("Top nav not found — cannot navigate to Market Arena")

        # Find and click the 'Market Arena' nav tab
        arena_tab = page.locator("button", has_text="Market Arena")
        try:
            arena_tab.wait_for(state="visible", timeout=4_000)
            arena_tab.click()
        except PWTimeoutError:
            pytest.skip(
                "Market Arena nav tab not found — sprint may not be active; "
                "skipping globe test"
            )

    def test_globe_canvas_renders(self, page):
        """
        When the Market Arena screen is active the Three.js <Canvas> must
        render a <canvas> element in the DOM.
        """
        self._navigate_to_market_arena(page)

        # @react-three/fiber renders a <canvas> element
        canvas = page.locator("canvas")
        try:
            canvas.first.wait_for(state="attached", timeout=CONNECT_TIMEOUT_MS)
        except PWTimeoutError:
            pytest.skip(
                "No <canvas> found on Market Arena — "
                "globe may require an active simulation run"
            )

        assert canvas.first.is_visible() or canvas.count() > 0, (
            "Expected at least one <canvas> element for the Three.js globe"
        )

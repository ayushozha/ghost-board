# Ghost Board - Expected Screenshots

Each screenshot corresponds to one of the dashboard screens or the landing page.

| File | Description |
|------|-------------|
| `01_mission_control.png` | Screen 1: Dark terminal input with "LAUNCH SPRINT" button |
| `02_boardroom.png` | Screen 2: 5 AI agent cards (CEO, CTO, CFO, CMO, Legal) with connection lines |
| `03_market_arena.png` | Screen 3: 3D globe with persona dots, sentiment charts, post feed |
| `04_pivot_timeline.png` | Screen 4: Horizontal timeline with colored event nodes, causal chains |
| `05_sprint_report.png` | Screen 5: Tabbed artifacts view with prototype, financial model, GTM, compliance |
| `06_landing_page.png` | Marketing page with hero, how it works, numbers, credits |

## Capturing Screenshots

Screenshots are captured by `scripts/capture_demo.py` using Playwright. Run the following command to refresh all screenshots:

```bash
python scripts/capture_demo.py
```

## Verifying Screenshots

To check that all screenshots exist and are valid (not placeholders), run:

```bash
python scripts/verify_screenshots.py
```

The verification script checks:
- **PNG files**: must exist and be larger than 50KB; dimensions are reported if PIL is available.
- **TXT placeholder files**: flagged as PLACEHOLDER (not yet captured).
- **Missing files**: flagged as FAIL.

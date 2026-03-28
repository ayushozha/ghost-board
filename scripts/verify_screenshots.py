#!/usr/bin/env python3
"""Verify screenshot files in demo/screenshots/.

Checks each file for:
- PNG files: existence, file size > 50KB, dimensions (if PIL available)
- TXT placeholder files: marks as PLACEHOLDER (not yet captured)

Prints a clear PASS/FAIL summary for each file and a total at the end.
"""

import os
import sys
from pathlib import Path

# Expected screenshots and their descriptions
EXPECTED_SCREENSHOTS = {
    "01_mission_control": "Screen 1: Dark terminal input with LAUNCH SPRINT button",
    "02_boardroom": "Screen 2: 5 AI agent cards with connection lines",
    "03_market_arena": "Screen 3: 3D globe with persona dots, sentiment charts",
    "04_pivot_timeline": "Screen 4: Horizontal timeline with colored event nodes",
    "05_sprint_report": "Screen 5: Tabbed artifacts view with prototype, financial, GTM, compliance",
    "06_landing_page": "Marketing page with hero, how it works, numbers, credits",
}

MIN_PNG_SIZE_KB = 50


def try_get_dimensions(filepath: Path):
    """Try to read PNG dimensions using PIL. Returns (width, height) or None."""
    try:
        from PIL import Image

        with Image.open(filepath) as img:
            return img.size
    except ImportError:
        return None
    except Exception:
        return None


def verify_screenshots():
    """Scan demo/screenshots/ and verify each file."""
    repo_root = Path(__file__).resolve().parent.parent
    screenshots_dir = repo_root / "demo" / "screenshots"

    if not screenshots_dir.exists():
        print(f"FAIL: Directory {screenshots_dir} does not exist")
        sys.exit(1)

    # Collect all files in the directory
    all_files = {}
    for f in screenshots_dir.iterdir():
        if f.name == "README.md":
            continue
        stem = f.stem
        all_files[stem] = f

    verified = 0
    placeholders = 0
    failed = 0
    total = 0
    results = []

    # Check expected screenshots
    for name, description in EXPECTED_SCREENSHOTS.items():
        total += 1
        png_path = screenshots_dir / f"{name}.png"
        txt_path = screenshots_dir / f"{name}.txt"

        if png_path.exists():
            size_kb = png_path.stat().st_size / 1024
            if size_kb < MIN_PNG_SIZE_KB:
                status = "FAIL"
                detail = f"PNG too small: {size_kb:.1f}KB (minimum {MIN_PNG_SIZE_KB}KB)"
                failed += 1
            else:
                dims = try_get_dimensions(png_path)
                if dims:
                    detail = f"PNG OK: {size_kb:.1f}KB, {dims[0]}x{dims[1]}px"
                else:
                    detail = f"PNG OK: {size_kb:.1f}KB (dimensions: PIL not available)"
                status = "PASS"
                verified += 1
        elif txt_path.exists():
            status = "PLACEHOLDER"
            detail = "TXT placeholder exists, screenshot not yet captured"
            placeholders += 1
        else:
            status = "FAIL"
            detail = "No PNG or TXT file found"
            failed += 1

        results.append((name, status, description, detail))

    # Check for unexpected files
    expected_stems = set(EXPECTED_SCREENSHOTS.keys())
    for stem, filepath in sorted(all_files.items()):
        if stem not in expected_stems:
            total += 1
            ext = filepath.suffix
            if ext == ".png":
                size_kb = filepath.stat().st_size / 1024
                if size_kb >= MIN_PNG_SIZE_KB:
                    dims = try_get_dimensions(filepath)
                    if dims:
                        detail = f"PNG OK: {size_kb:.1f}KB, {dims[0]}x{dims[1]}px (unexpected file)"
                    else:
                        detail = f"PNG OK: {size_kb:.1f}KB (unexpected file)"
                    status = "PASS"
                    verified += 1
                else:
                    detail = f"PNG too small: {size_kb:.1f}KB (unexpected file)"
                    status = "FAIL"
                    failed += 1
            elif ext == ".txt":
                status = "PLACEHOLDER"
                detail = "TXT placeholder (unexpected file)"
                placeholders += 1
            else:
                status = "SKIP"
                detail = f"Unknown file type: {ext}"

            results.append((stem, status, "(extra)", detail))

    # Print results
    print("=" * 70)
    print("  SCREENSHOT VERIFICATION REPORT")
    print("=" * 70)
    print()

    for name, status, description, detail in results:
        if status == "PASS":
            icon = "[PASS]       "
        elif status == "PLACEHOLDER":
            icon = "[PLACEHOLDER]"
        elif status == "FAIL":
            icon = "[FAIL]       "
        else:
            icon = "[SKIP]       "

        print(f"  {icon}  {name}")
        print(f"               {description}")
        print(f"               {detail}")
        print()

    # Summary
    print("=" * 70)
    print(f"  SUMMARY: {verified}/{total} screenshots verified, {placeholders} placeholders, {failed} failed")
    print("=" * 70)

    if failed > 0:
        print("\n  To capture screenshots, run: python scripts/capture_demo.py")
        sys.exit(1)
    elif placeholders > 0:
        print("\n  To capture screenshots, run: python scripts/capture_demo.py")
        sys.exit(0)
    else:
        print("\n  All screenshots verified!")
        sys.exit(0)


if __name__ == "__main__":
    verify_screenshots()

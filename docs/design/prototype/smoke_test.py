"""Smoke tests and screenshots for the clickable prototype.

Run: uv run --with playwright python docs/design/prototype/smoke_test.py --out /tmp/xp-shots

Extending (later tasks):
  - add a test:        @test  def test_x(ctx): ...   (ctx.page(), ctx.url(...))
  - add a screenshot:  SCREENSHOT_VIEWS.append(("name", lambda page: page.evaluate("...")))
    The step runs after the page loaded (with ?fast=1) and before the shot.
Any failed test or console error makes the script exit non-zero.
"""
import argparse
import re
import sys
import traceback
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
INDEX = (ROOT / "index.html").as_uri()

TESTS = []
SCREENSHOT_VIEWS = [
  ("shell", lambda page: None),
]
SIZES = [(1280, 800), (800, 1100), (400, 860)]
THEMES = ["light", "dark"]


def test(fn):
  TESTS.append(fn)
  return fn


class Ctx:
  def __init__(self, browser):
    self.browser = browser
    self.errors = []

  def url(self, query="fast=1"):
    return INDEX + ("?" + query if query else "")

  def page(self, width=1280, height=800, init_script=None, query="fast=1"):
    context = self.browser.new_context(viewport={"width": width, "height": height})
    if init_script:
      context.add_init_script(init_script)
    page = context.new_page()
    page.on("console", lambda m: m.type == "error" and self.errors.append(f"console: {m.text}"))
    page.on("pageerror", lambda e: self.errors.append(f"pageerror: {e}"))
    page.goto(self.url(query))
    return page


@test
def test_shell_renders(ctx):
  page = ctx.page()
  for tid in ("topbar", "rail", "editor"):
    assert page.locator(f"[data-testid={tid}]").is_visible(), f"{tid} not visible"
  page.context.close()


@test
def test_theme_persists(ctx):
  page = ctx.page()
  start = page.evaluate("document.documentElement.dataset.theme")
  page.click("[data-testid=theme-toggle]")
  page.reload()
  want = "light" if start == "dark" else "dark"
  got = page.evaluate("document.documentElement.dataset.theme")
  assert got == want, f"theme after reload {got}, expected {want}"
  assert want == "light" or start == "light"
  page.context.close()


@test
def test_storage_throws(ctx):
  script = (
    "Object.defineProperty(window,'localStorage',{get(){throw new Error('denied')}});"
  )
  page = ctx.page(init_script=script)
  assert page.locator("[data-testid=topbar]").is_visible()
  assert page.locator("[data-testid=editor]").is_visible()
  page.click("[data-testid=theme-toggle]")  # must not throw either
  page.context.close()


@test
def test_workspace_switch_and_rail(ctx):
  page = ctx.page()
  page.click("[data-testid=ws-switcher]")
  page.click("[data-ws=commissioning]")
  assert page.evaluate("XP.state.workspace") == "commissioning"
  page.click("[data-view=queue]")
  assert page.evaluate("XP.state.view") == "queue"
  page.click("[data-testid=rail-toggle]")
  assert page.evaluate("XP.state.railExpanded") is False
  page.context.close()


@test
def test_no_horizontal_scroll_narrow(ctx):
  page = ctx.page(400, 860)
  assert page.evaluate("document.body.scrollWidth <= document.body.clientWidth")
  page.context.close()


@test
def test_no_hex_outside_tokens(ctx):
  pat = re.compile(r"#[0-9a-fA-F]{3,8}\b")
  bad = []
  for f in ROOT.iterdir():
    if f.suffix in (".css", ".js") and f.name != "tokens.css":
      for n, line in enumerate(f.read_text().splitlines(), 1):
        if pat.search(re.sub(r"url\([^)]*\)", "", line)):
          bad.append(f"{f.name}:{n}: {line.strip()}")
  assert not bad, "hex color literals outside tokens.css:\n" + "\n".join(bad)


def screenshots(ctx, out):
  out.mkdir(parents=True, exist_ok=True)
  count = 0
  for name, step in SCREENSHOT_VIEWS:
    for theme in THEMES:
      for w, h in SIZES:
        page = ctx.page(w, h)
        page.evaluate(f"XP.set({{theme:'{theme}'}})")
        step(page)
        page.wait_for_timeout(50)
        page.screenshot(path=str(out / f"{name}-{theme}-{w}.png"))
        count += 1
        page.context.close()
  return count


def main():
  ap = argparse.ArgumentParser()
  ap.add_argument("--out", default="/tmp/xp-shots")
  args = ap.parse_args()
  failed = []
  with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = Ctx(browser)
    for fn in TESTS:
      before = len(ctx.errors)
      try:
        fn(ctx)
        if len(ctx.errors) > before:
          raise AssertionError("; ".join(ctx.errors[before:]))
        print(f"PASS {fn.__name__}")
      except Exception as e:  # noqa: BLE001
        failed.append(fn.__name__)
        print(f"FAIL {fn.__name__}: {e}")
        traceback.print_exc(limit=2)
    try:
      n = screenshots(ctx, Path(args.out))
      print(f"{n} screenshots in {args.out}")
    except Exception as e:  # noqa: BLE001
      failed.append("screenshots")
      print(f"FAIL screenshots: {e}")
    if ctx.errors and "screenshots" not in failed:
      failed.append("console-errors")
      print("FAIL console errors:\n" + "\n".join(ctx.errors))
    browser.close()
  if failed:
    print(f"\n{len(failed)} FAILED: {', '.join(failed)}")
    sys.exit(1)
  print(f"\nall {len(TESTS)} tests passed")


if __name__ == "__main__":
  main()

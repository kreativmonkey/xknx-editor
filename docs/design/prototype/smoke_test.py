"""Smoke tests and screenshots for the clickable prototype.

Run: uv run --with playwright python docs/design/prototype/smoke_test.py --out /tmp/xp-shots

Extending (later tasks):
  - add a test:        @test  def test_x(ctx): ...   (ctx.page(), ctx.url(...))
  - add a screenshot:  SCREENSHOT_VIEWS.append(("name", lambda page: page.evaluate("...")))
    The step runs after the page loaded (with ?fast=1) and before the shot.
Any failed test or console error makes the script exit non-zero.
"""
import argparse
import os
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
  ("list-preview", lambda page: page.evaluate("XP.openObject('device','1.1.4')")),
  ("tabs-many", lambda page: page.evaluate("XP.data.devices.slice(0,12).forEach(d => XP.openObject('device', d.address, {pin:true}))")),
  ("devices", lambda page: page.evaluate("XP.openObject('device','1.1.4',{pin:true})")),
  ("groupObjects", lambda page: page.evaluate(
    "XP.openObject('device','1.1.4',{pin:true}); XP.planning.mode('1.1.4','objects'); XP.planning.select('1.1.4',['go1','go4'])")),
  ("groupAddresses", lambda page: page.evaluate("XP.set({view:'groupAddresses'}); XP.openObject('groupAddress','1/2/3',{pin:true})")),
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
    page.set_default_timeout(int(os.environ.get("XP_TIMEOUT", "30000")))
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


def open_devices(page, addrs, pin=True):
  page.evaluate(
    "([a,p]) => a.forEach(x => XP.openObject('device', x, {pin: p}))", [addrs, pin]
  )


def tab_count(page):
  return page.locator("[data-testid=tabs] [data-tab]").count()


@test
def test_preview_tab_replaced(ctx):
  page = ctx.page()
  page.click("[data-row='1.1.4']")
  page.click("[data-row='1.1.12']")
  assert tab_count(page) == 1, tab_count(page)
  tab = page.locator("[data-testid=tabs] [data-tab]")
  assert tab.get_attribute("data-tab") == "device:1.1.12"
  assert page.evaluate("getComputedStyle(document.querySelector('.tab .tl')).fontStyle") == "italic"
  assert "1.1.12" in page.locator("[data-testid=editor]").inner_text()
  page.context.close()


@test
def test_double_click_pins(ctx):
  page = ctx.page()
  page.dblclick("[data-row='1.1.4']")
  assert tab_count(page) == 1
  assert page.evaluate("getComputedStyle(document.querySelector('.tab .tl')).fontStyle") != "italic"
  page.click("[data-row='1.1.12']")
  assert tab_count(page) == 2, tab_count(page)
  # Enter on the focused row pins the preview
  page.keyboard.press("Enter")
  assert page.evaluate("XP.state.tabs.filter(t => t.pinned).length") == 2
  page.keyboard.press("ArrowDown")
  assert page.evaluate("XP.state.selection.device") == "1.2.1"
  assert tab_count(page) == 3
  page.context.close()


@test
def test_close_active_tab_activates_neighbour(ctx):
  page = ctx.page()
  open_devices(page, ["1.1.4", "1.1.5", "1.1.6"])
  page.click("[data-tab='device:1.1.5']")
  assert page.evaluate("XP.state.activeTab") == "device:1.1.5"
  page.click("[data-tab='device:1.1.5'] [data-action=closeTab]")
  assert page.evaluate("XP.state.activeTab") == "device:1.1.6"
  page.click("[data-tab='device:1.1.6'] [data-action=closeTab]")
  assert page.evaluate("XP.state.activeTab") == "device:1.1.4"
  page.click("[data-tab='device:1.1.4'] [data-action=closeTab]")
  assert page.locator("[data-testid=editor-empty]").is_visible()
  page.context.close()


@test
def test_many_tabs_active_visible(ctx):
  page = ctx.page()
  addrs = page.evaluate("XP.data.devices.slice(0, 12).map(d => d.address)")
  open_devices(page, addrs)
  assert tab_count(page) == 12
  inside = page.evaluate(
    """() => {
      const s = document.querySelector('[data-testid=tabs]').getBoundingClientRect();
      const t = document.querySelector('.tab.on').getBoundingClientRect();
      return t.left >= s.left - 1 && t.right <= s.right + 1 && t.top >= s.top - 1 && t.bottom <= s.bottom + 1;
    }"""
  )
  assert inside, "active tab outside the strip"
  assert page.evaluate("document.querySelector('[data-testid=tabs]').scrollWidth > document.querySelector('[data-testid=tabs]').clientWidth")
  page.click("[data-tab='device:" + addrs[0] + "']")
  assert page.evaluate(
    """() => {
      const s = document.querySelector('[data-testid=tabs]').getBoundingClientRect();
      const t = document.querySelector('.tab.on').getBoundingClientRect();
      return t.left >= s.left - 1 && t.right <= s.right + 1;
    }"""
  )
  # the close button is visible without hover
  assert page.locator(".tab.on [data-action=closeTab]").is_visible()
  page.context.close()


@test
def test_long_name_narrow_no_hscroll(ctx):
  page = ctx.page(400, 860)
  assert page.evaluate("document.body.scrollWidth <= innerWidth")
  assert page.evaluate("document.querySelector('[data-testid=topbar]').scrollWidth <= document.querySelector('[data-testid=topbar]').clientWidth")
  row = "[data-row='1.2.9'] .nm"
  assert page.evaluate(f"getComputedStyle(document.querySelector(\"{row}\")).textOverflow") == "ellipsis"
  page.click("[data-row='1.2.9']")
  assert page.evaluate("document.body.scrollWidth <= innerWidth")
  assert page.evaluate("document.querySelector('[data-testid=tabs]').getBoundingClientRect().right <= innerWidth + 1")
  page.context.close()


@test
def test_breakpoints(ctx):
  page = ctx.page(1280, 800)
  assert page.locator(".rail .item .lbl").first.is_visible()
  assert page.locator("[data-testid=list]").is_visible()
  assert page.evaluate("XP.formFactor()") == "wide"
  page.context.close()
  page = ctx.page(800, 1100)
  assert not page.locator(".rail .item .lbl").first.is_visible()
  assert page.locator("[data-testid=list]").count() == 0
  assert page.locator("[data-testid=list-button]").inner_text().strip() == "Liste"
  page.click("[data-testid=list-button]")
  assert page.locator("[data-testid=drawer]").is_visible()
  page.click("[data-row='1.1.4']")
  assert page.locator("[data-testid=drawer]").count() == 0
  assert page.evaluate("XP.state.activeTab") == "device:1.1.4"
  page.context.close()
  page = ctx.page(400, 860)
  assert page.locator("[data-testid=list]").is_visible()
  assert not page.locator("[data-testid=editor]").is_visible()
  page.click("[data-row='1.1.4']")
  assert page.locator("[data-testid=editor]").is_visible()
  assert page.locator("[data-testid=back]").is_visible()
  page.click("[data-testid=back]")
  assert page.locator("[data-testid=list]").is_visible()
  assert not page.locator("[data-testid=editor]").is_visible()
  page.context.close()


@test
def test_form_factor_hysteresis(ctx):
  page = ctx.page(1000, 800)
  assert page.evaluate("XP.formFactor()") == "wide"
  page.set_viewport_size({"width": 980, "height": 800})
  assert page.evaluate("XP.formFactor()") == "wide"
  page.set_viewport_size({"width": 950, "height": 800})
  assert page.evaluate("XP.formFactor()") == "tablet"
  page.set_viewport_size({"width": 1020, "height": 800})
  assert page.evaluate("XP.formFactor()") == "tablet"
  page.set_viewport_size({"width": 1050, "height": 800})
  assert page.evaluate("XP.formFactor()") == "wide"
  page.wait_for_function("document.documentElement.dataset.ff === 'wide'")
  assert page.locator("[data-testid=list]").is_visible()
  page.context.close()


def drag_splitter(page, dx):
  box = page.locator("[data-testid=splitter-list]").bounding_box()
  x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
  page.mouse.move(x, y)
  page.mouse.down()
  page.mouse.move(x + dx / 2, y, steps=4)
  page.mouse.move(x + dx, y, steps=4)
  page.mouse.up()


@test
def test_hide_and_resize_persist(ctx):
  page = ctx.page()
  before = page.evaluate("XP.state.widths.list")
  drag_splitter(page, 80)
  after = page.evaluate("XP.state.widths.list")
  assert abs(after - before - 80) <= 2, (before, after)
  assert abs(page.locator("[data-testid=list]").bounding_box()["width"] - after) <= 2
  page.click("[data-testid=view-menu-btn]")
  page.click("[data-testid=toggle-list]")
  assert page.locator("[data-testid=list]").count() == 0
  page.reload()
  assert page.locator("[data-testid=list]").count() == 0
  assert page.evaluate("XP.state.widths.list") == after
  assert page.evaluate("XP.state.hidden.list") is True
  page.click("[data-testid=view-menu-btn]")
  page.click("[data-testid=toggle-list]")
  assert abs(page.locator("[data-testid=list]").bounding_box()["width"] - after) <= 2
  page.context.close()


@test
def test_save_workspace(ctx):
  page = ctx.page()
  drag_splitter(page, 60)
  width = page.evaluate("XP.state.widths.list")
  page.click("[data-testid=view-menu-btn]")
  page.click("[data-testid=toggle-list]")
  page.click("[data-testid=view-menu-btn]")
  page.click("[data-testid=save-workspace]")
  page.fill("[data-testid=ws-name]", "Mein Büro")
  page.click("[data-testid=ws-save]")
  assert page.locator("[data-testid=dialog]").count() == 0
  assert "Mein Büro" in page.locator("[data-testid=ws-switcher]").inner_text()
  # change layout, then restore through the switcher
  page.evaluate("XP.set({hidden: {list: false, inspector: false}, widths: {list: 240, inspector: 300}})")
  page.click("[data-testid=ws-switcher]")
  page.click("[data-testid=ws-menu] >> text=Planen")
  page.click("[data-testid=ws-switcher]")
  page.click("[data-testid=ws-menu] >> text=Mein Büro")
  assert page.evaluate("XP.state.hidden.list") is True
  assert page.evaluate("XP.state.widths.list") == width
  assert page.locator("[data-testid=list]").count() == 0
  page.reload()
  assert "Mein Büro" in page.locator("[data-testid=ws-switcher]").inner_text()
  assert page.locator(".rail .item").count() > 0
  page.context.close()


@test
def test_load_merges_defaults(ctx):
  script = (
    "localStorage.setItem('xp-prototype-v1', JSON.stringify("
    "{widths: null, hidden: {list: true}, customWorkspaces: 5, railExpanded: 'x'}));"
  )
  page = ctx.page(init_script=script)
  assert page.evaluate("XP.state.widths.list") == 280
  assert page.evaluate("XP.state.widths.inspector") == 300
  assert page.evaluate("XP.state.hidden.list") is True
  assert page.evaluate("XP.state.hidden.inspector") is False
  assert page.evaluate("Array.isArray(XP.state.customWorkspaces)")
  assert page.locator("[data-testid=rail]").is_visible()
  page.context.close()


@test
def test_escape_closes_menus(ctx):
  page = ctx.page()
  page.click("[data-testid=ws-switcher]")
  assert page.locator("[data-testid=ws-menu]").is_visible()
  page.keyboard.press("Escape")
  assert page.locator("[data-testid=ws-menu]").count() == 0
  page.click("[data-testid=view-menu-btn]")
  assert page.locator("[data-testid=view-menu]").is_visible()
  page.keyboard.press("Escape")
  assert page.locator("[data-testid=view-menu]").count() == 0
  page.click("[data-testid=view-menu-btn]")
  page.click("[data-testid=save-workspace]")
  assert page.locator("[data-testid=dialog]").is_visible()
  page.keyboard.press("Escape")
  assert page.locator("[data-testid=dialog]").count() == 0
  page.context.close()


@test
def test_long_press_dispatches_contextmenu(ctx):
  page = ctx.page()
  page.evaluate(
    "window.__ctx = []; document.addEventListener('contextmenu', e => window.__ctx.push(e.target.closest('[data-row]') && e.target.closest('[data-row]').dataset.row))"
  )
  box = page.locator("[data-row='1.1.4']").bounding_box()
  x, y = box["x"] + 40, box["y"] + box["height"] / 2
  page.mouse.move(x, y)
  page.mouse.down()
  page.wait_for_timeout(300)
  assert page.evaluate("window.__ctx.length") == 0
  page.wait_for_timeout(350)
  page.mouse.up()
  assert page.evaluate("window.__ctx") == ["1.1.4"], page.evaluate("window.__ctx")
  assert tab_count(page) == 0, "the release after a long press must not open the row"
  # moving more than 8 px cancels
  page.mouse.move(x, y)
  page.mouse.down()
  page.mouse.move(x + 12, y + 1)
  page.wait_for_timeout(650)
  page.mouse.up()
  assert page.evaluate("window.__ctx.length") == 1
  page.context.close()


@test
def test_narrow_nav_drawer(ctx):
  page = ctx.page(400, 860)
  assert page.locator("[data-testid=rail]").count() == 0
  assert page.locator("[data-testid=nav-drawer]").count() == 0
  assert page.locator("[data-testid=nav-button]").is_visible()
  page.click("[data-testid=nav-button]")
  assert page.locator("[data-testid=nav-drawer]").is_visible()
  assert page.locator("[data-testid=nav-drawer] .item .lbl").first.is_visible()
  assert page.evaluate("document.body.scrollWidth <= innerWidth")
  page.keyboard.press("Escape")
  assert page.locator("[data-testid=nav-drawer]").count() == 0
  page.click("[data-testid=nav-button]")
  page.click("[data-testid=nav-drawer] [data-view=groupAddresses]")
  assert page.locator("[data-testid=nav-drawer]").count() == 0
  assert page.evaluate("XP.state.view") == "groupAddresses"
  assert page.locator("[data-testid=list]").is_visible()
  # the Ansicht menu is a separate control
  page.click("[data-testid=view-menu-btn]")
  assert page.locator("[data-testid=view-menu]").is_visible()
  page.context.close()
  page = ctx.page(1280, 800)
  assert not page.locator("[data-testid=nav-button]").is_visible()
  page.context.close()


@test
def test_pin_button_touch_flow(ctx):
  page = ctx.page(800, 1100)
  page.click("[data-testid=list-button]")
  page.click("[data-row='1.1.4']")
  page.click("[data-testid=pin-tab]")
  assert page.evaluate("XP.state.tabs.map(t => t.pinned)") == [True]
  assert page.locator("[data-testid=pin-tab]").count() == 0
  page.click("[data-testid=list-button]")
  page.click("[data-row='1.1.12']")
  assert tab_count(page) == 2, tab_count(page)
  assert page.locator("[data-testid=pin-tab]").is_visible()
  page.context.close()


def open_objects(page, addr="1.1.4"):
  page.click(f"[data-row='{addr}']")
  page.click("[data-testid=mode-objects]")


@test
def test_device_editor_page_list(ctx):
  page = ctx.page()
  page.click("[data-row='1.1.4']")
  texts = [t.strip() for t in page.locator("[data-testid=page-list] [data-page]").all_inner_texts()]
  assert texts == ["Allgemein"] + [f"Kanal {c}" for c in "ABCDEFGH"], texts
  assert page.locator("[data-page='chA'][data-modified]").count() == 1
  assert page.locator("[data-testid=page-list] [data-modified]").count() == 1
  assert page.locator("[data-testid=editor] .seg").count() == 1
  seg = page.locator("[data-testid=editor] .seg").inner_text()
  assert "Parameter" in seg and "Gruppenobjekte" in seg, seg
  assert page.locator("[data-testid=editor] [role=tablist]").count() == 0
  page.context.close()


@test
def test_changed_filter(ctx):
  page = ctx.page()
  page.click("[data-row='1.1.4']")
  assert page.locator("[data-testid=filter-changed]").inner_text().strip() == "Geändert (3)"
  page.click("[data-testid=filter-changed]")
  assert page.locator("[data-testid=param-list] [data-param]").count() == 3
  page.click("[data-testid=filter-all]")
  total = page.locator("[data-testid=param-list] [data-param]").count()
  page.fill("[data-testid=param-filter]", "Treppen")
  texts = page.locator("[data-testid=param-list] [data-param]").all_inner_texts()
  assert 1 <= len(texts) < total and all("Treppen" in t for t in texts), texts
  page.context.close()


@test
def test_param_edit_pins_and_resets(ctx):
  page = ctx.page()
  page.click("[data-row='1.1.4']")
  assert page.evaluate("XP.state.tabs.map(t => t.pinned)") == [False]
  page.click("[data-page='chB']")
  sel = page.locator("[data-testid=param-list] [data-param] select").first
  sel.select_option("Öffner")
  assert page.evaluate("XP.state.tabs.map(t => t.pinned)") == [True]
  assert page.locator("[data-testid=filter-changed]").inner_text().strip() == "Geändert (4)"
  assert page.locator("[data-page='chB'][data-modified]").count() == 1
  page.click("[data-testid=param-list] [data-action=resetParam]")
  assert page.locator("[data-testid=filter-changed]").inner_text().strip() == "Geändert (3)"
  assert page.locator("[data-page='chB'][data-modified]").count() == 0
  page.context.close()


@test
def test_first_edit_pins_every_kind(ctx):
  pinned = "XP.state.tabs.map(t => t.pinned)"
  page = ctx.page()  # reset
  page.click("[data-row='1.1.4']")
  page.click("[data-testid=param-list] [data-action=resetParam]")
  assert page.evaluate(pinned) == [True], "reset"
  page.context.close()
  page = ctx.page()  # inspector change
  open_objects(page)
  assert page.evaluate(pinned) == [False]
  page.click("[data-row='go1']")
  page.select_option("[data-testid=insp-dpt]", "1.003")
  assert page.evaluate(pinned) == [True], "inspector"
  page.context.close()
  page = ctx.page()  # rename
  open_objects(page)
  page.click("[data-row='go1']")
  page.keyboard.press("F2")
  page.fill("[data-testid=rename-input]", "Licht Decke")
  page.keyboard.press("Enter")
  assert page.evaluate(pinned) == [True], "rename"
  assert "Licht Decke" in page.locator("[data-row='go1']").inner_text()
  page.context.close()


@test
def test_wheel_does_not_change_value(ctx):
  page = ctx.page()
  page.click("[data-row='1.1.4']")
  sel = page.locator("[data-testid=param-list] [data-param] select").first
  before = sel.input_value()
  sel.hover()
  page.mouse.wheel(0, 120)
  page.mouse.wheel(0, -240)
  assert sel.input_value() == before
  page.fill("[data-testid=param-filter]", "")
  page.click("[data-page=general]")
  num = page.locator("[data-testid=param-list] input[type=number]").first
  num.focus()
  v = num.input_value()
  num.hover()
  page.mouse.wheel(0, 120)
  assert num.input_value() == v
  page.context.close()


@test
def test_group_objects_rows_have_no_inputs(ctx):
  page = ctx.page()
  open_objects(page)
  assert page.locator("table [data-row]").count() == 9
  assert page.locator("table [data-row] :is(input,select,textarea,[contenteditable])").count() == 0
  first = page.locator("table [data-row='go1']")
  assert first.locator(".flags").inner_text().replace("\n", "").replace(" ", "") == "KLSÜA"
  assert first.locator(".flags b").count() == 3
  assert first.locator(".chip").inner_text().strip() == "1/2/3"
  page.context.close()


@test
def test_multiselect_inspector(ctx):
  page = ctx.page()
  open_objects(page)
  page.click("[data-row='go1']")
  assert page.locator("[data-testid=inspector-title]").inner_text().strip() == "Kanal A Schalten"
  page.click("[data-row='go4']", modifiers=["Control"])
  assert page.locator("[data-testid=inspector-title]").inner_text().strip() == "2 Objekte"
  page.select_option("[data-testid=insp-dpt]", "1.003")
  for r in ("go1", "go4"):
    assert page.locator(f"[data-row='{r}'] .typ").inner_text().strip() == "Freigeben", r
  assert page.locator("[data-row='go7'] .typ").inner_text().strip() == "Schalten"
  # shift range
  page.click("[data-row='go1']")
  page.click("[data-row='go7']", modifiers=["Shift"])
  assert page.locator("[data-testid=inspector-title]").inner_text().strip() == "3 Objekte"
  page.context.close()


@test
def test_context_menu_long_press(ctx):
  page = ctx.page()
  open_objects(page)
  box = page.locator("[data-row='go1']").bounding_box()
  x, y = box["x"] + 60, box["y"] + box["height"] / 2
  page.mouse.move(x, y)
  page.mouse.down()
  page.wait_for_timeout(300)
  assert page.locator("[data-testid=context-menu]").count() == 0
  page.wait_for_timeout(350)
  page.mouse.up()
  menu = page.locator("[data-testid=context-menu]")
  assert menu.is_visible()
  assert "Verknüpfen…" in menu.inner_text()
  assert menu.locator("button").count() >= 3
  page.keyboard.press("Escape")
  assert menu.count() == 0
  page.click("[data-row='go4']", button="right")
  assert menu.is_visible()
  page.mouse.click(5, 400)  # outside
  assert menu.count() == 0
  # link dialog from the menu
  page.click("[data-row='go4']", button="right")
  page.click("[data-testid=context-menu] >> text=Verknüpfen…")
  assert page.locator("[data-testid=dialog]").is_visible()
  page.select_option("[data-testid=link-ga]", "1/2/7")
  page.click("[data-testid=link-confirm]")
  assert "1/2/7" in page.locator("[data-row='go4']").inner_text()
  # device row menu
  page.click("[data-row='1.1.12']", button="right")
  assert "Anheften" in menu.inner_text()
  page.keyboard.press("Escape")
  page.context.close()


@test
def test_ga_tree(ctx):
  page = ctx.page()
  page.click("[data-view=groupAddresses]")
  tree = page.locator("[data-testid=ga-tree]")
  assert tree.locator("[data-level=main]").count() == 3
  assert tree.locator(":is(input,select,textarea,[contenteditable])").count() == 0
  assert tree.locator("[data-row='1/2/3']").count() == 1
  page.click("[data-level=main][data-group='1']")
  assert tree.locator("[data-row='1/2/3']").count() == 0
  assert page.locator("[data-level=main][data-group='1']").get_attribute("aria-expanded") == "false"
  page.click("[data-level=main][data-group='1']")
  assert tree.locator("[data-row='1/2/3']").count() == 1
  page.click("[data-row='1/2/3']")
  assert page.evaluate("XP.state.activeTab") == "groupAddress:1/2/3"
  links = page.locator("[data-testid=ga-links] tbody tr")
  assert links.count() == 3, links.count()
  txt = page.locator("[data-testid=ga-links]").inner_text()
  assert "Kanal A Schalten" in txt and "Taste 1 Schalten" in txt
  assert "Licht Küche" in page.locator("[data-testid=editor]").inner_text()
  page.click("[data-testid=ga-links] [data-action=gotoGo] >> nth=0")
  assert page.evaluate("XP.state.activeTab").startswith("device:")
  page.context.close()


@test
def test_inspector_dock_and_sheet(ctx):
  page = ctx.page()
  open_objects(page)
  box = page.locator("[data-testid=inspector]").bounding_box()
  assert abs(box["width"] - 280) <= 1, box
  page.click("[data-testid=view-menu-btn]")
  page.click("[data-testid=toggle-inspector]")
  assert page.locator("[data-testid=inspector]").count() == 0
  page.click("[data-testid=view-menu-btn]")
  page.click("[data-testid=toggle-inspector]")
  assert page.locator("[data-testid=inspector]").is_visible()
  page.context.close()
  page = ctx.page(800, 1100)
  page.click("[data-testid=list-button]")
  page.click("[data-row='1.1.4']")
  assert page.locator("[data-testid=inspector]").count() == 0
  page.click("[data-testid=inspector-button]")
  sheet = page.locator("[data-testid=inspector]")
  assert sheet.is_visible()
  b = sheet.bounding_box()
  assert b["y"] > 300 and abs(b["y"] + b["height"] - 1100) <= 2, b  # bottom sheet
  page.keyboard.press("Escape")
  assert page.locator("[data-testid=inspector]").count() == 0
  page.click("[data-testid=view-menu-btn]")
  page.click("[data-testid=toggle-inspector]")  # the menu entry drives the sheet
  assert page.locator("[data-testid=inspector]").is_visible()
  page.click("[data-testid=inspector-close]")
  assert page.locator("[data-testid=inspector]").count() == 0
  page.context.close()
  page = ctx.page(400, 860)
  page.click("[data-row='1.1.4']")
  page.click("[data-testid=inspector-button]")
  b = page.locator("[data-testid=inspector]").bounding_box()
  assert b["width"] >= 399 and b["height"] >= 850, b  # full-screen sheet
  assert page.evaluate("document.body.scrollWidth <= innerWidth")
  page.click("[data-testid=inspector-close]")
  assert page.locator("[data-testid=inspector]").count() == 0
  page.context.close()


@test
def test_placeholder_views(ctx):
  page = ctx.page()
  for view in ("buildings", "busDiagram", "catalog", "health", "history"):
    page.click(f"[data-view={view}]")
    ph = page.locator("[data-testid=placeholder]")
    assert ph.is_visible(), view
    assert ph.locator(".t-title").inner_text().strip() == page.evaluate(f"XP.VIEWS.{view}.label")
    assert ph.locator("[data-row]").count() == 0
  page.context.close()


@test
def test_device_editor_long_names_narrow(ctx):
  page = ctx.page(400, 860)
  page.click("[data-row='1.2.9']")
  assert page.evaluate("document.body.scrollWidth <= innerWidth")
  page.click("[data-testid=mode-objects]")
  assert page.evaluate("document.body.scrollWidth <= innerWidth")
  page.context.close()


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

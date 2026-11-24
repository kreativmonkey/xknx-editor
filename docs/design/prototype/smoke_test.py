"""Smoke tests and screenshots for the clickable prototype.

Run: uv run --with playwright==1.64.0 python docs/design/prototype/smoke_test.py --out /tmp/xp-shots

Extending (later tasks):
  - add a test:        @test  def test_x(ctx): ...   (ctx.page(), ctx.url(...))
  - add a screenshot:  SCREENSHOT_VIEWS.append(("name", lambda page: page.evaluate("...")))
    The step runs after the page loaded (with ?fast=1) and before the shot.
Any failed test, console error or network request (every http(s) request is blocked and
recorded: the prototype must run without network) makes the script exit non-zero.
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
  ("devices-building", lambda page: page.evaluate("XP.set({deviceGrouping:'building'}); XP.openObject('device','1.1.4',{pin:true})")),
  ("groupAddresses", lambda page: page.evaluate("XP.set({view:'groupAddresses'}); XP.openObject('groupAddress','1/2/3',{pin:true})")),
  ("groupAddresses-group", lambda page: page.evaluate("XP.set({view:'groupAddresses'}); XP.openObject('gaGroup','1',{pin:true})")),
  ("inlineRename", lambda page: page.evaluate(
    "XP.set({view:'groupAddresses'}); XP.openObject('groupAddress','1/2/3',{pin:true}); XP.renameInline('groupAddress','1/2/3','row')")),
  ("inlineRenameTitle", lambda page: page.evaluate(
    "XP.set({view:'groupAddresses'}); XP.openObject('groupAddress','1/2/3',{pin:true}); XP.renameInline('groupAddress','1/2/3','head'); XP.state.inl.err='Der Name darf nicht leer sein.'; XP.set({})")),
  ("gaAddress", lambda page: page.evaluate("XP.set({view:'groupAddresses'}); XP.openObject('groupAddress','2/1/1',{pin:true})")),
  ("gaAddressEdit", lambda page: page.evaluate(
    "XP.set({view:'groupAddresses'}); XP.openObject('groupAddress','2/1/1',{pin:true}); XP.changeGaAddress('2/1/1'); XP.state.addrEdit.value='2/5/1'; XP.set({})")),
  ("gaCreate", lambda page: page.evaluate("XP.set({view:'groupAddresses'}); XP.gaCreate('ga','1/2')")),
  ("commissioning", lambda page: page.evaluate(
    "XP.set({workspace:'commissioning', view:'commissioningDevices'}); XP.openObject('commissioningDevice','1.1.4',{pin:true}); XP.queue.enqueue('1.1.5','all')")),
  ("changeAddress", lambda page: page.evaluate(
    "XP.set({workspace:'commissioning', view:'commissioningDevices'}); XP.openObject('commissioningDevice','1.1.4',{pin:true}); XP.openDialog('changeAddress',{ref:'1.1.4'})")),
  ("diagnostics", lambda page: page.evaluate("XP.set({workspace:'diagnostics', view:'groupMonitor', connected:true})")),
  ("handover", lambda page: page.evaluate("XP.set({workspace:'handover', view:'projectInfo'})")),
  ("settings", lambda page: page.evaluate("XP.openSetting('t-ack')")),
  ("palette", lambda page: page.evaluate("XP.palette.open('Licht')")),
  ("replaceDevice", lambda page: page.evaluate(
    "XP.set({workspace:'commissioning', view:'commissioningDevices'}); XP.openDialog('replace',{ref:'1.1.5'}); Object.assign(XP.state.dialog,{step:3,model:'other',found:true}); XP.render()")),
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
    self.requests = []

  def new_context(self, **kw):
    """A browser context whose http(s) requests are blocked and recorded."""
    context = self.browser.new_context(**kw)

    def block(route):
      self.requests.append(route.request.url)
      route.abort()
    context.route("http*://**", block)
    return context

  def url(self, query="fast=1"):
    return INDEX + ("?" + query if query else "")

  def page(self, width=1280, height=800, init_script=None, query="fast=1"):
    context = self.new_context(viewport={"width": width, "height": height})
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
  page.evaluate("XP.set({hidden: {list: false}, widths: {list: 240, inspector: 300}})")
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
  assert page.evaluate("XP.state.widths.inspector") == 280
  assert page.evaluate("XP.state.hidden.list") is True
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
def test_first_edit_pins_flag_and_link(ctx):
  pinned = "XP.state.tabs.map(t => t.pinned)"
  page = ctx.page()  # flag toggle
  open_objects(page)
  page.click("[data-row='go1']")
  assert page.evaluate(pinned) == [False]
  page.click("[data-testid=inspector] [data-action=toggleFlag][data-flag='1']")
  assert page.evaluate(pinned) == [True], "flag toggle"
  assert "L" in page.evaluate("XP.data.devices.find(d => d.address === '1.1.4').groupObjects[0].flags")
  page.context.close()
  page = ctx.page()  # link dialog
  open_objects(page)
  page.click("[data-row='go4']")
  assert page.evaluate(pinned) == [False]
  page.click("[data-testid=insp-link]")
  assert page.evaluate(pinned) == [False], "opening the dialog is no edit"
  page.select_option("[data-testid=link-ga]", "1/2/7")
  page.click("[data-testid=link-confirm]")
  assert page.evaluate(pinned) == [True], "link"
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
  chip = first.locator(".chip")
  assert re.sub(r"\s+", "", chip.inner_text()).replace("(sendend)", "") == "→1/2/3", chip.inner_text()
  assert chip.get_attribute("data-send") is not None
  # the sending cue and the flag letters are explained in visible text, not only in tooltips
  legend = page.locator("[data-testid=go-legend]").inner_text()
  assert "→ sendende Gruppenadresse" in legend and "Ü Übertragen" in legend, legend
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
  page.click("[data-level=main][data-group='1'] .chev")
  assert tree.locator("[data-row='1/2/3']").count() == 0
  assert page.locator("[data-level=main][data-group='1']").get_attribute("aria-expanded") == "false"
  page.click("[data-level=main][data-group='1'] .chev")
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
  for w, h in ((1280, 800), (400, 860)):
    page = ctx.page(w, h)
    if w < 600:
      page.click("[data-testid=nav-button]")
    page.click("[data-view=groupAddresses]")
    heights = page.evaluate(
      "[...document.querySelectorAll('[data-testid=ga-tree] .grow, [data-testid=ga-tree] .row')].map(e => Math.round(e.getBoundingClientRect().height))"
    )
    assert len(set(heights)) == 1 and heights[0] > 0, (w, sorted(set(heights)))
    mains = page.locator("[data-testid=ga-tree] [data-level=main]")
    assert mains.count() == 3
    for i in range(3):
      assert mains.nth(i).is_visible(), (w, i)
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


def go_commissioning(page, view=None):
  page.click("[data-testid=ws-switcher]")
  page.click("[data-ws=commissioning]")
  if view:
    page.click(f"[data-view={view}]")


def row_addrs(page):
  return page.eval_on_selector_all("[data-testid=com-rows] [data-row]", "els => els.map(e => e.dataset.row)")


def ctx_menu(page, addr, entry):
  page.click(f"[data-testid=com-rows] [data-row='{addr}']", button="right")
  page.click(f"[data-testid=context-menu] >> text={entry}")


@test
def test_open_filter(ctx):
  page = ctx.page()
  go_commissioning(page)
  assert len(row_addrs(page)) == page.evaluate("XP.data.devices.length")
  page.click("[data-testid=filter-open]")
  want = page.evaluate("XP.data.devices.filter(d => d.status !== 'ok').map(d => d.address)")
  got = row_addrs(page)
  assert sorted(got) == sorted(want) and 0 < len(got) < page.evaluate("XP.data.devices.length"), (got, want)
  statuses = page.eval_on_selector_all("[data-testid=com-rows] [data-testid=status-badge]", "els => els.map(e => e.dataset.status)")
  assert "ok" not in statuses
  page.click("[data-testid=filter-error]")
  assert row_addrs(page) == ["1.2.1"], row_addrs(page)
  assert "offen" in page.locator("[data-view=commissioningDevices]").inner_text()
  page.context.close()


@test
def test_program_proposes_scope(ctx):
  page = ctx.page()
  go_commissioning(page)
  page.click("[data-row='1.1.4']")
  assert page.locator("[data-testid=program-primary]").inner_text().strip() == "Parameter programmieren"
  reason = page.locator("[data-testid=scope-reason]").inner_text()
  assert "nur Parameter geändert" in reason and "ca. 20 s" in reason, reason
  assert page.locator("[data-testid=change-summary]").inner_text().startswith("3 Parameter in Kanal A")
  page.click("[data-testid=program-primary]")
  assert page.evaluate("XP.queue.items().map(i => i.ref + ':' + i.scope).join()") == "1.1.4:params"
  page.context.close()


@test
def test_queue_runs_serially(ctx):
  page = ctx.page()
  go_commissioning(page)
  page.click("[data-testid=filter-open]")
  before = len(row_addrs(page))
  max_run = page.evaluate("""async () => {
    ['1.1.4', '1.2.7', '1.1.3'].forEach(a => XP.queue.enqueue(a, 'all'));
    let max = 0; const t0 = Date.now();
    while (XP.queue.items().some(i => i.status === 'wartet' || i.status === 'läuft')) {
      max = Math.max(max, XP.queue.items().filter(i => i.status === 'läuft').length,
        document.querySelectorAll('[data-testid=status-badge][title*="wird programmiert"]').length);
      await new Promise(r => setTimeout(r, 10));
      if (Date.now() - t0 > 20000) break;
    }
    return max;
  }""")
  assert max_run == 1, max_run
  got = row_addrs(page)
  assert len(got) == before - 3 and not {"1.1.4", "1.2.7", "1.1.3"} & set(got), got
  page.click("[data-view=queue]")
  assert page.locator("[data-testid=queue-item][data-status=fertig]").count() == 3
  page.context.close()


@test
def test_retry_after_error(ctx):
  page = ctx.page()
  go_commissioning(page, "queue")
  assert page.locator("[data-testid=queue-empty]").is_visible()
  page.evaluate("XP.queue.enqueue('1.1.5', 'all')")
  page.wait_for_selector("[data-testid=queue-item][data-status=fehler]")
  assert page.locator("[data-testid=queue-error]").inner_text().strip() != ""
  assert page.evaluate("XP.data.devices.find(d => d.address === '1.1.5').status") == "error"
  page.click("[data-testid=qretry]")
  page.wait_for_selector("[data-testid=queue-item][data-status=fertig]")
  assert page.evaluate("XP.data.devices.find(d => d.address === '1.1.5').status") == "ok"
  page.context.close()


@test
def test_cancel_waiting(ctx):
  page = ctx.page()
  go_commissioning(page, "queue")
  page.evaluate("XP.queue.enqueue('1.1.4','all'); XP.queue.enqueue('1.2.7','all')")
  page.click("[data-testid=queue-item][data-ref='1.2.7'] [data-testid=qcancel]")
  assert page.locator("[data-testid=queue-item][data-ref='1.2.7']").count() == 0
  page.wait_for_selector("[data-testid=queue-item][data-ref='1.1.4'][data-status=fertig]")
  page.context.close()


@test
def test_change_address_flow(ctx):
  page = ctx.page()
  go_commissioning(page)
  ctx_menu(page, "1.1.4", "Adresse ändern…")
  assert page.locator("[data-testid=dialog]").is_visible()
  btn = page.locator("[data-testid=addr-confirm]")
  assert btn.inner_text().strip() == "Adresse auf 1.1.20 ändern"
  page.fill("[data-testid=addr-input]", "1.1.5")
  assert page.evaluate("document.activeElement.dataset.testid") == "addr-input"
  assert "bereits vergeben" in page.locator("[data-testid=addr-check]").inner_text()
  assert btn.is_disabled()
  page.fill("[data-testid=addr-input]", "1.1.21")
  assert btn.inner_text().strip() == "Adresse auf 1.1.21 ändern" and btn.is_enabled()
  btn.click()
  assert page.locator("[data-testid=dialog]").count() == 0
  assert page.locator("[data-testid=com-rows] [data-row='1.1.21']").count() == 1
  assert page.locator("[data-testid=com-rows] [data-row='1.1.4']").count() == 0
  page.context.close()


@test
def test_change_address_keeps_tabs(ctx):
  page = ctx.page()
  go_commissioning(page)
  page.click("[data-row='1.1.4']")
  ctx_menu(page, "1.1.4", "Adresse ändern…")
  page.click("[data-testid=addr-confirm]")
  assert page.evaluate("XP.state.activeTab") == "commissioningDevice:1.1.20"
  assert "Schaltaktor" in page.locator("[data-testid=device-title]").inner_text()
  page.context.close()


@test
def test_replace_device_flow(ctx):
  page = ctx.page()
  go_commissioning(page)
  ctx_menu(page, "1.1.5", "Gerät tauschen…")
  assert page.locator("[data-testid=steps] [data-step]").count() == 4
  page.click("text=Anderes Modell")
  page.click("[data-testid=dlg-next]")
  wait = page.locator("[data-testid=wait-button]")
  assert "Warte auf Programmierknopf…" in wait.inner_text()
  assert page.locator("[data-testid=dlg-next]").is_disabled()
  page.click("[data-testid=sim-button]")
  assert page.locator("[data-testid=found]").is_visible()
  page.click("[data-testid=dlg-next]")
  assert page.locator("[data-testid=map-table]").is_visible()
  assert page.locator("[data-testid=dlg-next]").is_disabled()
  while page.locator("[data-testid=map-assign]").count():
    page.locator("[data-testid=map-assign]").first.click()
  page.click("[data-testid=dlg-next]")
  assert page.locator("[data-testid=fdsk-open]").is_visible()
  page.click("[data-testid=replace-confirm]")
  assert page.locator("[data-testid=dialog]").count() == 0
  page.wait_for_selector("[data-testid=queue-item][data-ref='1.1.5']")
  assert "JAL-0810" in page.evaluate("XP.data.devices.find(d => d.address === '1.1.5').product")
  page.context.close()


@test
def test_replace_same_model_and_serial(ctx):
  page = ctx.page()
  go_commissioning(page)
  ctx_menu(page, "1.1.5", "Gerät tauschen…")
  page.click("[data-testid=dlg-next]")
  page.click("text=Seriennummer eingeben")
  page.fill("[data-testid=serial-input]", "zz")
  assert page.locator("[data-testid=dlg-next]").is_disabled()
  page.fill("[data-testid=serial-input]", "00C5:1A2B3C4D")
  page.click("[data-testid=dlg-next]")
  assert page.locator("[data-testid=map-table]").count() == 0
  assert page.locator("[data-testid=takeover]").is_visible()
  page.click("[data-testid=dlg-back]")
  assert page.locator("[data-testid=serial-input]").input_value() == "00C5:1A2B3C4D"
  page.context.close()


@test
def test_dialog_survives_workspace_switch(ctx):
  page = ctx.page()
  go_commissioning(page)
  page.click("[data-row='1.1.4']")
  ctx_menu(page, "1.1.5", "Gerät tauschen…")
  assert page.locator("[data-testid=dialog]").is_visible()
  page.click("[data-testid=ws-switcher]")
  page.click("[data-ws=planning]")
  assert page.evaluate("XP.state.workspace") == "planning"
  assert page.locator("[data-testid=dialog]").is_visible()
  assert tab_count(page) == 1
  page.keyboard.press("Escape")
  assert page.locator("[data-testid=dialog]").count() == 0
  assert tab_count(page) == 1
  page.context.close()


@test
def test_dialog_focus_escape_and_trap(ctx):
  page = ctx.page()
  go_commissioning(page)
  page.click("[data-row='1.1.4']")
  page.click("[data-testid=more-actions]")
  page.click("[data-testid=context-menu] >> text=Programmieren…")
  assert page.locator("[data-testid=dialog]").is_visible()
  for _ in range(12):
    page.keyboard.press("Tab")
    assert page.evaluate("!!document.activeElement.closest('[data-testid=dialog]')")
  page.keyboard.press("Shift+Tab")
  assert page.evaluate("!!document.activeElement.closest('[data-testid=dialog]')")
  page.keyboard.press("Escape")
  assert page.locator("[data-testid=dialog]").count() == 0
  assert page.evaluate("document.activeElement.dataset.fk") == "more-actions"
  page.context.close()


@test
def test_dialog_widths_and_narrow_sheet(ctx):
  page = ctx.page()
  go_commissioning(page)
  for kind, width in (("program", 480), ("changeAddress", 640), ("replace", 880)):
    page.evaluate(f"XP.openDialog('{kind}', {{ref: '1.1.4'}})")
    w = page.locator("[data-testid=dialog]").bounding_box()["width"]
    assert abs(w - width) <= 1, (kind, w)
    page.evaluate("XP.closeDialog()")
  page.context.close()
  page = ctx.page(400, 860)
  page.evaluate("XP.set({workspace:'commissioning', view:'commissioningDevices'}); XP.openDialog('replace', {ref: '1.1.5'})")
  box = page.locator("[data-testid=dialog]").bounding_box()
  assert box["width"] >= 399 and box["height"] >= 859, box
  assert page.evaluate("document.body.scrollWidth <= document.body.clientWidth")
  page.context.close()


@test
def test_commissioning_rows_have_no_inputs(ctx):
  page = ctx.page()
  go_commissioning(page)
  assert page.locator("[data-testid=com-rows] [data-row] input, [data-testid=com-rows] [data-row] select").count() == 0
  page.context.close()


@test
def test_commissioning_long_name_narrow(ctx):
  page = ctx.page(400, 860)
  page.evaluate("XP.set({workspace:'commissioning', view:'commissioningDevices'})")
  assert page.evaluate("document.body.scrollWidth <= document.body.clientWidth")
  page.click("[data-row='1.2.9']")
  assert page.evaluate("document.body.scrollWidth <= document.body.clientWidth")
  page.context.close()


@test
def test_palette_finds_setting(ctx):
  page = ctx.page()
  page.keyboard.press("Control+k")
  assert page.locator("[data-testid=palette]").is_visible()
  page.keyboard.type("Zeitüberschreitung")
  page.keyboard.press("Enter")
  assert page.locator("[data-testid=palette]").count() == 0
  assert page.evaluate("XP.state.view") == "settings"
  hl = page.locator("[data-testid=settings-page] [data-highlight]")
  assert hl.count() == 1
  assert "Zeitüberschreitung" in hl.inner_text()
  page.context.close()


@test
def test_palette_opens_device(ctx):
  page = ctx.page()
  page.click("[data-testid=search]")
  page.keyboard.type("1.1.12")
  page.keyboard.press("Enter")
  tab = page.locator("[data-testid=tabs] [data-tab]")
  assert tab.count() == 1
  assert tab.first.get_attribute("title") == "1.1.12 Tastsensor Flur"
  page.context.close()


@test
def test_palette_groups_keys_escape(ctx):
  page = ctx.page()
  page.keyboard.press("Control+k")
  page.keyboard.type("Licht")
  labels = page.locator("[data-testid=palette] .pal-grp").all_inner_texts()
  assert "Gruppenadressen" in [x.strip() for x in labels], labels
  assert page.locator("[data-testid=palette] [data-group=ga] .pal-item").count() <= 8
  first = page.evaluate("document.querySelector('[data-testid=palette] .pal-item[aria-selected=true]').id")
  page.keyboard.press("ArrowDown")
  second = page.evaluate("document.querySelector('[data-testid=palette] .pal-item[aria-selected=true]').id")
  assert first != second
  page.keyboard.press("Escape")
  assert page.locator("[data-testid=palette]").count() == 0
  page.keyboard.press("Control+k")
  page.keyboard.press("Control+k")
  assert page.locator("[data-testid=palette]").count() == 0
  page.context.close()


@test
def test_palette_command_change_address(ctx):
  page = ctx.page()
  page.click("[data-row='1.1.4']")
  page.keyboard.press("Control+k")
  page.keyboard.type("Adresse ändern")
  page.keyboard.press("Enter")
  dlg = page.locator("[data-testid=dialog]")
  assert dlg.is_visible()
  assert page.evaluate("XP.state.dialog.kind") == "changeAddress"
  assert page.evaluate("XP.state.dialog.ref") == "1.1.4"
  page.keyboard.press("Escape")
  page.keyboard.press("Control+k")
  page.keyboard.type("Arbeitsbereich: Inbetriebnahme")
  page.keyboard.press("Enter")
  assert page.evaluate("XP.state.workspace") == "commissioning"
  page.keyboard.press("Control+k")
  page.keyboard.type("Hell/Dunkel")
  before = page.evaluate("XP.state.theme")
  page.keyboard.press("Enter")
  assert page.evaluate("XP.state.theme") != before
  page.context.close()


@test
def test_palette_narrow_full_width(ctx):
  page = ctx.page(400, 860)
  page.click("[data-testid=search]")
  box = page.locator("[data-testid=palette]").bounding_box()
  assert box["width"] >= 399, box
  assert page.evaluate("document.body.scrollWidth <= document.body.clientWidth")
  page.context.close()


@test
def test_settings_search_flat(ctx):
  page = ctx.page()
  page.click("[data-testid=settings]")
  pg = page.locator("[data-testid=settings-page]")
  assert pg.is_visible()
  assert pg.locator("[role=tab], [role=tablist]").count() == 0
  assert pg.locator("[data-testid=settings-row]").count() >= 15
  groups = [g.strip() for g in pg.locator("[data-testid=settings-group]").all_inner_texts()]
  for g in ("Allgemein", "Verbindung", "Backups", "KI/MCP", "Ordner"):
    assert g in groups, groups
  page.fill("[data-testid=settings-search]", "Backup")
  groups = pg.locator("[data-testid=settings-group]").all_inner_texts()
  assert [g.strip() for g in groups] == ["Backups"], groups
  rows = pg.locator("[data-testid=settings-row]")
  assert rows.count() >= 2
  assert set(rows.evaluate_all("els => els.map(e => e.dataset.group)")) == {"backups"}
  page.fill("[data-testid=settings-search]", "qqqq")
  assert pg.locator("[data-testid=settings-row]").count() == 0
  assert pg.locator("[data-testid=settings-empty]").is_visible()
  page.context.close()


@test
def test_monitor_pause(ctx):
  page = ctx.page()
  go_workspace(page, "diagnostics")
  rows = page.locator("[data-testid=telegram-row]")
  assert rows.count() == 30
  page.click("[data-testid=mon-connect]")
  page.wait_for_function("document.querySelectorAll('[data-testid=telegram-row]').length > 30")
  page.click("[data-testid=mon-pause]")
  n = rows.count()
  page.wait_for_timeout(3000)
  assert rows.count() == n
  page.click("[data-testid=mon-pause]")
  page.wait_for_function(f"document.querySelectorAll('[data-testid=telegram-row]').length > {n}")
  page.context.close()


@test
def test_monitor_commands(ctx):
  page = ctx.page()
  go_workspace(page, "diagnostics")
  assert page.locator("[data-testid=mon-write]").is_disabled()
  page.click("[data-testid=mon-connect]")
  n = page.locator("[data-testid=telegram-row]").count()
  page.fill("[data-testid=mon-ga]", "1/2/3")
  page.fill("[data-testid=mon-value]", "Ein")
  page.click("[data-testid=mon-write]")
  first = page.locator("[data-testid=telegram-row]").first
  assert "1/2/3" in first.inner_text() and "Write" in first.inner_text() and "Ein" in first.inner_text()
  page.click("[data-testid=mon-read]")
  page.wait_for_function("document.querySelector('[data-testid=telegram-row]').innerText.includes('Response')")
  assert page.locator("[data-testid=telegram-row]").count() >= n + 3
  page.fill("[data-testid=mon-ga]", "abc")
  page.click("[data-testid=mon-write]")
  assert page.locator("[data-testid=mon-error]").is_visible()
  page.context.close()


@test
def test_every_workspace_rail_views_render(ctx):
  page = ctx.page()
  spaces = page.evaluate("Object.keys(XP.WORKSPACES)")
  assert len(spaces) == 4
  for w in spaces:
    go_workspace(page, w)
    views = page.evaluate("XP.WORKSPACES['%s'].rail.flatMap(g => g.items)" % w)
    for v in views:
      page.click(f"[data-testid=rail] [data-view={v}]")
      assert page.evaluate("XP.state.view") == v
      assert page.locator("[data-testid=editor]").inner_text().strip(), (w, v)
      if page.evaluate(f"!!XP.VIEWS['{v}'].placeholder"):
        ph = page.locator("[data-testid=placeholder]")
        assert ph.is_visible(), (w, v)
        assert ph.locator(".t-title").inner_text().strip() == page.evaluate(f"XP.VIEWS['{v}'].label"), (w, v)
  page.context.close()


@test
def test_handover_read_views(ctx):
  page = ctx.page()
  go_workspace(page, "handover")
  assert page.locator("[data-testid=project-info]").is_visible()
  assert "Musterhaus" in page.locator("[data-testid=project-info]").inner_text()
  page.click("[data-testid=rail] [data-view=export]")
  assert page.locator("[data-testid=export-page]").is_visible()
  page.context.close()


@test
def test_other_views_narrow_no_scroll(ctx):
  page = ctx.page(400, 860)
  for v in ("groupMonitor", "settings", "projectInfo", "export", "backups"):
    page.evaluate(f"XP.set({{view:'{v}', activeTab:null}})")
    assert page.evaluate("document.body.scrollWidth <= document.body.clientWidth"), v
  page.context.close()


def go_workspace(page, ws):
  page.click("[data-testid=ws-switcher]")
  page.click(f"[data-ws={ws}]")


@test
def test_h_renders_false_aria_values(ctx):
  page = ctx.page()
  out = page.evaluate("String(XP.h`<i aria-selected=\"${false}\" aria-checked=\"${true}\">${false}x</i>`)")
  assert out == '<i aria-selected="false" aria-checked="true">x</i>', out
  assert page.locator("[data-testid=ws-switcher]").get_attribute("aria-expanded") == "false"
  page.context.close()


@test
def test_escape_consumed_by_palette_and_dialog(ctx):
  page = ctx.page(800, 900)
  page.evaluate("XP.set({drawerOpen:true})")
  page.evaluate("XP.palette.open('')")
  page.keyboard.press("Escape")
  assert page.evaluate("XP.state.paletteOpen") is False
  assert page.evaluate("XP.state.drawerOpen") is True, "palette Escape also closed the drawer"
  page.evaluate("XP.set({drawerOpen:true, workspace:'commissioning', view:'commissioningDevices'}); XP.openDialog('changeAddress',{ref:'1.1.4'})")
  page.keyboard.press("Escape")
  assert page.evaluate("XP.state.dialog") is None
  assert page.evaluate("XP.state.drawerOpen") is True, "dialog Escape also closed the drawer"
  page.keyboard.press("Escape")
  assert page.evaluate("XP.state.drawerOpen") is False
  page.context.close()


@test
def test_inspector_and_highlight_reset(ctx):
  page = ctx.page(800, 900)
  page.evaluate("XP.openObject('device','1.1.4',{pin:true}); XP.set({inspectorOpen:true})")
  page.evaluate("XP.openObject('device','1.1.5',{pin:true})")
  assert page.evaluate("XP.state.inspectorOpen") is False
  page.evaluate("XP.openSetting('t-ack')")
  assert page.evaluate("XP.state.highlight") == "t-ack"
  page.evaluate("XP.set({view:'devices'})")
  assert page.evaluate("XP.state.highlight") is None
  page.context.close()


@test
def test_settings_design_row_switches_theme(ctx):
  page = ctx.page()
  page.evaluate("XP.set({view:'settings'})")
  page.select_option("[data-setting=theme] select", "Hell")
  assert page.evaluate("document.documentElement.dataset.theme") == "light"
  assert page.locator("[data-setting=theme] select").input_value() == "Hell"
  page.context.close()


@test
def test_monitor_times_ascending(ctx):
  page = ctx.page()
  t = page.evaluate("XP.data.telegrams.map(x => x.time)")
  assert t == sorted(t) and len(set(t)) == len(t), t
  page.context.close()


@test
def test_touch_targets_in_tab_strip(ctx):
  context = ctx.new_context(viewport={"width": 400, "height": 860}, has_touch=True, is_mobile=True)
  page = context.new_page()
  page.goto(ctx.url())
  page.evaluate("XP.openObject('device','1.1.4')")
  for sel in (".tab .x.pin", ".tab .x:not(.pin)"):
    b = page.locator(sel).first.bounding_box()
    assert b["width"] >= 44 and b["height"] >= 44, (sel, b)
  context.close()


@test
def test_group_address_links_fit_narrow(ctx):
  page = ctx.page(400, 860)
  page.evaluate("XP.set({view:'groupAddresses'}); XP.openObject('groupAddress','1/2/3',{pin:true})")
  r = page.evaluate("""(() => { const w = document.querySelector('.tblwrap'), t = w.querySelector('table');
    const b = w.getBoundingClientRect(); return [b.left, w.scrollWidth <= w.clientWidth, getComputedStyle(w).paddingLeft]; })()""")
  assert r[1], "linked-objects table scrolls horizontally"
  assert r[2] != "0px"
  page.context.close()


def drag_by(page, testid, dx):
  box = page.locator(f"[data-testid={testid}]").bounding_box()
  x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
  page.mouse.move(x, y)
  page.mouse.down()
  page.mouse.move(x + dx / 2, y, steps=4)
  page.mouse.move(x + dx, y, steps=4)
  page.mouse.up()


def insp_width(page):
  return page.locator("[data-testid=inspector]").bounding_box()["width"]


@test
def test_inspector_resize(ctx):
  page = ctx.page()
  open_objects(page)
  assert abs(insp_width(page) - 280) <= 1
  drag_by(page, "splitter-inspector", -60)  # the splitter is on the left edge: left widens
  assert page.evaluate("XP.state.widths.inspector") == 340
  assert abs(insp_width(page) - 340) <= 1
  page.focus("[data-testid=splitter-inspector]")
  page.keyboard.press("ArrowLeft")
  assert page.evaluate("XP.state.widths.inspector") == 356
  page.keyboard.press("ArrowRight")
  assert page.evaluate("XP.state.widths.inspector") == 340
  assert page.evaluate("document.activeElement.dataset.testid") == "splitter-inspector"
  drag_by(page, "splitter-inspector", -900)
  assert page.evaluate("XP.state.widths.inspector") == 480, "clamped to the maximum"
  drag_by(page, "splitter-inspector", 900)
  assert page.evaluate("XP.state.widths.inspector") == 220, "clamped to the minimum"
  drag_by(page, "splitter-inspector", -80)
  page.reload()
  open_objects(page)
  assert page.evaluate("XP.state.widths.inspector") == 300
  assert abs(insp_width(page) - 300) <= 1, "width survives a reload"
  page.context.close()


@test
def test_inspector_default_per_mode(ctx):
  page = ctx.page()
  page.click("[data-row='1.1.4']")
  insp = page.locator("[data-testid=inspector]")
  assert insp.count() == 0, "closed by default with parameters"
  page.click("[data-testid=mode-objects]")
  assert insp.is_visible(), "open by default with group objects"
  page.click("[data-testid=inspector-button]")
  assert insp.count() == 0
  page.click("[data-testid=mode-params]")
  assert insp.count() == 0
  page.click("[data-testid=inspector-button]")
  assert insp.is_visible()
  page.click("[data-testid=mode-objects]")
  assert insp.count() == 0, "group objects remember their own choice"
  page.click("[data-testid=mode-params]")
  assert insp.is_visible(), "parameters remember their own choice"
  page.context.close()


@test
def test_touch_selection_mode(ctx):
  context = ctx.new_context(viewport={"width": 1280, "height": 800}, has_touch=True)
  page = context.new_page()
  page.on("pageerror", lambda e: ctx.errors.append(f"pageerror: {e}"))
  page.goto(ctx.url())
  page.tap("[data-row='1.1.4']")
  page.tap("[data-testid=mode-objects]")
  box = page.locator("[data-row='go1']").bounding_box()
  page.mouse.move(box["x"] + 80, box["y"] + box["height"] / 2)
  page.mouse.down()
  page.wait_for_timeout(650)
  page.mouse.up()
  page.tap("[data-testid=context-menu] >> text=Auswählen")
  bar = page.locator("[data-testid=select-bar]")
  assert bar.is_visible()
  assert page.locator("[data-testid=select-count]").inner_text().strip() == "1 Objekt ausgewählt"
  page.tap("[data-row='go4']")
  page.tap("[data-row='go7']")
  assert page.locator("[data-testid=select-count]").inner_text().strip() == "3 Objekte ausgewählt"
  checks = page.locator("[data-testid=go-table] td.ck").evaluate_all("els => els.map(e => e.textContent)")
  assert checks.count("✓") == 3, checks
  assert page.locator("table [data-row] :is(input,select,textarea,[contenteditable])").count() == 0
  assert page.locator("[data-testid=inspector-title]").inner_text().strip() == "3 Objekte"
  page.select_option("[data-testid=insp-dpt]", "1.003")
  for r in ("go1", "go4", "go7"):
    assert page.locator(f"[data-row='{r}'] .typ").inner_text().strip() == "Freigeben", r
  page.tap("[data-row='go4']")  # a tap toggles
  assert page.locator("[data-testid=select-count]").inner_text().strip() == "2 Objekte ausgewählt"
  page.tap("[data-testid=select-done]")
  assert bar.count() == 0
  assert page.locator("[data-testid=go-table] .ck").count() == 0
  page.tap("[data-row='go10']")  # back to single selection
  assert page.evaluate("XP.state.goSel['1.1.4'].ids") == ["go10"]
  context.close()


SPACING_PROPS = re.compile(r"(?:^|[;{\s])((?:row-|column-)?gap|padding(?:-[a-z]+)?|margin(?:-[a-z]+)?)\s*:\s*([^;}]+)")
SPACING_VAR = re.compile(r"var\(--(?:space-[0-9-]+|pad-[a-z-]+|gap-[a-z-]+)\)")
SPACING_LITERAL = re.compile(r"^(?:0|auto|1px|[*+-]|-?\d+(?:\.\d+)?)$")


@test
def test_spacing_uses_tokens(ctx):
  css = (ROOT / "app.css").read_text()
  bad = []
  for n, line in enumerate(css.splitlines(), 1):
    for prop, value in SPACING_PROPS.findall(line):
      rest = SPACING_VAR.sub(" ", value).replace("calc", " ").replace("(", " ").replace(")", " ")
      for tok in rest.split():
        if not SPACING_LITERAL.match(tok):
          bad.append(f"app.css:{n}: {prop}: {value.strip()}")
          break
  assert not bad, "gap/padding/margin must use var(--space-*) or a density token (only 0 and 1px literal):\n" + "\n".join(bad)
  tokens = (ROOT / "tokens.css").read_text()
  assert "--space-0-5:2px" in tokens


@test
def test_meaning_in_visible_words(ctx):
  page = ctx.page()
  # planning rows carry no status dot; the editor header says the status in words
  assert page.locator("[data-testid=device-rows] .row .dot").count() == 0
  page.click("[data-row='1.1.4']")
  assert page.locator("[data-testid=device-status]").inner_text().strip() == "Parameter geändert"
  # group address tree: an unlinked address says so in a badge
  page.click("[data-view=groupAddresses]")
  unlinked = page.locator("[data-testid=ga-tree] [data-testid=ga-unlinked]")
  assert unlinked.count() >= 1
  assert unlinked.first.inner_text().strip() == "nicht verknüpft"
  assert page.locator("[data-testid=ga-tree] .row .dot").count() == 0
  # replace device: the takeover marks have words next to the symbols
  page.evaluate("XP.openDialog('replace',{ref:'1.1.5'}); Object.assign(XP.state.dialog,{step:3,model:'other',found:true}); XP.render()")
  marks = [t.strip() for t in page.locator("[data-testid=takeover-mark]").all_inner_texts()]
  assert any(m.endswith("übernommen") for m in marks) and any(m.endswith("offen") for m in marks), marks
  page.evaluate("XP.closeDialog()")
  # the queue badge is a neutral count, status counts keep the warning colour
  page.evaluate("XP.set({workspace:'commissioning', view:'commissioningDevices'}); XP.queue.enqueue('1.1.4','params')")
  assert "neutral" in page.locator("[data-view=queue] [data-testid=rail-badge]").get_attribute("class")
  assert "warn" in page.locator("[data-view=commissioningDevices] [data-testid=rail-badge]").get_attribute("class")
  page.context.close()
  page = ctx.page(400, 860)
  word = page.locator("[data-testid=status-word]")
  assert word.is_visible() and word.inner_text().strip() == "Offline", "narrow status pill shows a word"
  page.evaluate("XP.set({connected:true})")
  assert word.inner_text().strip() == "Verbunden"
  page.context.close()


@test
def test_one_dialog_frame(ctx):
  page = ctx.page()
  open_objects(page)
  page.click("[data-row='go1']")
  opened = {
    "rename": "XP.openDialog('rename',{type:'go',ref:'go1',value:'x'})",
    "link": "XP.openDialog('link',{})",
    "saveWorkspace": "XP.openDialog('saveWorkspace',{name:''})",
    "program": "XP.openDialog('program',{ref:'1.1.4'})",
  }
  for kind, js in opened.items():
    page.evaluate(js)
    dlg = page.locator("[data-testid=dialog]")
    assert dlg.get_attribute("data-kind") == kind
    assert dlg.get_attribute("data-density") == "comfortable", kind
    assert abs(dlg.bounding_box()["width"] - 480) <= 1, kind
    assert "t-title" in page.locator("[data-testid=dialog-title]").get_attribute("class"), kind
    assert page.evaluate("getComputedStyle(document.querySelector('[data-testid=dialog]')).paddingTop") == "24px", kind
    page.keyboard.press("Escape")
    assert dlg.count() == 0, kind
  # rename: focus and Enter work through the shared frame
  page.focus("[data-row='go1']")
  page.keyboard.press("F2")
  assert page.evaluate("document.activeElement.id") == "rn-name"
  page.fill("[data-testid=rename-input]", "Neu benannt")
  page.keyboard.press("Enter")
  assert page.locator("[data-testid=dialog]").count() == 0
  assert "Neu benannt" in page.locator("[data-row='go1']").inner_text()
  page.context.close()


@test
def test_settings_comfortable(ctx):
  page = ctx.page()
  page.click("[data-testid=settings]")
  pg = page.locator("[data-testid=settings-page]")
  assert pg.get_attribute("data-density") == "comfortable"
  h = page.locator("[data-setting=language] select").bounding_box()["height"]
  assert h >= 31, h
  # a full-width view repeats no sidebar heading; its bar holds the filter
  assert pg.locator(".t-heading").count() == 0
  page.context.close()


def type_sizes(page):
  return page.evaluate("""(() => {
    const sizes = new Set();
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walk.nextNode())) {
      const el = n.parentElement;
      if (!n.textContent.trim() || !el || el.closest('.empty-ico,.sr,option,[aria-hidden=true]')) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue;
      sizes.add(getComputedStyle(el).fontSize);
    }
    return [...sizes].sort();
  })()""")


@test
def test_at_most_three_type_sizes(ctx):
  for name, step in SCREENSHOT_VIEWS:
    for w in (1280, 400):
      page = ctx.page(w, 860)
      step(page)
      sizes = type_sizes(page)
      assert len(sizes) <= 3, (name, w, sizes)
      page.context.close()


def menu_texts(page):
  return page.locator("[data-testid=context-menu] button").all_inner_texts()


@test
def test_device_grouping_switch(ctx):
  page = ctx.page()
  heads = lambda: page.locator("[data-testid=dev-group]").all_inner_texts()
  rows = lambda: page.locator("[data-testid=device-rows] [data-row]").count()
  n = rows()
  assert n == 14 and any("Linie EG" in t for t in heads()), heads()
  assert page.locator("[data-testid=grouping-topology]").get_attribute("aria-pressed") == "true"
  page.click("[data-testid=grouping-building]")
  assert page.locator("[data-testid=grouping-building]").get_attribute("aria-pressed") == "true"
  hs = heads()
  for t in ("Musterhaus", "Erdgeschoss", "Obergeschoss", "Wohnzimmer", "Bad", "Technikraum"):
    assert t in hs, (t, hs)
  assert hs.index("Musterhaus") < hs.index("Erdgeschoss") < hs.index("Wohnzimmer") < hs.index("Obergeschoss")
  assert rows() == n
  # rows below their room header
  order = page.evaluate("[...document.querySelectorAll('[data-testid=device-rows] > *')].map(e => e.dataset.row || e.textContent)")
  i = order.index("Küche")
  assert order[i + 1] == "1.1.4" and order[i + 2] == "1.1.7", order[i:i + 3]
  # filter keeps working, selection and preview tab behave as in topology
  page.fill("[data-testid=list-filter]", "Küche")
  assert page.locator("[data-testid=device-rows] [data-row]").count() == 2
  page.fill("[data-testid=list-filter]", "")
  page.click("[data-row='1.2.2']")
  assert page.evaluate("XP.state.activeTab") == "device:1.2.2"
  assert page.locator("[data-row='1.2.2']").get_attribute("aria-selected") == "true"
  page.click("[data-row='1.1.4']", button="right")
  assert "Anheften" in menu_texts(page)[1]
  page.keyboard.press("Escape")
  page.dblclick("[data-row='1.1.7']")
  assert page.evaluate("XP.state.tabs.find(t => t.id === 'device:1.1.7').pinned") is True
  # persists over a reload
  page.reload()
  assert page.locator("[data-testid=grouping-building]").get_attribute("aria-pressed") == "true"
  assert "Obergeschoss" in heads()
  # a device without a room goes under "Ohne Raum"
  page.evaluate("XP.data.devices[0].room = ''; XP.render()")
  assert heads()[-1] == "Ohne Raum"
  page.click("[data-testid=grouping-topology]")
  page.reload()
  assert page.locator("[data-testid=grouping-topology]").get_attribute("aria-pressed") == "true"
  page.context.close()
  page = ctx.page(400, 860)
  page.click("[data-testid=grouping-building]")
  assert page.locator("[data-testid=dev-group]").first.is_visible()
  page.context.close()


def ga_page(ctx, w=1280, h=800):
  page = ctx.page(w, h)
  if w < 600:
    page.click("[data-testid=nav-button]")
  page.click("[data-view=groupAddresses]")
  return page


@test
def test_ga_filter(ctx):
  page = ga_page(ctx)
  tree = page.locator("[data-testid=ga-tree]")
  total = tree.locator(".row.ga").count()
  page.fill("[data-testid=ga-filter]", "Küche")
  hits = tree.locator(".row.ga")
  assert 0 < hits.count() < total
  assert all("Küche" in t for t in hits.all_inner_texts())
  # parents of the matches stay visible and expanded even when collapsed before
  assert tree.locator("[data-level=main]").count() >= 1 and tree.locator("[data-level=mid]").count() >= 1
  assert "false" not in [e for e in tree.locator("[data-level]").evaluate_all("els => els.map(e => e.getAttribute('aria-expanded'))")]
  page.fill("[data-testid=ga-filter]", "1/2/3")
  assert tree.locator(".row.ga").count() == 1
  page.fill("[data-testid=ga-filter]", "zzzz")
  empty = page.locator("[data-testid=ga-empty]")
  assert "Keine Treffer für „zzzz“" in empty.inner_text()
  page.click("[data-testid=ga-filter-clear]")
  assert page.input_value("[data-testid=ga-filter]") == ""
  assert tree.locator(".row.ga").count() == total
  page.context.close()


def open_create(page, how, level_label):
  if how == "toolbar":
    page.click("[data-testid=ga-new]")
    page.click(f"[data-testid=context-menu] >> text={level_label}")
  return page.locator("[data-testid=dialog]")


@test
def test_ga_create(ctx):
  page = ga_page(ctx)
  # toolbar: the three entries; nothing selected -> first group as parent
  page.click("[data-testid=ga-new]")
  assert menu_texts(page) == ["Hauptgruppe…", "Mittelgruppe…", "Gruppenadresse…"], menu_texts(page)
  page.click("[data-testid=context-menu] >> text=Hauptgruppe…")
  dlg = page.locator("[data-testid=dialog]")
  assert dlg.get_attribute("data-density") == "comfortable"
  assert page.locator("[data-testid=dialog-title]").inner_text() == "Hauptgruppe anlegen"
  assert page.input_value("[data-testid=create-number]") == "4"
  confirm = page.locator("[data-testid=create-confirm]")
  assert confirm.is_disabled()  # no name yet
  page.fill("[data-testid=create-name]", "Lüftung")
  assert confirm.inner_text() == "Hauptgruppe 4 anlegen" and confirm.is_enabled()
  page.fill("[data-testid=create-number]", "2")
  assert "bereits vergeben" in page.locator("[data-testid=create-error]").inner_text() and confirm.is_disabled()
  page.fill("[data-testid=create-number]", "32")
  assert "0 bis 31" in page.locator("[data-testid=create-error]").inner_text() and confirm.is_disabled()
  page.fill("[data-testid=create-number]", "")
  assert confirm.is_disabled()
  page.fill("[data-testid=create-number]", "4")
  confirm.click()
  assert page.locator("[data-level=main][data-group='4']").inner_text().count("Lüftung") == 1
  assert page.evaluate("XP.state.activeTab") == "gaGroup:4"
  # detail pane of the new main group: buttons create a middle group in it
  assert page.locator("[data-testid=group-title]").inner_text() == "Lüftung"
  page.click("[data-testid=group-new-mid]")
  assert page.input_value("[data-testid=create-number]") == "0"
  assert page.locator("[data-testid=create-parent]").input_value() == "4"
  page.fill("[data-testid=create-name]", "Zuluft")
  page.locator("[data-testid=create-confirm]").click()
  assert page.evaluate("XP.state.activeTab") == "gaGroup:4/0"
  # context menu on that middle group: new address in it, previewed afterwards
  page.click("[data-level=mid][data-group='4/0']", button="right")
  assert "Neue Gruppenadresse…" in menu_texts(page) and "Neue Mittelgruppe…" not in menu_texts(page)
  page.click("[data-testid=context-menu] >> text=Neue Gruppenadresse…")
  assert page.input_value("[data-testid=create-number]") == "1"
  page.fill("[data-testid=create-name]", "Zuluft Bad")
  assert page.locator("[data-testid=create-confirm]").inner_text() == "Gruppenadresse 4/0/1 anlegen"
  page.locator("[data-testid=create-confirm]").click()
  assert page.evaluate("XP.state.activeTab") == "groupAddress:4/0/1"
  assert page.locator("[data-testid=ga-title]").inner_text() == "Zuluft Bad"
  assert page.locator("[data-row='4/0/1']").get_attribute("aria-selected") == "true"
  # context menu on a main group: new middle group in it; next free number continues
  page.click("[data-level=main][data-group='1']", button="right")
  assert "Neue Mittelgruppe…" in menu_texts(page) and "Löschen…" in menu_texts(page)
  page.click("[data-testid=context-menu] >> text=Neue Mittelgruppe…")
  assert page.input_value("[data-testid=create-number]") == "3"
  page.locator("[data-testid=dlg-cancel]").click()
  # context menu on an address: next free address in its group (1/2 holds 1..8)
  page.click("[data-row='1/2/3']", button="right")
  page.click("[data-testid=context-menu] >> text=Neue Gruppenadresse…")
  assert page.input_value("[data-testid=create-number]") == "9"
  page.fill("[data-testid=create-name]", "Licht Garage")
  assert page.locator("[data-testid=create-confirm]").inner_text() == "Gruppenadresse 1/2/9 anlegen"
  page.fill("[data-testid=create-number]", "3")
  assert "1/2/3 ist bereits vergeben" in page.locator("[data-testid=create-error]").inner_text()
  page.fill("[data-testid=create-number]", "256")
  assert "0 bis 255" in page.locator("[data-testid=create-error]").inner_text()
  page.fill("[data-testid=create-number]", "9")
  page.keyboard.press("Enter")
  assert page.evaluate("XP.state.activeTab") == "groupAddress:1/2/9"
  # toolbar with a selected address: parent defaults to its middle group
  page.click("[data-testid=ga-new]")
  page.click("[data-testid=context-menu] >> text=Gruppenadresse…")
  assert page.locator("[data-testid=create-parent]").input_value() == "1/2" and page.input_value("[data-testid=create-number]") == "10"
  page.keyboard.press("Escape")
  # main group detail: both create buttons
  page.click("[data-level=main][data-group='2']")
  assert page.locator("[data-testid=group-new-mid]").is_visible() and page.locator("[data-testid=group-new-ga]").is_visible()
  page.click("[data-testid=group-new-ga]")
  assert page.locator("[data-testid=create-parent]").input_value() == "2/1"
  page.context.close()


@test
def test_ga_group_detail_rename_delete(ctx):
  page = ga_page(ctx)
  page.click("[data-level=main][data-group='3']")
  assert page.evaluate("XP.state.activeTab") == "gaGroup:3"
  det = page.locator("[data-testid=group-detail]")
  assert "3/0/0 – 3/7/255" in page.locator("[data-testid=group-range]").inner_text()
  assert page.locator("[data-testid=group-counts]").inner_text() == "2 Mittelgruppen · 16 Gruppenadressen"
  assert det.locator(":is(input,select,textarea)").count() == 0
  # rename a main group: the detail button starts inline rename of the title
  page.click("[data-testid=group-rename]")
  assert page.locator("[data-testid=dialog]").count() == 0, "no rename dialog any more"
  page.fill("[data-testid=inline-name]", "Klima")
  page.keyboard.press("Enter")
  assert page.locator("[data-testid=group-title]").inner_text() == "Klima"
  assert "Klima" in page.locator("[data-level=main][data-group='3']").inner_text()
  assert "Klima" in page.locator("[data-testid=tabs]").inner_text()
  # rename a middle group: context menu starts the inline rename in the header
  page.click("[data-level=mid][data-group='3/1']", button="right")
  page.click("[data-testid=context-menu] >> text=Umbenennen…")
  assert page.input_value("[data-testid=inline-name]") == "Ist-Temperatur"
  page.fill("[data-testid=inline-name]", "Istwerte")
  page.keyboard.press("Enter")
  assert "Istwerte" in page.locator("[data-level=mid][data-group='3/1']").inner_text()
  # rename with F2 on a focused group row: inline in the row
  page.focus("[data-level=mid][data-group='3/2']")
  page.keyboard.press("F2")
  assert page.input_value("[data-level=mid][data-group='3/2'] [data-testid=inline-name]") == "Soll-Temperatur"
  page.fill("[data-testid=inline-name]", "Sollwerte")
  page.keyboard.press("Enter")
  assert "Sollwerte" in page.locator("[data-level=mid][data-group='3/2']").inner_text()
  # delete a middle group: confirmation states the count of removed addresses
  page.click("[data-level=mid][data-group='3/2']")
  page.click("[data-testid=group-delete]")
  assert "8 Gruppenadressen" in page.locator("[data-testid=delete-summary]").inner_text()
  assert page.locator("[data-testid=delete-confirm]").inner_text() == "8 Gruppenadressen löschen"
  page.click("[data-testid=dlg-cancel]")
  assert page.locator("[data-level=mid][data-group='3/2']").count() == 1
  page.click("[data-testid=group-delete]")
  page.click("[data-testid=delete-confirm]")
  assert page.locator("[data-level=mid][data-group='3/2']").count() == 0
  assert page.locator("[data-row='3/2/1']").count() == 0
  assert page.evaluate("XP.state.tabs.some(t => t.ref === '3/2')") is False
  # delete a main group from the context menu: counts mids and addresses
  page.click("[data-level=main][data-group='3']", button="right")
  page.click("[data-testid=context-menu] >> text=Löschen…")
  txt = page.locator("[data-testid=delete-summary]").inner_text()
  assert "1 Mittelgruppe und 8 Gruppenadressen" in txt, txt
  page.click("[data-testid=delete-confirm]")
  assert page.locator("[data-level=main]").count() == 2
  page.context.close()
  # narrow: the detail opens as the editor page
  page = ga_page(ctx, 400, 860)
  page.click("[data-level=main][data-group='2']")
  assert page.locator("[data-testid=group-detail]").is_visible()
  page.context.close()


def sel_all(page):
  return page.evaluate("(() => { const i = document.querySelector('[data-testid=inline-name]'); return i.selectionStart === 0 && i.selectionEnd === i.value.length && i.value.length > 0; })()")


@test
def test_inline_rename_row_gesture(ctx):
  page = ga_page(ctx)
  row = "[data-row='1/2/1']"
  assert page.locator("[data-testid=inline-name]").count() == 0, "never a persistent input in a row"
  page.dblclick(row + " .nm")
  inp = page.locator(row + " [data-testid=inline-name]")
  assert inp.count() == 1 and inp.input_value() == "Licht Flur"
  assert sel_all(page), "name selected"
  assert page.evaluate("document.activeElement === document.querySelector('[data-testid=inline-name]')")
  # double-click pins
  assert page.evaluate("XP.state.tabs.map(t => t.pinned)") == [True]
  # Escape cancels
  page.keyboard.type("Neu")
  page.keyboard.press("Escape")
  assert page.locator("[data-testid=inline-name]").count() == 0
  assert "Licht Flur" in page.locator(row).inner_text()
  # empty name is rejected with a hint, the old name stays
  page.dblclick(row + " .nm")
  page.fill("[data-testid=inline-name]", "  ")
  page.keyboard.press("Enter")
  assert page.locator("[data-testid=inline-error]").is_visible()
  assert page.locator("[data-testid=inline-name]").count() == 1
  assert page.evaluate("XP.data.groupAddresses.find(g => g.address === '1/2/1').name") == "Licht Flur"
  page.keyboard.press("Escape")
  assert page.locator("[data-testid=inline-error]").count() == 0
  # Enter commits
  page.dblclick(row + " .nm")
  page.fill("[data-testid=inline-name]", "Licht Eingang")
  page.keyboard.press("Enter")
  assert page.locator("[data-testid=inline-name]").count() == 0
  assert "Licht Eingang" in page.locator(row).inner_text()
  assert "Licht Eingang" in page.locator("[data-testid=ga-title]").inner_text()
  # blur without change cancels, blur with change commits
  page.dblclick(row + " .nm")
  page.click("[data-testid=ga-filter]")
  page.wait_for_timeout(50)
  assert page.locator("[data-testid=inline-name]").count() == 0
  assert "Licht Eingang" in page.locator(row).inner_text()
  page.dblclick(row + " .nm")
  page.fill("[data-testid=inline-name]", "Licht Diele")
  page.click("[data-testid=ga-filter]")
  page.wait_for_timeout(50)
  assert "Licht Diele" in page.locator(row).inner_text()
  page.context.close()


@test
def test_inline_rename_pins_preview_and_f2(ctx):
  page = ga_page(ctx)
  page.click("[data-row='1/2/2']")
  assert page.evaluate("XP.state.tabs.map(t => t.pinned)") == [False]
  page.keyboard.press("F2")
  assert page.locator("[data-row='1/2/2'] [data-testid=inline-name]").count() == 1 and sel_all(page)
  page.keyboard.type("Licht Test")
  page.keyboard.press("Enter")
  assert "Licht Test" in page.locator("[data-row='1/2/2']").inner_text()
  assert page.evaluate("XP.state.tabs.map(t => t.pinned)") == [True], "rename pins the preview tab"
  # main and middle group rows
  page.dblclick("[data-level=main][data-group='1'] .nm")
  assert page.locator("[data-level=main][data-group='1'] [data-testid=inline-name]").count() == 1
  page.keyboard.press("Escape")
  page.dblclick("[data-level=mid][data-group='1/1'] .nm")
  page.keyboard.type("Alle")
  page.keyboard.press("Enter")
  assert page.locator("[data-level=mid][data-group='1/1']").inner_text().find("Alle") >= 0
  # the context menu entry stays and renames in the header
  page.click("[data-row='1/2/3']", button="right")
  page.click("[data-testid=context-menu] >> text=Umbenennen…")
  assert page.locator("[data-testid=dialog]").count() == 0
  assert page.locator(".dev-head [data-testid=inline-name]").count() == 1
  page.keyboard.press("Escape")
  # a double-click inside the input neither restarts nor pins
  page.dblclick("[data-row='1/2/4'] .nm")
  page.dblclick("[data-testid=inline-name]")
  assert page.locator("[data-testid=inline-name]").count() == 1
  page.context.close()


@test
def test_inline_rename_device_row(ctx):
  page = ctx.page()
  page.dblclick("[data-row='1.1.2'] .nm")
  assert page.locator("[data-row='1.1.2'] [data-testid=inline-name]").input_value() == "IP-Router"
  assert sel_all(page)
  page.keyboard.type("Router EG")
  page.keyboard.press("Enter")
  assert "Router EG" in page.locator("[data-row='1.1.2']").inner_text()
  assert page.evaluate("XP.state.tabs.map(t => t.pinned)") == [True]
  page.click("[data-row='1.1.3']")
  page.keyboard.press("F2")
  assert page.locator("[data-row='1.1.3'] [data-testid=inline-name]").count() == 1
  page.keyboard.press("Escape")
  assert page.locator("[data-testid=inline-name]").count() == 0
  page.context.close()


@test
def test_inline_rename_detail_title(ctx):
  page = ga_page(ctx)
  page.click("[data-row='1/2/5']")
  btn = page.locator("[data-testid=rename-btn]")
  assert btn.is_visible() and btn.inner_text() == "✎", "visible, not hover-only"
  assert page.evaluate("document.querySelector('[data-testid=rename-btn]').getBoundingClientRect().height") >= 24
  btn.click()
  assert page.locator(".dev-head [data-testid=inline-name]").input_value() == "Licht Büro" and sel_all(page)
  page.keyboard.press("Escape")
  assert page.locator("[data-testid=inline-name]").count() == 0
  page.dblclick("[data-testid=ga-title]")
  assert page.locator(".dev-head [data-testid=inline-name]").count() == 1
  page.keyboard.type("Licht Arbeitszimmer")
  page.keyboard.press("Enter")
  assert page.locator("[data-testid=ga-title]").inner_text() == "Licht Arbeitszimmer"
  assert "Licht Arbeitszimmer" in page.locator("[data-row='1/2/5']").inner_text()
  assert page.evaluate("XP.state.tabs.map(t => t.pinned)") == [True]
  # device editor title
  page.click("[data-view=devices]")
  page.click("[data-row='1.1.4']")
  page.dblclick("[data-testid=device-title]")
  page.keyboard.type("Schaltaktor Küche")
  page.keyboard.press("Enter")
  assert page.locator("[data-testid=device-title]").inner_text() == "Schaltaktor Küche"
  page.click("[data-testid=rename-btn]")
  assert page.locator(".dev-head [data-testid=inline-name]").count() == 1
  page.context.close()


@test
def test_inline_rename_narrow_touch_menu(ctx):
  page = ga_page(ctx, 400, 860)
  page.click("[data-row='1/2/1']", button="right")
  page.click("[data-testid=context-menu] >> text=Umbenennen…")
  assert page.locator("[data-testid=dialog]").count() == 0
  assert page.locator(".dev-head [data-testid=inline-name]").is_visible()
  assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
  page.context.close()


def addr_of(page, ref):
  return page.evaluate(f"XP.data.groupAddresses.some(g => g.address === '{ref}')")


@test
def test_ga_address_change(ctx):
  page = ga_page(ctx)
  page.click("[data-row='2/1/1']")
  assert page.locator("[data-testid=ga-address]").inner_text() == "2/1/1"
  # the device group object linked to 2/1/1 (1.1.5, object 1)
  page.evaluate("XP.set({workspace:'planning'})")
  # empty / invalid / out of range / in use / unknown main group
  page.click("[data-testid=ga-address-change]")
  inp = page.locator("[data-testid=ga-address-input]")
  assert inp.input_value() == "2/1/1" and page.locator("[data-testid=ga-address-apply]").is_disabled()
  for text, msg in [("abc", "Ungültiges Format"), ("2/1", "Ungültiges Format"), ("32/1/1", "Außerhalb"), ("2/8/1", "Außerhalb"), ("2/1/256", "Außerhalb"),
                    ("2/1/2", "bereits vergeben"), ("9/0/1", "Hauptgruppe 9 existiert nicht")]:
    inp.fill(text)
    assert msg in page.locator("[data-testid=ga-address-error]").inner_text(), (text, msg)
    assert page.locator("[data-testid=ga-address-apply]").is_disabled(), text
  # a valid move inside an existing middle group
  inp.fill("2/1/20")
  assert page.locator("[data-testid=ga-address-error]").count() == 0
  btn = page.locator("[data-testid=ga-address-apply]")
  assert btn.is_enabled() and btn.inner_text() == "Adresse auf 2/1/20 ändern"
  page.keyboard.press("Enter")
  assert page.locator("[data-testid=ga-address]").inner_text() == "2/1/20"
  assert addr_of(page, "2/1/20") and not addr_of(page, "2/1/1")
  assert page.evaluate("XP.state.activeTab") == "groupAddress:2/1/20"
  assert page.evaluate("XP.state.tabs.map(t => t.pinned)") == [True]
  assert page.evaluate("XP.state.selection.groupAddress") == "2/1/20"
  # re-sorted in the tree: after 2/1/6, selected
  rows = page.evaluate("[...document.querySelectorAll('[data-kind=groupAddress]')].map(r => r.dataset.row)")
  assert rows.index("2/1/20") == rows.index("2/1/6") + 1 and page.locator("[data-row='2/1/20'].sel").count() == 1
  # the group object link follows
  assert page.evaluate("XP.data.devices.find(d => d.address === '1.1.5').groupObjects[0].gas") == ["2/1/20"]
  page.evaluate("XP.openObject('device','1.1.5',{pin:true}); XP.planning.mode('1.1.5','objects')")
  assert "2/1/20" in page.locator("[data-testid=go-table]").inner_text()
  assert "2/1/1" not in page.locator("[data-testid=go-table]").inner_text().replace("2/1/20", "")
  # and the group address editor lists the device
  page.click("[data-row='2/1/20']")
  assert "1.1.5" in page.locator("[data-testid=ga-links]").inner_text()
  page.context.close()


@test
def test_ga_address_change_creates_middle_group(ctx):
  page = ga_page(ctx)
  page.click("[data-row='2/2/1']", button="right")
  page.click("[data-testid=context-menu] >> text=Adresse ändern…")
  assert page.evaluate("document.activeElement.dataset.testid") == "ga-address-input"
  page.keyboard.type("2/5/1")
  assert "Mittelgruppe 2/5 existiert nicht" in page.locator("[data-testid=ga-address-hint]").inner_text()
  btn = page.locator("[data-testid=ga-address-apply]")
  assert btn.inner_text() == "Mittelgruppe 2/5 anlegen und verschieben" and btn.is_enabled()
  assert "primary" in btn.get_attribute("class")
  btn.click()
  assert page.evaluate("XP.data.groups.find(m => m.id === '2').children.map(c => c.id)") == ["2/1", "2/2", "2/5"]
  assert page.locator("[data-level=mid][data-group='2/5']").count() == 1
  assert page.locator("[data-row='2/5/1'].sel").count() == 1
  assert page.evaluate("XP.data.devices.find(d => d.address === '1.1.5').groupObjects[1].gas") == ["2/5/1"]
  # Escape cancels an address edit
  page.click("[data-testid=ga-address-change]")
  page.keyboard.type("x")
  page.keyboard.press("Escape")
  assert page.locator("[data-testid=ga-address-input]").count() == 0
  assert page.locator("[data-testid=ga-address]").inner_text() == "2/5/1"
  page.context.close()


@test
def test_ga_address_section_narrow(ctx):
  page = ga_page(ctx, 400, 860)
  page.click("[data-row='1/2/1']")
  page.click("[data-testid=ga-address-change]")
  page.fill("[data-testid=ga-address-input]", "1/2/99")
  assert page.locator("[data-testid=ga-address-apply]").is_visible()
  assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
  page.context.close()


@test
def test_context_menu_at_pointer(ctx):
  def near(page, x, y, tol=10):
    box = page.locator("[data-testid=context-menu]").bounding_box()
    corners = [(box["x"] + dx, box["y"] + dy) for dx in (0, box["width"]) for dy in (0, box["height"])]
    d = min(((cx - x) ** 2 + (cy - y) ** 2) ** 0.5 for cx, cy in corners)
    assert d <= tol, (d, box, x, y)
  for w, h in ((1280, 800), (400, 860)):
    page = ga_page(ctx, w, h)
    for sel in ("[data-row='2/1/3']", "[data-level=mid][data-group='2/2']", "[data-level=main][data-group='3']"):
      loc = page.locator(sel)
      loc.scroll_into_view_if_needed()
      b = loc.bounding_box()
      x, y = b["x"] + b["width"] * 0.55, b["y"] + b["height"] / 2
      page.mouse.click(x, y, button="right")
      near(page, x, y)
      page.keyboard.press("Escape")
    # the last visible row, near the bottom edge: the menu flips above the pointer, it does not slide away
    page.evaluate("document.querySelector('[data-testid=list]').scrollTop = 1e6")
    last = page.locator("[data-testid=ga-tree] .row.ga").last
    b = last.bounding_box()
    x, y = b["x"] + b["width"] * 0.3, b["y"] + b["height"] / 2
    page.mouse.click(x, y, button="right")
    near(page, x, y)
    page.keyboard.press("Escape")
    # keyboard: opens at the focused row, below it
    page.focus("[data-row='1/2/3']")
    page.evaluate("document.querySelector(\"[data-row='1/2/3']\").dispatchEvent(new MouseEvent('contextmenu', {bubbles: true, cancelable: true, clientX: 0, clientY: 0, button: 0}))")
    box = page.locator("[data-testid=context-menu]").bounding_box()
    rb = page.locator("[data-row='1/2/3']").bounding_box()
    assert abs(box["y"] - (rb["y"] + rb["height"])) <= 10 or abs(box["y"] + box["height"] - rb["y"]) <= 10, (box, rb)
    assert rb["x"] <= box["x"] <= rb["x"] + rb["width"], (box, rb)
    page.context.close()
  # a device row, mouse and touch long press
  page = ctx.page()
  b = page.locator("[data-row='1.1.6']").bounding_box()
  x, y = b["x"] + b["width"] * 0.4, b["y"] + b["height"] / 2
  page.mouse.click(x, y, button="right")
  near(page, x, y)
  page.context.close()
  context = ctx.new_context(viewport={"width": 400, "height": 860}, has_touch=True)
  page = context.new_page()
  page.goto(ctx.url())
  page.click("[data-testid=nav-button]")
  page.click("[data-view=groupAddresses]")
  page.locator("[data-row='2/1/3']").scroll_into_view_if_needed()
  b = page.locator("[data-row='2/1/3']").bounding_box()
  x, y = b["x"] + b["width"] * 0.4, b["y"] + b["height"] / 2
  page.evaluate(
    "([x, y]) => document.elementFromPoint(x, y).dispatchEvent(new PointerEvent('pointerdown', {bubbles: true, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y}))",
    [x, y],
  )
  page.wait_for_timeout(650)
  near(page, x, y)
  context.close()


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
    if ctx.requests:
      failed.append("network")
      print("FAIL network requests (must be none):\n" + "\n".join(sorted(set(ctx.requests))))
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

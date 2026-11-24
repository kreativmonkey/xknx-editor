# GUI Redesign Prototype Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A clickable HTML prototype of the redesigned editor GUI that is the binding reference for the ImGui implementation, plus a `gui-design` skill updated with what the design settled.

**Architecture:** Static files without a build step under `docs/design/prototype/`. Classic `<script>` files (no ES modules, so `file://` works) that share one global `XP` namespace. One state object with re-render on change (`XP.state`, `XP.set(patch)`, `XP.render()`). A Python Playwright smoke test drives the prototype headless and writes the screenshot matrix.

**Tech Stack:** HTML, CSS custom properties, vanilla JS (ES2020); Python Playwright via `uv run --with playwright` (ephemeral, no global install; Chromium from `~/.cache/ms-playwright`).

**Spec:** `docs/superpowers/specs/2026-11-24-gui-redesign-design.md` and `.agents/skills/gui-design/` (design-system.md tokens, components.md patterns). The mockups are in `.superpowers/brainstorm/*/content/` (shell-v2, lists-overview, workspace-commissioning, flows-readdress-replace). They are untracked, so copy what you need. The finished prototype in `docs/design/prototype/` supersedes these mockups.

## Global Constraints

- **ImGui feasibility:** only flat fills, 1 px lines, radii (0/4/6/999), solid colors, and the fonts XKNX Sans + Inconsolata. Fall back to `"Segoe UI", system-ui` and `Consolas, monospace` when the fonts are not reachable. No `box-shadow` blur, gradients, `backdrop-filter` or keyframe animation. Transitions are allowed only for state changes and must be ≤ 150 ms.
- **Colors and spacing only through CSS variables** from `tokens.css`, with the values copied verbatim from design-system.md ("Color roles", "Spacing", "Type scale"). No hex value outside `tokens.css`.
- **Demo texts are German.** UI chrome texts are German too (prototype). Title case and plural rules don't apply to the German demo.
- **Interaction:**
  - No list row contains an input, select or checkbox.
  - No action is reachable only by hover.
  - A long press of 500 ms acts as a right click.
  - The mouse wheel never changes a value.
- **Breakpoints:** ≥ 1000 px full shell; 600–999 px tablet (sidebar icons, list as a drawer, inspector as a sheet); < 600 px drill-down stack with a back button.
- **No locks anywhere.**
- Runs from `file://` and from any static server. No network access needed.

## Review Focus

1. **Long names and German compounds** ("Verhalten bei Busspannungswiederkehr", device names over 40 characters) in list rows, tabs and the narrow layout. Expected: truncation with an ellipsis, with the full text in the detail. Never overlap, never a horizontal page scroll. Test: in Task 2, a device with a 60-character name; the smoke test asserts `scrollWidth <= clientWidth` on `body` at 400 px.
2. **Many tabs** (10+ pinned). Expected: the tab strip scrolls horizontally, and the active tab stays visible. Test: in Task 2, open 12 devices pinned, then assert the active tab is in view.
3. **Closing the active tab or the last tab.** Expected: the neighbour becomes active. With no tab left, an empty state with a hint appears. Test: in Task 2.
4. **Switching workspace while a flow dialog is open, or with tabs that belong to views hidden in the new workspace.** Expected: the dialog stays until it is closed, and the tabs stay open and usable. Test: in Task 4.
5. **Reload.** Expected: theme, workspace, sidebar state, panel widths and custom workspaces come back from `localStorage`. The page renders correctly if `localStorage` throws. Test: in Task 1, with storage access stubbed to throw.

---

### Task 1: Foundation: tokens, state, shell frame, smoke test harness

**Files:**
- Create: `docs/design/prototype/index.html`, `tokens.css`, `app.css`, `state.js`, `data.js`, `shell.js`, `README.md`
- Test: `docs/design/prototype/smoke_test.py`

**Interfaces:**
- Produces:
  - `XP.state` with the fields `{theme:'dark'|'light', workspace:'planning'|'commissioning'|'diagnostics'|'handover'|string, view:string, railExpanded:bool, tabs:[{id,kind,ref,preview:bool}], activeTab:id|null, selection:{[listId]:string[]}, widths:{list:number, inspector:number}, hidden:{list:bool, inspector:bool}, customWorkspaces:[{id,name,base,view,hidden,widths}], dialog:null|{kind,step,data}, paletteOpen:bool, connected:bool}`.
  - `XP.set(patch)` merges the patch, persists the persistable keys (`theme, workspace, railExpanded, widths, hidden, customWorkspaces`), then calls `XP.render()`.
  - `XP.load()` restores them, wrapped in try/catch.
  - `XP.WORKSPACES[id] = {label, icon, rail:[{group, items:[viewId]}], defaultView}`, using the table in the spec, section "Workspaces".
  - `XP.VIEWS[viewId] = {label, icon, list?:(state)=>html, editor?:(tab)=>html, placeholder?:bool}`, registered by the later tasks.
  - `XP.data` with the demo project: lines 1.1 and 1.2, at least 12 devices (one with a 60-character name), each device with manufacturer, product, room, programming status, channels with parameters (some changed) and group objects. Also at least 40 group addresses in 3 main and 6 middle groups, and 30 monitor telegrams.
  - `XP.h(strings, ...values)`, an escaping template helper.
  - `data-testid` attributes on the top bar, rail, list column, tab strip and editor.

- [ ] **Step 1: Write `smoke_test.py`** with Playwright sync API. It takes `--out <dir>` and opens `index.html` via `file://`.
  - `test_shell_renders`: `[data-testid=topbar]`, `[data-testid=rail]` and `[data-testid=editor]` are visible at 1280×800.
  - `test_theme_persists`: click the theme toggle, reload, then `document.documentElement.dataset.theme == 'light'`.
  - `test_storage_throws`: an init script makes `localStorage` getters throw. The shell still renders and there are no console errors.
  - `test_no_hex_outside_tokens`: read all `.css/.js` files except `tokens.css` and assert there is no `#[0-9a-fA-F]{3,8}\b` color literal.
  - `screenshots`: for each of light/dark × 1280×800/800×1100/400×860, save `<out>/<view>-<theme>-<w>.png`. The views come from a list that later tasks extend.
  - Any console error fails the run.
- [ ] **Step 2: Run** `uv run --with playwright python docs/design/prototype/smoke_test.py --out /tmp/xp-shots`. Expected: FAIL, because `index.html` is missing.
- [ ] **Step 3: Implement the files.**
  - `tokens.css` holds `:root[data-theme=dark]` and `:root[data-theme=light]` with every role from design-system.md as `--bg-canvas`, `--text-secondary`, …, plus `--space-1..8` and the type styles as `--fs-*`/`--fw-*`, and the two density presets as `[data-density=compact|comfortable]`. `[data-touch]` forces comfortable.
  - Copy the XKNX Sans (Regular, Semilight, Bold) and Inconsolata files from `apps/editor-gui/src/editor_gui/assets/fonts/` to `docs/design/prototype/fonts/`, and load them with `@font-face` in `tokens.css`.
  - `shell.js` renders the top bar (product, project, workspace switcher, ⌘K field, status pill, gear) and the rail (expanded with group labels and counts / collapsed to icons with `title` and long-press label). Rail items set `view`. The list column and the editor stay empty for now.
- [ ] **Step 4: Run the smoke test.** Expected: PASS, with 9 screenshots written.
- [ ] **Step 5: Commit** `feat(prototype): tokens, state and shell frame`.

### Task 2: List → preview tab → editor; responsive layout; adaptability

**Files:**
- Create: `docs/design/prototype/tabs.js`, `layout.js`
- Modify: `shell.js`, `app.css`, `smoke_test.py`

**Interfaces:**
- Consumes: `XP.state`, `XP.set`, `XP.VIEWS`.
- Produces:
  - `XP.openObject(kind, ref, {pin=false})`: replaces the existing preview tab, or opens a pinned tab. Opening an already-open object activates it.
  - `XP.closeTab(id)`.
  - `XP.pinTab(id)`.
  - `XP.formFactor() -> 'wide'|'tablet'|'narrow'`.
  - `XP.saveWorkspace(name)`.
  - The list column renders `XP.VIEWS[state.view].list(state)`. Rows carry `data-row=<ref>`. A click calls `openObject(..., {pin:false})`, and a double-click/Enter calls it with `{pin:true}`. Arrow keys move the selection.

- [ ] **Step 1: Add the tests.**
  - `test_preview_tab_replaced`: two single clicks on different devices leave 1 tab, italic, showing the second.
  - `test_double_click_pins`: after a double-click, the next single click on another device gives 2 tabs.
  - `test_close_active_tab_activates_neighbour`: open 3 tabs and close the middle one, which is active. The right neighbour becomes active. Closing all of them shows `[data-testid=editor-empty]`.
  - `test_many_tabs_active_visible`: pin 12 tabs. The active tab's bounding box lies inside the tab strip's box.
  - `test_long_name_narrow_no_hscroll`: at 400 px, `document.body.scrollWidth <= innerWidth`, and the 60-character device row has `text-overflow: ellipsis`.
  - `test_breakpoints`: 1280 gives the rail with labels; 800 gives rail icons with the list hidden behind a "Liste" button; 400 shows the list first, and a click shows the editor with `[data-testid=back]`.
  - `test_hide_and_resize_persist`: drag the list splitter by +80 px, hide the list via the view menu, reload, and both are restored.
  - `test_save_workspace`: "Als Arbeitsbereich speichern…" with the name "Mein Büro" adds it to the switcher. Selecting it restores the hidden state and widths.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement `tabs.js`** (tab strip with horizontal scroll and `scrollIntoView` of the active tab; preview tabs are italic; the close ✕ is always visible, never hover-only) **and `layout.js`** (form factor from `innerWidth` with ±40 px hysteresis like `form_factor()` in the editor's `main.py`; pointer-drag splitters writing `widths`; drawer and sheet for tablet; stack navigation for narrow; the "Ansicht" menu in the top bar with show/hide toggles and "Als Arbeitsbereich speichern…" as a small dialog). Also the long-press helper `XP.onLongPress(el, fn)` at 500 ms, which opens the same context menu as a right click.
- [ ] **Step 4: Run the smoke test.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(prototype): preview tabs, responsive layout, custom workspaces`.

### Task 3: Planning: devices, device editor, group objects with inspector, group address tree

**Files:**
- Create: `docs/design/prototype/views-planning.js`
- Modify: `app.css`, `smoke_test.py`

**Interfaces:**
- Consumes: `XP.openObject`, `XP.VIEWS`, `XP.data`, `XP.onLongPress`.
- Produces: the views `devices`, `groupAddresses`, plus the placeholders `buildings`, `busDiagram`, `catalog`, `health`, `history` (empty state: icon, title, one sentence, no fake content); the editor kinds `device` and `groupAddress`; and `XP.contextMenu(items, x, y)`.

- [ ] **Step 1: Add the tests.**
  - `test_device_editor_page_list`: opening 1.1.4 shows a page list with "Allgemein" and "Kanal A"…"Kanal H". "Kanal A" carries `[data-modified]`. There is exactly one segmented toggle "Parameter | Gruppenobjekte" and no other tab strip inside the editor.
  - `test_changed_filter`: "Geändert (3)" shows exactly 3 parameter rows, and the parameter filter "Treppen" narrows to the matching rows.
  - `test_wheel_does_not_change_value`: a wheel event over a select leaves its value unchanged.
  - `test_group_objects_rows_have_no_inputs`: on the Gruppenobjekte tab, `table [data-row] :is(input,select,textarea,[contenteditable])` has count 0. Flags render as letters, addresses as chips.
  - `test_multiselect_inspector`: Ctrl+click two rows, then the inspector headline reads "2 Objekte". Changing the DPT in the inspector changes both rows' type text.
  - `test_context_menu_long_press`: a 600 ms press on a row opens `[data-testid=context-menu]` containing "Verknüpfen…".
  - `test_ga_tree`: the group address view renders 3 main groups, collapsible. Selecting 1/2/3 opens the detail, which lists the linked group objects. The tree rows contain no inputs.
  - Add `devices`, `groupObjects` and `groupAddresses` to the screenshot list.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement `views-planning.js`.** Follow the shell-v2 and lists-overview mockups:
  - Parameter rows are a label column of 230 px plus a control.
  - Changed values get a dot plus a "Zurücksetzen" action.
  - The inspector is 280 px on the right inside the editor, collapsible, and becomes a sheet below 1000 px.
  - Rename only in the inspector, or with F2 on the selected row (opens a small dialog).
- [ ] **Step 4: Run the smoke test.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(prototype): planning workspace views`.

### Task 4: Commissioning: status list, queue, Change Address, Replace Device

**Files:**
- Create: `docs/design/prototype/views-commissioning.js`, `dialogs.js`
- Modify: `app.css`, `smoke_test.py`

**Interfaces:**
- Consumes: `XP.openObject`, `XP.contextMenu`, `XP.data`.
- Produces:
  - the views `commissioningDevices` (status badges, filter "Alle | Offen | Fehler"), `queue`, `connection` (placeholder);
  - the editor kind `commissioningDevice`;
  - `XP.queue` with `enqueue(ref, scope)`, `retry(ref)`, `cancel(ref)`, simulated at about 4 s per device on a timer, with one device in the data set failing on its first try;
  - `XP.openDialog(kind, data)` / `XP.closeDialog()`, and a dialog frame with comfortable density, the widths 480/640/880, and a full-screen sheet when narrow.

- [ ] **Step 1: Add the tests.**
  - `test_open_filter`: "Offen" lists exactly the devices whose status ≠ ok.
  - `test_program_proposes_scope`: on 1.1.4 (only parameters changed), the primary button reads "Parameter programmieren", and the caption gives the reason.
  - `test_queue_runs_serially`: enqueue 3 devices. At most one is in "läuft" at any time. On success the device's badge disappears from "Offen".
  - `test_retry_after_error`: the failing device shows the inline error with "Wiederholen". Retry succeeds.
  - `test_change_address_flow`: open via the context menu. The primary button text follows the input ("Adresse auf 1.1.20 ändern"). Entering 1.1.5 (in use) shows the error and disables the button. Confirming changes the device's address in the list.
  - `test_replace_device_flow`: 4 steps. Step 2 waits for the programming button, and a "Simulieren: Knopf gedrückt" link advances. For "anderes Modell", step 3 shows the mapping table. Finishing enqueues the device.
  - `test_dialog_survives_workspace_switch`: with the dialog open, switching the workspace through the switcher leaves the dialog open, and open tabs remain.
  - Add `commissioning`, `changeAddress` and `replaceDevice` to the screenshot list.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement it**, following the workspace-commissioning and flows-readdress-replace mockups. The rail badge "n offen" stays live.
- [ ] **Step 4: Run the smoke test.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(prototype): commissioning workspace and guided flows`.

### Task 5: Diagnostics, Handover, settings, ⌘K

**Files:**
- Create: `docs/design/prototype/views-other.js`, `palette.js`
- Modify: `app.css`, `smoke_test.py`

**Interfaces:**
- Consumes: `XP.openObject`, `XP.openDialog`, `XP.WORKSPACES`, `XP.data`.
- Produces: the views
  - `groupMonitor`: a telegram table and a command bar (group address + value + Lesen/Schreiben). New simulated telegrams arrive every 2 s while the connection is "connected". A pause toggle stops them.
  - `busMonitor`, `timeline`, `recover`: placeholders.
  - `projectInfo`, `export`, `backups`, `keyring`, `homeAssistant`: `projectInfo` and `export` as simple read views, the rest as placeholders.
  - `settings`: one flat page, with groups as section headings, a search field that filters the rows, and settings from the categories General, Verbindung, Backups, KI/MCP, Ordner, with ≥ 15 rows.

  It also produces `XP.palette` (⌘K / Ctrl+K and a click on the search field) with results grouped as Geräte / Gruppenadressen / Einstellungen / Befehle. Enter opens the result: a device opens a tab, a setting opens the settings page scrolled to the row and highlighted, and a command runs.

- [ ] **Step 1: Add the tests.**
  - `test_palette_finds_setting`: Ctrl+K, type "Zeitüberschreitung", press Enter. The settings view is shown and the matching row has `[data-highlight]`.
  - `test_palette_opens_device`: type "1.1.12" and press Enter, which opens the tab "1.1.12 Tastsensor Flur".
  - `test_settings_search_flat`: the settings page has no tabs, and typing "Backup" leaves only backup rows plus their heading.
  - `test_monitor_pause`: while paused, the row count stays the same for 3 s.
  - `test_every_workspace_rail_views_render`: for every workspace and every rail item, clicking it renders without console errors, and a placeholder shows its empty state.
  - Add `diagnostics`, `handover`, `settings` and `palette` to the screenshot list.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement it.**
- [ ] **Step 4: Run the smoke test.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(prototype): diagnostics, handover, settings, command palette`.

### Task 6: Visual review pass, README, publish

**Files:**
- Modify: any prototype file, `docs/design/prototype/README.md`

- [ ] **Step 1: Review the screenshot matrix** in `/tmp/xp-shots` against the Global Constraints and the skill's red flags. Check:
  - contrast (text ≥ 4.5:1, UI ≥ 3:1; compute it with a small script over the token pairs);
  - at most three type styles per view;
  - one primary action per view;
  - no clipped text in German at 400 px.

  Fix what you find.
- [ ] **Step 2: Write `README.md`.** Cover how to open the prototype (double-click `index.html`, or `python -m http.server`), what each workspace shows, which parts are placeholders, and how to run the smoke test.
- [ ] **Step 3: Run the smoke test.** Expected: PASS.
- [ ] **Step 4: Commit** `docs(prototype): review pass and README`.
- [ ] **Step 5: Publish** `index.html` with all prototype files through the Artifact tool, as a private artifact. Report the link.

### Task 7: Update the gui-design skill

**Files:**
- Modify: `.agents/skills/gui-design/SKILL.md`, `components.md`
- Create: `.agents/skills/gui-design/review.md`

- [ ] **Step 1: Add to `SKILL.md`:**
  - Under "Target design", the principles the design settled: workspaces per use case; the view sidebar plus list plus preview tabs; at most one toggle in an editor and no nested tabs; overview + detail (provisional); no locks; information that the workspace does not need is hidden, not shrunk.
  - Point to the spec and to the prototype as the visual reference that wins over this text when they disagree.
- [ ] **Step 2: Add patterns to `components.md`:** app shell, preview tabs, inspector in the editor, page list, segmented "All | Changed", guided flow / stepper, and a queue row.
- [ ] **Step 3: Create `review.md`** with the critique/audit routine adapted from Impeccable (Apache-2.0; attribute it at the top of the file):
  - scored critique (hierarchy, density fit, states, consistency, narrow/touch, copy) on a scale of 0–3 each;
  - an audit with findings ranked P0–P3;
  - a harden checklist (German/Russian text length, truncation, errors, empty data, 1 000+ rows, i18n plurals);
  - state distinction ("pending must not look like active"; static status stays still);
  - redundant labels;
  - waivers in the guard-test allowlist must name a reason and are reported when stale.

  Link `review.md` from SKILL.md's Verification section.
- [ ] **Step 4: Verify.** Ask a fresh subagent, read-only, to plan the redesign of the Group Monitor view with the skill. The plan must use preview tabs/overview + detail, take values from tokens, and run the review routine. Fix any gaps it reports.
- [ ] **Step 5: Commit** `docs(skills): gui-design learns workspaces, shell and review routine`.

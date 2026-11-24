# New UI Shell — Milestone 1: Design

Date: 2026-11-24 · Status: draft for approval (builder-checked) · Parent: `2026-11-24-gui-redesign-design.md`
(decided there: the new UI ships as a switchable alternative on the same services).

## Intent

The user runs the real editor on **their own `.xknx` project**, switches
*Settings › Interface: Classic | New* (or starts with `--interface=new`), and works
in the new shell:
- the token-based light/dark theme;
- a top bar with project, workspace switcher, ⌘K and the connection status pill;
- the labelled, collapsible view sidebar, the list column and the editor tabs with preview tabs;
- the **Group Addresses** view fully redesigned;
- every other existing panel reachable unchanged as a tab, so nothing is lost.

It works on the desktop and in the browser UI (`--web`, touch, narrow).
Classic stays the default and keeps its look and behaviour.

## Goals / non-goals / anti-goals

**Goals:** everything in Intent; MCP parity for the new setting and the new GA
operations; tests for every new widget and service method; a reproducible
screenshot command.

**Non-goals (later milestones):**
- redesigning other views (devices, parameters, commissioning, monitor …);
- the Commissioning/Diagnostics/Handover workspaces beyond a sidebar of hosted panels;
- custom saved workspaces;
- switching the default to New.

**Anti-goals:**
- Any change of Classic's look or behaviour.
- A second implementation of project logic in the UI (all edits go through `ProjectService`, one undo step each).
- Anything that works only with a mouse or only on wide screens.

## Constraints

imgui-bundle 1.93 / hello_imgui; AGENTS.md rules apply:
- UI texts with plural forms and translations in every language;
- MCP for everything visible or editable, using the GUI's service methods;
- CLI options documented;
- browser-UI rules;
- pyright strict;
- 2-space indentation.

The gui-design skill and the prototype (`docs/design/prototype/`) are the visual reference.

## Approaches (for hosting the shell)

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Second hello_imgui docking layout "New" (`alternative_docking_layouts`, runtime `switch_layout`) containing **one dockable window `###shell`** that custom-draws top bar, sidebar, list, tab strip; existing panels render unchanged inside a `begin_child` per tab | Classic's layout and .ini state stay untouched; shell owns its responsive layout (1000/600) independent of dock splits; panels need no change (none calls `imgui.begin`). Cost: main.py needs guards for Classic-only logic while New is active. |
| B | One custom shell window inside the current Classic layout | Clashes with Classic dock windows and saved layouts. |
| C | Docking layout only (no custom shell) | Cannot do the sidebar, preview tabs or drill-down. |

Fallback if `switch_layout` cannot keep Classic's dock state (desktop or web):
the switch takes effect at the next start, with a toast. This is checked in the
first shell task.

## Design

### Theme (Phase 1)
- `widgets/tokens.py` is the single source of truth: color roles for dark and light, copied
  verbatim from `design-system.md` and including `border.control`, `accent.link`,
  `accent.marker` and `status.*.text`. It also holds `space(step)` (with `space(0.5)`),
  the type styles, the density presets with a `use_density()` context, and the categorical palette.
- **Fonts:** `font(style)` returns (face, size). imgui 1.92 rasterizes sizes on demand,
  so nothing needs to be baked in advance. Verify `renderer_has_textures` on the desktop backend.
- **Themes:** `theme.py` gains **"XKNX Light"/"XKNX Dark"**, which set every `Col_` slot,
  the radii and the disabled-button colors from the tokens.
  - The choice is stored in `app.theme`, because hello_imgui's enum cannot hold custom themes.
  - New defaults to the XKNX theme matching the system (darkdetect).
  - Classic keeps its current default themes; 46 files hold literal colors tuned to them.
- **Guard test:** `tests/test_design_tokens.py` (AST, like `test_app_widgets.py`) bans
  color literals outside `tokens.py`/`theme.py`. Today's offenders are allowlisted with a
  reason, and a stale allowlist entry fails the test.
- **Screenshot command:** `apps/editor-gui/scripts/screenshot.py`, exposed through `just`
  if a justfile exists, otherwise through `uv run`.
  - It starts `--web` in an isolated data dir (`XDG_DATA_HOME` temp), with
    `--no-connect --interface=new --mcp`.
  - It drives the app via MCP and shoots with Playwright 1.64.0 (cached Chromium):
    light/dark × 1280/400 × demo project.

### Interface switch
- **Setting:** `Setting("interface", …choices Classic/New)` in `main.py::_general_settings`,
  persisted as `app.interface`. MCP access comes through `settings_get`/`settings_set`
  (add a test).
- **CLI:** `--interface=classic|new` in `cli._GENERAL`, for this start only, with a README
  "Command Line" row and a translated help text.
- **Guards:** while New is active, main.py skips the Classic-only logic:
  - `_update_web_layout`;
  - section menus;
  - the Classic status bar (its info moves into the top bar and the pill);
  - `_sync_device_section`, `_sync_project_log`, `_keep_selected_tab`.

  `take_focus_*` requests go to the shell's focus router.

### Shell (`editor_gui/shell/`)
- **Top bar:** project name, workspace switcher, ⌘K field that opens the existing command
  palette, status pill fed by `ConnectionService` (word + dot), settings gear.
  On the desktop the app menu stays reachable as a "☰" menu holding the existing
  `gui_menu` content, so no function is lost.
- **Sidebar:** a labelled list of views grouped per workspace. It collapses to icons; the
  label appears on hover and on long press. Below 600 px it becomes a navigation drawer.
- **List column** (only for views that have one) with a drag splitter. Below 1000 px it is a
  drawer; below 600 px a drill-down with a back button.
- **Tab strip:** preview tabs (italic, replaced by the next single click), pinned tabs,
  close ✕, "Anheften" for touch, horizontal scroll, the active tab kept visible.
- **Views:** a registry maps sidebar entries to either a **native view** (in M1: Group
  Addresses) or a **hosted panel** (an existing `PanelDefinition`, drawn in a child and
  `web.guarded`).
  - **Workspaces in M1:** "Planen" holds Geräte/Topologie, Gruppenadressen, Gebäude,
    Bus-Diagramm, Katalog, Health and Verlauf.
  - **"Alle Panels"** lists every other panel, so each one is reachable.
  - The other three workspaces exist as presets that group hosted panels as in the spec table.
- **Selection:** existing panels show the global selection, so activating a tab calls
  `ProjectService.select_element` for its object.

### Group Addresses view (native)
- **Tree** (list column):
  - filter box that keeps the parents of matches visible;
  - "+ Neu ▾" offering Haupt-/Mittelgruppe/Gruppenadresse, gated by the GA style the way
    `_folders_enabled`/`_middle_enabled` gate it;
  - rows: number, name, and an "unlinked" icon with a legend (not a long word);
  - click selects or opens a preview tab, double-click/F2 renames inline, long press or
    right-click opens the context menu at the pointer.
- **GA editor tab:**
  - title with ✎ (double-click renames) and caption "1/2/3 · 1.001 Schalten";
  - an "Adresse" section with "Ändern…": inline input with a live reason from the new
    validator; when the middle group is missing, the primary becomes "Mittelgruppe x/y anlegen und verschieben";
  - DPT and the linked group objects (read view, links open the device).
- **Main/middle group tab:**
  - summary box (range, contains n), with "Löschen…" in its footer;
  - a children table: Adresse | Name | count (or Datentyp | Verknüpft) with a chevron to open;
  - "+ Neue …" does a quick create: a row at the next free number, inline rename, Enter
    creates, the detail stays open, Escape discards.
- **Service additions** in `ProjectService`, each also exposed as MCP:
  - `validate_group_address_change(ga_id, text) -> reason | None, creates_range: bool`
    (format, ranges, in use, style);
  - `next_free_address_in_range(range_id)` (moved from the UI's `AddressPool`);
  - create + name in one undo step via `one_undo_step`.

  The address change itself uses `set_group_address_address`, whose core event already
  creates a missing main or middle group.
- **Widgets:** the inline rename becomes a shared widget `widgets/inline_rename.py`,
  reusable by later views.

### Texts and translations
All new UI texts are English msgids in the relevant `strings.py`, title or sentence case
per AGENTS.md, with plural forms, `.po` entries for every language, and compiled.
The German texts of the prototype become translations.

### Decisions from the builder check (my calls)
- **Live vs. restart switch:** live switching via `switch_layout` is the goal. If the first
  shell task shows that Classic's dock state cannot survive it, the switch takes effect at the
  next start with a toast. Both are acceptable for M1. The Classic-only guards in main.py
  key off one `interface_active()` check.
- **Shell ↔ app boundary:** the shell never imports `main`. main.py passes it a thin
  `ShellHost` protocol:
  - panels (`PanelDefinition`s);
  - the app menu callback;
  - open palette;
  - focus requests;
  - selection;
  - connection status.

  This keeps the shell testable headless with a stub host.
- **Texts:** every German string in this document is the German *translation*. The builder
  chooses the English msgids, applying AGENTS.md casing and plural rules.
- **Workspace presets:** the parent spec's "Workspaces" table is authoritative for which
  views each workspace shows. "Alle Panels" lists every panel not covered by a native view.
  **Tab identity is the object or panel**, not the workspace: the same panel or object opens
  in one tab, shared across workspaces.
- **Hosted panels:** one task audits every panel inside a `begin_child`:
  - window focus/hover checks;
  - popups;
  - scroll;
  - `web.guarded` context.

  It fixes the minimum needed, without restyling.
- **Persistence:** the active workspace, sidebar collapsed state and list-column width are
  stored in `app.*` settings. Open tabs are not persisted in M1.
- **Touch promotion of preview tabs:** as in the parent spec and prototype:
  - the visible "Anheften" button;
  - the first edit;
  - double-tap on the tab.

  A tap in a list replaces the preview.
- **Validator contract:** it returns `(code, message, creates_range)`. `code` is a stable enum:
  - `ok`;
  - `format`;
  - `out_of_range`;
  - `in_use`;
  - `style_forbids`;
  - `no_main_group`.

  `message` is translated. `next_free_address_in_range` returns `None` when the range is
  full, and the UI then disables quick create with a visible reason. MCP returns the code and the message.
- **Screenshots:** run via `uv run --with playwright==1.64.0` (cached Chromium). No new dependency.

## Verification
- Unit and headless imgui tests per widget and view.
- Service and MCP tests, including `test_addressing`.
- `test_web`/`test_touch` for the shell at 1000/600.
- Guard tests, `ruff`, `pyright`.
- The screenshot matrix, compared side by side with the prototype and scored with `review.md`.
- A final run on a real project file (the demo project, plus the user's own project).

## Left to the builder
- Module layout inside `editor_gui/shell/`, internal widget APIs, exact icon glyphs (one set).
- Allowlist contents of the guard test.
- How the screenshot script waits for frames.

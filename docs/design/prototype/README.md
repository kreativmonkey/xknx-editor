# Clickable prototype

A clickable mock-up of the redesigned XKNX editor GUI. Vanilla HTML, CSS and JavaScript, no build,
no network. Demo texts and chrome are German; the project "Musterhaus" is made-up data in `data.js`.

## Open it

- Double-click `index.html` (works from `file://`), or
- `python -m http.server` in this folder and open `http://localhost:8000/`.

`?fast=1` shortens the simulated programming and monitor times (0.4 s and 0.2 s instead of 4 s and 2 s).
Theme, workspace, sidebar state, panel widths and saved workspaces survive a reload (`localStorage`).

## What each workspace shows

- **Planen**: device list with preview and pinned tabs, parameter pages with changed-only filter,
  group objects with multi-select (on touch: long press, "Auswählen") and a resizable inspector, device list grouped by topology or building, group address tree with filter, create/delete of groups and addresses, inline rename (double-click the name, F2 or ✎), changing a group address (keeps the links), linked objects, context menus
  (right click or 500 ms long press), the link dialog.
- **Inbetriebnahme**: devices by status, what changed since the last programming, program scopes,
  queue with progress and a failing device, change address and replace device flows.
- **Diagnose & Service**: group monitor with simulated telegrams (pause, read, write).
- **Übergabe**: project info and the export formats with signature status.
- **Settings** (gear): searchable list; the command palette (Ctrl+K) finds devices, addresses,
  settings and commands. "Ansicht" saves the current layout as a workspace.

Layout: at least 1000 px the full shell, 600-999 px a tablet layout (icon rail, list as a drawer,
inspector as a sheet), below 600 px a drill-down stack with a back button.

## Placeholders

Gebäude, Bus-Diagramm, Produkte, Health, Verlauf, Busmonitor, Zeitverlauf, Gerät zurücklesen,
Sicherungen, Schlüsselbund and Home Assistant show only a hint page. Nothing is sent to a bus; all
values are simulated. The settings for language and density do not change the UI.

## Rules the prototype follows

Only flat fills, 1 px lines and the radii and fonts of the design system (fallbacks when the fonts
are missing). Colors come only from `tokens.css`. Every gap, padding and margin in `app.css` is a
spacing token (`--space-*`, `--space-0-5` only for hairlines and tracks) or a density preset; only
0 and 1 px are literal, and the smoke test checks it. `tools/contrast.py` prints the contrast
ratios of the token pairs for both themes (stdlib only). Nothing is loaded from the network; the
smoke test blocks and reports every http(s) request.

## Tests

```
uv run --with playwright==1.64.0 python docs/design/prototype/smoke_test.py --out /tmp/xp-shots
python docs/design/prototype/tools/contrast.py
```

The smoke test runs the behaviour checks and writes screenshots (every view, light and dark, at
1280, 800 and 400 px) to the `--out` folder.

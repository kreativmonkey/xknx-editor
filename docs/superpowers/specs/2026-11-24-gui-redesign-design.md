# GUI Redesign: Design

Date: 2026-11-24 · Status: approved 2026-11-24; the prototype in `docs/design/prototype/` supersedes the brainstorm mockups referenced below.

## Intent

The editor GUI is to reach a new level and feel like a tool of 2026. Overloaded
screens don't help anyone work. The overhaul aims for:

- **Calm and clear:** only what the current task needs is visible. Everything else is one step away.
- **Freely adaptable:** users arrange the interface the way they work.
- **Workflows, not feature piles:** prepared workspaces map typical use cases.
- **Flat structure:** no tabs inside tabs. Every setting can be found (search).
- **Safe overviews:** lists are for looking and selecting. Accidental changes in
  lists become impossible.

Users are electricians and system integrators (frequent, fast, often on site
with a tablet) and smart-home users coming through Home Assistant (occasional,
need guidance).

The work happens **draft first**. A clickable HTML prototype is the binding
reference, and the program is changed only after that.

## Goals, non-goals, anti-goals

**Goals**
- A new application shell: workspace switcher, a collapsible view sidebar, list +
  editor tabs + detail, a status pill and ⌘K search.
- Four prepared workspaces (Planning, Commissioning, Diagnostics & Service, Handover)
  plus user-defined ones.
- The "overview + detail" pattern for every list.
- Guided flows for commissioning cases (program, change address, replace device).
- A design system (tokens, components) as described in `.agents/skills/gui-design/`.

**Non-goals**
- No change to KNX behaviour, download logic, project format or MCP semantics.
- No change to the *content* of manufacturer parameter pages (`.knxprod`). Only how they are presented changes.
- No parallel second GUI in the long run.

**Anti-goals** (failure even if it works technically)
- A prettier skin over the same nesting and the same overloaded lists.
- Anything that works only with mouse hover, or only on wide screens.
- A prototype that promises effects ImGui cannot deliver.

## Constraints

- The program is Dear ImGui (imgui-bundle 1.93) and also runs as a browser UI (`--web`):
  touch, narrow screens, shared state, and bandwidth per frame.
- AGENTS.md rules stay: UI texts (Title/Sentence case, plural forms, translations),
  MCP parity for everything visible or editable, undo per edit, tests.
- Panels are dockable today (hello_imgui docking). Workspaces build on that.
- Existing functions are mapped into the new structure, not invented anew. For example,
  "Replace Device" with group-object remapping and the individual address via serial
  number already exist.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Clickable HTML prototype → then implement in ImGui in phases | Fast to iterate, shareable, testable with others. Built twice, but the second build follows a settled design. |
| B | ImGui prototype directly in the program behind `--new-ui` | Real data, but every design change costs far more while much is still open, and half-finished code stays in the program. |
| C | Design document with static mockups only | Fastest, but you only feel the interplay (switching, collapsing, multi-select, flows) by clicking it. |

For the later implementation: **introduce it area by area.** First the shell plus tokens,
then one view after the other. Not a complete parallel rebuild, because browser mode,
MCP and tests would otherwise have to be maintained twice.

## Decided design

The reference mockups are in `.superpowers/brainstorm/…/content/` (shell-v2,
lists-overview, workspace-commissioning, flows-readdress-replace). The prototype
takes them over.

### Application shell
- **Top bar:** product, project name, **workspace switcher** ("✎ Planning ▾"), the
  ⌘K search (devices, addresses, settings, commands), and the **connection status
  as a pill** next to the search ("● Offline", "● IP router 1.0.0"), then the settings gear.
- **View sidebar on the left:** expanded, it shows labelled entries in groups
  (e.g. PROJECT: Devices, Group Addresses, Buildings, Bus Diagram · CATALOG · CHECK:
  Health, History) with counters/badges. It collapses to icons, with the label on
  hover and by long press. Which entries appear is set by the workspace.
- **List column:** a filterable list of the chosen view (devices grouped by line).
  This is the fast way to switch devices.
- **Editor tabs:** several open objects side by side (device, group address,
  a second device), closable, like a browser.
- **Detail/editor:** a header with name (title) + one caption line of key facts
  ("1.1.4 · MDT AKS-0816.03 · Kitchen"). There is at most **one** toggle above the content
  (e.g. "Parameters | Group Objects"). Nothing is nested below that.
- List, detail and other panels can still be moved, docked or hidden.
  A changed arrangement can be saved as a custom workspace.
- **Opening from the list (my call, like VS Code):** a single click shows the object in a
  *preview tab* (italic title), which the next click replaces, so tabs don't pile up. A
  double-click, Enter or the first edit turns it into a normal tab.
- **"Detail" is the content of the active tab**, not its own panel. Lists *inside* an editor
  (Group Objects) get an **inspector on the right inside the editor** (≈ 280 px,
  collapsible). On narrow screens it goes below the table / becomes a full-screen sheet (my call).
- **Narrow and tablet** (my call, following the existing `form_factor()` breakpoint of 1 000):
  - ≥ 1 000: full shell.
  - 600–1 000 (tablet): sidebar as icons, list column collapsible to a drawer, inspector as a sheet.
  - < 600: drill-down stack sidebar → list → editor with a back button. The sidebar becomes a
    menu drawer, and the status pill and ⌘K stay in the top bar.

### Device editor (Planning)
- Parameter pages/channels as a **page list on the left in the editor** instead of tab rows.
  A dot marks pages with changed values.
- Parameter filter + **"All | Changed (n)"**. Changed values carry a dot and can be reset.
- **No lock anywhere** (decided): editing is possible in every workspace. Safety comes
  from the overview + detail rule and from workspaces that simply don't put editors up
  front. (The "🔒 Bearbeiten" button in the early mockups is dropped.)
- The mouse wheel never changes values in fields while scrolling.

### Lists: overview + detail (provisional rule)
- List rows contain **no input fields**, only text, compact symbols
  (flags as letters, addresses as chips, the type as a name instead of a number) and badges.
- Click selects. Double-click/Enter opens the detail. Multi-select is edited together in the
  detail area.
- Quick actions (link, copy, go to …) are in the context menu / behind a long press.
- Renaming happens in the detail area or with F2. Nothing is edited inline.
- **Provisional:** check whether this rule is too strict once the prototype exists.

### Workspaces
| Workspace | Sidebar | List shows | Main action / focus | Hidden |
|---|---|---|---|---|
| **Planning** | Devices, Group Addresses, Buildings, Bus Diagram, Catalog, Health, History | product, room | parametrize, link | monitor, programming, connection |
| **Commissioning** | Devices (badge "n open"), Queue, Connection, Group Monitor, Health | **programming status** (parameters changed, addresses changed, new, error), filter All/Open/Error | "Program Parameters" with the scope proposed from the changes, queue with progress and inline errors | manufacturer/order/hardware info, catalog, editing buildings (parameters reachable via tab/⌘K) |
| **Diagnostics & Service** | Group Monitor, Bus Monitor, Timeline, Health, Devices, Read Back Device (Recover) | live values / last telegram | read/write values, find a fault | catalog, editing buildings |
| **Handover** | Project Info, Export & Signing, Backups, Keyring, Home Assistant | — | export, back up, hand over | almost everything that edits |

Commissioning shows "Changed since last programming" in the device detail, plus the proposed
scope with its reason and duration. "Other Scope ▾" is the second button.

**Queue (my call):**
- "Program …" adds the device to the queue.
- The queue starts on its own and works one device at a time, because the bus is serial.
- A device can be cancelled while it waits. A running download is cancelled at a safe point.
- "Retry" puts a failed device back in the queue.
- The "changed since last programming" state clears only after a successful download.
- Change Address runs directly in its dialog (short, single operation). Replace Device ends in the queue.

### Guided flows (Commissioning)
- Reachable through "More Actions ▾" in the device detail, the list's context menu/long press, and ⌘K.
- **Change Address:** a single dialog. Old → new, with a check "free in project and on bus".
  Identification by: answers under the old address / programming button / serial number.
  The primary action is named after its result ("Change Address to 1.1.20").
  It adjusts the project (undoable) and lists affected devices.
- **Replace Device:** four steps.
  1. Replacement: same / different model.
  2. Find the new device: programming button with a visible wait, or serial number.
  3. Review the takeover: address, parameters, links, Data Secure (FDSK) as an open item.
     For a different model, the group-object mapping old → new.
  4. Program: the device goes to the queue.

### Visual language
As in `.agents/skills/gui-design/` (design-system.md, components.md):
- Hybrid density: compact work surfaces, airy guided surfaces, always comfortable on touch.
- Neutral surfaces. Accent only for the primary action, the selection and the focus. Status colors only for status,
  never color alone.
- Type scale instead of boxes. A 4 px grid.
- Light and dark theme from the same tokens.

## Prototype (deliverable of the next step)

- **Form:** a clickable HTML prototype without a build step (vanilla HTML/CSS/JS, one folder),
  committed under `docs/design/prototype/`. It is also published as a private artifact for sharing.
- **Content:**
  - the shell with a working workspace switch, sidebar collapse/expand, list → tab → detail;
  - Planning (device editor with page list and All/Changed);
  - the Group Objects overview + detail with multi-select;
  - Commissioning with queue and the flows Change Address and Replace Device;
  - the Group Addresses view as a **tree** overview + detail (tests the list rule on a tree);
  - Diagnostics and Handover at least as views, with Group Monitor as real content.
    Other views (Buildings, Bus Diagram, Catalog, Health, History, Connection) are
    labelled placeholders with an empty state (my call);
  - **adaptability, light version (decided):**
    - panels can be shown and hidden;
    - list and inspector widths can be dragged;
    - "Save as Workspace…" adds a custom entry to the workspace menu.
    No drag-and-drop docking in HTML, because ImGui docking provides that in the program;
  - settings as one flat, searchable page; ⌘K with results;
  - light/dark switch; a narrow layout (≈ 400 px) and touch behaviour (long press).
- **Data:** the realistic demo content of the mockups (Musterhaus, lines 1.1/1.2, real
  product names and DPTs).
- **ImGui feasibility:** only flat surfaces, 1 px lines, radii, solid fills, and the
  bundled fonts (XKNX Sans, Inconsolata). Values come from the token table of the skill.
  No soft shadows, blur, gradients or CSS-only animation.

## After the prototype (outline)

1. Validate the prototype and adjust the design and the skill.
2. Phase 1: tokens + custom theme + guard test + screenshot command.
3. Phase 2: shell (sidebar, tabs, workspaces as saved layouts) + shared components.
4. Phase 3: migrate the views one by one (MCP, browser UI, tests in every change).

## Left to the builder

- The exact visual details within the token system, icon choice within one set,
  and the texts of the prototype (German demo content, English UI texts later per AGENTS.md).
- How the prototype is structured in code.

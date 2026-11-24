# Component Patterns (Phase 2)

Every pattern here is built **once** in `src/editor_gui/widgets/`, takes
its values from `widgets/tokens.py`, and gets a headless imgui test. Panels compose
these patterns. They do not restyle them.

## Panel anatomy (work surface)

```
┌ dock tab: "Group Addresses" ───────────────────────────┐
│ [filter_box ............]   [+ Add]  [⋯]               │  toolbar: 1 row, space(2) gaps,
│────────────────────────────────────────────────────────│  wraps with same_line_if_fits
│ content (tree / table), fills the panel, own scroll    │
│                                                        │
│────────────────────────────────────────────────────────│
│ 1 234 group addresses · 3 selected              caption│  optional footer, text.secondary
└────────────────────────────────────────────────────────┘
```

- There is no title inside a docked panel, because the dock tab already names it.
- The toolbar sits on top: the filter on the left, actions on the right (and below the filter when narrow).
  The primary action is a labelled button. The rest goes into an overflow "⋯" menu that also opens
  by long press.
- Content scrolls on its own. Toolbar and footer stay fixed.
- Selection, the context menu and double-click must do the same on touch (long press = right
  click, tap = select, a visible "Open" action for double-click).

## States (each panel shows each one)

| State | Look |
|---|---|
| **Empty** | centered in the content area: icon (2× body, `text.secondary`), one `title` line, one `body` sentence in `text.secondary`, one primary button ("Import KNX Product…"). Comfortable density even inside a work surface. |
| **Filtered to nothing** | one line "No results for “…”" + a "Clear Filter" button. This is not the empty state. |
| **Loading** | in place of the content: spinner + label. If it lasts more than 1 s, use the determinate `busy_bar` with a count. Never a blank panel. |
| **Error** | an inline banner at the top of the content: `status.error.subtle` background, icon + sentence + action ("Retry", "Show Log"). No modal for recoverable errors. |
| **Disabled** | `text.disabled`. The reason is visible next to the control or in a hint line, not only in a tooltip. |
| **Many rows** | clipped rendering (`ImGuiListClipper`), uniform row height, header stays visible. |

## Buttons

- **Primary:** `accent` fill + `accent.text`. At most one per view or dialog.
- **Secondary (bordered):** no fill + 1 px `border.control` outline; `bg.raised` fill while toggled on.
  `border.strong` is only for dialog and popup edges, never for control outlines.
- **Quiet:** no fill, `text.primary`, hover overlay. Used for toolbars and rows.
- **Danger:** a secondary style with `status.error` text. It always asks for confirmation unless it can be undone.
- Height follows the density preset. Min width is 64 px (labelled). Icon + label are separated by `space(1)`.
- Button rows always go through the row helper (wraps via `same_line_if_fits`).
  In dialogs the order is fixed: primary right-most on desktop, full-width stacked on narrow.

## Tables (`begin_data_table`)

- Compact rows, no zebra stripes, horizontal `border.subtle` lines only, row hover
  `bg.hover`, selection `bg.selected` + a 2 px marker at the left edge (see *Selection marker*).
- Cells are read-only (overview + detail): text, letters for flags (mono), addresses as chips,
  the type as a name, badges. No input fields, combos or checkboxes in a row.
- Header: `label` style, `text.secondary`, sticky.
- Numbers, addresses and sizes are right-aligned and tabular. Text is left-aligned. Status columns show a badge.
- Truncate with an ellipsis. The full text appears on hover **and** in the details/inspector
  or a context-menu "Copy".
- Column widths are explicit. Optional columns are hidden through the header menu.

## Navigation list rows (findings, search results, recent files)

For rows that jump somewhere instead of being selected:

- The whole row is the target: full width, density row height (44 px on touch).
- Layout: leading icon slot (fixed width), primary text (`body`, wraps when narrow),
  secondary line or trailing metadata (`caption`, `text.secondary`), and a trailing chevron
  as a visible "opens something" cue.
- The state is hover `bg.hover` + keyboard focus ring. There is no persistent selection.
- A row without a target has no chevron and no hover.
- Group rows under a `label`-style section label ("Errors · 3"). A label is text, not a box.

## Severity mapping

| Domain level | Role | Icon |
|---|---|---|
| error, failed, invalid | `status.error` | exclamation-circle |
| warning, needs attention | `status.warning` | exclamation-triangle |
| hint, info, notice | `status.info` | info-circle |
| ok, done, connected | `status.success` | check-circle |

The order is always error → warning → info → success.

## Badges and status

- **Badge:** a pill (`radius 999`), `caption` text, `status.*.subtle` background +
  `status.*` text, and an icon for status. Used for counts, states and tags.
- **Status dot:** an 8 px circle + a word, for connection/programming state in lists.
- **Banner:** a full-width block for state that concerns the whole panel (offline,
  project read-only). It has icon + sentence + optional action and can be dismissed if not critical.
- **Toast:** only for the results of background actions. It is never the only place an error shows.
  Errors stay in the Logger and in context.

## Forms and settings (guided surface)

- Labels sit in a left column (`label_column_width`, the same width within a form) and are vertically
  centered to the control. On narrow screens the label goes above the field.
- Group fields under section headings (`title`), with `space(6)` between groups.
  No group boxes.
- A hint line below a field uses `caption` + `text.secondary`. Validation errors replace the
  hint in `status.error`, with an icon, and appear on edit/blur, not on open.
- Field widths follow the expected content (an IA field is short, a name field is long), not the window width.

## Dialogs (`begin_dialog`)

- Comfortable density, `window_padding` `space(6)`, `title` heading.
- Width is 480 for confirmation, 640 for forms, 880 for wizards (clamped to the screen;
  full-screen sheet on narrow).
- Layout: heading → one sentence of context → content → button row
  (`dialog_buttons`: secondary "Cancel", primary action named by its verb — "Delete 3 Devices",
  not "OK").
- Destructive confirmations say what will happen, and whether it can be undone.

## Trees (topology, GA, buildings)

- Indent per level is `space(4)`. A chevron disclosure, not a +/- box.
- The row shows icon (`text.secondary`), name (`body`) and trailing metadata (`caption`,
  `text.secondary`, right-aligned when there is room, hidden when narrow).
- Selection and hover match the tables. Drag & drop shows an `accent` insertion line.

## Selection marker

Selected rows (tables, trees, page list, palette, highlighted setting) get `bg.selected`
plus a 2 px left marker. In dark the selection fill is close to the canvas, so the marker
carries the selection: it must reach **≥ 3:1 against `bg.selected`**. `accent` gets only
2.65:1 there, so use `accent.link` (5.7:1) in dark; `accent` (3.7:1) or `accent.link` in light.
Selected text stays `text.primary`; never mark selection by color alone.

## App shell

```
┌ top bar 40 ──────────────────────────────────────────────────────────────────┐
│ XKNX  Musterhaus  [✎ Planning ▾]      [⌕ Search… ⌘K]  (● IP router 1.0.0)  ⚙ │
├ sidebar 200/48 ┬ list ~280 ──────┬ tab bar 34 ─────────────────────────────┤
│ Project        │ [filter……]      │ [1.1.4 Kitchen ×][ 1/2/3 Light ×]       │
│  ▣ Devices  12 │ 1.1 Ground      │ ┌ editor (active tab) ─────────────────┐│
│  ▣ Group Addr. │  1.1.4 Kitchen ▌│ │ title + caption line of key facts    ││
│ Check          │  1.1.5 Hall     │ │ [Parameters | Group Objects]  ≤ 1    ││
│  ▣ Health  ⚠2  │ 1.2 Upper floor │ │ content                              ││
│ « Collapse     │                 │ └──────────────────────────────────────┘│
└────────────────┴─────────────────┴─────────────────────────────────────────┘
```

- **Top bar** (`bg.canvas`, `border.subtle` below): product, project name (truncates first),
  workspace switcher (bordered, caption, menu with the workspaces, "Save as Workspace…"),
  ⌘K search field (`bg.inset` + `border.control`), connection **status pill** (pill, dot + word,
  `border.subtle`), settings gear. Narrow: project name, pill word and search hint hide; the dot stays.
- **View sidebar** (`bg.canvas`): `label`-style group names, rows of icon + label + count or
  badge. Selected row `bg.raised`, its icon `accent.link`. Collapsed to 48 the labels hide and
  show on hover **and** long press. The workspace decides which rows exist.
- **List column** (`bg.surface`): sticky filter on top, rows grouped by `label` headers
  (devices by line). Width draggable; can be hidden.
- **Tab bar + editor:** see *Preview tabs*. The editor is the content of the active tab.
- Panels can be hidden and resized; in the program they dock (hello_imgui). A changed
  arrangement can be saved as a workspace.
- **Tablet (600–999):** sidebar as icons, list as a drawer, inspector as a sheet.
  **Phone (< 600):** one column at a time (sidebar → list → editor), back button in the top bar,
  sidebar as a menu drawer; status pill and ⌘K stay.

## Preview tabs

- Tab bar `bg.canvas`, 34 high; tabs 200 wide, `caption` text, close "×" in every tab
  (44 × 44 on touch). Active tab `bg.surface` + `text.primary` + a 2 px `accent` top line;
  inactive `text.secondary`, hover `bg.hover`.
- A single click in a list opens the object in **the** preview tab (title in italic); the next
  single click replaces it. Double-click, Enter or the first edit turns it into a normal tab.
- One object is open at most once; opening it again activates its tab.
- Tabs never nest: an editor has at most one toggle (segmented control) above its content.

## Inspector in the editor

For lists inside an editor (Group Objects, linked objects):

- A right column **inside the editor**, ≈ 280 wide, `border.subtle` on its left, collapsible
  and resizable. Narrow: below the table, or a full-screen sheet with a close action.
- Header: name (`title`) + one caption line of key facts ("1.1.4 · MDT AKS-0816.03 · Kitchen").
  Do not repeat facts that fit in that line as a label/value table.
- Body: the editable fields of the selection, flags as toggle buttons (`border.control`,
  on = `bg.selected` + `accent` edge), linked addresses as chips with remove "×", then actions.
- Multi-selection: header says the count ("3 Group Objects"); fields that differ show
  "Mixed" and change all selected on edit, as **one** undo step.
- Nothing selected: the facts of the open object plus one `caption` hint how to select
  ("Select group objects in the list (Ctrl/Shift-click for several) to edit them here").

## Page list (parameter pages)

- A column on the left inside the device editor, ≈ 160 wide, instead of tab rows.
- Rows: `row-h`, `text.secondary`; selected `bg.selected` + `text.primary` + marker.
  A page with changed values shows a 6 px `accent` dot (plus "Changed" in its tooltip and in
  the "Changed" filter, so the dot is not the only cue).
- Narrow: the page list becomes a select above the content.
- Content: section headings per parameter group, labels left in a fixed column, controls
  right. A changed value: label goes `text.primary`, a dot and a reset action. The mouse
  wheel never changes a field while scrolling.

## Segmented control ("All | Changed (n)")

- Container `bg.inset`, radius 6, 2 px padding and gap; segments `caption`, `text.secondary`;
  the active one `bg.raised` + `text.primary`. Height = control height − 4.
- Use it for a filter or a view toggle with 2–4 options that are always visible.
  The count is part of the label ("Changed (3)"); "Changed (0)" stays visible and selectable,
  and shows the filtered-to-nothing state.
- Not for actions, and only one per editor header.

## Guided flow / stepper

- Lives in a dialog (880 for wizards; full-screen sheet on narrow). Short operations (Change
  Address) are one dialog; longer ones (Replace Device) get steps.
- Step header: a row of steps, each a 20 px number circle + `caption` label over a 2 px
  bottom line. Upcoming: `border.subtle` line, `bg.inset` circle, `text.secondary`.
  Current: `accent` line and circle (`accent.text` number), `text.primary`. Done: `text.primary`
  with a check. Narrow: only the current step shows its label.
- One question per step. "Back" (secondary) and the primary action named by its result
  ("Change Address to 1.1.20", "Add to Queue"). Checks show inline as icon + sentence in
  `status.*.text` ("Free in project and on the bus").
- Waiting for the user (press the programming button) shows a visible wait line
  (`status.warning.text` + a static icon + "Cancel"), not a spinner alone.
- Review step: one row per item taken over: label, value, and a mark that differs in shape,
  not only color (✓ taken over / ! open, `status.*.text`). The meaning of the marks is visible
  (a word beside the mark or a caption legend), not only in the tooltip and accessible name.

## Queue row

```
● 1.1.4  Kitchen actuator ……………  Parameters  Programming · 42 %  [Cancel]
  ▓▓▓▓▓▓▓░░░░░░░░░
```

- Row: status dot + address (`mono`, `text.secondary`) + name (truncates) + scope (`caption`)
  + state word (`caption`) + one action, `border.subtle` line between rows. Wraps when narrow.
- States, each with a word: **waiting** neutral dot + "Waiting" + "Cancel"; **running**
  `status.warning` dot + "Programming · n %" + a 6 px progress bar (`bg.inset` track, `accent`
  fill) + "Cancel" (then "Cancelling at the next safe point…", disabled); **done** `status.success`
  + "Done"; **failed** `status.error` + "Failed" + the error line in `status.error.text` + "Retry".
- Waiting must not look like running: only the running row has a bar and a moving number.
- The queue works one device at a time (serial bus). Header: "1 running · 2 waiting" + "Remove Finished".

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
- **Secondary:** `bg.raised` fill + `border.strong` outline.
- **Quiet:** no fill, `text.primary`, hover overlay. Used for toolbars and rows.
- **Danger:** a secondary style with `status.error` text. It always asks for confirmation unless it can be undone.
- Height follows the density preset. Min width is 64 px (labelled). Icon + label are separated by `space(1)`.
- Button rows always go through the row helper (wraps via `same_line_if_fits`).
  In dialogs the order is fixed: primary right-most on desktop, full-width stacked on narrow.

## Tables (`begin_data_table`)

- Compact rows, no zebra stripes, horizontal `border.subtle` lines only, row hover
  `bg.hover`, selection `bg.selected` + a 2 px `accent` marker at the left edge.
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

## Inspector / detail panes (device, parameters)

- The header has the name (`title`) plus key facts as a caption line ("1.1.4 · Gira · Switch actuator").
  It does not repeat a label/value table for facts that fit in one line.
- Parameters: section headings for the parameter groups, labels left and controls right
  in a consistent column. A changed value shows a subtle "modified" marker plus a reset action.

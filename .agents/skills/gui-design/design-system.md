# Design System Specification (Phase 1)

The target token layer. Build it once and make every surface use it.
The values are the starting design. When you change one, change it here too,
so this file stays the specification.

## Architecture

- **One module, `src/editor_gui/widgets/tokens.py`:** pure data plus small
  accessors, with no drawing.
  - `color(role) -> ImVec4` / `color_u32(role)`: role names as below, resolved for the active theme.
  - `space(step) -> float`: spacing scale, already multiplied by `px()`.
  - `font(style)` / `with_font(style)`: type scale, backed by `widgets/fonts.py`.
  - `density() -> Density` (`COMPACT` / `COMFORTABLE`) and a context manager
    `use_density(...)` that pushes the matching style vars for a surface.
    `web.touch_used()` forces `COMFORTABLE`.
- **`theme.py`** builds the full ImGui style (`ImGuiStyle` colors + vars) from
  the tokens: a custom light theme and a custom dark theme. This replaces the stock
  `microsoft_style` / `darcula_darker` and the Windows palette. Keep the
  themes switchable at runtime, with darkdetect on the first start.
- Every `Col_` slot of ImGui is set from a role. No slot keeps a stock value.
- **Data colors** (DPT enums, Timeline series, Bus Diagram) come from the
  categorical palette below, not from per-plugin palettes.
- **Guard test** (`tests/test_design_tokens.py`, AST-based like
  `tests/test_app_widgets.py`): no `ImVec4(` / `color_u32(` literals and no
  `push_style_color` with literal colors outside `widgets/tokens.py` and
  `theme.py`. Start it with an allowlist of today's offenders, and shrink it
  with every migration.

## Spacing — 4 px grid

| Token | px | Use |
|---|---|---|
| `space(1)` | 4 | icon ↔ label, dense cell padding (vertical) |
| `space(2)` | 8 | between related controls, compact item spacing |
| `space(3)` | 12 | field ↔ field in comfortable forms |
| `space(4)` | 16 | panel padding (comfortable), between groups |
| `space(6)` | 24 | between sections, dialog padding |
| `space(8)` | 32 | guided surfaces: block separation, Welcome |

No other gaps are allowed. "Related things close, unrelated things far" is
done with these steps.

### Density presets

| ImGui var | Compact | Comfortable |
|---|---|---|
| `frame_padding` | 6 × 3 | 10 × 6 |
| `item_spacing` | 8 × 4 | 8 × 8 |
| `item_inner_spacing` | 4 × 4 | 6 × 6 |
| `cell_padding` | 6 × 2 | 8 × 6 |
| `window_padding` | 8 × 8 | 24 × 24 (dialogs) |
| row / control height | ≈ 22–24 | ≈ 32 (touch ≥ 44) |
| `scrollbar_size` | 10 | 14 |

## Type scale

The family is XKNX Sans (Regular, Semilight, Bold), with Inconsolata for code/hex.

| Style | Size | Weight | Use |
|---|---|---|---|
| `caption` | 12 | Regular | secondary metadata, table footers, hints |
| `body` | 14 | Regular | default text, table cells, controls |
| `body_strong` | 14 | Bold | the emphasized value in a row, active item |
| `label` | 12 | Bold, ~4 % tracking if supported | section labels in work surfaces (Sentence/Title case per AGENTS.md — no ALL CAPS) |
| `title` | 16 | Bold | panel/section titles, dialog titles |
| `heading` | 20 | Semilight | guided surfaces: page headings |
| `display` | 28 | Semilight | Welcome only |
| `mono` | 13 | Inconsolata | hex, raw telegrams, memory |

Rules:

- Use at most **three** styles in one view.
- Show hierarchy with size/weight first and with `text.secondary` second.
- Load the fonts at these sizes (do not scale glyphs at run time), so they render crisply in both
  the desktop and the web renderer. This needs `load_fonts` in `widgets/fonts.py` to bake every size.
- Individual addresses, group addresses and numbers are right-aligned in tables
  where they are compared. Use tabular figures (mono, if the sans has none).

## Color roles

Starting values. Verify contrast after every change.

| Role | Dark | Light | Use |
|---|---|---|---|
| `bg.canvas` | `#1E1F22` | `#F7F8FA` | dock background, behind panels |
| `bg.surface` | `#2B2D30` | `#FFFFFF` | panel/content background |
| `bg.raised` | `#393B40` | `#FFFFFF` | popups, menus, dialogs (+ border) |
| `bg.inset` | `#232427` | `#F2F3F5` | input fields, code/hex areas |
| `bg.hover` | `#FFFFFF0F` | `#0000000A` | row/control hover overlay |
| `bg.selected` | `#2E436E` | `#D4E2FF` | selected rows |
| `border.subtle` | `#393B40` | `#EBECF0` | dividers, table lines |
| `border.strong` | `#4E5157` | `#C9CCD6` | input outlines, dialog edges |
| `text.primary` | `#DFE1E5` | `#1E1F22` | body |
| `text.secondary` | `#9DA0A8` | `#686C79` | metadata, hints, captions |
| `text.disabled` | `#6F737A` | `#A8ADBD` | disabled |
| `accent` | `#3370E8` | `#3370E8` | primary button, focus ring, links, selection marker |
| `accent.hover` | `#2B62D3` | `#2E5FC9` | |
| `accent.text` | `#FFFFFF` | `#FFFFFF` | text on accent |
| `status.success` | `#5FB865` | `#1F843A` | ok / programmed / connected |
| `status.warning` | `#E5A63B` | `#A76400` | needs attention |
| `status.error` | `#F86775` | `#D1293D` | failed / invalid |
| `status.info` | `#6395F8` | `#3370E8` | neutral notices |
| `status.*.subtle` | 15 % of the status color on `bg.surface` | 10 % | background of banners/badges |

`theme.status_color(kind)` stays as a thin wrapper over `color("status.<kind>")`
during the migration.

**Categorical data palette** (8 steps, used in order; tested on both
backgrounds): blue `#3574F0`, orange `#E08855`, teal `#2AA79B`, purple `#9A6DD7`,
yellow `#D4A72C`, pink `#D9578C`, green `#5FA463`, grey `#8C8F96`. Run the
Timeline, Bus Diagram and DPT enum colors through it.

## Shape, elevation, motion, icons

- **Radius:** 0 for docked panels and tables, 4 for controls/buttons/inputs,
  6 for popups, menus and dialogs, and 999 (pill) for badges and filter chips.
- **Elevation:** docked surfaces are separated by `bg.canvas` gaps and
  `border.subtle`, without shadows. Popups and dialogs get `bg.raised` + `border.strong`
  + a modal dim of 40 % black.
- **Focus:** a 2 px `accent` ring on keyboard focus, always visible.
- **Motion:** only for state changes (expand, toast in/out, progress), at most 150 ms,
  ease-out. No idle animation: the app idles at low FPS, and in `--web`
  every frame costs bandwidth.
- **Icons:** one icon set. Decide in Phase 1 between Font Awesome 6 (the `.otf` is
  already in `assets/fonts/`) and the current FA4, and migrate everything. Icons are
  `body` size and use `text.secondary` unless they show status. Give glyphs named
  constants in one module, never literal characters in panels. An icon without a
  word is allowed only for universal actions (close, search, more, add, remove), and then
  it needs a tooltip **and** must be in a context menu or labelled on touch.

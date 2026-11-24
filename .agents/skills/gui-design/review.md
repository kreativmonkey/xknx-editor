# Review Routine

Adapted in part from Impeccable (https://github.com/pbakaus/impeccable), Apache-2.0.

Run this on every redesigned surface, in the prototype and in the program, **after** you
have the screenshot matrix (SKILL.md, *Verification*). Review the screenshots and the running
UI, not the code. Put the score table and the open findings into the PR description.

## 1. Scored critique (0–3 each)

| Criterion | 0 | 1 | 2 | 3 |
|---|---|---|---|---|
| **Hierarchy** | everything looks equal | primary content findable with effort | clear primary, secondary blurs | primary → secondary → tertiary obvious at a glance, by type and space, ≤ 3 type styles |
| **Density fit** | wrong preset for the surface | right preset, but crowded or sparse spots | fits, small leaks | compact work / comfortable guided / comfortable touch, nothing shrunk to fit (hidden instead) |
| **States** | only the happy path | some states missing | all states, some look alike | empty, filtered-to-nothing, loading, error, disabled, selected, many rows each designed and distinct |
| **Consistency** | local styles, literals | mostly tokens, some local helpers | tokens + shared widgets, small drift | only tokens and `widgets/` components; matches the prototype |
| **Narrow / touch** | breaks below 1 000 | usable, hover-only paths remain | works, awkward spots | tablet and phone layouts work, 44 px targets, long press = right click, no hover-only path |
| **Copy** | missing or wrong case | mostly right | right, some wordy or vague | Title/Sentence case per AGENTS.md, "…" on openers, verbs on primary actions, plural forms, no redundant labels |

Total out of 18. Below 12, or any 0 or 1: not done. Say what lifts each criterion below 3 by one point.

## 2. Audit: findings ranked P0–P3

One line per finding: **priority · where · what · fix**.

| Priority | Meaning | Examples | Ships? |
|---|---|---|---|
| **P0** | blocks a task or loses data | action unreachable on touch, wheel changes a value while scrolling, destructive action without confirm or undo | no |
| **P1** | breaks a rule of this skill or AGENTS.md | contrast below 4.5:1 / 3:1, status by color alone, tooltip-only label, input field in a list row, nested tabs, literal color | no |
| **P2** | visible inconsistency or friction | wrong spacing step, second primary button, pending looks like active, truncation without the full text elsewhere | fix or file |
| **P3** | polish | alignment by 1–2 px, a quieter word, icon choice | may wait |

## 3. Harden checklist

Fill the surface with hostile data and check each:

- [ ] **Long text:** German and Russian strings (≈ 30–40 % longer than English) in buttons,
      tabs, headers and labels. Rows wrap or truncate; nothing overlaps or clips mid-glyph.
- [ ] **Truncation:** every ellipsis has the full text in reach: hover **and** inspector,
      detail or "Copy" in the context menu.
- [ ] **Errors:** each failure path shows icon + sentence + action in context (banner or
      inline), not only a toast; the Logger has it too.
- [ ] **Empty data:** empty project, empty list, filtered to nothing, no selection: each has
      its own state (components.md, *States*).
- [ ] **Many rows:** 1 000+ rows scroll smoothly (clipper), header stays, selection and
      multi-select still work, counts stay readable.
- [ ] **Plurals:** every count uses gettext plural forms (1, 2, 5, 21 in Russian/Polish);
      no "(s)" suffixes.
- [ ] **Both themes, both widths:** light/dark × wide/narrow, contrast checked.

## 4. State distinction

- **Pending must not look like active.** Waiting, running, done and failed differ in more than
  color: word, icon, and only the running item moves (progress bar, changing number).
  A queued device, an unsent write, a selected-but-not-open item each look calmer than the
  active one.
- **Static status stays still.** Offline, error, "3 open" do not blink, pulse or spin.
  Motion is for state changes and real progress only (≤ 150 ms, no idle animation; every frame
  costs bandwidth in `--web`).
- Selected, hovered, focused and changed are four different looks; check them side by side.

## 5. Redundant labels

Remove text that says what the layout already says:

- A heading that repeats the dock tab, editor tab or sidebar entry.
- "Name: Kitchen" where the title already is the name; label/value tables for facts that fit
  in the caption line.
- Column headers repeated as cell prefixes; "Status: OK" next to a status badge.
- Buttons like "Click here to …"; hints that repeat the label.

Keep a label when the value alone is ambiguous (two addresses side by side, units).

## 6. Waivers in the guard tests

The allowlists of the guard tests (`tests/test_design_tokens.py` from Phase 1, the `allowed`
modules in `tests/test_app_widgets.py`) are debt, not exceptions:

- Every entry names a **reason** (and ideally the migration that removes it) next to it.
  An entry without a reason is a P2 finding.
- The guard test reports **stale** entries: an allowlisted file or line that no longer
  offends fails the test until the entry is removed, so the list only shrinks.
- A review lists the waivers the change added or kept, with their reasons.

"""WCAG contrast ratios for the token pairs in tokens.css (stdlib only).

Run: python docs/design/prototype/tools/contrast.py   (exit 1 when a pair fails)
Text needs 4.5:1, accent as UI 3:1. border-control needs 3:1 on surface and inset; border-strong/subtle are decorative.
"""
import re
import sys
from pathlib import Path

CSS = (Path(__file__).resolve().parent.parent / "tokens.css").read_text()


def block(theme):
  m = re.search(r":root\[data-theme=%s\]\{(.*?)\n\}" % theme, CSS, re.S)
  return dict(re.findall(r"--([a-z-]+):(#[0-9A-Fa-f]{6,8})", m.group(1)))


def rgb(h):
  h = h.lstrip("#")
  return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def over(fg, bg):
  """Blend an #RRGGBBAA foreground over a background."""
  a = int(fg[7:9], 16) / 255 if len(fg) == 9 else 1
  f, b = rgb(fg[:7]), rgb(bg)
  return tuple(f[i] * a + b[i] * (1 - a) for i in range(3))


def lum(c):
  def f(v):
    return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
  r, g, b = map(f, c)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
  la, lb = sorted((lum(a), lum(b)), reverse=True)
  return (la + 0.05) / (lb + 0.05)


def main():
  bad = 0
  for theme in ("dark", "light"):
    t = block(theme)
    pairs = []
    surf = ("bg-surface", "bg-raised", "bg-inset", "bg-selected")
    for bg in ("bg-surface", "bg-canvas", "bg-inset", "bg-selected"):
      pairs.append((f"text-primary on {bg}", "text-primary", bg, 4.5))
    for bg in ("bg-surface", "bg-canvas", "bg-raised", "bg-inset", "bg-selected"):
      pairs.append((f"text-secondary on {bg}", "text-secondary", bg, 4.5))
    pairs += [("accent-text on accent", "accent-text", "accent", 4.5),
              ("accent-text on accent-hover", "accent-text", "accent-hover", 4.5),
              ("accent on surface (UI)", "accent", "bg-surface", 3.0),
              ("border-control on surface (UI)", "border-control", "bg-surface", 3.0),
              ("border-control on inset (UI)", "border-control", "bg-inset", 3.0),
              ("border-strong (dialog edge, decor.)", "border-strong", "bg-surface", 0.0)]
    for bg in surf:
      pairs.append((f"accent-link on {bg}", "accent-link", bg, 4.5))
    for s in ("success", "warning", "error", "info"):
      pairs.append((f"status-{s} dot on surface (UI)", f"status-{s}", "bg-surface", 3.0))
      for bg in surf:
        pairs.append((f"status-{s}-text on {bg}", f"status-{s}-text", bg, 4.5))
    print(f"[{theme}]")
    for name, fg, bg, need in pairs:
      r = ratio(rgb(t[fg]), rgb(t[bg]))
      ok = r >= need
      bad += not ok
      print(f"  {name:34s} {r:5.2f}  need {need}  {'ok' if ok else 'FAIL'}")
    for s in ("success", "warning", "error", "info"):
      pct = 0.15 if theme == "dark" else 0.10
      fill = tuple(rgb(t[f"status-{s}"])[i] * pct + rgb(t["bg-surface"])[i] * (1 - pct) for i in range(3))
      r = ratio(rgb(t[f"status-{s}-text"]), fill)
      bad += r < 4.5
      print(f"  {f'status-{s}-text on subtle':34s} {r:5.2f}  need 4.5  {'ok' if r >= 4.5 else 'FAIL'}")
    hov = over(t["bg-hover"], t["bg-surface"])
    r = ratio(rgb(t["text-primary"]), hov)
    print(f"  {'text-primary on hover':34s} {r:5.2f}  need 4.5  {'ok' if r >= 4.5 else 'FAIL'}")
  return 1 if bad else 0


if __name__ == "__main__":
  sys.exit(main())

"""WCAG contrast ratios for the token pairs in tokens.css (stdlib only).

Run: python docs/design/prototype/tools/contrast.py   (exit 1 when a pair fails)
Text needs 4.5:1, accent as UI 3:1. Borders are decorative (need 0, shown for information).
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
    pairs = [("text-primary on surface", "text-primary", "bg-surface", 4.5),
             ("text-primary on canvas", "text-primary", "bg-canvas", 4.5),
             ("text-primary on selected", "text-primary", "bg-selected", 4.5),
             ("text-secondary on surface", "text-secondary", "bg-surface", 4.5),
             ("text-secondary on canvas", "text-secondary", "bg-canvas", 4.5),
             ("text-secondary on inset", "text-secondary", "bg-inset", 4.5),
             ("accent-text on accent", "accent-text", "accent", 4.5),
             ("accent-text on accent-hover", "accent-text", "accent-hover", 4.5),
             ("accent on surface (text/UI)", "accent", "bg-surface", 3.0),
             ("border-strong on surface (decorative)", "border-strong", "bg-surface", 0)]
    for s in ("success", "warning", "error", "info"):
      pairs.append((f"status-{s} on surface", f"status-{s}", "bg-surface", 4.5))
    print(f"[{theme}]")
    for name, fg, bg, need in pairs:
      r = ratio(rgb(t[fg]), rgb(t[bg]))
      ok = r >= need
      bad += not ok
      print(f"  {name:34s} {r:5.2f}  need {need}  {'ok' if ok else 'FAIL'}")
    hov = over(t["bg-hover"], t["bg-surface"])
    r = ratio(rgb(t["text-primary"]), hov)
    print(f"  {'text-primary on hover':34s} {r:5.2f}  need 4.5  {'ok' if r >= 4.5 else 'FAIL'}")
  return 1 if bad else 0


if __name__ == "__main__":
  sys.exit(main())

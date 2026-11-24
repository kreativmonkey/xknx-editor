# Clickable prototype

Open `index.html` (works from `file://`; add `?fast=1` for short simulation times).
Vanilla HTML/CSS/JS, no build. Tokens in `tokens.css` (the only place for color literals),
state and view registry in `state.js`, demo project in `data.js`, shell in `shell.js`.

Test: `uv run --with playwright==1.64.0 python docs/design/prototype/smoke_test.py --out /tmp/xp-shots`

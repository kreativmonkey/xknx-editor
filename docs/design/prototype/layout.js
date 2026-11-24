/* Responsive layout: form factor, splitters, view menu, saved workspaces, long press, Escape. */
(function () {
  var XP = window.XP;
  var h = XP.h;
  XP.starters = XP.starters || [];

  /* Form factor with +-40 px hysteresis (like form_factor() in the editor's main.py). */
  var ff = null, ORDER = ["narrow", "tablet", "wide"];
  function raw(w) { return w >= 1000 ? "wide" : w >= 600 ? "tablet" : "narrow"; }
  XP.formFactor = function () {
    var w = innerWidth;
    if (ff === null) { ff = raw(w); return ff; }
    var cur = ORDER.indexOf(ff), up = raw(w - 40), down = raw(w + 40);
    if (ORDER.indexOf(up) > cur) ff = up;
    else if (ORDER.indexOf(down) < cur) ff = down;
    return ff;
  };

  /* Saved workspaces: current layout under a name, listed in the switcher. */
  XP.baseWorkspace = function () {
    var s = XP.state;
    if (XP.WORKSPACES[s.workspace]) return s.workspace;
    var c = s.customWorkspaces.filter(function (x) { return x.id === s.workspace; })[0];
    return c && XP.WORKSPACES[c.base] ? c.base : "planning";
  };
  XP.saveWorkspace = function (name) {
    name = String(name || "").trim();
    if (!name) return false;
    var s = XP.state;
    var c = {
      id: "custom-" + (s.customWorkspaces.length + 1) + "-" + Date.now().toString(36),
      name: name, base: XP.baseWorkspace(), view: s.view, railExpanded: s.railExpanded,
      widths: Object.assign({}, s.widths), hidden: Object.assign({}, s.hidden),
    };
    XP.set({ customWorkspaces: s.customWorkspaces.concat([c]), workspace: c.id, dialog: null });
    return true;
  };

  XP.dialogHtml = function () {
    var d = XP.state.dialog;
    if (!d || d.kind !== "saveWorkspace") return "";
    return h`<div class="scrim modal" data-action="closeDialog"></div>
      <div class="dialog" role="dialog" aria-modal="true" aria-label="Als Arbeitsbereich speichern" data-testid="dialog">
        <div class="t-title">Als Arbeitsbereich speichern</div>
        <label class="t-caption" for="ws-name">Name</label>
        <input id="ws-name" class="input" data-testid="ws-name" type="text" maxlength="40" placeholder="z. B. Mein Büro" autocomplete="off">
        <div class="t-caption">Speichert Sichtbarkeit und Breite der Bereiche.</div>
        <div class="actions"><button class="btn" data-action="closeDialog">Abbrechen</button><button class="btn primary" data-testid="ws-save" data-action="confirmSaveWorkspace">Speichern</button></div>
      </div>`;
  };

  XP.actions.viewMenu = function () { XP.set({ viewMenuOpen: !XP.state.viewMenuOpen, wsMenuOpen: false }); };
  XP.actions.toggleList = function () { XP.set({ hidden: Object.assign({}, XP.state.hidden, { list: !XP.state.hidden.list }), viewMenuOpen: false }); };
  XP.actions.toggleInspector = function () {
    if (XP.formFactor() === "wide") XP.set({ hidden: Object.assign({}, XP.state.hidden, { inspector: !XP.state.hidden.inspector }), viewMenuOpen: false });
    else XP.set({ inspectorOpen: !XP.state.inspectorOpen, viewMenuOpen: false });
  };
  XP.actions.openSaveWorkspace = function () {
    XP.set({ dialog: { kind: "saveWorkspace" }, viewMenuOpen: false });
    var i = document.getElementById("ws-name");
    if (i) i.focus();
  };
  XP.actions.closeDialog = function () { XP.set({ dialog: null }); };
  XP.actions.confirmSaveWorkspace = function () {
    var i = document.getElementById("ws-name");
    if (i && !XP.saveWorkspace(i.value)) i.focus();
  };
  XP.actions.drawer = function () { XP.set({ drawerOpen: !XP.state.drawerOpen }); };
  XP.actions.closeDrawer = function () { XP.set({ drawerOpen: false }); };
  XP.actions.back = function () { XP.set({ stackEditor: false }); };

  /* Long press (500 ms, cancelled by a move > 8 px). Default: a synthetic contextmenu on the pressed element. */
  XP.onLongPress = function (el, fn, selector) {
    var timer = null, sx = 0, sy = 0, target = null, swallow = false;
    function cancel() { clearTimeout(timer); timer = null; }
    el.addEventListener("pointerdown", function (e) {
      swallow = false;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      target = selector ? e.target.closest(selector) : el;
      if (!target) return;
      sx = e.clientX; sy = e.clientY;
      var ev = e;
      cancel();
      timer = setTimeout(function () {
        timer = null; swallow = true;
        var t = target.isConnected ? target : el;
        if (fn) fn(ev, t);
        else t.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: ev.clientX, clientY: ev.clientY, button: 2 }));
      }, 500);
    });
    el.addEventListener("pointermove", function (e) {
      if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) cancel();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(function (n) { el.addEventListener(n, cancel); });
    /* The release after a long press must not count as a click. */
    el.addEventListener("click", function (e) {
      if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); }
    }, true);
  };

  /* Pointer-drag splitter for the list column; the DOM is changed directly while dragging so the
     element keeps its pointer capture, the state is written on release. */
  function listMax() { return Math.max(200, Math.min(520, innerWidth - 360)); }
  function clampList(w) { return Math.round(Math.max(180, Math.min(listMax(), w))); }
  function bindSplitter() {
    var app = document.getElementById("app"), drag = null;
    app.addEventListener("pointerdown", function (e) {
      var sp = e.target.closest("[data-split]");
      if (!sp) return;
      var list = document.querySelector("[data-testid=list]");
      if (!list) return;
      drag = { x: e.clientX, w: list.getBoundingClientRect().width, list: list, id: e.pointerId, el: sp };
      try { sp.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      sp.classList.add("drag");
      e.preventDefault();
    });
    app.addEventListener("pointermove", function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      drag.now = clampList(drag.w + e.clientX - drag.x);
      drag.list.style.width = drag.now + "px";
    });
    function end(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var w = drag.now;
      drag = null;
      if (w) XP.set({ widths: Object.assign({}, XP.state.widths, { list: w }) });
      else { var sp = document.querySelector("[data-split]"); if (sp) sp.classList.remove("drag"); }
    }
    app.addEventListener("pointerup", end);
    app.addEventListener("pointercancel", end);
    app.addEventListener("keydown", function (e) {
      if (!e.target.closest("[data-split]")) return;
      var d = e.key === "ArrowLeft" ? -16 : e.key === "ArrowRight" ? 16 : 0;
      if (!d) return;
      e.preventDefault();
      XP.set({ widths: Object.assign({}, XP.state.widths, { list: clampList(XP.state.widths.list + d) }) });
    });
  }

  XP.starters.push(function () {
    window.addEventListener("resize", function () {
      var before = ff;
      if (XP.formFactor() !== before) { if (XP.state.navOpen) XP.state.navOpen = false; XP.render(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape") return;
      var s = XP.state, p = {};
      if (s.wsMenuOpen) p.wsMenuOpen = false;
      if (s.viewMenuOpen) p.viewMenuOpen = false;
      if (s.drawerOpen) p.drawerOpen = false;
      if (s.navOpen) p.navOpen = false;
      if (s.dialog && s.dialog.kind === "saveWorkspace") p.dialog = null;
      if (Object.keys(p).length) XP.set(p);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target && e.target.id === "ws-name") { e.preventDefault(); XP.actions.confirmSaveWorkspace(); }
    });
    bindSplitter();
    XP.onLongPress(document.getElementById("app"), null, "[data-row],[data-tab],[data-ctx]");
  });
})();

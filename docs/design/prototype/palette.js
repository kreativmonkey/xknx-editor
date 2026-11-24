/* Command palette (Ctrl+K / Cmd+K, click on the search field): devices, group addresses,
   settings and commands. A dialog-like overlay: Escape closes, arrows move, Enter runs. */
(function () {
  var XP = window.XP;
  var h = XP.h, S = XP.state;
  XP.starters = XP.starters || [];
  var MAX = 8, query = "", index = 0, items = [];

  function norm(s) { return String(s).toLowerCase(); }
  function hit(hay, q) {
    var t = norm(q).split(/\s+/).filter(Boolean), s = norm(hay);
    return t.every(function (x) { return s.indexOf(x) >= 0; });
  }
  /* The device the commands act on: the active tab, else the last selected one. */
  function contextDevice() {
    var tab = S.tabs.filter(function (t) { return t.id === S.activeTab; })[0], ref = null;
    if (tab && (tab.kind === "device" || tab.kind === "commissioningDevice")) ref = tab.ref;
    else ref = S.selection.commissioningDevice || S.selection.device || null;
    return ref && XP.com && XP.com.dev(ref) ? XP.com.dev(ref) : null;
  }
  function openDevice(d) {
    var com = S.workspace === "commissioning";
    var cur = XP.VIEWS[S.view], patch = {};
    if (S.workspace === "handover") { patch.workspace = "planning"; patch.view = "devices"; }
    else if (!cur || !cur.list) patch.view = com ? "commissioningDevices" : "devices";
    if (Object.keys(patch).length) XP.set(patch);
    XP.openObject(com ? "commissioningDevice" : "device", d.address, { pin: false });
  }
  function build(q) {
    var d = XP.data, out = [], devs, gas, sets, cmds;
    if (q.trim()) {
      devs = d.devices.filter(function (x) { return hit(x.address + " " + x.name + " " + x.room + " " + x.product + " " + x.manufacturer, q); })
        .sort(function (a, b) { return (a.address.indexOf(q.trim()) === 0 ? 0 : 1) - (b.address.indexOf(q.trim()) === 0 ? 0 : 1); });
      gas = d.groupAddresses.filter(function (g) { return hit(g.address + " " + g.name, q); });
      sets = (XP.settingsRows || []).filter(function (r) { return hit(r.label + " " + r.groupLabel, q); });
    } else { devs = []; gas = []; sets = []; }
    out.push({ id: "dev", label: "Geräte", rows: devs.slice(0, MAX).map(function (x) {
      return { key: "d" + x.address, title: x.name, addr: x.address, sub: x.room, run: function () { openDevice(x); } };
    }) });
    out.push({ id: "ga", label: "Gruppenadressen", rows: gas.slice(0, MAX).map(function (g) {
      return { key: "g" + g.address, title: g.name, addr: g.address, sub: g.dpt, run: function () {
        XP.set({ workspace: "planning", view: "groupAddresses", activeTab: null });
        XP.openObject("groupAddress", g.address, { pin: false });
      } };
    }) });
    out.push({ id: "set", label: "Einstellungen", rows: sets.slice(0, MAX).map(function (r) {
      return { key: "s" + r.id, title: r.label, sub: r.groupLabel, run: function () { XP.openSetting(r.id); } };
    }) });
    cmds = commands().filter(function (c) { return !q.trim() || hit(c.title + " " + (c.sub || ""), q); });
    out.push({ id: "cmd", label: "Befehle", rows: cmds.slice(0, MAX) });
    return out.filter(function (g) { return g.rows.length; });
  }
  function commands() {
    var x = contextDevice(), list = [], sub = x ? x.address + " " + x.name : "";
    if (x) {
      list.push({ key: "c-prog", title: "Programmieren…", sub: sub, run: function () { XP.com.openProgram(x.address); } });
      list.push({ key: "c-addr", title: "Adresse ändern…", sub: sub, run: function () { XP.openDialog("changeAddress", { ref: x.address }); } });
      list.push({ key: "c-repl", title: "Gerät tauschen…", sub: sub, run: function () { XP.openDialog("replace", { ref: x.address }); } });
    }
    var all = Object.keys(XP.WORKSPACES).map(function (k) { return { id: k, label: XP.WORKSPACES[k].label }; })
      .concat(S.customWorkspaces.map(function (c) { return { id: c.id, label: c.name }; }));
    all.forEach(function (w) {
      list.push({ key: "w-" + w.id, title: "Arbeitsbereich: " + w.label, run: function () { XP.actions.workspace({ dataset: { ws: w.id } }); } });
    });
    list.push({ key: "c-theme", title: "Hell/Dunkel umschalten", run: function () { XP.actions.theme(); } });
    list.push({ key: "c-set", title: "Einstellungen öffnen", run: function () { XP.actions.view({ dataset: { view: "settings" } }); } });
    list.push({ key: "c-queue", title: "Warteschlange öffnen", run: function () { XP.set({ workspace: "commissioning", view: "queue", activeTab: null, stackEditor: true }); } });
    return list;
  }

  function resultsHtml() {
    var groups = build(query), n = 0;
    items = [];
    if (!groups.length) return h`<div class="pal-empty t-caption" data-testid="palette-empty">${query.trim() ? "Nichts gefunden." : "Tippe, um zu suchen."}</div>`;
    var html = groups.map(function (g) {
      return h`<div class="pal-g" data-group="${g.id}"><div class="pal-grp t-label">${g.label}</div>${g.rows.map(function (r) {
        var i = n++, on = i === index;
        items.push(r);
        return h`<div class="pal-item ${on ? "sel" : ""}" role="option" id="pal-${i}" aria-selected="${String(on)}" data-pal="${i}">${r.addr ? h`<span class="addr mono">${r.addr}</span>` : ""}<span class="nm trunc" title="${r.title}">${r.title}</span>${r.sub ? h`<span class="t-caption trunc sub">${r.sub}</span>` : ""}</div>`;
      })}</div>`;
    });
    return h`${html}`;
  }
  function clamp() { if (index >= items.length) index = Math.max(0, items.length - 1); }
  function paint() {
    var box = document.querySelector("[data-testid=palette-results]");
    if (!box) return;
    var res = resultsHtml(); clamp();
    box.innerHTML = String(res);
    var inp = document.querySelector("[data-testid=palette-input]");
    if (inp) inp.setAttribute("aria-activedescendant", items.length ? "pal-" + index : "");
    var sel = box.querySelector(".pal-item.sel");
    if (sel) sel.scrollIntoView({ block: "nearest" });
  }
  function html() {
    var res = resultsHtml(); clamp();
    return h`<div class="scrim modal palette-scrim" data-testid="palette-scrim" data-action="closePalette"></div>
      <div class="palette" role="dialog" aria-modal="true" aria-label="Suche und Befehle" data-testid="palette">
        <input class="pal-input" type="text" role="combobox" aria-expanded="true" aria-controls="pal-results" aria-activedescendant="${items.length ? "pal-" + index : ""}" data-testid="palette-input" data-fk="palette-input" placeholder="Gerät, Adresse, Einstellung, Befehl…" aria-label="Suche" autocomplete="off" value="${query}">
        <div class="pal-results" id="pal-results" role="listbox" data-testid="palette-results" data-scroll="pal">${res}</div>
        <div class="pal-foot t-caption">↑↓ wählen · Enter öffnen · Esc schließen</div>
      </div>`;
  }

  XP.palette = {
    open: function (q) {
      if (S.dialog) return;
      query = q || ""; index = 0;
      XP.set({ paletteOpen: true, wsMenuOpen: false, viewMenuOpen: false });
    },
    close: function () {
      if (!S.paletteOpen) return;
      XP.set({ paletteOpen: false });
      var t = document.querySelector('[data-fk="search"]');
      if (t) t.focus({ preventScroll: true });
    },
    run: function (i) {
      var it = items[i];
      if (!it) return;
      S.paletteOpen = false;   /* closed first, so a dialog opened by the command keeps the focus */
      XP.set({ paletteOpen: false });
      it.run();
    },
    results: function (q) { return build(q); },
  };
  XP.actions.palette = function () { XP.palette.open(""); };
  XP.actions.closePalette = function () { XP.palette.close(); };

  var prevHtml = XP.dialogHtml;
  XP.dialogHtml = function () { return S.paletteOpen ? html() : prevHtml ? prevHtml() : ""; };

  XP.starters.push(function () {
    var baseRender = XP.render;
    XP.render = function () {
      var inp0 = document.querySelector("[data-testid=palette-input]"), had = inp0 && document.activeElement === inp0;
      var ss = had ? [inp0.selectionStart, inp0.selectionEnd] : null;
      baseRender();
      var inp = document.querySelector("[data-testid=palette-input]");
      if (!inp) return;
      if (!inp0 || (had && document.activeElement !== inp)) {
        inp.focus({ preventScroll: true });
        var n = ss ? ss : [inp.value.length, inp.value.length];
        try { inp.setSelectionRange(n[0], n[1]); } catch (e) { /* ignore */ }
      }
    };
    document.addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (S.paletteOpen) XP.palette.close(); else XP.palette.open("");
        return;
      }
      if (!S.paletteOpen) return;
      if (e.key === "Escape") { e.preventDefault(); e.stopImmediatePropagation(); XP.palette.close(); }
      else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (!items.length) return;
        index = (index + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length;
        paint();
      } else if (e.key === "Enter") { e.preventDefault(); XP.palette.run(index); }
      else if (e.key === "Tab") e.preventDefault();   /* focus stays in the field */
    });
    document.addEventListener("input", function (e) {
      if (!e.target.matches || !e.target.matches("[data-testid=palette-input]")) return;
      query = e.target.value; index = 0; paint();
    });
    document.getElementById("app").addEventListener("click", function (e) {
      var it = e.target.closest("[data-pal]");
      if (it) XP.palette.run(+it.dataset.pal);
    });
  });
})();

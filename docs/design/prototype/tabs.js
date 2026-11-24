/* Preview tab, pinned tabs, minimal device list and editor (Task 3 replaces the VIEWS entries below). */
(function () {
  var XP = window.XP;
  var h = XP.h;
  XP.starters = XP.starters || [];

  function tabById(id) { return XP.state.tabs.filter(function (t) { return t.id === id; })[0]; }

  XP.tabLabel = function (tab) {
    var v = XP.VIEWS[tab.kind];
    return v && v.tabLabel ? v.tabLabel(tab.ref) : tab.ref;
  };

  XP.openObject = function (kind, ref, opt) {
    var s = XP.state, pin = !!(opt && opt.pin), id = kind + ":" + ref;
    var tabs = s.tabs.slice();
    var ex = tabById(id);
    if (ex) {
      if (pin && !ex.pinned) tabs = tabs.map(function (t) { return t.id === id ? Object.assign({}, t, { pinned: true }) : t; });
    } else {
      var tab = { id: id, kind: kind, ref: ref, pinned: pin };
      var pi = -1;
      tabs.forEach(function (t, i) { if (!t.pinned && pi < 0) pi = i; });
      if (!pin && pi >= 0) tabs[pi] = tab; else tabs.push(tab);
    }
    var sel = Object.assign({}, s.selection);
    sel[kind] = ref;
    XP.set({ tabs: tabs, activeTab: id, selection: sel, stackEditor: true, drawerOpen: false });
  };

  XP.activateTab = function (id) {
    var t = tabById(id);
    if (!t) return;
    var sel = Object.assign({}, XP.state.selection);
    sel[t.kind] = t.ref;
    XP.set({ activeTab: id, selection: sel, stackEditor: true });
  };

  XP.closeTab = function (id) {
    var s = XP.state, idx = -1;
    s.tabs.forEach(function (t, i) { if (t.id === id) idx = i; });
    if (idx < 0) return;
    var tabs = s.tabs.filter(function (t) { return t.id !== id; });
    var patch = { tabs: tabs };
    if (s.activeTab === id) {
      var next = tabs[idx] || tabs[idx - 1] || null;
      patch.activeTab = next ? next.id : null;
      if (!next) patch.stackEditor = false;
    }
    XP.set(patch);
  };

  XP.pinTab = function (id) {
    XP.set({ tabs: XP.state.tabs.map(function (t) { return t.id === id ? Object.assign({}, t, { pinned: true }) : t; }) });
  };

  XP.actions.closeTab = function (el) { XP.closeTab(el.dataset.id); };

  /* ---- Minimal views for kind "device"; Task 3 overwrites these two entries. ---- */
  function dev(addr) { return XP.data.devices.filter(function (d) { return d.address === addr; })[0]; }
  function statusDot(st) { return st === "ok" ? "ok" : st === "error" ? "err" : st === "new" ? "" : "warn"; }

  XP.VIEWS.devices.list = function (s) {
    var d = XP.data, sel = s.selection.device;
    var first = d.devices[0] && d.devices[0].address;
    return h`<div role="listbox" aria-label="Geräte">${d.project.lines.map(function (ln) {
      return h`<div class="grp t-label">${ln.name} · ${ln.id}</div>${d.devices.filter(function (x) { return x.line === ln.id; }).map(function (x) {
        var on = sel === x.address, tab = (sel ? on : x.address === first) ? 0 : -1;
        return h`<div class="row ${on ? "sel" : ""}" role="option" aria-selected="${on}" tabindex="${tab}" data-row="${x.address}" data-kind="device" data-fk="row:${x.address}" title="${x.address} ${x.name}"><span class="dot ${statusDot(x.status)}"></span><span class="addr mono">${x.address}</span><span class="nm trunc">${x.name}</span></div>`;
      })}`;
    })}</div>`;
  };

  XP.VIEWS.device = {
    label: "Gerät", icon: "▣",
    tabLabel: function (ref) { var x = dev(ref); return x ? ref + " " + x.name : ref; },
    editor: function (tab) {
      var x = dev(tab.ref);
      if (!x) return h`<div class="empty">Gerät nicht gefunden.</div>`;
      return h`<div class="device-head"><div class="t-heading wrap">${x.name}</div><div class="t-caption wrap">${x.address} · ${x.manufacturer} ${x.product} · ${x.room}</div></div>`;
    },
  };

  /* ---- Interaction: click opens a preview, double-click/Enter pins, arrows move. ---- */
  function rowsOf() { return Array.prototype.slice.call(document.querySelectorAll(".list [data-row]")); }

  XP.starters.push(function () {
    var app = document.getElementById("app");
    app.addEventListener("click", function (e) {
      var row = e.target.closest("[data-row]");
      if (row) { XP.openObject(row.dataset.kind, row.dataset.row, { pin: false }); return; }
      var tab = e.target.closest("[data-tab]");
      if (tab && !e.target.closest("[data-action]")) XP.activateTab(tab.dataset.tab);
    });
    app.addEventListener("dblclick", function (e) {
      var row = e.target.closest("[data-row]");
      if (row) { XP.openObject(row.dataset.kind, row.dataset.row, { pin: true }); return; }
      var tab = e.target.closest("[data-tab]");
      if (tab && !e.target.closest("[data-action]")) XP.pinTab(tab.dataset.tab);
    });
    app.addEventListener("keydown", function (e) {
      var tab = e.target.closest("[data-tab]");
      if (tab && !e.target.closest("[data-action]") && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault(); XP.activateTab(tab.dataset.tab); return;
      }
      var row = e.target.closest("[data-row]");
      if (!row) return;
      if (e.key === "Enter") { e.preventDefault(); XP.openObject(row.dataset.kind, row.dataset.row, { pin: true }); return; }
      var rows = rowsOf(), i = rows.indexOf(row), n = -1;
      if (e.key === "ArrowDown") n = Math.min(rows.length - 1, i + 1);
      else if (e.key === "ArrowUp") n = Math.max(0, i - 1);
      else if (e.key === "Home") n = 0;
      else if (e.key === "End") n = rows.length - 1;
      if (n < 0) return;
      e.preventDefault();
      var target = rows[n];
      if (XP.formFactor() === "wide") XP.openObject(target.dataset.kind, target.dataset.row, { pin: false });
      else {
        var sel = Object.assign({}, XP.state.selection);
        sel[target.dataset.kind] = target.dataset.row;
        XP.set({ selection: sel });
      }
      var again = document.querySelector('[data-fk="row:' + target.dataset.row + '"]');
      if (again) { again.focus(); again.scrollIntoView({ block: "nearest" }); }
    });
  });
})();

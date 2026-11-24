/* Preview tab, pinned tabs, list interaction (views live in views-planning.js). */
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
    XP.set({ tabs: tabs, activeTab: id, selection: sel, stackEditor: true, drawerOpen: false, inspectorOpen: false });
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

  /* ---- Interaction: click opens a preview, double-click/Enter pins, arrows move. ---- */
  function rowsOf() { return Array.prototype.slice.call(document.querySelectorAll(".list [data-row]")); }

  XP.starters.push(function () {
    var app = document.getElementById("app");
    app.addEventListener("click", function (e) {
      if (e.target.closest(".inl-input")) return;
      var row = e.target.closest("[data-row]");
      if (row && row.closest(".list")) { if (!e.target.closest("[data-action]")) XP.openObject(row.dataset.kind, row.dataset.row, { pin: false }); return; }
      var tab = e.target.closest("[data-tab]");
      if (tab && !e.target.closest("[data-action]")) XP.activateTab(tab.dataset.tab);
    });
    app.addEventListener("dblclick", function (e) {
      if (e.target.closest(".inl-input")) return;
      var row = e.target.closest("[data-row]");
      if (row && row.closest(".list")) {
        if (e.target.closest("[data-action]")) return;
        XP.openObject(row.dataset.kind, row.dataset.row, { pin: true });
        /* double-click on the name: rename in place (name only, after this explicit gesture) */
        if (e.target.closest(".nm") && XP.renameInline && ["device", "groupAddress", "gaGroup"].indexOf(row.dataset.kind) >= 0) XP.renameInline(row.dataset.kind, row.dataset.row, "row");
        return;
      }
      var tab = e.target.closest("[data-tab]");
      if (tab && !e.target.closest("[data-action]")) XP.pinTab(tab.dataset.tab);
    });
    app.addEventListener("keydown", function (e) {
      if (e.target.closest(".inl-input")) return;
      var tab = e.target.closest("[data-tab]");
      if (tab && !e.target.closest("[data-action]") && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault(); XP.activateTab(tab.dataset.tab); return;
      }
      var row = e.target.closest("[data-row]");
      if (!row || !row.closest(".list")) return;
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

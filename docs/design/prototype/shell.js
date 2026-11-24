/* Shell: top bar, rail, list column, tab strip, editor. */
(function () {
  var XP = window.XP;
  var h = XP.h;
  var cache = {};

  function ws() { return XP.WORKSPACES[XP.state.workspace] || { label: XP.state.workspace, icon: "✎", rail: [], defaultView: XP.state.view }; }

  function count(view) {
    var d = XP.data;
    if (view === "devices") return d.devices.length;
    if (view === "groupAddresses") return d.groupAddresses.length;
    return null;
  }
  function badge(view) {
    if (view === "health") return "5";
    if (view === "commissioningDevices") return String(XP.data.devices.filter(function (x) { return x.status !== "ok"; }).length) + " offen";
    return null;
  }

  function topbar() {
    var s = XP.state, w = ws();
    var custom = s.customWorkspaces.map(function (c) { return { id: c.id, label: c.name, icon: "✎" }; });
    var all = Object.keys(XP.WORKSPACES).map(function (k) { return { id: k, label: XP.WORKSPACES[k].label, icon: XP.WORKSPACES[k].icon }; }).concat(custom);
    return h`<div class="topbar" data-testid="topbar">
      <span class="product">XKNX</span><span class="project t-caption trunc">${XP.data.project.name}</span>
      <div class="ws-wrap">
        <button class="btn ws" data-testid="ws-switcher" data-action="wsMenu" aria-haspopup="menu" aria-expanded="${s.wsMenuOpen}">${w.icon} ${w.label} ▾</button>
        ${s.wsMenuOpen ? h`<div class="menu" role="menu" data-testid="ws-menu">${all.map(function (a) {
          return h`<button class="btn ${a.id === s.workspace ? "sel" : ""}" role="menuitem" data-action="workspace" data-ws="${a.id}">${a.icon} ${a.label}</button>`;
        })}</div>` : ""}
      </div>
      <span class="spacer"></span>
      <button class="search" data-testid="search" data-action="palette" title="Suche (Strg+K)"><span class="mono">⌘K</span><span class="trunc hint">Gerät, Adresse, Einstellung, Befehl…</span></button>
      <span class="pill" data-testid="status-pill"><span class="dot ${s.connected ? "ok" : ""}"></span><span class="lbl">${s.connected ? "IP-Router 1.0.0" : "Offline"}</span></span>
      <button class="btn" data-testid="theme-toggle" data-action="theme" title="Hell/Dunkel wechseln">${s.theme === "dark" ? "☾" : "☀"}</button>
      <button class="btn ${s.view === "settings" ? "on" : ""}" data-testid="settings" data-action="view" data-view="settings" title="Einstellungen">⚙</button>
    </div>`;
  }

  function rail() {
    var s = XP.state, w = ws();
    var exp = s.railExpanded;
    var groups = w.rail.map(function (g) {
      return h`${exp ? h`<div class="grp t-label">${g.group}</div>` : ""}${g.items.map(function (id) {
        var v = XP.VIEWS[id] || { label: id, icon: "?" };
        var c = count(id), b = badge(id);
        return h`<button class="item ${s.view === id ? "sel" : ""}" data-action="view" data-view="${id}" data-label="${v.label}" title="${v.label}"><span class="ico">${v.icon}</span><span class="lbl trunc">${v.label}</span>${b ? h`<span class="badge warn">${b}</span>` : c !== null ? h`<span class="count">${c}</span>` : ""}</button>`;
      })}`;
    });
    return h`<nav class="rail ${exp ? "expanded" : "collapsed"}" data-testid="rail" aria-label="Ansichten">${groups}<button class="item toggle" data-testid="rail-toggle" data-action="railToggle" title="${exp ? "Einklappen" : "Ausklappen"}"><span class="ico">${exp ? "«" : "»"}</span><span class="lbl">${exp ? "Einklappen" : ""}</span></button></nav>`;
  }

  function list() {
    var s = XP.state, v = XP.VIEWS[s.view];
    if (s.hidden.list) return "";
    var inner = v && v.list ? v.list(s) : h`<div class="placeholder t-caption">${v ? v.label : s.view}: Liste folgt.</div>`;
    return h`<aside class="list" data-testid="list" style="width:${s.widths.list}px">${inner}</aside>`;
  }

  function tabs() {
    var s = XP.state;
    return h`<div class="tabs" data-testid="tabs" role="tablist">${s.tabs.map(function (t) {
      return h`<button class="tab ${t.id === s.activeTab ? "on" : ""}" role="tab" data-tab="${t.id}">${t.ref}</button>`;
    })}</div>`;
  }

  function editor() {
    var s = XP.state;
    var tab = s.tabs.filter(function (t) { return t.id === s.activeTab; })[0];
    var inner;
    if (tab && XP.VIEWS[tab.kind] && XP.VIEWS[tab.kind].editor) inner = XP.VIEWS[tab.kind].editor(tab);
    else {
      var v = XP.VIEWS[s.view];
      inner = h`<div class="empty"><div class="t-title">${v ? v.label : s.view}</div><div>Wähle links einen Eintrag, um ihn hier zu öffnen.</div></div>`;
    }
    return h`<section class="editor" data-testid="editor">${inner}</section>`;
  }

  /* Replace a region's HTML only when it changed, so focus and scroll survive renders. */
  function region(id, html) {
    var el = document.getElementById(id), str = String(html);
    if (cache[id] !== str) { el.innerHTML = str; cache[id] = str; }
  }

  XP.render = function () {
    var s = XP.state, root = document.documentElement;
    root.dataset.theme = s.theme;
    var touch = false;
    try { touch = matchMedia("(pointer:coarse)").matches; } catch (e) { /* ignore */ }
    if (touch) root.setAttribute("data-touch", ""); else root.removeAttribute("data-touch");
    if (!document.getElementById("r-top")) {
      document.getElementById("app").innerHTML =
        '<div id="r-top"></div><div class="body"><div id="r-rail" style="display:contents"></div><div id="r-list" style="display:contents"></div><div class="main"><div id="r-tabs" style="display:contents"></div><div id="r-editor" style="display:contents"></div></div></div>';
    }
    region("r-top", topbar());
    region("r-rail", rail());
    region("r-list", list());
    region("r-tabs", tabs());
    region("r-editor", editor());
  };

  /* Long-press (500 ms) on a rail item shows its label; used for the icon rail on touch. */
  var tipTimer = null, tipEl = null;
  function hideTip() { clearTimeout(tipTimer); if (tipEl) { tipEl.remove(); tipEl = null; } }
  function bindLongPress() {
    var app = document.getElementById("app");
    app.addEventListener("pointerdown", function (e) {
      hideTip();
      var item = e.target.closest(".rail .item[data-label]");
      if (!item || XP.state.railExpanded && innerWidth >= 1000) return;
      tipTimer = setTimeout(function () {
        var r = item.getBoundingClientRect();
        tipEl = document.createElement("div");
        tipEl.className = "tip"; tipEl.dataset.testid = "rail-tip";
        tipEl.textContent = item.dataset.label;
        tipEl.style.left = r.right + 6 + "px"; tipEl.style.top = r.top + "px";
        document.body.appendChild(tipEl);
        setTimeout(hideTip, 1500);
      }, 500);
    });
    ["pointerup", "pointercancel", "pointermove"].forEach(function (n) { app.addEventListener(n, function () { clearTimeout(tipTimer); }); });
  }

  XP.actions.theme = function () { XP.set({ theme: XP.state.theme === "dark" ? "light" : "dark" }); };
  XP.actions.railToggle = function () { XP.set({ railExpanded: !XP.state.railExpanded }); };
  XP.actions.wsMenu = function () { XP.set({ wsMenuOpen: !XP.state.wsMenuOpen }); };
  XP.actions.palette = function () { XP.set({ paletteOpen: true }); };
  XP.actions.view = function (el) { XP.set({ view: el.dataset.view }); };
  XP.actions.workspace = function (el) {
    var id = el.dataset.ws, w = XP.WORKSPACES[id];
    var c = XP.state.customWorkspaces.filter(function (x) { return x.id === id; })[0];
    XP.set({ workspace: id, view: w ? w.defaultView : c ? c.view : XP.state.view, wsMenuOpen: false });
  };

  XP.start = function () {
    XP.load();
    document.getElementById("app").addEventListener("click", function (e) {
      var tab = e.target.closest("[data-tab]");
      if (tab && !e.target.closest("[data-action]")) { XP.set({ activeTab: tab.dataset.tab }); return; }
      var el = e.target.closest("[data-action]");
      if (el && XP.actions[el.dataset.action]) XP.actions[el.dataset.action](el, e);
    });
    document.addEventListener("click", function (e) {
      if (XP.state.wsMenuOpen && !e.target.closest(".ws-wrap")) XP.set({ wsMenuOpen: false });
    });
    bindLongPress();
    XP.render();
  };
})();

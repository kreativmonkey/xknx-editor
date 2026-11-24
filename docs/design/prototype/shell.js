/* Shell: top bar, rail, list column, tab strip, editor. */
(function () {
  var XP = window.XP;
  var h = XP.h;
  var cache = {}, lastTabKey = "";

  function customWs(id) { return XP.state.customWorkspaces.filter(function (x) { return x.id === id; })[0]; }
  function ws() {
    var w = XP.WORKSPACES[XP.state.workspace];
    if (w) return w;
    var c = customWs(XP.state.workspace), base = XP.WORKSPACES[c && c.base] || XP.WORKSPACES.planning;
    return { label: c ? c.name : XP.state.workspace, icon: "✎", rail: base.rail, defaultView: c ? c.view : XP.state.view };
  }

  function count(view) {
    var d = XP.data;
    if (view === "devices") return d.devices.length;
    if (view === "groupAddresses") return d.groupAddresses.length;
    return null;
  }
  /* [text, kind]: status counts use the warning colours, a plain count (queue length) stays neutral */
  function badge(view) {
    if (view === "health") return ["5", "warn"];
    if (view === "commissioningDevices") return [String(XP.data.devices.filter(function (x) { return x.status !== "ok"; }).length) + " offen", "warn"];
    if (view === "queue" && XP.queue) { var n = XP.state.queueItems.filter(function (i) { return i.status !== "fertig"; }).length; return n ? [String(n), "neutral"] : null; }
    return null;
  }

  function topbar() {
    var s = XP.state, w = ws();
    var custom = s.customWorkspaces.map(function (c) { return { id: c.id, label: c.name, icon: "✎" }; });
    var all = Object.keys(XP.WORKSPACES).map(function (k) { return { id: k, label: XP.WORKSPACES[k].label, icon: XP.WORKSPACES[k].icon }; }).concat(custom);
    return h`<div class="topbar" data-testid="topbar">
      <button class="btn nav-btn" data-testid="nav-button" data-action="navDrawer" aria-expanded="${s.navOpen}" aria-label="Navigation" title="Navigation">☰</button><span class="product">XKNX</span><span class="project t-caption trunc">${XP.data.project.name}</span>
      <div class="ws-wrap">
        <button class="btn ws" data-testid="ws-switcher" data-action="wsMenu" aria-haspopup="menu" aria-expanded="${s.wsMenuOpen}" title="${w.label}"><span class="ico">${w.icon}</span><span class="wl trunc">${w.label}</span><span>▾</span></button>
        ${s.wsMenuOpen ? h`<div class="menu" role="menu" data-testid="ws-menu">${all.map(function (a) {
          return h`<button class="btn ${a.id === s.workspace ? "sel" : ""}" role="menuitem" data-action="workspace" data-ws="${a.id}">${a.icon} ${a.label}</button>`;
        })}</div>` : ""}
      </div>
      <div class="ws-wrap view-wrap">
        <button class="btn" data-testid="view-menu-btn" data-fk="view-menu-btn" data-action="viewMenu" aria-haspopup="menu" aria-expanded="${s.viewMenuOpen}" title="Ansicht"><span>◫</span><span class="wl">Ansicht ▾</span></button>
        ${s.viewMenuOpen ? viewMenu() : ""}
      </div>
      <span class="spacer"></span>
      <button class="search" data-testid="search" data-fk="search" data-action="palette" title="Suche (Strg+K)"><span class="mono">⌘K</span><span class="trunc hint">Gerät, Adresse, Einstellung, Befehl…</span></button>
      <span class="pill" data-testid="status-pill"><span class="dot ${s.connected ? "ok" : ""}"></span><span class="lbl trunc">${s.connected ? "IP-Router 1.0.0" : "Offline"}</span><span class="lbl-short" data-testid="status-word">${s.connected ? "Verbunden" : "Offline"}</span></span>
      <button class="btn" data-testid="theme-toggle" data-action="theme" title="Hell/Dunkel wechseln">${s.theme === "dark" ? "☾" : "☀"}</button>
      <button class="btn ${s.view === "settings" ? "on" : ""}" data-testid="settings" data-action="view" data-view="settings" title="Einstellungen">⚙</button>
    </div>`;
  }

  function viewMenu() {
    var s = XP.state, wide = XP.formFactor() === "wide";
    var insp = wide ? (XP.inspectorDocked ? XP.inspectorDocked() : true) : s.inspectorOpen;
    return h`<div class="menu" role="menu" data-testid="view-menu">
      <button class="btn" role="menuitemcheckbox" aria-checked="${!s.hidden.list}" data-testid="toggle-list" data-action="toggleList" ${wide ? "" : "disabled"}><span class="ico">${s.hidden.list ? "" : "✓"}</span>Liste</button>
      <button class="btn" role="menuitemcheckbox" aria-checked="${insp}" data-testid="toggle-inspector" data-action="toggleInspector"><span class="ico">${insp ? "✓" : ""}</span>Inspektor</button>
      ${wide ? "" : h`<div class="t-caption menu-note">Die Liste erscheint hier als Schublade, der Inspektor als Blatt.</div>`}
      <div class="sep"></div>
      <button class="btn" role="menuitem" data-testid="save-workspace" data-action="openSaveWorkspace">Als Arbeitsbereich speichern…</button>
    </div>`;
  }

  function rail() {
    var s = XP.state, w = ws();
    var narrow = XP.formFactor() === "narrow";
    if (narrow && !s.navOpen) return "";
    var exp = narrow || s.railExpanded;
    var groups = w.rail.map(function (g) {
      return h`${exp ? h`<div class="grp t-label">${g.group}</div>` : ""}${g.items.map(function (id) {
        var v = XP.VIEWS[id] || { label: id, icon: "?" };
        var c = count(id), b = badge(id);
        return h`<button class="item ${s.view === id ? "sel" : ""}" data-action="view" data-view="${id}" data-label="${v.label}" title="${v.label}"><span class="ico">${v.icon}</span><span class="lbl trunc">${v.label}</span>${b ? h`<span class="badge ${b[1]}" data-testid="rail-badge">${b[0]}</span>` : c !== null ? h`<span class="count">${c}</span>` : ""}</button>`;
      })}`;
    });
    if (narrow) return h`<div class="scrim nav-scrim" data-action="closeNav"></div><nav class="rail expanded navdrawer" data-testid="nav-drawer" aria-label="Ansichten">${groups}</nav>`;
    return h`<nav class="rail ${exp ? "expanded" : "collapsed"}" data-testid="rail" aria-label="Ansichten">${groups}<button class="item toggle" data-testid="rail-toggle" data-action="railToggle" title="${exp ? "Einklappen" : "Ausklappen"}"><span class="ico">${exp ? "«" : "»"}</span><span class="lbl">${exp ? "Einklappen" : ""}</span></button></nav>`;
  }

  function list() {
    var s = XP.state, v = XP.VIEWS[s.view], f = XP.formFactor();
    if (v && v.noList) return "";
    var inner = v && v.list ? v.list(s) : h`<div class="placeholder t-caption">${v ? v.label : s.view}: Liste folgt.</div>`;
    if (f === "wide") {
      if (s.hidden.list) return "";
      return h`<aside class="list" data-testid="list" data-scroll="list" style="width:${s.widths.list}px">${inner}</aside><div class="split" data-split="list" data-fk="split" data-testid="splitter-list" role="separator" aria-orientation="vertical" aria-label="Breite der Liste" tabindex="0"></div>`;
    }
    if (f === "tablet") {
      if (!s.drawerOpen) return "";
      return h`<div class="scrim drawer-scrim" data-action="closeDrawer"></div><aside class="list drawer" data-testid="drawer" data-scroll="list" style="width:${s.widths.list}px">${inner}</aside>`;
    }
    if (s.stackEditor) return "";
    return h`<aside class="list" data-testid="list" data-scroll="list">${inner}</aside>`;
  }

  function tabs() {
    var s = XP.state, f = XP.formFactor(), cv = XP.VIEWS[s.view], hasList = !(cv && cv.noList);
    var lead = !hasList ? "" : f === "narrow" && s.stackEditor
      ? h`<button class="btn lead" data-testid="back" data-action="back" title="Zurück zur Liste">‹ Zurück</button>`
      : f === "tablet" ? h`<button class="btn lead" data-testid="list-button" data-action="drawer" aria-expanded="${s.drawerOpen}">Liste</button>` : "";
    return h`<div class="tabbar">${lead}<div class="tabs" data-testid="tabs" role="tablist" data-scroll="tabs">${s.tabs.map(function (t) {
      var on = t.id === s.activeTab, label = XP.tabLabel(t);
      return h`<div class="tab ${on ? "on" : ""} ${t.pinned ? "" : "preview"}" role="tab" aria-selected="${on}" tabindex="0" data-tab="${t.id}" title="${label}"><span class="tl trunc">${label}</span>${t.pinned ? "" : h`<button class="x pin" data-testid="pin-tab" data-action="pinTab" data-id="${t.id}" aria-label="Anheften: ${label}" title="Anheften">⊙</button>`}<button class="x" data-action="closeTab" data-id="${t.id}" aria-label="Tab schließen: ${label}" title="Schließen">✕</button></div>`;
    })}</div></div>`;
  }

  function editor() {
    var s = XP.state;
    var tab = s.tabs.filter(function (t) { return t.id === s.activeTab; })[0];
    var inner;
    if (tab && XP.VIEWS[tab.kind] && XP.VIEWS[tab.kind].editor) inner = XP.VIEWS[tab.kind].editor(tab);
    else {
      var v = XP.VIEWS[s.view];
      if (v && v.page) inner = v.page();
      else inner = h`<div class="empty" data-testid="editor-empty"><div class="t-title">${v ? v.label : s.view}</div><div>Wähle links einen Eintrag, um ihn hier zu öffnen.</div></div>`;
    }
    return h`<section class="editor" data-testid="editor">${inner}</section>`;
  }

  /* Replace a region's HTML only when it changed; scroll positions (data-scroll) and the
     focused element (data-fk) survive the replacement. */
  function region(id, html) {
    var el = document.getElementById(id), str = String(html);
    if (cache[id] === str) return;
    var a = document.activeElement, fk = a && el.contains(a) && a.dataset ? a.dataset.fk : null;
    var sc = {};
    el.querySelectorAll("[data-scroll]").forEach(function (n) { sc[n.dataset.scroll] = [n.scrollTop, n.scrollLeft]; });
    el.innerHTML = str; cache[id] = str;
    el.querySelectorAll("[data-scroll]").forEach(function (n) {
      var p = sc[n.dataset.scroll];
      if (p) { n.scrollTop = p[0]; n.scrollLeft = p[1]; }
    });
    if (fk) { var n = el.querySelector('[data-fk="' + fk + '"]'); if (n) n.focus({ preventScroll: true }); }
  }

  XP.render = function () {
    var s = XP.state, root = document.documentElement;
    root.dataset.theme = s.theme;
    var ff = XP.formFactor();
    root.dataset.ff = ff;
    var cv = XP.VIEWS[s.view];
    root.dataset.stack = s.stackEditor || (cv && cv.noList) ? "editor" : "list";
    var touch = false;
    try { touch = matchMedia("(pointer:coarse)").matches; } catch (e) { /* ignore */ }
    if (touch) root.setAttribute("data-touch", ""); else root.removeAttribute("data-touch");
    if (!document.getElementById("r-top")) {
      document.getElementById("app").innerHTML =
        '<div id="r-top"></div><div class="body"><div id="r-rail" style="display:contents"></div><div id="r-list" style="display:contents"></div><div class="main"><div id="r-tabs" style="display:contents"></div><div id="r-editor" style="display:contents"></div></div></div><div id="r-dialog" style="display:contents"></div>';
    }
    region("r-top", topbar());
    region("r-rail", rail());
    region("r-list", list());
    region("r-tabs", tabs());
    region("r-editor", editor());
    region("r-dialog", XP.dialogHtml ? XP.dialogHtml() : "");
    var key = s.activeTab + "|" + s.tabs.length + "|" + ff;
    if (key !== lastTabKey) {
      lastTabKey = key;
      var on = document.querySelector(".tab.on");
      if (on) on.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  };

  /* Long-press (500 ms) on a rail item shows its label; used for the icon rail on touch. */
  var tipTimer = null, tipEl = null;
  function hideTip() { clearTimeout(tipTimer); if (tipEl) { tipEl.remove(); tipEl = null; } }
  function bindLongPress() {
    var app = document.getElementById("app");
    app.addEventListener("pointerdown", function (e) {
      hideTip();
      var item = e.target.closest(".rail .item[data-label]");
      if (!item || XP.state.railExpanded && XP.formFactor() === "wide") return;
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

  XP.actions.navDrawer = function () { XP.set({ navOpen: !XP.state.navOpen }); };
  XP.actions.closeNav = function () { XP.set({ navOpen: false }); };
  XP.actions.pinTab = function (el) { XP.pinTab(el.dataset.id); };
  XP.actions.theme = function () { XP.set({ theme: XP.state.theme === "dark" ? "light" : "dark" }); };
  XP.actions.railToggle = function () { XP.set({ railExpanded: !XP.state.railExpanded }); };
  XP.actions.wsMenu = function () { XP.set({ wsMenuOpen: !XP.state.wsMenuOpen, viewMenuOpen: false }); };
  XP.actions.palette = function () { XP.set({ paletteOpen: true }); };
  XP.actions.view = function (el) {
    var v = XP.VIEWS[el.dataset.view], patch = { view: el.dataset.view, stackEditor: false, drawerOpen: false, navOpen: false };
    if (v && v.page) patch.activeTab = null;  /* a page view shows when no tab is active */
    XP.set(patch);
  };
  XP.actions.workspace = function (el) {
    var id = el.dataset.ws, w = XP.WORKSPACES[id], c = customWs(id);
    var patch = { workspace: id, view: w ? w.defaultView : c ? c.view : XP.state.view, wsMenuOpen: false, stackEditor: false, navOpen: false };
    if (c) {
      if (c.widths) patch.widths = Object.assign({}, XP.state.widths, c.widths);
      if (c.hidden) patch.hidden = Object.assign({}, XP.state.hidden, c.hidden);
      if (typeof c.railExpanded === "boolean") patch.railExpanded = c.railExpanded;
    }
    XP.set(patch);
  };

  XP.start = function () {
    XP.load();
    document.getElementById("app").addEventListener("click", function (e) {
      var el = e.target.closest("[data-action]");
      if (el && !el.disabled && XP.actions[el.dataset.action]) XP.actions[el.dataset.action](el, e);
    });
    document.addEventListener("click", function (e) {
      var s = XP.state;
      if ((s.wsMenuOpen || s.viewMenuOpen) && !e.target.closest(".ws-wrap")) XP.set({ wsMenuOpen: false, viewMenuOpen: false });
    });
    (XP.starters || []).forEach(function (f) { f(); });
    bindLongPress();
    XP.render();
  };
})();

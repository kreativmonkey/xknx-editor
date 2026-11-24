/* Planning workspace: devices, device editor (parameters / group objects), group address tree,
   inspector (docked or sheet), context menu, rename and link dialogs, placeholder views. */
(function () {
  var XP = window.XP;
  var h = XP.h, S = XP.state;
  XP.starters = XP.starters || [];

  /* Non-persisted view state. */
  S.ed = {};            /* per device: { mode, page, filter, changed } */
  S.goSel = {};         /* per device: { ids, anchor } */
  S.gaOpen = {};        /* group id -> boolean (default open) */
  S.inspectorOpen = false;
  /* docked inspector per editor mode, for this session: closed with parameters, open with objects */
  S.inspByMode = { params: false, objects: true, ga: true };
  S.goSelectMode = null;  /* device address in touch multi-select: a tap toggles rows until "Fertig" */
  S.listFilter = "";

  var DPT = {
    "1.001": "Schalten", "1.003": "Freigeben", "1.008": "Auf/Ab", "3.007": "Dimmen", "5.001": "Prozent",
    "9.001": "Temperatur", "9.004": "Helligkeit", "9.005": "Windgeschwindigkeit", "10.001": "Uhrzeit",
  };
  var FLAGS = [["K", "Kommunikation"], ["L", "Lesen"], ["S", "Schreiben"], ["Ü", "Übertragen"], ["A", "Aktualisieren"]];
  function dptName(id) { return DPT[id] || id; }
  function dev(a) { return XP.data.devices.filter(function (d) { return d.address === a; })[0]; }
  function gaOf(a) { return XP.data.groupAddresses.filter(function (g) { return g.address === a; })[0]; }
  function statusBadge(st) {
    var k = st === "ok" ? "ok" : st === "error" ? "err" : st === "new" ? "info" : "warn";
    return h`<span class="sb ${k}" data-testid="device-status">${XP.data.statusLabels[st]}</span>`;
  }
  /* "1 Objekt ausgewählt" / "3 Objekte ausgewählt" */
  function selectedText(n) { return n + (n === 1 ? " Objekt" : " Objekte") + " ausgewählt"; }
  function flagSet(str) {
    var s = String(str).replace(/T/g, "Ü");
    return FLAGS.map(function (f) { return s.indexOf(f[0]) >= 0; });
  }
  function flagStr(set) { return FLAGS.filter(function (f, i) { return set[i]; }).map(function (f) { return f[0]; }).join(""); }

  function activeTab() {
    return S.tabs.filter(function (t) { return t.id === S.activeTab; })[0];
  }
  function curDev() {
    var t = activeTab();
    return t && t.kind === "device" ? dev(t.ref) : null;
  }
  /* The first edit in an editor turns the preview tab into a pinned one. */
  function touch() {
    var t = activeTab();
    if (t && !t.pinned) XP.pinTab(t.id);
  }

  /* ---------- editor state ---------- */
  function est(d) {
    var e = S.ed[d.address];
    if (!e || !d.channels.some(function (c) { return c.id === e.page; })) {
      var first = d.channels.filter(function (c) { return c.params.some(function (p) { return p.changed; }); })[0] || d.channels[0];
      e = S.ed[d.address] = { mode: e ? e.mode : "params", page: first.id, filter: e ? e.filter : "", changed: e ? e.changed : false };
    }
    return e;
  }
  function gsel(d) {
    var g = S.goSel[d.address];
    if (!g) g = S.goSel[d.address] = { ids: [], anchor: null };
    return g;
  }
  function selObjects(d) {
    var ids = gsel(d).ids;
    return d.groupObjects.filter(function (o) { return ids.indexOf(o.id) >= 0; });
  }
  function changedCount(d) {
    var n = 0;
    d.channels.forEach(function (c) { c.params.forEach(function (p) { if (p.changed) n++; }); });
    return n;
  }
  /* Which docked-inspector flag applies to the active editor (wide layout). */
  XP.inspectorKey = function () {
    var t = activeTab(), d = t && t.kind === "device" && dev(t.ref);
    return d ? est(d).mode : "ga";
  };
  XP.inspectorDocked = function () { return !!S.inspByMode[XP.inspectorKey()]; };
  XP.planning = {
    mode: function (addr, mode) { var d = dev(addr); est(d).mode = mode; XP.set({}); },
    select: function (addr, ids) { var g = gsel(dev(addr)); g.ids = ids.slice(); g.anchor = ids[0] || null; XP.set({}); },
  };

  /* ---------- devices list ---------- */
  function deviceRows(s) {
    var d = XP.data, sel = s.selection.device, q = s.listFilter.trim().toLowerCase();
    var vis = d.devices.filter(function (x) {
      return !q || (x.address + " " + x.name + " " + x.room + " " + x.product).toLowerCase().indexOf(q) >= 0;
    });
    var first = vis[0] && vis[0].address;
    if (!vis.length) return h`<div class="placeholder t-caption">Keine Geräte gefunden.</div>`;
    return h`${d.project.lines.map(function (ln) {
      var inLine = vis.filter(function (x) { return x.line === ln.id; });
      if (!inLine.length) return "";
      return h`<div class="grp t-label">${ln.name} · ${ln.id}</div>${inLine.map(function (x) {
        var on = sel === x.address, tab = (sel ? on : x.address === first) ? 0 : -1;
        return h`<div class="row ${on ? "sel" : ""}" role="option" aria-selected="${String(on)}" tabindex="${tab}" data-row="${x.address}" data-kind="device" data-fk="row:${x.address}" title="${x.address} ${x.name}"><span class="addr mono">${x.address}</span><span class="nm trunc">${x.name}</span></div>`;
      })}`;
    })}`;
  }
  XP.VIEWS.devices = {
    label: "Geräte", icon: "▣", rows: deviceRows,
    list: function (s) {
      return h`<div class="list-filter"><input class="input" type="search" data-testid="list-filter" data-fk="list-filter" placeholder="Geräte filtern…" aria-label="Geräte filtern" autocomplete="off" value="${s.listFilter}"></div><div role="listbox" aria-label="Geräte" data-testid="device-rows">${deviceRows(s)}</div>`;
    },
  };

  /* ---------- parameters ---------- */
  function control(c, p) {
    var attrs = 'data-ch="' + XP.esc(c.id) + '" data-pid="' + XP.esc(p.id) + '" data-fk="p:' + XP.esc(c.id + ":" + p.id) + '"';
    if (p.type === "enum") {
      return XP.raw('<select class="ctl" ' + attrs + ' aria-label="' + XP.esc(p.label) + '">' + p.options.map(function (o) {
        return '<option value="' + XP.esc(o) + '"' + (o === p.value ? " selected" : "") + ">" + XP.esc(o) + "</option>";
      }).join("") + "</select>");
    }
    return XP.raw('<input class="ctl numin" type="number" value="' + XP.esc(p.value) + '" ' + attrs + ' aria-label="' + XP.esc(p.label) + '">');
  }
  function prow(c, p) {
    return h`<div class="prow ${p.changed ? "chg" : ""}" data-param="${p.id}" data-ch="${c.id}"><span class="plabel wrap" title="${p.label}">${p.label}</span><span class="pctl">${control(c, p)}${p.changed ? h`<span class="mod" title="Geändert"></span><button class="btn link" data-action="resetParam" data-ch="${c.id}" data-pid="${p.id}" title="Auf Standard (${p.def}) zurücksetzen">Zurücksetzen</button>` : ""}</span></div>`;
  }
  function paramRows(d, e) {
    var q = e.filter.trim().toLowerCase();
    var pages = e.changed ? d.channels : d.channels.filter(function (c) { return c.id === e.page; });
    var any = false;
    var out = pages.map(function (c) {
      var ps = c.params.filter(function (p) { return (!e.changed || p.changed) && (!q || p.label.toLowerCase().indexOf(q) >= 0); });
      if (!ps.length) return "";
      any = true;
      return h`${e.changed ? h`<div class="pgh t-label">${c.name}</div>` : ""}${ps.map(function (p) { return prow(c, p); })}`;
    });
    if (!any) return h`<div class="t-caption pempty">${e.changed ? "Keine geänderten Parameter." : "Keine Parameter gefunden."}</div>`;
    return h`${out}`;
  }
  function paramsBody(d, e) {
    var f = XP.formFactor(), n = changedCount(d);
    var page = d.channels.filter(function (c) { return c.id === e.page; })[0];
    var pages = f === "narrow"
      ? h`<div class="pagesel"><select class="ctl" data-testid="page-select" data-fk="page-select" aria-label="Seite">${d.channels.map(function (c) {
        return h`<option value="${c.id}" ${c.id === e.page ? "selected" : ""}>${c.name}${c.params.some(function (p) { return p.changed; }) ? " •" : ""}</option>`;
      })}</select></div>`
      : h`<nav class="pages" data-testid="page-list" aria-label="Seiten" data-scroll="pages">${d.channels.map(function (c) {
        var mod = c.params.some(function (p) { return p.changed; });
        return h`<button class="page ${c.id === e.page && !e.changed ? "on" : ""}" data-page="${c.id}" data-action="page" data-id="${c.id}" data-fk="page:${c.id}" ${mod ? XP.raw("data-modified") : ""}><span class="trunc">${c.name}</span>${mod ? h`<span class="mod"></span>` : ""}</button>`;
      })}</nav>`;
    return h`${pages}<div class="pcontent"><div class="pbar"><span class="sec trunc">${e.changed ? "Geänderte Parameter" : page ? page.name : ""}</span><span class="spacer"></span><input class="input pfilter" type="search" data-testid="param-filter" data-fk="param-filter" placeholder="Parameter filtern…" aria-label="Parameter filtern" autocomplete="off" value="${e.filter}"><span class="toggle2" role="group" aria-label="Anzeige"><button class="${e.changed ? "" : "on"}" data-testid="filter-all" data-action="filterAll" aria-pressed="${String(!e.changed)}">Alle</button><button class="${e.changed ? "on" : ""}" data-testid="filter-changed" data-action="filterChanged" aria-pressed="${String(e.changed)}">Geändert (${n})</button></span></div><div class="plist" data-testid="param-list" data-scroll="plist">${paramRows(d, e)}</div></div>`;
  }

  /* ---------- group objects ---------- */
  function flagsHtml(str) {
    var set = flagSet(str);
    return h`${FLAGS.map(function (f, i) { return set[i] ? h`<b title="${f[1]}">${f[0]}</b>` : h`<i title="${f[1]}">${f[0]}</i>`; })}`;
  }
  function gaChip(a, send) {
    return send ? h`<span class="chip send" data-send><span class="cue" aria-hidden="true">→</span>${a}<span class="sr"> (sendend)</span></span>` : h`<span class="chip">${a}</span>`;
  }
  function objectsBody(d) {
    var g = gsel(d), first = d.groupObjects[0] && d.groupObjects[0].id, sm = S.goSelectMode === d.address;
    var bar = sm ? h`<div class="selbar" data-testid="select-bar" role="status"><span data-testid="select-count">${selectedText(g.ids.length)}</span><span class="spacer"></span><button class="btn bordered" data-testid="select-done" data-action="selectDone">Fertig</button></div>` : "";
    var tabIdx = function (id) { return (g.ids.length ? g.ids.indexOf(id) === 0 : id === first) ? 0 : -1; };
    return h`${bar}<div class="tblwrap" data-scroll="tbl"><table class="tbl ${sm ? "selmode" : ""}" data-testid="go-table"><thead><tr>${sm ? h`<th class="ck"><span class="sr">Ausgewählt</span></th>` : ""}<th class="num">#</th><th>Name</th><th class="col-typ">Typ</th><th>Flags</th><th>Adressen</th></tr></thead><tbody>${d.groupObjects.map(function (o) {
      var on = g.ids.indexOf(o.id) >= 0;
      return h`<tr class="${on ? "sel" : ""}" data-row="${o.id}" data-kind="go" data-fk="go:${o.id}" tabindex="${tabIdx(o.id)}" aria-selected="${String(on)}">${sm ? h`<td class="ck" aria-hidden="true">${on ? "✓" : ""}</td>` : ""}<td class="num">${o.num}</td><td class="nmc" title="${o.name}">${o.name}</td><td class="typ col-typ">${dptName(o.dpt)}</td><td class="flags">${flagsHtml(o.flags)}</td><td>${o.gas.length ? o.gas.map(function (a, i) { return gaChip(a, i === 0); }) : h`<span class="t-caption dis">nicht verknüpft</span>`}</td></tr>`;
    })}</tbody></table>${d.groupObjects.length ? h`<div class="t-caption legend" data-testid="go-legend"><span class="cue">→</span> sendende Gruppenadresse · Flags: K Kommunikation, L Lesen, S Schreiben, Ü Übertragen, A Aktualisieren (fett = gesetzt)</div>` : h`<div class="empty">Dieses Gerät hat keine Gruppenobjekte.</div>`}</div>`;
  }

  /* ---------- inspector ---------- */
  function dptSelect(values, attrs, testid) {
    var mixed = values.some(function (v) { return v !== values[0]; });
    return h`<select class="ctl block" data-testid="${testid}" data-fk="${testid}" ${XP.raw(attrs)} aria-label="Datentyp">${mixed ? h`<option value="" selected disabled>Gemischt</option>` : ""}${Object.keys(DPT).map(function (k) {
      return h`<option value="${k}" ${!mixed && values[0] === k ? "selected" : ""}>${k} ${DPT[k]}</option>`;
    })}</select>`;
  }
  function deviceInspector(d) {
    var e = est(d), sel = e.mode === "objects" ? selObjects(d) : [];
    if (!sel.length) {
      /* name, address, product and room are in the editor header; the inspector adds only the rest */
      return h`<div class="insp-body" data-scroll="insp">${e.mode === "objects" ? h`<div class="t-caption" data-testid="inspector-hint">Wähle Gruppenobjekte in der Liste (Strg- oder Umschalt-Klick für mehrere, auf Touch: lange drücken und „Auswählen“), um sie hier zu bearbeiten.</div>` : ""}<div class="t-label ilabel">Beschreibung</div><div class="wrap ${d.description ? "" : "t-caption"}">${d.description || "Keine Beschreibung"}</div><div class="irow"><button class="btn bordered" data-action="rename" data-type="device" data-ref="${d.address}">Umbenennen… (F2)</button></div></div>`;
    }
    var one = sel.length === 1, o = sel[0];
    var sets = sel.map(function (x) { return flagSet(x.flags); });
    var union = [], sending = [];
    sel.forEach(function (x) { x.gas.forEach(function (a, i) { if (union.indexOf(a) < 0) union.push(a); if (i === 0 && sending.indexOf(a) < 0) sending.push(a); }); });
    return h`<div class="insp-body" data-scroll="insp"><div class="ih"><div class="t-title wrap" data-testid="inspector-title">${one ? o.name : sel.length + " Objekte"}</div><div class="t-caption wrap">${one ? "Objekt " + o.num + " · " + dptName(o.dpt) : "Änderungen gelten für alle gewählten Objekte"}</div></div>
      <div class="t-label ilabel">Datentyp</div>${dptSelect(sel.map(function (x) { return x.dpt; }), 'data-insp="dpt"', "insp-dpt")}
      <div class="t-label ilabel">Flags</div><div class="tog">${FLAGS.map(function (f, i) {
        var all = sets.every(function (st) { return st[i]; });
        return h`<button class="${all ? "on" : ""}" data-action="toggleFlag" data-flag="${i}" aria-pressed="${String(all)}" title="${f[1]}">${f[0]}</button>`;
      })}</div>
      <div class="t-label ilabel">Gruppenadressen</div><div class="chiplist">${union.length ? union.map(function (a) {
        var g = gaOf(a);
        var snd = sending.indexOf(a) >= 0;
        return h`<span class="chip big ${snd ? "send" : ""}">${snd ? h`<span class="cue" aria-hidden="true">→</span>` : ""}<span class="trunc">${a}${g ? " " + g.name : ""}${snd ? h`<span class="sr"> (sendend)</span>` : ""}</span><button class="x" data-action="unlink" data-addr="${a}" aria-label="Verknüpfung mit ${a} lösen" title="Verknüpfung lösen">✕</button></span>`;
      }) : h`<span class="t-caption dis">nicht verknüpft</span>`}</div>${sending.length ? h`<div class="t-caption"><span class="cue">→</span> sendet (erste Adresse eines Objekts), die anderen empfangen nur.</div>` : ""}
      <div class="irow"><button class="btn bordered" data-testid="insp-link" data-action="openLink">+ Verknüpfen…</button>${one ? h`<button class="btn bordered" data-action="rename" data-type="go" data-ref="${o.id}">Umbenennen… (F2)</button>` : ""}</div></div>`;
  }
  function gaInspector(g) {
    return h`<div class="insp-body" data-scroll="insp"><div class="t-label ilabel">Datentyp</div>${dptSelect([g.dpt], 'data-insp="gadpt"', "insp-dpt")}<div class="irow"><button class="btn bordered" data-action="rename" data-type="ga" data-ref="${g.address}">Umbenennen… (F2)</button></div></div>`;
  }

  /* Docked on the right (wide) or a sheet (tablet: bottom sheet, narrow: full screen). */
  function frame(head, body, insp) {
    var f = XP.formFactor(), wide = f === "wide";
    var docked = wide && XP.inspectorDocked(), sheet = !wide && S.inspectorOpen;
    return h`<div class="dev ${sheet ? "has-sheet" : ""}">${head}<div class="dev-body">${body}${docked ? h`<div class="split" data-split="inspector" data-fk="split-inspector" data-testid="splitter-inspector" role="separator" aria-orientation="vertical" aria-label="Breite des Inspektors" tabindex="0"></div><aside class="inspector" data-testid="inspector" aria-label="Inspektor" style="width:${XP.clampWidth("inspector", S.widths.inspector)}px">${insp}</aside>` : ""}</div>${sheet ? h`<div class="scrim sheet-scrim" data-action="closeInspector"></div><aside class="inspector sheet" data-testid="inspector" role="dialog" aria-label="Inspektor"><div class="insp-bar"><button class="btn bordered" data-testid="inspector-close" data-action="closeInspector">${f === "narrow" ? "‹ Zurück" : "Schließen ✕"}</button></div>${insp}</aside>` : ""}</div>`;
  }
  function inspectorButton(count) {
    var f = XP.formFactor();
    var on = f === "wide" ? XP.inspectorDocked() : S.inspectorOpen;
    return h`<button class="btn bordered ${on ? "on" : ""}" data-testid="inspector-button" data-action="toggleInspector" aria-pressed="${String(on)}">Inspektor${count ? " (" + count + ")" : ""}</button>`;
  }

  /* ---------- device editor ---------- */
  XP.VIEWS.device = {
    label: "Gerät", icon: "▣",
    tabLabel: function (ref) { var x = dev(ref); return x ? ref + " " + x.name : ref; },
    editor: function (tab) {
      var d = dev(tab.ref);
      if (!d) return h`<div class="empty">Gerät nicht gefunden.</div>`;
      var e = est(d), objs = e.mode === "objects";
      var head = h`<div class="dev-head"><div class="dh-t"><div class="dh-tr"><div class="t-title wrap" data-testid="device-title">${d.name}</div>${statusBadge(d.status)}</div><div class="t-caption wrap">${d.address} · ${d.manufacturer} ${d.product} · ${d.room}</div></div><span class="spacer"></span><div class="seg" data-testid="mode-toggle" role="group" aria-label="Ansicht"><button class="${objs ? "" : "on"}" data-testid="mode-params" data-action="mode" data-mode="params" aria-pressed="${String(!objs)}">Parameter</button><button class="${objs ? "on" : ""}" data-testid="mode-objects" data-action="mode" data-mode="objects" aria-pressed="${String(objs)}">Gruppenobjekte</button></div>${inspectorButton(objs ? gsel(d).ids.length : 0)}</div>`;
      return frame(head, h`<div class="dev-main">${objs ? objectsBody(d) : paramsBody(d, e)}</div>`, deviceInspector(d));
    },
  };

  /* ---------- group addresses ---------- */
  function linksOf(addr) {
    var out = [];
    XP.data.devices.forEach(function (d) {
      d.groupObjects.forEach(function (o) { if (o.gas.indexOf(addr) >= 0) out.push({ d: d, o: o }); });
    });
    return out;
  }
  function gaTree(s) {
    var d = XP.data, sel = s.selection.groupAddress;
    var first = d.groupAddresses[0] && d.groupAddresses[0].address;
    var open = function (id) { return s.gaOpen[id] !== false; };
    return h`<div role="tree" aria-label="Gruppenadressen" data-testid="ga-tree">${d.groups.map(function (m) {
      var mo = open(m.id), n = d.groupAddresses.filter(function (g) { return g.address.split("/")[0] === m.id; }).length;
      return h`<button class="grow lvl-main" data-level="main" data-group="${m.id}" data-action="toggleGroup" data-fk="g:${m.id}" aria-expanded="${String(mo)}" title="${m.id} ${m.name}"><span class="chev">${mo ? "▾" : "▸"}</span><span class="addr mono">${m.id}</span><span class="nm trunc">${m.name}</span><span class="count">${n}</span></button>${mo ? m.children.map(function (c) {
        var co = open(c.id), items = d.groupAddresses.filter(function (g) { return g.group === c.id; });
        return h`<button class="grow lvl-mid" data-level="mid" data-group="${c.id}" data-action="toggleGroup" data-fk="g:${c.id}" aria-expanded="${String(co)}" title="${c.id} ${c.name}"><span class="chev">${co ? "▾" : "▸"}</span><span class="addr mono">${c.id}</span><span class="nm trunc">${c.name}</span><span class="count">${items.length}</span></button>${co ? items.map(function (g) {
          var on = sel === g.address, tab = (sel ? on : g.address === first) ? 0 : -1, nl = linksOf(g.address).length;
          return h`<div class="row ga ${on ? "sel" : ""}" role="treeitem" aria-selected="${String(on)}" tabindex="${tab}" data-row="${g.address}" data-kind="groupAddress" data-fk="row:${g.address}" title="${g.address} ${g.name} · ${nl} verknüpft"><span class="addr mono">${g.address}</span><span class="nm trunc">${g.name}</span>${nl ? "" : h`<span class="sb" data-testid="ga-unlinked">nicht verknüpft</span>`}</div>`;
        }) : ""}`;
      }) : ""}`;
    })}</div>`;
  }
  XP.VIEWS.groupAddresses = { label: "Gruppenadressen", icon: "⌗", list: gaTree };
  XP.VIEWS.groupAddress = {
    label: "Gruppenadresse", icon: "⌗",
    tabLabel: function (ref) { var g = gaOf(ref); return g ? ref + " " + g.name : ref; },
    editor: function (tab) {
      var g = gaOf(tab.ref);
      if (!g) return h`<div class="empty">Gruppenadresse nicht gefunden.</div>`;
      var links = linksOf(g.address);
      var head = h`<div class="dev-head"><div class="dh-t"><div class="t-title wrap" data-testid="ga-title">${g.name}</div><div class="t-caption wrap"><span class="mono">${g.address}</span> · ${g.dpt} ${dptName(g.dpt)}</div></div><span class="spacer"></span>${inspectorButton(0)}</div>`;
      var body = h`<div class="dev-main"><div class="pbar"><span class="sec">Verknüpfte Gruppenobjekte (${links.length})</span></div><div class="tblwrap" data-scroll="tbl">${links.length ? h`<table class="tbl" data-testid="ga-links"><thead><tr><th>Gerät</th><th>Objekt</th><th class="col-typ">Typ</th><th>Flags</th></tr></thead><tbody>${links.map(function (l) {
        return h`<tr><td class="nmc"><button class="link-btn" data-action="gotoGo" data-dev="${l.d.address}" data-go="${l.o.id}" title="${l.d.address} ${l.d.name}"><span class="mono">${l.d.address}</span> ${l.d.name}</button></td><td class="nmc" title="${l.o.name}">${l.o.name}</td><td class="col-typ">${dptName(l.o.dpt)}</td><td class="flags">${flagsHtml(l.o.flags)}</td></tr>`;
      })}</tbody></table>` : h`<div class="empty" data-testid="ga-links"><div class="t-title">Nicht verknüpft</div><div>Diese Gruppenadresse ist mit keinem Gruppenobjekt verbunden.</div></div>`}</div></div>`;
      return frame(head, body, gaInspector(g));
    },
  };

  /* ---------- placeholder views ---------- */
  function placeholder(id, label, icon, text) {
    XP.VIEWS[id] = {
      label: label, icon: icon, placeholder: true, noList: true,
      page: function () { return h`<div class="empty" data-testid="placeholder"><div class="empty-ico">${icon}</div><div class="t-title">${label}</div><div>${text}</div></div>`; },
    };
  }
  placeholder("buildings", "Gebäude", "⌂", "Hier ordnest du Geräte und Gruppenadressen Räumen und Gewerken zu.");
  placeholder("busDiagram", "Bus-Diagramm", "⇄", "Hier siehst du Linien, Bereiche und ihre Geräte als Topologie.");
  placeholder("catalog", "Produkte", "▤", "Hier verwaltest du die importierten Produktdaten der Hersteller.");
  placeholder("health", "Health", "!", "Hier erscheinen Hinweise und Warnungen zum Projekt.");
  placeholder("history", "Verlauf", "↺", "Hier siehst du alle Änderungen und kannst sie zurücknehmen.");

  /* ---------- context menu ---------- */
  var menuEl = null;
  XP.closeContextMenu = function () { if (menuEl) { menuEl.remove(); menuEl = null; } };
  XP.contextMenu = function (items, x, y) {
    XP.closeContextMenu();
    var m = document.createElement("div");
    m.className = "ctxmenu"; m.setAttribute("role", "menu"); m.dataset.testid = "context-menu";
    items.forEach(function (it) {
      if (it.sep) { var sp = document.createElement("div"); sp.className = "sep"; m.appendChild(sp); return; }
      var b = document.createElement("button");
      b.className = "btn"; b.setAttribute("role", "menuitem"); b.textContent = it.label; b.disabled = !!it.disabled;
      b.addEventListener("click", function () { XP.closeContextMenu(); if (it.run) it.run(); });
      m.appendChild(b);
    });
    m.addEventListener("keydown", function (e) {
      var bs = Array.prototype.slice.call(m.querySelectorAll("button:not(:disabled)")), i = bs.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); bs[(i + 1) % bs.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); bs[(i - 1 + bs.length) % bs.length].focus(); }
    });
    document.body.appendChild(m);
    var r = m.getBoundingClientRect();
    m.style.left = Math.max(4, Math.min(x, innerWidth - r.width - 4)) + "px";
    m.style.top = Math.max(4, Math.min(y, innerHeight - r.height - 4)) + "px";
    menuEl = m;
    var f = m.querySelector("button:not(:disabled)");
    if (f) f.focus({ preventScroll: true });
  };

  function menuFor(row, tab) {
    if (tab) {
      var t = S.tabs.filter(function (x) { return x.id === tab.dataset.tab; })[0];
      return [
        { label: "Anheften", disabled: !t || t.pinned, run: function () { XP.pinTab(tab.dataset.tab); } },
        { label: "Schließen", run: function () { XP.closeTab(tab.dataset.tab); } },
      ];
    }
    var kind = row.dataset.kind, ref = row.dataset.row;
    if (kind === "go") {
      var d = curDev();
      if (!d) return null;
      var g = gsel(d);
      if (g.ids.indexOf(ref) < 0) { g.ids = [ref]; g.anchor = ref; XP.set({}); }
      var sel = selObjects(d), one = sel.length === 1, a0 = sel[0] && sel[0].gas[0];
      return [
        { label: "Auswählen", disabled: S.goSelectMode === d.address, run: function () { XP.set({ goSelectMode: d.address }); } },
        { label: "Verknüpfen…", run: function () { openLink(); } },
        { label: "Kopieren", run: function () { copyText(sel.map(function (o) { return o.name; }).join("\n")); } },
        { label: "Gehe zu Adresse", disabled: !one || !a0, run: function () { XP.openObject("groupAddress", a0, { pin: false }); } },
        { sep: true },
        { label: "Umbenennen… (F2)", disabled: !one, run: function () { openRename("go", ref); } },
      ];
    }
    var name = kind === "device" ? "device" : "ga";
    return [
      { label: "Öffnen", run: function () { XP.openObject(kind, ref, { pin: false }); } },
      { label: "Anheften", run: function () { XP.openObject(kind, ref, { pin: true }); } },
      { sep: true },
      { label: "Umbenennen… (F2)", run: function () { XP.openObject(kind, ref, { pin: false }); openRename(name, ref); } },
    ];
  }
  function copyText(t) {
    try { navigator.clipboard.writeText(t).catch(function () { /* denied */ }); } catch (e) { /* unavailable */ }
  }

  /* ---------- dialogs: rename, link ---------- */
  function currentName(type, ref) {
    if (type === "device") { var d = dev(ref); return d ? d.name : ""; }
    if (type === "ga") { var g = gaOf(ref); return g ? g.name : ""; }
    var dv = curDev(), o = dv && dv.groupObjects.filter(function (x) { return x.id === ref; })[0];
    return o ? o.name : "";
  }
  function openRename(type, ref) {
    XP.openDialog("rename", { type: type, ref: ref, value: currentName(type, ref) });
  }
  function applyRename(v) {
    var d = S.dialog, name = String(v || "").trim();
    if (!name) return false;
    if (d.type === "device") dev(d.ref).name = name;
    else if (d.type === "ga") gaOf(d.ref).name = name;
    else {
      var dv = curDev(), o = dv && dv.groupObjects.filter(function (x) { return x.id === d.ref; })[0];
      if (o) o.name = name;
    }
    S.dialog = null;
    touch();
    XP.set({ dialog: null });
    return true;
  }
  function openLink() {
    var d = curDev();
    if (!d || !selObjects(d).length) return;
    XP.openDialog("link", {});
  }
  function applyLink(addr) {
    var d = curDev();
    if (!d || !addr) return false;
    selObjects(d).forEach(function (o) { if (o.gas.indexOf(addr) < 0) o.gas.push(addr); });
    touch();
    XP.set({ dialog: null });
    return true;
  }
  /* Both use the shared dialog frame of dialogs.js (480 wide, comfortable, title heading). */
  XP.dialogKinds = XP.dialogKinds || {};
  XP.dialogKinds.rename = function (d) {
    return {
      title: "Umbenennen", width: 480,
      body: h`<div class="field"><label class="t-label" for="rn-name">Name</label><input id="rn-name" class="input block" data-testid="rename-input" data-dlg="value" data-fk="rn-name" data-autofocus type="text" maxlength="80" autocomplete="off" value="${d.value}"></div>`,
      actions: h`<button class="btn" data-action="closeDialog" data-testid="dlg-cancel">Abbrechen</button><button class="btn primary" data-testid="rename-confirm" data-action="confirmRename">Umbenennen</button>`,
    };
  };
  XP.dialogKinds.link = function () {
    var dv = curDev(), sel = dv ? selObjects(dv) : [];
    var free = XP.data.groupAddresses.filter(function (g) { return sel.some(function (o) { return o.gas.indexOf(g.address) < 0; }); });
    return {
      title: "Mit Gruppenadresse verknüpfen", width: 480,
      sub: sel.length === 1 ? sel[0].name : sel.length + " Objekte",
      body: h`<div class="field"><label class="t-label" for="lk-ga">Gruppenadresse</label><select id="lk-ga" class="ctl block" data-testid="link-ga" data-fk="lk-ga" data-autofocus>${free.map(function (g) { return h`<option value="${g.address}">${g.address} ${g.name}</option>`; })}</select></div>`,
      actions: h`<button class="btn" data-action="closeDialog" data-testid="dlg-cancel">Abbrechen</button><button class="btn primary" data-testid="link-confirm" data-action="confirmLink">Verknüpfen</button>`,
    };
  };

  /* ---------- actions ---------- */
  var A = XP.actions;
  A.mode = function (el) { est(curDev()).mode = el.dataset.mode; XP.set({}); };
  A.page = function (el) { var e = est(curDev()); e.page = el.dataset.id; e.changed = false; XP.set({}); };
  A.filterAll = function () { est(curDev()).changed = false; XP.set({}); };
  A.filterChanged = function () { est(curDev()).changed = true; XP.set({}); };
  A.resetParam = function (el) {
    var d = curDev();
    if (!d) return;
    d.channels.forEach(function (c) {
      if (c.id !== el.dataset.ch) return;
      c.params.forEach(function (p) { if (p.id === el.dataset.pid) { p.value = p.def; p.changed = false; } });
    });
    touch();
    XP.set({});
  };
  A.toggleGroup = function (el) { var id = el.dataset.group; S.gaOpen[id] = S.gaOpen[id] === false; XP.set({}); };
  A.closeInspector = function () { XP.set({ inspectorOpen: false }); };
  A.selectDone = function () { XP.set({ goSelectMode: null }); };
  A.rename = function (el) { openRename(el.dataset.type, el.dataset.ref); };
  A.confirmRename = function () {
    var i = document.getElementById("rn-name");
    if (i && !applyRename(i.value)) i.focus();
  };
  A.openLink = function () { openLink(); };
  A.confirmLink = function () { var i = document.getElementById("lk-ga"); if (i) applyLink(i.value); };
  A.toggleFlag = function (el) {
    var d = curDev(), i = +el.dataset.flag;
    if (!d) return;
    var sel = selObjects(d), all = sel.every(function (o) { return flagSet(o.flags)[i]; });
    sel.forEach(function (o) { var st = flagSet(o.flags); st[i] = !all; o.flags = flagStr(st); });
    touch();
    XP.set({});
  };
  A.unlink = function (el) {
    var d = curDev();
    if (!d) return;
    selObjects(d).forEach(function (o) { o.gas = o.gas.filter(function (a) { return a !== el.dataset.addr; }); });
    touch();
    XP.set({});
  };
  A.gotoGo = function (el) {
    var d = dev(el.dataset.dev);
    if (!d) return;
    est(d).mode = "objects";
    var g = gsel(d); g.ids = [el.dataset.go]; g.anchor = el.dataset.go;
    XP.openObject("device", d.address, { pin: false });
  };

  function selectGo(d, id, how) {
    var g = gsel(d), ids = d.groupObjects.map(function (o) { return o.id; });
    if (how === "toggle") {
      var set = g.ids.indexOf(id) >= 0 ? g.ids.filter(function (x) { return x !== id; }) : g.ids.concat([id]);
      g.ids = ids.filter(function (x) { return set.indexOf(x) >= 0; }); g.anchor = id;
    } else if (how === "range") {
      var a = ids.indexOf(g.anchor === null ? id : g.anchor), b = ids.indexOf(id);
      g.ids = ids.slice(Math.min(a, b), Math.max(a, b) + 1);
      if (g.anchor === null) g.anchor = id;
    } else { g.ids = [id]; g.anchor = id; }
    XP.set({});
  }

  /* ---------- events ---------- */
  XP.starters.push(function () {
    var app = document.getElementById("app");

    app.addEventListener("click", function (e) {
      var tr = e.target.closest("tr[data-kind=go]");
      if (!tr) return;
      var d = curDev();
      if (d) selectGo(d, tr.dataset.row, S.goSelectMode === d.address ? "toggle" : e.shiftKey ? "range" : (e.ctrlKey || e.metaKey) ? "toggle" : "single");
    });
    app.addEventListener("dblclick", function (e) {
      var d = curDev();
      if (d && S.goSelectMode === d.address) return;
      if (e.target.closest("tr[data-kind=go]") && XP.formFactor() !== "wide") XP.set({ inspectorOpen: true });
    });

    app.addEventListener("contextmenu", function (e) {
      var row = e.target.closest("[data-row]"), tab = e.target.closest("[data-tab]");
      if (!row && !tab) return;
      e.preventDefault();
      var items = menuFor(tab && !row ? tab : row, tab && !row ? tab : null);
      if (items) XP.contextMenu(items, e.clientX, e.clientY);
    });
    document.addEventListener("pointerdown", function (e) {
      if (menuEl && !menuEl.contains(e.target)) XP.closeContextMenu();
    }, true);

    /* Parameter edit. */
    app.addEventListener("change", function (e) {
      var el = e.target.closest("[data-pid]");
      if (el && el.dataset.ch) {
        var d = curDev();
        if (!d) return;
        d.channels.forEach(function (c) {
          if (c.id !== el.dataset.ch) return;
          c.params.forEach(function (p) {
            if (p.id !== el.dataset.pid) return;
            if (p.type === "num") { var v = parseFloat(el.value); if (isNaN(v)) { XP.set({}); return; } p.value = v; }
            else p.value = el.value;
            p.changed = p.value !== p.def;
          });
        });
        touch();
        XP.set({});
        return;
      }
      var ps = e.target.closest("[data-testid=page-select]");
      if (ps) { var e2 = est(curDev()); e2.page = ps.value; e2.changed = false; XP.set({}); return; }
      var ins = e.target.closest("[data-insp]");
      if (!ins || !ins.value) return;
      if (ins.dataset.insp === "dpt") {
        var dv = curDev();
        if (!dv) return;
        selObjects(dv).forEach(function (o) { o.dpt = ins.value; });
      } else {
        var t = activeTab(), g = t && gaOf(t.ref);
        if (g) g.dpt = ins.value;
      }
      touch();
      XP.set({});
    });

    /* Filters update only their own list so the typing caret survives. */
    app.addEventListener("input", function (e) {
      var t = e.target;
      if (t.matches && t.matches("[data-testid=param-filter]")) {
        var d = curDev();
        if (!d) return;
        var st = est(d); st.filter = t.value;
        var box = document.querySelector("[data-testid=param-list]");
        if (box) box.innerHTML = String(paramRows(d, st));
      } else if (t.matches && t.matches("[data-testid=list-filter]")) {
        S.listFilter = t.value;
        var rows = document.querySelector("[data-testid=device-rows]");
        if (rows) rows.innerHTML = String(deviceRows(S));
      }
    });

    /* The wheel scrolls; it never changes a value. */
    app.addEventListener("wheel", function (e) {
      var t = e.target;
      if (t && t.matches && t.matches("input[type=number]") && document.activeElement === t) t.blur();
    }, { passive: true });

    /* Keyboard: group object table, F2, dialogs. */
    app.addEventListener("keydown", function (e) {
      var tr = e.target.closest("tr[data-kind=go]");
      if (!tr) return;
      var d = curDev();
      if (!d) return;
      var ids = d.groupObjects.map(function (o) { return o.id; }), i = ids.indexOf(tr.dataset.row), n = -1;
      if (e.key === "ArrowDown") n = Math.min(ids.length - 1, i + 1);
      else if (e.key === "ArrowUp") n = Math.max(0, i - 1);
      else if (e.key === "Home") n = 0;
      else if (e.key === "End") n = ids.length - 1;
      else if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        var g = gsel(d); g.ids = ids.slice(); XP.set({}); return;
      } else if (e.key === "Enter") { e.preventDefault(); if (XP.formFactor() !== "wide") XP.set({ inspectorOpen: true }); return; }
      if (n < 0) return;
      e.preventDefault();
      selectGo(d, ids[n], e.shiftKey ? "range" : "single");
      var again = document.querySelector('[data-fk="go:' + ids[n] + '"]');
      if (again) { again.focus(); again.scrollIntoView({ block: "nearest" }); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        if (menuEl) { XP.closeContextMenu(); e.stopPropagation(); return; }
        if (S.paletteOpen || S.dialog) return;
        if (S.inspectorOpen) { XP.set({ inspectorOpen: false }); e.stopPropagation(); return; }
        if (S.goSelectMode) { XP.set({ goSelectMode: null }); e.stopPropagation(); }
        return;
      }
      if (e.key !== "F2" || S.dialog) return;
      var t = e.target.closest ? e.target : null;
      var tr = t && t.closest("tr[data-kind=go]");
      if (tr) {
        var d = curDev();
        if (d && selObjects(d).length === 1) { e.preventDefault(); openRename("go", selObjects(d)[0].id); }
        return;
      }
      var row = t && t.closest(".list [data-row]");
      if (row) { e.preventDefault(); openRename(row.dataset.kind === "device" ? "device" : "ga", row.dataset.row); }
    }, true);
  });
})();

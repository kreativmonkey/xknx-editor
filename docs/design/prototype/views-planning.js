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
  S.gaFilter = "";

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
  function deviceRow(x, sel, first) {
    var on = sel === x.address, tab = (sel ? on : x.address === first) ? 0 : -1;
    return h`<div class="row ${on ? "sel" : ""}" role="option" aria-selected="${String(on)}" tabindex="${tab}" data-row="${x.address}" data-kind="device" data-fk="row:${x.address}" title="${x.address} ${x.name}"><span class="addr mono">${x.address}</span><span class="nm trunc">${x.name}</span></div>`;
  }
  /* Same rows either way: grouped by area/line (topology) or by building, floor and room. */
  function deviceGroups(vis, grouping) {
    var d = XP.data, out = [];
    if (grouping === "building") {
      var seen = {};
      d.project.buildings.forEach(function (b) {
        var bl = [];
        b.floors.forEach(function (f) {
          var fl = [];
          f.rooms.forEach(function (r) {
            var items = vis.filter(function (x) { return x.room === r; });
            items.forEach(function (x) { seen[x.address] = true; });
            if (items.length) fl.push({ head: r, level: 3, items: items });
          });
          if (fl.length) { bl.push({ head: f.name, level: 2, items: [] }); bl = bl.concat(fl); }
        });
        if (bl.length) { out.push({ head: b.name, level: 1, items: [] }); out = out.concat(bl); }
      });
      var rest = vis.filter(function (x) { return !seen[x.address]; });
      if (rest.length) out.push({ head: "Ohne Raum", level: 1, items: rest });
      return out;
    }
    d.project.lines.forEach(function (ln) {
      var items = vis.filter(function (x) { return x.line === ln.id; });
      if (items.length) out.push({ head: ln.name + " · " + ln.id, level: 1, items: items });
    });
    return out;
  }
  function deviceRows(s) {
    var d = XP.data, sel = s.selection.device, q = s.listFilter.trim().toLowerCase();
    var vis = d.devices.filter(function (x) {
      return !q || (x.address + " " + x.name + " " + x.room + " " + x.product).toLowerCase().indexOf(q) >= 0;
    });
    if (!vis.length) return h`<div class="placeholder t-caption">Keine Geräte gefunden.</div>`;
    var groups = deviceGroups(vis, s.deviceGrouping), first = null;
    groups.forEach(function (g) { if (!first && g.items.length) first = g.items[0].address; });
    return h`${groups.map(function (g) {
      return h`<div class="grp t-label grp-l${g.level}" data-testid="dev-group" data-level="${g.level}">${g.head}</div>${g.items.map(function (x) { return deviceRow(x, sel, first); })}`;
    })}`;
  }
  function groupingSwitch(s) {
    var f = function (id, label) {
      return h`<button class="${s.deviceGrouping === id ? "on" : ""}" data-testid="grouping-${id}" data-action="devGrouping" data-grouping="${id}" aria-pressed="${String(s.deviceGrouping === id)}">${label}</button>`;
    };
    return h`<div class="seg" data-testid="grouping" role="group" aria-label="Gruppierung">${f("topology", "Topologie")}${f("building", "Gebäude")}</div>`;
  }
  XP.VIEWS.devices = {
    label: "Geräte", icon: "▣", rows: deviceRows,
    list: function (s) {
      return h`<div class="list-filter">${groupingSwitch(s)}<input class="input" type="search" data-testid="list-filter" data-fk="list-filter" placeholder="Geräte filtern…" aria-label="Geräte filtern" autocomplete="off" value="${s.listFilter}"></div><div role="listbox" aria-label="Geräte" data-testid="device-rows">${deviceRows(s)}</div>`;
    },
  };


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
  /* Selection in the tree: the active tab when it is a group or an address, else the remembered address. */
  function gaSel(s) {
    var t = s.tabs.filter(function (x) { return x.id === s.activeTab; })[0];
    if (t && t.kind === "gaGroup") return { kind: "gaGroup", ref: t.ref };
    return { kind: "groupAddress", ref: s.selection.groupAddress };
  }
  function gaVisible(s) {
    var d = XP.data, q = s.gaFilter.trim().toLowerCase(), hit = function (t) { return t.toLowerCase().indexOf(q) >= 0; };
    var out = [];
    d.groups.forEach(function (m) {
      var mains = hit(m.id + " " + m.name), kids = [];
      m.children.forEach(function (c) {
        var all = mains || hit(c.id + " " + c.name);
        var items = d.groupAddresses.filter(function (g) { return g.group === c.id && (!q || all || hit(g.address + " " + g.name)); });
        if (!q || items.length) kids.push({ c: c, items: items });
      });
      if (!q || kids.length) out.push({ m: m, kids: kids });
    });
    return out;
  }
  function gaRows(s) {
    var d = XP.data, sel = gaSel(s), q = s.gaFilter.trim(), vis = gaVisible(s);
    if (!vis.length) {
      return h`<div class="placeholder t-caption" data-testid="ga-empty"><div>Keine Treffer für „${q}“</div><div><button class="btn bordered" data-testid="ga-filter-clear" data-fk="ga-filter-clear" data-action="gaFilterClear">Filter löschen</button></div></div>`;
    }
    var open = function (id) { return q ? true : s.gaOpen[id] !== false; };
    var first = vis[0].m.id, hasSel = !!sel.ref;
    return h`${vis.map(function (v) {
      var m = v.m, mo = open(m.id), n = v.kids.reduce(function (a, k) { return a + k.items.length; }, 0);
      var mon = sel.kind === "gaGroup" && sel.ref === m.id;
      return h`<div class="grow lvl-main ${mon ? "sel" : ""}" role="treeitem" aria-selected="${String(mon)}" aria-expanded="${String(mo)}" tabindex="${(hasSel ? mon : m.id === first) ? 0 : -1}" data-row="${m.id}" data-kind="gaGroup" data-level="main" data-group="${m.id}" data-fk="row:${m.id}" title="${m.id} ${m.name}"><span class="chev" data-testid="chev" data-action="toggleGroup" data-group="${m.id}">${mo ? "▾" : "▸"}</span><span class="addr mono">${m.id}</span><span class="nm trunc">${m.name}</span><span class="count">${n}</span></div>${mo ? v.kids.map(function (k) {
        var c = k.c, co = open(c.id), con = sel.kind === "gaGroup" && sel.ref === c.id;
        return h`<div class="grow lvl-mid ${con ? "sel" : ""}" role="treeitem" aria-selected="${String(con)}" aria-expanded="${String(co)}" tabindex="-1" data-row="${c.id}" data-kind="gaGroup" data-level="mid" data-group="${c.id}" data-fk="row:${c.id}" title="${c.id} ${c.name}"><span class="chev" data-testid="chev" data-action="toggleGroup" data-group="${c.id}">${co ? "▾" : "▸"}</span><span class="addr mono">${c.id}</span><span class="nm trunc">${c.name}</span><span class="count">${k.items.length}</span></div>${co ? k.items.map(function (g) {
          var on = sel.kind === "groupAddress" && sel.ref === g.address, nl = linksOf(g.address).length;
          return h`<div class="row ga ${on ? "sel" : ""}" role="treeitem" aria-selected="${String(on)}" tabindex="${on ? 0 : -1}" data-row="${g.address}" data-kind="groupAddress" data-fk="row:${g.address}" title="${g.address} ${g.name} · ${nl} verknüpft"><span class="addr mono">${g.address}</span><span class="nm trunc">${g.name}</span>${nl ? "" : h`<span class="sb" data-testid="ga-unlinked">nicht verknüpft</span>`}</div>`;
        }) : ""}`;
      }) : ""}`;
    })}`;
  }
  function gaTree(s) {
    return h`<div class="list-filter ga-tools"><input class="input" type="search" data-testid="ga-filter" data-fk="ga-filter" placeholder="Adressen filtern…" aria-label="Gruppenadressen filtern" autocomplete="off" value="${s.gaFilter}"><button class="btn bordered" data-testid="ga-new" data-fk="ga-new" data-action="gaNewMenu" aria-haspopup="menu">+ Neu ▾</button></div><div role="tree" aria-label="Gruppenadressen" data-testid="ga-tree" data-ctx="ga-bg">${gaRows(s)}</div>`;
  }
  XP.VIEWS.groupAddresses = { label: "Gruppenadressen", icon: "⌗", list: gaTree };

  /* ---- groups: lookup, counts, next free number ---- */
  var LEVELS = {
    main: { word: "Hauptgruppe", max: 31 }, mid: { word: "Mittelgruppe", max: 7 }, ga: { word: "Gruppenadresse", max: 255 },
  };
  function findGroup(id) {
    var out = null;
    XP.data.groups.forEach(function (m) {
      if (m.id === id) out = { level: "main", g: m, main: m };
      m.children.forEach(function (c) { if (c.id === id) out = { level: "mid", g: c, main: m }; });
    });
    return out;
  }
  function gasIn(id) {
    return XP.data.groupAddresses.filter(function (g) { return g.address.split("/")[0] === id || g.group === id; });
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  function nextFree(level, parent) {
    var d = XP.data, used = [];
    if (level === "main") used = d.groups.map(function (m) { return +m.id; });
    else if (level === "mid") { var m = findGroup(parent); used = m ? m.g.children.map(function (c) { return +c.id.split("/")[1]; }) : []; }
    else used = d.groupAddresses.filter(function (g) { return g.group === parent; }).map(function (g) { return +g.address.split("/")[2]; });
    var max = LEVELS[level].max, start = level === "mid" ? 0 : 1, top = used.length ? Math.max.apply(null, used) + 1 : start;
    if (top <= max) return top;
    for (var i = 0; i <= max; i++) if (used.indexOf(i) < 0) return i;
    return null;
  }
  XP.nextFreeNumber = nextFree;
  function fullId(level, parent, num) { return level === "main" ? String(num) : parent + "/" + num; }
  function createCheck(d) {
    var lv = LEVELS[d.level], t = d.num.trim(), name = d.name.trim();
    var res = { ok: false, msg: "", id: "" };
    if (!/^\d+$/.test(t) || +t > lv.max) { res.msg = "Ungültige Nummer. Erlaubt: 0 bis " + lv.max + "."; return res; }
    var id = fullId(d.level, d.parent, +t);
    res.id = id;
    var other = d.level === "ga" ? gaOf(id) : findGroup(id);
    if (other) { res.msg = id + " ist bereits vergeben (" + (other.name || other.g.name) + ")."; return res; }
    res.ok = !!name;
    return res;
  }
  /* The group (or address) the user is working in: the hint for "new" entries. */
  function gaContext(s) {
    var sel = gaSel(s);
    return sel.ref ? sel.ref : null;
  }
  function parentFor(level, hint) {
    var d = XP.data;
    if (level === "main") return null;
    var main = hint ? hint.split("/")[0] : null;
    if (level === "mid") return main && findGroup(main) ? main : d.groups[0] && d.groups[0].id;
    var mid = null;
    if (hint) {
      if (hint.split("/").length === 3) mid = hint.split("/").slice(0, 2).join("/");
      else if (hint.split("/").length === 2) mid = hint;
      else { var m = findGroup(hint); mid = m && m.g.children[0] && m.g.children[0].id; }
    }
    if (mid && findGroup(mid)) return mid;
    var any = d.groups.filter(function (m) { return m.children.length; })[0];
    return any ? any.children[0].id : null;
  }
  function openCreate(level, hint) {
    var parent = parentFor(level, hint);
    if (level !== "main" && !parent) return;
    XP.openDialog("gaCreate", { level: level, parent: parent, name: "", num: undefined, numFor: undefined });
  }
  XP.gaCreate = openCreate;
  function createItems(hint, only) {
    var all = [
      { label: "Hauptgruppe…", run: function () { openCreate("main", hint); } },
      { label: "Mittelgruppe…", run: function () { openCreate("mid", hint); } },
      { label: "Gruppenadresse…", disabled: !XP.data.groups.some(function (m) { return m.children.length; }), run: function () { openCreate("ga", hint); } },
    ];
    return only ? all.filter(function (x) { return only.indexOf(x.label) >= 0; }) : all;
  }
  function sortGa() {
    var key = function (g) { return g.address.split("/").map(function (n) { return ("000" + n).slice(-3); }).join("/"); };
    XP.data.groupAddresses.sort(function (a, b) { return key(a) < key(b) ? -1 : 1; });
  }
  function applyCreate() {
    var d = S.dialog, c = createCheck(d);
    if (!c.ok) return false;
    var name = d.name.trim(), id = c.id, data = XP.data, open = Object.assign({}, S.gaOpen);
    S.gaFilter = "";
    if (d.level === "main") {
      data.groups.push({ id: id, name: name, children: [] });
      data.groups.sort(function (a, b) { return +a.id - +b.id; });
    } else if (d.level === "mid") {
      var m = findGroup(d.parent).g;
      m.children.push({ id: id, name: name });
      m.children.sort(function (a, b) { return +a.id.split("/")[1] - +b.id.split("/")[1]; });
      open[d.parent] = true;
    } else {
      data.groupAddresses.push({ id: id, address: id, group: d.parent, name: name, dpt: "1.001" });
      sortGa();
      open[d.parent] = true; open[d.parent.split("/")[0]] = true;
    }
    S.gaOpen = open;
    S.dialog = null;
    XP.set({ dialog: null });
    XP.openObject(d.level === "ga" ? "groupAddress" : "gaGroup", id, { pin: false });
    return true;
  }
  function openDelete(id) {
    if (findGroup(id)) XP.openDialog("gaDelete", { ref: id });
  }
  function applyDelete() {
    var id = S.dialog.ref, f = findGroup(id);
    if (!f) return;
    var gone = gasIn(id).map(function (g) { return g.address; });
    var ids = [id];
    if (f.level === "main") f.g.children.forEach(function (c) { ids.push(c.id); });
    XP.data.groupAddresses = XP.data.groupAddresses.filter(function (g) { return gone.indexOf(g.address) < 0; });
    XP.data.devices.forEach(function (dv) {
      dv.groupObjects.forEach(function (o) { o.gas = o.gas.filter(function (a) { return gone.indexOf(a) < 0; }); });
    });
    if (f.level === "main") XP.data.groups = XP.data.groups.filter(function (m) { return m.id !== id; });
    else f.main.children = f.main.children.filter(function (c) { return c.id !== id; });
    var sel = Object.assign({}, S.selection);
    if (gone.indexOf(sel.groupAddress) >= 0) sel.groupAddress = null;
    var closing = S.tabs.filter(function (t) { return (t.kind === "groupAddress" && gone.indexOf(t.ref) >= 0) || (t.kind === "gaGroup" && ids.indexOf(t.ref) >= 0); });
    S.dialog = null;
    S.selection = sel;
    closing.forEach(function (t) { XP.closeTab(t.id); });
    XP.set({ dialog: null, selection: sel });
  }
  function groupCounts(f) {
    var n = gasIn(f.g.id).length;
    return f.level === "main"
      ? plural(f.g.children.length, "Mittelgruppe", "Mittelgruppen") + " · " + plural(n, "Gruppenadresse", "Gruppenadressen")
      : plural(n, "Gruppenadresse", "Gruppenadressen");
  }
  function groupRange(f) {
    return f.level === "main" ? f.g.id + "/0/0 – " + f.g.id + "/7/255" : f.g.id + "/0 – " + f.g.id + "/255";
  }
  XP.VIEWS.gaGroup = {
    label: "Gruppe", icon: "⌗",
    tabLabel: function (ref) { var f = findGroup(ref); return f ? ref + " " + f.g.name : ref; },
    editor: function (tab) {
      var f = findGroup(tab.ref);
      if (!f) return h`<div class="empty">Gruppe nicht gefunden.</div>`;
      var main = f.level === "main", hasMid = XP.data.groups.some(function (m) { return m.children.length; });
      var head = h`<div class="dev-head"><div class="dh-t"><div class="t-title wrap" data-testid="group-title">${f.g.name}</div><div class="t-caption wrap"><span class="mono">${f.g.id}</span> · ${main ? "Hauptgruppe" : "Mittelgruppe"}</div></div></div>`;
      var body = h`<div class="grp-body" data-testid="group-detail"><div class="callout"><div><div class="t-label">Adressbereich</div><div class="mono" data-testid="group-range">${groupRange(f)}</div></div><div><div class="t-label">Enthält</div><div data-testid="group-counts">${groupCounts(f)}</div></div></div>
        <div class="grp-actions">${main ? h`<button class="btn bordered" data-testid="group-new-mid" data-fk="group-new-mid" data-action="gaNewIn" data-level="mid" data-ref="${f.g.id}">Neue Mittelgruppe…</button>` : ""}<button class="btn bordered" data-testid="group-new-ga" data-fk="group-new-ga" data-action="gaNewIn" data-level="ga" data-ref="${f.g.id}" ${main && !f.g.children.length ? "disabled" : ""}>Neue Gruppenadresse…</button></div>
        <div class="grp-actions"><button class="btn bordered" data-testid="group-rename" data-fk="group-rename" data-action="rename" data-type="gaGroup" data-ref="${f.g.id}">Umbenennen… (F2)</button><button class="btn bordered" data-testid="group-delete" data-fk="group-delete" data-action="gaDelete" data-ref="${f.g.id}">Löschen…</button></div>${main && !f.g.children.length && hasMid ? h`<div class="t-caption">Lege zuerst eine Mittelgruppe an, um Gruppenadressen hinzuzufügen.</div>` : ""}</div>`;
      return h`<div class="dev">${head}<div class="dev-body"><div class="dev-main">${body}</div></div></div>`;
    },
  };
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
  XP.CTX_INDENT = 24;
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
    m.style.left = "0"; m.style.top = "0";
    document.body.appendChild(m);
    /* Opens at (x, y) with its corner on the pointer; when it would leave the window it flips to the
       other side of the pointer instead of sliding away from it. */
    var r = m.getBoundingClientRect(), edge = 4;
    if (x + r.width > innerWidth - edge) x -= r.width;
    if (y + r.height > innerHeight - edge) y -= r.height;
    m.style.left = Math.max(edge, Math.min(x, innerWidth - r.width - edge)) + "px";
    m.style.top = Math.max(edge, Math.min(y, innerHeight - r.height - edge)) + "px";
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
    var name = kind === "device" ? "device" : kind === "gaGroup" ? "gaGroup" : "ga";
    var base = [
      { label: "Öffnen", run: function () { XP.openObject(kind, ref, { pin: false }); } },
      { label: "Anheften", run: function () { XP.openObject(kind, ref, { pin: true }); } },
      { sep: true },
      { label: "Umbenennen… (F2)", run: function () { XP.openObject(kind, ref, { pin: false }); openRename(name, ref); } },
    ];
    if (kind === "gaGroup") {
      var f = findGroup(ref), main = f && f.level === "main";
      return [base[0], base[1], { sep: true }].concat(
        main ? [{ label: "Neue Mittelgruppe…", run: function () { openCreate("mid", ref); } }] : [],
        [{ label: "Neue Gruppenadresse…", disabled: main && !f.g.children.length, run: function () { openCreate("ga", ref); } }],
        [{ sep: true }, base[3], { label: "Löschen…", run: function () { openDelete(ref); } }]);
    }
    if (kind === "groupAddress") base.push({ sep: true }, { label: "Neue Gruppenadresse…", run: function () { openCreate("ga", ref); } });
    return base;
  }
  function copyText(t) {
    try { navigator.clipboard.writeText(t).catch(function () { /* denied */ }); } catch (e) { /* unavailable */ }
  }

  /* ---------- dialogs: rename, link ---------- */
  function currentName(type, ref) {
    if (type === "device") { var d = dev(ref); return d ? d.name : ""; }
    if (type === "ga") { var g = gaOf(ref); return g ? g.name : ""; }
    if (type === "gaGroup") { var gf = findGroup(ref); return gf ? gf.g.name : ""; }
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
    else if (d.type === "gaGroup") { var gf = findGroup(d.ref); if (gf) gf.g.name = name; }
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
      title: "Umbenennen", width: 480, sub: d.type === "gaGroup" ? (findGroup(d.ref) ? d.ref + " · " + (findGroup(d.ref).level === "main" ? "Hauptgruppe" : "Mittelgruppe") : "") : "",
      body: h`<div class="field"><label class="t-label" for="rn-name">Name</label><input id="rn-name" class="input block" data-testid="rename-input" data-dlg="value" data-fk="rn-name" data-autofocus type="text" maxlength="80" autocomplete="off" value="${d.value}"></div>`,
      actions: h`<button class="btn" data-action="closeDialog" data-testid="dlg-cancel">Abbrechen</button><button class="btn primary" data-testid="rename-confirm" data-action="confirmRename">Umbenennen</button>`,
    };
  };
  XP.dialogKinds.gaCreate = function (d) {
    var lv = LEVELS[d.level], data = XP.data;
    if (d.numFor !== d.parent || d.num === undefined) {
      var nf = nextFree(d.level, d.parent);
      d.num = nf === null ? "" : String(nf); d.numFor = d.parent;
    }
    var c = createCheck(d), t = d.num.trim(), bad = !!t && !c.ok && c.msg;
    var parents = d.level === "mid" ? data.groups.map(function (m) { return { id: m.id, text: m.id + " " + m.name }; })
      : d.level === "ga" ? [].concat.apply([], data.groups.map(function (m) { return m.children.map(function (k) { return { id: k.id, text: k.id + " " + k.name }; }); })) : [];
    var addr = c.id || (d.parent ? d.parent + "/…" : "…");
    var primary = c.ok ? lv.word + " " + c.id + " anlegen" : lv.word + " anlegen";
    return {
      title: lv.word + " anlegen", width: 480,
      body: h`${parents.length ? h`<div class="field"><label class="t-label" for="gc-parent">${d.level === "mid" ? "In Hauptgruppe" : "In Mittelgruppe"}</label><select id="gc-parent" class="ctl block" data-dlg="parent" data-testid="create-parent" data-fk="gc-parent">${parents.map(function (p) { return h`<option value="${p.id}" ${p.id === d.parent ? "selected" : ""}>${p.text}</option>`; })}</select></div>` : ""}
        <div class="field"><label class="t-label" for="gc-name">Name</label><input id="gc-name" class="input block" data-testid="create-name" data-dlg="name" data-fk="gc-name" data-autofocus type="text" maxlength="80" autocomplete="off" value="${d.name}"></div>
        <div class="field"><label class="t-label" for="gc-num">Nummer (0–${lv.max})</label><input id="gc-num" class="input mono" data-testid="create-number" data-dlg="num" data-fk="gc-num" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="3" value="${d.num}" aria-invalid="${String(!!bad)}" aria-describedby="gc-check"></div>
        <div id="gc-check">${bad ? h`<div class="chk err" data-testid="create-error" role="alert"><span aria-hidden="true">✕</span><span class="wrap">${c.msg}</span></div>` : h`<div class="t-caption" data-testid="create-address">Adresse: <span class="mono">${addr}</span></div>`}</div>`,
      actions: h`<button class="btn" data-action="closeDialog" data-testid="dlg-cancel">Abbrechen</button><button class="btn primary" data-testid="create-confirm" data-fk="dlg-primary" data-action="confirmCreate" ${c.ok ? "" : "disabled"}>${primary}</button>`,
    };
  };
  XP.dialogKinds.gaDelete = function (d) {
    var f = findGroup(d.ref);
    if (!f) return { title: "Löschen", width: 480, body: h`<div class="t-caption">Gruppe nicht gefunden.</div>`, actions: h`<button class="btn" data-action="closeDialog">Schließen</button>` };
    var n = gasIn(d.ref).length, links = 0;
    XP.data.devices.forEach(function (dv) { dv.groupObjects.forEach(function (o) { o.gas.forEach(function (a) { if (a.split("/")[0] === d.ref || a.split("/").slice(0, 2).join("/") === d.ref) links++; }); }); });
    var word = f.level === "main" ? "Hauptgruppe" : "Mittelgruppe", mids = f.level === "main" ? f.g.children.length : 0;
    var what = (mids ? plural(mids, "Mittelgruppe", "Mittelgruppen") + " und " : "") + plural(n, "Gruppenadresse", "Gruppenadressen");
    return {
      title: word + " löschen", sub: f.g.id + " " + f.g.name, width: 480,
      body: h`<div class="wrap" data-testid="delete-summary">${n || mids ? h`Beim Löschen werden ${what} entfernt.` : h`Die ${word} ist leer und wird entfernt.`}${links ? h` ${plural(links, "Verknüpfung", "Verknüpfungen")} mit Gruppenobjekten gehen verloren.` : ""}</div><div class="t-caption">Das Löschen lässt sich im Verlauf rückgängig machen.</div>`,
      actions: h`<button class="btn" data-action="closeDialog" data-testid="dlg-cancel">Abbrechen</button><button class="btn primary" data-testid="delete-confirm" data-fk="dlg-primary" data-action="confirmDelete">${n ? plural(n, "Gruppenadresse", "Gruppenadressen") + " löschen" : word + " löschen"}</button>`,
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
  A.gaFilterClear = function () {
    S.gaFilter = "";
    var i = document.querySelector("[data-testid=ga-filter]"), tree = document.querySelector("[data-testid=ga-tree]");
    if (i) i.value = "";   /* the typed text is not in the cached HTML, so the input is cleared by hand */
    if (tree) tree.innerHTML = String(gaRows(S));
    XP.set({});
    var again = document.querySelector("[data-testid=ga-filter]");
    if (again) again.focus({ preventScroll: true });
  };
  A.gaNewMenu = function (el) {
    var r = el.getBoundingClientRect();
    XP.contextMenu(createItems(gaContext(S)), r.left, r.bottom);
  };
  A.gaNewIn = function (el) { openCreate(el.dataset.level, el.dataset.ref); };
  A.gaDelete = function (el) { openDelete(el.dataset.ref); };
  A.confirmCreate = function () { applyCreate(); };
  A.confirmDelete = function () { applyDelete(); };
  A.devGrouping = function (el) { XP.set({ deviceGrouping: el.dataset.grouping }); };
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
      var bg = !row && !tab && S.view === "groupAddresses" && e.target.closest(".list") && !e.target.closest(".list-filter");
      if (!row && !tab && !bg) return;
      e.preventDefault();
      var items = bg ? createItems(null) : menuFor(tab && !row ? tab : row, tab && !row ? tab : null);
      if (!items) return;
      /* A pointer opens the menu at the pointer. A keyboard (context-menu key, Shift+F10) sends a
         contextmenu event without a pointer: its coordinates are engine-dependent (0/0 in some), so
         the menu opens at the focused row instead. */
      var at = e.button === 2 || e.pointerType === "mouse" || e.pointerType === "touch" || e.pointerType === "pen";
      var x = e.clientX, y = e.clientY, host = (tab && !row ? tab : row);
      if (!at && host) { var rc = host.getBoundingClientRect(); x = rc.left + XP.CTX_INDENT; y = rc.bottom; }
      XP.contextMenu(items, x, y);
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
      } else if (t.matches && t.matches("[data-testid=ga-filter]")) {
        S.gaFilter = t.value;
        var tree = document.querySelector("[data-testid=ga-tree]");
        if (tree) tree.innerHTML = String(gaRows(S));
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
    app.addEventListener("keydown", function (e) {
      var g = e.target.closest && e.target.closest("[data-kind=gaGroup][data-row]");
      if (!g || !g.closest(".list") || (e.key !== "ArrowRight" && e.key !== "ArrowLeft") || S.gaFilter.trim()) return;
      var id = g.dataset.group, isOpen = S.gaOpen[id] !== false;
      if ((e.key === "ArrowRight") === isOpen) return;
      e.preventDefault(); S.gaOpen[id] = !isOpen; XP.set({});
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
      if (row) { e.preventDefault(); openRename(row.dataset.kind === "device" ? "device" : row.dataset.kind === "gaGroup" ? "gaGroup" : "ga", row.dataset.row); }
    }, true);
  });
})();

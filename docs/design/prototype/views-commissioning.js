/* Commissioning workspace: status list, device detail, queue view, connection placeholder.
   The flow dialogs (program scope, change address, replace device) live in dialogs.js. */
(function () {
  var XP = window.XP;
  var h = XP.h, S = XP.state;
  XP.starters = XP.starters || [];

  /* Non-persisted view state. */
  S.comFilter = "all";   /* all | open | error */
  S.comQuery = "";
  S.queueItems = [];     /* { ref, scope, status: wartet|läuft|fertig|fehler, progress, error, cancel } */

  var SCOPES = {
    params: { label: "Parameter programmieren", short: "Parameter", secs: 20 },
    addresses: { label: "Adresse programmieren", short: "Adresse", secs: 10 },
    addrParams: { label: "Adresse und Parameter programmieren", short: "Adresse und Parameter", secs: 30 },
    all: { label: "Alles programmieren", short: "Alles", secs: 60 },
  };
  var SHORT = { ok: "OK", paramsChanged: "Parameter", addressesChanged: "Adresse", "new": "Neu", error: "Fehler" };
  var BADGE = { ok: "ok", paramsChanged: "warn", addressesChanged: "warn", "new": "info", error: "err" };
  var DOT = { ok: "ok", paramsChanged: "warn", addressesChanged: "warn", "new": "", error: "err" };

  function dev(a) { return XP.data.devices.filter(function (d) { return d.address === a; })[0]; }
  function changedParams(d) {
    var out = [];
    d.channels.forEach(function (c) { c.params.forEach(function (p) { if (p.changed) out.push({ page: c.name, p: p }); }); });
    return out;
  }
  function proposal(d) {
    var n = changedParams(d).length, r;
    if (d.status === "new") r = { scope: "all", reason: "Empfohlen, weil das Gerät neu ist." };
    else if (d.status === "error") r = { scope: "all", reason: "Empfohlen, weil der letzte Versuch fehlgeschlagen ist." };
    else if (d.status === "addressesChanged") {
      r = n ? { scope: "addrParams", reason: "Empfohlen, weil Adresse und Parameter geändert sind." }
        : { scope: "addresses", reason: "Empfohlen, weil nur die Adresse geändert ist." };
    } else if (d.status === "paramsChanged") r = { scope: "params", reason: "Empfohlen, weil nur Parameter geändert sind." };
    else r = { scope: "all", reason: "Keine Änderungen seit dem letzten Programmieren." };
    r.secs = SCOPES[r.scope].secs;
    return r;
  }
  XP.com = { SCOPES: SCOPES, dev: dev, proposal: proposal, changedParams: changedParams };

  /* ---------- queue (serial, simulated) ---------- */
  var TICK = 100, timer = null, failOnce = { "1.1.5": true };
  function item(ref) { return S.queueItems.filter(function (i) { return i.ref === ref; })[0]; }
  function active(i) { return i.status === "wartet" || i.status === "läuft"; }
  function tick() {
    var run = S.queueItems.filter(function (i) { return i.status === "läuft"; })[0];
    if (!run) {
      var nx = S.queueItems.filter(function (i) { return i.status === "wartet"; })[0];
      if (!nx) { clearInterval(timer); timer = null; XP.render(); return; }
      nx.status = "läuft"; nx.progress = 0;
    } else if (run.cancel) {
      S.queueItems = S.queueItems.filter(function (i) { return i !== run; });
    } else {
      run.progress = Math.min(100, run.progress + 100 / (XP.SIM.queue * 1000 / TICK));
      var d = dev(run.ref);
      if (failOnce[run.ref] && run.progress >= 60) {
        delete failOnce[run.ref];
        run.status = "fehler"; run.error = "Gerät antwortet nicht (Zeitüberschreitung nach 3 Versuchen)."; run.progress = 0;
        if (d) d.status = "error";
      } else if (run.progress >= 100) {
        run.status = "fertig"; run.progress = 100;
        if (d) d.status = "ok";
      }
    }
    XP.render();
  }
  function start() { if (!timer) timer = setInterval(tick, TICK); }
  XP.queue = {
    items: function () { return S.queueItems; },
    activeCount: function () { return S.queueItems.filter(active).length; },
    enqueue: function (ref, scope) {
      if (!dev(ref)) return false;
      var ex = item(ref);
      if (ex && active(ex)) return false;
      S.queueItems = S.queueItems.filter(function (i) { return i.ref !== ref; })
        .concat([{ ref: ref, scope: scope || "all", status: "wartet", progress: 0, error: null, cancel: false }]);
      start(); XP.render();
      return true;
    },
    retry: function (ref) {
      var it = item(ref);
      if (!it || it.status !== "fehler") return false;
      it.status = "wartet"; it.progress = 0; it.error = null; it.cancel = false;
      start(); XP.render();
      return true;
    },
    cancel: function (ref) {
      var it = item(ref);
      if (!it) return false;
      if (it.status === "wartet") S.queueItems = S.queueItems.filter(function (i) { return i !== it; });
      else if (it.status === "läuft") it.cancel = true;   /* stops at the next safe point */
      XP.render();
      return true;
    },
    clearDone: function () { S.queueItems = S.queueItems.filter(function (i) { return i.status !== "fertig"; }); XP.render(); },
    renameRef: function (from, to) { S.queueItems.forEach(function (i) { if (i.ref === from) i.ref = to; }); },
  };

  /* ---------- list ---------- */
  function visible(s) {
    var q = s.comQuery.trim().toLowerCase();
    return XP.data.devices.filter(function (d) {
      if (s.comFilter === "open" && d.status === "ok") return false;
      if (s.comFilter === "error" && d.status !== "error") return false;
      return !q || (d.address + " " + d.name + " " + d.room).toLowerCase().indexOf(q) >= 0;
    });
  }
  function badgeFor(d) {
    var it = item(d.address), full = XP.data.statusLabels[d.status];
    if (it && it.status === "wartet") return h`<span class="sb info" data-testid="status-badge" data-status="${d.status}" title="${full} · wartet in der Warteschlange">Wartet</span>`;
    if (it && it.status === "läuft") return h`<span class="sb info" data-testid="status-badge" data-status="${d.status}" title="${full} · wird programmiert">${Math.round(it.progress)} %</span>`;
    return h`<span class="sb ${BADGE[d.status]}" data-testid="status-badge" data-status="${d.status}" title="${full}">${SHORT[d.status]}</span>`;
  }
  function rows(s) {
    var d = XP.data, sel = s.selection.commissioningDevice, vis = visible(s), first = vis[0] && vis[0].address;
    if (!vis.length) return h`<div class="placeholder t-caption" data-testid="com-empty">Keine Geräte in dieser Ansicht.</div>`;
    return h`${d.project.lines.map(function (ln) {
      var inLine = vis.filter(function (x) { return x.line === ln.id; });
      if (!inLine.length) return "";
      return h`<div class="grp t-label">${ln.name} · ${ln.id}</div>${inLine.map(function (x) {
        var on = sel === x.address, tab = (sel ? on : x.address === first) ? 0 : -1;
        return h`<div class="row ${on ? "sel" : ""}" role="option" aria-selected="${String(on)}" tabindex="${tab}" data-row="${x.address}" data-kind="commissioningDevice" data-fk="row:${x.address}" title="${x.address} ${x.name} · ${d.statusLabels[x.status]}"><span class="dot ${DOT[x.status]}"></span><span class="addr mono">${x.address}</span><span class="nm trunc">${x.name}</span>${badgeFor(x)}</div>`;
      })}`;
    })}`;
  }
  function filterBar(s) {
    var all = XP.data.devices, n = {
      all: all.length,
      open: all.filter(function (x) { return x.status !== "ok"; }).length,
      error: all.filter(function (x) { return x.status === "error"; }).length,
    };
    var f = function (id, label) {
      return h`<button class="${s.comFilter === id ? "on" : ""}" data-testid="filter-${id}" data-action="comFilter" data-filter="${id}" aria-pressed="${String(s.comFilter === id)}">${label} ${n[id]}</button>`;
    };
    return h`<div class="seg com-seg" data-testid="com-filter" role="group" aria-label="Filter">${f("all", "Alle")}${f("open", "Offen")}${f("error", "Fehler")}</div>`;
  }
  XP.VIEWS.commissioningDevices = {
    label: "Geräte", icon: "▣",
    list: function (s) {
      return h`<div class="list-filter com-filters"><input class="input" type="search" data-testid="com-query" data-fk="com-query" placeholder="Geräte filtern…" aria-label="Geräte filtern" autocomplete="off" value="${s.comQuery}">${filterBar(s)}</div><div role="listbox" aria-label="Geräte" data-testid="com-rows">${rows(s)}</div>`;
    },
  };

  /* ---------- queue items ---------- */
  function qitem(it) {
    var d = dev(it.ref), name = d ? d.name : it.ref, sc = SCOPES[it.scope] ? SCOPES[it.scope].short : it.scope, st = it.status;
    var dot = st === "fehler" ? "err" : st === "fertig" ? "ok" : st === "läuft" ? "warn" : "";
    var state = st === "wartet" ? "Wartet" : st === "läuft" ? (it.cancel ? "Abbruch an der nächsten sicheren Stelle…" : "Wird programmiert · " + Math.round(it.progress) + " %") : st === "fertig" ? "Fertig" : "Fehler";
    var act = st === "wartet" || st === "läuft"
      ? h`<button class="btn bordered" data-testid="qcancel" data-action="qCancel" data-ref="${it.ref}" ${it.cancel ? "disabled" : ""}>Abbrechen</button>`
      : st === "fehler" ? h`<button class="btn bordered" data-testid="qretry" data-action="qRetry" data-ref="${it.ref}">Wiederholen</button>` : "";
    return h`<div class="qitem" data-testid="queue-item" data-ref="${it.ref}" data-status="${st}"><div class="qline"><span class="dot ${dot}"></span><span class="addr mono">${it.ref}</span><span class="nm trunc" title="${name}">${name}</span><span class="t-caption qscope">${sc}</span><span class="t-caption qstate">${state}</span>${act}</div>${st === "läuft" ? h`<div class="qprog" role="progressbar" aria-label="Fortschritt ${name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(it.progress)}"><div class="qbar" style="width:${it.progress}%"></div></div>` : ""}${st === "fehler" ? h`<div class="qerr" data-testid="queue-error"><span aria-hidden="true">✕</span> ${it.error}</div>` : ""}</div>`;
  }
  function queueBlock(opts) {
    var items = S.queueItems;
    if (!items.length) return opts && opts.empty ? h`<div class="empty qempty" data-testid="queue-empty"><div class="empty-ico">☰</div><div class="t-title">Die Warteschlange ist leer</div><div>Programmiere ein Gerät in der Geräteliste, dann erscheint es hier.</div></div>` : "";
    return h`<div class="qlist" data-testid="queue-list">${items.map(qitem)}</div>`;
  }
  XP.VIEWS.queue = {
    label: "Warteschlange", icon: "☰", noList: true,
    page: function () {
      var n = S.queueItems.filter(function (i) { return i.status === "wartet"; }).length;
      var run = S.queueItems.filter(function (i) { return i.status === "läuft"; }).length;
      var done = S.queueItems.filter(function (i) { return i.status === "fertig"; }).length;
      return h`<div class="qpage" data-testid="queue-page" data-scroll="queue"><div class="pbar"><span class="t-heading">Warteschlange</span><span class="spacer"></span><span class="t-caption" data-testid="queue-summary">${run} läuft · ${n} wartet</span><button class="btn bordered" data-action="qClear" ${done ? "" : "disabled"}>Fertige entfernen</button></div><div class="t-caption qnote">Der Bus arbeitet ein Gerät nach dem anderen ab. Ein laufender Download wird an einer sicheren Stelle abgebrochen.</div>${queueBlock({ empty: true })}</div>`;
    },
  };
  XP.VIEWS.connection = {
    label: "Verbindung", icon: "⏻", placeholder: true, noList: true,
    page: function () { return h`<div class="empty" data-testid="placeholder"><div class="empty-ico">⏻</div><div class="t-title">Verbindung</div><div>Hier wählst du die Schnittstelle und siehst den Zustand der Busverbindung.</div></div>`; },
  };

  /* ---------- device detail ---------- */
  XP.VIEWS.commissioningDevice = {
    label: "Gerät", icon: "▣",
    tabLabel: function (ref) { var x = dev(ref); return x ? ref + " " + x.name : ref; },
    editor: function (tab) {
      var d = dev(tab.ref);
      if (!d) return h`<div class="empty">Gerät nicht gefunden.</div>`;
      var pr = proposal(d), sc = SCOPES[pr.scope], it = item(d.address), busy = it && active(it);
      var ch = changedParams(d), pages = [];
      ch.forEach(function (c) { if (pages.indexOf(c.page) < 0) pages.push(c.page); });
      var summary = d.status === "new" ? "Das Gerät wurde noch nie programmiert."
        : d.status === "error" ? "Der letzte Programmierversuch ist fehlgeschlagen."
        : d.status === "ok" ? "Keine Änderungen seit dem letzten Programmieren."
        : (ch.length ? ch.length + " Parameter in " + pages.join(", ") : "keine Parameteränderung") + " · " + (d.status === "addressesChanged" ? "Adresse geändert" : "keine Adressänderung");
      var head = h`<div class="dev-head"><div class="dh-t"><div class="t-heading wrap" data-testid="device-title">${d.name}</div><div class="t-caption wrap">${d.address} · ${d.room} · zuletzt programmiert 12.11.2026</div></div><span class="spacer"></span>${badgeFor(d)}</div>`;
      var body = h`<div class="com-body" data-scroll="com">
        <section class="callout" data-testid="changes"><div class="t-label">Seit dem letzten Programmieren geändert</div><div class="t-title wrap" data-testid="change-summary">${summary}</div>${ch.length ? h`<ul class="chlist" data-testid="changed-params">${ch.map(function (c) { return h`<li><span class="wrap">${c.p.label}</span><span class="t-caption">${c.page} · ${c.p.def} → ${c.p.value}</span></li>`; })}</ul>` : ""}</section>
        <section class="btnrow"><button class="btn primary" data-testid="program-primary" data-fk="program-primary" data-action="programPrimary" data-ref="${d.address}" data-scope="${pr.scope}" ${busy ? "disabled" : ""}>${sc.label}</button><button class="btn bordered" data-testid="scope-other" data-fk="scope-other" data-action="programOther" data-ref="${d.address}" aria-haspopup="dialog">Anderer Umfang ▾</button><button class="btn bordered" data-testid="more-actions" data-fk="more-actions" data-action="moreActions" data-ref="${d.address}" aria-haspopup="menu">Weitere Aktionen ▾</button></section>
        <div class="t-caption" data-testid="scope-reason">${busy ? "Das Gerät ist in der Warteschlange." : pr.reason + " Dauer ca. " + pr.secs + " s."}</div>
        ${S.queueItems.length ? h`<section><div class="t-label qh">Warteschlange</div>${queueBlock()}</section>` : ""}
      </div>`;
      return h`<div class="dev">${head}${body}</div>`;
    },
  };

  /* ---------- menus and actions ---------- */
  function menuItems(ref, fk) {
    return [
      { label: "Programmieren…", run: function () { XP.com.openProgram(ref, fk); } },
      { label: "Adresse ändern…", run: function () { XP.openDialog("changeAddress", { ref: ref }, fk); } },
      { label: "Gerät tauschen…", run: function () { XP.openDialog("replace", { ref: ref }, fk); } },
      { sep: true },
      { label: "Im Planen öffnen", run: function () { XP.set({ workspace: "planning", view: "devices", wsMenuOpen: false }); XP.openObject("device", ref, { pin: false }); } },
    ];
  }
  XP.com.openProgram = function (ref, fk) {
    var d = dev(ref);
    if (d) XP.openDialog("program", { ref: ref, scope: proposal(d).scope }, fk);
  };
  var A = XP.actions;
  A.comFilter = function (el) { XP.set({ comFilter: el.dataset.filter }); };
  A.programPrimary = function (el) { XP.queue.enqueue(el.dataset.ref, el.dataset.scope); };
  A.programOther = function (el) { XP.com.openProgram(el.dataset.ref, "scope-other"); };
  A.moreActions = function (el) {
    var r = el.getBoundingClientRect();
    XP.contextMenu(menuItems(el.dataset.ref, "more-actions"), r.left, r.bottom + 2);
  };
  A.qRetry = function (el) { XP.queue.retry(el.dataset.ref); };
  A.qCancel = function (el) { XP.queue.cancel(el.dataset.ref); };
  A.qClear = function () { XP.queue.clearDone(); };

  XP.starters.push(function () {
    var app = document.getElementById("app");
    /* Capture phase: the Planning menu must not handle commissioning rows. */
    app.addEventListener("contextmenu", function (e) {
      var row = e.target.closest("[data-row][data-kind=commissioningDevice]");
      if (!row) return;
      e.preventDefault(); e.stopPropagation();
      XP.contextMenu(menuItems(row.dataset.row, row.dataset.fk), e.clientX, e.clientY);
    }, true);
    /* The filter box updates only its own list so the caret survives. */
    app.addEventListener("input", function (e) {
      var t = e.target;
      if (!t.matches || !t.matches("[data-testid=com-query]")) return;
      S.comQuery = t.value;
      var box = document.querySelector("[data-testid=com-rows]");
      if (box) box.innerHTML = String(rows(S));
    });
  });
})();

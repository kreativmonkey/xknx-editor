/* Diagnostics, Handover and settings views: group monitor, project info, export, placeholders, settings. */
(function () {
  var XP = window.XP;
  var h = XP.h, S = XP.state;
  XP.starters = XP.starters || [];

  /* Non-persisted view state. */
  S.monitor = XP.data.telegrams.map(function (t) { return Object.assign({}, t); });
  S.monPaused = false;
  S.monGa = "1/2/3";
  S.monValue = "Ein";
  S.monError = "";
  S.setQuery = "";
  S.highlight = null;
  S.settingValues = {};

  function dev(a) { return XP.data.devices.filter(function (d) { return d.address === a; })[0]; }
  function ga(a) { return XP.data.groupAddresses.filter(function (g) { return g.address === a; })[0]; }
  function pageOf(id, label, icon, text) {
    XP.VIEWS[id] = {
      label: label, icon: icon, placeholder: true, noList: true,
      page: function () { return h`<div class="empty" data-testid="placeholder"><div class="empty-ico">${icon}</div><div class="t-title">${label}</div><div>${text}</div></div>`; },
    };
  }

  /* ---------- group monitor ---------- */
  var nextId = XP.data.telegrams.length + 1, seq = 0;
  var SRC = ["1.1.12", "1.1.6", "1.1.4", "1.2.2", "1.1.5", "1.2.8", "1.1.7"];
  var GAS = ["1/2/3", "1/2/2", "2/1/1", "3/1/3", "1/1/1", "2/2/1", "3/2/1", "1/1/3", "3/1/7"];
  function pad(n, w) { return String(n).padStart(w, "0"); }
  function now() { var d = new Date(); return pad(d.getHours(), 2) + ":" + pad(d.getMinutes(), 2) + ":" + pad(d.getSeconds(), 2) + "." + pad(d.getMilliseconds(), 3); }
  function valueFor(dpt, i) {
    if (dpt === "9.001") return (20 + (i % 7) * 0.5).toFixed(1) + " °C";
    if (dpt === "5.001") return (i * 13 % 100) + " %";
    if (dpt === "1.008") return i % 2 ? "Ab" : "Auf";
    return i % 2 ? "Ein" : "Aus";
  }
  function push(t) {
    t.id = nextId++;
    S.monitor.push(t);
    if (S.monitor.length > 200) S.monitor.splice(0, S.monitor.length - 200);
  }
  function simulated() {
    var i = seq++, dst = GAS[(i * 5 + 2) % GAS.length], g = ga(dst), dpt = g ? g.dpt : "1.001";
    var type = i % 5 === 3 ? "Read" : i % 5 === 4 ? "Response" : "Write";
    push({ time: now(), src: SRC[(i * 3) % SRC.length], dst: dst, type: type, dpt: dpt,
      value: type === "Read" ? "" : valueFor(dpt, i), raw: type === "Read" ? "" : "0x" + pad((i * 29 % 256).toString(16), 2) });
  }
  function tickMonitor() {
    if (!S.connected || S.monPaused) return;
    simulated();
    paintMonitor();
  }
  function rowsHtml() {
    var out = [];
    for (var i = S.monitor.length - 1; i >= 0; i--) {
      var t = S.monitor[i], d = dev(t.src);
      out.push(h`<tr data-testid="telegram-row"><td class="mono">${t.time}</td><td class="nmc" title="${t.src}${d ? " " + d.name : ""}"><span class="mono">${t.src}</span></td><td><span class="mono">${t.dst}</span></td><td><span class="tt ${t.type}">${t.type}</span></td><td class="typ">${t.dpt}</td><td class="nmc" title="${t.value}">${t.value}</td><td class="mono typ">${t.raw}</td></tr>`);
    }
    return h`${out}`;
  }
  /* The table body and the counter update on their own, so a typed command is never lost. */
  function paintMonitor() {
    var body = document.querySelector("[data-testid=monitor-body]");
    if (!body || S.view !== "groupMonitor") return;
    body.innerHTML = String(rowsHtml());
    var c = document.querySelector("[data-testid=mon-count]");
    if (c) c.textContent = S.monitor.length + " Telegramme";
  }
  XP.monitor = {
    write: function (addr, value) {
      if (!/^\d{1,2}\/\d{1,2}\/\d{1,3}$/.test(addr)) return false;
      var g = ga(addr);
      push({ time: now(), src: "1.0.0", dst: addr, type: "Write", dpt: g ? g.dpt : "—", value: value, raw: "" });
      return true;
    },
    read: function (addr) {
      if (!/^\d{1,2}\/\d{1,2}\/\d{1,3}$/.test(addr)) return false;
      var g = ga(addr), dpt = g ? g.dpt : "1.001";
      push({ time: now(), src: "1.0.0", dst: addr, type: "Read", dpt: dpt, value: "", raw: "" });
      var holder = XP.data.devices.filter(function (d) { return d.groupObjects.some(function (o) { return o.gas.indexOf(addr) >= 0; }); })[0];
      setTimeout(function () {
        push({ time: now(), src: holder ? holder.address : "1.1.2", dst: addr, type: "Response", dpt: dpt, value: valueFor(dpt, 1), raw: "0x01" });
        paintMonitor();
      }, XP.FAST ? 50 : 300);
      return true;
    },
  };

  function cmdbar() {
    var off = !S.connected || S.monPaused;
    return h`<div class="cmdbar" data-testid="mon-bar">
      <label class="cf"><span class="t-caption">Gruppenadresse</span><input class="ctl mono" type="text" data-testid="mon-ga" data-fk="mon-ga" data-mon="monGa" value="${S.monGa}" autocomplete="off" aria-label="Gruppenadresse"></label>
      <label class="cf"><span class="t-caption">Wert</span><input class="ctl" type="text" data-testid="mon-value" data-fk="mon-value" data-mon="monValue" value="${S.monValue}" autocomplete="off" aria-label="Wert"></label>
      <button class="btn bordered" data-testid="mon-read" data-fk="mon-read" data-action="monRead" ${off ? "disabled" : ""}>Lesen</button>
      <button class="btn primary" data-testid="mon-write" data-fk="mon-write" data-action="monWrite" ${off ? "disabled" : ""}>Schreiben</button>
      ${S.monError ? h`<span class="chk err" data-testid="mon-error" role="alert"><span aria-hidden="true">✕</span><span class="wrap">${S.monError}</span></span>` : ""}
    </div>`;
  }
  XP.VIEWS.groupMonitor = {
    label: "Gruppenmonitor", icon: "≋", noList: true,
    page: function () {
      var banner = !S.connected
        ? h`<div class="banner warn" data-testid="mon-offline" role="status"><span aria-hidden="true">!</span><span class="wrap">Keine Verbindung zum Bus. Es kommen keine neuen Telegramme, Lesen und Schreiben sind gesperrt.</span><button class="btn bordered" data-testid="mon-connect" data-fk="mon-connect" data-action="monConnect">Verbinden</button></div>`
        : S.monPaused ? h`<div class="banner" data-testid="mon-paused" role="status"><span aria-hidden="true">Ⅱ</span><span class="wrap">Pausiert. Neue Telegramme werden nicht angezeigt, Lesen und Schreiben sind gesperrt.</span></div>` : "";
      return h`<div class="mon" data-testid="monitor-page">
        <div class="pbar"><span class="t-caption" data-testid="mon-state">${!S.connected ? "Offline" : S.monPaused ? "Pausiert" : "Live"}</span><span class="t-caption" data-testid="mon-count">${S.monitor.length} Telegramme</span><span class="spacer"></span>
          <button class="btn bordered ${S.monPaused ? "on" : ""}" data-testid="mon-pause" data-fk="mon-pause" data-action="monPause" aria-pressed="${String(S.monPaused)}">${S.monPaused ? "Fortsetzen" : "Pause"}</button>
          <button class="btn bordered" data-testid="mon-clear" data-action="monClear">Leeren</button></div>
        ${banner}${cmdbar()}
        <div class="tblwrap" data-scroll="mon"><table class="tbl" data-testid="monitor-table"><thead><tr><th>Zeit</th><th>Quelle</th><th>Ziel</th><th>Typ</th><th>DPT</th><th>Wert</th><th>Rohdaten</th></tr></thead><tbody data-testid="monitor-body">${rowsHtml()}</tbody></table></div>
      </div>`;
    },
  };
  var A = XP.actions;
  A.monConnect = function () { XP.set({ connected: true }); };
  A.monPause = function () { XP.set({ monPaused: !S.monPaused }); };
  A.monClear = function () { S.monitor = []; XP.render(); paintMonitor(); };
  function command(fn) {
    var ok = fn(S.monGa.trim(), S.monValue);
    XP.set({ monError: ok ? "" : "Ungültige Gruppenadresse. Erwartet wird das Format 1/2/3." });
  }
  A.monWrite = function () { command(function (a, v) { return XP.monitor.write(a, v); }); };
  A.monRead = function () { command(function (a) { return XP.monitor.read(a); }); };

  /* ---------- placeholders ---------- */
  pageOf("busMonitor", "Busmonitor", "⌁", "Hier siehst du die Rohdaten jedes Telegramms auf der Linie, auch von Geräten ohne Gruppenadresse.");
  pageOf("timeline", "Zeitverlauf", "∿", "Hier siehst du Werte von Gruppenadressen als Verlauf über die Zeit.");
  pageOf("recover", "Gerät zurücklesen", "⤓", "Hier liest du ein Gerät vom Bus zurück und baust es im Projekt nach.");
  pageOf("backups", "Sicherungen", "⛁", "Hier siehst du die automatischen Sicherungen und stellst eine davon wieder her.");
  pageOf("keyring", "Schlüsselbund", "⚿", "Hier verwaltest du den Schlüsselbund für KNX Data Secure und IP Secure.");
  pageOf("homeAssistant", "Home Assistant", "⌂", "Hier übergibst du das Projekt an die KNX-Integration von Home Assistant.");

  /* ---------- handover: read views ---------- */
  function facts(rows) {
    return h`<dl class="kv">${rows.map(function (r) { return h`<dt class="t-caption">${r[0]}</dt><dd class="wrap">${r[1]}</dd>`; })}</dl>`;
  }
  XP.VIEWS.projectInfo = {
    label: "Projektinfo", icon: "ⓘ", noList: true,
    page: function () {
      var d = XP.data, open = d.devices.filter(function (x) { return x.status !== "ok"; }).length;
      return h`<div class="rpage" data-testid="project-info" data-scroll="info">
        <div class="rbody"><div class="t-label">Projekt</div>${facts([
          ["Name", d.project.name], ["Linien", d.project.lines.map(function (l) { return l.id + " " + l.name; }).join(", ")],
          ["Geräte", String(d.devices.length)], ["Gruppenadressen", String(d.groupAddresses.length)],
          ["Letzte Änderung", "24.11.2026, 13:05"], ["Signatur", "Nicht signiert"],
        ])}
        <div class="t-label">Zustand</div>${facts([
          ["Programmiert", String(d.devices.length - open) + " von " + d.devices.length + " Geräten"],
          ["Offen", open ? open + " Geräte warten auf Programmierung" : "Alles programmiert"],
        ])}</div></div>`;
    },
  };
  XP.VIEWS.export = {
    label: "Export & Signatur", icon: "⇪", noList: true,
    page: function () {
      var rows = [
        ["ETS-Projekt (.knxproj)", "Für die Übergabe an andere Planer. Enthält Geräte, Parameter und Gruppenadressen.", "Nie exportiert"],
        ["Gruppenadressen (CSV)", "Für Visualisierungen und Tabellenkalkulation.", "12.11.2026"],
        ["Home-Assistant-Konfiguration", "Entitäten für die KNX-Integration aus den Gruppenadressen.", "Nie exportiert"],
      ];
      return h`<div class="rpage" data-testid="export-page" data-scroll="exp">
        <div class="rbody"><div class="t-caption">Die Exportformate und der Stand der Signatur. Das Exportieren selbst folgt im Editor.</div>
        <div class="tblwrap"><table class="tbl" data-testid="export-table"><thead><tr><th>Format</th><th>Beschreibung</th><th>Zuletzt</th></tr></thead><tbody>${rows.map(function (r) {
          return h`<tr><td class="nmc" title="${r[0]}">${r[0]}</td><td class="nmc" title="${r[1]}">${r[1]}</td><td class="typ">${r[2]}</td></tr>`;
        })}</tbody></table></div>
        <div class="t-label">Signatur</div>${facts([["Zustand", "Nicht signiert"], ["Zertifikat", "Keines hinterlegt"]])}</div></div>`;
    },
  };

  /* ---------- settings ---------- */
  var GROUPS = [
    { id: "general", label: "Allgemein" }, { id: "connection", label: "Verbindung" },
    { id: "backups", label: "Backups" }, { id: "mcp", label: "KI/MCP" }, { id: "folders", label: "Ordner" },
  ];
  /* kind: select | toggle | text | num | secret */
  var ROWS = [
    { id: "language", group: "general", label: "Sprache", kind: "select", opts: ["Deutsch", "English", "Čeština", "Polski"], value: "Deutsch", kw: "language" },
    { id: "theme", group: "general", label: "Design", kind: "select", opts: ["Dunkel", "Hell"], value: "Dunkel", kw: "theme dark light" },
    { id: "density", group: "general", label: "Dichte der Listen", kind: "select", opts: ["Kompakt", "Komfortabel"], value: "Kompakt", hint: "Komfortabel macht Zeilen und Schaltflächen höher." },
    { id: "restore", group: "general", label: "Letztes Projekt beim Start öffnen", kind: "toggle", value: true },
    { id: "updates", group: "general", label: "Beim Start nach Updates suchen", kind: "toggle", value: true },
    { id: "iface", group: "connection", label: "Schnittstelle", kind: "select", opts: ["IP-Router 224.0.23.12", "USB-Schnittstelle", "Tunnel 192.168.1.20"], value: "IP-Router 224.0.23.12" },
    { id: "ldata", group: "connection", label: "Zeitüberschreitung der Bestätigung (L_Data.con)", kind: "num", unit: "ms", value: "3000", kw: "timeout confirmation", hint: "So lange wartet der Editor auf die Bestätigung der Schnittstelle." },
    { id: "t-ack", group: "connection", label: "Zeitüberschreitung für T_Ack", kind: "num", unit: "ms", value: "3000", kw: "timeout ack" },
    { id: "resp", group: "connection", label: "Zeitüberschreitung der Antwort", kind: "num", unit: "ms", value: "6000", kw: "timeout response", hint: "Gilt für Lesen und Programmieren." },
    { id: "protected", group: "connection", label: "Geschützte Gruppenadressen", kind: "text", value: "1/1/1, 1/1/2", hint: "Auf diese Adressen schreibt der Editor nie." },
    { id: "autobackup", group: "backups", label: "Automatisch sichern", kind: "toggle", value: true },
    { id: "interval", group: "backups", label: "Sicherungsintervall", kind: "select", opts: ["Alle 5 Minuten", "Alle 15 Minuten", "Stündlich"], value: "Alle 15 Minuten" },
    { id: "keep", group: "backups", label: "Aufbewahrte Sicherungen", kind: "num", unit: "Stück", value: "20", hint: "Ältere werden gelöscht." },
    { id: "backupdir", group: "backups", label: "Ablageordner", kind: "text", value: "~/Dokumente/XKNX/Sicherungen" },
    { id: "mcp", group: "mcp", label: "MCP-Server aktivieren", kind: "toggle", value: false, kw: "ki ai server" },
    { id: "mcpport", group: "mcp", label: "Port des MCP-Servers", kind: "num", unit: "", value: "8765" },
    { id: "mcptoken", group: "mcp", label: "Zugriffstoken", kind: "secret", value: "demo-token-nicht-echt", hint: "Ein Client braucht das Token, um sich zu verbinden." },
    { id: "mcpread", group: "mcp", label: "Nur Lesezugriff erlauben", kind: "toggle", value: true },
    { id: "projdir", group: "folders", label: "Projektordner", kind: "text", value: "~/Dokumente/XKNX/Projekte" },
    { id: "proddir", group: "folders", label: "Produktdaten (.knxprod)", kind: "text", value: "~/Dokumente/XKNX/Produkte" },
    { id: "exportdir", group: "folders", label: "Exportordner", kind: "text", value: "~/Dokumente/XKNX/Export" },
  ];
  XP.settingsRows = ROWS.map(function (r) {
    return { id: r.id, group: r.group, groupLabel: GROUPS.filter(function (g) { return g.id === r.group; })[0].label, label: r.label };
  });
  function val(r) {
    if (r.id === "theme") return S.theme === "light" ? "Hell" : "Dunkel";   /* the same state as the top bar button */
    return S.settingValues[r.id] !== undefined ? S.settingValues[r.id] : r.value; }
  function matches(r, q) {
    var hay = (r.label + " " + (r.hint || "") + " " + (r.kw || "") + " " + GROUPS.filter(function (g) { return g.id === r.group; })[0].label).toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (t) { return hay.indexOf(t) >= 0; });
  }
  function control(r) {
    var v = val(r), c = "setting:" + r.id;
    if (r.kind === "toggle") return h`<label class="tgl"><input type="checkbox" data-fk="${c}" data-set="${r.id}" ${v ? "checked" : ""} aria-label="${r.label}"><span class="t-caption">${v ? "Ein" : "Aus"}</span></label>`;
    if (r.kind === "select") return h`<select class="ctl" data-fk="${c}" data-set="${r.id}" aria-label="${r.label}">${r.opts.map(function (o) { return h`<option ${o === v ? "selected" : ""}>${o}</option>`; })}</select>`;
    if (r.kind === "num") return h`<input class="ctl numin" type="text" inputmode="numeric" data-fk="${c}" data-set="${r.id}" value="${v}" aria-label="${r.label}">${r.unit ? h`<span class="t-caption">${r.unit}</span>` : ""}`;
    if (r.kind === "secret") return h`<input class="ctl" type="password" readonly data-fk="${c}" value="${v}" aria-label="${r.label}"><button class="btn bordered" data-action="newToken" data-fk="new-token">Neu erzeugen</button>`;
    return h`<input class="ctl block" type="text" data-fk="${c}" data-set="${r.id}" value="${v}" aria-label="${r.label}">`;
  }
  function settingsBody() {
    var q = S.setQuery.trim(), out = [], n = 0;
    GROUPS.forEach(function (g) {
      var rows = ROWS.filter(function (r) { return r.group === g.id && (!q || matches(r, q)); });
      if (!rows.length) return;
      n += rows.length;
      out.push(h`<div class="sgh t-title" data-testid="settings-group" data-group="${g.id}">${g.label}</div>${rows.map(function (r) {
        var hl = S.highlight === r.id;
        return h`<div class="srow" data-testid="settings-row" data-setting="${r.id}" data-group="${r.group}" ${hl ? XP.raw("data-highlight") : ""}><div class="slabel wrap">${r.label}${r.hint ? h`<div class="t-caption">${r.hint}</div>` : ""}</div><div class="pctl">${control(r)}</div></div>`;
      })}`);
    });
    if (!n) return h`<div class="empty" data-testid="settings-empty"><div class="t-title">Keine Einstellung gefunden</div><div>Zu „${q}“ gibt es keine Einstellung. Prüfe die Schreibweise oder suche nach einem Teil des Namens.</div></div>`;
    return h`${out}`;
  }
  XP.VIEWS.settings = {
    label: "Einstellungen", icon: "⚙", noList: true,
    page: function () {
      return h`<div class="spage" data-testid="settings-page" data-density="comfortable"><div class="pbar sbar"><input class="input sfilter" type="search" data-testid="settings-search" data-fk="settings-search" placeholder="Einstellungen durchsuchen…" aria-label="Einstellungen durchsuchen" autocomplete="off" value="${S.setQuery}"></div><div class="sbody" data-scroll="settings" data-testid="settings-body">${settingsBody()}</div></div>`;
    },
  };
  /* Jump to a setting: show the page without a filter, scroll to the row and highlight it. */
  XP.openSetting = function (id) {
    XP.set({ view: "settings", activeTab: null, stackEditor: true, drawerOpen: false, navOpen: false, setQuery: "", highlight: id });
    var el = document.querySelector('[data-setting="' + id + '"]');
    if (el) el.scrollIntoView({ block: "center" });
  };
  A.newToken = function () { S.settingValues.mcptoken = "demo-token-" + (++seq); XP.render(); };

  XP.starters.push(function () {
    var app = document.getElementById("app");
    setInterval(tickMonitor, XP.SIM.monitor * 1000);
    app.addEventListener("input", function (e) {
      var t = e.target;
      if (!t.matches) return;
      if (t.matches("[data-mon]")) { S[t.dataset.mon] = t.value; return; }
      if (t.matches("[data-testid=settings-search]")) {
        S.setQuery = t.value; S.highlight = null;
        var b = document.querySelector("[data-testid=settings-body]");
        if (b) b.innerHTML = String(settingsBody());
        return;
      }
      if (t.matches("[data-set]") && t.type === "text") S.settingValues[t.dataset.set] = t.value;
    });
    app.addEventListener("change", function (e) {
      var t = e.target;
      if (!t.matches || !t.matches("[data-set]")) return;
      if (t.dataset.set === "theme") { XP.actions.theme(); return; }
      S.settingValues[t.dataset.set] = t.type === "checkbox" ? t.checked : t.value;
      if (t.type === "checkbox") { var c = t.parentNode.querySelector(".t-caption"); if (c) c.textContent = t.checked ? "Ein" : "Aus"; }
    });
  });
})();

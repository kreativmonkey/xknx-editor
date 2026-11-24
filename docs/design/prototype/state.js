/* State, persistence, helpers, workspaces, view registry. */
(function () {
  var XP = (window.XP = window.XP || {});
  var KEY = "xp-prototype-v1";
  var PERSIST = ["theme", "workspace", "railExpanded", "widths", "hidden", "customWorkspaces"];

  var params = new URLSearchParams(location.search);
  XP.FAST = params.get("fast") === "1";
  XP.SIM = XP.FAST ? { queue: 0.4, monitor: 0.2 } : { queue: 4, monitor: 2 };

  XP.state = {
    theme: "dark",
    workspace: "planning",
    view: "devices",
    railExpanded: true,
    tabs: [],
    activeTab: null,
    selection: {},
    widths: { list: 280, inspector: 300 },
    hidden: { list: false, inspector: false },
    customWorkspaces: [],
    dialog: null,
    paletteOpen: false,
    connected: false,
    wsMenuOpen: false,
    viewMenuOpen: false,
    drawerOpen: false,
    stackEditor: false,
  };

  /* Escaping template helper: XP.h`<b>${x}</b>`; nested h results and arrays are kept. */
  function Safe(s) { this.s = s; }
  Safe.prototype.toString = function () { return this.s; };
  XP.raw = function (s) { return new Safe(String(s)); };
  XP.esc = function (v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  function part(v) {
    if (v instanceof Safe) return v.s;
    if (Array.isArray(v)) return v.map(part).join("");
    if (v === null || v === undefined || v === false) return "";
    return XP.esc(v);
  }
  XP.h = function (strings) {
    var out = strings[0];
    for (var i = 1; i < arguments.length; i++) out += part(arguments[i]) + strings[i];
    return new Safe(out);
  };

  /* Persistence, always guarded: localStorage may throw. */
  function persist() {
    try {
      var o = {};
      PERSIST.forEach(function (k) { o[k] = XP.state[k]; });
      localStorage.setItem(KEY, JSON.stringify(o));
    } catch (e) { /* storage unavailable */ }
  }
  /* Merge stored values over the defaults; anything malformed is ignored. */
  XP.load = function () {
    try {
      var raw = localStorage.getItem(KEY);
      if (!raw) return;
      var o = JSON.parse(raw), st = XP.state;
      if (!o || typeof o !== "object") return;
      if (o.theme === "dark" || o.theme === "light") st.theme = o.theme;
      if (typeof o.railExpanded === "boolean") st.railExpanded = o.railExpanded;
      if (o.widths && typeof o.widths === "object") {
        Object.keys(st.widths).forEach(function (n) {
          var v = o.widths[n];
          if (typeof v === "number" && isFinite(v) && v >= 120 && v <= 1000) st.widths[n] = v;
        });
      }
      if (o.hidden && typeof o.hidden === "object") {
        Object.keys(st.hidden).forEach(function (n) { if (typeof o.hidden[n] === "boolean") st.hidden[n] = o.hidden[n]; });
      }
      if (Array.isArray(o.customWorkspaces)) {
        st.customWorkspaces = o.customWorkspaces.filter(function (c) {
          return c && typeof c === "object" && typeof c.id === "string" && typeof c.name === "string";
        });
      }
      if (typeof o.workspace === "string") {
        var w = XP.WORKSPACES[o.workspace];
        var c = st.customWorkspaces.filter(function (x) { return x.id === o.workspace; })[0];
        if (w) { st.workspace = o.workspace; st.view = w.defaultView; }
        else if (c) { st.workspace = c.id; st.view = c.view && XP.VIEWS[c.view] ? c.view : st.view; }
      }
    } catch (e) { /* ignore broken data */ }
  };
  XP.set = function (patch) {
    Object.assign(XP.state, patch);
    persist();
    XP.render();
  };

  /* Workspaces (spec section "Workspaces"). */
  XP.WORKSPACES = {
    planning: {
      label: "Planen", icon: "✎", defaultView: "devices",
      rail: [
        { group: "Projekt", items: ["devices", "groupAddresses", "buildings", "busDiagram"] },
        { group: "Katalog", items: ["catalog"] },
        { group: "Prüfen", items: ["health", "history"] },
      ],
    },
    commissioning: {
      label: "Inbetriebnahme", icon: "▶", defaultView: "commissioningDevices",
      rail: [
        { group: "Projekt", items: ["commissioningDevices", "queue"] },
        { group: "Bus", items: ["connection", "groupMonitor"] },
        { group: "Prüfen", items: ["health"] },
      ],
    },
    diagnostics: {
      label: "Diagnose & Service", icon: "◎", defaultView: "groupMonitor",
      rail: [
        { group: "Bus", items: ["groupMonitor", "busMonitor", "timeline"] },
        { group: "Prüfen", items: ["health"] },
        { group: "Projekt", items: ["devices", "recover"] },
      ],
    },
    handover: {
      label: "Übergabe", icon: "⇪", defaultView: "projectInfo",
      rail: [
        { group: "Übergabe", items: ["projectInfo", "export", "backups"] },
        { group: "Sicherheit", items: ["keyring", "homeAssistant"] },
      ],
    },
  };

  /* View registry; later tasks replace the placeholder entries. */
  XP.VIEWS = {};
  [
    ["devices", "Geräte", "▣"], ["groupAddresses", "Gruppenadressen", "⌗"],
    ["buildings", "Gebäude", "⌂"], ["busDiagram", "Bus-Diagramm", "⇄"],
    ["catalog", "Produkte", "▤"], ["health", "Health", "!"], ["history", "Verlauf", "↺"],
    ["commissioningDevices", "Geräte", "▣"], ["queue", "Warteschlange", "☰"],
    ["connection", "Verbindung", "⏻"], ["groupMonitor", "Gruppenmonitor", "≋"],
    ["busMonitor", "Busmonitor", "⌁"], ["timeline", "Zeitverlauf", "∿"],
    ["recover", "Gerät zurücklesen", "⤓"], ["projectInfo", "Projektinfo", "ⓘ"],
    ["export", "Export & Signatur", "⇪"], ["backups", "Sicherungen", "⛁"],
    ["keyring", "Schlüsselbund", "⚿"], ["homeAssistant", "Home Assistant", "⌂"],
    ["settings", "Einstellungen", "⚙"],
  ].forEach(function (v) { XP.VIEWS[v[0]] = { label: v[1], icon: v[2], placeholder: true }; });

  XP.actions = {};
  XP.render = function () {};
})();

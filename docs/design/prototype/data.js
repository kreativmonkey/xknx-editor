/* Demo project "Musterhaus". German demo texts. */
(function () {
  var XP = (window.XP = window.XP || {});

  var switchParams = function (ch, room) {
    return [
      { id: ch + "-mode", label: "Betriebsart", type: "enum", options: ["Schließer", "Öffner"], value: "Schließer", def: "Schließer", changed: false },
      { id: ch + "-stairs", label: "Treppenlicht", type: "enum", options: ["Aus", "Ein"], value: ch === "A" ? "Ein" : "Aus", def: "Aus", changed: ch === "A" },
      { id: ch + "-off", label: "Verhalten bei Busspannungsausfall", type: "enum", options: ["Unverändert", "Aus", "Ein"], value: ch === "A" ? "Aus" : "Unverändert", def: "Unverändert", changed: ch === "A" },
      { id: ch + "-on", label: "Verhalten bei Busspannungswiederkehr", type: "enum", options: ["Wie vor Ausfall", "Aus", "Ein"], value: ch === "A" ? "Ein" : "Wie vor Ausfall", def: "Wie vor Ausfall", changed: ch === "A" },
    ];
  };
  var ch8 = "ABCDEFGH".split("").map(function (c) {
    return { id: "ch" + c, name: "Kanal " + c, params: switchParams(c) };
  });
  var generic = function (names) {
    return names.map(function (n, i) {
      return { id: "c" + i, name: n, params: [
        { id: "p1", label: "Betriebsart", type: "enum", options: ["Standard", "Erweitert"], value: "Standard", def: "Standard", changed: false },
        { id: "p2", label: "Verzögerung (s)", type: "num", value: 0, def: 0, changed: false },
      ] };
    });
  };
  var go = function (num, name, dpt, flags, gas) {
    return { id: "go" + num, num: num, name: name, dpt: dpt, flags: flags, gas: gas || [] };
  };

  /* [addr, line, name, manufacturer, product, room, status] */
  var rows = [
    ["1.1.1", "1.1", "Spannungsversorgung", "MDT", "STC-0640.01", "Technikraum", "ok"],
    ["1.1.2", "1.1", "IP-Router", "MDT", "SCN-IP100.03", "Technikraum", "ok"],
    ["1.1.3", "1.1", "Dimmaktor 4-fach", "MDT", "AMI-0416.01", "Wohnzimmer", "addressesChanged"],
    ["1.1.4", "1.1", "Schaltaktor 8-fach", "MDT", "AKS-0816.03", "Küche", "paramsChanged"],
    ["1.1.5", "1.1", "Jalousieaktor 4-fach", "MDT", "JAL-0410.02", "Wohnzimmer", "new"],
    ["1.1.6", "1.1", "Tastsensor Wohnzimmer", "MDT", "BE-GT2TW.01", "Wohnzimmer", "ok"],
    ["1.1.7", "1.1", "Tastsensor Küche", "MDT", "BE-GT2TW.01", "Küche", "ok"],
    ["1.1.8", "1.1", "Binäreingang 8-fach", "MDT", "BE-08000.02", "Technikraum", "ok"],
    ["1.1.12", "1.1", "Tastsensor Flur", "MDT", "BE-GT2TW.01", "Flur", "ok"],
    ["1.2.1", "1.2", "Heizungsaktor 6-fach", "MDT", "AKH-0600.02", "Technikraum", "error"],
    ["1.2.2", "1.2", "Raumtemperaturregler Schlafzimmer", "MDT", "SCN-RT1UP.02", "Schlafzimmer", "ok"],
    ["1.2.7", "1.2", "Präsenzmelder Bad", "Steinel", "KNX Multisensor", "Bad", "paramsChanged"],
    ["1.2.8", "1.2", "Wetterstation", "Elsner", "Suntracer KNX", "Dach", "ok"],
    ["1.2.9", "1.2", "Gerät mit sehr langem Namen für den Test der Kürzung in Listen und Tabs", "Gira", "Universal-Aktor", "Hauswirtschaftsraum", "ok"],
  ];
  var devices = rows.map(function (r) {
    return { id: r[0], address: r[0], line: r[1], name: r[2], manufacturer: r[3], product: r[4], room: r[5], status: r[6],
      description: "", channels: generic(["Kanal A", "Kanal B"]), groupObjects: [] };
  });
  var byAddr = function (a) { return devices.filter(function (d) { return d.address === a; })[0]; };

  var d4 = byAddr("1.1.4");
  d4.channels = [{ id: "general", name: "Allgemein", params: [
    { id: "g-delay", label: "Verzögerung nach Busspannungswiederkehr (s)", type: "num", value: 2, def: 2, changed: false },
    { id: "g-heartbeat", label: "Zyklisches Lebenszeichen", type: "enum", options: ["Aus", "Alle 5 min"], value: "Aus", def: "Aus", changed: false },
  ] }].concat(ch8);
  d4.groupObjects = "ABCDEFGH".split("").map(function (c, i) {
    return go(i * 3 + 1, "Kanal " + c + " Schalten", "1.001", "KS-Ü", i === 0 ? ["1/2/3"] : []);
  }).concat([go(25, "Zentral Schalten", "1.001", "K-S--", ["1/1/1"])]);
  byAddr("1.1.5").groupObjects = [go(1, "Fahren Auf/Ab", "1.008", "K-S--", ["2/1/1"]), go(2, "Position", "5.001", "K-S--", ["2/2/1"])];
  byAddr("1.1.5").channels = generic(["Ausgang A", "Ausgang B", "Ausgang C", "Ausgang D"]);
  byAddr("1.1.12").groupObjects = [go(1, "Taste 1 Schalten", "1.001", "K-S--", ["1/2/3"]), go(2, "Taste 2 Schalten", "1.001", "K-S--", ["1/2/2"])];
  byAddr("1.1.3").groupObjects = [go(1, "Kanal A Schalten", "1.001", "KS-Ü", ["1/2/2"]), go(2, "Kanal A Dimmwert", "5.001", "K-S--", ["1/2/7"])];
  var gen = function (a, list) { byAddr(a).groupObjects = list; };
  gen("1.1.1", [go(1, "Status Busspannung", "1.001", "K-S--", ["1/1/3"])]);
  gen("1.1.2", [go(1, "Zeit Senden", "10.001", "K-S--", [])]);
  gen("1.1.6", [go(1, "Taste 1 Schalten", "1.001", "K-S--", ["1/2/2"]), go(2, "Temperatur Eingang", "9.001", "K-S--", ["3/1/2"])]);
  gen("1.1.7", [go(1, "Taste 1 Schalten", "1.001", "K-S--", ["1/2/3"])]);
  gen("1.1.8", [go(1, "Eingang 1 Schalten", "1.001", "K-S--", ["1/1/2"]), go(2, "Eingang 2 Schalten", "1.001", "K-S--", ["1/1/1"])]);
  gen("1.2.2", [go(1, "Ist-Temperatur", "9.001", "K-S-T", ["3/1/6"]), go(2, "Soll-Temperatur", "9.001", "KS-Ü", ["3/2/6"])]);
  gen("1.2.7", [go(1, "Präsenz", "1.001", "K-S--", ["1/2/4"]), go(2, "Helligkeit", "9.004", "K-S--", [])]);
  gen("1.2.8", [go(1, "Außentemperatur", "9.001", "K-S--", ["3/1/7"]), go(2, "Windgeschwindigkeit", "9.005", "K-S--", [])]);
  gen("1.2.9", [go(1, "Ausgang 1 Schalten", "1.001", "KS-Ü", ["1/2/8"])]);
  byAddr("1.2.7").channels[0].params[0].value = "Erweitert"; byAddr("1.2.7").channels[0].params[0].changed = true;
  byAddr("1.1.3").channels[0].params[0].value = "Erweitert"; byAddr("1.1.3").channels[0].params[0].changed = true;
  byAddr("1.1.5").channels[0].params[0].value = "Erweitert"; byAddr("1.1.5").channels[0].params[0].changed = true;
  byAddr("1.2.1").groupObjects = [go(1, "Stellwert Kanal 1", "5.001", "KS-Ü", ["3/2/1"])];

  /* Group addresses: 3 main groups, 6 middle groups. */
  var groups = [
    { id: "1", name: "Beleuchtung", children: [{ id: "1/1", name: "Zentral" }, { id: "1/2", name: "Erdgeschoss" }] },
    { id: "2", name: "Beschattung", children: [{ id: "2/1", name: "Fahrten" }, { id: "2/2", name: "Position" }] },
    { id: "3", name: "Heizung", children: [{ id: "3/1", name: "Ist-Temperatur" }, { id: "3/2", name: "Soll-Temperatur" }] },
  ];
  var rooms = ["Flur", "Wohnzimmer", "Küche", "Bad", "Büro", "Schlafzimmer", "Terrasse", "Technikraum"];
  var ga = [];
  var add = function (prefix, mid, nameFn, dpt, count) {
    for (var i = 0; i < count; i++) ga.push({ id: prefix + "/" + (i + 1), address: prefix + "/" + (i + 1), group: mid, name: nameFn(rooms[i % rooms.length], i), dpt: dpt });
  };
  ga.push({ id: "1/1/1", address: "1/1/1", group: "1/1", name: "Zentral Aus", dpt: "1.001" });
  ga.push({ id: "1/1/2", address: "1/1/2", group: "1/1", name: "Zentral Ein", dpt: "1.001" });
  ga.push({ id: "1/1/3", address: "1/1/3", group: "1/1", name: "Alle Lichter Status", dpt: "1.001" });
  add("1/2", "1/2", function (r) { return "Licht " + r; }, "1.001", 8);
  add("2/1", "2/1", function (r) { return "Jalousie " + r + " Auf/Ab"; }, "1.008", 6);
  add("2/2", "2/2", function (r) { return "Jalousie " + r + " Position"; }, "5.001", 6);
  add("3/1", "3/1", function (r) { return "Temperatur " + r; }, "9.001", 8);
  add("3/2", "3/2", function (r) { return "Solltemperatur " + r; }, "9.001", 8);
  ga.push({ id: "1/1/4", address: "1/1/4", group: "1/1", name: "Zentral Dimmen", dpt: "3.007" });
  ga.forEach(function (g) { g.group = g.id.split("/").slice(0, 2).join("/"); });

  /* 30 monitor telegrams. */
  var tg = [];
  var gas = ["1/2/3", "1/2/2", "2/1/1", "3/1/3", "1/1/1", "2/2/1", "3/2/1"];
  var srcs = ["1.1.12", "1.1.6", "1.1.4", "1.2.2", "1.1.5"];
  var types = ["Write", "Write", "Write", "Read", "Response"];
  /* strictly increasing: 12:10:00.000 plus 1.3 s to 1.5 s per telegram */
  function clock(n) {
    var ms = (12 * 3600 + 10 * 60) * 1000 + n * 1300 + (n * 37) % 200;
    var p = function (v, w) { return String(v).padStart(w, "0"); };
    return p(Math.floor(ms / 3600000), 2) + ":" + p(Math.floor(ms / 60000) % 60, 2) + ":" + p(Math.floor(ms / 1000) % 60, 2) + "." + p(ms % 1000, 3);
  }
  for (var i = 0; i < 30; i++) {
    var dpt = gas[i % gas.length].charAt(0) === "3" ? "9.001" : gas[i % gas.length].charAt(0) === "2" ? "5.001" : "1.001";
    var val = dpt === "9.001" ? (20 + (i % 5) * 0.5).toFixed(1) + " °C" : dpt === "5.001" ? (i * 7 % 100) + " %" : (i % 2 ? "Ein" : "Aus");
    tg.push({ id: i + 1, time: clock(i),
      src: srcs[i % srcs.length], dst: gas[i % gas.length], type: types[i % types.length], dpt: dpt, value: val,
      raw: "0x" + (i * 17 % 256).toString(16).padStart(2, "0") });
  }

  XP.data = {
    project: { name: "Musterhaus", lines: [{ id: "1.1", name: "Linie EG" }, { id: "1.2", name: "Linie OG" }] },
    devices: devices, groups: groups, groupAddresses: ga, telegrams: tg,
    statusLabels: { ok: "Programmiert", paramsChanged: "Parameter geändert", addressesChanged: "Adresse geändert", "new": "Neu", error: "Fehler" },
  };
})();

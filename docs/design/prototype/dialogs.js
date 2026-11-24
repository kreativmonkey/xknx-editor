/* Dialog frame (widths 480/640/880, comfortable density, full-screen sheet when narrow) and the
   commissioning flows: program scope, change address, replace device. The dialog state lives in
   XP.state.dialog, so it survives re-renders and workspace switches. */
(function () {
  var XP = window.XP;
  var h = XP.h, S = XP.state;
  XP.starters = XP.starters || [];
  XP.dialogKinds = {};   /* kind -> function (d) -> { title, sub, width, body, actions } */

  var trigger = null;    /* data-fk of the element that opened the dialog */

  XP.openDialog = function (kind, data, triggerFk) {
    var a = document.activeElement;
    trigger = triggerFk || (a && a.dataset && a.dataset.fk) || null;
    XP.set({ dialog: Object.assign({ kind: kind }, data || {}), viewMenuOpen: false, wsMenuOpen: false });
  };
  XP.closeDialog = function () { XP.set({ dialog: null }); };
  XP.actions.closeDialog = function () { XP.closeDialog(); };

  var prevHtml = XP.dialogHtml;
  XP.dialogHtml = function () {
    var d = S.dialog, k = d && XP.dialogKinds[d.kind];
    if (!k) return prevHtml ? prevHtml() : "";
    var c = k(d);
    return h`<div class="scrim modal flow" data-testid="dialog-scrim"></div>
      <div class="dialog dlg w${c.width}" data-density="comfortable" role="dialog" aria-modal="true" aria-labelledby="dlg-title" tabindex="-1" data-testid="dialog" data-kind="${d.kind}">
        <div class="dlg-head"><div class="t-heading wrap" id="dlg-title" data-testid="dialog-title">${c.title}</div>${c.sub ? h`<div class="t-caption wrap">${c.sub}</div>` : ""}</div>
        <div class="dlg-body" data-scroll="dlg">${c.body}</div>
        <div class="actions">${c.actions}</div>
      </div>`;
  };

  /* ---------- shared pieces ---------- */
  function dev(a) { return XP.com.dev(a); }
  function opt(field, value, cur, title, text, extra) {
    var on = cur === value;
    return h`<label class="opt ${on ? "on" : ""}"><input type="radio" name="${field}" data-dlg="${field}" data-fk="opt:${field}:${value}" value="${value}" ${on ? "checked" : ""}><span class="opt-t"><span class="opt-h">${title}</span><span class="t-caption wrap">${text}</span>${on && extra ? extra : ""}</span></label>`;
  }
  function chk(ok, text, testid) {
    return h`<div class="chk ${ok ? "ok" : "err"}" data-testid="${testid}" role="${ok ? "status" : "alert"}"><span aria-hidden="true">${ok ? "✓" : "✕"}</span><span class="wrap">${text}</span></div>`;
  }
  var cancelBtn = h`<button class="btn" data-action="closeDialog" data-testid="dlg-cancel">Abbrechen</button>`;
  function serialOf(d) {
    var i = XP.data.devices.indexOf(d);
    return "00C5:1A2B" + ("0000" + ((i + 1) * 4919).toString(16).toUpperCase()).slice(-4);
  }
  function lineIds() { return XP.data.project.lines.map(function (l) { return l.id; }); }

  /* ---------- program scope ---------- */
  XP.dialogKinds.program = function (d) {
    var x = dev(d.ref), pr = XP.com.proposal(x), S2 = XP.com.SCOPES, sc = S2[d.scope] || S2[pr.scope];
    var order = ["params", "addresses", "addrParams", "all"];
    return {
      title: "Programmieren", sub: x.address + " " + x.name + " · " + x.room, width: 480,
      body: h`<div class="t-caption">Wähle, was auf das Gerät geschrieben wird. Das Gerät kommt in die Warteschlange.</div><div class="optlist" role="radiogroup" aria-label="Umfang">${order.map(function (k) {
        return opt("scope", k, d.scope, S2[k].short + (k === pr.scope ? " (empfohlen)" : ""), "Dauer ca. " + S2[k].secs + " s.");
      })}</div><div class="t-caption" data-testid="program-reason">${d.scope === pr.scope ? pr.reason : "Abweichend vom Vorschlag."}</div>`,
      actions: h`${cancelBtn}<button class="btn primary" data-testid="program-confirm" data-fk="dlg-primary" data-action="confirmProgram">${sc.label}</button>`,
    };
  };
  XP.actions.confirmProgram = function () {
    var d = S.dialog;
    XP.queue.enqueue(d.ref, d.scope);
    XP.closeDialog();
  };

  /* ---------- change address ---------- */
  function nextFree(d) {
    var line = d.address.split(".").slice(0, 2).join("."), n = 20;
    function used(a) { return XP.data.devices.some(function (x) { return x.address === a; }); }
    while (used(line + "." + n)) n++;
    return line + "." + n;
  }
  function addrCheck(ref, v) {
    if (!v) return { ok: false, msg: "" };
    var m = /^(\d{1,2})\.(\d{1,2})\.(\d{1,3})$/.exec(v);
    if (!m || +m[1] > 15 || +m[2] > 15 || +m[3] > 255) return { ok: false, msg: "Ungültige Adresse. Format: Bereich.Linie.Teilnehmer, zum Beispiel 1.1.20." };
    if (v === ref) return { ok: false, msg: "Das ist bereits die Adresse des Geräts." };
    var other = dev(v);
    if (other) return { ok: false, msg: v + " ist bereits vergeben (" + other.name + ")." };
    var line = m[1] + "." + m[2];
    if (lineIds().indexOf(line) < 0) return { ok: false, msg: "Die Linie " + line + " gibt es im Projekt nicht." };
    return { ok: true, msg: "frei im Projekt und am Bus" };
  }
  function affected(d) {
    var mine = [];
    d.groupObjects.forEach(function (o) { o.gas.forEach(function (a) { if (mine.indexOf(a) < 0) mine.push(a); }); });
    return XP.data.devices.filter(function (x) {
      return x !== d && x.groupObjects.some(function (o) { return o.gas.some(function (a) { return mine.indexOf(a) >= 0; }); });
    });
  }
  XP.dialogKinds.changeAddress = function (d) {
    var x = dev(d.ref);
    if (d.value === undefined) d.value = nextFree(x);
    if (!d.ident) d.ident = "answers";
    var v = d.value.trim(), c = addrCheck(d.ref, v), aff = affected(x);
    var shown = aff.slice(0, 3).map(function (a) { return a.address + " " + a.name; }).join(", ") + (aff.length > 3 ? " und " + (aff.length - 3) + " weitere" : "");
    return {
      title: "Adresse ändern", sub: x.name + " · " + x.room, width: 640,
      body: h`<div class="addrflow"><div><div class="t-label">Aktuell</div><div class="t-heading mono" data-testid="addr-old">${x.address}</div></div><span class="arrow" aria-hidden="true">→</span><div class="addr-new"><label class="t-label" for="ca-new">Neu</label><input id="ca-new" class="input mono" data-testid="addr-input" data-dlg="value" data-fk="addr-input" data-autofocus type="text" inputmode="numeric" autocomplete="off" spellcheck="false" maxlength="9" value="${d.value}" aria-invalid="${String(!!v && !c.ok)}" aria-describedby="ca-check"></div></div>
        <div id="ca-check">${v ? chk(c.ok, c.msg, "addr-check") : h`<div class="t-caption" data-testid="addr-check">Format: Bereich.Linie.Teilnehmer</div>`}</div>
        <div><div class="t-label olabel">Wie wird das Gerät erkannt?</div><div class="optlist" role="radiogroup" aria-label="Erkennung">
          ${opt("ident", "answers", d.ident, "Gerät antwortet unter " + x.address, "Ohne Gang zum Gerät: die Adresse wird direkt umgeschrieben.")}
          ${opt("ident", "button", d.ident, "Programmierknopf drücken", "Wenn das Gerät eine unbekannte Adresse hat.")}
          ${opt("ident", "serial", d.ident, "Seriennummer " + serialOf(x), "Aus dem Projekt bekannt.")}
        </div></div>
        <div class="t-caption" data-testid="addr-after">Danach wird das Projekt angepasst (rückgängig machbar).${aff.length ? " Geräte mit gemeinsamen Gruppenadressen: " + shown + "." : ""}</div>`,
      actions: h`${cancelBtn}<button class="btn primary" data-testid="addr-confirm" data-fk="dlg-primary" data-action="confirmAddress" ${c.ok ? "" : "disabled"}>${c.ok ? "Adresse auf " + v + " ändern" : "Adresse ändern"}</button>`,
    };
  };
  function sortDevices() {
    var lines = lineIds();
    function key(a) { var p = a.split("."); return [lines.indexOf(p[0] + "." + p[1]), +p[2]]; }
    XP.data.devices.sort(function (a, b) { var x = key(a.address), y = key(b.address); return x[0] - y[0] || x[1] - y[1]; });
  }
  /* Tabs, selection and queue refer to a device by its address. */
  function renameRef(from, to) {
    var st = S;
    var tabs = st.tabs.map(function (t) {
      if ((t.kind === "device" || t.kind === "commissioningDevice") && t.ref === from) return Object.assign({}, t, { ref: to, id: t.kind + ":" + to });
      return t;
    });
    var active = st.activeTab;
    st.tabs.forEach(function (t) { if (t.id === active && t.ref === from && (t.kind === "device" || t.kind === "commissioningDevice")) active = t.kind + ":" + to; });
    var sel = Object.assign({}, st.selection);
    ["device", "commissioningDevice"].forEach(function (k) { if (sel[k] === from) sel[k] = to; });
    if (st.ed && st.ed[from]) { st.ed[to] = st.ed[from]; delete st.ed[from]; }
    if (st.goSel && st.goSel[from]) { st.goSel[to] = st.goSel[from]; delete st.goSel[from]; }
    XP.queue.renameRef(from, to);
    return { tabs: tabs, activeTab: active, selection: sel };
  }
  XP.com.changeAddress = function (ref, addr) {
    var d = dev(ref);
    if (!d || !addrCheck(ref, addr).ok) return false;
    var p = renameRef(ref, addr);
    d.address = addr; d.id = addr; d.line = addr.split(".").slice(0, 2).join(".");
    sortDevices();
    XP.set(Object.assign(p, { dialog: null }));
    return true;
  };
  XP.actions.confirmAddress = function () { XP.com.changeAddress(S.dialog.ref, S.dialog.value.trim()); };

  /* ---------- replace device ---------- */
  var STEPS = ["Ersatz", "Neues Gerät finden", "Übernahme prüfen", "Programmieren"];
  var MODELS = ["MDT JAL-0810.02 (Jalousieaktor 8-fach)", "MDT JAL-0420.02 (Jalousieaktor 4-fach, neue Generation)"];
  var TARGETS = ["Höhe (Position)", "Lamellenwinkel"];
  var SERIAL = /^[0-9A-Fa-f]{4}:[0-9A-Fa-f]{8}$/;
  function paramCount(x) { var n = 0; x.channels.forEach(function (c) { n += c.params.length; }); return n; }
  function linkCount(x) { var n = 0; x.groupObjects.forEach(function (o) { n += o.gas.length; }); return n; }
  /* Mapping old -> new for a different model: every second object needs a manual choice. */
  function mapping(x, d) {
    return x.groupObjects.map(function (o, i) {
      var manual = i % 2 === 1;
      return { o: o, manual: manual, to: manual ? (d.map && d.map[i] !== undefined ? TARGETS[d.map[i]] : null) : o.name };
    });
  }
  function foundSerial(d) { return d.find === "serial" ? (SERIAL.test(d.serial || "") ? d.serial.toUpperCase() : null) : (d.found ? "00C5:1A2B3C4D" : null); }
  function steps(cur) {
    return h`<ol class="steps" data-testid="steps" aria-label="Schritte">${STEPS.map(function (s, i) {
      var n = i + 1, st = n === cur ? "on" : n < cur ? "done" : "";
      return h`<li class="step ${st}" ${n === cur ? XP.raw('aria-current="step"') : ""} data-step="${n}"><span class="sn">${n < cur ? "✓" : n}</span><span class="sl trunc">${s}</span></li>`;
    })}</ol>`;
  }
  XP.dialogKinds.replace = function (d) {
    var x = dev(d.ref);
    if (!d.step) { d.step = 1; d.model = "same"; d.newModel = 0; d.find = "button"; d.found = false; d.serial = ""; d.map = {}; }
    var step = d.step, body, back = step > 1, next, nextOk = true, note = "";
    if (step === 1) {
      body = h`<div class="t-label olabel">Ersatz</div><div class="optlist" role="radiogroup" aria-label="Ersatz">
        ${opt("model", "same", d.model, "Gleiches Modell (" + x.manufacturer + " " + x.product + ")", "Alles wird übernommen.")}
        ${opt("model", "other", d.model, "Anderes Modell", "Parameter und Gruppenobjekte werden zugeordnet.", h`<select class="ctl block" data-dlg="newModel" data-fk="new-model" data-testid="new-model" aria-label="Neues Modell">${MODELS.map(function (m, i) { return h`<option value="${i}" ${i === +d.newModel ? "selected" : ""}>${m}</option>`; })}</select>`)}
      </div>`;
    } else if (step === 2) {
      var ser = foundSerial(d);
      body = h`<div class="t-label olabel">Neues Gerät finden</div><div class="optlist" role="radiogroup" aria-label="Erkennung">
        ${opt("find", "button", d.find, "Programmierknopf am neuen Gerät drücken", "Das Gerät muss im Programmiermodus sein.",
          d.found ? chk(true, "Gerät gefunden: Seriennummer 00C5:1A2B3C4D", "found")
            : h`<div class="waitline" data-testid="wait-button"><span class="dot warn"></span><span>Warte auf Programmierknopf…</span></div><button class="link-btn" data-testid="sim-button" data-fk="sim-button" data-action="simButton">Simulieren: Knopf gedrückt</button>`)}
        ${opt("find", "serial", d.find, "Seriennummer eingeben", "Wenn der Knopf nicht erreichbar ist.",
          h`<input class="input mono block" data-testid="serial-input" data-dlg="serial" data-fk="serial-input" type="text" autocomplete="off" spellcheck="false" maxlength="13" placeholder="00C5:1A2B3C4D" aria-label="Seriennummer" value="${d.serial}">${d.serial ? (ser ? chk(true, "Seriennummer gültig", "found") : chk(false, "Format: vier Zeichen, Doppelpunkt, acht Zeichen", "found")) : ""}`)}
      </div>`;
      nextOk = !!ser;
      if (!ser) note = "Weiter geht es, sobald ein Gerät gefunden ist.";
    } else if (step === 3) {
      var other = d.model === "other", map = other ? mapping(x, d) : [], open = map.filter(function (m) { return m.manual && !m.to; }).length;
      var nP = paramCount(x), nL = linkCount(x);
      var rowsT = [
        ["Adresse", x.address, true],
        ["Parameter", other ? Math.round(nP * 0.9) + " von " + nP + " passend" : "alle " + nP, true],
        ["Gruppenverknüpfungen", other ? (nL - map.filter(function (m) { return m.manual && !m.to; }).reduce(function (a, m) { return a + m.o.gas.length; }, 0)) + " von " + nL : nL + " von " + nL, !other || open === 0],
        ["Data Secure Schlüssel", "Das neue Gerät braucht einen FDSK (Schritt 4)", false],
      ];
      body = h`<div class="t-label olabel">Was übernommen wird</div><div class="takeover" data-testid="takeover">${rowsT.map(function (r) { return h`<div class="trow"><span class="t-caption">${r[0]}</span><span class="wrap">${r[1]}</span><span class="${r[2] ? "tk ok" : "tk warn"}" title="${r[2] ? "übernommen" : "offen"}">${r[2] ? "✓" : "!"}<span class="sr">${r[2] ? " übernommen" : " offen"}</span></span></div>`; })}</div>
        ${other ? h`<div class="t-label olabel">Gruppenobjekte: alt → neu</div><div class="tblwrap maptbl"><table class="tbl" data-testid="map-table"><thead><tr><th>Bisher</th><th>Neues Modell</th></tr></thead><tbody>${map.map(function (m, i) {
          return h`<tr data-testid="map-row" data-manual="${String(m.manual)}"><td class="nmc" title="${m.o.name}">${m.o.name}</td><td>${m.manual ? (m.to ? h`${m.to} <button class="link-btn" data-action="mapAssign" data-idx="${i}" data-fk="map:${i}">Ändern</button>` : h`<span class="t-caption">Nicht zugeordnet</span> <button class="link-btn" data-testid="map-assign" data-action="mapAssign" data-idx="${i}" data-fk="map:${i}">Zuordnen</button>`) : h`${m.to} <span class="t-caption">· automatisch</span>`}</td></tr>`;
        })}</tbody></table></div>` : ""}`;
      nextOk = open === 0;
      if (open) note = open + (open === 1 ? " Zuordnung offen" : " Zuordnungen offen");
    } else {
      var other4 = d.model === "other";
      body = h`<div class="t-label olabel">Programmieren</div><div class="callout" data-testid="replace-summary"><div class="t-title wrap">Ersatzgerät ${foundSerial(d)} erhält die Adresse ${x.address}</div><div class="t-caption wrap">${other4 ? "Modell " + MODELS[+d.newModel] + ". " : ""}Alle Parameter und Gruppenverknüpfungen werden geschrieben. Das Gerät kommt in die Warteschlange und wird dort programmiert.</div></div>
        <div class="chk err" data-testid="fdsk-open"><span aria-hidden="true">!</span><span class="wrap">Data Secure: Der FDSK des neuen Geräts fehlt noch. Ohne ihn bleibt das Gerät ungesichert.</span></div>`;
    }
    next = step < 4
      ? h`<button class="btn primary" data-testid="dlg-next" data-fk="dlg-next" data-action="dlgNext" ${nextOk ? "" : "disabled"}>Weiter</button>`
      : h`<button class="btn primary" data-testid="replace-confirm" data-fk="dlg-next" data-action="confirmReplace">In die Warteschlange legen</button>`;
    return {
      title: "Gerät tauschen", sub: "Ersetzt " + x.address + " " + x.name + " · " + x.room, width: 880,
      body: h`${steps(step)}${body}${note ? h`<div class="t-caption" data-testid="step-note">${note}</div>` : ""}`,
      actions: h`${cancelBtn}<span class="spacer"></span>${back ? h`<button class="btn bordered" data-testid="dlg-back" data-fk="dlg-back" data-action="dlgBack">Zurück</button>` : ""}${next}`,
    };
  };
  XP.actions.dlgNext = function () { S.dialog.step = Math.min(4, S.dialog.step + 1); XP.render(); };
  XP.actions.dlgBack = function () { S.dialog.step = Math.max(1, S.dialog.step - 1); XP.render(); };
  XP.actions.simButton = function () { S.dialog.found = true; XP.render(); };
  XP.actions.mapAssign = function (el) {
    var i = +el.dataset.idx, cur = S.dialog.map[i];
    S.dialog.map[i] = cur === undefined ? 0 : (cur + 1) % TARGETS.length;
    XP.render();
  };
  XP.actions.confirmReplace = function () {
    var d = S.dialog, x = dev(d.ref);
    if (!x) return;
    x.serial = foundSerial(d);
    if (d.model === "other") {
      x.product = MODELS[+d.newModel].split(" (")[0].replace(/^MDT /, "");
      mapping(x, d).forEach(function (m) { if (m.manual && m.to) m.o.name = m.to; });
    }
    x.status = "new";
    XP.queue.enqueue(d.ref, "all");
    var patch = { dialog: null };
    if (S.workspace === "commissioning") { patch.view = "queue"; patch.activeTab = null; patch.stackEditor = true; }
    XP.set(patch);
  };

  /* ---------- fields, focus, Escape ---------- */
  function focusables(dlg) {
    return Array.prototype.slice.call(dlg.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),[href]"))
      .filter(function (n) { return n.offsetParent !== null; });
  }
  function initialFocus(dlg) {
    var n = dlg.querySelector("[data-autofocus]") || dlg.querySelector("input:checked") || focusables(dlg)[0] || dlg;
    n.focus({ preventScroll: true });
    if (n.select && n.matches("input[type=text]")) n.select();
  }

  XP.starters.push(function () {
    var baseRender = XP.render, wasOpen = false;
    XP.render = function () {
      var dlg0 = document.querySelector(".dialog.dlg"), a = document.activeElement;
      var had = !!(dlg0 && a && dlg0.contains(a)), fk = had && a.dataset ? a.dataset.fk : null;
      var ss = had && typeof a.selectionStart === "number" ? [a.selectionStart, a.selectionEnd] : null;
      baseRender();
      var dlg = document.querySelector(".dialog.dlg");
      if (dlg && !wasOpen) initialFocus(dlg);
      else if (dlg && had && document.activeElement === document.body) {
        var n = fk && dlg.querySelector('[data-fk="' + fk + '"]');
        if (n) n.focus({ preventScroll: true }); else initialFocus(dlg);
      }
      if (dlg && ss && document.activeElement && document.activeElement.dataset && document.activeElement.dataset.fk === fk) {
        try { document.activeElement.setSelectionRange(ss[0], ss[1]); } catch (e) { /* not a text field */ }
      }
      if (!dlg && wasOpen) {
        var t = trigger && document.querySelector('[data-fk="' + trigger + '"]');
        if (t) t.focus({ preventScroll: true });
        trigger = null;
      }
      wasOpen = !!dlg;
    };

    document.addEventListener("input", function (e) {
      var t = e.target;
      if (t && t.dataset && t.dataset.dlg && S.dialog && t.type === "text") { S.dialog[t.dataset.dlg] = t.value; XP.render(); }
    });
    document.addEventListener("change", function (e) {
      var t = e.target;
      if (!t || !t.dataset || !t.dataset.dlg || !S.dialog || t.type === "text") return;
      S.dialog[t.dataset.dlg] = t.value;
      XP.render();
    });
    document.addEventListener("keydown", function (e) {
      var d = S.dialog;
      if (!d || !XP.dialogKinds[d.kind]) return;
      var dlg = document.querySelector(".dialog.dlg");
      if (e.key === "Escape") {
        if (document.querySelector("[data-testid=context-menu]")) return;
        e.preventDefault(); XP.closeDialog(); return;
      }
      if (e.key === "Enter" && e.target && e.target.matches && e.target.matches("input[type=text]")) {
        var p = dlg && dlg.querySelector(".actions .btn.primary:not(:disabled)");
        if (p) { e.preventDefault(); p.click(); }
        return;
      }
      if (e.key !== "Tab" || !dlg) return;
      var f = focusables(dlg);
      if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && (i < 0 || i === f.length - 1)) { e.preventDefault(); f[0].focus(); }
    });
  });
})();

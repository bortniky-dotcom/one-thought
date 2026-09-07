(function () {
  "use strict";

  var STORE_KEY = "one-thought:v1";

  var state = loadState();

  function loadState() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return {};
  }
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }
  function ensure(key, def) {
    if (state[key] === undefined || state[key] === null) state[key] = def;
    return state[key];
  }

  function todayKey() {
    var d = new Date();
    var m = String(d.getMonth() + 1);
    if (m.length < 2) m = "0" + m;
    var day = String(d.getDate());
    if (day.length < 2) day = "0" + day;
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function prettyDate(key) {
    var p = key.split("-");
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }

  // A "bag" is a shuffled set of indices we draw from without repeats until empty.
  function shuffled(n) {
    var arr = [];
    for (var i = 0; i < n; i++) arr.push(i);
    for (var j = arr.length - 1; j > 0; j--) {
      var k = Math.floor(Math.random() * (j + 1));
      var t = arr[j]; arr[j] = arr[k]; arr[k] = t;
    }
    return arr;
  }
  function drawOne(bagName, n, avoid) {
    var bags = ensure("bags", {});
    var bag = (bags[bagName] || []).filter(function (i) { return i < n; });
    if (!bag.length) bag = shuffled(n);
    var idx = bag.pop();
    if (avoid != null && idx === avoid && bag.length) {
      var idx2 = bag.pop();
      bag.push(idx);
      idx = idx2;
    }
    bags[bagName] = bag;
    return idx;
  }
  function drawMany(bagName, n, count) {
    var out = [];
    var guard = 0;
    while (out.length < count && guard < count * 6) {
      var idx = drawOne(bagName, n);
      if (out.indexOf(idx) === -1) out.push(idx);
      guard++;
    }
    return out;
  }

  function prevDateIndex(byDate, key) {
    var keys = Object.keys(byDate).filter(function (k) { return k < key; }).sort();
    return keys.length ? byDate[keys[keys.length - 1]] : null;
  }
  function firstWord(s) {
    return (s || "").toString().trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  // ---- picks --------------------------------------------------------------
  function affirmToday(force) {
    var lib = window.AFFIRMATION_LIBRARY || [];
    if (!lib.length) return null;
    var byDate = ensure("affirmByDate", {});
    var key = todayKey();
    var idx = byDate[key];
    if (force || idx == null || idx >= lib.length) {
      idx = drawOne("affirm", lib.length, force ? idx : null);
      var prev = prevDateIndex(byDate, key);
      var attempts = 0;
      while (prev != null && lib[prev] &&
             firstWord(lib[idx].text) === firstWord(lib[prev].text) && attempts < 5) {
        idx = drawOne("affirm", lib.length, idx);
        attempts++;
      }
      byDate[key] = idx;
      save();
    }
    return lib[idx];
  }

  function gratefulToday(force) {
    var list = (state.personal && state.personal.grateful) || [];
    if (!list.length) return null;
    var byDate = ensure("gratefulByDate", {});
    var key = todayKey();
    var want = Math.min(3, list.length);
    var picks = byDate[key];
    var valid = Array.isArray(picks) && picks.length === want &&
      picks.every(function (i) { return i < list.length; });
    if (force || !valid) {
      picks = drawMany("grateful", list.length, want);
      byDate[key] = picks;
      save();
    }
    return picks.map(function (i) { return list[i]; });
  }

  function makeTodayToday(force) {
    var list = (state.personal && state.personal.today) || [];
    if (!list.length) return null;
    var byDate = ensure("todayByDate", {});
    var key = todayKey();
    var idx = byDate[key];
    if (force || idx == null || idx >= list.length) {
      idx = drawOne("today", list.length, force ? idx : null);
      byDate[key] = idx;
      save();
    }
    return list[idx];
  }

  // ---- private list import ------------------------------------------------
  function parsePersonal(text) {
    var lines = (text || "").split(/\r?\n/);
    var section = null;
    var out = { grateful: [], today: [] };
    lines.forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      var h = line.match(/^#{1,6}\s*(.+)$/);
      if (h) {
        var t = h[1].toLowerCase();
        if (t.indexOf("grateful") !== -1) section = "grateful";
        else if (t.indexOf("today") !== -1) section = "today";
        else section = null;
        return;
      }
      var item = line.replace(/^\s*(\d+[.)]|[-*\u2022])\s+/, "").trim();
      if (item.indexOf("|") !== -1) {
        var parts = item.split("|");
        item = parts[parts.length - 1].trim();
      }
      if (!item) return;
      if (section === "grateful") out.grateful.push(item);
      else if (section === "today") out.today.push(item);
    });
    return out;
  }

  function savePersonal(parsed) {
    state.personal = { grateful: parsed.grateful, today: parsed.today };
    if (state.bags) { delete state.bags.grateful; delete state.bags.today; }
    delete state.gratefulByDate;
    delete state.todayByDate;
    save();
  }

  function clearPersonal() {
    delete state.personal;
    if (state.bags) { delete state.bags.grateful; delete state.bags.today; }
    delete state.gratefulByDate;
    delete state.todayByDate;
    save();
  }

  // ---- rendering ----------------------------------------------------------
  var $ = function (id) { return document.getElementById(id); };
  var currentAffirm = "";
  var currentTheme = "";

  function fadeIn(el) {
    el.classList.remove("in");
    void el.offsetWidth;
    el.classList.add("in");
  }

  function renderAffirm(force) {
    var a = affirmToday(force);
    var el = $("affirmation");
    var theme = $("theme-line");
    if (!a) { el.textContent = "\u2026"; return; }
    currentAffirm = a.text;
    currentTheme = a.theme ? a.theme.toUpperCase() : "";
    if (force) {
      el.classList.remove("in");
      setTimeout(function () {
        el.textContent = a.text;
        theme.textContent = currentTheme;
        fadeIn(el);
      }, 180);
    } else {
      el.textContent = a.text;
      theme.textContent = currentTheme;
      fadeIn(el);
    }
  }

  function renderGrateful(force) {
    var items = gratefulToday(force);
    var listEl = $("grateful-list");
    var empty = $("grateful-empty");
    listEl.innerHTML = "";
    if (!items) {
      listEl.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    listEl.hidden = false;
    items.forEach(function (text) {
      var li = document.createElement("li");
      li.textContent = text;
      listEl.appendChild(li);
    });
    fadeIn(listEl);
  }

  function renderToday(force) {
    var text = makeTodayToday(force);
    var el = $("today-line");
    var empty = $("today-empty");
    if (!text) {
      el.hidden = true;
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    el.hidden = false;
    el.textContent = text;
    fadeIn(el);
  }

  function showView(name) {
    ["thought", "grateful", "today"].forEach(function (v) {
      var view = $("view-" + v);
      var actions = $("actions-" + v);
      var on = v === name;
      if (view) view.classList.toggle("is-active", on);
      if (actions) actions.hidden = !on;
    });
    var items = document.querySelectorAll(".menu-item");
    for (var i = 0; i < items.length; i++) {
      items[i].classList.toggle("is-active", items[i].getAttribute("data-view") === name);
    }
    var theme = $("theme-line");
    if (theme) theme.textContent = name === "thought" ? currentTheme : "";
    if (name === "grateful") renderGrateful(false);
    if (name === "today") renderToday(false);
  }

  function renderHistory() {
    var lib = window.AFFIRMATION_LIBRARY || [];
    var byDate = ensure("affirmByDate", {});
    var wrap = $("history-list");
    wrap.innerHTML = "";
    var keys = Object.keys(byDate).sort().reverse();
    if (!keys.length) {
      wrap.innerHTML = '<p class="note">No earlier days yet. Come back tomorrow.</p>';
      return;
    }
    keys.forEach(function (k) {
      var a = lib[byDate[k]];
      if (!a) return;
      var item = document.createElement("div");
      item.className = "hist-item";
      var d = document.createElement("span");
      d.className = "hist-date";
      d.textContent = prettyDate(k);
      var tx = document.createElement("span");
      tx.className = "hist-text";
      tx.textContent = a.text;
      item.appendChild(d);
      item.appendChild(tx);
      wrap.appendChild(item);
    });
  }

  // ---- sheets -------------------------------------------------------------
  function openSheet(id) {
    var s = $(id);
    if (!s) return;
    s.hidden = false;
    requestAnimationFrame(function () { s.classList.add("open"); });
  }
  function closeSheet(id) {
    var s = $(id);
    if (!s) return;
    s.classList.remove("open");
    setTimeout(function () { s.hidden = true; }, 220);
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { legacyCopy(text); });
    } else {
      legacyCopy(text);
    }
  }
  function legacyCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }
  function flash(btn, msg) {
    var original = btn.textContent;
    btn.textContent = msg;
    setTimeout(function () { btn.textContent = original; }, 1100);
  }

  // ---- install ------------------------------------------------------------
  var deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var native = $("install-native");
    if (native) native.hidden = false;
  });

  // ---- wiring -------------------------------------------------------------
  function init() {
    $("date-line").textContent = prettyDate(todayKey());

    var menu = $("menu");
    if (menu) {
      menu.addEventListener("click", function (e) {
        var b = e.target.closest("[data-view]");
        if (b) showView(b.getAttribute("data-view"));
      });
    }

    $("btn-copy").addEventListener("click", function () {
      if (currentAffirm) { copyText(currentAffirm); flash(this, "Copied"); }
    });
    $("btn-another").addEventListener("click", function () { renderAffirm(true); });
    $("btn-history").addEventListener("click", function () { renderHistory(); openSheet("sheet-history"); });
    $("btn-install").addEventListener("click", function () {
      if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; }
      else { openSheet("sheet-install"); }
    });

    var gs = $("btn-grateful-shuffle");
    if (gs) gs.addEventListener("click", function () { renderGrateful(true); });
    var ta = $("btn-today-another");
    if (ta) ta.addEventListener("click", function () { renderToday(true); });

    var installNative = $("install-native");
    if (installNative) installNative.addEventListener("click", function () {
      if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; closeSheet("sheet-install"); }
    });

    document.addEventListener("click", function (e) {
      var close = e.target.closest("[data-close]");
      if (close) closeSheet(close.getAttribute("data-close"));
      var openP = e.target.closest("[data-open-private]");
      if (openP) { fillPrivateStatus(); openSheet("sheet-private"); }
    });

    // private list controls
    var fileInput = $("private-file");
    if (fileInput) fileInput.addEventListener("change", function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () { $("private-text").value = reader.result; };
      reader.readAsText(f);
    });
    var saveBtn = $("private-save");
    if (saveBtn) saveBtn.addEventListener("click", function () {
      var parsed = parsePersonal($("private-text").value);
      if (!parsed.grateful.length && !parsed.today.length) {
        $("private-status").textContent = "Could not find any lines. Use headings like \u201cGrateful for\u201d and \u201cMake today great\u201d.";
        return;
      }
      savePersonal(parsed);
      renderGrateful(true);
      renderToday(true);
      fillPrivateStatus();
      $("private-status").textContent = "Saved on this device: " +
        parsed.grateful.length + " grateful, " + parsed.today.length + " today.";
    });
    var clearBtn = $("private-clear");
    if (clearBtn) clearBtn.addEventListener("click", function () {
      clearPersonal();
      $("private-text").value = "";
      renderGrateful(false);
      renderToday(false);
      fillPrivateStatus();
      $("private-status").textContent = "Removed from this device.";
    });

    // affirmations may already be loaded, or arrive via event
    if (window.AFFIRMATION_LIBRARY && window.AFFIRMATION_LIBRARY.length) renderAffirm(false);
    window.addEventListener("library-ready", function () { renderAffirm(false); });

    renderGrateful(false);
    renderToday(false);
    showView("grateful");
  }

  function fillPrivateStatus() {
    var p = state.personal || { grateful: [], today: [] };
    var have = (p.grateful && p.grateful.length) || (p.today && p.today.length);
    var el = $("private-current");
    if (el) {
      el.textContent = have
        ? "On this device now: " + (p.grateful ? p.grateful.length : 0) + " grateful, " + (p.today ? p.today.length : 0) + " today."
        : "Nothing loaded yet.";
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    });
  }
})();

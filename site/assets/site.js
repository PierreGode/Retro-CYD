/* RetroCYD website — shared script.
   Plain ES2017, no dependencies. Every feature checks that its elements exist,
   so the same file is safe on every page. Nothing here throws if firmware files
   (builds.json / manifests / .bin) are missing — the UI just says so. */
(function () {
  "use strict";

  var FW_BASE = "firmware/"; // relative to the site root (docs/)

  document.documentElement.classList.remove("no-js");
  document.documentElement.classList.add("js");

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function setText(el, text) { if (el) el.textContent = text; }

  /* ------------------------------------------------------------------ nav */
  function initNav() {
    var toggle = $(".nav-toggle");
    var nav = $(".site-nav");
    if (!toggle || !nav) return;
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    nav.addEventListener("click", function (e) {
      if (e.target && e.target.closest && e.target.closest("a")) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
    });
  }

  /* --------------------------------------------------------- copy buttons */
  function initCopy() {
    $all("pre[data-copy]").forEach(function (pre) {
      if (!pre.parentNode) return;
      var wrap = document.createElement("div");
      wrap.className = "code-wrap";
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "copy-btn";
      btn.textContent = "COPY";
      btn.setAttribute("aria-label", "Copy code to clipboard");
      wrap.appendChild(btn);
      btn.addEventListener("click", function () {
        var text = pre.getAttribute("data-copy");
        if (!text) {
          var clone = pre.cloneNode(true);
          $all(".p, .c", clone).forEach(function (n) { n.parentNode.removeChild(n); });
          text = clone.textContent.replace(/^\s+|\s+$/g, "");
        }
        var done = function (ok) {
          btn.textContent = ok ? "COPIED" : "PRESS CTRL+C";
          setTimeout(function () { btn.textContent = "COPY"; }, 1600);
        };
        try {
          if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(text).then(function () { done(true); }, function () { done(false); });
          } else {
            done(false);
          }
        } catch (err) { done(false); }
      });
    });
  }

  /* --------------------------------------------------- guide: scroll spy */
  function initToc() {
    var links = $all(".toc a[href^='#']");
    if (!links.length || !("IntersectionObserver" in window)) return;
    var map = {};
    links.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var sections = Object.keys(map).map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var visible = {};
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { visible[en.target.id] = en.isIntersecting; });
      var current = null;
      for (var i = 0; i < sections.length; i++) {
        if (visible[sections[i].id]) { current = sections[i].id; break; }
      }
      if (!current) return;
      links.forEach(function (a) { a.classList.remove("active"); a.removeAttribute("aria-current"); });
      map[current].classList.add("active");
      map[current].setAttribute("aria-current", "location");
    }, { rootMargin: "-80px 0px -55% 0px", threshold: 0 });
    sections.forEach(function (s) { io.observe(s); });
  }

  /* ------------------------------------------------ games: system filter */
  function initFilter() {
    var chips = $all(".chip[data-filter]");
    var cards = $all(".source[data-systems]");
    if (!chips.length || !cards.length) return;
    var status = $("#filter-status");
    function apply(sys) {
      var shown = 0;
      cards.forEach(function (c) {
        var list = (c.getAttribute("data-systems") || "").split(/\s+/);
        var ok = sys === "all" || list.indexOf(sys) !== -1;
        c.classList.toggle("is-hidden", !ok);
        if (ok) shown++;
      });
      chips.forEach(function (ch) { ch.setAttribute("aria-pressed", ch.getAttribute("data-filter") === sys ? "true" : "false"); });
      setText(status, "Showing " + shown + " of " + cards.length + " sources.");
    }
    chips.forEach(function (ch) {
      ch.addEventListener("click", function () { apply(ch.getAttribute("data-filter")); });
    });
    var wrap = $(".filters");
    if (wrap) wrap.hidden = false;
  }

  /* ============================================================ flasher */
  var BOARD_DEFAULTS = {
    cyd40: { manifest: "cyd40/manifest.json", status: "primary" }
  };

  // Only allow plain relative paths inside firmware/ (no schemes, no "..").
  function safeRel(p) {
    if (typeof p !== "string") return null;
    p = p.replace(/^\.\//, "");
    if (!/^[A-Za-z0-9._\-\/]+$/.test(p) || p.indexOf("..") !== -1 || p.charAt(0) === "/") return null;
    return p;
  }

  function fetchJSON(url) {
    return fetch(url, { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function headOK(url) {
    return fetch(url, { method: "HEAD", cache: "no-cache" }).then(function (r) { return r.ok; }, function () { return false; });
  }

  function fmtDate(s) {
    if (!s) return "—";
    var d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    try {
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }

  function initFlasher() {
    var root = $("#flasher");
    if (!root) return;

    var radios = $all("input[name='board']", root);
    var espBtn = $("#install-btn", root);
    var placeholder = $("#install-placeholder", root);
    var statusEl = $("#install-status", root);
    var dlRow = $("#dl-row", root);
    var dlLink = $("#dl-bin", root);
    var manifestLink = $("#dl-manifest", root);
    var led = $("#fw-led", root);
    var supportBox = $("#serial-support");
    var vEl = $("#fw-version", root), dEl = $("#fw-date", root), cEl = $("#fw-commit", root);

    var hasSerial = typeof navigator !== "undefined" && "serial" in navigator;
    var secure = !!window.isSecureContext;
    var canFlash = hasSerial && secure;
    var isMobile = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(navigator.userAgent || "");
    var componentReady = false;
    var componentFailed = false;

    // ---- browser support notice
    if (supportBox) {
      if (!hasSerial) {
        supportBox.hidden = false;
        var msg = $("#serial-msg", supportBox);
        if (msg) {
          msg.textContent = isMobile
            ? "You're on a phone or tablet. Mobile browsers can't access USB serial ports, so flashing needs a computer. Open this page in desktop Chrome, Edge or Opera — everything else on this site works fine here."
            : "This browser doesn't support Web Serial, which the flasher needs to talk to the board. Use desktop Google Chrome, Microsoft Edge or Opera (Windows, macOS, Linux or ChromeOS). Firefox and Safari don't support it.";
        }
      } else if (!secure) {
        supportBox.hidden = false;
        setText($("#serial-msg", supportBox), "Web Serial only works on HTTPS pages (or localhost). Open the official site at https://pierregode.github.io/Retro-CYD/ to flash.");
      }
    }

    // ---- wait for the ESP Web Tools custom element (loaded from unpkg)
    if (window.customElements && customElements.whenDefined) {
      var timer = setTimeout(function () {
        if (!componentReady) { componentFailed = true; render(); }
      }, 12000);
      customElements.whenDefined("esp-web-install-button").then(function () {
        componentReady = true; componentFailed = false; clearTimeout(timer); render();
      });
    } else {
      componentFailed = true;
    }

    // ---- data
    var builds = null;            // parsed builds.json or null
    var buildsState = "loading";  // loading | ok | missing
    var boardState = {};          // id -> {state, manifestUrl, binUrl, version}

    function boardEntry(id) {
      if (builds && Array.isArray(builds.boards)) {
        for (var i = 0; i < builds.boards.length; i++) {
          if (builds.boards[i] && builds.boards[i].id === id) return builds.boards[i];
        }
      }
      return null;
    }

    function checkBoard(id) {
      var entry = boardEntry(id) || {};
      var def = BOARD_DEFAULTS[id] || { manifest: id + "/manifest.json" };
      var rel = safeRel(entry.manifest) || def.manifest;
      var manifestUrl = FW_BASE + rel;
      var binRel = safeRel(entry.bin);
      boardState[id] = { state: "checking", manifestUrl: manifestUrl, binUrl: binRel ? FW_BASE + binRel : null, version: null };
      updateOption(id);
      if (id === selected()) render();

      return fetchJSON(manifestUrl).then(function (m) {
        if (!m || !Array.isArray(m.builds) || !m.builds.length) throw new Error("manifest has no builds");
        var part = m.builds[0] && m.builds[0].parts && m.builds[0].parts[0];
        if (!part || typeof part.path !== "string") throw new Error("manifest has no parts");
        var base = new URL(manifestUrl, location.href);
        var partUrl = new URL(part.path, base);
        boardState[id].version = typeof m.version === "string" ? m.version : null;
        if (!boardState[id].binUrl && partUrl.origin === location.origin) boardState[id].binUrl = partUrl.href;
        // Cross-origin images (e.g. a release asset) can't be HEAD-checked without CORS — trust the manifest.
        if (partUrl.origin !== location.origin) { boardState[id].state = "ok"; return; }
        return headOK(partUrl.href).then(function (ok) {
          boardState[id].state = ok ? "ok" : "none";
        });
      }).catch(function () {
        boardState[id].state = "none";
      }).then(function () {
        updateOption(id);
        if (id === selected()) render();
      });
    }

    function selected() {
      for (var i = 0; i < radios.length; i++) if (radios[i].checked) return radios[i].value;
      return radios.length ? radios[0].value : "cyd40";
    }

    function updateOption(id) {
      var el = $("[data-avail='" + id + "']", root);
      if (!el) return;
      var st = boardState[id];
      if (!st || st.state === "checking") { el.textContent = "checking…"; el.setAttribute("data-state", "checking"); return; }
      if (st.state === "ok") {
        el.textContent = (st.version || (builds && builds.version) || "build") + " ready";
        el.setAttribute("data-state", "ok");
      } else {
        el.textContent = "not published yet";
        el.setAttribute("data-state", "none");
      }
    }

    function renderBuildInfo() {
      if (buildsState === "ok" && builds) {
        setText(vEl, (builds.version || "—") + (builds.build ? " · build " + builds.build : ""));
        setText(dEl, fmtDate(builds.date));
        if (cEl) {
          cEl.textContent = "";
          var sha = typeof builds.commit === "string" ? builds.commit : "";
          cEl.textContent = /^[0-9a-f]{7,40}$/i.test(sha) ? sha.slice(0, 7) : (sha || "—");
        }
      } else if (buildsState === "missing") {
        setText(vEl, "none yet"); setText(dEl, "—"); setText(cEl, "—");
      }
    }

    function render() {
      var id = selected();
      var st = boardState[id] || { state: "checking" };
      var ready = st.state === "ok";

      // LED in the panel header
      if (led) {
        if (st.state === "checking") { led.setAttribute("data-state", ""); led.textContent = "Checking firmware…"; }
        else if (ready) { led.setAttribute("data-state", "ok"); led.textContent = "Firmware online"; }
        else { led.setAttribute("data-state", "warn"); led.textContent = "No build yet"; }
      }

      // Download links
      if (dlRow) {
        if (ready && st.binUrl) {
          dlRow.hidden = false;
          if (dlLink) { dlLink.href = st.binUrl; dlLink.setAttribute("download", ""); }
          if (manifestLink) manifestLink.href = st.manifestUrl;
        } else {
          dlRow.hidden = true;
        }
      }

      // Install button vs placeholder
      var showEsp = ready && canFlash && componentReady && !componentFailed;
      if (espBtn) {
        // Absolute URL + build number: ESP Web Tools fetches the manifest with the
        // normal HTTP cache, so a stale copy must never be reused.
        if (ready) {
          var mUrl = new URL(st.manifestUrl, location.href);
          mUrl.searchParams.set("v", String((builds && builds.build) || (builds && builds.date) || Date.now()));
          espBtn.setAttribute("manifest", mUrl.href);
        }
        else espBtn.removeAttribute("manifest");
        espBtn.hidden = !showEsp;
      }
      if (placeholder) {
        placeholder.hidden = showEsp;
        var label;
        if (st.state === "checking") label = "Checking firmware…";
        else if (!ready) label = "No firmware published yet";
        else if (!hasSerial) label = "Needs desktop Chrome / Edge";
        else if (!secure) label = "Needs HTTPS";
        else if (componentFailed) label = "Flasher failed to load";
        else label = "Loading flasher…";
        placeholder.textContent = label;
      }

      // Status line
      if (statusEl) {
        statusEl.textContent = "";
        var s = document.createElement("span");
        if (st.state === "checking") {
          s.textContent = "Looking for the latest published build…";
        } else if (!ready) {
          s.innerHTML = "<strong>No firmware published yet for this board.</strong> The site is live but CI hasn't published a build here yet. Please check back in a few minutes.";
        } else if (!hasSerial) {
          s.textContent = "Firmware is ready, but this browser can't flash. Open the page in desktop Chrome, Edge or Opera — or download the .bin below and use esptool.";
        } else if (componentFailed) {
          s.innerHTML = "The ESP Web Tools component couldn't be loaded from unpkg.com (an ad-blocker or firewall may be blocking it). Reload the page, or download the .bin below and <a href=\"guide.html#manual-flash\">flash it with esptool</a>.";
        } else if (!componentReady) {
          s.textContent = "Loading the flasher component…";
        } else {
          s.innerHTML = "<strong>Ready.</strong> Plug the board in with a USB-C <em>data</em> cable, click the button and pick the serial port (CH340 / USB-SERIAL). On a first install, choose <em>Erase device</em> when asked.";
        }
        statusEl.appendChild(s);
      }
    }

    radios.forEach(function (r) {
      r.addEventListener("change", function () {
        render();
        try { history.replaceState(null, "", "?board=" + encodeURIComponent(r.value) + location.hash); } catch (e) { /* ignore */ }
      });
    });

    // preselect ?board=<id>
    try {
      var want = new URLSearchParams(location.search).get("board");
      radios.forEach(function (r) { if (r.value === want) r.checked = true; });
    } catch (e) { /* ignore */ }

    render();

    fetchJSON(FW_BASE + "builds.json").then(function (b) {
      if (b && typeof b === "object") { builds = b; buildsState = "ok"; }
      else buildsState = "missing";
    }).catch(function () {
      buildsState = "missing";
    }).then(function () {
      renderBuildInfo();
      return Promise.all(radios.map(function (r) { return checkBoard(r.value); }));
    }).catch(function () { /* never throw out of here */ });
  }

  /* ============================================================ games catalog */
  // Lists the free games the firmware downloads (catalog/catalog.tsv, built by
  // tools/make_catalog.py). The text comes from third-party metadata, so it is
  // only ever inserted with textContent.
  function initCatalog() {
    var root = $("#catalog");
    if (!root || !window.fetch) return;
    var summary = $("#cat-summary", root), body = $("#cat-body", root), search = $("#cat-search", root);
    var filters = $(".cat-filters", root), wrap = $(".cat-wrap", root), status = $("#cat-status", root);
    var chips = $all(".chip[data-cat]", root);
    var NAMES = { nes: "NES", gb: "Game Boy", gbc: "Game Boy Color", chip8: "CHIP-8" };
    var games = [], sys = "all", timer = null;

    function render() {
      var q = (search.value || "").trim().toLowerCase();
      var frag = document.createDocumentFragment(), shown = 0;
      games.forEach(function (g) {
        if (sys !== "all" && g.sys !== sys) return;
        if (q && g.title.toLowerCase().indexOf(q) === -1 && g.author.toLowerCase().indexOf(q) === -1) return;
        shown++;
        var tr = document.createElement("tr");
        var th = document.createElement("th");
        th.scope = "row";
        if (/^https:\/\//.test(g.page)) {
          var a = document.createElement("a");
          a.href = g.page;
          a.rel = "noopener";
          a.textContent = g.title;
          th.appendChild(a);
        } else {
          th.textContent = g.title;
        }
        tr.appendChild(th);
        [NAMES[g.sys] || g.sys, g.author, g.licence, Math.max(1, Math.round(g.size / 1024)) + " KB"].forEach(function (t) {
          var td = document.createElement("td");
          td.textContent = t;
          tr.appendChild(td);
        });
        frag.appendChild(tr);
      });
      body.textContent = "";
      body.appendChild(frag);
      setText(status, "Showing " + shown + " of " + games.length + " games.");
    }

    fetch(root.getAttribute("data-src"), { cache: "no-cache" }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.text();
    }).then(function (text) {
      var lines = text.split("\n");
      var head = (lines[0] || "").split("\t");
      if (head[0] !== "#RETROCYD-CATALOG") throw new Error("not a catalog");
      var count = { nes: 0, gb: 0, gbc: 0, chip8: 0 }, bytes = 0;
      lines.slice(1).forEach(function (l) {
        var f = l.split("\t");
        if (f.length < 9 || !NAMES[f[0]]) return;
        var g = { sys: f[0], size: parseInt(f[2], 10) || 0, title: f[5], author: f[6], licence: f[7], page: f[8] };
        games.push(g);
        count[g.sys]++;
        bytes += g.size;
      });
      games.sort(function (a, b) { return a.title.localeCompare(b.title); });
      setText(summary, games.length + " free games: " + count.nes + " NES, " + count.gb + " Game Boy, " +
        count.gbc + " Game Boy Color, " + count.chip8 + " CHIP-8 (" + (bytes / 1048576).toFixed(0) +
        " MB). Updated " + fmtDate(head[2]) + ".");
      chips.forEach(function (ch) {
        ch.addEventListener("click", function () {
          sys = ch.getAttribute("data-cat");
          chips.forEach(function (c) { c.setAttribute("aria-pressed", c === ch ? "true" : "false"); });
          render();
        });
      });
      search.addEventListener("input", function () {
        clearTimeout(timer);
        timer = setTimeout(render, 120);
      });
      filters.hidden = false;
      wrap.hidden = false;
      render();
    }).catch(function () {
      setText(summary, "The game list is published together with each firmware build. It isn't available right now; please check back later.");
    });
  }

  function start() {
    var steps = [initNav, initCopy, initToc, initFilter, initFlasher, initCatalog];
    steps.forEach(function (fn) {
      try { fn(); } catch (e) { if (window.console) console.error("[retrocyd]", fn.name, e); }
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();

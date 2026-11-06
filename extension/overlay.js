/*
  The checklist shown on Patreon's page after a fill: what went in, what
  did not, the notes to act on, and a Copy button for each alt text.
  It sits in its own shadow root so the page's styles do not reach it.
*/
(function () {
  "use strict";
  var D = (globalThis.PatronDesk = globalThis.PatronDesk || {});
  var HOST_ID = "patron-desk-overlay";

  var MARK = { ok: "OK", look: "LOOK", miss: "MISSED", skip: "NONE" };

  var STYLE = [
    ":host { all: initial; }",
    ".box { position: fixed; top: 16px; right: 16px; width: 380px; max-width: calc(100vw - 32px);",
    "  max-height: calc(100vh - 32px); overflow: auto; z-index: 2147483647; box-sizing: border-box;",
    "  background: #fffdf8; color: #222; border: 2px solid #444; border-radius: 10px; padding: 14px 16px;",
    "  font: 14px/1.4 system-ui, sans-serif; box-shadow: 0 6px 24px rgba(0,0,0,.25); }",
    "h2 { font-size: 16px; margin: 0 0 4px; }",
    "h3 { font-size: 14px; margin: 12px 0 4px; }",
    ".sub { margin: 0 0 8px; color: #555; }",
    "ul { list-style: none; margin: 0; padding: 0; }",
    "li { margin: 0 0 6px; }",
    ".tag { display: inline-block; min-width: 54px; font-weight: 700; font-size: 12px; }",
    ".ok .tag { color: #1d6b2f; } .look .tag { color: #8a5a00; } .miss .tag { color: #b00020; } .skip .tag { color: #666; }",
    ".part { font-weight: 600; }",
    ".alt { display: flex; gap: 8px; align-items: flex-start; margin: 0 0 6px; }",
    ".alt span { flex: 1; font-size: 12px; color: #444; }",
    "button { font: inherit; padding: 4px 10px; border: 1px solid #444; border-radius: 6px; background: #fff; cursor: pointer; }",
    ".foot { margin-top: 12px; padding-top: 8px; border-top: 1px solid #ccc; font-weight: 600; }",
    ".close { position: absolute; top: 8px; right: 8px; }",
    "h2 { margin-right: 110px; }",
    ".copybox.failed { width: auto; padding: 0 8px; color: #b00020; }",
    ".copybox { position: absolute; top: 8px; right: 74px; width: 32px; height: 32px; padding: 0;",
    "  display: inline-flex; align-items: center; justify-content: center; border-radius: 8px; }",
    "@media (prefers-color-scheme: dark) {",
    "  .box { background: #1e1e1e; color: #eee; border-color: #aaa; }",
    "  .sub, .alt span { color: #bbb; } button { background: #333; color: #eee; border-color: #aaa; }",
    "  .ok .tag { color: #6fd08a; } .look .tag { color: #f0c060; } .miss .tag { color: #ff7a8a; }",
    "}"
  ].join("\n");

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var SVG = "http://www.w3.org/2000/svg";

  function icon(kind) {
    var svg = document.createElementNS(SVG, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "18");
    svg.setAttribute("height", "18");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    var parts = kind === "done"
      ? [["path", { d: "M5 12.5l4.5 4.5L19 7.5" }]]
      : [["rect", { x: "9", y: "9", width: "11", height: "11", rx: "2" }],
         ["path", { d: "M15 5.5V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h.5" }]];
    parts.forEach(function (p) {
      var e = document.createElementNS(SVG, p[0]);
      Object.keys(p[1]).forEach(function (k) { e.setAttribute(k, p[1][k]); });
      svg.appendChild(e);
    });
    return svg;
  }

  // Copies text. First the older way, which a click on any page may use
  // (some pages refuse the newer way), then the newer way. Resolves when
  // copied, rejects when both refused.
  D.copyText = function (text) {
    var ok = false;
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.setAttribute("data-patron-desk-copy", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      (document.body || document.documentElement).appendChild(ta);
      ta.focus();
      ta.select();
      ok = document.execCommand("copy");
      ta.remove();
    } catch (e) {
      ok = false;
    }
    if (ok) return Promise.resolve();
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return Promise.reject(new Error("copy refused"));
  };

  // A small square button with the copy mark. getText gives what to copy.
  D.copyBox = function (getText, label) {
    label = label || "Copy results";
    var b = document.createElement("button");
    b.className = "copybox";
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.title = label;
    b.appendChild(icon("copy"));
    b.addEventListener("click", function () {
      D.copyText(getText()).then(function () {
        b.replaceChildren(icon("done"));
        b.setAttribute("aria-label", "Copied");
        b.title = "Copied";
        setTimeout(function () {
          b.replaceChildren(icon("copy"));
          b.setAttribute("aria-label", label);
          b.title = label;
        }, 1500);
      }, function () {
        // Said on the box itself, so it is seen.
        b.replaceChildren(document.createTextNode("Copy failed"));
        b.classList.add("failed");
        b.title = "Copy failed: select the text and copy it by hand";
        b.setAttribute("aria-label", "Copy failed");
      });
    });
    return b;
  };

  // The results as plain text: the post, each line, the date and the
  // version. Nothing from the page itself.
  D.resultsText = function (report) {
    var d = new Date();
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var version = "";
    // The version of the files that ran here (the filler's, on Patreon's page).
    version = D.VERSION || "";
    if (!version) { try { version = chrome.runtime.getManifest().version; } catch (e) { version = "test"; } }
    var lines = ["Patron desk results, " + d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear() + ", version " + version,
      "Post: " + (report.title || "")];
    if (report.said) lines.push(report.said);
    (report.items || []).forEach(function (it) {
      lines.push((MARK[it.status] || it.status) + "  " + it.part + ": " + it.say);
    });
    if (report.batchNote) lines.push(report.batchNote);
    return lines.join("\n");
  };

  D.showOverlay = function (report) {
    var old = document.getElementById(HOST_ID);
    if (old) old.remove();
    var host = document.createElement("div");
    host.id = HOST_ID;
    var root = host.attachShadow({ mode: "open" });
    var style = document.createElement("style");
    style.textContent = STYLE;
    root.appendChild(style);

    var box = el("div", "box");
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Patron desk checklist");
    var close = el("button", "close", "Close");
    close.addEventListener("click", function () { host.remove(); });
    box.appendChild(close);
    box.appendChild(D.copyBox(function () { return D.resultsText(report); }));

    box.appendChild(el("h2", null, "Patron desk: what was filled"));
    box.appendChild(el("p", "sub", report.title || ""));

    var counts = { ok: 0, look: 0, miss: 0, skip: 0 };
    var list = el("ul");
    report.items.forEach(function (it) {
      counts[it.status] = (counts[it.status] || 0) + 1;
      var li = el("li", it.status);
      li.appendChild(el("span", "tag", MARK[it.status] || it.status));
      li.appendChild(el("span", "part", it.part + ": "));
      li.appendChild(el("span", null, it.say));
      list.appendChild(li);
    });
    var sum = counts.miss
      ? counts.miss + " part" + (counts.miss === 1 ? " was" : "s were") + " missed. Do those by hand."
      : "Nothing was missed.";
    box.appendChild(el("p", "sub", sum));
    box.appendChild(list);

    if (report.notes && report.notes.length) {
      box.appendChild(el("h3", null, "Before you publish"));
      var nl = el("ul");
      report.notes.forEach(function (n) { nl.appendChild(el("li", null, n)); });
      box.appendChild(nl);
    }

    var alts = [];
    (report.alts || []).forEach(function (a) {
      if (a.alt) alts.push({ label: a.name + ", alt text", text: a.alt });
      if (a.caption) alts.push({ label: a.name + ", caption", text: a.caption });
    });
    if (alts.length) {
      box.appendChild(el("h3", null, "Picture descriptions, to copy if needed"));
      alts.forEach(function (a) {
        var row = el("div", "alt");
        row.appendChild(el("span", null, a.label + ": " + a.text));
        var b = el("button", null, "Copy");
        b.addEventListener("click", function () {
          D.copyText(a.text).then(function () {
            b.textContent = "Copied";
          }, function () {
            b.textContent = "Copy failed";
          });
        });
        row.appendChild(b);
        box.appendChild(row);
      });
    }

    box.appendChild(el("p", "foot", report.batchNote ||
      "Nothing was published. Read the post through and preview it, then press Publish or Schedule yourself."));
    root.appendChild(box);
    document.documentElement.appendChild(host);
    return host;
  };
})();

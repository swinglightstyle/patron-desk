/*
  The desk: choose the packages folder once, see the queue, and send a
  package to the Patreon tab to be filled. In a batch Beth approved with
  go-live, it fills and schedules each post in turn. It writes only one
  thing in the folder: lines added to go-live-log.txt.
*/
(function () {
  "use strict";
  var D = globalThis.PatronDesk;
  function accessSays(a) {
    if (!a || !a.type) return "who sees it is not set";
    if (a.type === "free") return "Free access";
    var t = a.tiers === "all" || !a.tiers ? "all tiers" : "tiers: " + a.tiers.join(", ");
    return "Paid access, " + t + (a.sell ? ", sold to others" : "");
  }
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  var MARK = { ok: "OK", look: "LOOK", miss: "MISSED", skip: "NONE" };

  var folder = null;
  var packages = [];

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function sayDate(iso) {
    var p = String(iso).slice(0, 10).split("-");
    if (p.length !== 3) return String(iso);
    return parseInt(p[2], 10) + " " + MONTHS[parseInt(p[1], 10) - 1] + " " + p[0];
  }

  function today() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + "-" + (m < 10 ? "0" : "") + m + "-" + (day < 10 ? "0" : "") + day;
  }

  // The same checks as desk_package.py, kept short.
  function check(data) {
    var problems = [];
    var warnings = [];
    if (!data || typeof data !== "object") return { problems: ["post.json is not an object"], warnings: [] };
    if (data.format !== "patron-desk-post-2") problems.push("it is an older package (set it aside and convert again)");
    if (typeof data.title !== "string" || !data.title.trim()) problems.push("the title is empty");
    if (typeof data.body_html !== "string" || !data.body_html.trim()) problems.push("the body is empty");
    var a = data.access;
    if (!a || (a.type !== "free" && a.type !== "paid")) problems.push("who sees it is not set");
    else if (a.type === "paid" && a.tiers !== "all" && !(Array.isArray(a.tiers) && a.tiers.length)) problems.push("no tiers are named");
    (data.images || []).forEach(function (img, i) {
      if (!img || typeof img.file !== "string") { problems.push("picture " + (i + 1) + " has no file"); return; }
      if (img.file.split("/").indexOf("..") !== -1 || /^[\/\\]/.test(img.file)) problems.push("picture " + (i + 1) + " is outside the package");
      if (!img.alt || !String(img.alt).trim()) warnings.push("picture " + (i + 1) + " has no description");
    });
    if (data.schedule && !/^\d{4}-\d{2}-\d{2}$/.test(String(data.schedule.date || ""))) problems.push("the schedule date is not like 2026-11-10");
    return { problems: problems, warnings: warnings };
  }

  // What the page is sent for one post.
  function settingsOf(name, data, imgs) {
    return {
      name: name, title: data.title, body_html: data.body_html, access: data.access,
      image_text: data.image_text || "alt", collection: data.collection || null,
      tags: data.tags || [], comments: data.comments || null,
      schedule: data.schedule || null, notes: data.notes || [], images: imgs
    };
  }

  async function readFileAt(dir, rel) {
    var parts = rel.split("/").filter(Boolean);
    for (var i = 0; i < parts.length - 1; i++) dir = await dir.getDirectoryHandle(parts[i]);
    var fh = await dir.getFileHandle(parts[parts.length - 1]);
    return fh.getFile();
  }

  function asDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onload = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
      r.readAsDataURL(file);
    });
  }

  var TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };

  async function loadPackages() {
    packages = [];
    for await (var entry of folder.entries()) {
      var name = entry[0];
      var handle = entry[1];
      if (handle.kind !== "directory") continue;
      var data = null;
      var c;
      try {
        var f = await readFileAt(handle, "post.json");
        data = JSON.parse(await f.text());
        c = check(data);
      } catch (e) {
        if (e && e.name === "NotFoundError") continue;
        c = { problems: ["post.json could not be read: " + (e && e.message ? e.message : e)], warnings: [] };
      }
      if (data && c.problems.length === 0) {
        for (var i = 0; i < (data.images || []).length; i++) {
          try { await readFileAt(handle, data.images[i].file); }
          catch (e2) { c.problems.push("picture " + (i + 1) + " (" + data.images[i].file + ") is missing"); }
        }
      }
      var filled = await D.store.get("filled:" + name);
      packages.push({ name: name, handle: handle, data: data, check: c, filled: filled || null });
    }
    packages.sort(function (a, b) {
      var da = a.data && a.data.schedule ? a.data.schedule.date : "9999";
      var db = b.data && b.data.schedule ? b.data.schedule.date : "9999";
      return da < db ? -1 : da > db ? 1 : a.name < b.name ? -1 : 1;
    });
  }

  function drawPost(p) {
    var box = el("div", "post");
    box.appendChild(el("h3", null, p.data && p.data.title ? p.data.title : p.name));
    var facts = [p.name];
    if (p.data) {
      facts.push(accessSays(p.data.access));
      var s = p.data.schedule;
      facts.push(s && s.date ? "goes out " + sayDate(s.date) + (s.time ? " at " + s.time : "") : "no date: goes out when you press Publish");
      facts.push((p.data.images || []).length + " picture" + ((p.data.images || []).length === 1 ? "" : "s"));
    }
    box.appendChild(el("p", "facts", facts.join(". ") + "."));
    var ul = el("ul");
    p.check.problems.forEach(function (x) { ul.appendChild(el("li", "problem", "Cannot fill: " + x + ".")); });
    p.check.warnings.forEach(function (x) { ul.appendChild(el("li", "warning", x + ".")); });
    if (p.data) (p.data.notes || []).forEach(function (x) { ul.appendChild(el("li", null, x)); });
    if (ul.children.length) box.appendChild(ul);
    var row = el("div", "row");
    var s0 = (p.data && p.data.schedule) || {};
    var dateBox = el("input");
    dateBox.type = "date";
    dateBox.value = s0.date || "";
    dateBox.min = today();
    dateBox.setAttribute("aria-label", "Publish date");
    var timeBox = el("input");
    timeBox.type = "time";
    timeBox.value = s0.time || "";
    timeBox.setAttribute("aria-label", "Publish time");
    p.when = function () { return { date: dateBox.value, time: timeBox.value }; };
    var b = el("button", null, p.filled ? "Fill again" : "Fill");
    var sb = el("button", null, "Fill and schedule");
    var blocked = p.check.problems.length > 0;
    function ready() { sb.disabled = blocked || !(dateBox.value && timeBox.value); }
    dateBox.addEventListener("input", ready);
    timeBox.addEventListener("input", ready);
    b.disabled = blocked;
    ready();
    b.addEventListener("click", function () { fill(p, b, false); });
    sb.addEventListener("click", function () { fill(p, sb, true); });
    row.appendChild(dateBox);
    row.appendChild(timeBox);
    row.appendChild(b);
    row.appendChild(sb);
    if (p.filled) row.appendChild(el("span", "facts", (p.filled.scheduled ? "Scheduled on " : "Filled on ") + sayDate(p.filled.on) + "."));
    box.appendChild(row);
    return box;
  }

  function draw() {
    var q = $("queue");
    var d = $("done");
    q.textContent = "";
    d.textContent = "";
    packages.forEach(function (p) { (p.filled ? d : q).appendChild(drawPost(p)); });
    if (!q.children.length) q.appendChild(el("p", "quiet", "Nothing waiting."));
    if (!d.children.length) d.appendChild(el("p", "quiet", "Nothing yet."));
  }

  function showResult(title, items, extra, said) {
    var r = $("result");
    r.textContent = "";
    r.appendChild(el("p", null, title));
    if (said) r.appendChild(el("p", "ok", said));
    if (extra) r.appendChild(el("p", "miss", extra));
    (items || []).forEach(function (it) {
      var p = el("p", it.status);
      p.appendChild(el("span", "tag", MARK[it.status] || it.status));
      p.appendChild(document.createTextNode(it.part + ": " + it.say));
      r.appendChild(p);
    });
    // The results as plain text, to paste into a message.
    r.appendChild(D.copyBox(function () {
      return D.resultsText({ title: title, items: items || [], said: [said, extra].filter(Boolean).join(" ") });
    }));
  }

  // Where a tab has landed: "signin", "editor", or "" (not yet, or elsewhere).
  async function landing(tabId) {
    var t = await chrome.tabs.get(tabId);
    var url = t.url || t.pendingUrl || "";
    if (D.PAGE.signInUrl.test(url)) return { where: "signin", url: url };
    if (t.status === "complete" && D.PAGE.stillEditing.test(url)) return { where: "editor", url: url };
    return { where: "", url: url };
  }

  // Waits for a tab to land on the editor with its form shown, or on a
  // sign-in page. Returns { where: "editor" | "signin" | "elsewhere" | "noform", url }.
  async function waitForEditor(tabId) {
    var seen = { where: "", url: "" };
    await waitUntil(async function () {
      seen = await landing(tabId);
      return !!seen.where;
    }, 45000);
    if (seen.where === "signin") return seen;
    if (seen.where !== "editor") return { where: "elsewhere", url: seen.url };
    var ready = await waitUntil(async function () {
      await ensureFiller(tabId);
      var r = await chrome.tabs.sendMessage(tabId, { type: "patron-desk-ping" });
      return r && r.formReady;
    }, 30000);
    return ready ? seen : { where: "noform", url: seen.url };
  }

  function landingSays(seen) {
    if (seen.where === "signin") return "You are not signed in to Patreon in this browser. Sign in in the window that opened, then press Fill again.";
    if (seen.where === "noform") return "Patreon's post editor opened, but its form did not show. Look at the window that opened.";
    return "Patreon's new post page did not open: the window went to " + (seen.url || "a page that did not load") +
      ". If you are signed in, the new post address may have changed (newPostPage in selectors.js).";
  }

  // After Schedule was pressed: did it take? The page going out of the
  // editor says yes. If it stays, the Schedule button says: gone or
  // changed is yes; still "Schedule" is unconfirmed (never "stopped", so a
  // batch does not schedule the post twice).
  async function scheduleTook(tabId) {
    var moved = await waitUntil(async function () {
      var t = await chrome.tabs.get(tabId);
      return t.status === "complete" && !D.PAGE.stillEditing.test(t.url || "");
    }, 30000);
    var url = (await chrome.tabs.get(tabId)).url || "";
    if (moved) return { took: true, how: url };
    var words = "";
    try {
      var r = await chrome.tabs.sendMessage(tabId, { type: "patron-desk-schedule-state" });
      words = (r && r.button) || "";
    } catch (e) {
      return { took: false, how: "the page did not answer" };
    }
    if (!matchesAny(D.PAGE.scheduleButton.words, words)) {
      return { took: true, how: "the page stayed in the editor and its Schedule button " + (words ? "now says \"" + words + "\"" : "went away") };
    }
    return { took: false, how: "the page stayed in the editor and its Schedule button still says Schedule" };
  }

  function matchesAny(list, text) {
    return list.some(function (rx) { return rx.test(text); });
  }

  var UNCONFIRMED = "Schedule was pressed, but the desk could not see that it took. Look in Patreon's scheduled posts. " +
    "This post is left out of later batches, so it is not scheduled twice.";

  var RELOAD = "Press the round arrow on Patron desk in chrome://extensions, then press the button again.";

  // The filler on a page must be the same version as the desk.
  async function fillerVersion(tabId) {
    try {
      var r = await chrome.tabs.sendMessage(tabId, { type: "patron-desk-ping" });
      return (r && r.version) || "older than 0.6.1";
    } catch (e) {
      return "not there";
    }
  }

  function staleSays(v) {
    return "The part of the extension that runs on Patreon is version " + v + ", but the desk is " + D.VERSION +
      ". Nothing was filled. " + RELOAD;
  }

  // Opens Patreon's new post page in a new window, for one fill.
  async function openFreshPost() {
    var win = await chrome.windows.create({ url: D.PAGE.newPostPage, focused: true, type: "normal" });
    var tab = win && win.tabs && win.tabs[0];
    if (!tab) return { tab: null, seen: { where: "elsewhere", url: "" } };
    return { tab: tab, seen: await waitForEditor(tab.id) };
  }

  async function findPatreonTab() {
    var tabs = await chrome.tabs.query({ url: D.PAGE.tabUrls });
    if (!tabs.length) return { tab: null, why: "No Patreon tab is open. Open Patreon's new post page, signed in, then press Fill again." };
    var newPost = tabs.filter(function (t) { return D.PAGE.newPostUrl.test(t.url || ""); });
    var pool = newPost.length ? newPost : tabs;
    pool.sort(function (a, b) { return (b.lastAccessed || 0) - (a.lastAccessed || 0); });
    return { tab: pool[0], guessed: !newPost.length, many: pool.length > 1 };
  }

  async function ensureFiller(tabId) {
    try {
      await chrome.tabs.sendMessage(tabId, { type: "patron-desk-ping" });
    } catch (e) {
      // The tab was open before the extension was loaded. Load the filler into it.
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ["selectors.js", "filler.js", "overlay.js", "scheduler.js", "content.js"]
      });
    }
  }

  async function fill(p, button, andSchedule) {
    var when = p.when ? p.when() : {};
    var label = when.date ? sayDate(when.date) + (when.time ? " at " + when.time : "") : "";
    if (andSchedule) {
      var at = Date.parse(when.date + "T" + when.time + ":00");
      if (!(at - Date.now() >= D.SETTINGS.earliestMinutes * 60000)) {
        showResult(p.data.title, [], "That time is past, or less than " + D.SETTINGS.earliestMinutes +
          " minutes away. Choose a later time, then press Fill and schedule again. Nothing was opened.");
        return;
      }
      if (!folder || (await folder.requestPermission({ mode: "readwrite" })) !== "granted") {
        showResult(p.data.title, [], "The desk needs to write the go-live log in the packages folder. Allow it, then press Fill and schedule again.");
        return;
      }
      if (!window.confirm("Schedule \"" + p.data.title + "\" on Patreon for " + label + " (this computer's time)?\n\n" +
          "The desk fills a fresh post, checks every part, and presses Schedule only if all of it passed. " +
          "It never presses Publish. You can remove the post on Patreon before it goes out.")) {
        return;
      }
    }
    button.disabled = true;
    try {
      showResult(p.data.title, [], "", "Opening a new window on Patreon's new post page...");
      var opened = await openFreshPost();
      if (!opened.tab || opened.seen.where !== "editor") {
        showResult(p.data.title, [], landingSays(opened.seen));
        return;
      }
      var found = { tab: opened.tab };
      var fv = await fillerVersion(found.tab.id);
      if (fv !== D.VERSION) { showResult(p.data.title, [], staleSays(fv)); return; }
      var imgs = [];
      for (var i = 0; i < (p.data.images || []).length; i++) {
        var img = p.data.images[i];
        var file = await readFileAt(p.handle, img.file);
        var ext = img.file.split(".").pop().toLowerCase();
        imgs.push({
          name: file.name,
          type: file.type || TYPES[ext] || "application/octet-stream",
          dataUrl: await asDataUrl(file),
          alt: img.alt || "",
          caption: img.caption || "",
          at: img.at || "end",
          marker: img.marker || null
        });
      }
      var pkg = settingsOf(p.name, p.data, imgs);
      // The date and time in the desk's boxes, for this fill only. The package stays as it is.
      if (when.date) pkg.schedule = { date: when.date, time: when.time || null };
      await ensureFiller(found.tab.id);
      await chrome.tabs.update(found.tab.id, { active: true });
      await chrome.windows.update(found.tab.windowId, { focused: true });
      var answer = await chrome.tabs.sendMessage(found.tab.id,
        andSchedule ? { type: "patron-desk-fill", pkg: pkg, batch: "desk" } : { type: "patron-desk-fill", pkg: pkg });
      var warn = "";
      if (!answer || answer.error) {
        showResult(p.data.title, [], "The fill stopped: " + (answer ? answer.error : "no answer from the page") + ".");
        return;
      }
      var items = answer.report.items;
      var misses = items.filter(function (it) { return it.status === "miss"; }).length;
      var said = "Signed in. Filled a fresh post in a new window.";
      var scheduled = false;
      if (andSchedule) {
        var whenSaid = when.date + " " + when.time;
        if (!answer.verdict || !answer.verdict.pass) {
          var why = (answer.verdict ? answer.verdict.blocking : []).map(function (it) { return it.part; }).join(", ");
          warn = "Not every check passed (" + why + "), so Schedule was not pressed. The post is filled and waiting in the new window.";
          await appendLog([today(), p.name, p.data.title, whenSaid, "stopped", "Fill and schedule: not every check passed: " + why]);
        } else {
          var pressed;
          try {
            pressed = await chrome.tabs.sendMessage(found.tab.id, { type: "patron-desk-press-schedule", name: p.name, batch: "desk" });
          } catch (err) {
            pressed = { pressed: "unknown" };
          }
          if (!pressed || pressed.pressed === false) {
            warn = ((pressed && pressed.say) || "Schedule was not pressed.") + " The post is filled and waiting in the new window.";
            await appendLog([today(), p.name, p.data.title, whenSaid, "stopped", "Fill and schedule: " + warn]);
          } else {
            // The page saves drafts at /posts/<id>/edit by itself: it has gone out only when it leaves the editor.
            var took = await scheduleTook(found.tab.id);
            if (took.took) {
              scheduled = true;
              said = "Signed in. Filled a fresh post and scheduled it for " + label + ".";
              await appendLog([today(), p.name, p.data.title, whenSaid, "scheduled", took.how + " (Fill and schedule)"]);
            } else {
              warn = UNCONFIRMED + " (" + took.how + ")";
              await appendLog([today(), p.name, p.data.title, whenSaid, "unconfirmed", "Fill and schedule: " + took.how]);
            }
          }
        }
      }
      await D.store.set("filled:" + p.name, { on: today(), misses: misses, scheduled: scheduled });
      p.filled = { on: today(), misses: misses, scheduled: scheduled };
      showResult(p.data.title, items, warn, said);
      draw();
    } catch (e) {
      showResult(p.data ? p.data.title : p.name, [], "The fill stopped: " + (e && e.message ? e.message : e) + ".");
    } finally {
      button.disabled = false;
    }
  }

  // The batch's lines, as plain text to paste into a message.
  function batchText() {
    var lines = ["Patron desk batch " + batchId + ", " + sayDate(today()) + ", version " + D.VERSION];
    Array.prototype.forEach.call($("batch-result").querySelectorAll("p"), function (p) { lines.push(p.textContent); });
    return lines.join("\n");
  }

  // ---- batch mode ----

  var LOG = "go-live-log.txt";
  var params = new URLSearchParams(location.search);
  var batchId = params.get("batch");
  var batchTab = parseInt(params.get("tab") || "", 10);

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  async function waitUntil(test, ms) {
    var end = Date.now() + ms;
    while (Date.now() < end) {
      try { if (await test()) return true; } catch (e) { /* the tab is between pages */ }
      await sleep(500);
    }
    return false;
  }

  async function sha256Hex(file) {
    var buf = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.prototype.map.call(new Uint8Array(buf), function (b) {
      return (b < 16 ? "0" : "") + b.toString(16);
    }).join("");
  }

  function daysBetween(a, b) {
    return Math.round((Date.parse(b + "T00:00:00") - Date.parse(a + "T00:00:00")) / 86400000);
  }

  async function readLogScheduled() {
    var done = {};
    try {
      var text = await (await readFileAt(folder, LOG)).text();
      text.split("\n").forEach(function (line) {
        if (!line || line.charAt(0) === "#") return;
        var p = line.split("\t");
        if (p.length >= 5 && (p[4] === "scheduled" || p[4] === "unconfirmed")) done[p[1]] = p;
      });
    } catch (e) { /* no log yet */ }
    return done;
  }

  // Adds one line to the go-live log. Never writes over what is there.
  async function appendLog(fields) {
    var fh = await folder.getFileHandle(LOG, { create: true });
    var size = (await fh.getFile()).size;
    var w = await fh.createWritable({ keepExistingData: true });
    await w.seek(size);
    var clean = fields.map(function (f) { return String(f == null ? "" : f).replace(/[\t\r\n]+/g, " "); });
    await w.write((size === 0 ? "# run date\tpackage\ttitle\tscheduled for\tresult\tdetail\n" : "") + clean.join("\t") + "\n");
    await w.close();
  }

  async function packageFor(name, handle, data) {
    var imgs = [];
    for (var i = 0; i < (data.images || []).length; i++) {
      var img = data.images[i];
      var file = await readFileAt(handle, img.file);
      var ext = img.file.split(".").pop().toLowerCase();
      imgs.push({
        name: file.name,
        type: file.type || TYPES[ext] || "application/octet-stream",
        dataUrl: await asDataUrl(file),
        alt: img.alt || "",
        caption: img.caption || "",
        at: img.at || "end",
        marker: img.marker || null
      });
    }
    return settingsOf(name, data, imgs);
  }

  // Loads a fresh, empty new post page in the tab and waits for its form.
  async function freshNewPost(tabId) {
    await chrome.tabs.update(tabId, { url: "about:blank", active: true });
    await waitUntil(async function () { return (await chrome.tabs.get(tabId)).url === "about:blank"; }, 10000);
    await chrome.tabs.update(tabId, { url: D.PAGE.newPostPage, active: true });
    return waitForEditor(tabId);
  }

  function batchLine(cls, text) {
    var p = el("p", cls, text);
    $("batch-result").appendChild(p);
    return p;
  }

  async function runBatch() {
    $("start").disabled = true;
    $("batch-result").textContent = "";
    var scheduled = 0;
    try {
      if (!folder) { batchLine("miss", "Choose the packages folder below first, then press Start again."); return; }
      if ((await folder.requestPermission({ mode: "readwrite" })) !== "granted") {
        batchLine("miss", "The desk needs to write the go-live log in the packages folder. Allow it, then press Start again.");
        return;
      }
      var approval;
      try {
        approval = JSON.parse(await (await readFileAt(folder, "_batches/batch-" + batchId + ".json")).text());
      } catch (e) {
        batchLine("miss", "No approval file for batch " + batchId + " in the packages folder. Run go-live again.");
        return;
      }
      var age = daysBetween(approval.approved_on, today());
      if (approval.format !== "patron-desk-batch-1" || approval.id !== batchId || !(age >= 0 && age <= 1)) {
        batchLine("miss", "The approval for batch " + batchId + " is not from today or yesterday, or is not in the right form. Run go-live again.");
        return;
      }
      var tab = null;
      try { tab = await chrome.tabs.get(batchTab); } catch (e) { tab = null; }
      if (!tab) {
        var found = await findPatreonTab();
        tab = found.tab;
      }
      if (!tab) { batchLine("miss", "No Patreon tab is open. Run go-live again."); return; }
      var done = await readLogScheduled();
      var list = approval.packages.slice().sort(function (a, b) {
        return (a.date + a.time + a.name) < (b.date + b.time + b.name) ? -1 : 1;
      });
      for (var i = 0; i < list.length; i++) {
        var e = list[i];
        var when = e.date + " " + e.time;
        var stop = async function (why) {
          batchLine("miss", e.title + ": stopped. " + why);
          await appendLog([today(), e.name, e.title, when, "stopped", why]);
        };
        if (done[e.name]) {
          batchLine("skip", e.title + (done[e.name][4] === "unconfirmed" ? ": Schedule was pressed on " + sayDate(done[e.name][0]) +
            " but not confirmed; check Patreon. Left out." : ": already scheduled (log of " + sayDate(done[e.name][0]) + ")."));
          continue;
        }
        var handle, data;
        try {
          handle = await folder.getDirectoryHandle(e.name);
          var pj = await readFileAt(handle, "post.json");
          if ((await sha256Hex(pj)) !== e.post_json_sha256) {
            await stop("Its post.json changed after the batch was approved. Nothing scheduled.");
            return;
          }
          data = JSON.parse(await pj.text());
        } catch (err) {
          await stop("Its package could not be read: " + (err && err.message ? err.message : err));
          return;
        }
        var c = check(data);
        if (c.problems.length) { await stop("Its package has a problem: " + c.problems.join("; ") + "."); return; }
        if (!data.schedule || !data.schedule.date || !data.schedule.time) { await stop("It has no date and time."); return; }
        var at = Date.parse(data.schedule.date + "T" + data.schedule.time + ":00");
        if (!(at - Date.now() >= D.SETTINGS.earliestMinutes * 60000)) {
          await stop("Its time is past, or less than " + D.SETTINGS.earliestMinutes + " minutes away.");
          return;
        }
        var seen = await freshNewPost(tab.id);
        if (seen.where !== "editor") { await stop(landingSays(seen)); return; }
        var fv2 = await fillerVersion(tab.id);
        if (fv2 !== D.VERSION) { await stop(staleSays(fv2)); return; }
        var pkg = await packageFor(e.name, handle, data);
        var answer = await chrome.tabs.sendMessage(tab.id, { type: "patron-desk-fill", pkg: pkg, batch: batchId });
        if (!answer || answer.error) { await stop("The fill stopped: " + (answer ? answer.error : "no answer") + "."); return; }
        if (!answer.verdict || !answer.verdict.pass) {
          var why = (answer.verdict ? answer.verdict.blocking : []).map(function (it) { return it.part + " (" + it.say + ")"; }).join("; ");
          await stop("Not every check passed: " + why + " The post is filled and waiting in the Patreon tab.");
          return;
        }
        var pressed;
        try {
          pressed = await chrome.tabs.sendMessage(tab.id, { type: "patron-desk-press-schedule", name: e.name, batch: batchId });
        } catch (err) {
          pressed = { pressed: "unknown" };
        }
        if (!pressed || pressed.pressed === false) {
          await stop((pressed && pressed.say) || "Schedule was not pressed.");
          return;
        }
        // The page saves a draft by itself, at /posts/<id>/edit, so being
        // off the new post page proves nothing: the post has gone out only
        // when the page leaves the editor.
        var took = await scheduleTook(tab.id);
        if (!took.took) {
          batchLine("miss", e.title + ": stopped. " + UNCONFIRMED);
          await appendLog([today(), e.name, e.title, when, "unconfirmed", took.how]);
          return;
        }
        var after = took.how;
        var soft = (answer.report.items || []).filter(function (it) { return it.soft && it.status !== "ok" && it.status !== "skip"; });
        await appendLog([today(), e.name, e.title, when, "scheduled",
          after + (soft.length ? " (no caption on: " + soft.map(function (it) { return it.part; }).join(", ") + ")" : "")]);
        await D.store.set("filled:" + e.name, { on: today(), misses: 0 });
        batchLine("ok", e.title + ": scheduled for " + sayDate(e.date) + " at " + e.time + ".");
        scheduled += 1;
      }
      batchLine(null, "Batch done. " + scheduled + " scheduled. Check Patreon's scheduled posts once.");
    } catch (err) {
      batchLine("miss", "The batch stopped with an error: " + (err && err.message ? err.message : err) + ". Look in Patreon's scheduled posts and the go-live log before running it again.");
    } finally {
      $("start").disabled = false;
      if (folder) { await loadPackages(); draw(); }
    }
  }

  if (batchId && /^[0-9a-z-]{1,40}$/.test(batchId)) {
    $("batch-part").hidden = false;
    $("batch-says").textContent = "Batch " + batchId + " was approved in the go-live console. Press Start to fill and schedule each post in it. The desk presses Schedule only when every check passes, and never Publish. On any miss it stops on that post and leaves it filled for you.";
    $("start").addEventListener("click", runBatch);
    $("copy-batch").replaceWith(D.copyBox(batchText));
  }

  async function useFolder(handle, ask) {
    var mode = { mode: "readwrite" };
    var state = await handle.queryPermission(mode);
    if (state !== "granted" && ask) state = await handle.requestPermission(mode);
    folder = handle;
    $("folder-says").textContent = "Folder: " + handle.name;
    if (state !== "granted") {
      $("allow").hidden = false;
      $("reload").hidden = true;
      $("folder-says").textContent += ". The browser asks again after a restart: press Allow.";
      return;
    }
    $("allow").hidden = true;
    $("reload").hidden = false;
    await loadPackages();
    draw();
  }

  $("pick").addEventListener("click", async function () {
    try {
      var handle = await window.showDirectoryPicker({ id: "patron-desk-packages", mode: "readwrite" });
      await D.store.set("folder", handle);
      await useFolder(handle, true);
    } catch (e) {
      if (e && e.name === "AbortError") return;
      $("folder-says").textContent = "The folder could not be opened: " + (e && e.message ? e.message : e);
    }
  });
  $("allow").addEventListener("click", function () { if (folder) useFolder(folder, true); });
  $("reload").addEventListener("click", function () { if (folder) useFolder(folder, false); });

  var loaded = chrome.runtime.getManifest().version;
  if (loaded !== D.VERSION) {
    $("stale").hidden = false;
    $("stale").textContent = "The extension needs reloading: Chrome has version " + loaded + " loaded, and the files on disk are " +
      D.VERSION + ". " + RELOAD;
  }

  D.store.get("folder").then(function (handle) {
    if (handle) useFolder(handle, false);
  });
})();

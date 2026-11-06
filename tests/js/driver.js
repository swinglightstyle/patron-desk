/*
  Test driver for the filler. Loaded after selectors.js, filler.js,
  overlay.js and scheduler.js on a test page. It fills the page with a
  sample package (or window.__PKG), then checks the page and the report,
  and writes the outcome into #patron-desk-test-result as JSON, with the
  page title PASS or FAIL.

  The mode comes from the page address: editor, plain, full, batch,
  batchsoft, batchmiss and package run on tests/pages/mock-new-post.html;
  a test copy of a saved page made by tools/reference_page.py uses
  "reference".
*/
(function () {
  "use strict";
  var D = globalThis.PatronDesk;
  var PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  var mode = (location.search.match(/mode=(\w+)/) || [])[1] || window.__mode || "editor";
  var BATCH = { batch: 1, batchsoft: 1, batchmiss: 1, stuck: 1 };
  var LIKE_EDITOR = { editor: 1, unmarked: 1 };
  // A picture that never finishes: do not wait the full minute in a test.
  if (mode === "stuck") D.PAGE.uploadWaitMs = 8000;
  // A saved page has no scripts of its own, so nothing can upload: do not wait long.
  if (mode === "reference") D.PAGE.uploadWaitMs = 2000;

  var BODY = "<p>First paragraph with <em>emphasis</em> and a <a href=\"https://example.com/\">link</a>.</p>\n" +
    "<p>[IMAGE 1: one.png]</p>\n<p>Last paragraph &amp; done.</p>";

  function pkgFor(m) {
    var base = {
      name: "test-" + m,
      title: "A small test post",
      body_html: BODY,
      notes: ["A note to act on."],
      image_text: "alt",
      images: [
        { name: "one.png", type: "image/png", dataUrl: PNG, alt: "A red square.", at: "marker", marker: "[IMAGE 1: one.png]" },
        { name: "two.png", type: "image/png", dataUrl: PNG, alt: "A blue square.", at: "gallery", marker: null }
      ],
      collection: null, tags: [], comments: null
    };
    if (m === "reference") {
      // Everything a real post may ask, on a saved page with no scripts.
      base.images = [base.images[1]];
      base.access = { type: "paid", tiers: "all", sell: false };
      base.tags = ["test"];
      base.comments = "no-one";
      base.schedule = { date: "2026-11-10", time: "09:00" };
      base.image_text = "alt";
      return base;
    }
    if (m === "paidfirst") {
      base.access = { type: "paid", tiers: "all", sell: false };
      base.schedule = null;
      return base;
    }
    if (LIKE_EDITOR[m] || BATCH[m]) {
      base.access = { type: "paid", tiers: ["Back End View"], sell: false };
      base.collection = "Machine room";
      base.tags = ["build log", "AI"];
      base.comments = "no-one";
      base.schedule = { date: "2026-11-10", time: "09:00" };
    } else {
      base.access = { type: "free" };
      base.schedule = null;
    }
    if (m === "plain") {
      // Captions: one fits, one is longer than a caption takes.
      base.image_text = "caption";
      base.images[1] = Object.assign({}, base.images[1], { alt: new Array(21).join("A long description. ") });
    }
    return base;
  }

  var checks = [];
  function check(name, pass, detail) {
    checks.push({ name: name, pass: !!pass, detail: detail === undefined ? "" : String(detail) });
  }

  function item(report, part) {
    return report.items.filter(function (i) { return i.part === part; })[0] || { status: "absent", say: "" };
  }
  function status(report, part) { return item(report, part).status; }

  function q(sel) { return document.querySelector(sel); }
  function sel(id) { return q(id).getAttribute("aria-checked") === "true"; }

  function tileData(key) {
    return Array.prototype.map.call(document.querySelectorAll("#tiles .tile"), function (t) { return t.dataset[key] || ""; });
  }

  function checkAllSettings(report, pkg) {
    var title = q("textarea[aria-label=Title]");
    var ed = q("#editor");
    var text = ed.textContent.replace(/\s+/g, " ");
    var inl = ed.querySelector("img");
    check("title filled", title.value === pkg.title, title.value);
    check("the picture in the text has its alt text", inl && inl.dataset.alt === "A red square." && !inl.dataset.caption, inl && (inl.dataset.alt + " / " + inl.dataset.caption));
    check("it was found again after the editor drew it afresh", inl && inl.getAttribute("data-redrawn") === "1");
    check("its alt text reported ok and soft", status(report, "Alt text 1 (one.png)") === "ok" && item(report, "Alt text 1 (one.png)").soft, item(report, "Alt text 1 (one.png)").say);
    check("the paywall line sits above the text", ed.firstElementChild && ed.firstElementChild.getAttribute("data-test") === "paywall");
    check("text through the editor's paste", /own paste/.test(item(report, "Text").say), item(report, "Text").say);
    check("text kept the emphasis and link", !!ed.querySelector("em") && !!ed.querySelector("a[href='https://example.com/']"));
    check("marker replaced by the picture", text.indexOf("[IMAGE 1") === -1 && ed.querySelectorAll("img").length === 1, text);
    check("picture 1 in the text", status(report, "Picture 1 (one.png)") === "ok");
    check("picture 2 in the gallery", status(report, "Picture 2 (two.png)") === "ok" && document.querySelectorAll("#tiles img").length === 1);
    check("the gallery's own picture box was used", window.__wrongBox === false);
    check("paid access chosen", q("input[value=paid]").checked && !q("input[value=public]").checked);
    check("paid members ticked", q("#paid-members-toggle").checked);
    check("tier chosen", sel("#t-back") && !sel("#t-machine") && !sel("#t-all"), q("#tierlist").textContent);
    check("tier list reads 1 tier", q("#tierlist").textContent === "1 tier", q("#tierlist").textContent);
    check("not sold", !q("#sell-post-toggle").checked);
    check("who sees it read back", status(report, "Who sees it") === "look" && item(report, "Who sees it").checked, item(report, "Who sees it").say);
    check("collection chosen", q("#c-machine").getAttribute("aria-checked") === "true" && q("#c-diary").getAttribute("aria-checked") === "false");
    check("collection reported ok", status(report, "Collection") === "ok", item(report, "Collection").say);
    check("nothing made", window.__made === false);
    var chips = Array.prototype.map.call(document.querySelectorAll("#tag-chips .chip"), function (c) { return c.textContent; });
    check("tags added", chips.join("|") === "build log|AI", chips.join("|"));
    check("comments set to no one", q("#post-editor-comments-access-menu").textContent === "No one", q("#post-editor-comments-access-menu").textContent);
    check("publish date on", q("#scheduled-for-toggle").getAttribute("aria-checked") === "true");
    check("date in the date box", q("#date").value === "2026-11-10", q("#date").value);
    check("time in the time box", q("input[type=time]").value === "09:00", q("input[type=time]").value);
  }

  async function run() {
    var pkg = window.__PKG || pkgFor(mode);
    // The guard: the buttons that send a post out or delete are never clicked.
    var guarded = Array.prototype.slice.call(document.querySelectorAll(D.PAGE.neverClickHooks));
    guarded.forEach(function (b) {
      check("refuses to click " + (b.textContent || b.value || b.tagName).trim(), D.safeClick(b) === false);
    });
    ["Publish now", "Delete draft", "Delete", "+ Create collection", "Preview post"].forEach(function (w) {
      check("refuses a button that says " + w, D.isForbidden(Object.assign(document.createElement("button"), { textContent: w })));
    });
    check("allows a button that says Free access", !D.isForbidden(Object.assign(document.createElement("button"), { textContent: "Free access" })));
    check("writes a typed date", D.writeDate("MM/DD/YYYY", "2026-11-10") === "11/10/2026");
    check("writes a typed time", D.writeTime("hh:mm A", "13:05") === "01:05 PM" && D.writeTime("hh:mm A", "00:30") === "12:30 AM");

    var report = await D.fill(pkg);
    var host = D.showOverlay(report);
    var title = q("textarea[aria-label=Title]");
    var ed = q("#editor");
    var text = ed ? ed.textContent.replace(/\s+/g, " ") : "";
    var alts = tileData("alt");
    var caps = tileData("caption");

    if (LIKE_EDITOR[mode]) {
      checkAllSettings(report, pkg);
      check("alt text on the gallery picture, and no caption", alts.join("|") === "A blue square." && caps.join("|") === "", alts.join("|") + " / " + caps.join("|"));
      check("alt text reported ok and soft", status(report, "Alt text 2 (two.png)") === "ok" && item(report, "Alt text 2 (two.png)").soft);
      check("the caption box was closed", q("#caption-dialog").classList.contains("hide"));

      check("publish date read back with the zone", status(report, "Publish date") === "look" && item(report, "Publish date").checked, item(report, "Publish date").say);
      check("every check would pass a batch", D.batchVerdict(report).pass, JSON.stringify(D.batchVerdict(report).blocking));
    } else if (mode === "plain") {
      check("title filled", title.value === pkg.title);
      check("text through insertHTML", /formatted text/.test(item(report, "Text").say), item(report, "Text").say);
      check("text has the words", text.indexOf("Last paragraph & done.") !== -1, text);
      check("marker line taken out", text.indexOf("[IMAGE 1") === -1, text);
      check("picture 1 reported as moved to the gallery", status(report, "Picture 1 (one.png)") === "look" && /gallery/.test(item(report, "Picture 1 (one.png)").say));
      check("both pictures in the gallery", document.querySelectorAll("#tiles img").length === 2);
      check("the short description is the first picture's caption", caps[0] === "A red square." && alts.join("") === "", caps.join("|"));
      check("the long description was not cut into a caption", caps[1] === "", caps.join("|"));
      check("the long one is reported, soft", status(report, "Caption 2 (two.png)") === "look" && item(report, "Caption 2 (two.png)").soft &&
        /takes 140/.test(item(report, "Caption 2 (two.png)").say), item(report, "Caption 2 (two.png)").say);
      check("free access chosen", q("input[value=public]").checked && !q("input[value=paid]").checked);
      check("no publish date asked", status(report, "Publish date") === "skip");
      check("publish date left off", q("#scheduled-for-toggle").getAttribute("aria-checked") === "false");
      check("a moved picture would stop a batch", !D.batchVerdict(report).pass);
    } else if (mode === "full") {
      check("title left alone", title.value === "Beth's own title");
      check("title reported missed", status(report, "Title") === "miss");
      check("text left alone", text.trim() === "Beth's own words.", text);
      check("text reported missed", status(report, "Text") === "miss");
      check("stopped before the pictures", status(report, "The rest") === "miss" && status(report, "Picture 1 (one.png)") === "absent");
      check("no picture added", document.querySelectorAll("#tiles img").length === 0);
      check("access left alone", !q("input[value=public]").checked && !q("input[value=paid]").checked);
    } else if (BATCH[mode]) {
      var verdict = D.batchVerdict(report);
      var schedBtn = q("#schedule");
      // As content.js does after a batch fill.
      D.lastFill = { name: pkg.name, pass: verdict.pass };
      if (mode === "stuck") {
        check("a check failed", !verdict.pass);
        check("the stuck picture is the reason", verdict.blocking.some(function (b) {
          return b.part === "Picture 2 (two.png)" && /still uploading/.test(b.say);
        }), JSON.stringify(verdict.blocking));
        var res3 = await D.pressSchedule(pkg.name);
        check("did not press Schedule", res3.pressed === false && window.__published === false, res3.say);
      } else if (mode === "batch" || mode === "batchsoft") {
        checkAllSettings(report, pkg);
        check("every check passed", verdict.pass, JSON.stringify(verdict.blocking));
        if (mode === "batchsoft") {
          check("alt text could not be set", alts.join("") === "" && status(report, "Description 2 (two.png)") === "look", item(report, "Description 2 (two.png)").say);
          check("and that did not stop the batch", item(report, "Description 2 (two.png)").soft);
        }
        var wrong = await D.pressSchedule("another-post");
        check("refuses a post it did not just fill", wrong.pressed === false && window.__published === false, wrong.say);
        schedBtn.textContent = "Publish now";
        var lie = await D.pressSchedule(pkg.name);
        check("refuses a schedule hook whose words say publish", lie.pressed === false && window.__published === false, lie.say);
        schedBtn.textContent = "Schedule";
        D.lastFill = { name: pkg.name, pass: verdict.pass };
        var res = await D.pressSchedule(pkg.name);
        check("the picture's panel was closed before Schedule", !window.__scheduleIgnored && q("#edit-image").classList.contains("hide"));
        check("pressed Schedule", res.pressed === true && window.__published === "schedule", JSON.stringify(res) + " " + window.__published);
        var again = await D.pressSchedule(pkg.name);
        check("presses only once per fill", again.pressed === false, again.say);
      } else {
        check("a check failed", !verdict.pass);
        check("the failing check is the time zone", verdict.blocking.length === 1 && verdict.blocking[0].part === "Publish date" &&
          /ZZT/.test(verdict.blocking[0].say), JSON.stringify(verdict.blocking));
        var res2 = await D.pressSchedule(pkg.name);
        check("did not press Schedule", res2.pressed === false && window.__published === false, res2.say);
        check("post left filled", title.value === pkg.title && text.indexOf("Last paragraph & done.") !== -1);
      }
    } else if (mode === "paidfirst") {
      var first = ed.firstElementChild;
      check("not taken for a page with words in it", status(report, "Text") === "ok" && status(report, "The rest") === "absent", item(report, "Text").say);
      check("the paywall line kept, first", first && first.getAttribute("data-test") === "paywall" && ed.querySelectorAll("[data-test=paywall]").length === 1);
      check("the text after it", text.indexOf("Paid access starts here") < text.indexOf("First paragraph"), text);
      check("paid access kept", q("input[value=paid]").checked && !q("input[value=public]").checked);
      check("who sees it read back", status(report, "Who sees it") === "look" && item(report, "Who sees it").checked, item(report, "Who sees it").say);
    } else if (mode === "package") {
      var want = new DOMParser().parseFromString(pkg.body_html, "text/html").body.textContent;
      pkg.images.forEach(function (i) { if (i.marker) want = want.replace(i.marker, ""); });
      check("title filled", title.value === pkg.title, title.value);
      check("text matches the package word for word", ed.textContent.replace(/\s+/g, "") === want.replace(/\s+/g, ""));
      check("text links kept", ed.querySelectorAll("a").length === (pkg.body_html.match(/<a /g) || []).length);
      check("every picture in", pkg.images.every(function (i, n) { return status(report, "Picture " + (n + 1) + " (" + i.name + ")") === "ok"; }));
      var gal = pkg.images.filter(function (i) { return i.at !== "marker"; });
      var inText = Array.prototype.map.call(ed.querySelectorAll("img"), function (x) { return x.dataset.alt || ""; });
      var capsInText = Array.prototype.map.call(ed.querySelectorAll("img"), function (x) { return x.dataset.caption || ""; });
      var wantCaps = pkg.images.filter(function (i) { return i.at === "marker"; }).map(function (i) { return i.caption || ""; });
      check("every picture in the text has its own caption, if it has one", capsInText.join("|") === wantCaps.join("|"), capsInText.join("|"));
      if (pkg.image_text === "alt") {
        check("every gallery picture's description is its alt text", alts.join("|") === gal.map(function (i) { return i.alt; }).join("|"), alts.join("|"));
        check("every picture in the text has its alt text", inText.join("|") === pkg.images.filter(function (i) { return i.at === "marker"; }).map(function (i) { return i.alt; }).join("|"), inText.join("|"));
      }
      check("nothing missed", report.items.every(function (i) { return i.status !== "miss"; }), JSON.stringify(report.items));
    } else {
      // A saved copy of Patreon's page: report what was found, check little.
      check("found the title box", status(report, "Title") !== "miss", JSON.stringify(report.items));
      check("found the text box", status(report, "Text") !== "miss");
    }
    if (mode === "batch" || mode === "batchsoft") check("pressed nothing but Schedule", window.__published === "schedule", window.__published);
    else check("never published", window.__published === undefined || window.__published === false, window.__published);
    check("deleted nothing", !window.__deleted);
    if (mode === "unmarked") check("pressed early, as the page gave no sign, and kept at it", window.__pressedTooSoon === true);
    else if (mode !== "stuck") check("never pressed a picture while it uploaded", !window.__pressedTooSoon);

    // The copy box copies the results, the older way first.
    var copied = null;
    var realExec = document.execCommand;
    document.execCommand = function (cmd) {
      if (cmd === "copy") { copied = document.activeElement && document.activeElement.value; return true; }
      return realExec.apply(document, arguments);
    };
    var box = host.shadowRoot.querySelector("button.copybox");
    box.click();
    document.execCommand = realExec;
    await new Promise(function (r) { setTimeout(r, 50); });
    check("the copy box copies the results", !!copied && copied.indexOf("Patron desk results") === 0 && copied.indexOf(pkg.title) !== -1, copied);
    check("and shows it copied", box.getAttribute("aria-label") === "Copied");
    check("the copy is gone from the page", !document.querySelector("[data-patron-desk-copy]"));
    check("checklist shown", !!(host && host.shadowRoot && host.shadowRoot.textContent.indexOf("Nothing was published") !== -1));
    check("checklist has the copy box", !!host.shadowRoot.querySelector("button.copybox svg"));
    check("checklist lists the notes", (pkg.notes || []).every(function (n) { return host.shadowRoot.textContent.indexOf(n) !== -1; }));

    var failed = checks.filter(function (c) { return !c.pass; });
    var out = { mode: mode, passed: checks.length - failed.length, failed: failed.length, checks: checks, report: report.items };
    document.getElementById("patron-desk-test-result").textContent = JSON.stringify(out, null, 1);
    document.title = (failed.length ? "FAIL " : "PASS ") + mode;
  }

  run().catch(function (e) {
    document.getElementById("patron-desk-test-result").textContent = "ERROR " + (e && e.stack ? e.stack : e);
    document.title = "ERROR " + mode;
  });
})();

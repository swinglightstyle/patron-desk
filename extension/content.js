/*
  Runs on Patreon's pages. It waits for the desk to send a package, fills
  the form, shows the checklist and sends the report back to the desk.
  In a batch Beth approved, or when Beth pressed Fill and schedule and
  confirmed it, the desk may then ask it to press Schedule (scheduler.js).
  It reads nothing from the page until asked, and sends nothing anywhere
  but back to the desk.
*/
(function () {
  "use strict";
  if (globalThis.PatronDeskListening) return;
  globalThis.PatronDeskListening = true;
  var D = globalThis.PatronDesk;

  // Opened by go-live with a batch marker: tell the extension, which opens the desk.
  var hash = location.hash || "";
  if (hash.indexOf(D.PAGE.batchMarker) === 0) {
    var id = decodeURIComponent(hash.slice(D.PAGE.batchMarker.length));
    if (/^[0-9a-z-]{1,40}$/.test(id)) {
      chrome.runtime.sendMessage({ type: "patron-desk-batch-marker", batch: id });
    }
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
    if (sender.id !== chrome.runtime.id || !msg) return;
    if (msg.type === "patron-desk-ping") {
      reply({ here: true, version: D.VERSION || "", newPostPage: D.PAGE.newPostUrl.test(location.href), formReady: D.formReady() });
      return;
    }
    if (msg.type === "patron-desk-fill") {
      D.lastFill = null;
      D.fill(msg.pkg).then(function (report) {
        var verdict = null;
        if (msg.batch) {
          verdict = D.batchVerdict(report);
          D.lastFill = { name: msg.pkg.name, pass: verdict.pass };
          var who = msg.batch === "desk" ? "Fill and schedule" : "Batch " + msg.batch;
          report.batchNote = verdict.pass
            ? who + ": every check passed. The desk now presses Schedule (never Publish)."
            : who + ": stopped on this post. It is filled and waiting for you. Nothing was published or scheduled.";
        }
        D.showOverlay(report);
        reply({ report: { title: report.title, items: report.items, notes: report.notes }, verdict: verdict });
      }, function (e) {
        reply({ error: String(e && e.message ? e.message : e) });
      });
      return true;
    }
    if (msg.type === "patron-desk-schedule-state") {
      reply({ button: D.scheduleButtonWords ? D.scheduleButtonWords() : "" });
      return;
    }
    if (msg.type === "patron-desk-press-schedule" && msg.batch) {
      D.pressSchedule(msg.name).then(reply, function (e) {
        reply({ pressed: false, say: "Stopped with an error: " + (e && e.message ? e.message : e) });
      });
      return true;
    }
  });
})();

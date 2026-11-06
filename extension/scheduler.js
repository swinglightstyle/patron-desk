/*
  Presses the page's own Schedule button for a post that was just filled
  and passed every check: in a batch Beth approved in the go-live console,
  or when she pressed Fill and schedule on the desk and confirmed it. This
  is the only file that may press a button that sends a post out, and it
  presses only Schedule, never Publish.

  It acts only when all of these hold:
  - the desk asked for this post by name, in a batch Beth approved or a
    Fill and schedule she confirmed;
  - the last fill on this page was that post, and its verdict passed;
  - the button matches selectors.js scheduleButton (its hook and its words,
    and none of its wrong words), and is not marked disabled.
  Anything else and it presses nothing and says why.
*/
(function () {
  "use strict";
  var D = (globalThis.PatronDesk = globalThis.PatronDesk || {});

  function norm(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function shown(el) {
    return !!el && el.isConnected && el.getClientRects().length > 0;
  }

  function wordsOfButton(el) {
    return norm(el.innerText || el.textContent || el.getAttribute("aria-label") || "");
  }

  function fits(el, rightWords) {
    var S = D.PAGE.scheduleButton;
    var w = wordsOfButton(el);
    if (!rightWords.some(function (rx) { return rx.test(w); })) return false;
    if (S.wrongWords.some(function (rx) { return rx.test(w); })) return false;
    if (el.disabled || el.getAttribute("aria-disabled") === "true") return false;
    return true;
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  // The words on the page's Schedule button now, or "" when it is gone.
  // After a Schedule that took, the page may stay in the editor (Beth's
  // live try, 6 November 2026), and the button changes or goes.
  D.scheduleButtonWords = function () {
    var S = D.PAGE.scheduleButton;
    for (var i = 0; i < S.hooks.length; i++) {
      var found = Array.prototype.slice.call(document.querySelectorAll(S.hooks[i])).filter(shown)[0];
      if (found) return wordsOfButton(found);
    }
    return "";
  };

  // Returns { pressed: true } or { pressed: false, say: "why not" }.
  D.pressSchedule = async function (name) {
    var S = D.PAGE.scheduleButton;
    var last = D.lastFill;
    if (!last || last.name !== name) {
      return { pressed: false, say: "This page was not just filled with " + name + ", so Schedule was not pressed." };
    }
    if (!last.pass) {
      return { pressed: false, say: "Not every check passed, so Schedule was not pressed." };
    }
    var button = null;
    S.hooks.forEach(function (sel) {
      if (button) return;
      var found = Array.prototype.slice.call(document.querySelectorAll(sel)).filter(shown);
      button = found[0] || null;
    });
    if (!button) {
      return { pressed: false, say: "The page's Schedule button was not found (see selectors.js scheduleButton). Nothing was pressed." };
    }
    if (!fits(button, S.words)) {
      return { pressed: false, say: "The button found says \"" + wordsOfButton(button) + "\", not Schedule, or is switched off. Nothing was pressed." };
    }
    D.lastFill = null;
    button.click();
    // A confirm box, if the page shows one: watched for a few seconds.
    var end = Date.now() + 6000;
    while (Date.now() < end) {
      await sleep(500);
      var boxes = Array.prototype.slice.call(document.querySelectorAll('[role="dialog"], [role="alertdialog"]')).filter(shown);
      var ok = null;
      for (var i = 0; i < boxes.length && !ok; i++) {
        ok = Array.prototype.slice.call(boxes[i].querySelectorAll("button")).filter(function (b) {
          return shown(b) && fits(b, S.confirmWords);
        })[0] || null;
      }
      if (ok) {
        ok.click();
        return { pressed: true, confirmed: true };
      }
    }
    return { pressed: true };
  };
})();

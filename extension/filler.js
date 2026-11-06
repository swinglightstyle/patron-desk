/*
  The filler: puts one post package into Patreon's post editor.

  It reads every place on the page from selectors.js (D.PAGE) and names no
  place itself. It never clicks a button that sends a post out, deletes
  anything or makes a collection: see safeClick. Each step reports one of:
    ok    filled and checked
    look  done, but a person should look; "checked" when it was read back
          from the page and matched
    miss  not done; do it by hand
    skip  nothing asked
  A step marked "soft" (picture descriptions) never stops a batch.
*/
(function () {
  "use strict";
  var D = (globalThis.PatronDesk = globalThis.PatronDesk || {});

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  function norm(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function squash(s) {
    return String(s || "").replace(/\s+/g, "");
  }

  function tryAll(root, selector) {
    try {
      return Array.prototype.slice.call(root.querySelectorAll(selector));
    } catch (e) {
      return [];
    }
  }

  function shown(el) {
    if (!el || !el.isConnected) return false;
    if (el.getClientRects().length === 0) return false;
    var st = getComputedStyle(el);
    return st.visibility !== "hidden" && st.display !== "none";
  }

  // The first element matching any selector in the list, in list order.
  function findFirst(list, opts) {
    opts = opts || {};
    var root = opts.root || document;
    for (var i = 0; i < list.length; i++) {
      var els = tryAll(root, list[i]);
      for (var j = 0; j < els.length; j++) {
        if (opts.hidden || shown(els[j])) return { el: els[j], selector: list[i] };
      }
    }
    return null;
  }

  function findAll(list, opts) {
    opts = opts || {};
    var root = opts.root || document;
    var out = [];
    list.forEach(function (sel) {
      tryAll(root, sel).forEach(function (el) {
        if (out.indexOf(el) === -1 && (opts.hidden || shown(el))) out.push(el);
      });
    });
    out.sort(function (a, b) {
      return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    return out;
  }

  // The words a person sees for a choice or a button.
  function wordsOf(el) {
    var a = el.getAttribute("aria-label");
    if (a) return norm(a);
    var by = el.getAttribute("aria-labelledby");
    if (by) {
      var t = by.split(/\s+/).map(function (id) {
        var x = document.getElementById(id);
        return x ? x.textContent : "";
      }).join(" ");
      if (norm(t)) return norm(t);
    }
    if (el.labels && el.labels.length && norm(el.labels[0].textContent)) return norm(el.labels[0].textContent);
    if (el.tagName === "SELECT") {
      var opt = el.options[el.selectedIndex];
      return opt ? norm(opt.textContent) : "";
    }
    if (el.tagName !== "INPUT" && norm(el.textContent)) return norm(el.textContent);
    if (el.parentElement && norm(el.parentElement.textContent)) return norm(el.parentElement.textContent);
    return norm(el.value);
  }

  // The words an element itself shows, not its label.
  function shownWords(el) {
    return el.tagName === "SELECT" ? wordsOf(el) : norm(el.textContent);
  }

  // The first shown element for a list of page hooks.
  function hook(list, root) {
    var f = findFirst(list || [], root ? { root: root } : undefined);
    return f ? f.el : null;
  }

  function isOn(el) {
    if (el.tagName === "INPUT") return !!el.checked;
    var v = el.getAttribute("aria-checked") || el.getAttribute("aria-selected") || el.getAttribute("aria-pressed");
    return v === "true";
  }

  function matches(words, text) {
    return words.some(function (rx) { return rx.test(text); });
  }

  // Refuses any button that sends a post out, deletes, or makes things.
  function isForbidden(el) {
    var P = D.PAGE;
    var targets = [el];
    var up = el.closest('button, [role="button"], a, input[type="submit"]');
    if (up && up !== el) targets.push(up);
    return targets.some(function (t) {
      if (t.matches && t.matches(P.neverClickHooks)) return true;
      var w = norm(t.innerText || t.textContent || t.value || "");
      var a = norm(t.getAttribute("aria-label") || "");
      return P.neverClick.some(function (rx) { return rx.test(w) || rx.test(a); });
    });
  }

  // A full press, for things that act on the mouse going down (like a
  // picture in the text). Refused like any click.
  function safePress(el) {
    if (!el || isForbidden(el)) return false;
    el.scrollIntoView({ block: "center", inline: "center" });
    var r = el.getBoundingClientRect();
    var at = { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1,
      clientX: Math.round(r.left + r.width / 2), clientY: Math.round(r.top + r.height / 2) };
    // The element really at that place (the picture, or something drawn over it).
    var target = document.elementFromPoint(at.clientX, at.clientY) || el;
    if (target !== el && !el.contains(target) && !target.contains(el)) target = el;
    var P = window.PointerEvent || MouseEvent;
    target.dispatchEvent(new P("pointerdown", Object.assign({ pointerType: "mouse", isPrimary: true }, at)));
    target.dispatchEvent(new MouseEvent("mousedown", at));
    target.dispatchEvent(new P("pointerup", Object.assign({ pointerType: "mouse", isPrimary: true }, at, { buttons: 0 })));
    target.dispatchEvent(new MouseEvent("mouseup", Object.assign({}, at, { buttons: 0 })));
    target.dispatchEvent(new MouseEvent("click", Object.assign({}, at, { buttons: 0 })));
    return true;
  }

  function safeClick(el) {
    if (!el || isForbidden(el)) return false;
    el.click();
    return true;
  }

  // Sets a field's value so the page's own code sees the change.
  function setField(el, value) {
    var proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype
      : el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    el.focus();
    desc.set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    el.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function selectInside(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Puts the caret at the end of an editable block, selecting nothing.
  function caretAtEnd(el) {
    var range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  // Types into a box, a text area or an editable block.
  function typeInto(el, text) {
    if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
      setField(el, text);
    } else {
      el.focus();
      selectInside(el);
      document.execCommand("insertText", false, text);
    }
  }

  function textIn(el) {
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" ? el.value : el.textContent;
  }

  function pressKey(el, key) {
    var code = key === "Enter" ? 13 : 27;
    ["keydown", "keypress", "keyup"].forEach(function (type) {
      el.dispatchEvent(new KeyboardEvent(type, { key: key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true }));
    });
  }

  function pasteInto(target, data) {
    var dt = new DataTransfer();
    if (data.html) dt.setData("text/html", data.html);
    if (data.text) dt.setData("text/plain", data.text);
    (data.files || []).forEach(function (f) { dt.items.add(f); });
    var ev = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    return ev.defaultPrevented;
  }

  // The words typed in an editable block: parts that cannot be typed in
  // (like the "Paid access starts here" line) are left out.
  function typedWords(el) {
    var copy = el.cloneNode(true);
    tryAll(copy, '[contenteditable="false"]').forEach(function (x) { x.remove(); });
    return copy.textContent || "";
  }

  function textOfHtml(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    return doc.body.textContent || "";
  }

  function dataUrlToFile(img) {
    var parts = img.dataUrl.split(",");
    var bin = atob(parts[1]);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], img.name, { type: img.type });
  }

  async function waitFor(test, ms) {
    var end = Date.now() + ms;
    while (Date.now() < end) {
      if (test()) return true;
      await sleep(150);
    }
    return !!test();
  }

  // The first shown choice whose words match, trying the words in order.
  function choiceByWords(selector, words, root) {
    var all = tryAll(root || document, selector).filter(shown);
    for (var r = 0; r < words.length; r++) {
      for (var i = 0; i < all.length; i++) {
        if (words[r].test(wordsOf(all[i]))) return all[i];
      }
    }
    return null;
  }

  // A choice whose words are exactly the name, or the name and more words after.
  function choiceByName(selector, name, avoid) {
    var want = norm(name).toLowerCase();
    return tryAll(document, selector).filter(shown).filter(function (el) {
      if (avoid && avoid.indexOf(el) !== -1) return false;
      var w = wordsOf(el).toLowerCase();
      return w === want || w.indexOf(want + " ") === 0;
    })[0] || null;
  }

  async function setOn(el, want) {
    if (isOn(el) !== want) {
      if (!safeClick(el)) return false;
      await sleep(D.PAGE.settleMs);
    }
    return isOn(el) === want;
  }

  async function openMoreSettings() {
    var more = choiceByWords(D.PAGE.moreSettingsOpeners, D.PAGE.moreSettingsWords);
    if (more && more.getAttribute("aria-expanded") !== "true") {
      safeClick(more);
      await sleep(D.PAGE.settleMs);
    }
  }

  // ---- the steps ----

  function stepTitle(pkg, report) {
    var found = findFirst(D.PAGE.title);
    if (!found) {
      report.add("Title", "miss", "Could not find the title box. Paste the title by hand.");
      return;
    }
    var el = found.el;
    if (norm(textIn(el))) {
      report.add("Title", "miss", "The title box already had words in it, so they were left alone.");
      report.notFresh = true;
      return;
    }
    typeInto(el, pkg.title);
    if (norm(textIn(el)) === norm(pkg.title)) report.add("Title", "ok", "Filled.");
    else report.add("Title", "look", "Typed it in, but the box shows something else. Check the title.");
  }

  function bodyEditor() {
    var found = findFirst(D.PAGE.body);
    return found ? found.el : null;
  }

  async function stepBody(pkg, report) {
    var ed = bodyEditor();
    if (!ed) {
      report.add("Text", "miss", "Could not find the post's text box. Paste the text by hand.");
      return null;
    }
    var want = textOfHtml(pkg.body_html);
    if (squash(typedWords(ed))) {
      report.add("Text", "miss", "The text box already had words in it, so nothing was added.");
      report.notFresh = true;
      return ed;
    }
    ed.focus();
    caretAtEnd(ed);
    var how = "the editor's own paste";
    var taken = pasteInto(ed, { html: pkg.body_html, text: want });
    if (!taken) {
      how = "inserting it as formatted text";
      document.execCommand("insertHTML", false, pkg.body_html);
    }
    await sleep(D.PAGE.settleMs);
    var got = squash(typedWords(ed));
    var w = squash(want);
    if (got.indexOf(w) !== -1) {
      report.add("Text", "ok", "Filled, through " + how + ". Check the links and the line breaks.");
    } else if (w.length > 120 && got.indexOf(w.slice(0, 60)) !== -1 && got.indexOf(w.slice(-60)) !== -1) {
      report.add("Text", "look", "Filled, through " + how + ", but it does not match word for word. Read it through.");
    } else if (got.length > 0) {
      report.add("Text", "look", "Some text went in, through " + how + ", but not all of it. Read it through against the package.");
    } else {
      report.add("Text", "miss", "The text did not go in. Paste the text by hand.");
    }
    return ed;
  }

  function markerBlock(ed, marker) {
    if (!ed || !marker) return null;
    var want = squash(marker);
    var blocks = tryAll(ed, D.PAGE.bodyBlocks).filter(function (b) {
      return squash(b.textContent) === want;
    });
    // The innermost block that holds only the marker.
    blocks.sort(function (a, b) { return a.contains(b) ? 1 : b.contains(a) ? -1 : 0; });
    return blocks[0] || null;
  }

  function countShown(root) {
    return tryAll(root || document, D.PAGE.images.shown).length;
  }

  // Gallery pictures, and all pictures: a new gallery picture shows in
  // either count (the second for a page that no longer marks its gallery).
  function countGallery() {
    return { marked: tryAll(document, D.PAGE.images.galleryShown).length, all: countShown(document) };
  }

  function galleryGrew(before) {
    var now = countGallery();
    return now.marked > before.marked || now.all > before.all;
  }

  async function fileInput() {
    var I = D.PAGE.images;
    var input = findFirst(I.fileInput, { hidden: true });
    if (!input) {
      var opener = choiceByWords(I.fileOpenerChoices, I.fileOpeners);
      if (opener && safeClick(opener)) {
        await sleep(D.PAGE.settleMs);
        input = findFirst(I.fileInput, { hidden: true });
      }
    }
    return input ? input.el : null;
  }

  // True while a picture is still uploading: its picture is a preview,
  // it has not drawn, or something around it is marked as loading.
  function stillLoading(pic) {
    if (!pic || !pic.isConnected) return true;
    if (D.PAGE.pendingSrc.test(pic.getAttribute("src") || "")) return true;
    if (!(pic.complete && pic.naturalWidth > 0)) return true;
    var up = pic;
    for (var k = 0; k < 3 && up; k++) {
      if (up.matches && up.matches(D.PAGE.uploading)) return true;
      if (up !== pic && tryAll(up, D.PAGE.uploading).filter(shown).length) return true;
      up = up.parentElement;
    }
    return false;
  }

  // Waits until a picture has uploaded. find() gives the picture now: the
  // page may draw it afresh while it uploads. True when it has.
  async function waitUploaded(find) {
    await sleep(D.PAGE.pictureSettleMs);
    return waitFor(function () { return !stillLoading(find()); }, D.PAGE.uploadWaitMs);
  }

  function secondsOf(ms) {
    return Math.round(ms / 1000);
  }

  async function onePicture(img, n, ed, report) {
    var label = "Picture " + n + " (" + img.name + ")";
    var file = dataUrlToFile(img);
    var block = img.at === "marker" ? markerBlock(ed, img.marker) : null;
    var slow = " It was still uploading after " + secondsOf(D.PAGE.uploadWaitMs) + " seconds: check it finished.";

    if (block) {
      var before = countShown(ed);
      var old = tryAll(ed, D.PAGE.images.shown);
      ed.focus();
      selectInside(block);
      if (pasteInto(ed, { files: [file] })) {
        var arrived = await waitFor(function () { return countShown(ed) > before; }, D.PAGE.uploadWaitMs);
        if (arrived) {
          var nowPics = tryAll(ed, D.PAGE.images.shown);
          var fresh = nowPics.filter(function (x) { return old.indexOf(x) === -1; })[0] || null;
          var seen = { el: fresh, index: fresh ? nowPics.indexOf(fresh) : -1 };
          report._inline = report._inline || {};
          report._inline[n - 1] = seen;
          var loaded = await waitUploaded(function () {
            return seen.el && seen.el.isConnected ? seen.el : tryAll(ed, D.PAGE.images.shown)[seen.index];
          });
          var markerGone = !markerBlock(ed, img.marker);
          if (loaded && markerGone) {
            report.add(label, "ok", "Put in the text where its marker line was, and uploaded.");
          } else {
            report.add(label, "look", "Put in the text." + (markerGone ? "" : " Its marker line " + img.marker + " is still there: delete that line.") +
              (loaded ? "" : slow));
          }
          return "text";
        }
      }
    }

    var input = await fileInput();
    if (!input) {
      report.add(label, "miss", "Could not find the page's picture box. Add " + img.name + " by hand from the package's images folder.");
      return null;
    }
    var before2 = countGallery();
    var oldGallery = tryAll(document, D.PAGE.images.galleryShown);
    var dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    var came = await waitFor(function () { return galleryGrew(before2); }, D.PAGE.uploadWaitMs);
    var done = false;
    if (came) {
      var nowGallery = tryAll(document, D.PAGE.images.galleryShown);
      var newOne = nowGallery.filter(function (x) { return oldGallery.indexOf(x) === -1; })[0] || null;
      var at = newOne ? nowGallery.indexOf(newOne) : nowGallery.length - 1;
      done = await waitUploaded(function () {
        return newOne && newOne.isConnected ? newOne : tryAll(document, D.PAGE.images.galleryShown)[at];
      });
    }
    if (block) {
      // The picture went to the gallery: take out its marker line, which the desk put there.
      selectInside(block);
      document.execCommand("delete", false);
      await sleep(D.PAGE.settleMs);
      var gone = !markerBlock(ed, img.marker);
      report.add(label, "look", "The text did not take the picture, so it went to the gallery above the title." +
        (gone ? " Its marker line was taken out." : " Delete the marker line " + img.marker + " by hand.") + (came && !done ? slow : ""));
      return came ? "gallery" : null;
    }
    if (came && done) report.add(label, "ok", "Added to the gallery above the title, and uploaded.");
    else if (came) report.add(label, "look", "Added to the gallery above the title." + slow);
    else report.add(label, "look", "Sent to the page's picture box, but it did not show on the page. Check it is there.");
    return came ? "gallery" : null;
  }

  async function stepPictures(pkg, ed, report) {
    if (!pkg.images || !pkg.images.length) {
      report.add("Pictures", "skip", "None in this post.");
      return;
    }
    report._where = [];
    for (var i = 0; i < pkg.images.length; i++) {
      report._where.push(await onePicture(pkg.images[i], i + 1, ed, report));
    }
  }

  // The gallery's pictures, in page order, each with its own "..." menu:
  // a menu button belongs to a picture when the nearest box around the
  // button that holds any picture holds exactly one. (A menu with many
  // pictures around it, like a page's own top menu, is no picture's.)
  function galleryTiles() {
    var I = D.PAGE.images;
    var out = [];
    findAll(I.menuButtons).forEach(function (b) {
      var up = b.parentElement;
      for (var k = 0; k < 6 && up; k++) {
        var pics = tryAll(up, I.shown);
        if (pics.length === 1) { out.push({ menu: b, tile: up }); return; }
        if (pics.length > 1) return;
        up = up.parentElement;
      }
    });
    return out;
  }

  function openDialog() {
    var I = D.PAGE.images;
    for (var i = 0; i < I.dialog.length; i++) {
      var boxes = tryAll(document, I.dialog[i]).filter(shown).filter(function (b) {
        return !!findFirst(I.captionFields, { root: b });
      });
      if (boxes.length) return boxes[0];
    }
    return null;
  }

  // Opens a gallery picture's "Add Captions" box through its "..." menu.
  async function pictureDialog(tile) {
    var I = D.PAGE.images;
    var already = openDialog();
    if (already) return already;
    if (!tile || !safeClick(tile.menu)) return null;
    await sleep(D.PAGE.settleMs);
    var item = choiceByWords(D.PAGE.access.choices, I.menuWords);
    if (!item || !safeClick(item)) {
      pressKey(document.activeElement || document.body, "Escape");
      return null;
    }
    await sleep(D.PAGE.settleMs);
    return openDialog();
  }

  async function closeDialog(box, save) {
    var I = D.PAGE.images;
    var btn = save ? (hook(I.saveButtons, box) || tryAll(box, "button").filter(function (b) {
      return matches(I.saveWords, norm(b.textContent));
    })[0]) : hook(I.cancelButtons, box);
    if (btn) safeClick(btn);
    else pressKey(box, "Escape");
    await sleep(D.PAGE.settleMs);
  }

  // The alt text box: one of the known hooks, or any other text box in
  // the dialog than the caption.
  function altField(box) {
    var I = D.PAGE.images;
    var f = hook(I.altFields, box);
    if (f) return f;
    var caption = hook(I.captionFields, box);
    return tryAll(box, "textarea, input[type=\"text\"]").filter(shown).filter(function (e) {
      return e !== caption;
    })[0] || null;
  }

  function captionLimit(box) {
    var I = D.PAGE.images;
    var count = box ? hook([I.captionCount], box) : null;
    var m = count ? /of\s+(\d+)/i.exec(count.getAttribute("aria-label") || count.textContent || "") : null;
    return m ? parseInt(m[1], 10) : I.captionLimit;
  }

  // Closes a picture's "Edit image" panel: moves back into the text, past
  // the picture, so it is no longer selected. A post is scheduled with the
  // panel closed (Beth's live try, 6 November 2026: with it open, Schedule
  // was pressed and the page stayed in the editor).
  async function closeImagePanel(ed) {
    var N = D.PAGE.images.inline;
    if (ed) {
      ed.focus();
      caretAtEnd(ed);
    }
    pressKey(document.activeElement || document.body, "Escape");
    await waitFor(function () { return !hook(N.altFields) && !hook(N.captionFields); }, 3000);
  }

  // What goes where for one picture: its alt text, and its caption (its
  // own caption, or its description when the package asks for captions).
  function wordsFor(img, where) {
    return {
      alt: where === "alt" ? norm(img.alt) : "",
      caption: norm(img.caption) || (where === "caption" ? norm(img.alt) : "")
    };
  }

  // Types one text into one box, within its limit, and reports it (soft).
  function fillOne(field, text, limit, label, kind, report) {
    if (text.length > limit) {
      report.add(label, "look", "It has " + text.length + " characters, and the picture's " + kind + " takes " + limit +
        ". Nothing was cut. Shorten it.", false, true);
      return;
    }
    if (!field) {
      report.add(label, "look", "Could not find where the picture's " + kind + " goes. Add it by hand. The Copy button below has it.", false, true);
      return;
    }
    typeInto(field, text);
    var stayed = norm(textIn(field)) === text;
    field.dispatchEvent(new Event("blur", { bubbles: true }));
    report.add(label, stayed ? "ok" : "look", stayed ? "Filled the picture's " + kind + "." :
      "Typed the picture's " + kind + ", but could not read it back. Look.", stayed, true);
  }

  async function stepDescriptions(pkg, report) {
    var imgs = pkg.images || [];
    if (!imgs.length) return;
    var where = pkg.image_text || "alt";
    var I = D.PAGE.images;
    var N = I.inline;
    var placed = report._where || [];
    var k = 0;
    for (var i = 0; i < imgs.length; i++) {
      var img = imgs[i];
      var n = (i + 1) + " (" + img.name + ")";
      var w = wordsFor(img, where);
      var tile = placed[i] === "gallery" ? galleryTiles()[k++] : null;
      if (!w.alt && !w.caption) {
        if (where === "alt" || where === "caption") {
          report.add("Description " + n, "skip", "The package has no description for this picture.", false, true);
        }
        continue;
      }
      if (placed[i] === "text") {
        // Selecting the picture opens its "Edit image" panel beside the page.
        // The editor may have put a fresh copy of the picture in place once
        // it uploaded, so find it again by its place among the text's pictures.
        var seen = (report._inline || {})[i] || {};
        var pic = seen.el && seen.el.isConnected ? seen.el : (seen.index >= 0 ? tryAll(report._ed || document, D.PAGE.images.shown)[seen.index] : null);
        var opened = false;
        var began = Date.now();
        for (var tries = 0; !opened && (tries === 0 || Date.now() - began < D.PAGE.uploadWaitMs); tries++) {
          if (tries) {
            await sleep(D.PAGE.panelRetryMs);
            pic = seen.index >= 0 ? tryAll(report._ed || document, D.PAGE.images.shown)[seen.index] : pic;
          }
          if (pic && safePress(pic)) {
            opened = await waitFor(function () { return !!(hook(N.altFields) || hook(N.captionFields)); }, 2000);
          }
        }
        if (!opened || (!hook(N.altFields) && !hook(N.captionFields))) {
          report.add("Description " + n, "look", "This picture is in the text. Its Edit image panel did not open in " + secondsOf(D.PAGE.uploadWaitMs) + " seconds: click the picture and add " +
            (w.alt ? "its alt text" : "") + (w.alt && w.caption ? " and " : "") + (w.caption ? "its caption" : "") + " by hand. The Copy button below has them.", false, true);
          continue;
        }
        if (w.alt) fillOne(hook(N.altFields), w.alt, N.altLimit, "Alt text " + n, "alt text", report);
        if (w.caption) fillOne(hook(N.captionFields), w.caption, N.captionLimit, "Caption " + n, "caption", report);
        await closeImagePanel(report._ed);
        continue;
      }
      // The caption box opens once the picture has uploaded: keep asking.
      var box = null;
      if (placed[i] === "gallery") {
        var galleryAt = k - 1;
        var since = Date.now();
        var asked = 0;
        do {
          if (asked++) await sleep(D.PAGE.panelRetryMs);
          box = await pictureDialog(galleryTiles()[galleryAt] || tile);
        } while (!box && Date.now() - since < D.PAGE.uploadWaitMs);
      }
      if (!box) {
        report.add("Description " + n, "look", "Could not open the picture's caption box (its ... menu, Edit caption). Add the description there by hand. The Copy button below has it.", false, true);
        continue;
      }
      if (w.alt) {
        var sw = hook(I.altSwitch, box);
        if (sw) await setOn(sw, true);
        fillOne(altField(box), w.alt, 100000, "Alt text " + n, "alt text", report);
      }
      if (w.caption) fillOne(hook(I.captionFields, box), w.caption, captionLimit(box), "Caption " + n, "caption", report);
      await closeDialog(box, true);
    }
  }

  // Finds an element by its page hooks, or else by the words on it.
  function byHookOrWords(hooks, words) {
    return hook(hooks) || (words ? choiceByWords(D.PAGE.access.choices, words) : null);
  }

  async function stepAccess(pkg, report) {
    var A = D.PAGE.access;
    var acc = pkg.access || {};
    var card = byHookOrWords(acc.type === "paid" ? A.paid : A.free, A.words[acc.type] || []);
    if (!card) {
      report.add("Who sees it", "miss", "Could not find the \"" + (acc.type === "paid" ? "Paid access" : "Free access") + "\" choice. Set it by hand.");
      return;
    }
    if (!(await setOn(card, true))) {
      report.add("Who sees it", "miss", "Could not choose " + (acc.type === "paid" ? "Paid access" : "Free access") + ". Set it by hand.");
      return;
    }
    if (acc.type === "free") {
      report.add("Who sees it", "look", "Chose Free access.", true);
      return;
    }
    var said = ["Chose Paid access"];
    var checked = true;
    var members = hook(A.paidMembers);
    if (members) {
      if (await setOn(members, true)) said.push("paid members in the chosen tiers");
      else { said.push("could not tick the paid members box"); checked = false; }
    }
    var list = hook(A.tierList);
    if (acc.tiers === "all" || !acc.tiers) {
      if (list && matches(A.allTiers, shownWords(list))) said.push("all tiers");
      else { said.push("could not see that all tiers are chosen"); checked = false; }
    } else if (!list || !safeClick(list)) {
      said.push("could not open the tier list; choose " + acc.tiers.join(", ") + " by hand");
      checked = false;
    } else {
      await sleep(D.PAGE.settleMs);
      // "All tiers" in the list itself, not the button that opened it.
      var all = tryAll(document, A.tierChoices).filter(shown).filter(function (el) {
        return el !== list && matches(A.allTiers, wordsOf(el));
      })[0];
      if (all && isOn(all)) await setOn(all, false);
      var missing = [];
      for (var t = 0; t < acc.tiers.length; t++) {
        var box = choiceByName(A.tierChoices, acc.tiers[t], [list]);
        if (!box || !(await setOn(box, true))) missing.push(acc.tiers[t]);
      }
      pressKey(document.activeElement || document.body, "Escape");
      await sleep(D.PAGE.settleMs);
      if (missing.length) { said.push("could not choose " + missing.join(", ")); checked = false; }
      else if (matches(A.allTiers, shownWords(list))) { said.push("the tier list still says all tiers"); checked = false; }
      else said.push("tiers " + acc.tiers.join(", "));
    }
    var sell = hook(A.sell);
    var wantSell = !!acc.sell;
    if (sell) {
      if (await setOn(sell, wantSell)) said.push(wantSell ? "sold to others too" : "not sold");
      else { said.push("could not set Sell this post"); checked = false; }
    } else if (wantSell) {
      said.push("could not find Sell this post");
      checked = false;
    }
    report.add("Who sees it", checked ? "look" : "miss", said.join("; ") + "." + (checked ? "" : " Set the rest by hand."), checked);
  }

  async function stepCollection(pkg, report) {
    if (!pkg.collection) return;
    var C = D.PAGE.collection;
    var opener = choiceByWords(C.openers, C.openerWords);
    if (!opener || !safeClick(opener)) {
      report.add("Collection", "miss", "Could not find a way to add to a collection. Add the post to \"" + pkg.collection + "\" by hand.");
      return;
    }
    await sleep(D.PAGE.settleMs);
    var pick = choiceByName(C.choices, pkg.collection, [opener]);
    if (!pick) {
      pressKey(document.activeElement || document.body, "Escape");
      report.add("Collection", "miss", "There is no collection called \"" + pkg.collection + "\". Nothing was made. Make it on the page, or fix the package.");
      return;
    }
    if (!isOn(pick)) {
      safeClick(pick);
      await sleep(D.PAGE.settleMs);
    }
    var ok = (pick.isConnected && isOn(pick)) || shownWords(opener).toLowerCase().indexOf(norm(pkg.collection).toLowerCase()) !== -1;
    pressKey(document.activeElement || document.body, "Escape");
    report.add("Collection", ok ? "ok" : "look", ok ? "Added to \"" + pkg.collection + "\"." :
      "Chose \"" + pkg.collection + "\", but could not read it back. Check it.", ok);
  }

  async function stepTags(pkg, report) {
    if (!pkg.tags || !pkg.tags.length) return;
    var T = D.PAGE.tags;
    var input = hook(T.input);
    if (!input) { await openMoreSettings(); input = hook(T.input); }
    if (!input) {
      report.add("Tags", "miss", "Could not find the tags box. Add these by hand: " + pkg.tags.join(", ") + ".");
      return;
    }
    for (var i = 0; i < pkg.tags.length; i++) {
      var box = hook(T.input) || input;
      setField(box, pkg.tags[i]);
      pressKey(box, "Enter");
      await sleep(D.PAGE.settleMs);
    }
    // Read back: each tag's words near the box.
    var area = input;
    for (var k = 0; k < 4 && area.parentElement; k++) area = area.parentElement;
    var text = norm(area.textContent).toLowerCase();
    var missing = pkg.tags.filter(function (t) { return text.indexOf(norm(t).toLowerCase()) === -1; });
    if (!missing.length) report.add("Tags", "ok", "Added: " + pkg.tags.join(", ") + ".", true);
    else report.add("Tags", "look", "Typed the tags, but could not see these on the page: " + missing.join(", ") + ". Check them.");
  }

  async function stepComments(pkg, report) {
    if (!pkg.comments) return;
    var C = D.PAGE.comments;
    var want = C.words[pkg.comments];
    var list = hook(C.hooks);
    if (!list) { await openMoreSettings(); list = hook(C.hooks); }
    if (!list) {
      report.add("Comments", "miss", "Could not find Allow comments from. Set it by hand.");
      return;
    }
    if (matches(want, shownWords(list))) {
      report.add("Comments", "ok", "Already set to \"" + shownWords(list) + "\".", true);
      return;
    }
    var ok = false;
    if (list.tagName === "SELECT") {
      var opt = Array.prototype.slice.call(list.options).filter(function (o) { return matches(want, norm(o.textContent)); })[0];
      if (opt) { setField(list, opt.value); ok = matches(want, shownWords(list)); }
    } else if (safeClick(list)) {
      await sleep(D.PAGE.settleMs);
      var pick = tryAll(document, C.choices).filter(shown).filter(function (el) {
        return el !== list && matches(want, norm(el.textContent));
      })[0];
      if (pick && safeClick(pick)) {
        await sleep(D.PAGE.settleMs);
        ok = matches(want, shownWords(list));
      } else {
        pressKey(document.activeElement || document.body, "Escape");
      }
    }
    report.add("Comments", ok ? "ok" : "miss", ok ? "Set to \"" + shownWords(list) + "\"." : "Could not set who may comment. Set it by hand.", ok);
  }

  function writeDate(fmt, ymd) {
    var p = ymd.split("-");
    return fmt.replace("YYYY", p[0]).replace("MM", p[1]).replace("DD", p[2]);
  }

  function writeTime(fmt, hm) {
    var p = hm.split(":");
    var h = parseInt(p[0], 10);
    var h12 = ((h + 11) % 12) + 1;
    return fmt
      .replace("HH", p[0])
      .replace("hh", (h12 < 10 ? "0" : "") + h12)
      .replace("mm", p[1])
      .replace("A", h < 12 ? "AM" : "PM");
  }

  // This computer's short time zone name on that date, like EST.
  function pcZone(ymd, hm) {
    try {
      var parts = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date(ymd + "T" + (hm || "12:00") + ":00"));
      var z = parts.filter(function (p) { return p.type === "timeZoneName"; })[0];
      return z ? z.value : "";
    } catch (e) {
      return "";
    }
  }

  // The time zone the page shows beside the time box.
  function pageZone(timeBox) {
    var rx = D.PAGE.schedule.zoneWords;
    var up = timeBox;
    for (var k = 0; k < D.PAGE.schedule.zoneLevels && up; k++) {
      var hit = tryAll(up, D.PAGE.schedule.zoneIn).filter(function (e) {
        return e.children.length === 0 && rx.test(norm(e.textContent));
      })[0];
      if (hit) return norm(hit.textContent);
      up = up.parentElement;
    }
    return "";
  }

  async function stepSchedule(pkg, report) {
    var S = D.PAGE.schedule;
    if (!pkg.schedule || !pkg.schedule.date) {
      report.add("Publish date", "skip", "No date in the package. It goes out when you press Publish.");
      return;
    }
    var date = findFirst(S.date);
    if (!date) {
      var opener = findFirst(S.openers);
      var el = opener ? opener.el : choiceByWords(S.openerChoices, S.openerWords);
      if (el) await setOn(el, true);
      date = findFirst(S.date);
    }
    var said = pkg.schedule.date + (pkg.schedule.time ? " at " + pkg.schedule.time : "");
    if (!date) {
      report.add("Publish date", "miss", "Could not find the date box. Set the publish date by hand: " + said + ".");
      return;
    }
    var dv = date.el.type === "date" ? pkg.schedule.date : writeDate(S.dateText, pkg.schedule.date);
    if (date.el.type === "date" && ((date.el.min && dv < date.el.min) || (date.el.max && dv > date.el.max))) {
      report.add("Publish date", "miss", "The page only takes dates from " + (date.el.min || "now") + " to " + (date.el.max || "any date") + ", and this post is dated " + dv + ".");
      return;
    }
    setField(date.el, dv);
    var ok = date.el.value === dv;
    var time = null;
    if (pkg.schedule.time) {
      time = findFirst(S.time);
      if (!time) {
        report.add("Publish date", "miss", "Set the date, but could not find the time box. Set the time by hand: " + pkg.schedule.time + ".");
        return;
      }
      var tv = time.el.type === "time" ? pkg.schedule.time : writeTime(S.timeText, pkg.schedule.time);
      setField(time.el, tv);
      ok = ok && time.el.value === tv;
    }
    if (!ok) {
      report.add("Publish date", "miss", "The date or time box did not keep what was typed. Set " + said + " by hand.");
      return;
    }
    var opened = findFirst(S.openers);
    var switchOn = opened ? isOn(opened.el) : true;
    var shownZone = time ? pageZone(time.el) : "";
    var mine = pcZone(pkg.schedule.date, pkg.schedule.time);
    if (shownZone && mine && shownZone !== mine) {
      report.add("Publish date", "miss", "The page's time zone is " + shownZone + ", but this computer's is " + mine +
        " for that date, and the package's time is this computer's time. Set the time by hand, or match the two zones.");
      return;
    }
    var zoneSays = shownZone ? " The page's time zone, " + shownZone + ", matches this computer's." :
      " Could not read the page's time zone: check it is the one you meant.";
    report.add("Publish date", "look", "Filled " + said + "." + zoneSays, switchOn && !!pkg.schedule.time && !!shownZone);
  }

  function newReport(pkg) {
    var items = [];
    return {
      title: pkg.title,
      name: pkg.name || "",
      items: items,
      notes: (pkg.notes || []).slice(),
      alts: (pkg.images || []).map(function (i) { return { name: i.name, alt: i.alt || "", caption: i.caption || "" }; }),
      // checked: a LOOK whose result was read back from the page and matched.
      // soft: never stops a batch.
      add: function (part, status, say, checked, soft) {
        items.push({ part: part, status: status, say: say, checked: !!checked, soft: !!soft });
      }
    };
  }

  // Fills the page. Returns the report. Never presses Publish or Schedule.
  D.fill = async function (pkg) {
    var report = newReport(pkg);
    if (!findFirst(D.PAGE.title) && !bodyEditor()) {
      report.add("Page", "miss", "This does not look like Patreon's post editor: no title box and no text box were found. Open a new post, or, if it is open, the page may have changed (see the guide).");
      return report;
    }
    var steps = [
      ["Title", function () { return stepTitle(pkg, report); }],
      ["Text", async function () { report._ed = await stepBody(pkg, report); }],
      ["Pictures", function () { return stepPictures(pkg, report._ed, report); }],
      ["Picture descriptions", function () { return stepDescriptions(pkg, report); }],
      ["Who sees it", function () { return stepAccess(pkg, report); }],
      ["Collection", function () { return stepCollection(pkg, report); }],
      ["Tags", function () { return stepTags(pkg, report); }],
      ["Comments", function () { return stepComments(pkg, report); }],
      ["Publish date", function () { return stepSchedule(pkg, report); }]
    ];
    for (var i = 0; i < steps.length; i++) {
      if (i === 2 && report.notFresh) {
        report.add("The rest", "miss", "Stopped here, because the page was not empty, so nothing is added twice. To fill this post, open a new post and press Fill again.");
        break;
      }
      try {
        await steps[i][1]();
      } catch (e) {
        report.add(steps[i][0], "miss", "Stopped with an error: " + (e && e.message ? e.message : e) + ". Do this part by hand.", false, steps[i][0] === "Picture descriptions");
      }
      await sleep(D.PAGE.settleMs);
    }
    delete report._ed;
    delete report._where;
    delete report._inline;
    delete report.notFresh;
    return report;
  };

  // True when the page shows a title box or a text box.
  D.formReady = function () {
    return !!(findFirst(D.PAGE.title) || bodyEditor());
  };

  // Batch mode: may this filled post be scheduled? Every part must be OK,
  // or LOOK with its result read back and matched, or NONE (but the
  // publish date must be there). Soft parts (captions) never stop it.
  D.batchVerdict = function (report) {
    var blocking = report.items.filter(function (it) {
      if (it.soft) return false;
      if (it.status === "ok") return false;
      if (it.status === "look" && it.checked) return false;
      if (it.status === "skip" && it.part !== "Publish date") return false;
      return true;
    });
    return { pass: blocking.length === 0 && report.items.length > 0, blocking: blocking };
  };

  // For the tests and the overlay.
  D.safeClick = safeClick;
  D.isForbidden = isForbidden;
  D.wordsOf = wordsOf;
  D.writeDate = writeDate;
  D.writeTime = writeTime;
  D.pcZone = pcZone;
})();

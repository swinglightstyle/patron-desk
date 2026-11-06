/*
  The version of the desk's files. It must match "version" in
  manifest.json (a test checks). The desk page reads its files fresh from
  disk, but the part that runs on Patreon's page and the manifest are only
  read again when the extension is reloaded in chrome://extensions. So the
  desk compares this number with the filler's and the manifest's, and
  refuses to fill with an old filler.
*/
(function () {
  "use strict";
  var D = (globalThis.PatronDesk = globalThis.PatronDesk || {});
  D.VERSION = "0.6.3";
})();

/*
  The desk's memory, kept in this browser only (IndexedDB inside the
  extension): the chosen folder, and the date each package was filled.
  No login, no cookie and no part of Patreon's page is ever kept here.
*/
(function () {
  "use strict";
  var D = (globalThis.PatronDesk = globalThis.PatronDesk || {});
  var DB = "patron-desk";
  var STORE = "kv";

  function open() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function run(mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var req = fn(tx.objectStore(STORE));
        tx.oncomplete = function () { resolve(req && req.result); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  D.store = {
    get: function (key) { return run("readonly", function (s) { return s.get(key); }); },
    set: function (key, value) { return run("readwrite", function (s) { return s.put(value, key); }); }
  };
})();

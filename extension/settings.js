/*
  Beth's choices for how the desk works. This is their one home: every
  part of the desk reads them here. Change a value here and it is the new
  rule. (Facts about Patreon's page live in selectors.js instead.)
*/
(function () {
  "use strict";
  var D = (globalThis.PatronDesk = globalThis.PatronDesk || {});

  D.SETTINGS = {
    // A post is scheduled only if its time is at least this many minutes
    // away. Beth, 6 November 2026: "Make it 5."
    earliestMinutes: 5
  };
})();

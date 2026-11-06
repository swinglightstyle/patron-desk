/*
  Clicking the extension's button opens the desk in a tab, or goes to it
  if it is open. A Patreon tab opened by go-live opens it on that batch.
  The desk is a tab, not a small popup, because a popup closes the moment
  a folder picker opens, and the pick is lost.
*/
async function openDesk(query) {
  var url = chrome.runtime.getURL("desk.html");
  // The extension's own open pages, found without any extra permission.
  var open = (await chrome.runtime.getContexts({ contextTypes: ["TAB"] })).filter(function (c) {
    return (c.documentUrl || "").indexOf(url) === 0;
  });
  if (open.length) {
    // A desk already on this batch is left as it is: it may be part way through.
    var same = query && open[0].documentUrl.indexOf(query.split("&")[0]) !== -1;
    await chrome.tabs.update(open[0].tabId, query && !same ? { active: true, url: url + query } : { active: true });
    await chrome.windows.update(open[0].windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url: url + (query || "") });
  }
}

chrome.action.onClicked.addListener(function () {
  openDesk("");
});

// A Patreon tab opened by go-live, with a batch marker: open the desk on that batch.
chrome.runtime.onMessage.addListener(function (msg, sender) {
  if (sender.id !== chrome.runtime.id || !msg || msg.type !== "patron-desk-batch-marker") return;
  if (!/^[0-9a-z-]{1,40}$/.test(String(msg.batch)) || !sender.tab) return;
  openDesk("?batch=" + encodeURIComponent(msg.batch) + "&tab=" + sender.tab.id);
});

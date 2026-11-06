/*
  Every place the patron desk touches on Patreon's page is named in this
  one file. If Patreon changes its page and the checklist shows a miss,
  this is the only file to change. Each entry is a list: the first one
  that matches is used, so an old and a new selector can sit side by side.

  BUILT FROM: Beth's two saved copies of Patreon's new post page, 6
  November 2026, in reference/ (new-post-plain.html, saved whole, and
  new-post-open.html, copied from the browser's developer tools with the
  publish date on, a picture added and its caption box open), read with
  tools/reference_page.py. Entries marked CONFIRMED are on those pages.
  Entries marked GUESS are not on them (a list that was closed, or a box
  that opens only after a click) and come from Beth's screenshots of the
  same day or from reading how an open source tool (PatreonPostApi, last
  changed 20 May 2026) finds the fields; its code was read to learn the
  page, not copied.

  The page saves a draft by itself as soon as anything is filled, and its
  address becomes /posts/<id>/edit.
*/
(function () {
  "use strict";
  var D = (globalThis.PatronDesk = globalThis.PatronDesk || {});

  // Choices a person clicks: radio cards, tick boxes, switches, buttons, menu items.
  var CHOICE = 'input[type="radio"], input[type="checkbox"], [role="radio"], [role="checkbox"], [role="switch"], ' +
    '[role="option"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], button';
  // Things that open a list.
  var OPENER = 'select, [role="combobox"], [aria-haspopup], button';

  D.PAGE = {
    builtFrom: "reference/new-post-plain.html and new-post-open.html, 6 November 2026",

    // Which tabs the desk looks in, and which of them is a post editor.
    tabUrls: ["https://www.patreon.com/*"],
    newPostUrl: /patreon\.com\/(.*\/)?posts\/(new|[^\/?#]+\/edit)/i,

    // Batch mode. The new post page's address (go-live opens it, with the
    // marker after it); GUESS, from the open source tool. While the address
    // matches stillEditing, the post has not gone out.
    newPostPage: "https://www.patreon.com/posts/new",
    // CONFIRMED by the go-live log of 6 November 2026: after a Schedule that
    // took, the page went to https://www.patreon.com/posts/published.
    // GUESS: Patreon's sign-in pages. If a new window lands on one, the
    // desk stops and asks Beth to sign in there.
    signInUrl: /patreon\.com\/(login|signup|sign-in|signin|auth)\b/i,
    stillEditing: /\/posts\/(new|[^\/?#]+\/edit)\b/i,
    batchMarker: "#patron-desk-batch=",

    // Batch mode only: the page's own Schedule button, pressed after every
    // check passes. Publish is never pressed. A button is pressed only if
    // it matches a hook here, its words match "words", none of "wrongWords",
    // and it is not marked disabled. CONFIRMED: the hook, the word
    // "Schedule" and the aria-disabled mark. GUESS: whether a confirm box
    // follows; if one does, its button must match "confirmWords".
    scheduleButton: {
      hooks: ['[data-tag="make-a-post-action-schedule_post"]'],
      words: [/^schedule\b/i],
      confirmWords: [/^schedule\b/i, /^confirm\b/i, /^yes, schedule\b/i],
      wrongWords: [/publish/i, /post now/i, /send now/i]
    },

    // The post's title. CONFIRMED.
    title: [
      'textarea[aria-label="Title"]',
      'textarea[placeholder="Title"]',
      'input[placeholder="Title"]'
    ],

    // The text: a rich text editor (Remirror, built on ProseMirror). Text
    // goes in through its own paste. CONFIRMED.
    body: [
      '[aria-label="Text input field for post content"][contenteditable="true"]',
      '[data-tag="text-editor-remirror-wrapper"] [contenteditable="true"]',
      '.ProseMirror[contenteditable="true"]'
    ],

    // Blocks inside the text that can hold an image marker line.
    bodyBlocks: "p, div, li, h1, h2, h3, h4, h5, h6",

    images: {
      // The picture box. CONFIRMED: the page has two boxes with this id;
      // the one for pictures only (no video) is the gallery's.
      fileInput: [
        'input#photosInput:not([accept*="video"])',
        "input#photosInput",
        'input[type="file"][accept*="image"]'
      ],
      // Some pages show the picture box only after a button is pressed.
      fileOpenerChoices: 'button, [role="button"]',
      fileOpeners: [/^\+?\s*add image\b/i, /^browse\b/i],
      // Any picture, and a picture in the gallery. CONFIRMED.
      shown: "img",
      galleryShown: 'img[data-tag="gallery-image"]',
      // Each gallery picture's "..." menu. CONFIRMED: the button. GUESS: the
      // menu's "Edit caption" item (from the screenshots; the menu was closed).
      menuButtons: [
        'button[aria-label="Menu for additional actions on the uploaded media"]',
        'button[aria-label*="additional actions" i]'
      ],
      menuWords: [/^edit caption\b/i],
      // "Edit caption" opens the "Add Captions" box. CONFIRMED: the box, its
      // switch "Include alt text to describe your image", the caption box
      // (at most 140 characters, its count shown as "0 of 140"), and Save.
      dialog: ["#add-captions-dialog", '[role="dialog"]'],
      altSwitch: ['[role="switch"][aria-labelledby="alt-text-toggle-label"]', '#add-captions-dialog [role="switch"]'],
      // The alt text box, shown once the switch is on. CONFIRMED by Beth on
      // 6 November 2026 (the box's markup, copied from the page): a text
      // area with the hook alt-text-input and the placeholder "Alt text",
      // with no character limit shown. The rest are fallbacks; if none
      // match, any other text box in the dialog than the caption is used.
      altFields: [
        'textarea[data-tag="alt-text-input"]',
        'textarea[data-tag*="alt-text" i]',
        'textarea[placeholder*="alt" i]',
        'textarea[aria-label*="alt" i]',
        'input[data-tag*="alt-text" i]',
        'input[placeholder*="alt" i]',
        'input[aria-label*="alt" i]'
      ],
      captionFields: [
        'textarea[data-tag="caption-text-input"]',
        'textarea[placeholder="Caption"]'
      ],
      // A picture in the text: selecting it opens an "Edit image" panel
      // beside the page with "Add caption" (140 characters) and "Add alt
      // text" (2000 characters). CONFIRMED by Beth's screenshot of 6
      // November 2026: the words and limits. GUESS: whether the boxes are
      // text areas or plain boxes (no markup copied yet).
      inline: {
        altFields: ['textarea[placeholder^="Describe this image"]', 'input[placeholder^="Describe this image"]'],
        captionFields: ['textarea[placeholder^="Write a caption"]', 'input[placeholder^="Write a caption"]'],
        altLimit: 2000,
        captionLimit: 140
      },
      captionCount: '[data-tag="caption-text-input-charCount"]',
      captionLimit: 140,
      saveButtons: ['button[data-tag="caption-save-button"]'],
      cancelButtons: ['button[data-tag="dialog-action-secondary"]', 'button[data-tag="dialog-close-icon"]'],
      saveWords: [/^save$/i]
    },

    access: {
      // CONFIRMED: two radio cards, "Free access" (value public) and "Paid
      // access" (value paid); under paid, the paid members tick box, the
      // tier list (labelled "Select tiers", showing "All tiers") and "Sell
      // this post". CONFIRMED by Beth's copy of the button, 6 November
      // 2026: the tier list opens a menu (aria-haspopup="menu"), its words
      // "All tiers" inside it. GUESS: the menu's choices are menu items with
      // a tick, named by tier (it was closed).
      free: ['input[type="radio"][value="public"]', 'input[type="radio"][aria-label="Free access"]'],
      paid: ['input[type="radio"][value="paid"]'],
      choices: CHOICE,
      words: {
        "free": [/^free access\b/i],
        "paid": [/^paid access\b/i]
      },
      paidMembers: ["#paid-members-toggle"],
      sell: ["#sell-post-toggle"],
      tierList: ['button[aria-label="Select tiers"]'],
      allTiers: [/^all tiers\b/i],
      tierChoices: CHOICE
    },

    // NOT USED (Beth, 6 November 2026: collections are not for her). Off
    // unless a package names one. GUESS and untested: with no collections
    // the page shows only "Create collection" here, which is never pressed.
    collection: {
      openers: 'button, [role="button"], [role="combobox"]',
      openerWords: [/^\+?\s*add to collection\b/i, /^collections?\b/i],
      choices: CHOICE
    },

    // "More settings" is open on the saved pages; kept in case it folds.
    moreSettingsOpeners: 'button, [role="button"], summary',
    moreSettingsWords: [/^more settings\b/i],

    comments: {
      // CONFIRMED: the list, showing its current choice ("Anyone with
      // access" or, chosen, "No one"; Beth's screenshot of 6 November
      // 2026). GUESS: the role of the choices in the open list.
      hooks: ["#post-editor-comments-access-menu"],
      words: {
        "anyone": [/^anyone with access\b/i, /^anyone\b/i],
        "no-one": [/^no one\b/i, /^nobody\b/i]
      },
      choices: CHOICE + ", option"
    },

    tags: {
      // CONFIRMED: the box. GUESS: Enter adds a tag, and the tag shows near the box.
      input: [
        'input[data-tag="tags-auto-complete"]',
        'input[placeholder^="Start typing"]'
      ]
    },

    schedule: {
      // CONFIRMED: the switch, the date box (the browser's own date box,
      // so its value is written 2026-11-10), the time box (the browser's
      // own time box, 09:00), and the account's time zone (like EST) in
      // the same section.
      openers: ["#scheduled-for-toggle"],
      openerChoices: CHOICE,
      openerWords: [/^set publish date\b/i],
      date: ["input#date", 'input[type="date"]'],
      time: ['input[type="time"]'],
      // Only used if a box is plain text. Tokens: YYYY MM DD; HH (24 hour), hh (12 hour), mm, A (AM or PM).
      dateText: "MM/DD/YYYY",
      timeText: "hh:mm A",
      zoneIn: "span, div, p, small, label, abbr",
      zoneWords: /^[A-Z]{2,5}$/,
      // How far up from the time box to look for the zone.
      zoneLevels: 7
    },

    // CONFIRMED by Beth's screenshot of 6 November 2026: with no publish
    // date set, the top bar shows "Publish" where "Schedule" was.
    // The desk never clicks these. The buttons that send a post out, and
    // ones that delete or make things. Matched by their page hooks, and by
    // a button's own words. Any submit button is refused too.
    neverClickHooks: '[data-tag^="make-a-post-action"], button[type="submit"], input[type="submit"]',
    neverClick: [
      /^publish\b/i,
      /^schedule$/i,
      /^schedule post\b/i,
      /^post\b/i,
      /^send\b/i,
      /^update\b/i,
      /^save (and|&) publish\b/i,
      /^save without notifying\b/i,
      /^delete\b/i,
      /^\+?\s*create collection\b/i,
      /^preview\b/i,
      /^more actions\b/i
    ],

    // Waiting, in milliseconds: after each step, and for an upload.
    settleMs: 400,
    // A picture takes a few seconds to upload (Beth, 6 November 2026), and
    // the next step waits for it. It counts as loaded when its picture is
    // the uploaded one, not a preview the browser makes while it uploads
    // ("pendingSrc"); when it has drawn; and when nothing around it is
    // marked as still loading ("uploading", GUESS: these marks are not on
    // the saved pages). Every picture gets at least pictureSettleMs, and
    // at most uploadWaitMs.
    pictureSettleMs: 3000,
    // The surest sign a picture has uploaded is that its panel or caption
    // box will open. Until then the desk presses it again every
    // panelRetryMs, up to uploadWaitMs (Beth, 6 November 2026: on the live
    // page it tried before the picture had loaded).
    panelRetryMs: 2000,
    uploadWaitMs: 60000,
    pendingSrc: /^(blob:|$)/i,
    uploading: '[aria-busy="true"], [role="progressbar"], [data-tag*="loading" i], [data-tag*="spinner" i], [data-tag*="progress" i]',
  };
})();

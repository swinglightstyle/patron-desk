# Patron desk

> **Unofficial.** Patron desk is not made by, endorsed by or affiliated with Patreon. It fills in Patreon's post editor in your own signed-in browser, and presses Schedule only when you ask and every check passes. You are responsible for how you use it: read Patreon's terms first (see "Before relying on it" below). Patreon's page changes from time to time; when it does, `extension/selectors.js` is the one file to update.
>
> **Free.** Dedicated to the public domain under CC0 1.0 (see LICENSE). No warranty of any kind.
>
> **Where it came from.** Built on 6 November 2026 by Beth (SwingLightStyle) with Claude, for her first patron post: https://www.patreon.com/SwingLightStyle/posts/human-and-bevy-174608200. This guide keeps the story of how it was built: her words, and the reason for each choice. Where it says Beth, read: you.

A small browser extension of Beth's own. It fills in the new post form on Patreon from a post package on this PC, so a week of posts takes minutes.

Three ways to use it:

- **One post:** press Fill on the desk. It fills the form and stops. Beth reads it and presses Publish or Schedule herself.
- **One post, scheduled:** set its date and time on the desk and press Fill and schedule. After Beth's yes, it fills the post, checks every part, and presses the page's own Schedule button, only if all of it passed.
- **A week's batch:** run `go-live`. It shows the coming week's posts, Beth reads them and types yes, and the extension fills each one and presses the page's own Schedule button for it, only when every check passes. It never presses Publish.

Everything stays on this PC. There is no server, nothing listens on the network, no login or cookie is kept anywhere, and no outside service sees a post before Beth publishes it.

## What is here

- `extension/`: the extension. Plain files, no build step, nothing to install.
  - `selectors.js`: every place it touches on the page. If the page changes, this is the one file to fix.
  - `settings.js`: Beth's choices for how the desk works (so far, how soon a post may be scheduled). Change a value there and it is the new rule.
  - `filler.js`: fills the form. `overlay.js`: the checklist shown after a fill. `desk.html` and `desk.js`: the desk, where the queue is.
- `go-live.ps1` (Windows) and `go-live.sh` (Mac): approve and run a week's batch.
- `desk.py`: turns a patron bank ready folder into a package, checks packages, and shows and approves batches. `desk_md.py`, `desk_package.py` and `desk_batch.py` are its parts.
  - `scheduler.js` (in `extension/`): the only file that may press Schedule, and only in an approved batch.
- `packages/`: the packages, one folder per post, plus `_batches/` (approvals and preview pages) and `go-live-log.txt` (one line per post per run). Kept on this PC only, not in git.
- `reference/`: a saved copy of the new post page, for building the selectors. Kept on this PC only, not in git.
- `docs/PACKAGE-FORMAT.md`: what is in a package.
- `tests/` and `tools/`: the checks.
- `places.json`: this PC's folders. On another PC, change this file only.

## First, once: save the new post page

Done on 6 November 2026: Beth saved two copies (new-post-plain.html and new-post-open.html), and the selectors are built from them. See "What the saved pages confirmed" below. Save the page again the same way whenever the checklist shows a miss.

1. In Chrome, signed in to Patreon, open the new post page (Create, then a text post). Leave it empty.
2. Press Ctrl and S (Cmd and S on a Mac). Choose "Webpage, Complete". Save it into the `reference` folder inside your patron-desk folder with the name `new-post.html`.
3. Optional and helpful: choose Paid access and open the tier list; turn on Set publish date; open More settings and the Allow comments from list; open Add to collection; upload any test picture and open its "..." menu, then Edit caption. Save the page again after each, as `new-post-2.html`, `new-post-3.html` and so on. Then take the test picture out. (The page saves a draft by itself; delete that draft afterwards from the "..." menu at the top.)
4. Tell the lead it is there.

A page saved while signed in holds Beth's account details: likely her email address, account numbers, and the keys that keep her signed in. How it is kept safe:

- `reference\` (with the saved files folder beside the page) and the test copies in `tests\pages\generated\` are left out of git, and this repository has no remote. Tests check both.
- A model reads the saved page only through `tools/reference_page.py`, never by opening it:
  - `scan` runs first. It says what kinds of private values are in the page and how many, never the values themselves. The model tells Beth what it found.
  - `survey` lists the form's boxes and buttons by their hooks. It skips scripts, stored data and hidden fields, and masks anything that looks like an email address, a key or an account number.
  - `make-test` makes a test copy without the page's scripts, hidden fields or meta tags, with private values masked.
- Nothing from the saved page is printed, logged or copied into the repository.
- Once the selectors are checked, Beth may move the saved page out of `reference\` to wherever she keeps private things, or keep it for the next fix. Signing out of Patreon and back in makes the keys in it stale.

## Loading the extension (once)

1. In Chrome, open the address `chrome://extensions`.
2. Turn on "Developer mode", the switch at the top right. This is Beth's switch to flip.
3. Press "Load unpacked" and choose the folder the `extension` folder inside your patron-desk folder.
4. "Patron desk" shows in the list. Pin it: press the jigsaw piece by the address bar, then the pin beside Patron desk.

After any change to the extension's files, press the round arrow on its card in `chrome://extensions`, then reload the new post page.

Chrome may show a note about developer mode extensions when it starts. That is expected for an extension loaded this way.

## Making a package

From your patron-desk folder:

    python -B desk.py convert path\to\post-01-ready
    python -B desk.py check

The ready folder is only read. The package goes into `packages\`, named after the folder without "-ready". Nothing is written over: a second convert of the same post stops and asks for a new name (`--name`).

Options (each has a plain default; see docs/PACKAGE-FORMAT.md):

- Who sees it: `--access free`, or `--access paid` with `--tiers "Tier A,Tier B"` (all tiers if left out) and `--sell` (off if left out). Without these, the post's WHO SEES IT line decides: Public or Free is free, Paid or Members is paid to all tiers, `Tiers: A, B` is paid to those tiers.
- Pictures: `--image-place gallery` (the default: the post's gallery above the title) or `inline` (in the text, at each `[IMAGE: ...]` line). `--images a.png,b.png` for other pictures than the post's `[IMAGE: ...]` lines.
- Picture descriptions: `--image-text alt` (the default) puts each picture's description from alt-text.txt in its alt text. On Patreon that is inside the picture's "..." menu, Edit caption, which opens an "Add Captions" box with a switch, "Include alt text to describe your image" (found on the saved page of 6 November 2026; the screenshots showed only the menu). `caption` puts it in the caption instead, which takes at most 140 characters: a longer description is not cut, it is left for Beth and the checklist says so. `body` puts a line "Image description: ..." in the text next to the picture, and `none` leaves it out.
- Captions of their own: a `captions.txt` in the ready folder, with lines like `overview.png: a line shown under the picture` (140 characters at most). A picture can have both its alt text and its own caption.
- `--collection NAME` (not used: Beth, 6 November 2026, "Collections don't make sense for me". It stays off unless given, is untested, and the desk never makes a collection), `--tags "a,b"`, `--comments anyone` or `no-one` (left as the page has it if not given).
- `--date 2026-11-10 --time 09:00` for the publish date, in this computer's time.

`check` gives each package READY, NEEDS LOOK (a warning, such as a picture with no description) or BLOCKED (it cannot be filled until fixed). An older package (format 1, from before 6 November 2026's screenshots) is BLOCKED: set it aside in `packages\set-aside\` and convert again.

## Filling a post

1. Press the Patron desk button. The desk opens in its own tab.
2. The first time only: press "Choose the packages folder" and pick the `packages` folder inside your patron-desk folder, and allow it to read and save changes. After the browser restarts, press "Allow reading the folder again".
3. Press Fill beside the post. The desk opens Patreon's new post page in a new window and checks that you are signed in:
   - Signed in: it fills the fresh post and says "Signed in. Filled a fresh post in a new window."
   - Not signed in: it fills nothing and says so. Sign in in that window, then press Fill again.
   - Somewhere else: it fills nothing and says where the window went. If you are signed in, the new post page's address may have changed (`newPostPage` in selectors.js).
4. A checklist shows on the page, top right. Each line is one of:
   - OK: filled and checked.
   - LOOK: done, but look at it (who sees it and the publish date are always LOOK, so they are seen).
   - MISSED: not done. Do it by hand.
   - NONE: nothing asked.
   It also lists the post's notes, and has a Copy button for each picture's alt text and caption.
5. The little copy box (two squares, beside Close on the checklist, and under "Last fill" and the batch on the desk) copies the results as plain lines, with the date and the extension's version, ready to paste into a message. It shows a tick once copied, and says "Copy failed" on the box if the page refused; then select the text and copy it by hand. It copies nothing from the page itself.
6. Read the post through, preview it on a phone, then press Publish or Schedule yourself.

The page saves a draft by itself as soon as anything is filled. A fill that stops part way leaves a draft: finish it, or delete it from the "..." menu at the top of the page (the desk never deletes anything).

After any change to the extension's files, press the round arrow on its card in `chrome://extensions`. The version on the copied results says which build ran.

## Scheduling one post from the desk

Each post on the desk has a date box and a time box, filled from the package if it has a date, and changeable there. The package itself stays as it is; the date used goes in the go-live log.

1. Set the date and time (this computer's time).
2. Press **Fill and schedule**. If the time is past or less than 5 minutes away, it says so and opens nothing.
3. It asks once: schedule this post for this date and time? Anything but yes stops.
4. It opens a fresh new post in a new window, checks you are signed in, fills it, and checks every part, the same checks as the batch (Patreon's time zone must match this computer's). If all of it passed, it presses Schedule, waits for the page to leave the editor, and writes "scheduled" in `packages\go-live-log.txt`, so a later batch leaves it out.
5. If any check misses, it presses nothing, leaves the post filled in the new window, and logs it as stopped.

It never presses Publish. A scheduled post can be changed or removed on Patreon before it goes out.

## A week's batch: go-live

Models queue packages up to three weeks ahead, each with its date and time (`--date` and `--time` when converting). Once a week, Beth runs the coming week's batch.

1. Open your patron-desk folder, right click `go-live.ps1`, and choose "Run with PowerShell". (Or in a PowerShell window there: `powershell -ExecutionPolicy Bypass -File go-live.ps1`. On a Mac, in a terminal there: `sh go-live.sh`.)
2. It lists every post dated from today to seven days ahead that is not yet scheduled, and names any it left out, with the reason. It opens a preview page with every post in full: who sees it, the other settings, the text, and the pictures with their descriptions. Read it.
3. Type yes in the console to approve that batch. Anything else stops, and nothing is approved. Yes approves only the posts listed, as they are now: if a post changes after this, it is not scheduled.
4. Chrome opens on Patreon's new post page, and the desk opens beside it on that batch. Press **Start the batch**. That one press is the only click. (The first time, and after the browser restarts, the desk may first ask to choose or allow the packages folder: choose the `packages` folder inside your patron-desk folder, allow it to save changes, then press Start.)
5. For each post, in date order, the desk opens a fresh new post page, fills it, and runs every check. If every check passes, it presses the page's Schedule button, waits for the page to move on, and writes a line in `packages\go-live-log.txt`. If any check misses, it stops on that post and leaves it filled in the tab for Beth. Nothing after it is touched.
6. At the end, the desk says how many were scheduled. Look once in Patreon's scheduled posts.

Running go-live again is safe: posts the log shows as scheduled are left out.

What makes a post fail the batch's checks, and stop it:

- Any part MISSED, or a LOOK that could not be read back from the page (such as a picture that went to the file picker instead of its marker line).
- An editor's note still in the text, like `[SUGGESTED LINE ...]`. Go-live leaves such a post out of the batch. Settle the note in the ready folder, set the old package aside in `packages\set-aside\`, and convert again.
- No date or no time, a time less than 5 minutes away, or a date the page does not take.
- An approval from before yesterday: run go-live again.

Times: a package's time is this computer's own time. The page shows the account's time zone beside the time box (EST in Beth's screenshots). The desk reads that zone and compares it with this computer's zone on that date: if they differ, it stops on that post rather than schedule it at the wrong hour. The help pages do not say how far ahead a post can be scheduled. If the page's date box has a limit, the desk reads it and stops on a post outside it.

How the desk knows a post went out: the page saves a draft by itself, at an address ending in /edit, as soon as anything is filled, so the address alone does not say. After Schedule, the desk counts the post as scheduled when the page leaves the editor (it has gone to the published posts list), or when it stays in the editor but its Schedule button has gone or changed. If the button still says Schedule, the desk cannot tell: it logs the post as "unconfirmed", asks Beth to look in Patreon's scheduled posts, and leaves it out of later batches, so it is never scheduled twice. Go-live names it. (Beth, 6 November 2026: a post the desk had logged as stopped had in fact been scheduled.)

Picture descriptions never stop a batch: if alt text or a caption cannot be set, the post is still scheduled, the checklist says so, and the log line names the picture left without one.

## What the saved pages confirmed

Read on 6 November 2026 from Beth's two saved copies, through `tools/reference_page.py` only. The pages held 7 email addresses each (3 of them Patreon's own, the other 4 most likely Beth's account address, 2 different ones) and one key tag in the page header. No session keys were in them. None of these was printed, and the test copies hold none of them. `selectors.js` marks each entry CONFIRMED or GUESS.

Confirmed on the page:

- The title box, and the text box (a Remirror editor, built on ProseMirror, so text goes in through its own paste).
- The picture box (the page has two with the same name; the one for pictures only is the gallery's), each gallery picture with its own "..." menu, and the "Add Captions" box that Edit caption opens: the "Include alt text to describe your image" switch, the caption box (140 characters at most) and Save.
- The alt text box that the switch shows ("Alt text", with no character limit shown), from its markup, which Beth copied from the page.
- From Beth's own queued post (screenshots of 6 November 2026): a picture in the text with its caption shown under it, tags shown as chips in the tags box ("AI Hourglass Lives", "The Village"), and comments set to "No one".
- A picture in the text, once selected, opens an "Edit image" panel beside the page with "Add caption" (140 characters) and "Add alt text" (2000 characters), and also Crop, Add link, Replace and a red Delete, which the desk never presses (Beth's screenshot). The desk selects the picture with a full press (the editor selects on the mouse going down) and fills the alt text, or the caption if asked.
- For a paid post, the text box shows a line, "Paid access starts here". The desk pastes the text after anything already in the box and never selects over it, and does not count that line as words already there.
- Free access and Paid access; under paid, the paid members box, the tier list (showing "All tiers"; it opens a menu, from the button's markup Beth copied), and Sell this post.
- Set publish date: its switch, a date box and a time box (the browser's own, so the date is written 2026-11-10 and the time 09:00), and the account's time zone, EST. On a test copy of the saved page, the desk found all of these and matched EST to this computer.
- Allow comments from (showing "Anyone with access", and "No one" when chosen, from Beth's screenshot), and the tags box ("Start typing...").
- With no publish date set, the top bar shows a "Publish" button where "Schedule" was (Beth's screenshot). The desk never presses it: its words and its place among the page's post actions are both refused.
- The Schedule button, with its mark for when it cannot be pressed yet.

Still a guess, because the saved pages had them closed or empty:

- What the "..." menu's items say (Edit caption, from the screenshots).
- The tier menu's choices (most likely ticked menu items named by tier), and how the comment list's choices are marked once it is open.
- How a tag is added (pressing Enter is the guess).
- How the page marks a picture that is still uploading (the desk waits a few seconds, then for the usual loading marks).
- How a tag is marked once added (it shows as a chip with an x in the tags box, from Beth's screenshot; the desk reads the tag's words there).
- Whether a picture file pasted into the text is taken there (if not, it goes to the gallery and its marker line is taken out), and whether the "Edit image" boxes are text areas or plain boxes.
- The Publish button's own mark in the page's markup (its words are confirmed), the new post page's address (`patreon.com/posts/new`, from the open source tool), and what a sign-in page's address looks like.
- Whether a confirm box follows Schedule, and where the page goes after.

## If the checklist shows a miss

1. Finish that part by hand. The post is not harmed: the fill only adds.
2. Save the new post page again into `reference\` (as in the first step), with a new name.
3. Ask a model to run `python -B tools/reference_page.py scan reference\THE-NEW-FILE.html` (and tell Beth what it found), then `survey` on the same file, and fix `extension\selectors.js` only, then run the tests. A change on the page's side should never need more than that one file.

## Before relying on it: Patreon's terms

Read on 6 November 2026 by a model, from the public pages. Beth should read them herself.

- The Terms of Use (https://www.patreon.com/policy/legal, last updated 27 May 2026) do not name bots, scripts or browser extensions. Their "abusive conduct" part forbids misusing the service in a technical way, and the account holder answers for everything done while signed in. Read that part and the part on third party apps.
- The Security Policy (https://www.patreon.com/policy/security) forbids crawling, scraping or indexing, and says the site shows a test to prove you are a person when it sees a bot. This extension does none of those: it fills one form, in Beth's own session, when she presses Fill, and she publishes. But a site's bot check could still react to filled fields. If a test to prove you are a person ever shows, Beth answers it herself.
- The Community Guidelines (https://www.patreon.com/policy/guidelines) forbid spam and services that inflate numbers. Nothing about posting tools.
- The developer guidelines (https://www.patreon.com/portal) need a sign in, so they were not read.

The model's reading: the terms do not speak to this case directly, and nothing found forbids a creator's own tool filling her own form while she presses Publish. The grey area is the broad "technical misuse" wording. This is a reading, not legal advice.

The batch goes one step further: after Beth's yes, the extension presses Schedule itself, for several posts in a row. That is still her own session, her own posts, at a human pace (one post at a time, each on a fresh page), and nothing runs without her. But it is closer to what the "technical misuse" wording and the bot check are about than a fill she finishes by hand. Read those two parts before the first batch. If a test to prove you are a person shows during a batch, the post's checks fail or the page does not move on, and the batch stops for Beth.

## Choices (all DEFAULT)

- PD-1: the desk is a full tab, not a small popup. Reason: a popup closes the moment a folder picker opens, and the pick is lost.
- PD-2: the text goes in through the editor's own paste, and if the editor does not take a paste, as formatted text. Pictures go in the gallery above the title by default, through the page's own picture box. An inline picture is pasted where its `[IMAGE n: name]` marker line is; if the text does not take it, it goes to the gallery, its marker line is taken out, and the checklist says so (a batch stops on it). Reason: the gallery is the page's own picture place and the surest to work; the paste path is the one the editor itself handles.
- PD-3: if the title or text already has words, the fill stops after those two. Reason: never write over Beth's words, and never add pictures twice.
- PD-4: who sees it and the publish date are always LOOK, never OK. Reason: those are the two a wrong guess would cost most, and the page's words for them may change.
- PD-5: the filler can never click a button that sends a post out (only scheduler.js presses Schedule, in an approved batch or a confirmed Fill and schedule): anything marked as a post action on the page, any submit button, and any button whose words start with Publish, Schedule (alone), Post, Send, Update or "save without notifying". Reason: Beth presses Publish.
- PD-6: packages live in `packages\` beside the tool, kept out of git. Reason: posts are content, not code, and stay on this PC. Change `places.json` to keep them elsewhere.
- PD-7: the publish date and time are typed as the page writes them (11/07/2026 and 02:00 PM in the screenshots; `dateText` and `timeText` in selectors.js), and the page's time zone must match this computer's on that date. Reason: a package's time is this computer's time, and the page reads it in the account's zone.
- PD-8: the converter keeps a post's editor's notes, like `[SUGGESTED LINE ...]`, in the text and lists them in the checklist. Reason: they are Beth's to decide, and a note left in the text is seen before publishing.
- PD-9: a batch is every post dated from today to seven days ahead (`-Days` changes it) that is not yet in the log as scheduled. Posts that fail a check are left out and named, not approved. Reason: Beth's words of 6 November 2026, "batches going for the next week".
- PD-10: the approval file names each post with the fingerprint (sha256) of its post.json, and the desk refuses an approval from before yesterday. Reason: running go-live is Beth's yes for that batch only, as it was when she read it.
- PD-11: in a batch the desk presses Schedule only when every part is OK, or a LOOK it read back from the page and matched. On the first miss it stops the whole batch. Reason: a stop costs Beth a minute; a wrong post on her page costs more.
- PD-12: a post is scheduled only if its time is at least 5 minutes away (`earliestMinutes` in settings.js). Beth, 6 November 2026, of the first value, 15: "it's the 15 minute time minimum that I object to. Make it 5." Reason for having one at all: a time already past could make the page post it at once.
- PD-13: the batch writes a log line per post per run to `packages\go-live-log.txt`, and the desk only ever adds lines. Reason: the log is the record of what went up, and the guard against scheduling a post twice.
- PD-14: go-live opens the browser named in places.json (`browser`, found in the usual places if empty) with the profile in `browser_profile` (the browser's own choice if empty). Reason: the browser must be the one signed in to the post site.
- PD-15: a picture's description goes in its alt text by default (`--image-text`), through the picture's caption box and its "Include alt text" switch. Reason: alt text is where a description belongs, and the saved page shows the page has it. A caption is the choice for a short visible line (140 characters at most). A description that cannot be set never stops a batch.
- PD-16: a post is free or paid; paid goes to all tiers unless tiers are named, and is never sold unless `--sell` is given. A collection is only chosen, never made; tags are added; comments are left as the page has them unless given. Reason: the choices on the page in Beth's screenshots; anything not asked is left alone.
- PD-17: Fill opens a fresh new post page in a new window every time, and checks sign-in there first. Reason: Beth, 6 November 2026, "automatically open a new window in chrome to load the new page and confirm that I'm logged in, and then to load the proper fresh post page, and then fill in." A fresh page also means the fill never adds to a draft that has words in it.
- PD-18: each picture is given time to upload. The filler waits at least 3 seconds (`pictureSettleMs`), then for the usual loading signs to clear; then, since the live page shows none it can rely on, it presses the picture (or opens its caption box) again every 2 seconds (`panelRetryMs`) until its panel opens, up to a minute (`uploadWaitMs`). Pressing a picture only selects it. A picture whose panel never opens is reported, and its description left for Beth. Reason: Beth, 6 November 2026, "the picture has to load first ... It takes a few seconds, per picture", and on the first try of the wait: "It didn't wait for the image to load to load the side panel."
- PD-19: Fill and schedule presses Schedule for one post after Beth's yes in a confirm box, with the batch's checks, and never Publish. The date and time come from the desk's boxes for that fill only; the package is not changed. Reason: Beth, 6 November 2026, "We'd want it to do that, because I can always remove a scheduled post or even delete one after it's gone live." Publish stays hers because it sends at once, with no time to look.
- PD-20: when the desk cannot tell whether Schedule took, it logs "unconfirmed", never "stopped", and batches leave the post out. Reason: a wrong "stopped" would make a later batch schedule the post twice; an unconfirmed post costs Beth one look.

## For builders

    python -B -m unittest discover -s tests -v
    python -B tools/run_page_tests.py
    python -B tools/run_page_tests.py --package packages\post-01
    python -B tools/reference_page.py make-test reference\new-post.html
    python -B tools/run_page_tests.py tests\pages\generated\new-post.test.html

The page tests run the extension's own filler in the browser's headless mode, on a mock page (tests/pages/mock-new-post.html) made from the page's known hooks, and on a saved page with its scripts taken out. The browser runs with a fresh profile in the scratch folder and with every web address mapped to nowhere. Python 3 standard library only. Tests keep their working folders in the scratch folder named in places.json, and nothing is deleted.

The mock page follows the editor in Beth's screenshots: the gallery with each picture's "..." menu, the Free and Paid access cards with the tier list and Sell this post, Add to collection, Set publish date with its time zone, and More settings with comments and tags. It also has the top menu with Delete draft, which the tests check is never pressed.

The batch is tested twice over: on the mock page (every check passes and only Schedule is pressed; alt text that cannot be set does not stop it; a description too long for a caption is not cut; a time zone that differs from this computer's stops it and nothing is pressed), and the desk's own batch loop on a stand-in folder and tab (two posts scheduled and one skipped from the log; a post changed after approval stops it; a failing check stops it; an old approval is refused).

What the tests cannot check: Patreon's live editor (whether it takes the paste, how pictures upload, how the tier, collection and comment lists open, whether a confirm box shows after Schedule, and where the page goes after scheduling). Only a fill on the real page shows that. The first real batch should be one post, watched.

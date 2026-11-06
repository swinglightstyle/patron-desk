"""Batches: the coming week's packages, Beth's approval, and the go-live log.

A batch is every package whose schedule date falls in the window (today
and the days after it), that is not already in the go-live log as
scheduled, and that passes every check. Packages in the window that fail a
check are left out and named, with the reason.

Approval is a file in the packages folder, _batches/batch-ID.json, written
only after Beth types yes in the console. It names each package with the
sha256 of its post.json as approved, so a package changed after approval
is not scheduled. The extension schedules only what an approval names, and
only on the day of approval or the day after.

The go-live log, go-live-log.txt in the packages folder, has one line per
post per run, written by the extension, and is only ever added to.
"""

import datetime
import hashlib
import html
import json
import os
import re

import desk_md
import desk_package

BATCH_DIR = "_batches"
LOG_NAME = "go-live-log.txt"
BATCH_FORMAT = "patron-desk-batch-1"
# An editor's note still in the text, like "[SUGGESTED LINE, ...]". Image
# markers ("[IMAGE 1: x.png]") are not notes: pictures replace them.
OPEN_NOTE_RE = re.compile(r"\[(?!IMAGE \d+:)[A-Z][A-Z ]*[A-Z]\s*[,:]")
HERE = os.path.dirname(os.path.abspath(__file__))
SELECTORS = os.path.join(HERE, "extension", "selectors.js")


def new_post_page():
    """The new post page's address, from its one home, extension/selectors.js."""
    with open(SELECTORS, "r", encoding="ascii") as f:
        m = re.search(r'newPostPage:\s*"([^"]+)"', f.read())
    if not m:
        raise desk_package.PackageError("selectors.js has no newPostPage")
    return m.group(1)


def read_log(root):
    """Names of packages the log shows as scheduled or unconfirmed, with the
    line. The last line for a package wins, so a later "scheduled" (such as
    Beth confirming on Patreon) settles an earlier "unconfirmed"."""
    done = {}
    path = os.path.join(root, LOG_NAME)
    if not os.path.isfile(path):
        return done
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip() or line.startswith("#"):
                continue
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 5 and parts[4] in ("scheduled", "unconfirmed"):
                done[parts[1]] = parts
    return done


def open_notes(body_html):
    return OPEN_NOTE_RE.findall(desk_md.plain_text(body_html))


def post_json_sha(folder):
    return desk_package.sha256_of(os.path.join(folder, "post.json"))


def select(root, today, days):
    """Returns (batch, left_out). Each batch entry is a dict for the approval."""
    end = today + datetime.timedelta(days=days)
    done = read_log(root)
    batch = []
    left_out = []
    if not os.path.isdir(root):
        return batch, left_out
    for name in sorted(os.listdir(root)):
        folder = os.path.join(root, name)
        if name.startswith("_") or not os.path.isfile(os.path.join(folder, "post.json")):
            continue
        try:
            data = desk_package.read_package(folder)
        except (OSError, json.JSONDecodeError) as e:
            left_out.append((name, "post.json could not be read: %s" % e))
            continue
        sched = data.get("schedule") or {}
        try:
            when = datetime.date.fromisoformat(str(sched.get("date", "")))
        except ValueError:
            when = None
        if when is None or not (today <= when <= end):
            continue
        if name in done:
            if done[name][4] == "unconfirmed":
                left_out.append((name, "Schedule was pressed on %s but not confirmed: check Patreon's scheduled posts" % done[name][0]))
            continue
        reasons = []
        problems, _ = desk_package.check_package(folder)
        reasons.extend(problems)
        if not sched.get("time"):
            reasons.append("it has a date but no time")
        notes = open_notes(data.get("body_html", ""))
        if notes:
            reasons.append("its text still has an editor's note (%s); settle it, then convert again" % notes[0].strip("[,: "))
        if reasons:
            left_out.append((name, "; ".join(reasons)))
            continue
        batch.append({
            "name": name,
            "title": data["title"],
            "date": sched["date"],
            "time": sched["time"],
            "access": data.get("access"),
            "images": len(data.get("images") or []),
            "post_json_sha256": post_json_sha(folder),
        })
    batch.sort(key=lambda e: (e["date"], e["time"], e["name"]))
    return batch, left_out


def batch_id(batch, today):
    h = hashlib.sha256()
    for e in batch:
        h.update(("%s:%s\n" % (e["name"], e["post_json_sha256"])).encode("ascii"))
    return "%s-%s" % (today.isoformat(), h.hexdigest()[:10])


def write_new(path, text):
    """Writes a file that does not exist yet. An existing file is kept as it is."""
    if os.path.exists(path):
        return False
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "x", encoding="ascii", newline="\n") as f:
        f.write(text)
    return True


def who_says(e):
    return desk_package.access_says(e.get("access"))


def extras_says(data):
    """The other settings, in plain words, for the preview."""
    parts = []
    if data.get("collection"):
        parts.append("Collection: %s" % data["collection"])
    if data.get("tags"):
        parts.append("Tags: %s" % ", ".join(data["tags"]))
    if data.get("comments"):
        parts.append("Comments from: %s" % ("anyone with access" if data["comments"] == "anyone" else "no one"))
    where = "in the text" if any(i.get("at") == "marker" for i in data.get("images") or []) else "in the gallery above the title"
    if data.get("images"):
        parts.append("Pictures %s; descriptions as %s" % (where, {
            "alt": "alt text", "caption": "captions", "body": "lines in the text", "none": "nothing (none)"}.get(data.get("image_text", "alt"), "alt text")))
    return ". ".join(parts)


def preview(root, bid, batch, left_out):
    """A page showing every post in the batch in full, for Beth to read before saying yes."""
    parts = [
        "<!doctype html><html lang=\"en\"><head><meta charset=\"ascii\">",
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
        "<title>Batch %s</title>" % html.escape(bid),
        "<style>body{font:16px/1.5 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:16px}"
        "article{border:1px solid #bbb;border-radius:10px;padding:12px 16px;margin:0 0 24px}"
        ".facts{color:#555}img{max-width:100%;height:auto}.alt{font-size:14px;color:#444}"
        ".out{color:#a00020}</style></head><body>",
        "<h1>Batch %s</h1>" % html.escape(bid),
        "<p>%d post%s to schedule. Read each one. Then go back to the console and type yes, or anything else to stop.</p>"
        % (len(batch), "" if len(batch) == 1 else "s"),
    ]
    if left_out:
        parts.append("<h2>Left out of this batch</h2><ul>")
        for name, why in left_out:
            parts.append("<li class=\"out\">%s: %s</li>" % (html.escape(name), html.escape(why)))
        parts.append("</ul>")
    for e in batch:
        data = desk_package.read_package(os.path.join(root, e["name"]))
        parts.append("<article><h2>%s</h2>" % html.escape(e["title"]))
        parts.append("<p class=\"facts\">%s. Goes out %s at %s. %s.</p>" % (
            html.escape(e["name"]), html.escape(e["date"]), html.escape(e["time"]), html.escape(who_says(e))))
        extras = extras_says(data)
        if extras:
            parts.append("<p class=\"facts\">%s.</p>" % html.escape(extras))
        parts.append(data["body_html"])
        for img in data.get("images") or []:
            src = "../%s/%s" % (e["name"], img["file"])
            parts.append("<p><img src=\"%s\" alt=\"%s\"></p><p class=\"alt\">Description: %s</p>" % (
                html.escape(src, quote=True), html.escape(img.get("alt", ""), quote=True), html.escape(img.get("alt", ""))))
        for n in data.get("notes") or []:
            parts.append("<p class=\"facts\">Note: %s</p>" % html.escape(n))
        parts.append("</article>")
    parts.append("</body></html>\n")
    text = "\n".join(parts).encode("ascii", "xmlcharrefreplace").decode("ascii")
    path = os.path.join(root, BATCH_DIR, "batch-%s-preview.html" % bid)
    write_new(path, text)
    return path


def approve(root, bid, batch, today):
    data = {
        "format": BATCH_FORMAT,
        "id": bid,
        "approved_on": today.isoformat(),
        "approved_by": "typed yes in the go-live console",
        "packages": batch,
    }
    path = os.path.join(root, BATCH_DIR, "batch-%s.json" % bid)
    write_new(path, json.dumps(data, indent=2, ensure_ascii=True) + "\n")
    return path


def go_live_url(bid):
    return "%s#patron-desk-batch=%s" % (new_post_page(), bid)

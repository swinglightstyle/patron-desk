"""The patron desk's command line.

    python -B desk.py convert <ready folder> [--name NAME]
                      [--access free|paid [--tiers "Tier A,Tier B"] [--sell]]
                      [--images a.png,b.png] [--image-place gallery|inline]
                      [--image-text alt|caption|body|none]
                      [--collection NAME] [--tags "a,b"] [--comments anyone|no-one]
                      [--date 2026-11-10 [--time 09:00]]
    python -B desk.py check [package folder ...]
    python -B desk.py list

"convert" reads a patron bank ready folder (post.md, alt-text.txt,
images/) and writes a new package into the packages folder named in
places.json. The ready folder is only read. Nothing is written over.

Standard library only.
"""

import argparse
import datetime
import json
import os
import re
import sys

import desk_batch
import desk_md
import desk_package

HERE = os.path.dirname(os.path.abspath(__file__))
PLACES = os.path.join(HERE, "places.json")


def places():
    """This machine's folders. On another machine, change places.json only."""
    with open(PLACES, "r", encoding="utf-8") as f:
        data = json.load(f)
    out = {}
    for key, value in data.items():
        if key.startswith("_"):
            continue
        out[key] = value if os.path.isabs(value) else os.path.normpath(os.path.join(HERE, value))
    return out


HEADER_RE = re.compile(r"^([A-Z][A-Z ]+):\s*(.*)$")
ALT_RE = re.compile(r"^([\w.-]+\.(?:png|jpe?g|gif|webp)):\s*(.+)$", re.I)


def read_ready_post(text):
    """Split a ready post.md into its header lines and its body.

    The header is "NAME: value" lines above a line that is only "---".
    """
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")
    header = {}
    for i, line in enumerate(lines):
        if line.strip() == "---":
            return header, "\n".join(lines[i + 1:])
        m = HEADER_RE.match(line.strip())
        if m:
            header[m.group(1).strip()] = m.group(2).strip()
    raise desk_package.PackageError("post.md has no '---' line between its header and its body")


def access_from_words(words):
    """Read the "WHO SEES IT" line. Returns an access dict."""
    w = words.strip().lower()
    if w.startswith(("public", "everyone", "anyone", "free")):
        return {"type": "free"}
    m = re.match(r"^(?:paid\s+)?tiers?\s*:\s*(.+)$", w)
    if m:
        original = words.split(":", 1)[1]
        tiers = [t.strip() for t in original.split(",") if t.strip()]
        return {"type": "paid", "tiers": tiers, "sell": False}
    if w.startswith(("paid", "all members", "members")):
        return {"type": "paid", "tiers": "all", "sell": False}
    raise desk_package.PackageError(
        "cannot tell who sees the post from %r; use --access free or --access paid" % words)


def read_alt_text(path):
    alts = {}
    if not os.path.isfile(path):
        return alts
    with open(path, "r", encoding="utf-8") as f:
        for line in f:
            m = ALT_RE.match(line.strip())
            if m:
                alts[m.group(1)] = m.group(2).strip()
    return alts


def default_name(ready_folder):
    name = os.path.basename(os.path.normpath(ready_folder))
    if name.endswith("-ready"):
        name = name[: -len("-ready")]
    return name


def build_from_ready(ready_folder, access=None, image_names=None, date=None, time=None,
                     image_place="gallery", image_text="alt", collection=None, tags=None,
                     comments=None):
    """Read a ready folder. Returns (data, image_sources) for write_package.

    image_place: "gallery" (the post's pictures above the title, through
    the page's own picture box) or "inline" (in the text, where each
    [IMAGE: ...] line is). image_text: where each picture's description
    goes: "alt" (the picture's alt text, in its caption box), "caption"
    (the picture's caption, at most 140 characters), "body" (a line
    "Image description: ..." in the text, next to the picture) or "none".
    """
    post_path = os.path.join(ready_folder, "post.md")
    with open(post_path, "r", encoding="utf-8") as f:
        post_text = f.read()
    header, body_md = read_ready_post(post_text)
    title = header.get("TITLE", "").strip()
    if not title:
        raise desk_package.PackageError("post.md has no TITLE line")
    if access is None:
        if "WHO SEES IT" not in header:
            raise desk_package.PackageError("post.md has no WHO SEES IT line; use --access")
        access = access_from_words(header["WHO SEES IT"])
    body_html, notes, marked = desk_md.convert(body_md)

    images_dir = os.path.join(ready_folder, "images")
    if image_names:
        chosen = [os.path.join("images", n) if "/" not in n and "\\" not in n else n for n in image_names]
    elif marked:
        chosen = marked
    elif os.path.isdir(images_dir):
        chosen = [os.path.join("images", n) for n in sorted(os.listdir(images_dir))
                  if n.lower().endswith(desk_package.IMAGE_TYPES)]
    else:
        chosen = []
    inline = image_place == "inline" and bool(marked) and not image_names
    if image_place == "inline" and not inline and chosen:
        notes.append("Inline pictures need the post's [IMAGE: ...] lines; these pictures go in the gallery.")

    alts = read_alt_text(os.path.join(ready_folder, "alt-text.txt"))
    # Optional: a caption of its own for a picture, shown under it.
    captions = read_alt_text(os.path.join(ready_folder, "captions.txt"))
    images = []
    sources = {}
    for n, rel in enumerate(chosen, 1):
        rel = rel.replace("\\", "/")
        src = os.path.join(ready_folder, *rel.split("/"))
        if not os.path.isfile(src):
            raise desk_package.PackageError("the image %s is not in %s" % (rel, ready_folder))
        name = rel.split("/")[-1]
        pkg_rel = "images/" + name
        images.append({
            "file": pkg_rel,
            "alt": alts.get(name, ""),
            "caption": captions.get(name),
            "at": "marker" if inline else "gallery",
            "marker": desk_md.image_marker_text(n, name) if inline else None,
        })
        sources[pkg_rel] = src

    # The marker lines stay only for inline pictures.
    if not inline:
        body_html = desk_md.drop_image_markers(body_html)
    if image_text == "body":
        body_html = desk_md.add_descriptions(body_html, images)

    source_files = {}
    for name in ("post.md", "alt-text.txt", "captions.txt", "CHECKLIST.md"):
        p = os.path.join(ready_folder, name)
        if os.path.isfile(p):
            source_files[name] = desk_package.sha256_of(p)
    if "CHECKLIST.md" in source_files:
        notes.append("The ready folder has its own CHECKLIST.md. Read its steps for this post "
                     "(links to make, lines to keep or cut).")

    schedule = None
    if date:
        schedule = {"date": date, "time": time}
    data = {
        "format": desk_package.FORMAT,
        "title": title,
        "body_html": body_html,
        "access": access,
        "images": images,
        "image_text": image_text,
        "collection": collection,
        "tags": list(tags or []),
        "comments": comments,
        "schedule": schedule,
        "notes": notes,
        "source": {
            "folder": os.path.abspath(ready_folder),
            "files_sha256": source_files,
            "converted_on": datetime.date.today().isoformat(),
        },
    }
    return data, sources


def split_list(value):
    return [t.strip() for t in value.split(",") if t.strip()] if value else None


def cmd_convert(args):
    pl = places()
    access = None
    if args.access == "free":
        if args.tiers or args.sell:
            raise desk_package.PackageError("--tiers and --sell go with --access paid")
        access = {"type": "free"}
    elif args.access == "paid":
        access = {"type": "paid", "tiers": split_list(args.tiers) or "all", "sell": bool(args.sell)}
    elif args.tiers or args.sell:
        raise desk_package.PackageError("--tiers and --sell go with --access paid")
    data, sources = build_from_ready(
        args.ready_folder,
        access=access,
        image_names=split_list(args.images),
        date=args.date,
        time=args.time,
        image_place=args.image_place,
        image_text=args.image_text,
        collection=args.collection,
        tags=split_list(args.tags),
        comments=args.comments,
    )
    if args.converted_on:
        data["source"]["converted_on"] = args.converted_on
    out_root = args.out or pl["packages"]
    out = os.path.join(out_root, args.name or default_name(args.ready_folder))
    path = desk_package.write_package(out, data, sources)
    problems, warnings = desk_package.check_package(out)
    print("Wrote %s" % path)
    print("  title: %s" % data["title"])
    print("  who sees it: %s" % desk_package.access_says(data["access"]))
    print("  images: %d, in the %s; descriptions: %s" % (
        len(data["images"]), "text" if any(i["at"] == "marker" for i in data["images"]) else "gallery",
        data["image_text"]))
    if data["collection"] or data["tags"] or data["comments"]:
        print("  collection: %s; tags: %s; comments: %s" % (
            data["collection"] or "none", ", ".join(data["tags"]) or "none", data["comments"] or "as the page has it"))
    for w in warnings:
        print("  warning: %s" % w)
    for n in data["notes"]:
        print("  note: %s" % n.encode("ascii", "replace").decode("ascii"))
    return 1 if problems else 0


def package_folders(root):
    if not os.path.isdir(root):
        return []
    return [os.path.join(root, n) for n in sorted(os.listdir(root))
            if os.path.isfile(os.path.join(root, n, "post.json"))]


def cmd_check(args):
    folders = args.folders or package_folders(places()["packages"])
    worst = 0
    for folder in folders:
        problems, warnings = desk_package.check_package(folder)
        state = "BLOCKED" if problems else ("NEEDS LOOK" if warnings else "READY")
        print("%s  %s" % (state, folder))
        for p in problems:
            print("  problem: %s" % p)
        for w in warnings:
            print("  warning: %s" % w)
        if problems:
            worst = 1
    return worst


def cmd_list(args):
    for folder in package_folders(places()["packages"]):
        data = desk_package.read_package(folder)
        when = data.get("schedule") or {}
        print("%-12s %-30s %s" % (when.get("date", "no date"), os.path.basename(folder), data.get("title", "")))
    return 0


KNOWN_BROWSERS = [
    # Windows
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.join(os.environ.get("LOCALAPPDATA", ""), r"Google\Chrome\Application\chrome.exe"),
    # Mac: the same browser lives here.
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]


def find_browser():
    """The browser's program: places.json's "browser", or the usual places."""
    with open(PLACES, "r", encoding="utf-8") as f:
        chosen = json.load(f).get("browser") or ""
    for path in ([chosen] if chosen else []) + KNOWN_BROWSERS:
        if path and os.path.isfile(path):
            return path
    return None


def parse_today(value):
    return datetime.date.fromisoformat(value) if value else datetime.date.today()


def show_batch(args):
    root = args.out or places()["packages"]
    today = parse_today(args.today)
    batch, left_out = desk_batch.select(root, today, args.days)
    end = today + datetime.timedelta(days=args.days)
    print("Posts dated %s to %s, not yet scheduled:" % (today.isoformat(), end.isoformat()))
    for e in batch:
        print("  %s %s  %-24s %s" % (e["date"], e["time"], desk_batch.who_says(e)[:24], e["title"].encode("ascii", "replace").decode("ascii")))
    for name, why in left_out:
        print("  LEFT OUT %s: %s" % (name, why.encode("ascii", "replace").decode("ascii")))
    return root, today, batch, left_out


def cmd_batch(args):
    root, today, batch, left_out = show_batch(args)
    if not batch:
        print("Nothing to schedule.")
        return 3
    bid = desk_batch.batch_id(batch, today)
    path = desk_batch.preview(root, bid, batch, left_out)
    print("PREVIEW %s" % path)
    print("BATCH %s" % bid)
    return 0


def cmd_approve(args):
    root, today, batch, left_out = show_batch(args)
    bid = desk_batch.batch_id(batch, today) if batch else None
    if not batch or bid != args.batch_id:
        print("Stopped: the batch has changed since it was shown (or is empty). Nothing approved. Run go-live again.")
        return 2
    path = desk_batch.approve(root, bid, batch, today)
    print("Approved: %s" % path)
    print("OPEN %s" % desk_batch.go_live_url(bid))
    return 0


def cmd_browser(args):
    path = find_browser()
    if not path:
        print("No browser found. Set \"browser\" in places.json to its program file.")
        return 2
    with open(PLACES, "r", encoding="utf-8") as f:
        prof = json.load(f).get("browser_profile") or ""
    print("BROWSER %s" % path)
    if prof:
        print("PROFILE %s" % prof)
    return 0


def main(argv=None):
    ap = argparse.ArgumentParser(description="The patron desk: post packages for the extension.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    c = sub.add_parser("convert", help="turn a patron bank ready folder into a package")
    c.add_argument("ready_folder")
    c.add_argument("--name", help="the package's folder name (default: the ready folder's name without -ready)")
    c.add_argument("--out", help="where packages go (default: places.json)")
    c.add_argument("--access", choices=desk_package.ACCESS_TYPES, help="free or paid (default: the post's WHO SEES IT line)")
    c.add_argument("--tiers", help="with --access paid: tier names, comma separated (default: all tiers)")
    c.add_argument("--sell", action="store_true", help="with --access paid: anyone without access can buy the post")
    c.add_argument("--images", help="image file names in order, comma separated (default: the [IMAGE: ...] lines)")
    c.add_argument("--image-place", choices=("gallery", "inline"), default="gallery",
                   help="gallery (above the title; default) or inline (in the text at each [IMAGE: ...] line)")
    c.add_argument("--image-text", choices=desk_package.IMAGE_TEXT, default="alt",
                   help="where each picture's description goes: alt (alt text; default), caption, body, or none")
    c.add_argument("--collection", help="the name of a collection to add the post to")
    c.add_argument("--tags", help="tags, comma separated")
    c.add_argument("--comments", choices=desk_package.COMMENTS, help="who may comment (default: as the page has it)")
    c.add_argument("--date", help="schedule date, like 2026-11-10")
    c.add_argument("--time", help="schedule time, 24 hour, like 09:00")
    c.add_argument("--converted-on", help=argparse.SUPPRESS)
    c.set_defaults(func=cmd_convert)
    k = sub.add_parser("check", help="check packages (default: every package in the packages folder)")
    k.add_argument("folders", nargs="*")
    k.set_defaults(func=cmd_check)
    l = sub.add_parser("list", help="list the packages")
    l.set_defaults(func=cmd_list)
    for nm, fn, hl in (("batch", cmd_batch, "show the coming days' batch and write its preview page"),
                       ("approve", cmd_approve, "approve a batch shown by \"batch\" (go-live does this after a yes)")):
        bp = sub.add_parser(nm, help=hl)
        bp.add_argument("--days", type=int, default=7, help="how many days after today the batch covers (default 7)")
        bp.add_argument("--today", help=argparse.SUPPRESS)
        bp.add_argument("--out", help="the packages folder (default: places.json)")
        if nm == "approve":
            bp.add_argument("--batch-id", required=True)
        bp.set_defaults(func=fn)
    br = sub.add_parser("browser", help="say which browser go-live opens")
    br.set_defaults(func=cmd_browser)
    args = ap.parse_args(argv)
    try:
        return args.func(args)
    except desk_package.PackageError as e:
        print("Stopped: %s" % e)
        return 2


if __name__ == "__main__":
    sys.exit(main())

"""The post package: one folder per post, with post.json beside its images.

The format is described in docs/PACKAGE-FORMAT.md. This module checks a
package and writes a new one. It never writes over anything: a package
folder that already exists is refused.
"""

import hashlib
import json
import os
import re
import shutil

FORMAT = "patron-desk-post-2"
ACCESS_TYPES = ("free", "paid")
IMAGE_AT = ("gallery", "marker")
IMAGE_TEXT = ("alt", "caption", "body", "none")
COMMENTS = ("anyone", "no-one")
IMAGE_TYPES = (".png", ".jpg", ".jpeg", ".gif", ".webp")
SELECTORS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "extension", "selectors.js")


def caption_limit():
    """How many characters a caption takes, from its one home, extension/selectors.js."""
    try:
        with open(SELECTORS, "r", encoding="ascii") as f:
            m = re.search(r"captionLimit:\s*(\d+)", f.read())
        return int(m.group(1)) if m else None
    except OSError:
        return None


DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class PackageError(Exception):
    pass


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def _names(value):
    return isinstance(value, list) and all(isinstance(t, str) and t.strip() for t in value)


def check_data(data, folder=None):
    """Check a post.json's contents.

    Returns (problems, warnings). Problems stop a fill; warnings are shown.
    When folder is given, image files are checked to be there.
    """
    problems = []
    warnings = []
    if not isinstance(data, dict):
        return ["post.json is not an object"], warnings
    if data.get("format") != FORMAT:
        problems.append("format is not %s (an older package: set it aside and convert again)" % FORMAT)
    title = data.get("title")
    if not isinstance(title, str) or not title.strip():
        problems.append("the title is empty")
    body = data.get("body_html")
    if not isinstance(body, str) or not body.strip():
        problems.append("the body is empty")
        body = ""

    access = data.get("access")
    if not isinstance(access, dict) or access.get("type") not in ACCESS_TYPES:
        problems.append("access.type must be free or paid")
    elif access["type"] == "paid":
        tiers = access.get("tiers", "all")
        if tiers != "all" and not (_names(tiers) and tiers):
            problems.append('access.tiers must be "all" or name at least one tier')
        if not isinstance(access.get("sell", False), bool):
            problems.append("access.sell must be true or false")
    elif access.get("sell"):
        problems.append("only a paid post can be sold")

    images = data.get("images", [])
    if not isinstance(images, list):
        problems.append("images must be a list")
        images = []
    seen = set()
    for n, img in enumerate(images, 1):
        if not isinstance(img, dict) or not isinstance(img.get("file"), str):
            problems.append("image %d has no file" % n)
            continue
        rel = img["file"]
        if rel in seen:
            warnings.append("image %d (%s) is listed twice" % (n, rel))
        seen.add(rel)
        if rel.startswith(("/", "\\")) or ".." in rel.replace("\\", "/").split("/"):
            problems.append("image %d must be inside the package folder" % n)
            continue
        if not rel.lower().endswith(IMAGE_TYPES):
            problems.append("image %d (%s) is not a picture type the page takes" % (n, rel))
        if img.get("at", "gallery") not in IMAGE_AT:
            problems.append("image %d: at must be gallery or marker" % n)
        elif img.get("at") == "marker" and (not img.get("marker") or img["marker"] not in body):
            problems.append("image %d goes at a marker line that is not in the body" % n)
        if not isinstance(img.get("alt"), str) or not img["alt"].strip():
            warnings.append("image %d (%s) has no description" % (n, rel))
        cap = img.get("caption")
        if cap is not None:
            limit = caption_limit()
            if not isinstance(cap, str):
                problems.append("image %d's caption must be words, or null" % n)
            elif limit and len(cap) > limit:
                warnings.append("image %d's caption has %d characters; a caption takes %d, so it will be left for you" % (n, len(cap), limit))
            elif data.get("image_text") == "caption" and cap.strip():
                warnings.append("image %d has its own caption, so its description is not used (image_text is caption; use alt)" % n)
        if folder is not None and not os.path.isfile(os.path.join(folder, rel)):
            problems.append("image %d (%s) is missing from the folder" % (n, rel))
    if data.get("image_text", "alt") not in IMAGE_TEXT:
        problems.append("image_text must be alt, caption, body or none")
    elif data.get("image_text") == "caption":
        limit = caption_limit()
        for n, img in enumerate(images, 1):
            if limit and isinstance(img, dict) and len(img.get("alt") or "") > limit:
                warnings.append("image %d's description has %d characters; a caption takes %d, so it will be left for you"
                                % (n, len(img["alt"]), limit))

    if data.get("collection") is not None and not (isinstance(data["collection"], str) and data["collection"].strip()):
        problems.append("collection must be a name, or null")
    tags = data.get("tags", [])
    if not _names(tags):
        problems.append("tags must be a list of words")
    if data.get("comments") is not None and data["comments"] not in COMMENTS:
        problems.append("comments must be anyone, no-one, or null (leave the page as it is)")

    sched = data.get("schedule")
    if sched is not None:
        if not isinstance(sched, dict) or not DATE_RE.match(str(sched.get("date", ""))):
            problems.append("schedule.date must look like 2026-11-10")
        elif sched.get("time") is not None and not TIME_RE.match(str(sched["time"])):
            problems.append("schedule.time must look like 09:00 (24 hour)")
        elif sched.get("time") is None:
            warnings.append("the schedule has a date but no time; set the time by hand")
    notes = data.get("notes", [])
    if not isinstance(notes, list):
        problems.append("notes must be a list")
    return problems, warnings


def access_says(access):
    """Plain words for a package's access."""
    if not isinstance(access, dict):
        return "not set"
    if access.get("type") == "free":
        return "Free access"
    tiers = access.get("tiers", "all")
    words = "Paid access, " + ("all tiers" if tiers == "all" else "tiers: " + ", ".join(tiers))
    return words + (", sold to others" if access.get("sell") else "")


def read_package(folder):
    path = os.path.join(folder, "post.json")
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def check_package(folder):
    try:
        data = read_package(folder)
    except FileNotFoundError:
        return ["there is no post.json"], []
    except json.JSONDecodeError as e:
        return ["post.json does not read as JSON: %s" % e], []
    return check_data(data, folder)


def write_package(out_folder, data, image_sources):
    """Write a new package folder.

    image_sources maps each image's package path (as in data["images"]) to
    the file it is copied from. The source is copied, never moved.
    """
    if os.path.exists(out_folder):
        raise PackageError(
            "%s already exists. Packages are never written over; give a new name." % out_folder
        )
    problems, _ = check_data(data)
    if problems:
        raise PackageError("; ".join(problems))
    os.makedirs(out_folder)
    for img in data.get("images", []):
        rel = img["file"]
        dest = os.path.join(out_folder, *rel.replace("\\", "/").split("/"))
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        if not os.path.exists(dest):
            shutil.copyfile(image_sources[rel], dest)
        img["sha256"] = sha256_of(dest)
    text = json.dumps(data, indent=2, ensure_ascii=True, sort_keys=False) + "\n"
    with open(os.path.join(out_folder, "post.json"), "w", encoding="ascii", newline="\n") as f:
        f.write(text)
    return os.path.join(out_folder, "post.json")

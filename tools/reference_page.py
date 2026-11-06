"""Tools for a saved copy of Patreon's new post page, kept in reference/.

    python -B tools/reference_page.py scan reference/PAGE.html
    python -B tools/reference_page.py survey reference/PAGE.html
    python -B tools/reference_page.py make-test reference/PAGE.html

A page saved while signed in can hold account details: an email address,
account numbers, and keys that keep the session signed in. These tools
read the page for the form's structure only, and never print such values.

"scan" counts the kinds of private values in the saved page and in its
saved files folder, and prints only each kind and how many, never a value.
Run it first, and tell Beth what it found.

"survey" lists the form's parts: each box, button and choice, by the
hooks a selector can use (tag, id, name, type, role, aria-label,
placeholder, data-tag, accept, contenteditable, min, max). It skips the
page's scripts, its stored data, its hidden fields and its text, and masks
anything in what it prints that looks like an email address, a key or an
account number.

"make-test" writes a test copy into tests/pages/generated/: the saved page
with its scripts, hidden fields and meta tags taken out, private values
masked, and the filler and the test driver put in. Run it with:
    python -B tools/run_page_tests.py tests/pages/generated/PAGE.test.html

The saved page and its test copy stay on this PC: both folders are kept
out of git, and this repository has no remote. Standard library only.
"""

import html
import os
import re
import sys
from html.parser import HTMLParser

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
GENERATED = os.path.join(REPO, "tests", "pages", "generated")

HOOKS = ("id", "name", "type", "role", "aria-label", "placeholder", "data-tag",
         "accept", "contenteditable", "aria-checked", "value", "for", "aria-multiline",
         "min", "max", "aria-disabled")
FORM_TAGS = {"input", "textarea", "select", "button", "label"}
TEXT_HOOK_TAGS = {"button", "label"}

# ---- private values: found and counted, never printed ----

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.(?!png\b|jpe?g\b|gif\b|webp\b|svg\b)[A-Za-z]{2,}")
JWT_RE = re.compile(r"eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{4,}")
SECRET_NAMES = (r"csrf[_-]?token|csrf|xsrf[_-]?token|xsrf|access[_-]?token|refresh[_-]?token|id[_-]?token|"
                r"auth[_-]?token|session[_-]?id|session[_-]?token|session|api[_-]?key|client[_-]?secret|"
                r"secret|password|cookie")
# "csrf_token": "abc...", csrfToken = 'abc...', name="csrf-token" content="abc..."
SECRET_PAIR_RE = re.compile(
    r"(?P<key>[\"']?(?:" + SECRET_NAMES + r")[\"']?\s*[:=]\s*)(?P<q>[\"'])(?P<val>[^\"'\s]{8,})(?P=q)", re.I)
SECRET_META_RE = re.compile(
    r"<meta\b[^>]*name=[\"'][^\"']*(?:" + SECRET_NAMES + r")[^\"']*[\"'][^>]*>", re.I)
ACCOUNT_ID_RE = re.compile(
    r"(?P<key>[\"']?(?:user|creator|campaign|patron|member|account|owner)[_-]?id[\"']?\s*[:=]\s*[\"']?)(?P<val>\d{4,})", re.I)
HIDDEN_INPUT_RE = re.compile(r"<input\b[^>]*type=[\"']?hidden[\"']?[^>]*>", re.I)
LONG_RUN_RE = re.compile(r"[A-Za-z0-9_+/=-]{24,}")
DIGITS_RE = re.compile(r"\d{6,}")

KINDS = [
    ("email addresses", EMAIL_RE),
    ("sign-in keys in token form", JWT_RE),
    ("named keys (session, csrf, access, api key, cookie, password)", SECRET_PAIR_RE),
    ("key meta tags", SECRET_META_RE),
    ("account numbers (user, creator, campaign and like ids)", ACCOUNT_ID_RE),
    ("hidden form fields", HIDDEN_INPUT_RE),
]
TEXT_FILES = (".html", ".htm", ".js", ".json", ".css", ".txt", ".xml", ".svg")


def mask(text):
    """Masks private values in text that will be printed or written."""
    text = JWT_RE.sub("[key]", text)
    text = EMAIL_RE.sub("[email]", text)
    text = SECRET_PAIR_RE.sub(lambda m: m.group("key") + m.group("q") + "[key]" + m.group("q"), text)
    text = ACCOUNT_ID_RE.sub(lambda m: m.group("key") + "[number]", text)
    return text


def mask_short(value):
    """For one printed hook value or label: also masks long runs and long numbers."""
    value = mask(value)
    # A long run that mixes in numbers looks like a key; a long run of words
    # (like make-a-post-action-publish) is a page hook and is kept.
    value = LONG_RUN_RE.sub(lambda m: "[long value]" if sum(c.isdigit() for c in m.group(0)) >= 3 else m.group(0), value)
    return DIGITS_RE.sub("[number]", value)


def saved_files(path):
    """The saved page, then the text files in its saved files folder."""
    out = [path]
    stem = os.path.splitext(path)[0]
    for folder in (stem + "_files", stem + "-Dateien", stem + "_fichiers"):
        if os.path.isdir(folder):
            for dirpath, _, names in os.walk(folder):
                for n in sorted(names):
                    if n.lower().endswith(TEXT_FILES):
                        out.append(os.path.join(dirpath, n))
    return out


def scan_counts(path):
    """{file: {kind: count}} for files with anything found. Values are not kept."""
    found = {}
    for f in saved_files(path):
        with open(f, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        counts = {}
        for kind, rx in KINDS:
            n = sum(1 for _ in rx.finditer(text))
            if n:
                counts[kind] = n
        if counts:
            found[os.path.relpath(f, os.path.dirname(path))] = counts
    return found


def scan(path):
    found = scan_counts(path)
    print("Scanned %d file(s) for private values. Only kinds and counts are shown, never values." % len(saved_files(path)))
    if not found:
        print("Nothing found.")
        return found
    for f, counts in found.items():
        print("%s:" % f.encode("ascii", "replace").decode("ascii"))
        for kind, n in counts.items():
            print("  %d %s" % (n, kind))
    print("These stay in reference/, which git leaves out. Say what was found to the person whose page it is.")
    return found


# ---- survey ----

class Survey(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self.skip = 0
        self.open_text = None

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript", "template"):
            self.skip += 1
            return
        if self.skip:
            return
        a = dict(attrs)
        if tag == "input" and (a.get("type") or "").lower() == "hidden":
            return
        keep = {k: v for k, v in a.items() if k in HOOKS and v is not None}
        if (tag in FORM_TAGS or "contenteditable" in a or a.get("role") in (
                "radio", "checkbox", "switch", "textbox", "option", "menuitemradio",
                "menuitemcheckbox", "button", "combobox", "listbox", "dialog")
                or "data-tag" in a):
            if tag in ("input", "textarea") and a.get("type") not in ("radio", "checkbox", "submit", "button"):
                keep.pop("value", None)
            row = {"tag": tag, "hooks": keep, "words": ""}
            self.rows.append(row)
            if tag in TEXT_HOOK_TAGS:
                self.open_text = row

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "template"):
            self.skip = max(0, self.skip - 1)
            return
        if tag in TEXT_HOOK_TAGS and self.open_text is not None and self.open_text["tag"] == tag:
            self.open_text = None

    def handle_data(self, data):
        # Only the short words on buttons and labels, which a selector may match.
        if self.skip or self.open_text is None:
            return
        words = " ".join(data.split())
        if words and len(self.open_text["words"]) < 60:
            self.open_text["words"] = (self.open_text["words"] + " " + words).strip()[:60]


def survey_lines(path):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()
    p = Survey()
    p.feed(text)
    lines = []
    for row in p.rows:
        hooks = " ".join('%s="%s"' % (k, mask_short(v[:80])) for k, v in row["hooks"].items())
        words = ('  words: "%s"' % mask_short(row["words"])) if row["words"] else ""
        lines.append(("<%s %s>%s" % (row["tag"], hooks, words)).encode("ascii", "replace").decode("ascii"))
    lines.append("%d parts found." % len(p.rows))
    return lines


def survey(path):
    for line in survey_lines(path):
        print(line)


# ---- test copy ----

SCRIPT_RE = re.compile(r"<script\b.*?</script\s*>", re.S | re.I)
DROP_RE = [
    re.compile(r"<link\b[^>]*\brel=[\"']?(?:preload|modulepreload|prefetch|preconnect|dns-prefetch|manifest)[^>]*>", re.I),
    re.compile(r"<meta\b(?![^>]*\bcharset\b)(?![^>]*name=[\"']?viewport)[^>]*>", re.I),
    re.compile(r"<base\b[^>]*>", re.I),
    re.compile(r"<iframe\b.*?</iframe\s*>", re.S | re.I),
    HIDDEN_INPUT_RE,
]


def file_url(path):
    p = os.path.abspath(path).replace("\\", "/")
    return "file://" + ("" if p.startswith("/") else "/") + p


def test_copy_text(text, folder):
    text = SCRIPT_RE.sub("", text)
    text = re.sub(r'<pre id="patron-desk-test-result">.*?</pre>', "", text, flags=re.S)
    for rx in DROP_RE:
        text = rx.sub("", text)
    text = mask(text)
    base = '<base href="%s/">' % html.escape(file_url(folder), quote=True)
    text = re.sub(r"(<head\b[^>]*>)", lambda m: m.group(1) + base, text, count=1, flags=re.I)
    ext = os.path.join(REPO, "extension")
    tail = '<pre id="patron-desk-test-result">not run</pre>\n' + "\n".join(
        '<script src="%s"></script>' % html.escape(file_url(p), quote=True)
        for p in (os.path.join(ext, "selectors.js"), os.path.join(ext, "filler.js"),
                  os.path.join(ext, "overlay.js"), os.path.join(ext, "scheduler.js"),
                  os.path.join(REPO, "tests", "js", "driver.js")))
    if re.search(r"</body\s*>", text, re.I):
        text = re.sub(r"</body\s*>", lambda m: tail + "\n</body>", text, count=1, flags=re.I)
    else:
        text += tail
    return text


def make_test(path, out_dir=None):
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        text = f.read()
    text = test_copy_text(text, os.path.dirname(os.path.abspath(path)))
    out_dir = out_dir or GENERATED
    os.makedirs(out_dir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(path))[0]
    out = os.path.join(out_dir, stem + ".test.html")
    n = 2
    while os.path.exists(out):
        out = os.path.join(out_dir, stem + ".test-%d.html" % n)
        n += 1
    with open(out, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    print("Wrote %s" % out)
    return out


def main(argv):
    if len(argv) != 2 or argv[0] not in ("scan", "survey", "make-test"):
        print(__doc__)
        return 2
    {"scan": scan, "survey": survey, "make-test": make_test}[argv[0]](argv[1])
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

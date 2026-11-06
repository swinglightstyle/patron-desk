"""Runs the filler's test pages in the browser's headless mode.

    python -B tools/run_page_tests.py            (the mock page, three ways)
    python -B tools/run_page_tests.py PAGE.html  (one page, such as a
                                                  reference test page)

Each page loads the extension's own filler, fills itself with a sample
package and writes its checks into the page. This script reads the page
as the browser left it and prints the checks.

The browser runs with a fresh profile in the scratch folder (places.json),
with no network: every address is mapped to nowhere, and no debugging
port is opened. The browser is found from places.json's "browser", or
from the usual places on Windows and Mac. Nothing is installed.
"""

import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(REPO, "tests"))

from scratch import new_folder  # noqa: E402
sys.path.insert(0, REPO)
import desk  # noqa: E402

MOCK = os.path.join(REPO, "tests", "pages", "mock-new-post.html")
RESULT_RE = re.compile(r'<pre id="patron-desk-test-result">(.*?)</pre>', re.S)


def find_browser():
    return desk.find_browser()


def file_url(path, query=""):
    p = os.path.abspath(path).replace("\\", "/")
    if not p.startswith("/"):
        p = "/" + p
    return "file://" + p + (("?" + query) if query else "")


def run_page(browser, path, query=""):
    profile = new_folder("browser-profile")
    cmd = [
        browser,
        "--headless=new",
        "--disable-gpu",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-sync",
        "--disable-extensions",
        "--no-pings",
        "--host-resolver-rules=MAP * ~NOTFOUND",
        "--user-data-dir=" + profile,
        "--virtual-time-budget=180000",
        "--dump-dom",
        file_url(path, query),
    ]
    out = subprocess.run(cmd, capture_output=True, timeout=180)
    dom = out.stdout.decode("utf-8", "replace")
    m = RESULT_RE.search(dom)
    if not m:
        return {"error": "no result in the page", "stderr_tail": out.stderr.decode("utf-8", "replace")[-800:]}
    raw = m.group(1)
    raw = raw.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&amp;", "&")
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"error": raw[:2000]}


TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp"}


def package_page(pkg_folder):
    """A copy of the mock page that fills itself with a real package.

    The package is put in a script file beside the copy, as the desk would
    send it (pictures as data). Both go in tests/pages/generated/.
    """
    import base64
    with open(os.path.join(pkg_folder, "post.json"), "r", encoding="utf-8") as f:
        data = json.load(f)
    images = []
    for img in data.get("images", []):
        path = os.path.join(pkg_folder, *img["file"].split("/"))
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        ext = os.path.splitext(path)[1].lower()
        images.append({"name": os.path.basename(path), "type": TYPES.get(ext, "application/octet-stream"),
                       "dataUrl": "data:%s;base64,%s" % (TYPES.get(ext, ""), b64),
                       "alt": img.get("alt", ""), "caption": img.get("caption") or "",
                       "at": img.get("at", "gallery"), "marker": img.get("marker")})
    # As desk.js settingsOf sends it.
    pkg = {"name": os.path.basename(os.path.normpath(pkg_folder)), "title": data["title"],
           "body_html": data["body_html"], "access": data["access"],
           "image_text": data.get("image_text", "alt"), "collection": data.get("collection"),
           "tags": data.get("tags", []), "comments": data.get("comments"),
           "schedule": data.get("schedule"), "notes": data.get("notes", []), "images": images}
    gen = os.path.join(REPO, "tests", "pages", "generated")
    os.makedirs(gen, exist_ok=True)
    name = pkg["name"]
    js = os.path.join(gen, name + ".pkg.js")
    nl = chr(10)
    with open(js, "w", encoding="ascii", newline=nl) as f:
        f.write("window.__PKG = " + json.dumps(pkg, ensure_ascii=True) + ";" + nl)
    with open(MOCK, "r", encoding="ascii") as f:
        page = f.read()
    # The copy sits one folder deeper than the mock page.
    page = page.replace('src="../../', 'src="../../../')
    page = page.replace('<script src="../js/driver.js">',
                        '<script src="%s.pkg.js"></script>%s<script src="../../js/driver.js">' % (name, nl))
    out = os.path.join(gen, name + ".mock.html")
    with open(out, "w", encoding="ascii", newline=nl) as f:
        f.write(page)
    return out


def main(argv):
    browser = find_browser()
    if not browser:
        print("No browser found. Set \"browser\" in places.json to its program file.")
        return 2
    if argv and argv[0] == "--package":
        runs = [(package_page(argv[1]), "mode=package")]
    elif argv:
        runs = [(argv[0], "mode=reference")]
    else:
        runs = [(MOCK, "mode=" + m) for m in ("editor", "unmarked", "plain", "full", "paidfirst", "batch", "batchsoft", "batchmiss", "stuck")]
    bad = 0
    for path, query in runs:
        res = run_page(browser, path, query)
        if "error" in res:
            print("ERROR %s %s\n%s" % (os.path.basename(path), query, json.dumps(res, indent=1)))
            bad += 1
            continue
        print("%s %s: %d passed, %d failed" % (os.path.basename(path), query, res["passed"], res["failed"]))
        for c in res["checks"]:
            print("  %s  %s%s" % ("ok  " if c["pass"] else "FAIL", c["name"], ("  (" + c["detail"][:200] + ")") if (c["detail"] and not c["pass"]) else ""))
        print("  the checklist it showed:")
        for it in res["report"]:
            print("    %-6s %s: %s" % (it["status"], it["part"], it["say"]))
        bad += res["failed"]
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

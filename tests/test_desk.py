"""Tests for the converter, the package checks and the extension's rules.

Run from the repository root:  python -B -m unittest discover -s tests -v
"""

import json
import os
import re
import shutil
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, REPO)
sys.path.insert(0, HERE)

import desk  # noqa: E402
import desk_md  # noqa: E402
import desk_package  # noqa: E402
from scratch import new_folder  # noqa: E402

FIX = os.path.join(HERE, "fixtures")
EXT = os.path.join(REPO, "extension")


class MarkdownTests(unittest.TestCase):
    def test_paragraphs_and_emphasis(self):
        html, notes, images = desk_md.convert("One *two* **three**.\n\nFour _five_.")
        self.assertEqual(html, "<p>One <em>two</em> <strong>three</strong>.</p>\n<p>Four <em>five</em>.</p>")
        self.assertEqual(notes, [])
        self.assertEqual(images, [])

    def test_bare_address_becomes_link_without_trailing_marks(self):
        html, _, _ = desk_md.convert("See (https://example.com/a/).")
        self.assertEqual(html, '<p>See (<a href="https://example.com/a/">https://example.com/a/</a>).</p>')

    def test_markdown_link(self):
        html, _, _ = desk_md.convert("Read [the *paper*](https://example.com/p?a=1&b=2) now.")
        self.assertIn('<a href="https://example.com/p?a=1&amp;b=2">the <em>paper</em></a>', html)

    def test_escapes_markup(self):
        html, _, _ = desk_md.convert("a <b> & \"c\" it's")
        self.assertEqual(html, "<p>a &lt;b&gt; &amp; \"c\" it's</p>")

    def test_star_alone_is_not_emphasis(self):
        html, _, _ = desk_md.convert("5 * 3 and 2*x*y")
        self.assertNotIn("<em>", html)

    def test_lists_headings_quotes(self):
        html, _, _ = desk_md.convert("# Head\n\n- a\n- b\n\n1. x\n2. y\n\n> said\n> this")
        self.assertIn("<h1>Head</h1>", html)
        self.assertIn("<ul><li>a</li><li>b</li></ul>", html)
        self.assertIn("<ol><li>x</li><li>y</li></ol>", html)
        self.assertIn("<blockquote><p>said this</p></blockquote>", html)

    def test_editor_note_kept_and_listed(self):
        text = "[SUGGESTED LINE, keep, change or cut: a line.]"
        html, notes, _ = desk_md.convert(text)
        self.assertEqual(notes, [text])
        self.assertIn("SUGGESTED LINE", html)

    def test_image_note_becomes_numbered_marker(self):
        html, notes, images = desk_md.convert('[IMAGE: images/a.png, "A"]\n\n[IMAGE: images/b.png]')
        self.assertEqual(images, ["images/a.png", "images/b.png"])
        self.assertEqual(notes, [])
        self.assertIn("<p>[IMAGE 1: a.png]</p>", html)
        self.assertIn("<p>[IMAGE 2: b.png]</p>", html)

    def test_plain_text(self):
        self.assertEqual(desk_md.plain_text("<p>a &amp; <em>b</em></p>\n<p>c</p>"), "a & b c")


class ReadyPostTests(unittest.TestCase):
    def test_header_and_body(self):
        header, body = desk.read_ready_post("TITLE: T\nWHO SEES IT: Public\n\n---\n\nBody.")
        self.assertEqual(header, {"TITLE": "T", "WHO SEES IT": "Public"})
        self.assertEqual(body.strip(), "Body.")

    def test_no_rule_line_stops(self):
        with self.assertRaises(desk_package.PackageError):
            desk.read_ready_post("TITLE: T\nBody")

    def test_access_words(self):
        self.assertEqual(desk.access_from_words("Public (anyone)"), {"type": "free"})
        self.assertEqual(desk.access_from_words("Free"), {"type": "free"})
        self.assertEqual(desk.access_from_words("Paid members only"), {"type": "paid", "tiers": "all", "sell": False})
        self.assertEqual(desk.access_from_words("All members"), {"type": "paid", "tiers": "all", "sell": False})
        self.assertEqual(desk.access_from_words("Tiers: Base, Higher Up"),
                         {"type": "paid", "tiers": ["Base", "Higher Up"], "sell": False})
        with self.assertRaises(desk_package.PackageError):
            desk.access_from_words("my friends")

    def test_build_basic_goes_to_the_gallery(self):
        data, sources = desk.build_from_ready(os.path.join(FIX, "ready-basic"))
        self.assertEqual(data["format"], "patron-desk-post-2")
        self.assertEqual(data["title"], "A small test post")
        self.assertEqual(data["access"], {"type": "free"})
        self.assertEqual(len(data["images"]), 1)
        img = data["images"][0]
        self.assertEqual(img["file"], "images/01-first.png")
        self.assertEqual(img["alt"], "A red square.")
        self.assertEqual((img["at"], img["marker"]), ("gallery", None))
        self.assertNotIn("[IMAGE", data["body_html"])
        self.assertEqual(data["image_text"], "alt")
        self.assertEqual((data["collection"], data["tags"], data["comments"]), (None, [], None))
        self.assertIn("Last paragraph &amp; done.", data["body_html"])
        self.assertTrue(any("SUGGESTED LINE" in n for n in data["notes"]))
        self.assertIn("post.md", data["source"]["files_sha256"])
        self.assertEqual(desk_package.check_data(data), ([], []))

    def test_build_inline_keeps_markers(self):
        data, _ = desk.build_from_ready(os.path.join(FIX, "ready-basic"), image_place="inline")
        img = data["images"][0]
        self.assertEqual((img["at"], img["marker"]), ("marker", "[IMAGE 1: 01-first.png]"))
        self.assertIn("<p>[IMAGE 1: 01-first.png]</p>", data["body_html"])
        self.assertEqual(desk_package.check_data(data), ([], []))

    def test_descriptions_in_the_text(self):
        data, _ = desk.build_from_ready(os.path.join(FIX, "ready-basic"), image_place="inline", image_text="body")
        self.assertIn("<p>[IMAGE 1: 01-first.png]</p>\n<p>Image description: A red square.</p>", data["body_html"])
        data, _ = desk.build_from_ready(os.path.join(FIX, "ready-basic"), image_text="body")
        self.assertTrue(data["body_html"].startswith("<p>Image description: A red square.</p>"))
        data, _ = desk.build_from_ready(os.path.join(FIX, "ready-basic"), image_text="none")
        self.assertNotIn("Image description", data["body_html"])

    def test_build_chosen_images(self):
        data, _ = desk.build_from_ready(os.path.join(FIX, "ready-basic"),
                                        image_names=["02-second.png", "01-first.png"])
        self.assertEqual([i["file"] for i in data["images"]], ["images/02-second.png", "images/01-first.png"])
        self.assertTrue(all(i["at"] == "gallery" and i["marker"] is None for i in data["images"]))
        self.assertNotIn("[IMAGE", data["body_html"])

    def test_build_tiers_and_schedule_and_settings(self):
        data, _ = desk.build_from_ready(os.path.join(FIX, "ready-tiers"), date="2026-11-10", time="09:00",
                                        collection="Machine room", tags=["build log", "AI"], comments="no-one")
        self.assertEqual(data["access"], {"type": "paid", "tiers": ["Back End View", "Machine Room"], "sell": False})
        self.assertEqual(data["schedule"], {"date": "2026-11-10", "time": "09:00"})
        self.assertEqual((data["collection"], data["tags"], data["comments"]), ("Machine room", ["build log", "AI"], "no-one"))
        self.assertEqual(data["images"], [])
        self.assertEqual(desk_package.check_data(data), ([], []))

    def test_captions_file(self):
        ready = os.path.join(new_folder("ready-captions"), "post-ready")
        shutil.copytree(os.path.join(FIX, "ready-basic"), ready)
        with open(os.path.join(ready, "captions.txt"), "w", encoding="ascii") as f:
            f.write("Captions." + chr(10) + chr(10) + "01-first.png: A short caption." + chr(10))
        data, _ = desk.build_from_ready(ready, image_place="inline")
        self.assertEqual(data["images"][0]["caption"], "A short caption.")
        self.assertEqual(data["images"][0]["alt"], "A red square.")
        self.assertIn("captions.txt", data["source"]["files_sha256"])
        self.assertEqual(desk_package.check_data(data), ([], []))
        data["images"][0]["caption"] = "y" * 141
        self.assertTrue(any("141 characters" in w for w in desk_package.check_data(data)[1]))
        data["images"][0]["caption"] = "Short."
        data["image_text"] = "caption"
        self.assertTrue(any("own caption" in w for w in desk_package.check_data(data)[1]))
        data["images"][0]["caption"] = 5
        self.assertTrue(any("caption must be words" in p for p in desk_package.check_data(data)[0]))

    def test_no_captions_file_means_no_caption(self):
        data, _ = desk.build_from_ready(os.path.join(FIX, "ready-basic"))
        self.assertIsNone(data["images"][0]["caption"])

    def test_access_option_wins(self):
        data, _ = desk.build_from_ready(os.path.join(FIX, "ready-basic"), access={"type": "paid", "tiers": "all", "sell": True})
        self.assertEqual(data["access"], {"type": "paid", "tiers": "all", "sell": True})
        self.assertEqual(desk_package.access_says(data["access"]), "Paid access, all tiers, sold to others")

    def test_cli_options(self):
        out_root = new_folder("cli-options")
        code = desk.main(["convert", os.path.join(FIX, "ready-basic"), "--out", out_root, "--access", "paid",
                          "--tiers", "Base, Higher", "--sell", "--tags", "a, b", "--collection", "C",
                          "--comments", "anyone", "--image-text", "body", "--converted-on", "2026-11-06"])
        self.assertEqual(code, 0)
        data = desk_package.read_package(os.path.join(out_root, "ready-basic"))
        self.assertEqual(data["access"], {"type": "paid", "tiers": ["Base", "Higher"], "sell": True})
        self.assertEqual((data["tags"], data["collection"], data["comments"]), (["a", "b"], "C", "anyone"))
        self.assertEqual(desk.main(["convert", os.path.join(FIX, "ready-basic"), "--out", new_folder("cli-bad"),
                                    "--access", "free", "--sell"]), 2)


class PackageTests(unittest.TestCase):
    def good(self):
        return {
            "format": desk_package.FORMAT, "title": "T", "body_html": "<p>b</p>\n<p>[IMAGE 2: b.png]</p>",
            "access": {"type": "free"},
            "images": [{"file": "images/a.png", "alt": "x", "at": "gallery", "marker": None},
                       {"file": "images/b.png", "alt": "y", "at": "marker", "marker": "[IMAGE 2: b.png]"}],
            "image_text": "caption", "collection": None, "tags": [], "comments": None,
            "schedule": None, "notes": [],
        }

    def test_good_is_clean(self):
        self.assertEqual(desk_package.check_data(self.good()), ([], []))

    def test_problems(self):
        cases = [
            ("title", "", "title"),
            ("body_html", " ", "body"),
            ("access", {"type": "friends"}, "access"),
            ("access", {"type": "paid", "tiers": []}, "tiers"),
            ("access", {"type": "paid", "tiers": "all", "sell": "yes"}, "sell"),
            ("access", {"type": "free", "sell": True}, "sold"),
            ("images", [{"file": "../x.png", "alt": "a"}], "inside"),
            ("images", [{"file": "images/a.pdf", "alt": "a"}], "picture type"),
            ("images", [{"file": "images/a.png", "alt": "a", "at": "marker", "marker": "[IMAGE 9: z.png]"}], "marker line"),
            ("image_text", "alttext", "image_text"),
            ("collection", " ", "collection"),
            ("tags", "a,b", "tags"),
            ("comments", "friends", "comments"),
            ("schedule", {"date": "10/11/2026"}, "schedule.date"),
            ("schedule", {"date": "2026-11-10", "time": "9am"}, "schedule.time"),
            ("format", "patron-desk-post-1", "older package"),
        ]
        for key, value, word in cases:
            d = self.good()
            d[key] = value
            problems, _ = desk_package.check_data(d)
            self.assertTrue(any(word in p for p in problems), (key, value, problems))

    def test_long_caption_is_a_warning(self):
        d = self.good()
        d["image_text"] = "caption"
        d["images"][0]["alt"] = "x" * 141
        problems, warnings = desk_package.check_data(d)
        self.assertEqual(problems, [])
        self.assertTrue(any("141 characters" in w and "140" in w for w in warnings), warnings)
        d["image_text"] = "alt"
        self.assertEqual(desk_package.check_data(d), ([], []))

    def test_warnings(self):
        d = self.good()
        d["images"][0]["alt"] = ""
        d["schedule"] = {"date": "2026-11-10", "time": None}
        problems, warnings = desk_package.check_data(d)
        self.assertEqual(problems, [])
        self.assertEqual(len(warnings), 2)

    def test_write_and_check_and_never_write_over(self):
        out_root = new_folder("write")
        data, sources = desk.build_from_ready(os.path.join(FIX, "ready-basic"))
        out = os.path.join(out_root, "post-x")
        desk_package.write_package(out, data, sources)
        self.assertEqual(desk_package.check_package(out), ([], []))
        with open(os.path.join(out, "post.json"), "rb") as f:
            raw = f.read()
        raw.decode("ascii")
        saved = json.loads(raw)
        self.assertEqual(len(saved["images"][0]["sha256"]), 64)
        self.assertEqual(saved["images"][0]["sha256"],
                         desk_package.sha256_of(os.path.join(FIX, "ready-basic", "images", "01-first.png")))
        before = os.path.getmtime(os.path.join(out, "post.json"))
        with self.assertRaises(desk_package.PackageError):
            desk_package.write_package(out, data, sources)
        self.assertEqual(before, os.path.getmtime(os.path.join(out, "post.json")))

    def test_missing_image_is_a_problem(self):
        out = new_folder("missing")
        d = self.good()
        with open(os.path.join(out, "post.json"), "w", encoding="ascii") as f:
            json.dump(d, f)
        problems, _ = desk_package.check_package(out)
        self.assertTrue(any("missing" in p for p in problems))

    def test_cli_convert_reads_only(self):
        src = os.path.join(FIX, "ready-basic")
        before = {n: desk_package.sha256_of(os.path.join(src, n)) for n in ("post.md", "alt-text.txt")}
        out_root = new_folder("cli")
        code = desk.main(["convert", src, "--out", out_root, "--converted-on", "2026-11-06"])
        self.assertEqual(code, 0)
        self.assertTrue(os.path.isfile(os.path.join(out_root, "ready-basic", "post.json")))
        after = {n: desk_package.sha256_of(os.path.join(src, n)) for n in ("post.md", "alt-text.txt")}
        self.assertEqual(before, after)
        self.assertEqual(desk.main(["convert", src, "--out", out_root]), 2)

    def test_same_input_same_output(self):
        a = new_folder("same")
        b = new_folder("same")
        for root in (a, b):
            desk.main(["convert", os.path.join(FIX, "ready-basic"), "--out", root, "--converted-on", "2026-11-06"])
        with open(os.path.join(a, "ready-basic", "post.json"), "rb") as f1, \
                open(os.path.join(b, "ready-basic", "post.json"), "rb") as f2:
            self.assertEqual(f1.read(), f2.read())


def ext_text(name):
    with open(os.path.join(EXT, name), "r", encoding="ascii") as f:
        return f.read()


JS = ["version.js", "selectors.js", "settings.js", "filler.js", "overlay.js", "scheduler.js", "content.js", "background.js", "desk.js", "store.js"]


class ExtensionRuleTests(unittest.TestCase):
    def test_manifest_asks_for_little(self):
        m = json.loads(ext_text("manifest.json"))
        self.assertEqual(m["manifest_version"], 3)
        self.assertEqual(m["permissions"], ["scripting"])
        self.assertEqual(m["host_permissions"], ["https://www.patreon.com/*"])
        for cs in m["content_scripts"]:
            self.assertEqual(cs["matches"], ["https://www.patreon.com/*"])
            self.assertEqual(cs["js"][0], "version.js")
            for f in cs["js"]:
                self.assertTrue(os.path.isfile(os.path.join(EXT, f)), f)
        self.assertNotIn("externally_connectable", m)
        self.assertNotIn("default_popup", m.get("action", {}))
        csp = m["content_security_policy"]["extension_pages"]
        self.assertIn("connect-src 'none'", csp)
        self.assertNotIn("http", csp)

    def test_no_network_no_cookies_no_storage_of_logins(self):
        banned = [r"\bfetch\s*\(", r"XMLHttpRequest", r"WebSocket", r"EventSource", r"sendBeacon",
                  r"chrome\.cookies", r"document\.cookie", r"connectNative", r"sendNativeMessage",
                  r"localStorage", r"sessionStorage", r"\beval\s*\(", r"new Function\s*\(", r"importScripts"]
        for name in JS:
            text = ext_text(name)
            for pat in banned:
                self.assertIsNone(re.search(pat, text), "%s uses %s" % (name, pat))

    def test_no_web_address_outside_the_selectors_file(self):
        for name in JS:
            if name == "selectors.js":
                continue
            # The SVG namespace is a name for drawing marks, never contacted.
            text = ext_text(name).replace('"http://www.w3.org/2000/svg"', '""')
            self.assertIsNone(re.search(r"https?://", text), name)

    def test_every_page_selector_lives_in_one_file(self):
        literal = re.compile(r"(querySelector(All)?|closest|matches)\(\s*(['\"])(?P<sel>.*?)\3")
        allowed = {
            "filler.js": {'button, [role="button"], a, input[type="submit"]', '[role="dialog"]', "button"},
            "content.js": set(), "overlay.js": set(),
            "scheduler.js": {'[role="dialog"], [role="alertdialog"]', "button"},
        }
        for name, ok in allowed.items():
            for m in literal.finditer(ext_text(name)):
                self.assertIn(m.group("sel"), ok, "%s names a page place outside selectors.js: %s" % (name, m.group("sel")))

    def test_no_publish_click_by_the_filler(self):
        text = ext_text("filler.js")
        self.assertNotIn(".submit(", text)
        self.assertNotIn("requestSubmit", text)
        clicks = re.findall(r"\.click\(\)", text)
        self.assertEqual(len(clicks), 1, "only safeClick may click")
        sel = ext_text("selectors.js")
        self.assertIn("make-a-post-action", sel)
        self.assertIn("/^publish\\b/i", sel)

    def test_only_the_scheduler_presses_schedule_and_only_when_asked(self):
        clicks = {n: len(re.findall(r"\.click\(\)", ext_text(n))) for n in JS}
        self.assertEqual(clicks["filler.js"], 1)
        self.assertEqual(clicks["scheduler.js"], 2)
        self.assertEqual(sum(clicks.values()), 3)
        sch = ext_text("scheduler.js")
        # Each press comes after the checks: the last fill passed, and the button fits.
        first_click = sch.index("button.click()")
        for must in ("last.name !== name", "!last.pass", "fits(button, S.words)", "D.lastFill = null"):
            self.assertLess(sch.index(must), first_click, must)
        self.assertIn("fits(b, S.confirmWords)", sch)
        self.assertNotIn("publish", sch.split("*/", 1)[1].lower())
        content = ext_text("content.js")
        self.assertIn('msg.type === "patron-desk-press-schedule" && msg.batch', content)
        self.assertEqual(content.count("D.pressSchedule("), 1)
        self.assertIn("D.lastFill = { name: msg.pkg.name, pass: verdict.pass }", content)
        sel = ext_text("selectors.js")
        self.assertIn("wrongWords: [/publish/i", sel)
        m = json.loads(ext_text("manifest.json"))
        js = m["content_scripts"][0]["js"]
        self.assertLess(js.index("scheduler.js"), js.index("content.js"))

    def test_one_version_everywhere(self):
        m = json.loads(ext_text("manifest.json"))
        v = re.search(r'D\.VERSION = "([^"]+)"', ext_text("version.js")).group(1)
        self.assertEqual(m["version"], v)
        self.assertEqual(m["content_scripts"][0]["js"][0], "version.js")
        self.assertIn('<script src="version.js"></script>', ext_text("desk.html"))

    def test_files_are_plain_ascii(self):
        for root, _, files in os.walk(REPO):
            if any(part in root for part in (".git", "packages", "reference", "generated", "__pycache__")):
                continue
            for n in files:
                if n.endswith((".py", ".js", ".json", ".html", ".css", ".md", ".txt")):
                    with open(os.path.join(root, n), "rb") as f:
                        data = f.read()
                    data.decode("ascii")
                    self.assertNotIn(b"\xe2\x80\x93", data)
                    self.assertNotIn(b"\xe2\x80\x94", data)


if __name__ == "__main__":
    unittest.main()

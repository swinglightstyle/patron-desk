"""Tests for the saved-page tools: private values are counted, never
printed and never copied, and the saved page is kept out of git.

Run from the repository root:  python -B -m unittest discover -s tests -v
"""

import contextlib
import io
import os
import shutil
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(REPO, "tools"))
sys.path.insert(0, HERE)

import reference_page  # noqa: E402
from scratch import new_folder  # noqa: E402

PAGE = os.path.join(HERE, "fixtures", "signed-in-page", "new-post.html")
PLANTED = [
    "beth.fake.person@example.com", "second.fake@example.org", "FAKEMETA1234567890abcdef",
    "csrf-FAKE-0123456789abcdef", "sess_FAKEFAKEFAKE12345678",
    "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJmYWtlIn0.c2lnbmF0dXJlZmFrZQ",
    "HIDDENFAKE0123456789abcdef", "98765432", "55554444", "APIKEYFAKE0123456789", "11112222",
]


def printed(fn, *args):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        fn(*args)
    return buf.getvalue()


class ScanTests(unittest.TestCase):
    def test_counts_each_kind_in_the_page_and_its_files(self):
        found = reference_page.scan_counts(PAGE)
        page = found["new-post.html"]
        self.assertEqual(page["email addresses"], 2)
        self.assertEqual(page["sign-in keys in token form"], 1)
        self.assertGreaterEqual(page["named keys (session, csrf, access, api key, cookie, password)"], 2)
        self.assertEqual(page["key meta tags"], 1)
        self.assertEqual(page["hidden form fields"], 1)
        self.assertGreaterEqual(page["account numbers (user, creator, campaign and like ids)"], 2)
        files = found[os.path.join("new-post_files", "app.js")]
        self.assertEqual(files["email addresses"], 1)
        self.assertEqual(files["account numbers (user, creator, campaign and like ids)"], 1)

    def test_scan_prints_no_value(self):
        out = printed(reference_page.scan, PAGE)
        self.assertIn("never values", out)
        for v in PLANTED:
            self.assertNotIn(v, out)

    def test_nothing_found_on_a_plain_page(self):
        plain = os.path.join(HERE, "pages", "mock-new-post.html")
        self.assertEqual(reference_page.scan_counts(plain), {})


class SurveyTests(unittest.TestCase):
    def test_survey_finds_the_form_and_prints_no_value(self):
        out = printed(reference_page.survey, PAGE)
        self.assertIn('aria-label="Title"', out)
        self.assertIn('data-tag="make-a-post-action-publish"', out)
        self.assertIn('id="photosInput"', out)
        self.assertIn("[email]", out)
        self.assertNotIn("hidden", out)
        for v in PLANTED:
            self.assertNotIn(v, out)


class TestCopyTests(unittest.TestCase):
    def test_copy_has_no_value_and_no_page_scripts(self):
        out_dir = new_folder("reference-copy")
        with contextlib.redirect_stdout(io.StringIO()):
            path = reference_page.make_test(PAGE, out_dir)
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
        for v in PLANTED:
            self.assertNotIn(v, text)
        self.assertNotIn("bootstrap", text)
        self.assertNotIn('type="hidden"', text)
        self.assertNotIn("csrf-token", text)
        self.assertIn('aria-label="Title"', text)
        self.assertIn("filler.js", text)
        self.assertIn("scheduler.js", text)


@unittest.skipUnless(shutil.which("git"), "git not found")
class KeptOutOfGitTests(unittest.TestCase):
    def test_saved_pages_and_copies_are_ignored(self):
        paths = ["reference/new-post.html", "reference/new-post_files/app.js",
                 "tests/pages/generated/new-post.test.html", "packages/post-01/post.json"]
        out = subprocess.run(["git", "-C", REPO, "check-ignore"] + paths, capture_output=True, timeout=60)
        self.assertEqual(sorted(out.stdout.decode().split()), sorted(paths))

    def test_no_remote(self):
        out = subprocess.run(["git", "-C", REPO, "remote"], capture_output=True, timeout=60)
        self.assertEqual(out.stdout.decode().strip(), "")


if __name__ == "__main__":
    unittest.main()

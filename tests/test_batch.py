"""Tests for batches: choosing the coming week's posts, approval, the log,
and the go-live scripts' form.

Run from the repository root:  python -B -m unittest discover -s tests -v
"""

import datetime
import json
import os
import re
import shutil
import subprocess
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, REPO)
sys.path.insert(0, HERE)

import desk  # noqa: E402
import desk_batch  # noqa: E402
import desk_package  # noqa: E402
from scratch import new_folder  # noqa: E402

FIX = os.path.join(HERE, "fixtures")
TODAY = datetime.date(2026, 11, 6)


def make(root, name, ready="ready-tiers", date=None, time=None):
    data, sources = desk.build_from_ready(os.path.join(FIX, ready), date=date, time=time)
    data["source"]["converted_on"] = "2026-11-06"
    desk_package.write_package(os.path.join(root, name), data, sources)


def queue():
    root = new_folder("queue")
    make(root, "a-later", date="2026-11-12", time="10:00")
    make(root, "b-soon", date="2026-11-08", time="09:00")
    make(root, "c-far", date="2026-11-27", time="09:00")
    make(root, "d-past", date="2026-11-01", time="09:00")
    make(root, "e-no-date")
    make(root, "f-no-time", date="2026-11-09")
    make(root, "g-open-note", ready="ready-basic", date="2026-11-10", time="09:00")
    make(root, "h-today", date="2026-11-06", time="20:00")
    return root


class SelectTests(unittest.TestCase):
    def test_window_order_and_left_out(self):
        root = queue()
        batch, left = desk_batch.select(root, TODAY, 7)
        self.assertEqual([e["name"] for e in batch], ["h-today", "b-soon", "a-later"])
        left = dict(left)
        self.assertIn("no time", left["f-no-time"])
        self.assertIn("editor's note", left["g-open-note"])
        self.assertIn("SUGGESTED LINE", left["g-open-note"])
        self.assertNotIn("c-far", left)
        self.assertNotIn("d-past", left)
        e = batch[1]
        self.assertEqual((e["date"], e["time"], e["access"]),
                         ("2026-11-08", "09:00", {"type": "paid", "tiers": ["Back End View", "Machine Room"], "sell": False}))
        self.assertEqual(desk_batch.who_says(e), "Paid access, tiers: Back End View, Machine Room")
        self.assertEqual(e["post_json_sha256"], desk_package.sha256_of(os.path.join(root, "b-soon", "post.json")))

    def test_three_weeks_ahead_waits_for_its_week(self):
        root = queue()
        batch, _ = desk_batch.select(root, datetime.date(2026, 11, 21), 7)
        self.assertEqual([e["name"] for e in batch], ["c-far"])

    def test_log_leaves_out_scheduled(self):
        root = queue()
        with open(os.path.join(root, desk_batch.LOG_NAME), "w", encoding="utf-8") as f:
            f.write("# run date\tpackage\ttitle\tscheduled for\tresult\tdetail\n")
            f.write("2026-11-06\tb-soon\tT\t2026-11-08 09:00\tscheduled\thttps://example.invalid/posts/1\n")
            f.write("2026-11-06\ta-later\tT\t2026-11-12 10:00\tstopped\tNot every check passed\n")
        batch, _ = desk_batch.select(root, TODAY, 7)
        self.assertEqual([e["name"] for e in batch], ["h-today", "a-later"])

    def test_unconfirmed_is_left_out_by_name(self):
        root = queue()
        with open(os.path.join(root, desk_batch.LOG_NAME), "w", encoding="utf-8") as f:
            f.write("2026-11-06\tb-soon\tT\t2026-11-08 09:00\tunconfirmed\tstayed in the editor\n")
        batch, left = desk_batch.select(root, TODAY, 7)
        self.assertNotIn("b-soon", [e["name"] for e in batch])
        self.assertIn("not confirmed", dict(left)["b-soon"])
        with open(os.path.join(root, desk_batch.LOG_NAME), "a", encoding="utf-8") as f:
            f.write("2026-11-06\tb-soon\tT\t2026-11-08 09:00\tscheduled\tBeth confirmed\n")
        batch, left = desk_batch.select(root, TODAY, 7)
        self.assertNotIn("b-soon", dict(left))
        self.assertNotIn("b-soon", [e["name"] for e in batch])

    def test_open_notes_ignore_image_markers(self):
        self.assertEqual(desk_batch.open_notes("<p>[IMAGE 1: a.png]</p><p>Fine [sic] text.</p>"), [])
        self.assertEqual(len(desk_batch.open_notes("<p>[SUGGESTED LINE, keep: x]</p>")), 1)
        self.assertEqual(len(desk_batch.open_notes("<p>[TODO: x]</p>")), 1)

    def test_batch_id_follows_the_posts(self):
        root = queue()
        batch, _ = desk_batch.select(root, TODAY, 7)
        one = desk_batch.batch_id(batch, TODAY)
        self.assertEqual(one, desk_batch.batch_id(batch, TODAY))
        self.assertRegex(one, r"^2026-11-06-[0-9a-f]{10}$")
        changed = [dict(e) for e in batch]
        changed[0]["post_json_sha256"] = "0" * 64
        self.assertNotEqual(one, desk_batch.batch_id(changed, TODAY))


class ApproveTests(unittest.TestCase):
    def test_preview_and_approval_written_once(self):
        root = queue()
        batch, left = desk_batch.select(root, TODAY, 7)
        bid = desk_batch.batch_id(batch, TODAY)
        p = desk_batch.preview(root, bid, batch, left)
        with open(p, "rb") as f:
            text = f.read().decode("ascii")
        self.assertIn("For the back end view", text)
        self.assertIn("Only for two tiers.", text)
        self.assertIn("g-open-note", text)
        a = desk_batch.approve(root, bid, batch, TODAY)
        before = os.path.getmtime(a)
        with open(a, "r", encoding="ascii") as f:
            data = json.load(f)
        self.assertEqual(data["format"], desk_batch.BATCH_FORMAT)
        self.assertEqual(data["id"], bid)
        self.assertEqual(data["approved_on"], "2026-11-06")
        self.assertEqual([e["name"] for e in data["packages"]], ["h-today", "b-soon", "a-later"])
        self.assertEqual(desk_batch.approve(root, bid, batch, TODAY), a)
        self.assertEqual(before, os.path.getmtime(a))

    def test_cli_approve_needs_the_shown_id(self):
        root = queue()
        self.assertEqual(desk.main(["batch", "--out", root, "--today", "2026-11-06"]), 0)
        self.assertEqual(desk.main(["approve", "--out", root, "--today", "2026-11-06", "--batch-id", "2026-11-06-0000000000"]), 2)
        self.assertEqual([n for n in os.listdir(os.path.join(root, "_batches")) if n.endswith(".json")], [])
        batch, _ = desk_batch.select(root, TODAY, 7)
        bid = desk_batch.batch_id(batch, TODAY)
        self.assertEqual(desk.main(["approve", "--out", root, "--today", "2026-11-06", "--batch-id", bid]), 0)
        self.assertTrue(os.path.isfile(os.path.join(root, "_batches", "batch-%s.json" % bid)))

    def test_changed_post_changes_the_batch(self):
        root = queue()
        batch, _ = desk_batch.select(root, TODAY, 7)
        bid = desk_batch.batch_id(batch, TODAY)
        # A post replaced after it was shown: set the old one aside, write a new one.
        os.makedirs(os.path.join(root, "set-aside"))
        shutil.move(os.path.join(root, "b-soon"), os.path.join(root, "set-aside", "b-soon"))
        make(root, "b-soon", date="2026-11-08", time="11:00")
        batch2, _ = desk_batch.select(root, TODAY, 7)
        self.assertNotEqual(bid, desk_batch.batch_id(batch2, TODAY))

    def test_empty_batch(self):
        root = new_folder("empty-queue")
        self.assertEqual(desk.main(["batch", "--out", root, "--today", "2026-11-06"]), 3)

    def test_go_live_address_comes_from_the_selectors_file(self):
        with open(os.path.join(REPO, "extension", "selectors.js"), encoding="ascii") as f:
            sel = f.read()
        page = re.search(r'newPostPage:\s*"([^"]+)"', sel).group(1)
        marker = re.search(r'batchMarker:\s*"([^"]+)"', sel).group(1)
        self.assertEqual(desk_batch.go_live_url("2026-11-06-abc"), page + marker + "2026-11-06-abc")


class ScriptTests(unittest.TestCase):
    def read(self, name):
        with open(os.path.join(REPO, name), "rb") as f:
            raw = f.read()
        return raw.decode("ascii")

    def test_scripts_call_nothing_on_the_network(self):
        for name in ("go-live.ps1", "go-live.sh"):
            text = self.read(name)
            for bad in ("Invoke-WebRequest", "Invoke-RestMethod", "curl", "wget", "Net.WebClient",
                        "remote-debugging", "Cookie", "password"):
                self.assertNotIn(bad, text, (name, bad))

    def test_scripts_ask_for_yes_before_approving(self):
        ps = self.read("go-live.ps1")
        self.assertLess(ps.index("Read-Host"), ps.index('"approve"'))
        sh = self.read("go-live.sh")
        self.assertLess(sh.index("read -r ANSWER"), sh.index("desk.py approve"))

    @unittest.skipUnless(shutil.which("powershell"), "no PowerShell here")
    def test_powershell_script_parses(self):
        cmd = ('$e=$null; $t=$null; [void][System.Management.Automation.Language.Parser]::ParseFile('
               '"%s",[ref]$t,[ref]$e); $e.Count' % os.path.join(REPO, "go-live.ps1"))
        out = subprocess.run(["powershell", "-NoProfile", "-Command", cmd], capture_output=True, timeout=60)
        self.assertEqual(out.stdout.decode().strip(), "0")

    @unittest.skipUnless(shutil.which("sh"), "no shell here")
    def test_shell_script_parses(self):
        out = subprocess.run(["sh", "-n", os.path.join(REPO, "go-live.sh")], capture_output=True, timeout=60)
        self.assertEqual(out.returncode, 0, out.stderr)


if __name__ == "__main__":
    unittest.main()

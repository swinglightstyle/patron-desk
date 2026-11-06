"""Runs the filler on the mock page in the browser's headless mode.

Skipped when no browser is found (see tools/run_page_tests.py).
"""

import os
import sys
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, os.path.join(REPO, "tools"))

import run_page_tests  # noqa: E402

BROWSER = run_page_tests.find_browser()


@unittest.skipUnless(BROWSER, "no browser found; set \"browser\" in places.json")
class MockPageTests(unittest.TestCase):
    def run_mode(self, mode):
        res = run_page_tests.run_page(BROWSER, run_page_tests.MOCK, "mode=" + mode)
        self.assertNotIn("error", res, res)
        failed = [c for c in res["checks"] if not c["pass"]]
        self.assertEqual(failed, [])
        self.assertGreater(res["passed"], 10)

    def test_every_extension_file_loads(self):
        page = os.path.join(REPO, "tests", "pages", "load-check.html")
        res = run_page_tests.run_page(BROWSER, page)
        self.assertNotIn("error", res, res)
        self.assertEqual([c for c in res["checks"] if not c["pass"]], [])

    def test_editor_that_takes_paste(self):
        self.run_mode("editor")

    def test_pictures_with_no_loading_sign_are_waited_for(self):
        self.run_mode("unmarked")

    def test_plain_text_box(self):
        self.run_mode("plain")

    def test_page_not_empty(self):
        self.run_mode("full")

    def test_paywall_line_kept_and_page_still_fresh(self):
        self.run_mode("paidfirst")

    def test_batch_presses_schedule_when_every_check_passes(self):
        self.run_mode("batch")

    def test_batch_stops_on_a_miss(self):
        self.run_mode("batchmiss")

    def test_batch_is_not_stopped_by_captions(self):
        self.run_mode("batchsoft")

    def test_batch_stops_on_a_picture_that_never_uploads(self):
        self.run_mode("stuck")

    def test_saved_pages_when_present(self):
        """Fills a test copy of each saved page in reference/, when there are any.

        The copies go to the scratch folder, with scripts, hidden fields and
        private values taken out. A saved page has no scripts, so only what
        is found is checked: the title and text boxes, and that nothing that
        sends, deletes or makes was pressed.
        """
        sys.path.insert(0, os.path.join(REPO, "tools"))
        import contextlib
        import io
        import reference_page
        from scratch import new_folder
        folder = os.path.join(REPO, "reference")
        pages = sorted(n for n in os.listdir(folder) if n.endswith(".html")) if os.path.isdir(folder) else []
        if not pages:
            self.skipTest("no saved pages in reference/")
        out = new_folder("reference-tests")
        for name in pages:
            with contextlib.redirect_stdout(io.StringIO()):
                copy = reference_page.make_test(os.path.join(folder, name), out)
            self.assertEqual(reference_page.scan_counts(copy), {}, name)
            res = run_page_tests.run_page(BROWSER, copy, "mode=reference")
            self.assertNotIn("error", res, (name, res))
            self.assertEqual([c for c in res["checks"] if not c["pass"]], [], name)

    def run_desk(self, scenario):
        page = os.path.join(REPO, "tests", "pages", "desk-batch-check.html")
        query = ("batch=test-batch-1&tab=1&" if scenario in "abcd" else "") + "scenario=" + scenario
        res = run_page_tests.run_page(BROWSER, page, query)
        self.assertNotIn("error", res, res)
        self.assertEqual([c for c in res["checks"] if not c["pass"]], [])
        self.assertGreaterEqual(res["passed"], 5)

    def test_desk_batch_schedules_in_order_and_skips_logged(self):
        self.run_desk("a")

    def test_desk_batch_stops_on_a_changed_post(self):
        self.run_desk("b")

    def test_desk_batch_stops_when_a_check_fails(self):
        self.run_desk("c")

    def test_desk_batch_refuses_an_old_approval(self):
        self.run_desk("d")

    def test_desk_fill_opens_a_fresh_post_in_a_new_window(self):
        self.run_desk("e")

    def test_desk_fill_stops_at_the_sign_in_page(self):
        self.run_desk("f")

    def test_desk_fill_and_schedule_presses_schedule_when_all_pass(self):
        self.run_desk("g")

    def test_desk_fill_and_schedule_stops_when_a_check_fails(self):
        self.run_desk("h")

    def test_desk_fill_and_schedule_refuses_a_past_time(self):
        self.run_desk("i")

    def test_desk_refuses_an_old_filler(self):
        self.run_desk("j")

    def test_desk_counts_a_changed_schedule_button_as_scheduled(self):
        self.run_desk("k")

    def test_desk_logs_unconfirmed_not_stopped(self):
        self.run_desk("l")


if __name__ == "__main__":
    unittest.main()

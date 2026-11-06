"""Working folders for tests, kept outside the repository and never deleted.

The place is "scratch" in places.json. Each call makes a new numbered
folder, so a run never writes over an earlier one.
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)


def scratch_root():
    with open(os.path.join(REPO, "places.json"), "r", encoding="utf-8") as f:
        value = json.load(f)["scratch"]
    root = value if os.path.isabs(value) else os.path.normpath(os.path.join(REPO, value))
    return os.path.join(root, "test-runs")


def new_folder(label):
    root = scratch_root()
    os.makedirs(root, exist_ok=True)
    n = 1
    while True:
        path = os.path.join(root, "%s-%04d" % (label, n))
        try:
            os.makedirs(path)
            return path
        except FileExistsError:
            n += 1

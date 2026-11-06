# The post package

One folder per post, holding `post.json` and its pictures:

    packages/
      post-01/
        post.json
        images/
          overview.png

## post.json

    {
      "format": "patron-desk-post-2",
      "title": "The post's title",
      "body_html": "<p>The body, as HTML.</p>\n<p>[IMAGE 1: overview.png]</p>",
      "access": {"type": "paid", "tiers": "all", "sell": false},
      "images": [
        {
          "file": "images/overview.png",
          "alt": "What the picture shows.",
          "at": "marker",
          "marker": "[IMAGE 1: overview.png]",
          "caption": "A line shown under the picture, or null.",
          "sha256": "..."
        }
      ],
      "image_text": "alt",
      "collection": null,
      "tags": ["build log"],
      "comments": null,
      "schedule": {"date": "2026-11-10", "time": "09:00"},
      "notes": ["Things to act on before publishing."],
      "source": {"folder": "...", "files_sha256": {"post.md": "..."}, "converted_on": "2026-11-06"}
    }

- `format`: `patron-desk-post-2` for this version (6 November 2026, after Beth's screenshots of the editor). Version 1 packages are not filled: set them aside and convert again.
- `title`: plain text.
- `body_html`: the body as HTML: paragraphs, headings, lists, quotes, emphasis, strong, links. `desk.py convert` makes it from Markdown.
- `access`: `{"type": "free"}` (Free access), or `{"type": "paid", "tiers": "all" or ["Tier A", ...], "sell": false}` (Paid access, Paid members in those tiers; `sell` ticks Sell this post). Tier names as the page shows them.
- `images`: in order. `file` is inside the package. `alt` is the picture's description (see `image_text` for where it goes). `at` is `gallery` (the gallery above the title, through the page's picture box) or `marker` (in the text where its marker line is). `marker` is the exact marker line text. `sha256` is written by the converter.
- `images[].caption`: the picture's own caption, shown under it (140 characters at most), or `null`. It goes in as well as the alt text.
- `image_text`: where each description goes: `alt` (the picture's alt text, the default), `caption` (the picture's caption, 140 characters at most), `body` (a line "Image description: ..." in the text, put there by the converter), or `none`.
- `collection`: the name of an existing collection, or `null`. A collection is never made.
- `tags`: a list of tags, maybe empty.
- `comments`: `anyone` (Anyone with access), `no-one` (No one), or `null` to leave the page as it is.
- `schedule`: `null`, or a date like `2026-11-10` and an optional 24 hour time like `09:00`.
- `notes`: shown in the checklist after a fill.
- `source`: where the package came from, with fingerprints of its files, for the record.

A package is written once and never written over. A changed post is a new package.

## Batches and the go-live log

Beside the packages:

    packages/
      _batches/
        batch-2026-11-07-1a2b3c4d5e.json          the approval
        batch-2026-11-07-1a2b3c4d5e-preview.html  the page Beth read
      go-live-log.txt

The approval, written by `desk.py approve` only after Beth types yes in go-live:

    {
      "format": "patron-desk-batch-1",
      "id": "2026-11-07-1a2b3c4d5e",
      "approved_on": "2026-11-07",
      "approved_by": "typed yes in the go-live console",
      "packages": [
        {"name": "post-02", "title": "...", "date": "2026-11-10", "time": "09:00",
         "access": {"type": "free"}, "images": 1, "post_json_sha256": "..."}
      ]
    }

The id is the approval date and a fingerprint of the posts in it. An approval file is written once and never written over.

The log has one line per post per run, separated by tabs: run date, package, title, scheduled for, result (`scheduled`, `unconfirmed` when Schedule was pressed but could not be seen to take, or `stopped`), and detail (the post's page address, or why it stopped). The desk only adds lines. A package the log shows as `scheduled` or `unconfirmed` is left out of later batches; the last line for a package wins, so a `scheduled` line added after checking Patreon settles an `unconfirmed` one.

## From a patron bank ready folder

`desk.py convert` reads:

- `post.md`: header lines `TITLE:` and `WHO SEES IT:`, then a line that is only `---`, then the body in Markdown. `[IMAGE: images/x.png, ...]` paragraphs become marker lines. Other `[CAPITALS: ...]` paragraphs are editor's notes: they stay in the text and are listed in `notes`.
- `alt-text.txt`: lines like `x.png: the description`. These become the pictures' descriptions.
- `captions.txt` (optional): lines like `x.png: a caption`. These become the pictures' own captions.
- `images/`: the pictures, copied, never moved.

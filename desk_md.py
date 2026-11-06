"""A small Markdown to HTML converter for patron posts.

Standard library only. It covers what a post needs and nothing more:
paragraphs, headings, lists, quotes, *emphasis*, **strong**, `code`,
[links](https://...) and bare web addresses, which become links.

Editor's notes in square brackets, such as "[SUGGESTED LINE, keep, change
or cut: ...]", stay in the text so they are seen, and are returned in a
list so the desk can show them. "[IMAGE: images/x.png, ...]" paragraphs
become image markers, which the extension replaces with the image.
"""

import html
import re

# A whole paragraph that is an editor's note: "[WORDS IN CAPITALS, ...]" or
# "[WORDS IN CAPITALS: ...]".
NOTE_RE = re.compile(r"^\[([A-Z][A-Z ]*[A-Z])\s*[,:](.*)\]$", re.S)
IMAGE_NOTE = "IMAGE"

INLINE_RE = re.compile(
    r"\[(?P<ltext>[^\]\n]+)\]\((?P<lurl>https?://[^\s)]+)\)"
    r"|(?P<url>https?://[^\s<>()\"'\[\]]+)"
    r"|\*\*(?P<strong>.+?)\*\*"
    r"|(?<![\w*])\*(?![\s*])(?P<em>.+?)(?<![\s*])\*(?![\w*])"
    r"|(?<![\w_])_(?![\s_])(?P<em2>.+?)(?<![\s_])_(?![\w_])"
    r"|`(?P<code>[^`]+)`"
)

TRAILING = ".,;:!?"


def esc(text):
    """Escape text between tags. Quotes stay as they are there."""
    return html.escape(text, quote=False)


def esc_attr(text):
    return html.escape(text, quote=True)


def link(url, inner_html):
    return '<a href="%s">%s</a>' % (esc_attr(url), inner_html)


def inline(text):
    """Convert one run of text (no block structure) to HTML."""
    out = []
    pos = 0
    for m in INLINE_RE.finditer(text):
        out.append(esc(text[pos:m.start()]))
        pos = m.end()
        if m.group("ltext") is not None:
            out.append(link(m.group("lurl"), inline(m.group("ltext"))))
        elif m.group("url") is not None:
            url = m.group("url")
            tail = ""
            while url and url[-1] in TRAILING:
                tail = url[-1] + tail
                url = url[:-1]
            out.append(link(url, esc(url)) + esc(tail))
        elif m.group("strong") is not None:
            out.append("<strong>%s</strong>" % inline(m.group("strong")))
        elif m.group("em") is not None:
            out.append("<em>%s</em>" % inline(m.group("em")))
        elif m.group("em2") is not None:
            out.append("<em>%s</em>" % inline(m.group("em2")))
        else:
            out.append("<code>%s</code>" % esc(m.group("code")))
    out.append(esc(text[pos:]))
    return "".join(out)


def split_blocks(text):
    """Split text into blocks on blank lines."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    blocks = []
    current = []
    for line in text.split("\n"):
        if line.strip() == "":
            if current:
                blocks.append(current)
                current = []
        else:
            current.append(line.rstrip())
    if current:
        blocks.append(current)
    return blocks


def image_marker_text(number, file_name):
    """The text of an image marker paragraph. The extension looks for it."""
    return "[IMAGE %d: %s]" % (number, file_name)


def parse_image_note(body):
    """From the inside of an [IMAGE: ...] note, the image path (first part)."""
    first = body.strip().split(",")[0].strip()
    return first.strip("\"'")


def convert(text):
    """Convert Markdown text.

    Returns (html, notes, image_paths): the HTML, the editor's notes (other
    than image notes) in order, and the image paths named by image notes in
    order. Image notes become marker paragraphs numbered from 1.
    """
    parts = []
    notes = []
    images = []
    for lines in split_blocks(text):
        joined = " ".join(l.strip() for l in lines)
        note = NOTE_RE.match(joined)
        if note and note.group(1) == IMAGE_NOTE:
            path = parse_image_note(note.group(2))
            images.append(path)
            name = path.replace("\\", "/").split("/")[-1]
            parts.append("<p>%s</p>" % esc(image_marker_text(len(images), name)))
            continue
        if note:
            notes.append(joined)
            parts.append("<p>%s</p>" % inline(joined))
            continue
        first = lines[0].lstrip()
        heading = re.match(r"^(#{1,6})\s+(.*)$", first)
        if heading and len(lines) == 1:
            level = len(heading.group(1))
            parts.append("<h%d>%s</h%d>" % (level, inline(heading.group(2).strip()), level))
            continue
        if all(re.match(r"^\s*[-*+]\s+", l) for l in lines):
            items = [re.sub(r"^\s*[-*+]\s+", "", l) for l in lines]
            parts.append("<ul>%s</ul>" % "".join("<li>%s</li>" % inline(i) for i in items))
            continue
        if all(re.match(r"^\s*\d+[.)]\s+", l) for l in lines):
            items = [re.sub(r"^\s*\d+[.)]\s+", "", l) for l in lines]
            parts.append("<ol>%s</ol>" % "".join("<li>%s</li>" % inline(i) for i in items))
            continue
        if all(l.lstrip().startswith(">") for l in lines):
            inner = " ".join(re.sub(r"^\s*>\s?", "", l) for l in lines)
            parts.append("<blockquote><p>%s</p></blockquote>" % inline(inner.strip()))
            continue
        parts.append("<p>%s</p>" % inline(joined))
    return "\n".join(parts), notes, images


MARKER_P_RE = re.compile(r"<p>\[IMAGE \d+: [^\]<]*\]</p>\n?")


def drop_image_markers(html_text):
    """Takes out the image marker lines, for pictures that go in the gallery."""
    return MARKER_P_RE.sub("", html_text).strip("\n")


def add_descriptions(html_text, images):
    """Puts a line "Image description: ..." in the text for each picture.

    For a picture at a marker line, right after that line; for gallery
    pictures, at the top of the text, nearest the gallery.
    """
    top = []
    for img in images:
        alt = (img.get("alt") or "").strip()
        if not alt:
            continue
        line = "<p>Image description: %s</p>" % esc(alt)
        marker = img.get("marker")
        if img.get("at") == "marker" and marker:
            mp = "<p>%s</p>" % esc(marker)
            html_text = html_text.replace(mp, mp + "\n" + line, 1)
        else:
            top.append(line)
    if top:
        html_text = "\n".join(top) + "\n" + html_text
    return html_text


def plain_text(html_text):
    """The visible text of converted HTML, for checks: tags out, entities in."""
    text = re.sub(r"<[^>]+>", " ", html_text)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()

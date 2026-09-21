#!/usr/bin/env python3
"""Bundle the site into one self-contained HTML file.

One standalone HTML file: inline CSS and JS, no build step at serve time, no
external assets. This inlines styles.css, app.js and every data/*.json listed in
data/events.json, patches loadJSON() to read the embedded copies instead of
fetching, and swaps in the meta/og/canonical/favicon block.

    python3 tools/build_single.py -o /path/to/ti-archive.html
"""
import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

TITLE = "TI Archive — rewatch Dota 2's The International without spoilers"
DESC = ("A spoiler-free viewer for archived Dota 2 International VODs: the bracket, game "
        "count, video length and result all stay hidden until you have watched them.")
# The archive moved to its own domain on 2026-09-20; antvelm.net/ti-archive 301s here.
URL = "https://tiarchive.com/"
HEAD = f"""<title>{TITLE}</title>
<meta name="description" content="{DESC}">
<meta property="og:type" content="website">
<meta property="og:title" content="{TITLE}">
<meta property="og:description" content="{DESC}">
<meta property="og:url" content="{URL}">
<link rel="canonical" href="{URL}">"""

FETCH_SRC = """  const cache = {};
  async function loadJSON(url) {
    if (cache[url]) return cache[url];
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
    return (cache[url] = await r.json());
  }"""

FETCH_DST = """  const cache = {};
  // Single-file build: data/*.json are embedded above, so nothing is fetched.
  async function loadJSON(url) {
    if (cache[url]) return cache[url];
    const embedded = (window.__TI_DATA__ || {})[url];
    if (embedded === undefined) throw new Error(`${url}: not embedded in this build`);
    return (cache[url] = embedded);
  }"""


def embed(paths):
    """JSON script tags plus the map loadJSON() reads."""
    out, keys = [], []
    for i, rel in enumerate(paths):
        text = (ROOT / rel).read_text(encoding="utf-8")
        json.loads(text)  # fail loudly on malformed data
        # "</" would close the script tag early; "\/" is a legal JSON string escape.
        safe = text.replace("</", "<\\/")
        out.append(f'<script type="application/json" id="ti-data-{i}">'
                   f'{safe}</script>')
        keys.append(f'  {json.dumps(rel)}: JSON.parse(document.getElementById("ti-data-{i}").textContent),')
    out.append("<script>\nwindow.__TI_DATA__ = {\n" + "\n".join(keys) + "\n};\n</script>")
    return "\n".join(out)


def sub(text, old, new, what):
    if text.count(old) != 1:
        sys.exit(f"build_single: expected exactly one {what}, found {text.count(old)}")
    return text.replace(old, new)


def build():
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = (ROOT / "styles.css").read_text(encoding="utf-8")
    js = (ROOT / "app.js").read_text(encoding="utf-8")

    data_files = ["data/events.json"]
    for ev in json.loads((ROOT / "data/events.json").read_text(encoding="utf-8")):
        data_files.append(ev["file"])

    js = sub(js, FETCH_SRC, FETCH_DST, "loadJSON() fetch block in app.js")

    # head: our own title/meta replace the site's, but the favicon is the site's own
    # Aegis and stays — the cut stops short of that line rather than swallowing it.
    start = html.index("<title>")
    end = html.index('<link rel="icon"')
    html = html[:start] + HEAD + "\n" + html[end:]

    html = sub(html, '<link rel="stylesheet" href="styles.css">',
               "<style>\n" + css.rstrip() + "\n</style>", "stylesheet link")
    html = sub(html, '<script src="app.js"></script>',
               embed(data_files) + "\n<script>\n" + js.rstrip() + "\n</script>", "app.js script tag")
    return html


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()
    pathlib.Path(a.out).write_text(build(), encoding="utf-8")
    print(f"wrote {a.out} ({pathlib.Path(a.out).stat().st_size:,} bytes)")

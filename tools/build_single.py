#!/usr/bin/env python3
"""Bundle the site into one self-contained HTML file for antvelm.net/artifacts.

The hub at /var/www/artifacts wants one standalone HTML file per tool: inline CSS
and JS, no build step at serve time, no external assets. This inlines styles.css,
app.js and every data/*.json listed in data/events.json, patches loadJSON() to read
the embedded copies instead of fetching, and adds the artifacts back-link plus the
meta/og/favicon block the hub README asks for.

    python3 tools/build_single.py -o /path/to/ti-archive.html
"""
import argparse
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

TITLE = "TI Archive — rewatch The International without spoilers"
DESC = ("A spoiler-free viewer for archived International VODs: the bracket, game count, "
        "video length and result all stay hidden until you have watched them.")
URL = "https://antvelm.net/ti-archive"
FAVICON = ("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'>"
           "<rect width='32' height='32' rx='7' fill='%230a0a0b'/><text x='16' y='23' "
           "font-family='monospace' font-size='19' font-weight='700' fill='%23a78bfa' "
           "text-anchor='middle'>a</text></svg>")

HEAD = f"""<title>{TITLE}</title>
<meta name="description" content="{DESC}">
<meta property="og:type" content="website">
<meta property="og:title" content="{TITLE}">
<meta property="og:description" content="{DESC}">
<meta property="og:url" content="{URL}">
<link rel="icon" href="{FAVICON}">"""

# Quiet link back to the hub. Recedes at rest, full contrast on hover/focus; sits
# above the sticky header, which scrolls over it.
BACK_CSS = """
/* back to the artifacts index */
.af-back { align-self: flex-start; display: inline-block; padding: 10px 20px 0; font-size: .78rem;
  letter-spacing: .02em; color: var(--muted); text-decoration: none; opacity: .55;
  transition: opacity .12s ease, color .12s ease; }
.af-back:hover, .af-back:focus-visible { opacity: 1; color: var(--text); }
.af-back:focus-visible { outline: 2px solid var(--gold); outline-offset: 3px; border-radius: 3px; }
@media (prefers-reduced-motion: reduce) { .af-back { transition: none; } }
"""

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
        out.append(f'<script type="application/json" id="ti-data-{i}">'
                   f'{text.replace("</", "<\\/")}</script>')
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

    # head: our own title/meta/favicon replace the site's
    start = html.index("<title>")
    end = html.index("\n", html.index('<link rel="icon"'))
    html = html[:start] + HEAD + html[end:]

    html = sub(html, '<link rel="stylesheet" href="styles.css">',
               "<style>\n" + css.rstrip() + "\n" + BACK_CSS + "</style>", "stylesheet link")
    html = sub(html, "<body>\n",
               '<body>\n<a class="af-back" href="/artifacts">← artifacts</a>\n', "<body> tag")
    html = sub(html, '<script src="app.js"></script>',
               embed(data_files) + "\n<script>\n" + js.rstrip() + "\n</script>", "app.js script tag")
    return html


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()
    pathlib.Path(a.out).write_text(build(), encoding="utf-8")
    print(f"wrote {a.out} ({pathlib.Path(a.out).stat().st_size:,} bytes)")

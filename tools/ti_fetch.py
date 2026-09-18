#!/usr/bin/env python3
"""Fetch the Liquipedia source data for TI1/TI4-TI8 and write one compact file.

Run this from a clean IP when the usual machine has been rate-limited, then commit
the result and push, so that machine can pull it instead of calling Liquipedia at all.

    git pull
    python3 tools/ti_fetch.py      # writes source-drop/ti-source.json.gz
    git add source-drop && git commit -m "source dump" && git push

Stdlib only. Seven requests, spaced 3s apart, with the descriptive User-Agent
Liquipedia asks for - please do not lower the delay.
"""
import collections, gzip, json, os, pathlib, re, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTDIR = ROOT / "source-drop"

UA = "TIArchive/0.1 (https://github.com/antvelm/dota2_ti_archive; contact: anton@manapotionstudios.com)"
API = "https://liquipedia.net/dota2/api.php"
PAGES = ["The International/2011/Playoffs", "The International/2014/Main Event",
         "The International/2015/Main Event", "The International/2016/Main Event",
         "The International/2017/Main Event", "The International/2018/Main Event",
         "The International/2011", "The International/2014", "The International/2015",
         "The International/2016", "The International/2017", "The International/2018"]
OVERVIEWS = ["The International/2011", "The International/2014", "The International/2015",
             "The International/2016", "The International/2017", "The International/2018"]

def api(**p):
    p.setdefault("format", "json")
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(p),
                                 headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
    return json.loads(raw)

CARD = 'general-collapsible collapsed team-participant-card'
PLAYER = re.compile(r'<span class="flag"><img alt="([^"]+)"[^>]*/></span>'
                    r'<span class="name"[^>]*><a href="[^"]*" title="([^"]+)"')

def rosters(html):
    """[[team-index, {country: n}, [players]]] in participant order."""
    i = html.find('id="Participants"')
    if i < 0:
        return []
    seg = html[i:]
    for stop in ('id="Results"', 'id="Prize_Pool"', 'id="Broadcast'):
        j = seg.find(stop)
        if j > 0:
            seg = seg[:j]
    out = []
    for k, part in enumerate(seg.split(CARD)[1:]):
        pl = PLAYER.findall(part)
        if pl:
            out.append([k, dict(collections.Counter(c for c, _ in pl)), [n for _, n in pl]])
    return out

def main():
    data = {"wikitext": {}, "rosters": {}}
    print("1/7  all wikitext in one query request ...", flush=True)
    j = api(action="query", prop="revisions", rvprop="content", rvslots="main",
            redirects="1", titles="|".join(PAGES))
    for p in j["query"]["pages"].values():
        if "revisions" in p:
            data["wikitext"][p["title"]] = p["revisions"][0]["slots"]["main"]["*"]
    print(f"     got {len(data['wikitext'])} pages", flush=True)

    for n, page in enumerate(OVERVIEWS, 2):
        time.sleep(3)
        print(f"{n}/7  rosters for {page} ...", flush=True)
        try:
            html = api(action="parse", page=page, prop="text")["parse"]["text"]["*"]
            data["rosters"][page] = rosters(html)
            print(f"     {len(data['rosters'][page])} teams", flush=True)
        except Exception as e:
            data["rosters"][page] = []
            print(f"     FAILED: {e}", flush=True)

    OUTDIR.mkdir(exist_ok=True)
    out = OUTDIR / "ti-source.json.gz"
    with gzip.open(out, "wt", encoding="utf-8") as f:
        json.dump(data, f)
    print(f"\nwrote {out} ({os.path.getsize(out):,} bytes)")
    for t, w in sorted(data["wikitext"].items()):
        print(f"  {t:40} {len(w):7} chars  matches={w.count('={{Match'):3} vods={w.count('vodgame'):3}")

if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Fetch the Liquipedia source data for TI9-TI15 (2019, 2021-2026).

Run this from a clean IP when the usual machine has been rate-limited, then commit
the result and push, so that machine can pull it instead of calling Liquipedia at all.

    git pull
    python3 tools/ti_fetch2.py     # writes source-drop/ti-source-2.json.gz
    git add source-drop && git commit -m "source dump: TI9-TI15" && git push

Stdlib only, no arguments. Same manners as tools/ti_fetch.py: the descriptive
User-Agent Liquipedia asks for, the gzip header it requires, one bulk 'query' for
every wikitext page at once, then one 'parse' per page 3 s apart - please do not
lower the delay.

Why it fetches rendered HTML as well as wikitext
  Up to 2018 a bracket page spelled every match out in its own text, so wikitext was
  enough. From 2022 the brackets are stored in Liquipedia's database and the page
  text is little more than a placeholder - the match ids, game lengths, winners and
  VOD links only appear once the page is rendered. Which years changed over is
  exactly what this dump is meant to settle, so it takes both for every year.

Optional, and much better if you have it
  Liquipedia gives out free API keys at <https://api.liquipedia.net> (sign in, then
  "Create API key"). With one, the database rows behind those brackets can be read
  directly instead of scraped out of HTML - per game: the Valve match id, the winner,
  the length and *every* VOD link, including the Russian one. Set it before running:

    PowerShell   $env:LIQUIPEDIA_API_KEY = "..."
    bash         export LIQUIPEDIA_API_KEY=...

  Without it the script still works; it just skips that step and says so.
"""
import gzip, json, os, pathlib, re, sys, time, urllib.error, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUTDIR = ROOT / "source-drop"
OUT = OUTDIR / "ti-source-2.json.gz"

UA = "TIArchive/0.1 (https://github.com/antvelm/dota2_ti_archive; contact: anton@manapotionstudios.com)"
API = "https://liquipedia.net/dota2/api.php"
V3 = "https://api.liquipedia.net/api/v3/match"
PAUSE = 3

YEARS = [2019, 2021, 2022, 2023, 2024, 2025, 2026]
# Liquipedia has renamed the playoff subpage over the years and no single guess covers
# all seven, so ask for every name any of them might use. Asking costs nothing: they all
# travel in the one bulk request and the ones that do not exist come back marked missing.
SUBPAGES = ["Main Event", "Playoffs", "Finals"]


def titles_for(year):
    return [f"The International/{year}"] + [f"The International/{year}/{s}" for s in SUBPAGES]


def api(**p):
    p.setdefault("format", "json")
    req = urllib.request.Request(API + "?" + urllib.parse.urlencode(p),
                                 headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
    j = json.loads(raw)
    if "error" in j:
        raise RuntimeError(j["error"].get("info", j["error"]))
    return j


SCRIPT = re.compile(r"<(script|style)\b.*?</\1>", re.S | re.I)
COMMENT = re.compile(r"<!--.*?-->", re.S)


def slim(html):
    """Drop what is never part of a bracket. Halves the dump; changes nothing we read."""
    return COMMENT.sub("", SCRIPT.sub("", html))


def v3_matches(pagename, key):
    """The match2 rows for one page: per-game match ids, winners, lengths and vods."""
    q = urllib.parse.urlencode({
        "wiki": "dota2",
        "conditions": f"[[pagename::{pagename.replace(' ', '_')}]]",
        "limit": "500",
    })
    req = urllib.request.Request(f"{V3}?{q}", headers={
        "User-Agent": UA, "Accept-Encoding": "gzip", "Authorization": f"Apikey {key}"})
    with urllib.request.urlopen(req, timeout=90) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
    return json.loads(raw)


def main():
    data = {"wikitext": {}, "html": {}, "v3": {}}
    wanted = [t for y in YEARS for t in titles_for(y)]

    print(f"1.  all {len(wanted)} wikitext pages in one query request ...", flush=True)
    try:
        j = api(action="query", prop="revisions", rvprop="content", rvslots="main",
                redirects="1", titles="|".join(wanted))
    except urllib.error.HTTPError as e:
        sys.exit(f"    FAILED: HTTP {e.code}. 406 means the gzip header did not go out; "
                 f"429 means rate-limited - wait, do not retry on a timer.")
    pages = j.get("query", {}).get("pages", {})
    for p in pages.values():
        if "revisions" in p:
            data["wikitext"][p["title"]] = p["revisions"][0]["slots"]["main"]["*"]
    found = sorted(data["wikitext"])
    print(f"    {len(found)} of {len(wanted)} exist", flush=True)
    for t in found:
        print(f"      {t}")
    if not found:
        sys.exit("    nothing came back - stop here rather than retrying.")

    print(f"\n2.  rendered HTML, one parse request each, {PAUSE}s apart "
          f"(~{len(found) * PAUSE // 60} min) ...", flush=True)
    for n, title in enumerate(found, 1):
        time.sleep(PAUSE)
        try:
            html = api(action="parse", page=title, prop="text")["parse"]["text"]["*"]
            data["html"][title] = slim(html)
            print(f"    {n}/{len(found)}  {title:44} {len(data['html'][title]):8,} chars", flush=True)
        except Exception as e:
            print(f"    {n}/{len(found)}  {title:44} FAILED: {e}", flush=True)

    key = os.environ.get("LIQUIPEDIA_API_KEY", "").strip()
    if not key:
        print("\n3.  no LIQUIPEDIA_API_KEY set - skipping the database rows.")
        print("    A free key from https://api.liquipedia.net turns the 2022+ brackets from")
        print("    HTML to be scraped into clean per-game JSON. Worth five minutes.")
    else:
        brackets = [t for t in found if "/" in t.split("The International/")[-1]]
        print(f"\n3.  match2 rows for {len(brackets)} bracket pages ...", flush=True)
        for n, title in enumerate(brackets, 1):
            time.sleep(PAUSE)
            try:
                j = v3_matches(title, key)
                data["v3"][title] = j
                print(f"    {n}/{len(brackets)}  {title:44} {len(j.get('result', []))} matches", flush=True)
            except Exception as e:
                print(f"    {n}/{len(brackets)}  {title:44} FAILED: {e}", flush=True)

    OUTDIR.mkdir(exist_ok=True)
    with gzip.open(OUT, "wt", encoding="utf-8") as f:
        json.dump(data, f)
    print(f"\nwrote {OUT} ({os.path.getsize(OUT):,} bytes)")
    print(f"\n{'page':46} {'wikitext':>9} {'matches':>8} {'vodgame':>8} {'html':>9}")
    for t in found:
        w = data["wikitext"][t]
        h = data["html"].get(t, "")
        print(f"{t:46} {len(w):9,} {w.count('={{Match'):8} {w.count('vodgame'):8} {len(h):9,}")
    print("\nNow push it:")
    print("  git add source-drop")
    print('  git commit -m "Liquipedia source dump: TI9-TI15"')
    print("  git push")


if __name__ == "__main__":
    main()

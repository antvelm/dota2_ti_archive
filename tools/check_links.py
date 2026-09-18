#!/usr/bin/env python3
"""
Link-rot check: ask YouTube's oEmbed endpoint about every source in every event.
No API key needed. Exit code 1 if anything is dead.

    python3 tools/check_links.py            # all events in data/events.json
    python3 tools/check_links.py data/ti3.json
"""
import json, sys, time, urllib.request, urllib.error, urllib.parse, os

ROOT = os.path.join(os.path.dirname(__file__), "..")

_seen = {}

def status(vid):
    """One request per distinct video - sliced events point dozens of games at the same upload."""
    if vid not in _seen:
        _seen[vid] = _status(vid)
        time.sleep(0.2)
    return _seen[vid]

def _status(vid):
    url = "https://www.youtube.com/oembed?" + urllib.parse.urlencode({"url": f"https://youtu.be/{vid}", "format": "json"})
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "TIArchive-linkcheck/0.1"}), timeout=15) as r:
            j = json.load(r)
            return "ok", j.get("author_name"), j.get("title")
    except urllib.error.HTTPError as e:
        return f"dead ({e.code})", None, None
    except Exception as e:
        return f"error ({e})", None, None

def main():
    files = sys.argv[1:] or [os.path.join(ROOT, e["file"]) for e in json.load(open(os.path.join(ROOT, "data/events.json"))) if e["status"] == "ready"]
    dead = 0
    for f in files:
        ev = json.load(open(f))
        print(f"== {ev['short']} ({f})")
        for s in ev["series"]:
            for g in s["games"]:
                for src in g["sources"]:
                    if src.get("provider") != "youtube":
                        continue
                    st, author, title = status(src["id"])
                    flag = "" if st == "ok" else "  <-- "
                    if st != "ok":
                        dead += 1
                    print(f"{flag}{s['id']:10} g{g['n']} {src['lang']}  {src['id']}  {st}  {author or ''}")
    print(f"\n{dead} dead source(s)")
    sys.exit(1 if dead else 0)

if __name__ == "__main__":
    main()

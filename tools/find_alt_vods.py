#!/usr/bin/env python3
"""
Attach alternative-language VODs to an event file using yt-dlp's YouTube search.

    pip install yt-dlp
    python3 tools/find_alt_vods.py data/ti3.json --lang ru --word "Russian Commentary"

For every game that has an English YouTube source but no <lang> source, this
looks up the English video's title and channel, swaps "English" for the given
word, searches YouTube and keeps the first hit from the same channel whose
title matches. Anything that does not match exactly is printed for manual
review instead of being written.
"""
import argparse, json, re, subprocess, sys

def ydl_json(args):
    r = subprocess.run(["yt-dlp", "--quiet", "--no-warnings", "--dump-json", "--flat-playlist", *args], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr.strip()[-400:])
    return [json.loads(l) for l in r.stdout.splitlines() if l.strip()]

def norm(s):
    return re.sub(r"\s+", " ", s or "").strip().lower()

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--lang", default="ru")
    ap.add_argument("--word", default="Russian Commentary", help="text that replaces 'English Commentary' in the search")
    ap.add_argument("--base", default="en")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()
    ev = json.load(open(a.file))
    changed = 0
    for s in ev["series"]:
        for g in s["games"]:
            if any(x["lang"] == a.lang for x in g["sources"]):
                continue
            base = next((x for x in g["sources"] if x["lang"] == a.base and x.get("provider") == "youtube"), None)
            if not base:
                continue
            try:
                info = ydl_json([f"https://www.youtube.com/watch?v={base['id']}"])[0]
            except Exception as e:
                print(f"  ? {s['id']} g{g['n']}: cannot read base video: {e}")
                continue
            title, channel = info.get("title", ""), info.get("channel") or info.get("uploader")
            q = re.sub(r"english commentary", a.word, re.sub(r"\s+", " ", title), flags=re.I)
            if norm(q) == norm(title):
                q = f"{title} {a.word}"
            try:
                hits = ydl_json([f"ytsearch8:{q}"])
            except Exception as e:
                print(f"  ? {s['id']} g{g['n']}: search failed: {e}")
                continue
            exact = next((h for h in hits if (h.get("channel") or h.get("uploader")) == channel and norm(h.get("title")) == norm(q)), None)
            if exact:
                g["sources"].append({"lang": a.lang, "kind": "main", "provider": "youtube", "id": exact["id"], "official": True, "offset": 0})
                changed += 1
                print(f"  + {s['id']} g{g['n']}: {exact['id']}  {exact['title']}")
            else:
                print(f"  - {s['id']} g{g['n']}: no exact match for '{q}'. Candidates:")
                for h in hits[:4]:
                    print(f"      {h['id']}  [{h.get('channel') or h.get('uploader')}]  {h.get('title')}")
    if changed and not a.dry:
        json.dump(ev, open(a.file, "w"), indent=1, ensure_ascii=False)
    print(f"{changed} sources added{' (dry run, not written)' if a.dry else ''}")

if __name__ == "__main__":
    main()

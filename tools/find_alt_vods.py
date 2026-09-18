#!/usr/bin/env python3
"""
Attach alternative-language VODs to an event file.

    python3 tools/find_alt_vods.py data/ti3.json --lang ru --word "Russian Commentary"

For every game that has a <base>-language YouTube source but no <lang> source, this
looks up the base video's title and channel, swaps the language word, searches YouTube
and keeps the hit from the same channel whose title matches once normalised. Anything
that does not match is printed for manual review instead of being written.

Backends: yt-dlp if it is installed, otherwise YouTube's oEmbed endpoint for titles
plus the public results page for search (--backend to force one).

Matching is deliberately strict, because a wrong VOD here is worse than a missing one:
it would silently play the wrong game. Note that the official uploads do not number
games consistently — in the Bo1 lower-bracket rounds of TI2, "Game 2" means the second
*match* of that round — so nothing is ever matched on a game number alone.
"""
import argparse, gzip, json, re, shutil, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

BROWSER_UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/124.0 Safari/537.36")


# ---------- normalisation ----------
def norm(s):
    """Fold the noise the official channel's titles are full of.

    'Na`Vi vs iG- Grand Finals, Game 1' and "Na'Vi vs. iG - Grand Finals Game 1"
    have to compare equal; only words and digits survive.
    """
    s = (s or "").lower()
    s = s.replace("`", "'").replace("’", "'").replace("´", "'")
    s = re.sub(r"\bvs\.", "vs", s)
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


# ---------- backends ----------
def _http(url, ua=BROWSER_UA):
    req = urllib.request.Request(url, headers={
        "User-Agent": ua, "Accept-Language": "en-US,en;q=0.9", "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
    return raw.decode("utf-8", "replace")


def _ydl(args):
    r = subprocess.run(["yt-dlp", "--quiet", "--no-warnings", "--dump-json", "--flat-playlist", *args],
                       capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr.strip()[-400:])
    return [json.loads(l) for l in r.stdout.splitlines() if l.strip()]


def info_ytdlp(vid):
    j = _ydl([f"https://www.youtube.com/watch?v={vid}"])[0]
    return {"title": j.get("title", ""), "channel": j.get("channel") or j.get("uploader")}


def info_http(vid, tries=3):
    url = "https://www.youtube.com/oembed?" + urllib.parse.urlencode(
        {"url": f"https://youtu.be/{vid}", "format": "json"})
    for i in range(tries):
        try:
            j = json.loads(_http(url, ua="TIArchive-linkcheck/0.1"))
            return {"title": j.get("title", ""), "channel": j.get("author_name")}
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"HTTP {e.code}")
        except Exception as e:
            if i == tries - 1:
                raise RuntimeError(str(e))
            time.sleep(1.5 * (i + 1))


def search_ytdlp(q, n=8):
    return [{"id": h["id"], "title": h.get("title", ""),
             "channel": h.get("channel") or h.get("uploader")} for h in _ydl([f"ytsearch{n}:{q}"])]


def _walk(node, key):
    if isinstance(node, dict):
        for k, v in node.items():
            if k == key:
                yield v
            else:
                yield from _walk(v, key)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v, key)


def search_http(q, n=8):
    h = _http("https://www.youtube.com/results?" + urllib.parse.urlencode({"search_query": q}))
    m = re.search(r"var ytInitialData = (\{.*?\});</script>", h)
    if not m:
        raise RuntimeError("no ytInitialData (blocked, or YouTube changed its layout)")
    out = []
    for vr in _walk(json.loads(m.group(1)), "videoRenderer"):
        vid = vr.get("videoId")
        if not vid:
            continue
        owner = (vr.get("ownerText") or {}).get("runs") or [{}]
        out.append({"id": vid,
                    "title": "".join(r.get("text", "") for r in (vr.get("title") or {}).get("runs", [])),
                    "channel": owner[0].get("text", "")})
        if len(out) >= n:
            break
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--lang", default="ru")
    ap.add_argument("--word", default="Russian Commentary", help="text that replaces 'English Commentary' in the search")
    ap.add_argument("--base", default="en")
    ap.add_argument("--baseword", default="English Commentary")
    ap.add_argument("--backend", choices=("auto", "ytdlp", "http"), default="auto")
    ap.add_argument("--only", help="only this series id")
    ap.add_argument("--pause", type=float, default=1.5, help="seconds between searches")
    ap.add_argument("--dry", action="store_true")
    a = ap.parse_args()

    backend = a.backend
    if backend == "auto":
        backend = "ytdlp" if shutil.which("yt-dlp") else "http"
    info, search = (info_ytdlp, search_ytdlp) if backend == "ytdlp" else (info_http, search_http)
    print(f"backend: {backend}")

    ev = json.load(open(a.file))
    added, review = 0, []
    for s in ev["series"]:
        if a.only and s["id"] != a.only:
            continue
        for g in s["games"]:
            if any(x["lang"] == a.lang for x in g["sources"]):
                continue
            base = next((x for x in g["sources"] if x["lang"] == a.base and x.get("provider") == "youtube"), None)
            if not base:
                continue
            try:
                b = info(base["id"])
            except Exception as e:
                print(f"  ? {s['id']} g{g['n']}: cannot read base video: {e}")
                review.append((s["id"], g["n"], f"base unreadable: {e}", []))
                continue
            title, channel = b["title"], b["channel"]
            want = re.sub(re.escape(a.baseword), a.word, title, flags=re.I)
            if norm(want) == norm(title):           # base word not present in the title
                want = f"{title} {a.word}"
            try:
                hits = search(want)
            except Exception as e:
                print(f"  ? {s['id']} g{g['n']}: search failed: {e}")
                review.append((s["id"], g["n"], f"search failed: {e}", []))
                continue
            time.sleep(a.pause)
            exact = [h for h in hits if h["channel"] == channel and norm(h["title"]) == norm(want)]
            if len(exact) == 1:
                g["sources"].append({"lang": a.lang, "kind": "main", "provider": "youtube",
                                     "id": exact[0]["id"], "official": True, "offset": 0})
                added += 1
                print(f"  + {s['id']} g{g['n']}: {exact[0]['id']}  {exact[0]['title']}")
            else:
                why = "ambiguous (several exact matches)" if exact else "no exact match"
                print(f"  - {s['id']} g{g['n']}: {why} for '{want}'")
                cands = [h for h in hits if h["channel"] == channel]
                for h in cands[:5]:
                    print(f"      {h['id']}  [{h['channel']}]  {h['title']}")
                review.append((s["id"], g["n"], f"{why}: {want}", cands[:5]))

    if added and not a.dry:
        json.dump(ev, open(a.file, "w"), indent=1, ensure_ascii=False)
    print(f"\n{added} source(s) added{' (dry run, not written)' if a.dry else ''}; {len(review)} for manual review")
    if review:
        json.dump([{"series": r[0], "game": r[1], "why": r[2], "candidates": r[3]} for r in review],
                  open("alt_vods_review.json", "w"), indent=1, ensure_ascii=False)
        print("wrote alt_vods_review.json")


if __name__ == "__main__":
    main()

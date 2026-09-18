#!/usr/bin/env python3
"""
Build a data/<event>.json skeleton from a Liquipedia bracket page.

    python3 tools/liquipedia_scrape.py "The_International/2013/Main_Event" \
        --id ti3 --name "The International 2013" --short TI3 \
        --location "Seattle" --dates "August 7–11, 2013" -o data/ti3.json

What it does
  * fetches the page wikitext through the MediaWiki API (Liquipedia asks for a
    descriptive User-Agent and at most one parse request every 2 s — see
    https://liquipedia.net/api-terms-of-use)
  * parses every {{Match}} inside {{Bracket}} templates: opponents, date,
    per-game VOD links (vodgameN), Valve match ids (matchidN), per-game winners
    and lengths from the {{Map}} sub-templates
  * infers double-elimination "slots" (which earlier series feeds each team)
    purely from team identity, so the site can lock/unlock series progressively
  * emits one source per game, language guessed from the VOD title is NOT done
    here — Liquipedia only stores one link per game (usually English). Run
    tools/find_alt_vods.py afterwards to attach Russian (or other) uploads.

Review the output by hand: team slugs → names, round names, anything odd.
"""
import argparse, json, re, sys, time, urllib.parse, urllib.request
from datetime import datetime

UA = "TIArchive/0.1 (https://github.com/antvelm/dota2_ti_archive)"
API = "https://liquipedia.net/dota2/api.php"

def fetch_wikitext(page: str) -> str:
    q = urllib.parse.urlencode({"action": "parse", "page": page, "prop": "wikitext", "format": "json"})
    req = urllib.request.Request(f"{API}?{q}", headers={"User-Agent": UA, "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=30) as r:
        import gzip
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
    j = json.loads(raw)
    if "error" in j:
        sys.exit(f"API error: {j['error']}")
    wt = j["parse"]["wikitext"]["*"]
    m = re.match(r"#REDIRECT \[\[([^\]]+)\]\]", wt)
    if m:
        time.sleep(2)
        return fetch_wikitext(m.group(1).replace(" ", "_"))
    return wt

YT_RE = re.compile(r"(?:youtu\.be/|youtube\.com/watch\?v=|youtube\.com/embed/)([A-Za-z0-9_-]{11})")

def yt_id(url: str):
    m = YT_RE.search(url)
    return m.group(1) if m else None

def parse_matches(wt: str):
    """Yield dicts for every |RxMy={{Match ...}} block, with its header if any."""
    headers = {m.group(1): m.group(2).strip() for m in re.finditer(r"\|(R\d+M\d+)header=([^\n|]+)", wt)}
    blocks = re.split(r"\n(?=\|R\d+M\d+=\{\{Match)", wt)
    out = []
    for b in blocks:
        m = re.match(r"\|(R\d+M\d+)=\{\{Match", b)
        if not m:
            continue
        key = m.group(1)
        # maps first (so that match-level fields are parsed with maps stripped)
        maps = []
        for mm in re.finditer(r"\|map(\d+)=\{\{Map(.*?)\n\}\}", b, re.S):
            body = mm.group(2)
            w = re.search(r"\|winner\s*=\s*(\d)", body)
            ln = re.search(r"\|length\s*=\s*([^\n|]+)", body)
            length = ln.group(1).strip() if ln else None
            if length:
                t = re.match(r"(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$", length)
                if t and any(t.groups()):
                    hh, mi, ss = (int(x or 0) for x in t.groups())
                    length = f"{hh * 60 + mi}:{ss:02d}"
            maps.append({"n": int(mm.group(1)), "winner": int(w.group(1)) if w else None, "length": length})
        stripped = re.sub(r"\{\{Map.*?\n\}\}", "", b, flags=re.S)
        def field(name):
            r = re.search(r"\|" + name + r"\s*=\s*([^\n|}]+)", stripped)
            return r.group(1).strip() if r else None
        o1 = re.search(r"opponent1=\{\{TeamOpponent\|([^}|]+)", b)
        o2 = re.search(r"opponent2=\{\{TeamOpponent\|([^}|]+)", b)
        vods = {int(v.group(1)): v.group(2) for v in re.finditer(r"\|vodgame(\d+)\s*=\s*(\S+)", b)}
        mids = {int(v.group(1)): int(v.group(2)) for v in re.finditer(r"\|matchid(\d+)\s*=\s*(\d+)", b)}
        date = (field("date") or "").split("{{")[0].strip()
        out.append({"key": key, "header": headers.get(key), "bestof": field("bestof"), "team1": o1 and o1.group(1).strip().lower(),
                    "team2": o2 and o2.group(1).strip().lower(), "date": date, "maps": maps, "vods": vods, "matchids": mids})
    return out

def parse_date(s: str, tz="-07:00"):
    for fmt in ("%B %d, %Y - %H:%M", "%B %d, %Y"):
        try:
            return datetime.strptime(s, fmt).strftime("%Y-%m-%dT%H:%M") + tz
        except ValueError:
            pass
    return None

def round_key(header: str, key: str):
    """'Upper Bracket R1 (Bo3)' → ('ub-r1', 'Upper Bracket Round 1', 'upper', 1, 3)"""
    h = header or key
    bo = re.search(r"Bo(\d)", h)
    bo = int(bo.group(1)) if bo else None
    low = h.lower()
    if "grand" in low:
        return ("gf", "Grand Final", "final", bo)
    br = "upper" if "upper" in low else "lower" if "lower" in low else "other"
    if "final" in low:
        return (f"{br[0]}b-f", f"{br.title()} Bracket Final", br, bo)
    r = re.search(r"R(\d+)|Round (\d+)", h)
    n = int(r.group(1) or r.group(2)) if r else 0
    return (f"{br[0]}b-r{n}", f"{br.title()} Bracket Round {n}", br, bo)

def infer_slots(series):
    """Double elimination: each team's slot comes from the last earlier series it played."""
    by_start = sorted(series, key=lambda s: s["start"] or "")
    for s in by_start:
        slots = []
        for t in (s["team1"], s["team2"]):
            prev = [p for p in by_start if p is not s and (p["start"] or "") < (s["start"] or "") and t in (p["team1"], p["team2"])]
            if not prev:
                slots.append(None)
                continue
            p = prev[-1]
            w1 = sum(1 for g in p["games"] if g["winner"] == 1)
            w2 = len(p["games"]) - w1
            winner = p["team1"] if w1 > w2 else p["team2"]
            slots.append({"from": p["id"], "take": "winner" if winner == t else "loser"})
        s["slots"] = [x for x in slots if x] if all(slots) else ([x for x in slots if x])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("page")
    ap.add_argument("--id", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--short", required=True)
    ap.add_argument("--location", default="")
    ap.add_argument("--dates", default="")
    ap.add_argument("--tz", default="-07:00", help="UTC offset of the dates on the page, e.g. -07:00 for PDT")
    ap.add_argument("--wikitext", help="parse a saved wikitext file instead of fetching")
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()

    wt = open(a.wikitext).read() if a.wikitext else fetch_wikitext(a.page)
    matches = parse_matches(wt)
    if not matches:
        sys.exit("no {{Match}} blocks found — is this the bracket page?")

    rounds, series, teams = {}, [], {}
    # bestof is only written on the first match of a round on Liquipedia; carry it forward
    last_bo = None
    for m in matches:
        rid, rname, br, bo = round_key(m["header"], m["key"])
        if m["bestof"]:
            last_bo = int(m["bestof"])
        bo = bo or last_bo or max(1, len(m["maps"]))
        rounds.setdefault(rid, {"id": rid, "name": rname, "bracket": br, "bestOf": bo})
        for t in (m["team1"], m["team2"]):
            if t:
                teams.setdefault(t, {"name": t, "short": t, "region": ""})
        games = []
        for mp in sorted(m["maps"], key=lambda x: x["n"]):
            n = mp["n"]
            src = []
            vid = yt_id(m["vods"].get(n, "")) if n in m["vods"] else None
            if vid:
                src.append({"lang": "en", "kind": "main", "provider": "youtube", "id": vid, "official": None, "offset": 0})
            elif n in m["vods"]:
                src.append({"lang": "en", "kind": "main", "provider": "url", "url": m["vods"][n], "official": None, "offset": 0})
            games.append({"n": n, "matchId": m["matchids"].get(n), "winner": mp["winner"], "length": mp["length"], "sources": src})
        series.append({"id": f"{rid}-{m['key'].lower()}", "round": rid, "bestOf": bo, "team1": m["team1"], "team2": m["team2"],
                       "start": parse_date(m["date"], a.tz), "slots": [], "games": games, "liquipediaKey": m["key"]})
    infer_slots(series)
    # order rounds: upper by number, lower by number, final last
    order = {"upper": 0, "lower": 0, "final": 0, "other": 0}
    rnum = lambda r: int(re.search(r"\d+", r["id"]).group()) if re.search(r"\d+", r["id"]) else 99
    for r in sorted(rounds.values(), key=lambda r: (r["bracket"], rnum(r))):
        order[r["bracket"]] += 1
        r["order"] = order[r["bracket"]]
    if "gf" in rounds:
        rounds["gf"]["order"] = max(r["order"] for r in rounds.values() if r["id"] != "gf") + 1

    ev = {"id": a.id, "name": a.name, "short": a.short, "location": a.location, "dates": a.dates, "stage": "Main Event",
          "notes": f"Generated from Liquipedia page '{a.page}'. Review team names and add non-English sources.",
          "languages": {"en": "English", "ru": "Русский"}, "teams": teams, "rounds": sorted(rounds.values(), key=lambda r: (r["bracket"], r["order"])),
          "series": series}
    with open(a.out, "w") as f:
        json.dump(ev, f, indent=1, ensure_ascii=False)
    n = sum(len(s["games"]) for s in series)
    missing = [(s["id"], g["n"]) for s in series for g in s["games"] if not g["sources"]]
    print(f"wrote {a.out}: {len(series)} series, {n} games, {len(missing)} games without a VOD link")
    for s in series:
        if len(s["slots"]) not in (0, 2):
            print(f"  ! could not infer both slots for {s['id']} — fix by hand")

if __name__ == "__main__":
    main()

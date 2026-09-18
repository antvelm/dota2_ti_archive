#!/usr/bin/env python3
"""
Build a data/<event>.json skeleton from a *rendered* Liquipedia bracket page.

    python3 tools/liquipedia_html_scrape.py source-drop/ti-source-2.json.gz \
        --page "The International/2024/Main Event" \
        --id ti13 --name "The International 2024" --short TI13 \
        --location "Royal Arena, Copenhagen" --dates "September 8-15, 2024" \
        --tz "+02:00" -o data/ti13.json

Same job as liquipedia_scrape.py, and the same output, for the years where reading the
wikitext no longer works. From 2019 a TI bracket page's source is a list of bare
`{{Match|id=...}}` stubs and everything real - opponents, dates, lengths, winners, Valve
match ids, VOD links - lives in Liquipedia's database, appearing only once the page is
rendered. `bracket_html.py` reads that HTML; this turns it into an event file.

Input is either a source dump written by tools/ti_fetch2.py (.json.gz, or the .zip the
PowerShell twin writes) or a single `action=parse` response saved as JSON. Nothing here
touches the network: fetch with ti_fetch2, from a machine Liquipedia is not blocking.

Two things it does that the wikitext scraper cannot:
  * team names and short names come out right, straight from the bracket's own markup,
    instead of needing a pass by hand over Liquipedia slugs
  * best-of comes from the longest series in each round, rounded up to the next odd
    number, because the "(BoN)" shown next to a score counts games played, not the format

Regions still need a human: pass --rosters to read them off the event's overview page in
the same dump, and check the result, because a team page carries today's roster.
"""
import argparse, collections, gzip, json, os, re, sys, zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bracket_html
from liquipedia_scrape import infer_slots, yt_id, yt_offset

# Liquipedia's column names, in the order they are played.
SEQ = ["round 1", "round 2", "round 3", "round 4", "round 5", "quarterfinals", "semifinals", "final"]


def round_key(header):
    """'Lower Bracket Quarterfinals' -> ('lower', rank). Rank orders the columns."""
    low = (header or "").lower()
    if "grand" in low:
        return "final", 99
    side = "upper" if "upper" in low else "lower" if "lower" in low else "other"
    for i, word in enumerate(SEQ):
        if word in low:
            return side, i
    return side, 50


def load_html(path, page):
    """The rendered HTML of one page, from a dump or a single parse response."""
    if path.endswith(".zip"):
        z = zipfile.ZipFile(path)
        slug = re.sub(r"[\\/\s]+", "-", page.replace("The International/", ""))
        name = f"html-{slug}.json"
        if name not in z.namelist():
            sys.exit(f"{name} not in {path}: {', '.join(z.namelist())}")
        return json.loads(z.read(name))["parse"]["text"]["*"]
    opener = gzip.open if path.endswith(".gz") else open
    with opener(path, "rt", encoding="utf-8") as f:
        j = json.load(f)
    if "html" in j:                       # a ti_fetch2 dump
        if page not in j["html"]:
            sys.exit(f"'{page}' not in {path}: {', '.join(sorted(j['html']))}")
        return j["html"][page]
    return j["parse"]["text"]["*"]        # a single action=parse response


CARD = "general-collapsible collapsed team-participant-card"
PLAYER = re.compile(r'<span class="flag"><img alt="([^"]+)"[^>]*/></span>'
                    r'<span class="name"[^>]*><a href="[^"]*" title="([^"]+)"')


def rosters(html):
    """{team index: Counter(country)} from an event overview page, in participant order."""
    i = html.find('id="Participants"')
    if i < 0:
        return {}
    seg = html[i:]
    for stop in ('id="Results"', 'id="Prize_Pool"', 'id="Broadcast'):
        j = seg.find(stop)
        if j > 0:
            seg = seg[:j]
    out = {}
    for k, part in enumerate(seg.split(CARD)[1:]):
        pl = PLAYER.findall(part)
        if pl:
            out[k] = collections.Counter(c for c, _ in pl)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("dump", help="source-drop/ti-source-2.json.gz, the .zip, or one parse response")
    ap.add_argument("--page", required=True, help='e.g. "The International/2024/Main Event"')
    ap.add_argument("--id", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--short", required=True)
    ap.add_argument("--location", default="")
    ap.add_argument("--dates", default="")
    ap.add_argument("--tz", default="+00:00", help="UTC offset of the times on the page")
    ap.add_argument("--rosters", help='overview page in the same dump, e.g. "The International/2024"')
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()

    matches = bracket_html.parse_matches(load_html(a.dump, a.page))
    if not matches:
        sys.exit("no bracket found in that page's HTML")

    # Best-of per round. Neither source alone is right. The longest series played is a
    # lower bound: a Bo5 swept 3-0 looks like a Bo3. The "(BoN)" beside the score is
    # sometimes the games played rather than the format (a 2-0 Bo3 reads "(Bo2)"), and
    # is occasionally just wrong - one of TI9's four Bo1 lower-bracket openers says Bo3.
    # So take the commonest note in the round, then whichever of that and the longest
    # series is larger, rounded up to the next odd number: real formats are odd.
    longest, notes = collections.defaultdict(int), collections.defaultdict(collections.Counter)
    for m in matches:
        longest[m["header"]] = max(longest[m["header"]], len(m["maps"]))
        if m["bestof"]:
            notes[m["header"]][m["bestof"]] += 1
    bestof = {}
    for h, n in longest.items():
        common = notes[h].most_common(1)
        n = max(n, common[0][0] if common else 0)
        bestof[h] = n if n % 2 else n + 1

    # ids and display order: canonical column order within each side, finals last.
    sides = collections.defaultdict(list)
    for h in longest:
        side, rank = round_key(h)
        sides[side].append((rank, h))
    rounds, rid_of = [], {}
    for side in ("upper", "lower", "other", "final"):
        for order, (rank, h) in enumerate(sorted(set(sides.get(side, []))), 1):
            if side == "final":
                rid = "gf"
            elif h.lower().endswith(" final"):   # not Quarterfinals / Semifinals
                rid = f"{side[0]}b-f"
            else:
                rid = f"{side[0]}b-r{order}"
            rid_of[h] = rid
            rounds.append({"id": rid, "name": h, "bracket": side, "order": order, "bestOf": bestof[h]})
    last = max((r["order"] for r in rounds if r["bracket"] != "final"), default=0)
    for r in rounds:
        if r["bracket"] == "final":
            r["order"] = last + 1

    teams, series = {}, []
    for m in matches:
        for slug, (name, short) in m["names"].items():
            teams.setdefault(slug, {"name": name, "short": short, "region": ""})
        games = []
        for mp in m["maps"]:
            src = []
            link = m["vods"].get(mp["n"], "")
            vid = yt_id(link)
            if vid:
                src.append({"lang": "en", "kind": "main", "provider": "youtube", "id": vid,
                            "official": True, "offset": yt_offset(link)})
            games.append({"n": mp["n"], "matchId": m["matchids"].get(mp["n"]), "winner": mp["winner"],
                          "length": mp["length"], "sources": src})
        start = None
        if m["date"]:
            d = re.match(r"([A-Z][a-z]+) (\d{1,2}), (\d{4})(?: - (\d{1,2}):(\d{2}))?", m["date"])
            if d:
                mon = ["January", "February", "March", "April", "May", "June", "July", "August",
                       "September", "October", "November", "December"].index(d.group(1)) + 1
                start = (f"{d.group(3)}-{mon:02d}-{int(d.group(2)):02d}"
                         f"T{int(d.group(4) or 0):02d}:{d.group(5) or '00'}{a.tz}")
        series.append({"id": f"{rid_of[m['header']]}-{m['key'].lower()}", "round": rid_of[m["header"]],
                       "bestOf": bestof[m["header"]], "team1": m["team1"], "team2": m["team2"],
                       "start": start, "slots": [], "games": games, "liquipediaKey": m["key"]})
    infer_slots(series)

    if a.rosters:
        html = load_html(a.dump, a.rosters)
        by_index = rosters(html)
        print(f"rosters: {len(by_index)} participant cards on {a.rosters} - "
              f"regions are NOT filled in automatically, see below")
        for k, c in sorted(by_index.items()):
            print(f"   card {k:2}  {dict(c)}")

    ev = {"id": a.id, "name": a.name, "short": a.short, "location": a.location, "dates": a.dates,
          "stage": "Main Event",
          "notes": f"Generated from the rendered Liquipedia page '{a.page}'. "
                   f"Review team regions and add non-English sources.",
          "languages": {"en": "English", "ru": "Русский"},
          "teams": teams,
          "rounds": sorted(rounds, key=lambda r: ({"upper": 0, "lower": 1, "other": 2, "final": 3}[r["bracket"]], r["order"])),
          "series": series}
    with open(a.out, "w", encoding="utf-8") as f:
        json.dump(ev, f, indent=1, ensure_ascii=False)

    ngames = sum(len(s["games"]) for s in series)
    print(f"wrote {a.out}: {len(series)} series, {ngames} games, {len(teams)} teams")
    print("  rounds: " + ", ".join(f"{r['id']}={r['name']} (Bo{r['bestOf']})" for r in ev["rounds"]))
    for s in series:
        if len(s["slots"]) not in (0, 2):
            print(f"  ! could not infer both slots for {s['id']} - fix by hand")
    nosrc = [(s["id"], g["n"]) for s in series for g in s["games"] if not g["sources"]]
    if nosrc:
        print(f"  ! {len(nosrc)} games with no VOD link: {nosrc}")


if __name__ == "__main__":
    main()

"""Read a Liquipedia bracket out of the *rendered* page instead of the wikitext.

From 2019 the wikitext of a TI bracket page is a list of bare `{{Match|id=...}}`
stubs: the opponents, dates, game lengths, winners, Valve match ids and VOD links
all live in Liquipedia's database and only appear once the page is rendered. So for
those years `liquipedia_scrape.py` has nothing to read, and this reads the HTML that
`action=parse` returns instead, producing the same match dicts it produces.

What the rendered bracket gives us, and where:

    brkts-bracket
      brkts-round-header      the column names, left to right, for the chain below it
      brkts-round-body        one round; the LAST name in the list above applies to it
        brkts-round-center    that round's match(es)
        brkts-round-lower     the rounds feeding it - nested round-bodies, one column
                              earlier each time, until a new round-header starts the
                              lower bracket over with its own list of names

    brkts-match
      brkts-opponent-entry    aria-label + data-team-name/-shortname, and the winner
                              carries brkts-opponent-win; score in -score-inner
      brkts-popup-comment     "September 8, 2024 - 10:00 CEST"
      brkts-popup-body-grid-row   one per game: two generic-label result-win/-loss
                              (left team, right team) and the game length between them
      brkts-popup-footer      "Watch Game N" -> the VOD, "datDota on Game N" -> the
                              Valve match id

The "(BoN)" note beside the score is NOT the format: Liquipedia renders "(Bo2)" for a
Bo3 that ended 2-0 on some pages and "(Bo3)" on others. It is reported as `bestof` for
what it is worth, but the caller should prefer the longest series in the round, rounded
up to the next odd number - real formats are odd, so an even maximum only means every
series in that round was a sweep.
"""
import re
from html.parser import HTMLParser

VOID = {"img", "br", "hr", "input", "meta", "link", "source", "col", "area", "base", "wbr", "embed", "param", "track"}


class Node:
    __slots__ = ("tag", "attrs", "kids", "parent", "text")

    def __init__(self, tag, attrs=None, parent=None):
        self.tag, self.attrs, self.kids, self.parent, self.text = tag, dict(attrs or {}), [], parent, ""

    def cls(self):
        return (self.attrs.get("class") or "").split()

    def has(self, c):
        return c in self.cls()

    def find(self, pred):
        """Every descendant matching pred, in document order."""
        for k in self.kids:
            if pred(k):
                yield k
            yield from k.find(pred)

    def first(self, pred):
        return next(self.find(pred), None)

    def all_text(self):
        return self.text + "".join(k.all_text() for k in self.kids)


class _Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("#root")
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.kids.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.kids.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        n = self.cur
        while n is not self.root and n.tag != tag:
            n = n.parent
        if n is not self.root:
            self.cur = n.parent

    def handle_data(self, d):
        (self.cur.kids[-1] if self.cur.kids else self.cur).text += d


def parse_html(html):
    t = _Tree()
    t.feed(html)
    return t.root


def _header_names(header_node):
    """A round-header lists each column three times over (full, short, initials);
    take the longest spelling of each."""
    names = []
    for div in header_node.find(lambda n: n.has("brkts-header")):
        opts = [o.all_text().strip() for o in div.find(lambda n: n.has("brkts-header-option"))]
        if opts:
            names.append(max(opts, key=len))
    return names


def _kids(node, cls):
    return [k for k in node.kids if k.has(cls)]


def _rounds(bracket):
    """[(column name, match node)] for every match, by walking the nested round-bodies."""
    out = []

    def walk(body, names, i):
        name = names[i] if 0 <= i < len(names) else None
        for center in _kids(body, "brkts-round-center"):
            for m in center.find(lambda n: n.has("brkts-match")):
                out.append((name, m))
        for lower in _kids(body, "brkts-round-lower"):
            cur_names, cur_i = names, i - 1
            for k in lower.kids:
                if k.has("brkts-round-header"):
                    # the lower bracket starts its own chain, with its own column names
                    cur_names = _header_names(k)
                    cur_i = len(cur_names) - 1
                elif k.has("brkts-round-body"):
                    walk(k, cur_names, cur_i)
                    cur_i -= 0   # siblings at one depth are the same column

    names = []
    for k in bracket.kids:
        if k.has("brkts-round-header"):
            names = _header_names(k)
        elif k.has("brkts-round-body"):
            walk(k, names, len(names) - 1)
    return out


DUR = re.compile(r"^\d{1,2}:\d{2}(?::\d{2})?$")
GAME_N = re.compile(r"Game (\d+)")


def _match(name, m, key):
    ops = [o for o in m.find(lambda n: n.has("brkts-opponent-entry"))]
    teams = []
    for o in ops[:2]:
        d = o.first(lambda n: n.attrs.get("data-team-name")) or o
        teams.append({
            "name": d.attrs.get("data-team-name") or o.attrs.get("aria-label") or "",
            "short": d.attrs.get("data-team-shortname") or "",
            "win": bool(o.first(lambda n: n.has("brkts-opponent-win"))) or o.has("brkts-opponent-win"),
        })
    while len(teams) < 2:
        teams.append({"name": "", "short": "", "win": False})

    popup = m.first(lambda n: n.has("brkts-popup"))
    date, tz, bestof = "", "", None
    if popup:
        head = popup.all_text()[:200]
        # the timezone runs straight into the first team's name ("CESTXtreme Gaming"),
        # so it has to be matched as one of the abbreviations rather than "some capitals"
        d = re.match(r"\s*([A-Z][a-z]+ \d{1,2}, \d{4}(?: - \d{1,2}:\d{2})?)\s*"
                     r"(CES?T|EES?T|[PMCE][SD]T|AED?T|UTC|GMT|BST|SGT|MSK|KST|JST|ICT|WIB|PHT|IST|NZST)?", head)
        if d:
            date, tz = d.group(1), d.group(2) or ""
        bo = re.search(r"\(Bo(\d)\)", head)
        bestof = int(bo.group(1)) if bo else None

    maps, vods, mids = [], {}, {}
    if popup:
        for n, row in enumerate(popup.find(lambda x: x.has("brkts-popup-body-grid-row")), 1):
            labels = [l.attrs.get("data-label-type", "") for l in
                      row.find(lambda x: x.has("generic-label"))]
            winner = 1 if labels[:1] == ["result-win"] else 2 if "result-win" in labels[1:] else None
            length = next((d.all_text().strip() for d in row.find(lambda x: x.has("brkts-popup-spaced"))
                           if DUR.match(d.all_text().strip())), None)
            maps.append({"n": n, "winner": winner, "length": length})
        # the VOD's "Watch Game N" title sits on the span wrapping the link, not the link
        for span in popup.find(lambda x: x.attrs.get("title", "").startswith("Watch Game")):
            g = GAME_N.search(span.attrs["title"])
            a = span.first(lambda x: x.tag == "a" and x.attrs.get("href"))
            if g and a:
                vods.setdefault(int(g.group(1)), a.attrs["href"])
        for a in popup.find(lambda x: x.tag == "a" and "/matches/" in x.attrs.get("href", "")):
            href = a.attrs["href"]
            if "datdota.com" not in href and "dotabuff.com" not in href:
                continue
            g = GAME_N.search(a.attrs.get("title", ""))
            mid = re.search(r"/matches/(\d+)", href)
            if g and mid:
                mids.setdefault(int(g.group(1)), int(mid.group(1)))

    slug = lambda t: re.sub(r"[^a-z0-9.]+", "", (t["short"] or t["name"]).lower()) or None
    return {
        "key": key,
        "header": name,
        "bestof": bestof,
        "team1": slug(teams[0]),
        "team2": slug(teams[1]),
        "date": date,
        "tz": tz,
        "maps": maps,
        "vods": vods,
        "matchids": mids,
        "names": {slug(t): (t["name"], t["short"] or t["name"]) for t in teams if slug(t)},
    }


def parse_matches(html):
    """Same shape as liquipedia_scrape.parse_matches, from rendered HTML."""
    root = parse_html(html)
    bracket = root.first(lambda n: n.has("brkts-bracket"))
    if not bracket:
        return []
    out, per_round = [], {}
    for name, m in _rounds(bracket):
        per_round[name] = per_round.get(name, 0) + 1
        # the key only has to sort matches within a round the way the page shows them
        out.append(_match(name, m, f"R{len(per_round)}M{per_round[name]}"))
    return out

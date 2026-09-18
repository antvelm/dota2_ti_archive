# TI Archive — spoiler-free viewer for The International

A static site for rewatching archived International (Dota 2) tournaments without
learning who wins. Videos are embedded from their original YouTube uploads;
nothing is re-hosted.

## Run it

Any static file server works. Opening `index.html` directly from disk does **not**
work (the YouTube player needs an http origin and the data is fetched as JSON).

```sh
# local
python3 -m http.server 8080          # then open http://localhost:8080
# or
npx serve .

# VPS (nginx in Docker, listens on 127.0.0.1:8090 — put your TLS proxy in front)
docker compose -f deploy/docker-compose.yml up -d --build
```

## Published build

The copy at <https://antvelm.net/ti-archive> is a single self-contained HTML file
(that hub takes one file per tool). Regenerate it after any change here — editing the
published file directly gets overwritten:

```sh
python3 tools/build_single.py \
  -o "/var/www/artifacts/Dota 2 TI Archive - Spoiler-free VOD viewer/ti-archive.html"
python3 /var/www/artifacts/build-artifacts.py
```

## How the spoiler protection works

| Leak | Countermeasure |
|---|---|
| Number of games in a series ("Game 3 of 3") | The game list only shows games you have finished plus the current one. There is a single *Continue* button; it either loads the next game or tells you the series is over. |
| YouTube title bar, pause overlay, end screen, related videos, scrubber thumbnails | The player runs with `controls=0` behind a transparent shield; our own controls sit on top. Pause and end states are covered by our own overlay. |
| Video length (a 20-minute VOD is a stomp) | Duration and progress fill are hidden by default ("blind scrubber"); seeking still works. Toggle in settings. |
| Bracket structure revealing who advanced | Later series are locked and show `TBD` until every series feeding into them is watched (or revealed). |
| Total game count on the progress bar | Progress is counted in series, never in games. |
| — *(deliberate escape hatch)* | Click any locked series to **skip ahead** to it. Everything feeding into it is marked `skipped`: those results appear in the bracket and drop out of the queue, so *Continue* goes to where you jumped. Nothing is deleted — click a skipped series to put it back and watch it after all. |
| Casters mentioning a concurrent series' result | Choose *Strict chronological* order in settings: games play in real start order (by Valve match id), so nothing discussed on the broadcast has happened after the game you are watching. Default is *By series*, which plays each series to the end and is nicer to watch. |

Watch progress lives in `localStorage` (export/import in settings).

## Data

One JSON file per event in `data/`, listed in `data/events.json`.

```
event
 ├─ teams{slug → name, short, region}
 ├─ rounds[]   id, name, bracket (upper|lower|final), order (column), bestOf
 └─ series[]   id, round, team1, team2, start (ISO), bestOf, advantage? ([1,0])
      ├─ slots[]  {from: <series id>, take: winner|loser}  — who feeds team1 / team2
      └─ games[]  n, matchId (Valve, null before 2012), winner (1|2), length ("36:08"),
           └─ sources[]  lang, kind (main|cam|panel), provider (youtube), id, official, offset (s), end? (s), note
```

`winner` per game is stored so that the site can resolve the bracket once you have
watched a series; it is never displayed before that.

`offset` is where the game starts inside the video and `end` where its slice stops.
Per-game uploads have `offset: 0` and no `end`. From 2015 Valve uploaded whole broadcast
days instead, so a game is a slice `[offset, end)` of one: the player runs on slice time
(position, duration, scrubbing and resume all start from 0 at the game), refuses to seek
outside it, and pauses itself at `end`. `end` is the next game's `offset` in the same
video — ending early would cut off a finish, while running long only shows the post-game
desk, which being live cannot know anything that had not happened yet. The last slice in a
video has no next game to stop at, so it ends at game length plus 45 minutes rather than
running on into whatever the broadcast showed afterwards. Two sources of one
game stay in sync across a language switch because both are measured from their own `offset`.

`advantage` is a head start written into the format: TI1's upper-bracket winner began the
grand final 1–0 up. That game was never played, so it is not a game here, but it counts
toward the series score. A game with an empty `sources` list is one nobody uploaded; the
site says so and lets you mark it watched. `region` is a country code when a roster clearly
belongs to one and a bloc (`EU`, `CIS`, `SEA`) when it does not.

### Adding an event

```sh
# 1. skeleton with English VODs from the Liquipedia bracket page
python3 tools/liquipedia_scrape.py "The_International/2014/Main_Event" \
    --id ti4 --name "The International 2014" --short TI4 \
    --location "KeyArena, Seattle" --dates "July 18–21, 2014" -o data/ti4.json
# 2. fill team names / regions in data/ti4.json by hand
# 3. Russian uploads from the same channel (uses yt-dlp if installed, plain HTTP otherwise)
python3 tools/find_alt_vods.py data/ti4.json --lang ru --word "Russian Commentary"
# 4. register it
#    add {"id":"ti4", ..., "file":"data/ti4.json", "status":"ready"} to data/events.json
# 5. check every link still resolves
python3 tools/check_links.py data/ti4.json
```

Liquipedia asks for a descriptive `User-Agent` and no more than one parse request
every two seconds; the scraper follows that. Do not hammer it.

Two things always need a human pass over the generated file: **team names and regions**
(the scraper only knows the Liquipedia slug, and the team pages carry *today's* roster —
LGD's page says South America, which is useless for 2012; take regions from that event's
own rosters) and **the series ids**, which come out as `ub-r1-r2m1` and are worth tidying
to `ub-r1-a`. `find_alt_vods.py` only writes a match it is sure of and prints the rest to
`alt_vods_review.json`. Beware `{{Map|winner=skip}}`: it is the unplayed decider of a 2–0,
not a game nobody uploaded — the scraper drops it now, but it once made TI5 look 11 games
short. And a `vodgame` link proves nothing until it is opened: TI4's all 404, and from 2015
they point into day-long videos. As for the matcher: the official channel's titles are inconsistent enough (Na'Vi spelled
with three different quote characters, swapped team order, and in Bo1 rounds "Game 2" meaning
the round's *second match*) that the leftovers need eyes, not a looser matcher.

`tools/archive.sh` downloads private backup copies of every source with yt-dlp
into `archive/` (git-ignored, not served). Keep those to yourself.

## Coverage

| Event | Stage | Series | Games | EN | RU | Notes |
|---|---|---|---|---|---|---|
| TI1 (2011) | Main event | 22 | 28 | 27 official | 23 official | No Valve match ids exist for 2011. One lower-bracket game was never uploaded in any language; four more have no Russian upload. |
| TI2 (2012) | Main event | 22 | 41 | 41 official | 41 official | Group stage (PAX Prime, Aug 26–29) was streamed but never uploaded per game. Grand Final game 1 exists twice in Russian; the unused copy is noted in `sourcesNote`. |
| TI3 (2013) | Main event | 22 | 45 | 45 official | 44 official + 1 re-upload (GF game 3) | Group stage streams were never uploaded per game. |
| TI4 (2014) | Main event (final 8) | 10 | 28 | 28 partner (IGN Arena) | 28 partner (StarLadder) | Valve's own uploads were taken down, so every source is `official: false`. |
| TI5 (2015) | Main event | 22 | 48 | 37 slices of official day VODs + 11 third-party (Dota2.TV) | 48 RuHub (per game) | The official channel never uploaded the final day; the grand final, the lower-bracket final and a few untimestamped games are per-game third-party copies. One Russian game exists only as two halves and plays the first. |
| TI6 (2016) | Main event | 22 | 47 | 46 slices of 6 official day VODs | 47 RuHub (per game) | One game has no English timestamp and exists in Russian only. |
| TI7 (2017) | Main event | 22 | 47 | 45 slices of 6 official day VODs | 47 RuHub (per game) | Two games exist in Russian only. |
| TI8 (2018) | Main event | 22 | 47 | 47 slices of 6 official day VODs | 47 RuHub (per game) | Complete in both languages. |

RuHub produced the official Russian broadcast from 2016, and uploaded it game by game where
Valve uploaded whole days; those are `official: false`. English slices and Russian uploads
are different recordings, so a language switch mid-game is only approximately in place, and
each such source carries a note saying so.

### Not here yet

Every remaining International has both an English and a Russian broadcast on Valve's own
`dota2` channel, so all seven can be added; what differs is how the broadcast was cut up.
Checked against the channel on 2026-09-18:

| Event | English | Russian | Shape |
|---|---|---|---|
| TI9 (2019) | `[EN] <A> vs <B> BO3 - ... Main Event` | `[RU]` twin of each | One upload per **series**, plus day VODs in both languages. Needs a per-game offset inside the series video, so this one is last. |
| TI10 (2021) | `[EN] <A> - <B> ... Day 4 - Game 1` | `[RU]` twin of each | Per game, official, both languages. |
| TI11 (2022) | `[EN] <A> vs <B> – Game 3 - ... Day 3` | `[RU]` twin of each | Per game, official, both languages (Spanish and Chinese too). |
| TI12 (2023) | `<A> vs <B> – Game 1 - TI 12 FINALS` | `<A> vs <B> – Game 1 - TI12: ФИНАЛ` | Per game, but the titles drop the `[EN]`/`[RU]` tag and name the stage in Russian instead. |
| TI13 (2024) | `<A> vs. <B> - Game 3 - ... - Finals` | `[RU] ... - Game 2 - ...` | Per game, official, both languages. |
| TI14 (2025) | `<A> vs <B> - Game 2 - ... - Grand Final` | `[RU] ... - Игра 1 - ...` | Per game, official, both languages. |
| TI15 (2026) | `[EN] <A> vs <B> - Game 1 - ... - Grand Final` | `[RU] ... - Игра 5 - ...` | Per game, official, both languages. |

So the VODs are not the obstacle; the bracket metadata is. From about 2022 Liquipedia keeps
matches in its database rather than in the page text, so `liquipedia_scrape.py`, which reads
wikitext, has nothing to read. `tools/ti_fetch2.py` collects what is needed to settle that.

### Fetching from a clean IP

Liquipedia rate-limits by IP and an over-eager survey can get the server blocked for hours.
When that happens, fetch from another machine and bring the result back through git:

```sh
git pull
python3 tools/ti_fetch2.py     # or: .\tools\ti_fetch2.ps1   (writes a .zip instead)
git add source-drop && git commit -m "Liquipedia source dump: TI9-TI15" && git push
```

One bulk `query` for every page at once, then one `parse` per page that exists, 3 s apart —
please do not lower that. Each run takes both the wikitext and the rendered HTML, because
the 2022+ brackets only exist once rendered. `tools/ti_fetch.py` / `.ps1` is the same thing
for TI1 and TI4–TI8 and is kept for reference.

Setting `LIQUIPEDIA_API_KEY` (free, from <https://api.liquipedia.net>) makes the script also
pull the `match2` database rows, which carry the Valve match id, winner, length and *every*
VOD link per game — Russian included — instead of leaving them to be scraped back out of
HTML. It is optional, and it is the better path for 2022 onward.

## License

MIT — free for any use, including commercial. See [LICENSE](LICENSE).

The code and the match metadata in `data/` are covered by that license. The videos
are not part of this repository; they belong to their uploaders (Valve's `dota2`
channel for almost everything here) and are only embedded. Dota 2 and The
International are trademarks of Valve Corporation; this project is not affiliated
with Valve.

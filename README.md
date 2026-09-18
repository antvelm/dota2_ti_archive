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

## How the spoiler protection works

| Leak | Countermeasure |
|---|---|
| Number of games in a series ("Game 3 of 3") | The game list only shows games you have finished plus the current one. There is a single *Continue* button; it either loads the next game or tells you the series is over. |
| YouTube title bar, pause overlay, end screen, related videos, scrubber thumbnails | The player runs with `controls=0` behind a transparent shield; our own controls sit on top. Pause and end states are covered by our own overlay. |
| Video length (a 20-minute VOD is a stomp) | Duration and progress fill are hidden by default ("blind scrubber"); seeking still works. Toggle in settings. |
| Bracket structure revealing who advanced | Later series are locked and show `TBD` until every series feeding into them is watched (or revealed). |
| Total game count on the progress bar | Progress is counted in series, never in games. |
| Casters mentioning a concurrent series' result | Choose *Strict chronological* order in settings: games play in real start order (by Valve match id), so nothing discussed on the broadcast has happened after the game you are watching. Default is *By series*, which plays each series to the end and is nicer to watch. |

Watch progress lives in `localStorage` (export/import in settings).

## Data

One JSON file per event in `data/`, listed in `data/events.json`.

```
event
 ├─ teams{slug → name, short, region}
 ├─ rounds[]   id, name, bracket (upper|lower|final), order (column), bestOf
 └─ series[]   id, round, team1, team2, start (ISO), bestOf,
      ├─ slots[]  {from: <series id>, take: winner|loser}  — who feeds team1 / team2
      └─ games[]  n, matchId (Valve), winner (1|2), length ("36:08"),
           └─ sources[]  lang, kind (main|cam|panel), provider (youtube), id, official, offset (s), note
```

`winner` per game is stored so that the site can resolve the bracket once you have
watched a series; it is never displayed before that. `offset` lets two sources of
the same game that start at different points stay in sync when you switch language.

### Adding an event

```sh
# 1. skeleton with English VODs from the Liquipedia bracket page
python3 tools/liquipedia_scrape.py "The_International/2014/Main_Event" \
    --id ti4 --name "The International 2014" --short TI4 \
    --location "KeyArena, Seattle" --dates "July 18–21, 2014" -o data/ti4.json
# 2. fill team names / regions in data/ti4.json by hand
# 3. Russian uploads from the same channel (needs yt-dlp)
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
`alt_vods_review.json`; the official channel's titles are inconsistent enough (Na'Vi spelled
with three different quote characters, swapped team order, and in Bo1 rounds "Game 2" meaning
the round's *second match*) that the leftovers need eyes, not a looser matcher.

`tools/archive.sh` downloads private backup copies of every source with yt-dlp
into `archive/` (git-ignored, not served). Keep those to yourself.

## Coverage

| Event | Stage | Series | Games | EN | RU | Notes |
|---|---|---|---|---|---|---|
| TI3 (2013) | Main event | 22 | 45 | 45 official | 44 official + 1 re-upload (GF game 3) | Group stage streams were never uploaded per game. |

## License

MIT — free for any use, including commercial. See [LICENSE](LICENSE).

The code and the match metadata in `data/` are covered by that license. The videos
are not part of this repository; they belong to their uploaders (Valve's `dota2`
channel for almost everything here) and are only embedded. Dota 2 and The
International are trademarks of Valve Corporation; this project is not affiliated
with Valve.

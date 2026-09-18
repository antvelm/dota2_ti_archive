#!/usr/bin/env python3
"""One-off assembly of data/ti3.json from research notes (Liquipedia main-event
wikitext + official 'dota2' YouTube channel uploads). Kept for reproducibility."""
import json, datetime

TEAMS = {
 "navi":        ("Natus Vincere", "Na'Vi", "UA"),
 "orange":      ("Orange Esports", "Orange", "MY"),
 "tongfu":      ("TongFu", "TongFu", "CN"),
 "fnatic":      ("Fnatic", "Fnatic", "EU"),
 "alliance":    ("Alliance", "Alliance", "SE"),
 "lgd":         ("LGD Gaming", "LGD", "CN"),
 "dk":          ("DK", "DK", "CN"),
 "ig":          ("Invictus Gaming", "iG", "CN"),
 "dignitas":    ("Team Dignitas", "Dignitas", "US"),
 "rattlesnake": ("RattleSnake", "RSnake", "CN"),
 "lgd.int":     ("LGD.International", "LGD.int", "CN"),
 "mouz":        ("mousesports", "mouz", "EU"),
 "liquid":      ("Team Liquid", "Liquid", "US"),
 "mufc":        ("MUFC", "MUFC", "MY"),
 "zenith":      ("Zenith", "Zenith", "SG"),
 "vp":          ("Virtus.pro", "VP", "RU"),
}

ROUNDS = [
 ("ub-r1", "Upper Bracket Round 1", "upper", 1, 3),
 ("ub-r2", "Upper Bracket Round 2", "upper", 2, 3),
 ("ub-f",  "Upper Bracket Final",   "upper", 3, 3),
 ("lb-r1", "Lower Bracket Round 1", "lower", 1, 1),
 ("lb-r2", "Lower Bracket Round 2", "lower", 2, 1),
 ("lb-r3", "Lower Bracket Round 3", "lower", 3, 1),
 ("lb-r4", "Lower Bracket Round 4", "lower", 4, 3),
 ("lb-r5", "Lower Bracket Round 5", "lower", 5, 3),
 ("lb-f",  "Lower Bracket Final",   "lower", 6, 3),
 ("gf",    "Grand Final",           "final", 7, 5),
]

# id, round, t1, t2, start (PDT), slots, en vod ids, match ids, game winners (1/2), lengths
S = [
 ("ub-r1-a","ub-r1","navi","orange","2013-08-07T13:05",None,
   ["f6yFfVNYaDg","7fTWOsoRSk0","_iTa30PWRuM"],[266642819,266675550,266691076],[2,1,1],["36:08","24:54","25:53"]),
 ("ub-r1-b","ub-r1","tongfu","fnatic","2013-08-07T16:10",None,
   ["E9aW7azeCFU","0vype-Cq8LU"],[266726957,266744516],[1,1],["22:11","51:46"]),
 ("ub-r1-c","ub-r1","alliance","lgd","2013-08-08T12:45",None,
   ["TU6bC2ygLJk","rajhrSJWTCU"],[267640827,267690993],[1,1],["62:46","26:35"]),
 ("ub-r1-d","ub-r1","dk","ig","2013-08-08T15:20",None,
   ["7-r5y8few0s","zQ2CSkLY3Bc","Hi2KXUR_gCg"],[267725202,267750277,267795420],[1,2,1],["32:10","98:58","35:10"]),
 ("ub-r2-a","ub-r2","navi","tongfu","2013-08-09T16:40",[("ub-r1-a","winner"),("ub-r1-b","winner")],
   ["ajQuCZx-yx8","ksKdBL6JLz8","OaGSi1YTA-E"],[268806477,268825557,268847227],[1,2,1],["30:27","38:54","46:46"]),
 ("ub-r2-b","ub-r2","alliance","dk","2013-08-09T12:50",[("ub-r1-c","winner"),("ub-r1-d","winner")],
   ["vTfPkn4Dk2w","JJ6O8--6BFs","_zmQS-mE3ro"],[268683084,268737468,268775251],[1,2,1],["55:28","48:19","40:35"]),
 ("ub-f","ub-f","navi","alliance","2013-08-10T16:40",[("ub-r2-a","winner"),("ub-r2-b","winner")],
   ["hHPi9jmLKaQ","Mo7MOco6tCQ"],[269910097,269927795],[2,2],["28:35","33:07"]),
 ("lb-r1-a","lb-r1","dignitas","rattlesnake","2013-08-07T18:20",None,
   ["pYJT9gnGQ60"],[266777348],[1],["36:24"]),
 ("lb-r1-b","lb-r1","lgd.int","mouz","2013-08-07T19:25",None,
   ["6qYcj7wvA3o"],[266803581],[1],["37:32"]),
 ("lb-r1-c","lb-r1","liquid","mufc","2013-08-08T19:30",None,
   ["hp7hAEG45F8"],[267826531],[1],["26:11"]),
 ("lb-r1-d","lb-r1","zenith","vp","2013-08-08T20:30",None,
   ["JtA7wjjCnrU"],[267852851],[1],["40:54"]),
 ("lb-r2-a","lb-r2","orange","dignitas","2013-08-07T20:30",[("ub-r1-a","loser"),("lb-r1-a","winner")],
   ["eJMWVTWC4lU"],[266832024],[1],["38:52"]),
 ("lb-r2-b","lb-r2","fnatic","lgd.int","2013-08-07T21:45",[("ub-r1-b","loser"),("lb-r1-b","winner")],
   ["Vt9Wxk_vk10"],[266864588],[1],["31:38"]),
 ("lb-r2-c","lb-r2","lgd","liquid","2013-08-08T21:35",[("ub-r1-c","loser"),("lb-r1-c","winner")],
   ["TK0edsKJMlc"],[267885392],[2],["51:53"]),
 ("lb-r2-d","lb-r2","ig","zenith","2013-08-08T22:50",[("ub-r1-d","loser"),("lb-r1-d","winner")],
   ["JVzyeMjEO_o"],[267921517],[1],["45:09"]),
 ("lb-r3-a","lb-r3","orange","fnatic","2013-08-09T20:55",[("lb-r2-a","winner"),("lb-r2-b","winner")],
   ["0WtxAC_PeMQ"],[268881455],[1],["50:24"]),
 ("lb-r3-b","lb-r3","liquid","ig","2013-08-09T21:10",[("lb-r2-c","winner"),("lb-r2-d","winner")],
   ["9CRELeMfcqU"],[268920193],[2],["60:14"]),
 ("lb-r4-a","lb-r4","dk","orange","2013-08-09T22:35",[("ub-r2-b","loser"),("lb-r3-a","winner")],
   ["5aOsHRKc4-A","PxeHV1CoMek","q-An7Cbyn8E"],[268963993,269739993,269777362],[1,2,2],["41:37","27:13","44:54"]),
 ("lb-r4-b","lb-r4","tongfu","ig","2013-08-09T23:40",[("ub-r2-a","loser"),("lb-r3-b","winner")],
   ["ZeZT8Eph7Tk","uONmC5YpV10","KNgvA34SwkU"],[269004111,269828278,269879845],[2,1,1],["51:32","64:51","30:58"]),
 ("lb-r5","lb-r5","orange","tongfu","2013-08-10T18:35",[("lb-r4-a","winner"),("lb-r4-b","winner")],
   ["PISZ4NR1fwE","WJnXtryIE2A","evpfBt2L3fw"],[269952489,269981681,270016993],[1,2,1],["39:30","48:34","28:41"]),
 ("lb-f","lb-f","navi","orange","2013-08-11T12:45",[("ub-f","loser"),("lb-r5","winner")],
   ["7DDPmD4fhHI","m8KFMSWWZxg","SQTntvzdY5k"],[270942504,270979841,271008789],[2,1,1],["40:05","24:41","47:27"]),
 ("gf","gf","alliance","navi","2013-08-11T16:55",[("ub-f","winner"),("lb-f","winner")],
   ["2zsNnwtVH_I","mJ2JTVgJdJg","pmchmlCxyYQ","ezeYUV7_d-Q","-8HBr1EGX1I"],[271076032,271088718,271102834,271123757,271145478],[1,2,2,1,1],["15:47","20:33","47:31","36:25","43:45"]),
]

RU = dict(x.split(":") for x in """f6yFfVNYaDg:-6t6x-n1GsU 7fTWOsoRSk0:wyCYedl-eZg _iTa30PWRuM:QpuOsesqbMw E9aW7azeCFU:-r1yrGA7JTU 0vype-Cq8LU:vDLKojlmGVg TU6bC2ygLJk:4VI7L1JxRng rajhrSJWTCU:Y2X2Na8BqmY 7-r5y8few0s:mJO9TuI-6Go zQ2CSkLY3Bc:JcXrs5QBOyU Hi2KXUR_gCg:YwaPL3-nwDA ajQuCZx-yx8:n7WJ21LuUtM ksKdBL6JLz8:CJ0rcPd_4T0 OaGSi1YTA-E:Z57VcYlb894 vTfPkn4Dk2w:-KyUJpL47rE JJ6O8--6BFs:3iEQrPRTQIE _zmQS-mE3ro:l67cctOVtsw hHPi9jmLKaQ:f37CFS66Zgc Mo7MOco6tCQ:KT7VIx_pRLM pYJT9gnGQ60:iwua-Sb8go8 6qYcj7wvA3o:S0xrvMKSuHs hp7hAEG45F8:JgcX6C3lMN4 JtA7wjjCnrU:JOpu6irCX7E eJMWVTWC4lU:otAhpL9TzpA Vt9Wxk_vk10:tRWTEcV6nJU TK0edsKJMlc:kxWjgwasiIY JVzyeMjEO_o:nr-t7Jx3cLc 0WtxAC_PeMQ:VN-RscMBJYs 9CRELeMfcqU:uVzGnfBgt9k 5aOsHRKc4-A:6_CQgSmCrEU PxeHV1CoMek:eZQ3gkOAjoY q-An7Cbyn8E:Z_Mpmm7k5pk ZeZT8Eph7Tk:-VISKPKPP9A uONmC5YpV10:Xec-o1jWjHg KNgvA34SwkU:QpVRFNXAhho PISZ4NR1fwE:DX_N0tO1l9c WJnXtryIE2A:oV6zvWzv684 evpfBt2L3fw:5rqTsblbhVE 7DDPmD4fhHI:y34xnWNtM-o m8KFMSWWZxg:jPKFYpFq7lI SQTntvzdY5k:1wiYGQTJd1g 2zsNnwtVH_I:QdQJACOEtBE mJ2JTVgJdJg:gN9hUNRL5Og pmchmlCxyYQ:mSP7S32mCEk ezeYUV7_d-Q:WqcCxpR7HDI -8HBr1EGX1I:VgFJhNu3QXg""".split())
UNOFFICIAL_RU = {"mSP7S32mCEk": "Re-upload by YouTube user DimeDrol; the official Russian upload of GF game 3 is missing."}

def ev():
    teams = {k: {"name": n, "short": s, "region": r} for k, (n, s, r) in TEAMS.items()}
    rounds = [{"id": i, "name": n, "bracket": b, "order": o, "bestOf": bo} for i, n, b, o, bo in ROUNDS]
    series = []
    for sid, rid, t1, t2, start, slots, en, mids, wins, lens in S:
        assert len(en) == len(mids) == len(wins) == len(lens), sid
        games = []
        for i, (e, m, w, L) in enumerate(zip(en, mids, wins, lens)):
            r = RU[e]
            src = [
                {"lang": "en", "kind": "main", "provider": "youtube", "id": e, "official": True, "offset": 0},
                {"lang": "ru", "kind": "main", "provider": "youtube", "id": r, "official": r not in UNOFFICIAL_RU, "offset": 0},
            ]
            if r in UNOFFICIAL_RU:
                src[1]["note"] = UNOFFICIAL_RU[r]
            games.append({"n": i + 1, "matchId": m, "winner": w, "length": L, "sources": src})
        bo = next(x[4] for x in ROUNDS if x[0] == rid)
        series.append({
            "id": sid, "round": rid, "bestOf": bo, "team1": t1, "team2": t2,
            "start": start + "-07:00",
            "slots": [{"from": f, "take": t} for f, t in slots] if slots else [],
            "games": games,
        })
    return {
        "id": "ti3", "name": "The International 2013", "short": "TI3",
        "location": "Benaroya Hall, Seattle", "dates": "August 7–11, 2013",
        "stage": "Main Event", "timezone": "America/Los_Angeles",
        "notes": "Main event only. Group stage VODs (BeyondTheSummit / joinDOTA streams) are not available as per-game uploads.",
        "sourcesNote": "All English and Russian per-game VODs are official uploads on the 'dota2' YouTube channel unless flagged official:false.",
        "languages": {"en": "English", "ru": "Русский"},
        "teams": teams, "rounds": rounds, "series": series,
    }

if __name__ == "__main__":
    import os
    e = ev()
    out = os.path.join(os.path.dirname(__file__), "..", "data", "ti3.json")
    with open(out, "w") as f:
        json.dump(e, f, indent=1, ensure_ascii=False)
    n = sum(len(s["games"]) for s in e["series"])
    print(f"wrote {out}: {len(e['series'])} series, {n} games")

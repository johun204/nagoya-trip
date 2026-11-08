#!/usr/bin/env python3
"""Fill opening hours (hours) and Google category (gtype) for plan.json places from Google Maps.

Places with a cid are looked up directly; others are searched by q/name near their coordinates
(their cid is saved and lat/lng corrected to Google's). hours = {"월": "...", ..., "일": "..."} as Google shows for the current week.
"""
import json, re, sys, time, urllib.parse, urllib.request
from datetime import date
from pathlib import Path

PLAN = Path(__file__).with_name("plan.json")
UA = {"User-Agent": "Mozilla/5.0 (Macintosh) Chrome/156.0", "Accept-Language": "ko-KR"}
PB = "%211m14%211s0x0%3A0x6cb9f58dc5df900b%213m12%211m3%211d50601.09019330326%212d126.92357119999998%213d37.565235200000004%212m3%211f0.0%212f0.0%213f0.0%213m2%211i1024%212i768%214f13.1%2112m4%212m3%211i360%212i120%214i8%2113m57%212m2%211i203%212i100%213m2%212i4%215b1%216m6%211m2%211i86%212i86%211m2%211i408%212i240%217m33%211m3%211e1%212b0%213e3%211m3%211e2%212b1%213e2%211m3%211e2%212b0%213e3%211m3%211e8%212b0%213e3%211m3%211e10%212b0%213e3%211m3%211e10%212b1%213e2%211m3%211e10%212b0%213e4%211m3%211e9%212b1%213e2%212b1%219b0%2115m8%211m7%211m2%211m1%211e2%212m2%211i195%212i195%213i20%2114m3%211s-wrwau-aPPehseMPn_ykmQ8%217e81%2115i10112%2115m108%211m26%2113m9%212b1%213b1%214b1%216i1%218b1%219b1%2114b1%2120b1%2125b1%2118m15%213b1%214b1%215b1%216b1%2113b1%2114b1%2117b1%2121b1%2122b1%2130b1%2132b1%2133m1%211b1%2134b1%2136e2%2110m1%218e3%2111m1%213e1%2117b1%2120m2%211e3%211e6%2124b1%2125b1%2126b1%2127b1%2129b1%2130m1%212b1%2136b1%2137b1%2139m3%212m2%212i1%213i1%2143b1%2152b1%2154m1%211b1%2155b1%2156m1%211b1%2161m2%211m1%211e1%2165m5%213m4%211m3%211m2%211i224%212i298%2172m22%211m8%212b1%215b1%217b1%2112m4%211b1%212b1%214m1%211e1%214b1%218m10%211m6%214m1%211e1%214m1%211e3%214m1%211e4%213sother_user_google_review_posts__and__hotel_and_vr_partner_review_posts%216m1%211e1%219b1%2189b1%2190m2%211m1%211e2%2198m3%211b1%212b1%213b1%21103b1%21113b1%21114m3%211b1%212m1%211b1%21117b1%21122m1%211b1%21126b1%21127b1%21128m1%211b1%2121m0%2122m1%211e81%2130m8%213b1%216m2%211b1%212b1%217m2%211e3%212b1%219b1%2134m5%217b1%2110b1%2114b1%2115m1%211b0%2137i802"
DAYS = {1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토", 7: "일"}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode()

def find_fid(p):
    pb = f"!4m12!1m3!1d3000!2d{p['lng']}!3d{p['lat']}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!7i20!10b1!12m6!2m3!5m1!6e2!20e3!10b1!16b1"
    txt = get("https://www.google.com/search?tbm=map&hl=ko&gl=jp&q=" + urllib.parse.quote(p.get("q") or p["name"]) + "&pb=" + pb)
    m = re.search(r"0x[0-9a-f]+:0x[0-9a-f]+", txt)
    return m.group(0) if m else None

def info(fid):
    pb = re.sub(r"%211s[^%]+%3A0x[0-9a-f]+", "%211s" + urllib.parse.quote(fid), PB, count=1)
    txt = get("https://www.google.com/maps/preview/place?authuser=0&hl=ko&gl=jp&pb=" + pb)
    d = json.loads(txt.split("\n", 1)[1])[6]
    gtype = (d[13] or [None])[0] if len(d) > 13 else None
    coords = (d[9][2], d[9][3]) if d[9] else None
    hours = {}
    try:
        for row in d[203][0]:
            spans = row[3] or []
            hours[DAYS[row[1]]] = ", ".join(s[0] for s in spans) or "휴무"
    except (IndexError, TypeError):
        pass
    order = list(DAYS.values())
    return gtype, {k: hours[k] for k in order if k in hours}, coords

plan = json.loads(PLAN.read_text())
only = set(sys.argv[1:])
for p in plan["places"]:
    if only and p["id"] not in only:
        continue
    fid = f"0x0:{int(p['cid']):#x}" if p.get("cid") else find_fid(p)
    if not fid:
        print(f"?? {p['id']}: not found"); continue
    searched = not p.get("cid")
    if searched:
        p["cid"] = str(int(fid.split(":")[1], 16))
    gtype, hours, coords = info(fid)
    if searched and coords:  # 검색으로 찾은 장소는 구글 좌표로 보정
        p["lat"], p["lng"] = coords
    if gtype: p["gtype"] = gtype
    if hours: p["hours"] = hours
    print(f"{p['id']}: {gtype} | {' / '.join(f'{k} {v}' for k, v in hours.items()) or '영업시간 없음'}")
    time.sleep(1)
plan["trip"]["hoursAsOf"] = date.today().isoformat()
PLAN.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")

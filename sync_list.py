#!/usr/bin/env python3
"""Sync the shared Google Maps list "나고야" into plan.json places.

New list places are added with id "g<cid>" and category "food" (edit as needed).
Places removed from the list are dropped from plan.json unless a day item still uses them.
Prints NEW / REMOVED / KEEP lines; prints nothing when unchanged.
"""
import json, urllib.request
from pathlib import Path

LIST_ID = "sD1aTHbKpdzmHf-HX5x0eyZ9RpkBYw"
URL = ("https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=ko&gl=kr"
       f"&pb=!1m4!1s{LIST_ID}!2e1!3m1!1e1!2e2!3e2!4i500!16b1")
PLAN = Path(__file__).with_name("plan.json")

raw = urllib.request.urlopen(URL, timeout=30).read().decode()
entries = json.loads(raw.split("\n", 1)[1])[0][8] or []
remote = {}
for it in entries:
    info = it[1]
    cid = str(int(info[6][1]) % 2**64)
    remote[cid] = {"id": "g" + cid, "name": it[2], "category": "food", "source": "list",
                   "cid": cid, "lat": info[5][2], "lng": info[5][3], "address": info[4],
                   "note": it[3] or ""}

plan = json.loads(PLAN.read_text())
places = plan["places"]
known = {p["cid"]: p for p in places if p.get("cid")}
used = {pid for d in plan["days"] for i in d["items"] for pid in i.get("places", [])}

changed = False
for cid, p in remote.items():
    if cid not in known:
        places.append(p)
        print(f'NEW {p["id"]} | {p["name"]} | {p["address"]}')
        changed = True
for cid, p in known.items():
    if p.get("source") == "list" and cid not in remote:
        if p["id"] in used:
            print(f'KEEP (removed from list but scheduled) {p["id"]} | {p["name"]}')
        else:
            places.remove(p)
            print(f'REMOVED {p["id"]} | {p["name"]}')
            changed = True
if changed:
    PLAN.write_text(json.dumps(plan, ensure_ascii=False, indent=2) + "\n")

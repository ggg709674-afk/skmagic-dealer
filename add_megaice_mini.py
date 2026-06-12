# -*- coding: utf-8 -*-
"""MEGA ICE 얼음정수기 mini 2색 추가 (cg_0009).
G000069931 내추럴 화이트 / G000069933 오트밀 베이지.
crawl_one 으로 detail/meta 는 이미 받아둔 상태."""
import json, pathlib, shutil

ROOT = pathlib.Path(__file__).parent
DB = ROOT / "data" / "products.json"
PRD = ROOT / "products"

CG = "cg_0009"
COLORS = [
    {"color": "color01", "style": "background: rgb(251,251,251);"},
    {"color": "color07", "style": "background: #CCB89E;"},
]
TARGETS = {
    "G000069931": {"_colorStyle": "rgb(251,251,251)", "_colorName": "내추럴 화이트"},
    "G000069933": {"_colorStyle": "#CCB89E", "_colorName": "오트밀 베이지"},
}

shutil.copy(DB, DB.with_suffix(".json.bak7"))
db = json.loads(DB.read_text(encoding="utf-8"))
existing = {p["goodsId"] for p in db["products"]}

for gid, meta_overrides in TARGETS.items():
    if gid in existing:
        print(f"[skip] {gid} 이미 있음")
        continue
    m = json.loads((PRD / gid / "meta.json").read_text(encoding="utf-8"))
    name = (m.get("name", "") or "").split("\n")[0].strip()
    entry = {
        "goodsId": gid,
        "name": name,
        "model": m.get("model", ""),
        "alt": name,
        "thumb": (m.get("main_images") or [""])[0],
        "benefits": ["냉온정얼음", "셀프관리/방문관리"],
        "tag": "",
        "prices": m.get("prices", [])[:1],
        "colors": COLORS,
        "categories": ["100000005"],
        "thumb_ext": ".png",
        "_colorGroup": CG,
        "_colorStyle": meta_overrides["_colorStyle"],
        "_colorName": meta_overrides["_colorName"],
        "_addedByColorExpand": True,
    }
    db["products"].append(entry)
    print(f"[+] {gid} 추가 (model={entry['model']}, color={entry['_colorName']})")

db["total"] = len(db["products"])
for c in db.get("categories", []):
    if c.get("dispClsfNo") == "100000005":
        c["count"] = sum(1 for p in db["products"] if "100000005" in (p.get("categories") or []))

DB.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"[done] total={db['total']}")

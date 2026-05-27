# -*- coding: utf-8 -*-
"""cg_0004 그룹 정리:
  1) G000069345, G000069348 을 정수기 카테고리(100000005) products.json에 추가
  2) 4건(282/284/345/348) 모두 _colorGroup=cg_0004, 정확한 _colorStyle, _colorName 입력
  3) meta.json 의 _colorName 도 동기화
"""
import json, re, pathlib, shutil

ROOT = pathlib.Path(__file__).parent
DB = ROOT / "data" / "products.json"
PRD = ROOT / "products"

# fetch_color_group.py 결과(본사 라디오 정답)
RADIOS = {
    "G000069282": {  # color01
        "style": "rgb(251,251,251)",
        "model": "WPUIAC425SNW",
    },
    "G000069284": {  # color12
        "style": "#8A8A8A",
        "model": "WPUIAC425SNS",
    },
    "G000069345": {  # color11
        "style": "url('https://web-image.useinsider.com/skmagiccom/defaultImageLibrary/psg_White_PC_size-1741227254.png')",
        "model": "WPUIAC425PPW",
    },
    "G000069348": {  # color13
        "style": "url('https://web-image.useinsider.com/skmagiccom/defaultImageLibrary/PSG%E1%84%91%E1%85%B3%E1%86%AF%E1%84%85%E1%85%A5%E1%84%89%E1%85%B3_%E1%84%89%E1%85%B5%E1%86%AF%E1%84%87%E1%85%A5_PC-1749602708.png')",
        "model": "WPUIAC425PNS",
    },
}

# pageTitle에서 _colorName / name 추출
TITLE_RX = re.compile(r"\|\s*([^|]+?)\s*\|\s*[A-Z]{2,}[A-Z0-9-]{4,}\s*\|\s*SK매직몰")
COLOR_BASES = ["화이트","블랙","실버","네이비","그린","블루","세이지","핑크","베이지","브라운","그레이"]
MODIFIERS = ["내추럴","뉴트럴","다크","오리지널","파스텔","소프트","메탈","비비드","딥","페일","오로라","세라믹","라이트","리치","오트밀","옵틱"]
def normalize(name):
    for mod in MODIFIERS:
        for base in COLOR_BASES:
            j = mod + base
            if j in name: name = name.replace(j, f"{mod} {base}")
    return re.sub(r"\s+", " ", name).strip()
def extract_color(pt):
    m = TITLE_RX.search(pt or "")
    if not m: return None
    seg = m.group(1)
    last = seg.split(",")[-1].strip() if "," in seg else seg.strip()
    if not any(w in last for w in COLOR_BASES): return None
    return normalize(last)

# meta.json에서 신규 2건의 정보 끌어오기 (이미 crawl_one 완료)
def load_meta(gid):
    return json.loads((PRD / gid / "meta.json").read_text(encoding="utf-8"))

shutil.copy(DB, DB.with_suffix(".json.bak5"))
db = json.loads(DB.read_text(encoding="utf-8"))

# 1) 신규 2건 추가
existing_ids = {p["goodsId"] for p in db["products"]}
for gid in ["G000069345", "G000069348"]:
    if gid in existing_ids:
        continue
    m = load_meta(gid)
    cname = extract_color(m.get("pageTitle", ""))
    entry = {
        "goodsId": gid,
        "name": m.get("name", "").split("\n")[0].strip(),
        "model": m.get("model", ""),
        "alt": m.get("name", "").split("\n")[0].strip(),
        "thumb": (m.get("main_images") or [""])[0],
        "benefits": [],
        "tag": "",
        "prices": m.get("prices", [])[:1],
        "colors": [],
        "categories": ["100000005"],
        "thumb_ext": ".png",
        "_colorGroup": "cg_0004",
        "_colorStyle": RADIOS[gid]["style"],
        "_colorName": cname,
        "_addedByColorExpand": True,
    }
    db["products"].append(entry)
    print(f"[+] {gid} 추가 (model={entry['model']}, color={cname!r})")

# 2) 기존 4건의 _colorStyle / _colorName 보정
for p in db["products"]:
    gid = p.get("goodsId")
    if gid in RADIOS:
        p["_colorGroup"] = "cg_0004"
        old_style = p.get("_colorStyle")
        p["_colorStyle"] = RADIOS[gid]["style"]
        if old_style != RADIOS[gid]["style"]:
            print(f"[~] {gid} _colorStyle: {old_style!r} -> {RADIOS[gid]['style'][:50]!r}")
        # _colorName 도 meta.json 기준으로
        mp = PRD / gid / "meta.json"
        if mp.exists():
            mm = json.loads(mp.read_text(encoding="utf-8"))
            cname = extract_color(mm.get("pageTitle", ""))
            if cname and p.get("_colorName") != cname:
                p["_colorName"] = cname

# (참고) 우리 데이터의 다른 약정 변형 283/285도 cg_0004 유지하되 model dedupe로 칩엔 안 보임
db["total"] = len(db["products"])
# 정수기 count 갱신
for c in db.get("categories", []):
    if c.get("dispClsfNo") == "100000005":
        c["count"] = sum(1 for p in db["products"] if "100000005" in (p.get("categories") or []))

DB.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\n[done] total={db['total']}")

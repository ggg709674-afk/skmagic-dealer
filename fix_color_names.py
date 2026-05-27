# -*- coding: utf-8 -*-
"""모든 상품의 _colorName 필드를 pageTitle 기준으로 채움.
- pageTitle 형식: "<상품명> | 구독 | <키워드>, <키워드>, <색명> | <모델> | SK매직몰"
- 마지막 세그먼트(콤마 split 후 마지막)가 색명 후보. 색 단어 포함 시 채택.
- 본사가 띄어쓰기 일관성 없음 → 수식어+색명 정규화 ("뉴트럴실버" → "뉴트럴 실버").
"""
import json, re, pathlib, shutil

ROOT = pathlib.Path(__file__).parent
PROD = ROOT / "products"
DB = ROOT / "data" / "products.json"

TITLE_RX = re.compile(r"\|\s*([^|]+?)\s*\|\s*[A-Z]{2,}[A-Z0-9-]{4,}\s*\|\s*SK매직몰")

# 색 단어 (이게 포함되어야 색명으로 인정)
COLOR_BASES = ["화이트","블랙","실버","네이비","그린","블루","세이지","핑크","베이지","브라운","그레이"]
# 수식어 (색명 앞에 붙는 한국어 형용사) — 정규화 시 사이에 띄어쓰기 삽입
MODIFIERS = ["내추럴","뉴트럴","다크","오리지널","파스텔","소프트","메탈","비비드","딥","페일","오로라","세라믹","라이트","리치","오트밀","옵틱"]

def looks_like_color(s: str) -> bool:
    return any(w in s for w in COLOR_BASES)

def normalize(name: str) -> str:
    name = name.strip()
    # 수식어 + 색명이 붙어있으면(예: "뉴트럴실버") 사이에 띄어쓰기
    for mod in MODIFIERS:
        for base in COLOR_BASES:
            joined = mod + base
            if joined in name:
                name = name.replace(joined, f"{mod} {base}")
    # 중복 공백 정리
    name = re.sub(r"\s+", " ", name).strip()
    return name

def extract(pageTitle: str):
    m = TITLE_RX.search(pageTitle or "")
    if not m: return None
    seg = m.group(1)
    last = seg.split(",")[-1].strip() if "," in seg else seg.strip()
    if not looks_like_color(last):
        return None
    return normalize(last)

# meta.json 일괄
gid_to_color = {}
meta_count = 0
for mp in sorted(PROD.glob("*/meta.json")):
    gid = mp.parent.name
    m = json.loads(mp.read_text(encoding="utf-8"))
    cname = extract(m.get("pageTitle", ""))
    if cname:
        gid_to_color[gid] = cname
        if m.get("_colorName") != cname:
            m["_colorName"] = cname
            mp.write_text(json.dumps(m, ensure_ascii=False, indent=2), encoding="utf-8")
            meta_count += 1
print(f"[meta] _colorName 채워진 상품: {len(gid_to_color)}건 (이번에 신규 기록: {meta_count}건)")

# db
shutil.copy(DB, DB.with_suffix(".json.bak4"))
db = json.loads(DB.read_text(encoding="utf-8"))
db_count = 0
for p in db["products"]:
    cname = gid_to_color.get(p.get("goodsId"))
    if cname and p.get("_colorName") != cname:
        p["_colorName"] = cname
        db_count += 1
DB.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"[db]   {db_count}건 기록 (백업: {DB.name}.bak4)")

# 통계
from collections import Counter
print("\n--- 정식 색명 분포 ---")
for n, c in Counter(gid_to_color.values()).most_common():
    print(f"  {n:20} {c}건")

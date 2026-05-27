# -*- coding: utf-8 -*-
"""benefits 비어있는 상품에 pageTitle 에서 추출한 키워드를 채움.
대상: 정수기/공기청정기/비데/일시불 구매 (필터/매트리스/프레임 제외)
패턴: "<name> | 구독 | <kw1>, <kw2>, <색명?> | MODEL | SK매직몰"
"""
import json, re, pathlib, shutil

ROOT = pathlib.Path(__file__).parent
DB = ROOT / "data" / "products.json"
PRD = ROOT / "products"

TARGET_CATS = {"100000005", "100000010", "100000024", "1000000212"}
TITLE_RX = re.compile(r"\|\s*([^|]+?)\s*\|\s*[A-Z]{2,}[A-Z0-9-]{4,}\s*\|\s*SK매직몰")
COLOR_BASES = ["화이트","블랙","실버","네이비","그린","블루","세이지","핑크","베이지","브라운","그레이"]

def is_color_token(tok: str) -> bool:
    return any(w in tok for w in COLOR_BASES)

def extract_benefits(pageTitle: str):
    m = TITLE_RX.search(pageTitle or "")
    if not m: return []
    seg = m.group(1)
    parts = [p.strip() for p in seg.split(",") if p.strip()]
    # 첫 "구독" 같은 placeholder 제거 (현재 패턴엔 없지만 안전)
    return [p for p in parts if not is_color_token(p)]

shutil.copy(DB, DB.with_suffix(".json.bak7"))
db = json.loads(DB.read_text(encoding="utf-8"))
fixed = 0
for p in db["products"]:
    cats = set(p.get("categories") or [])
    if not (cats & TARGET_CATS):
        continue
    if p.get("benefits"):
        continue
    mp = PRD / p["goodsId"] / "meta.json"
    if not mp.exists(): continue
    m = json.loads(mp.read_text(encoding="utf-8"))
    bens = extract_benefits(m.get("pageTitle", ""))
    if bens:
        p["benefits"] = bens
        fixed += 1
        print(f"  {p['goodsId']}: {bens}")

DB.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\n[done] {fixed}건 보충")

# -*- coding: utf-8 -*-
"""정수기 카테고리(정수기 + 일시불 구매 중 정수기 제품)의 benefits 중
'냉온/냉온정/냉온얼음/냉온정얼음' 같은 기능 키워드를 specs 기반으로 정정."""
import json, re, pathlib

ROOT = pathlib.Path(__file__).parent
DB = ROOT / "data" / "products.json"
PRD = ROOT / "products"

TARGET_CATS = {"100000005", "1000000212", "1000000227"}
WATER_KEYS_RX = re.compile(r"^냉(?:온|정|얼음|온정|온얼음|정얼음|온정얼음)?$")

def specs_to_func(specs):
    """specs 에서 (냉/온/정/얼음) O 여부 확인 → '냉온정얼음' 형태로 합성."""
    has = {}
    for s in specs or []:
        label = s.get("label", "").strip()
        value = (s.get("value", "") or "").strip().upper()
        if value not in ("O", "있음", "지원"):
            continue
        if label == "냉수": has["냉"] = True
        elif label == "온수": has["온"] = True
        elif label in ("직수", "정수"): has["정"] = True
        elif label in ("아이스", "얼음"): has["얼음"] = True
    if not has: return None
    order = ["냉", "온", "정", "얼음"]
    return "".join(k for k in order if has.get(k))

db = json.loads(DB.read_text(encoding="utf-8"))
changed = 0
for p in db["products"]:
    cats = set(p.get("categories") or [])
    if not (cats & TARGET_CATS): continue
    bens = list(p.get("benefits") or [])
    if not bens: continue
    mp = PRD / p["goodsId"] / "meta.json"
    if not mp.exists(): continue
    m = json.loads(mp.read_text(encoding="utf-8"))
    new_func = specs_to_func(m.get("specs"))
    if not new_func: continue
    # 기존 benefits 에서 '냉…' 류 항목을 새 값으로 교체 (없으면 추가 안 함)
    new_bens = []
    replaced = False
    for b in bens:
        if WATER_KEYS_RX.match(b.strip()):
            if not replaced:
                new_bens.append(new_func)
                replaced = True
            # 추가 중복은 스킵
        else:
            new_bens.append(b)
    # 정정이 있었으면만 갱신
    if replaced and new_bens != bens:
        old = next((b for b in bens if WATER_KEYS_RX.match(b.strip())), '?')
        if old != new_func:
            p["benefits"] = new_bens
            changed += 1
            print(f"  {p['goodsId']:12} model={p.get('model'):20} {old!r} -> {new_func!r}")

DB.write_text(json.dumps(db, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\n[done] {changed}건 정정")

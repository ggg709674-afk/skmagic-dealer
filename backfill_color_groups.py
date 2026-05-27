# -*- coding: utf-8 -*-
"""
이미 추가된 색상 변형들에 _colorGroup 키를 backfill.
collect_products.py를 다시 안 돌리고도 app.js 그룹핑이 안정되게 함.

전략:
- 같은 (정규화된 name, 첫 카테고리, 모델 prefix) 가진 상품들을 한 그룹으로 묶음
- 모델 prefix: 모델 첫 줄에서 끝 2~3자(색상 코드) 제외한 부분
- name 정규화: 선행 영문/숫자/공백 제거 (PSG, MEGA ICE 같은 마케팅 prefix 통일)
- 또는 본사 카드 colors 가 일치하는 경우 같이 묶음 (모델 prefix가 어긋날 때 백업)
"""
import json, os, re
from collections import defaultdict

ROOT = os.path.dirname(os.path.abspath(__file__))
PJ = os.path.join(ROOT, "data", "products.json")

def model_prefix(model):
    m = (model or "").split("\n")[0].strip().upper()
    # 끝에서 영문 2~3자 제거 (색상 코드)
    return re.sub(r"[A-Z]{2,3}$", "", m)

def norm_name(name):
    # 선행 영문/숫자/특수문자/공백 제거 — 한글 본명만
    return re.sub(r"^[\x20-\x7E]+", "", (name or "")).strip()

def main():
    with open(PJ, encoding="utf-8") as f:
        db = json.load(f)
    products = db["products"]

    # (name 원형, cat0) 키로 그룹화 — 모델 prefix는 사용 안 함.
    # 본사가 같은 라인업으로 묶는데 모델 prefix가 다른 케이스(WPUJAC125SNW + WPUIAC506SNW)도
    # 같은 그룹으로 합치기 위함. name 원형 사용 → [22평] vs [16평] 같이 name 다르면 분리 유지.
    # PSG/MEGA ICE 같은 마케팅 prefix 케이스는 본사 라디오 스크립트(discover_color_variants.py)로 별도 처리.
    groups = defaultdict(list)
    for p in products:
        cat0 = (p.get("categories") or [""])[0]
        key = (p.get("name", ""), cat0)
        groups[key].append(p)

    # 기존 _colorGroup 모두 제거 후 재할당 (모델 prefix 기반 분리 흔적 제거)
    for p in products:
        p.pop("_colorGroup", None)

    # 사이즈 2 이상(서로 다른 모델) 인 그룹에만 _colorGroup 부여
    assigned = 0
    gi = 0
    for key, lst in groups.items():
        # dedup by model 첫 줄 — 같은 모델은 약정 옵션만 다른 같은 상품
        unique_models = set((p.get("model", "") or "").split("\n")[0].strip() for p in lst)
        if len(unique_models) < 2:
            continue
        gi += 1
        cg = f"cg_{gi:04d}"
        for p in lst:
            p["_colorGroup"] = cg
            assigned += 1
        print(f"  {cg}: {len(unique_models)} models - {sorted(unique_models)[:5]}")

    # === 본사 라디오로 확인된 알려진 그룹 강제 합치기 ===
    # name이 달라(PSG/MEGA ICE 등 마케팅 prefix) backfill이 못 잡는 케이스를 명시.
    # discover_color_variants.py 결과 기반.
    KNOWN_GROUPS = [
        # 필세기 플렉스 + PSG 필세기 플렉스 (G000069382가 같은 라인업)
        ['G000069308', 'G000069309', 'G000069310', 'G000069311', 'G000069382'],
    ]
    by_id = {p["goodsId"]: p for p in products}
    for group in KNOWN_GROUPS:
        existing_cg = next((by_id[g]["_colorGroup"] for g in group if g in by_id and by_id[g].get("_colorGroup")), None)
        if not existing_cg:
            gi += 1
            existing_cg = f"cg_{gi:04d}"
        merged = 0
        for g in group:
            if g in by_id:
                if by_id[g].get("_colorGroup") != existing_cg:
                    by_id[g]["_colorGroup"] = existing_cg
                    merged += 1
        if merged:
            print(f"  [known-merge] {existing_cg}: {group} ({merged}개 합침)")

    with open(PJ, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    print(f"\n[done] {gi}개 그룹, {assigned}개 상품에 _colorGroup 부여 (+ KNOWN_GROUPS 보강)")

if __name__ == "__main__":
    main()

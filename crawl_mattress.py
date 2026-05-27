# -*- coding: utf-8 -*-
"""매트리스 카테고리(1000000245)만 다시 크롤링.
1) 카테고리 페이지에서 상품 목록 추출
2) 색상/관리유형 변형 자동 발견 (셀프/방문 분리된 변형 포함)
3) 각 goodsId 상세 크롤링 (meta.json + 이미지)
4) products.json의 매트리스 항목 교체

사용: python crawl_mattress.py
"""
import os, sys, json, time
from playwright.sync_api import sync_playwright
from collect_products import scrape_category, expand_color_variants, BASE, UA
from crawl_details import process_one

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
PRODUCTS_JSON = os.path.join(DATA, "products.json")

DISP_CLSF_NO = "1000000245"
MATTRESS_URL = f"{BASE}/goods/indexGoodsList?dispClsfNo={DISP_CLSF_NO}&mstDispClsfNo=1000000182&dispLvl=2&menuNo=100501"


def log(*a):
    print(*a, flush=True)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=UA, viewport={"width": 1440, "height": 900})
        page = ctx.new_page()

        log("[1/4] 매트리스 카테고리 페이지 크롤링")
        cat = {"url": MATTRESS_URL, "dispClsfNo": DISP_CLSF_NO, "name": "매트리스"}
        items = scrape_category(page, cat)
        log(f"  → 발견 상품 {len(items)}개")
        for it in items:
            log(f"     - {it['goodsId']}: {it.get('model', '')} | {it.get('name', '')[:40]}")

        if not items:
            log("[err] 상품을 못 찾았어요. URL이나 본사 페이지 구조를 확인하세요.")
            browser.close()
            return

        products = {it['goodsId']: {**it, "categories": [DISP_CLSF_NO]} for it in items}

        log("\n[2/4] 색상/변형 자동 발견 (셀프/방문 분리 포함)")
        expand_color_variants(page, products)
        log(f"  → 변형 포함 총 {len(products)}개")

        log("\n[3/4] 각 상품 상세 + 이미지 크롤링")
        ok, fail = 0, 0
        for gid in sorted(products.keys()):
            log(f"  처리: {gid}")
            try:
                process_one(page, {"goodsId": gid}, force=True)
                ok += 1
            except Exception as e:
                log(f"    실패: {e}")
                fail += 1
        log(f"  → 성공 {ok}, 실패 {fail}")

        browser.close()

    log("\n[4/4] products.json 매트리스 항목 교체")
    if os.path.exists(PRODUCTS_JSON):
        with open(PRODUCTS_JSON, "r", encoding="utf-8") as f:
            db = json.load(f)
    else:
        db = {"products": [], "categories": []}

    # 기존 매트리스 카테고리에 속한 항목 제거 (다른 카테고리 멤버십은 보존)
    new_products = []
    for p in db.get("products", []):
        cats = p.get("categories", []) or []
        if DISP_CLSF_NO in cats:
            # 매트리스 카테고리만 빼고, 다른 카테고리에도 속하면 그대로 유지
            other = [c for c in cats if c != DISP_CLSF_NO]
            if other:
                p["categories"] = other
                new_products.append(p)
            # 매트리스에만 속한 거면 통째 삭제 (새로 받은 걸로 교체됨)
        else:
            new_products.append(p)

    # 새로 받은 매트리스 상품 추가
    for gid, item in products.items():
        new_products.append(item)

    # 카테고리 count 업데이트
    cats_list = db.get("categories", [])
    mat_cat_idx = next((i for i, c in enumerate(cats_list) if c.get("dispClsfNo") == DISP_CLSF_NO), None)
    if mat_cat_idx is not None:
        cats_list[mat_cat_idx]["count"] = len(products)
    else:
        cats_list.append({"name": "매트리스", "dispClsfNo": DISP_CLSF_NO, "count": len(products)})

    db["products"] = new_products
    db["categories"] = cats_list
    db["fetched_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    db["total"] = len(new_products)

    with open(PRODUCTS_JSON, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)

    log(f"\n[done] 매트리스 {len(products)}개 갱신, 전체 {len(new_products)}개 / products.json 저장")
    log("→ 다음 단계: python build_inline_db.py 실행해서 db.js 재생성")


if __name__ == "__main__":
    main()

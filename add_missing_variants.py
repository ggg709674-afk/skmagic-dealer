# -*- coding: utf-8 -*-
"""
누락된 색상 변형 상품을 본사 상세에서 정보 긁어 data/products.json 에 추가.

본사 카테고리 페이지가 색상 변형 중 대표 1개만 노출하는 경우,
나머지 변형 goodsId 들이 우리 DB에 없어 색상 picker가 동작 안 함.

사용:
  python add_missing_variants.py
  → MISSING 리스트의 각 goodsId 상세를 가져와 products.json에 머지.
  → base_id 의 카테고리/colors/name 을 그대로 상속, model/thumb 만 자기 것.
"""
from playwright.sync_api import sync_playwright
import json, os, sys, time

ROOT = os.path.dirname(os.path.abspath(__file__))
PRODUCTS_JSON = os.path.join(ROOT, "data", "products.json")
BASE = "https://www.skmagic.com"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

# (variant_id, base_id) — base_id의 카테고리/colors/name 상속
MISSING = [
    ("G000069641", "G000068401"),  # 원코크 얼음물 정수기 — 소프트핑크
    ("G000068407", "G000068401"),  # 원코크 얼음물 정수기 — 파스텔 세이지 그린
    ("G000068403", "G000068401"),  # 원코크 얼음물 정수기 — 파스텔 블루
]


def log(*a):
    print(*a, flush=True)


def fetch_variant(page, gid):
    """본사 상세에서 model, name, thumb, benefits, tag, prices 추출"""
    url = f"{BASE}/goods/indexGoodsDetail?goodsId={gid}"
    page.goto(url, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(2500)
    return page.evaluate(r"""
        (gid) => {
            const txt = el => (el ? (el.innerText || '').trim() : '');
            // 이름
            const name = txt(document.querySelector('.goodsName, .productName, .item-name02, h2'))
                      || (document.title || '').replace(/ - SK매직.*$/, '').trim();
            // 모델 — modelCode/modelName 또는 본문 내 영문대문자+숫자 패턴
            let model = txt(document.querySelector('.modelCode, .item-model02, .modelName'));
            if (!model) {
                // .goodsInfo, .productInfo 등에서 영문/숫자 모델코드 찾기
                const root = document.querySelector('.goodsInfo, .productInfo, .detail-info, body');
                const m = (root ? root.innerText : '').match(/\b[A-Z]{2,}[A-Z0-9-]{4,}\b/);
                model = m ? m[0] : '';
            }
            // 메인 썸네일 — bigThumbWrap 첫 이미지 또는 패턴 추정
            const bigImg = document.querySelector('.bigThumbWrap img, .smallThumbWrap img');
            let thumb = bigImg ? (bigImg.getAttribute('src') || '') : '';
            if (!thumb) thumb = `https://static.skmagic.com/image/goods/${gid}/${gid}_1_350x350.png`;
            // 가격 셀
            const prices = [...document.querySelectorAll('.price-data, .priceData, .product-price-cell')].map(cell => ({
                title: txt(cell.querySelector('.price-title')),
                del:   txt(cell.querySelector('del')),
                num:   txt(cell.querySelector('.num')),
            }));
            // 혜택/태그 — 상세에서 잘 안 잡히면 빈값 (base에서 상속)
            const benefits = [...document.querySelectorAll('.item-benefit02 span')].map(s => s.innerText.trim());
            const tag = txt(document.querySelector('.item_tag'));
            return { name, model, thumb, prices, benefits, tag };
        }
    """, gid)


def main():
    with open(PRODUCTS_JSON, encoding="utf-8") as f:
        db = json.load(f)
    by_id = {p["goodsId"]: p for p in db["products"]}

    to_add = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=UA, viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        for gid, base_id in MISSING:
            if gid in by_id:
                log(f"  [skip] {gid} 이미 있음")
                continue
            base = by_id.get(base_id)
            if not base:
                log(f"  [warn] base {base_id} 없음 — 스킵 {gid}")
                continue
            log(f"  [fetch] {gid} (base: {base_id})")
            try:
                v = fetch_variant(page, gid)
            except Exception as e:
                log(f"  [err] {gid}: {e}")
                continue
            # base 상속 + variant 덮어쓰기
            rec = {
                "goodsId": gid,
                "name": v["name"] or base.get("name", ""),
                "model": v["model"] or base.get("model", ""),
                "alt":   v["name"] or base.get("alt", ""),
                "thumb": v["thumb"] or base.get("thumb", "").replace(base_id, gid),
                "benefits": v["benefits"] or base.get("benefits", []),
                "tag":     v["tag"]     or base.get("tag", ""),
                "prices":  v["prices"]  or base.get("prices", []),
                "colors":  base.get("colors", []),  # 본사 카드의 color01~04 그대로
                "categories": base.get("categories", []),
            }
            log(f"     name={rec['name'][:40]}  model={rec['model']}")
            to_add.append(rec)
        browser.close()

    if not to_add:
        log("추가할 항목 없음")
        return

    db["products"].extend(to_add)
    db["total"] = len(db["products"])
    db["fetched_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    with open(PRODUCTS_JSON, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    log(f"[done] {len(to_add)}개 추가 -> data/products.json (total={db['total']})")
    log("다음: python crawl_details.py  &&  python build_inline_db.py")


if __name__ == "__main__":
    main()

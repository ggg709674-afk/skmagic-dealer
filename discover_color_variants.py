# -*- coding: utf-8 -*-
"""
누락된 색상 변형 자동 발견 + products.json에 추가.

본사 상세 페이지의 .item-color input[name=colorPick] 라디오를 순서대로 클릭하면
페이지가 다른 goodsId로 navigate된다. URL 변화에서 변형 ID들을 수집.

사용:
  python discover_color_variants.py [base_id1] [base_id2] ...
  → 인자 없으면 SAMPLES 기본값 사용.
  → 발견된 누락 ID들 메타 정보까지 가져와 products.json 업데이트.
  → 그 다음 crawl_details/crawl_specs/build_inline_db 자동 실행.
"""
from playwright.sync_api import sync_playwright
import json, os, sys, re, time, subprocess

ROOT = os.path.dirname(os.path.abspath(__file__))
PRODUCTS_JSON = os.path.join(ROOT, "data", "products.json")
BASE = "https://www.skmagic.com"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

# 의심 그룹의 sample (sib < ofc 감지된 것들)
SAMPLES = [
    "G000069846",  # 정수기
    "G000069527",  # 정수기
    "G000069311",  # 정수기
    "G000069142",  # 공기청정기
    "G000067189",  # 공기청정기
]


def log(*a):
    print(*a, flush=True)


def find_variants(page, base_id):
    """base_id 페이지에서 모든 color radio 순차 클릭 → URL의 goodsId 수집.
    Playwright 표준 click이 막히면 JS로 직접 label/input.click() 호출."""
    url = f"{BASE}/goods/indexGoodsDetail?goodsId={base_id}"
    page.goto(url, wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(2500)
    # 색상 영역까지 스크롤 — lazy/visibility 이슈 회피
    page.evaluate("() => { const el = document.querySelector('.item-color'); if (el) el.scrollIntoView({block:'center'}); }")
    page.wait_for_timeout(500)
    radio_ids = page.evaluate(
        "() => [...document.querySelectorAll('.item-color input[name=colorPick]')].map(i => i.id).filter(Boolean)"
    )
    log(f"  radio ids: {radio_ids}")
    found = {base_id}
    if len(radio_ids) <= 1:
        return found
    for cid in radio_ids:
        try:
            # JS로 직접 label 클릭 — visibility 무시
            clicked = page.evaluate(
                "(cid) => { const el = document.querySelector(`label[for=${cid}]`) || document.getElementById(cid); if (el) { el.click(); return true; } return false; }",
                cid
            )
            if not clicked:
                log(f"    {cid}: 셀렉터 매치 실패")
                continue
            page.wait_for_load_state("domcontentloaded", timeout=10000)
            page.wait_for_timeout(800)
            m = re.search(r"goodsId=(G\d+)", page.url)
            if m:
                found.add(m.group(1))
            page.goto(url, wait_until="domcontentloaded", timeout=20000)
            page.wait_for_timeout(1200)
            page.evaluate("() => { const el = document.querySelector('.item-color'); if (el) el.scrollIntoView({block:'center'}); }")
            page.wait_for_timeout(400)
        except Exception as e:
            log(f"    {cid} 실패: {e}")
    return found


def fetch_variant_meta(page, gid):
    """누락 변형의 본사 상세에서 기본 정보 추출."""
    page.goto(f"{BASE}/goods/indexGoodsDetail?goodsId={gid}", wait_until="domcontentloaded", timeout=45000)
    page.wait_for_timeout(2300)
    return page.evaluate(r"""
        (gid) => {
            const txt = el => (el ? (el.innerText || '').trim() : '');
            const name = txt(document.querySelector('.goodsName, .productName, .item-name02, h2'))
                      || (document.title || '').replace(/ - SK매직.*$/, '').trim();
            let model = txt(document.querySelector('.modelCode, .item-model02, .modelName'));
            if (!model) {
                const root = document.querySelector('.goodsInfo, .productInfo, .detail-info, body');
                const m = (root ? root.innerText : '').match(/\b[A-Z]{2,}[A-Z0-9-]{4,}\b/);
                model = m ? m[0] : '';
            }
            const bigImg = document.querySelector('.bigThumbWrap img, .smallThumbWrap img');
            let thumb = bigImg ? (bigImg.getAttribute('src') || '') : '';
            if (!thumb) thumb = `https://static.skmagic.com/image/goods/${gid}/${gid}_1_350x350.png`;
            const prices = [...document.querySelectorAll('.price-data, .priceData, .product-price-cell')].map(cell => ({
                title: txt(cell.querySelector('.price-title')),
                del:   txt(cell.querySelector('del')),
                num:   txt(cell.querySelector('.num')),
            }));
            const benefits = [...document.querySelectorAll('.item-benefit02 span')].map(s => s.innerText.trim());
            const tag = txt(document.querySelector('.item_tag'));
            return { name, model, thumb, prices, benefits, tag };
        }
    """, gid)


def main():
    samples = sys.argv[1:] if len(sys.argv) > 1 else SAMPLES
    with open(PRODUCTS_JSON, encoding="utf-8") as f:
        db = json.load(f)
    by_id = {p["goodsId"]: p for p in db["products"]}

    to_add = []
    discovered_all = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=UA, viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        for sample in samples:
            log(f"\n[{sample}] 색상 변형 탐색")
            base = by_id.get(sample)
            if not base:
                log(f"  [warn] {sample} DB에 없음 — 스킵")
                continue
            try:
                variants = find_variants(page, sample)
            except Exception as e:
                log(f"  [err] find_variants: {e}")
                continue
            new_ids = [v for v in variants if v not in by_id]
            log(f"  발견: {sorted(variants)} → 누락: {new_ids}")
            discovered_all[sample] = list(variants)
            for gid in new_ids:
                try:
                    v = fetch_variant_meta(page, gid)
                except Exception as e:
                    log(f"  [err] meta {gid}: {e}")
                    continue
                rec = {
                    "goodsId": gid,
                    "name": v["name"] or base.get("name", ""),
                    "model": v["model"] or base.get("model", ""),
                    "alt":   v["name"] or base.get("alt", ""),
                    "thumb": v["thumb"] or base.get("thumb", "").replace(sample, gid),
                    "benefits": v["benefits"] or base.get("benefits", []),
                    "tag":     v["tag"]     or base.get("tag", ""),
                    "prices":  v["prices"]  or base.get("prices", []),
                    "colors":  base.get("colors", []),
                    "categories": base.get("categories", []),
                }
                log(f"     + {gid}  model={rec['model']}")
                to_add.append(rec)
                by_id[gid] = rec  # 같은 변형이 다른 sample에서도 발견될 때 중복 추가 방지
        browser.close()

    log(f"\n=== 발견 요약 ===")
    for s, ids in discovered_all.items():
        log(f"  {s}: {len(ids)}개 → {sorted(ids)}")

    if not to_add:
        log("\n[done] 추가할 항목 없음")
        return

    db["products"].extend(to_add)
    db["total"] = len(db["products"])
    db["fetched_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    with open(PRODUCTS_JSON, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    log(f"[products.json] +{len(to_add)}개 → total={db['total']}")

    # 후속 파이프라인 자동 실행
    log("\n=== crawl_details.py 실행 ===")
    subprocess.run([sys.executable, "crawl_details.py"], cwd=ROOT, check=False)
    log("\n=== crawl_specs.py 실행 ===")
    subprocess.run([sys.executable, "crawl_specs.py"], cwd=ROOT, check=False)
    log("\n=== build_inline_db.py 실행 ===")
    subprocess.run([sys.executable, "build_inline_db.py"], cwd=ROOT, check=False)
    log("\n[ALL DONE]")


if __name__ == "__main__":
    main()

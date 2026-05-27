# -*- coding: utf-8 -*-
"""
SK매직 전체 카테고리 + 상품 목록 수집기
1) 메인에서 GNB 메뉴 펼쳐서 모든 카테고리 URL 추출
2) 각 카테고리 페이지를 돌면서 .product-items 다 긁어 products.json 생성
3) **색상 변형 자동 발견** — 본사가 카테고리에 대표 1개만 노출하는 경우
   대표 상세 페이지의 .item-color 라디오를 클릭해서 다른 색상 goodsId 모두 발견,
   누락된 변형은 본사 상세에서 카드 정보 긁어 추가. 같은 그룹 모두에 _colorGroup 부여.
"""
from playwright.sync_api import sync_playwright
import json, os, re, time

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(ROOT, "data")
os.makedirs(OUT, exist_ok=True)

BASE = "https://www.skmagic.com"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"


def log(*a):
    print(*a, flush=True)


def discover_categories(page):
    """GNB 메뉴 hover/click 해서 모든 카테고리 URL을 찾는다."""
    log("[discover] 메인 페이지 진입")
    page.goto(BASE, wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(2500)

    # 모든 GNB 링크 — 메뉴 hover 안 해도 dom에 다 있는 경우가 많음
    raw = page.eval_on_selector_all(
        "a[href*=indexGoodsList]",
        "els => els.map(e => ({href:e.getAttribute('href'), text:(e.innerText||'').trim()}))"
    )
    log(f"[discover] indexGoodsList 링크 {len(raw)}개 발견")

    seen, out = set(), []
    for r in raw:
        href = r["href"] or ""
        if not href.startswith("/"):
            # 절대URL이면 도메인 떼고
            m = re.search(r"https?://[^/]+(/.*)", href)
            href = m.group(1) if m else href
        # dispClsfNo 만 있는 게 카테고리. 한 카테고리는 dispClsfNo + (menuNo) 조합.
        m = re.search(r"dispClsfNo=(\d+)", href)
        if not m:
            continue
        cls = m.group(1)
        # goodsFilterList(서브필터)는 카테고리 안 세부니까 같이 모음
        mfilt = re.search(r"goodsFilterList=(\d+)", href)
        mmenu = re.search(r"menuNo=(\d+)", href)
        key = (cls, mfilt.group(1) if mfilt else None, mmenu.group(1) if mmenu else None)
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "name": r["text"] or "",
            "dispClsfNo": cls,
            "menuNo": mmenu.group(1) if mmenu else None,
            "goodsFilterList": mfilt.group(1) if mfilt else None,
            "url": BASE + href if href.startswith("/") else href,
        })
    return out


def scrape_category(page, cat):
    """한 카테고리 페이지에서 .product-items 다 긁기"""
    page.goto(cat["url"], wait_until="domcontentloaded", timeout=60000)
    page.wait_for_timeout(1500)

    # 페이지 끝까지 스크롤 (lazy 이미지 대응)
    try:
        page.evaluate("""
            return new Promise(resolve => {
                let y = 0;
                const step = () => {
                    window.scrollBy(0, 800);
                    y += 800;
                    if (y < document.body.scrollHeight && y < 20000) setTimeout(step, 80);
                    else resolve();
                };
                step();
            });
        """)
    except Exception:
        pass
    page.wait_for_timeout(500)

    items = page.evaluate(r"""
        () => {
            const out = [];
            document.querySelectorAll('.product-items').forEach(card => {
                const a = card.querySelector('a[href*=indexGoodsDetail]');
                const href = a ? a.getAttribute('href') : '';
                const m = href.match(/goodsId=(G\d+)/);
                if (!m) return;
                const goodsId = m[1];
                const img = card.querySelector('.product-thumb-wrap img');
                const imgSrc = img ? img.getAttribute('src') : '';
                const alt = img ? img.getAttribute('alt') : '';
                const model = (card.querySelector('.item-model02') || {}).innerText || '';
                const name = (card.querySelector('.item-name02 a') || card.querySelector('.item-name02') || {}).innerText || '';
                const benefits = [...card.querySelectorAll('.item-benefit02 span')].map(s => s.innerText.trim());
                const tag = (card.querySelector('.item_tag') || {}).innerText || '';
                const priceCells = [...card.querySelectorAll('.product-price-cell')].map(cell => ({
                    title: (cell.querySelector('.price-title') || {}).innerText || '',
                    del:   (cell.querySelector('del') || {}).innerText || '',
                    num:   (cell.querySelector('.num') || {}).innerText || '',
                }));
                const colors = [...card.querySelectorAll('.color-options .color-circle')].map(c => ({
                    color: c.getAttribute('data-color') || '',
                    style: c.getAttribute('style') || '',
                }));
                out.push({
                    goodsId, name: name.trim(), model: model.trim().split('\n')[0],
                    alt, thumb: imgSrc, benefits, tag: tag.trim(),
                    prices: priceCells, colors
                });
            });
            return out;
        }
    """)
    return items


def find_color_variants(page, gid):
    """본사 상세의 .item-color 라디오를 순차 클릭해서 같은 색상 그룹의 모든 goodsId 발견.
    라디오 클릭 → 페이지가 다른 goodsId로 navigate되는 본사 동작을 이용."""
    url = f"{BASE}/goods/indexGoodsDetail?goodsId={gid}"
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(2200)
        page.evaluate("() => { const el = document.querySelector('.item-color'); if (el) el.scrollIntoView({block:'center'}); }")
        page.wait_for_timeout(400)
        radio_ids = page.evaluate(
            "() => [...document.querySelectorAll('.item-color input[name=colorPick]')].map(i => i.id).filter(Boolean)"
        )
    except Exception as e:
        log(f"    [colors] goto/inspect fail {gid}: {e}")
        return {gid}
    found = {gid}
    if len(radio_ids) <= 1:
        return found
    for cid in radio_ids:
        try:
            clicked = page.evaluate(
                "(cid) => { const el = document.querySelector(`label[for=${cid}]`) || document.getElementById(cid); if (el) { el.click(); return true; } return false; }",
                cid
            )
            if not clicked:
                continue
            page.wait_for_load_state("domcontentloaded", timeout=10000)
            page.wait_for_timeout(700)
            m = re.search(r"goodsId=(G\d+)", page.url)
            if m:
                found.add(m.group(1))
            page.goto(url, wait_until="domcontentloaded", timeout=20000)
            page.wait_for_timeout(900)
            page.evaluate("() => { const el = document.querySelector('.item-color'); if (el) el.scrollIntoView({block:'center'}); }")
            page.wait_for_timeout(300)
        except Exception:
            continue
    return found


def fetch_variant_card_info(page, gid):
    """누락 변형의 본사 상세에서 카드와 호환되는 필드(name, model, thumb, prices...) 추출."""
    try:
        page.goto(f"{BASE}/goods/indexGoodsDetail?goodsId={gid}", wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(2300)
    except Exception:
        return None
    return page.evaluate(r"""
        (gid) => {
            const txt = el => (el ? (el.innerText || '').trim() : '');
            const name = txt(document.querySelector('.goodsName, .productName, .item-name02, h2'))
                      || (document.title || '').replace(/ - SK매직.*$/, '').trim();
            // pageTitle 의 "| MODEL | SK매직몰" 패턴이 가장 정확.
            // .item-model02 셀렉터는 추천 상품 카드 모델을 잡는 버그가 있어 fallback으로만 사용.
            const titleM = (document.title || '').match(/\|\s*([A-Z]{2,}[A-Z0-9-]{4,})\s*\|\s*SK매직몰/);
            let model = titleM ? titleM[1] : txt(document.querySelector('.modelCode, .item-model02, .modelName'));
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
            // 카드와 같은 colors 형식
            const colors = [...document.querySelectorAll('.item-color input[name=colorPick]')].map(inp => {
                const lab = document.querySelector(`label[for=${inp.id}]`);
                return {
                    color: inp.id,
                    style: lab ? (lab.getAttribute('style') || '') : '',
                };
            });
            const benefits = [...document.querySelectorAll('.item-benefit02 span')].map(s => s.innerText.trim());
            const tag = txt(document.querySelector('.item_tag'));
            return { name, model, thumb, prices, benefits, tag, colors };
        }
    """, gid)


def expand_color_variants(page, products):
    """카드 colors 가 있는 상품을 시작점으로 색상 그룹 발견 + 누락 변형 추가.
    같은 그룹 모든 goodsId에 동일한 _colorGroup 키 부여 (app.js 그룹핑 안정성)."""
    candidates = sorted([gid for gid, p in products.items() if len(p.get("colors", [])) >= 1])
    log(f"[colors] 탐색 후보(colors>=1): {len(candidates)}개")
    explored = set()
    added = 0
    group_idx = 0
    for seed in candidates:
        if seed in explored:
            continue
        try:
            variants = find_color_variants(page, seed)
        except Exception as e:
            log(f"  [colors] {seed}: {e}")
            explored.add(seed)
            continue
        explored.update(variants)
        if len(variants) <= 1:
            continue
        group_idx += 1
        group_key = f"cg_{group_idx:04d}"
        # 카테고리·name·model prefix 공유를 위해 seed 정보 사용
        seed_p = products[seed]
        base_cats = list(seed_p.get("categories", []))
        for vid in sorted(variants):
            if vid in products:
                # 기존 카드에 그룹 키 부여 + 카테고리 머지
                products[vid]["_colorGroup"] = group_key
                for c in base_cats:
                    if c not in products[vid]["categories"]:
                        products[vid]["categories"].append(c)
                continue
            # 누락 — 본사 상세에서 정보 긁어 추가
            v = fetch_variant_card_info(page, vid)
            if not v:
                log(f"  [colors] {vid} 메타 실패 — 스킵")
                continue
            products[vid] = {
                "goodsId": vid,
                "name": v["name"] or seed_p.get("name", ""),
                "model": v["model"] or seed_p.get("model", ""),
                "alt":   v["name"] or seed_p.get("alt", ""),
                "thumb": v["thumb"] or seed_p.get("thumb", "").replace(seed, vid),
                "benefits": v["benefits"] or seed_p.get("benefits", []),
                "tag":     v["tag"]     or seed_p.get("tag", ""),
                "prices":  v["prices"]  or seed_p.get("prices", []),
                "colors":  v["colors"]  or seed_p.get("colors", []),
                "categories": list(base_cats),
                "_colorGroup": group_key,
                "_addedByColorExpand": True,
            }
            added += 1
            log(f"  [colors] +{vid} (group {group_key} from {seed}) model={products[vid]['model']}")
    log(f"[colors] 자동 추가 총 {added}개, 그룹 {group_idx}개")
    return added


def main():
    products = {}  # goodsId -> info (중복 제거)
    cats_info = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent=UA,
            viewport={"width": 1440, "height": 900},
        )
        page = ctx.new_page()

        cats = discover_categories(page)
        # menuNo 4자리 이상(서브카테고리)만 의미있음 - 1자리/없음은 메인탭 가능성
        cats = [c for c in cats if c["menuNo"] and len(c["menuNo"]) >= 4]
        log(f"[discover] 유효 카테고리(menuNo>=4자리) {len(cats)}개")

        # dispClsfNo로 dedupe — 같은 dispClsfNo면 같은 상품 set이라 가장 짧은 menuNo만 사용
        by_cls = {}
        for c in cats:
            k = c["dispClsfNo"]
            if k not in by_cls or len(c["menuNo"]) < len(by_cls[k]["menuNo"]):
                by_cls[k] = c
        cats = list(by_cls.values())
        log(f"[discover] dispClsfNo 중복 제거 후: {len(cats)}개")

        for i, c in enumerate(cats, 1):
            log(f"[{i}/{len(cats)}] {c['name'][:30]} ({c['dispClsfNo']})")
            try:
                items = scrape_category(page, c)
            except Exception as e:
                log(f"  [err] {e}")
                items = []
            log(f"   -> {len(items)}개 상품")
            cats_info.append({**c, "count": len(items)})
            for it in items:
                gid = it["goodsId"]
                if gid not in products:
                    products[gid] = {**it, "categories": [c["dispClsfNo"]]}
                else:
                    if c["dispClsfNo"] not in products[gid]["categories"]:
                        products[gid]["categories"].append(c["dispClsfNo"])

        # === 색상 변형 자동 발견 ===
        # 카테고리 페이지가 대표 1개만 노출해도, 본사 상세의 라디오에서 모든 sibling 발견.
        log(f"\n[color-expand] 시작 (현재 {len(products)}개)")
        expand_color_variants(page, products)
        log(f"[color-expand] 완료 (최종 {len(products)}개)")

        browser.close()

    out = {
        "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
        "categories": cats_info,
        "products": list(products.values()),
        "total": len(products),
    }
    with open(os.path.join(OUT, "products.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    log(f"\n[done] 총 {len(products)}개 상품, {len(cats_info)}개 카테고리 -> data/products.json")


if __name__ == "__main__":
    main()

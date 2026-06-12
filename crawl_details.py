# -*- coding: utf-8 -*-
"""
SK매직 상품 상세페이지 크롤러
- data/products.json 의 goodsId 목록을 순회
- 각 상품마다 products/<goodsId>/ 폴더 생성
  - detail.html : 원본 HTML
  - meta.json   : 추출된 메타데이터 (가격/스펙/이미지 URL 등)
  - images/     : 메인 이미지 + 인포그래픽 이미지 (자체 호스팅용)
"""
from playwright.sync_api import sync_playwright
import json, os, re, time, urllib.request, urllib.parse, hashlib, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data")
PRODUCTS_DIR = os.path.join(ROOT, "products")
os.makedirs(PRODUCTS_DIR, exist_ok=True)

BASE = "https://www.skmagic.com"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"


def log(*a):
    print(*a, flush=True)


def safe_filename(url):
    parsed = urllib.parse.urlparse(url)
    name = os.path.basename(parsed.path)
    if not name or "." not in name:
        # 확장자 없으면 hash + .bin
        h = hashlib.md5(url.encode()).hexdigest()[:10]
        name = f"file_{h}.bin"
    return name


def download(url, out_path, retries=2):
    if os.path.exists(out_path) and os.path.getsize(out_path) > 100:
        return True
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": BASE + "/"})
    last_err = None
    for _ in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            os.makedirs(os.path.dirname(out_path), exist_ok=True)
            with open(out_path, "wb") as f:
                f.write(data)
            return True
        except Exception as e:
            last_err = e
            time.sleep(0.4)
    log(f"  [dl-fail] {url} -> {last_err}")
    return False


def extract_detail(page, goodsId):
    """상세 페이지에서 메타 추출"""
    return page.evaluate(r"""
        (goodsId) => {
            const txt = el => (el ? (el.innerText || '').trim() : '');
            const attr = (el, a) => (el ? (el.getAttribute(a) || '') : '');

            // 메인 슬라이더 이미지(중복 제거)
            // .bigThumbWrap은 "현재 큰 영역에 표시된" 이미지(마지막 선택된 것일 수 있음)라
            // 그것만 먼저 잡히면 순서가 꼬임. 파일명 끝 인덱스(_12, _13, ..)로 본사 노출 순서 복원.
            const main_imgs = [];
            const seen_m = new Set();
            document.querySelectorAll('.bigThumbWrap img, .smallThumbWrap img').forEach(im => {
                const s = im.getAttribute('src') || '';
                if (s && !seen_m.has(s) && s.includes(goodsId)) { seen_m.add(s); main_imgs.push(s); }
            });
            const idxRx = /_(\d+)(?:_\d+x\d+)?\.(?:png|jpe?g|gif)$/i;
            main_imgs.sort((a, b) => {
                const ma = a.match(idxRx), mb = b.match(idxRx);
                return (ma ? parseInt(ma[1], 10) : 9999) - (mb ? parseInt(mb[1], 10) : 9999);
            });

            // 상세 인포그래픽: id="goodsDetailInfo" 안의 img + video (문서 순서 유지)
            // 26.5월부터 본사가 애니메이션 컷을 gif <img> 대신 <video src=*.mp4> 로 제공 —
            // img만 수집하면 동영상 컷이 통째로 빠진다 (mini 등록 때 발견)
            const detail_imgs = [];
            const seen_d = new Set();
            const detail_root = document.querySelector('#goodsDetailInfo') || document.querySelector('.detailInfo') || document.body;
            detail_root.querySelectorAll('img, video').forEach(el => {
                let s = el.getAttribute('src') || '';
                if (!s && el.tagName === 'VIDEO') {
                    const so = el.querySelector('source');
                    s = so ? (so.getAttribute('src') || '') : '';
                }
                if (!s) return;
                if (!s.includes('skmagic')) return;
                // 메인이미지/아이콘 제외
                if (s.includes('/image/icon/')) return;
                if (s.includes('/pc/asset/images/')) return;
                if (seen_d.has(s)) return;
                seen_d.add(s);
                detail_imgs.push(s);
            });

            // 가격
            const price_cells = [...document.querySelectorAll('.price-data, .priceData')].map(cell => ({
                title: txt(cell.querySelector('.price-title')),
                del:   txt(cell.querySelector('del')),
                num:   txt(cell.querySelector('.num')),
            }));

            // 이름/모델
            // 모델은 pageTitle 의 "| MODEL | SK매직몰" 패턴이 가장 정확.
            // 본사 상세 페이지에 추천 상품 카드의 .item-model02 가 같이 렌더돼서
            // querySelector('.item-model02') 가 본인 모델 대신 추천 상품 모델을 잡는 버그가 있었음.
            const name = txt(document.querySelector('.goodsName, .productName, .item-name02, h2')) || document.title;
            const titleModelMatch = (document.title || '').match(/\|\s*([A-Z]{2,}[A-Z0-9-]{4,})\s*\|\s*SK매직몰/);
            const model = titleModelMatch
                ? titleModelMatch[1]
                : txt(document.querySelector('.modelCode, .item-model02, .modelName'));

            // 스펙 테이블 (있으면)
            const specs = [];
            document.querySelectorAll('table.spec_tbl tr, .specTable tr, .infoTable tr').forEach(tr => {
                const th = tr.querySelector('th'); const td = tr.querySelector('td');
                if (th && td) specs.push({k: txt(th), v: txt(td)});
            });

            // 페이지 타이틀
            return {
                goodsId, name, model,
                main_images: main_imgs,
                detail_images: detail_imgs,
                prices: price_cells,
                specs,
                pageTitle: document.title,
            };
        }
    """, goodsId)


def process_one(page, prod, force=False):
    gid = prod["goodsId"]
    out_dir = os.path.join(PRODUCTS_DIR, gid)
    meta_path = os.path.join(out_dir, "meta.json")
    if os.path.exists(meta_path) and not force:
        log(f"  [skip] {gid} 이미 있음")
        return True
    os.makedirs(out_dir, exist_ok=True)
    url = f"{BASE}/goods/indexGoodsDetail?goodsId={gid}"
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(3500)
        # 상세영역까지 스크롤(lazy 이미지)
        try:
            page.evaluate("""
                () => new Promise(res => {
                    let y = 0;
                    const f = () => {
                        window.scrollBy(0, 1200); y += 1200;
                        if (y < document.body.scrollHeight && y < 30000) setTimeout(f, 100);
                        else { window.scrollTo(0,0); res(); }
                    }; f();
                });
            """)
        except Exception:
            pass
        page.wait_for_timeout(800)
    except Exception as e:
        log(f"  [nav-fail] {gid}: {e}")
        return False

    html = page.content()
    with open(os.path.join(out_dir, "detail.html"), "w", encoding="utf-8") as f:
        f.write(html)

    meta = extract_detail(page, gid)
    meta["source_url"] = url
    meta["fetched_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")

    # 재크롤(force) 시 별도 크롤러가 채운 필드 보존 — crawl_options(options),
    # crawl_specs(specs), crawl_mattress_sizes(specs_by_size). 안 하면 force 재크롤마다 날아감.
    if os.path.exists(meta_path):
        try:
            with open(meta_path, encoding="utf-8") as f:
                old = json.load(f)
            for k in ("options", "specs_by_size"):
                if k in old and k not in meta:
                    meta[k] = old[k]
            if not meta.get("specs") and old.get("specs"):
                meta["specs"] = old["specs"]
        except Exception:
            pass

    # 이미지 다운로드
    img_dir = os.path.join(out_dir, "images")
    os.makedirs(img_dir, exist_ok=True)
    ok_main, ok_detail = 0, 0
    for u in meta["main_images"]:
        if download(u, os.path.join(img_dir, "main_" + safe_filename(u))):
            ok_main += 1
    for i, u in enumerate(meta["detail_images"]):
        # 상세 인포는 보통 매우 김 — 순서 보존
        fname = f"detail_{i:02d}_{safe_filename(u)}"
        if download(u, os.path.join(img_dir, fname)):
            ok_detail += 1
    meta["downloaded"] = {"main": ok_main, "detail": ok_detail}

    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    log(f"  [ok] {gid} {meta.get('name','')[:30]} | 메인 {ok_main}/{len(meta['main_images'])}장, 상세 {ok_detail}/{len(meta['detail_images'])}장")
    return True


def main():
    products_path = os.path.join(DATA, "products.json")
    if not os.path.exists(products_path):
        log("data/products.json 이 없어. 먼저 collect_products.py 돌려.")
        sys.exit(1)
    with open(products_path, encoding="utf-8") as f:
        db = json.load(f)
    items = db["products"]
    log(f"총 {len(items)}개 상품 처리 시작")

    # 선택적 인자: 처음 N개만
    limit = None
    if len(sys.argv) > 1:
        try: limit = int(sys.argv[1])
        except: pass
    if limit: items = items[:limit]; log(f"  (limit {limit} 적용)")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=UA, viewport={"width":1440,"height":900})
        page = ctx.new_page()
        for i, prod in enumerate(items, 1):
            log(f"[{i}/{len(items)}] {prod['goodsId']} {prod.get('name','')[:30]}")
            try:
                process_one(page, prod)
            except Exception as e:
                log(f"  [err] {e}")
        browser.close()
    log("[done] 상세 크롤 완료")


if __name__ == "__main__":
    main()

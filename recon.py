# -*- coding: utf-8 -*-
"""
SK매직 사이트 정찰 스크립트
- 정수기 카테고리 페이지를 열어서 AJAX 요청 가로채기
- 상품 카드 셀렉터 파악
- 상세페이지 1개도 까봄
"""
from playwright.sync_api import sync_playwright
import json, sys, os, re

OUT_DIR = os.path.dirname(os.path.abspath(__file__))
os.makedirs(os.path.join(OUT_DIR, "recon"), exist_ok=True)

def log(*a):
    print(*a, flush=True)

def main():
    captured = []  # 모든 네트워크 응답
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
            viewport={"width": 1440, "height": 900},
        )
        page = ctx.new_page()

        def on_response(resp):
            try:
                url = resp.url
                ct = resp.headers.get("content-type", "")
                if "json" in ct.lower() or url.endswith(".json"):
                    body = None
                    try:
                        body = resp.json()
                    except Exception:
                        try:
                            body = resp.text()[:500]
                        except Exception:
                            body = None
                    captured.append({"url": url, "status": resp.status, "ct": ct, "body_sample": body})
            except Exception as e:
                pass

        page.on("response", on_response)

        # 1) 정수기 카테고리
        cat_url = "https://www.skmagic.com/goods/indexGoodsList?dispClsfNo=100000005&mstDispClsfNo=100000003&dispLvl=2&menuNo=1001"
        log("[1] 카테고리 페이지 로드:", cat_url)
        page.goto(cat_url, wait_until="networkidle", timeout=60000)
        page.wait_for_timeout(2000)

        # HTML 덤프
        html = page.content()
        with open(os.path.join(OUT_DIR, "recon", "category.html"), "w", encoding="utf-8") as f:
            f.write(html)
        log("  -> category.html 저장 (size=%d)" % len(html))

        # 상품 카드 후보 셀렉터 시도
        for sel in [
            ".prd_list li", ".prd-list li", "ul.prd_list li",
            ".goods_list li", ".goods-list li", "[class*=prod] li",
            ".item_box", ".goods_item", "li[data-goods-id]", "a[href*=indexGoodsDetail]"
        ]:
            try:
                cnt = page.locator(sel).count()
                if cnt > 0:
                    log(f"  [match] {sel} -> {cnt}개")
            except Exception:
                pass

        # 상품 URL 모으기
        hrefs = page.eval_on_selector_all(
            "a[href*=indexGoodsDetail]",
            "els => els.map(e => e.getAttribute('href'))"
        )
        log("  [a tag] indexGoodsDetail 링크: %d개" % len(hrefs))
        for h in hrefs[:5]:
            log("    -", h)

        # 2) 상세페이지 (첫번째 goodsId 자동 추출)
        gid = None
        for h in hrefs:
            m = re.search(r"goodsId=(G\d+)", h or "")
            if m:
                gid = m.group(1)
                break
        if not gid:
            gid = "G000069847"  # fallback

        detail_url = f"https://www.skmagic.com/goods/indexGoodsDetail?goodsId={gid}"
        log("[2] 상세 페이지 로드:", detail_url)
        try:
            page.goto(detail_url, wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(4000)  # 추가 JS 로딩 대기
        except Exception as e:
            log("  [warn] 상세 로딩 일부 실패:", str(e)[:100])

        d_html = page.content()
        with open(os.path.join(OUT_DIR, "recon", "detail.html"), "w", encoding="utf-8") as f:
            f.write(d_html)
        log("  -> detail.html 저장 (size=%d)" % len(d_html))

        # 상세 이미지 셀렉터 후보
        for sel in [".goods_view img", ".prd_detail img", ".detail_area img",
                    ".tab_cont img", "#goodsDetail img", "img[src*=static.skmagic.com]"]:
            try:
                cnt = page.locator(sel).count()
                if cnt > 0:
                    log(f"  [match] {sel} -> {cnt}개")
            except Exception:
                pass

        # 캡처한 JSON 응답 저장
        with open(os.path.join(OUT_DIR, "recon", "network.json"), "w", encoding="utf-8") as f:
            json.dump(captured, f, ensure_ascii=False, indent=2, default=str)
        log("[3] 네트워크 JSON 응답: %d건 -> recon/network.json" % len(captured))

        # 흥미로운 엔드포인트만 추려서 출력
        log("\n=== 흥미로운 엔드포인트 (skmagic.com 도메인) ===")
        seen = set()
        for c in captured:
            u = c["url"].split("?")[0]
            if "skmagic.com" in u and u not in seen:
                seen.add(u)
                log("  [%d] %s" % (c["status"], u))

        browser.close()

if __name__ == "__main__":
    main()

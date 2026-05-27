# -*- coding: utf-8 -*-
"""모델명으로 본사 검색 → goodsId 찾기.
사용: python find_by_model.py WPUTDC104RNW WPUTDF104RNW
"""
import sys, re
from playwright.sync_api import sync_playwright

BASE = "https://www.skmagic.com"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

def main():
    models = sys.argv[1:]
    if not models:
        print("usage: python find_by_model.py <MODEL> [MODEL2 ...]")
        sys.exit(1)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=UA, viewport={"width":1440,"height":900})
        page = ctx.new_page()
        for m in models:
            # 1) 본사 검색 페이지로 진입 (JS 렌더 대기)
            page.goto(f"{BASE}/total/indexTotalSearch?searchWord={m}", wait_until="networkidle", timeout=45000)
            page.wait_for_timeout(4000)
            html = page.content()
            ids = sorted(set(re.findall(r"goodsId=(G\d+)", html)))
            # 검색 결과에서 상품명/모델명 가까이 있는 goodsId만 — 모든 goodsId가 jumbled 되면 추천 상품 포함됨
            # 휴리스틱: 모델명이 텍스트로 함께 등장하는 카드 인덱스만 추출
            cards = re.findall(r'href="/goods/indexGoodsDetail\?goodsId=(G\d+)[^"]*"[^>]*>(?:[^<]|<(?!/a>)){0,800}', html)
            print(f"  [{m}] 검색결과 페이지에서 {len(ids)} goodsId, 카드 {len(cards)}개")
            # 카드 내용에 모델명이 보이는 것만
            relevant = []
            for cid in set(cards):
                # 카드별 substring 검사 (간단)
                idx = html.find(f'goodsId={cid}')
                ctx = html[max(0,idx-200):idx+1500]
                if m in ctx:
                    relevant.append(cid)
            print(f"    -> 모델명 매칭 goodsId: {sorted(set(relevant))}")
        browser.close()

if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""의심 그룹들의 .item-color outerHTML 까서 라디오 ID 패턴 확인."""
from playwright.sync_api import sync_playwright

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
BASE = "https://www.skmagic.com"

TARGETS = ["G000069846", "G000069527", "G000069311", "G000067189"]

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=UA, viewport={"width":1440,"height":900})
        page = ctx.new_page()
        for gid in TARGETS:
            print(f"\n=== {gid} ===")
            page.goto(f"{BASE}/goods/indexGoodsDetail?goodsId={gid}", wait_until="domcontentloaded", timeout=45000)
            page.wait_for_timeout(2500)
            html = page.evaluate("""
                () => {
                    const el = document.querySelector('.item-color');
                    if (!el) return '(.item-color not found)';
                    // 모든 input의 id 모음
                    const ids = [...el.querySelectorAll('input')].map(i => i.id || '(no id)');
                    return JSON.stringify({ outer: el.outerHTML.slice(0, 1500), inputIds: ids });
                }
            """)
            print(html[:2000])
        browser.close()

if __name__ == "__main__":
    main()

# -*- coding: utf-8 -*-
"""특정 seed goodsId의 본사 detail 페이지에서 .item-color 라디오를 순회하면서
모든 sibling goodsId + 라디오 색(style/title) 을 수집해 JSON 으로 출력.

사용: python fetch_color_group.py G000069282
"""
import sys, re, json, time
from playwright.sync_api import sync_playwright

BASE = "https://www.skmagic.com"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

def main():
    if len(sys.argv) < 2:
        print("usage: python fetch_color_group.py <goodsId>")
        sys.exit(1)
    seed = sys.argv[1].strip()
    url = f"{BASE}/goods/indexGoodsDetail?goodsId={seed}"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=UA, viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(2500)
        page.evaluate("() => { const el = document.querySelector('.item-color'); if (el) el.scrollIntoView({block:'center'}); }")
        page.wait_for_timeout(500)

        # 라디오 id + style + title 추출
        radios = page.evaluate(r"""
            () => [...document.querySelectorAll('.item-color input[name=colorPick]')].map(inp => {
                const lab = document.querySelector(`label[for=${inp.id}]`);
                return {
                    id: inp.id,
                    labelStyle: lab ? (lab.getAttribute('style') || '') : '',
                    labelTitle: lab ? (lab.getAttribute('title') || lab.getAttribute('alt') || '') : '',
                };
            })
        """)
        print(f"[radios] {len(radios)}개", flush=True)

        # 각 라디오 클릭 → 새 URL의 goodsId 수집
        result = []
        for r in radios:
            try:
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(800)
                clicked = page.evaluate(
                    "(rid) => { const el = document.querySelector(`label[for=${rid}]`) || document.getElementById(rid); if (el) { el.click(); return true; } return false; }",
                    r["id"]
                )
                if not clicked:
                    continue
                page.wait_for_load_state("domcontentloaded", timeout=10000)
                page.wait_for_timeout(700)
                m = re.search(r"goodsId=(G\d+)", page.url)
                gid = m.group(1) if m else None
                # pageTitle 추출 (모델/색명 확인용)
                pt = page.title()
                result.append({
                    "radioId": r["id"],
                    "labelStyle": r["labelStyle"],
                    "labelTitle": r["labelTitle"],
                    "goodsId": gid,
                    "pageTitle": pt,
                })
                print(f"  {r['id']} -> {gid} | style={r['labelStyle'][:60]!r} | title={pt[:60]!r}", flush=True)
            except Exception as e:
                print(f"  [err] {r['id']}: {e}", flush=True)
        browser.close()

    print("\n[result]")
    print(json.dumps(result, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()

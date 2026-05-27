# -*- coding: utf-8 -*-
"""본사 상세 페이지에서 '현재 보고 있는 모델'의 색상 라디오를 어떻게 식별하는지 정찰."""
from playwright.sync_api import sync_playwright
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
BASE = "https://www.skmagic.com"

TARGETS = ["G000069531", "G000069527", "G000069641", "G000068401"]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(user_agent=UA, viewport={"width":1440,"height":900})
    page = ctx.new_page()
    for gid in TARGETS:
        print(f"\n=== {gid} ===")
        page.goto(f"{BASE}/goods/indexGoodsDetail?goodsId={gid}", wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(2500)
        info = page.evaluate(r"""
            () => {
                // 모든 라디오와 그 상태/클래스
                const radios = [...document.querySelectorAll('.item-color input[name=colorPick]')];
                const result = radios.map(inp => {
                    const lab = document.querySelector(`label[for=${inp.id}]`);
                    return {
                        id: inp.id,
                        checked: inp.checked,
                        clsInp: inp.className,
                        clsLab: lab ? lab.className : '',
                        style: lab ? (lab.getAttribute('style') || '') : '',
                        parentCls: inp.parentElement ? inp.parentElement.className : '',
                    };
                });
                return result;
            }
        """)
        for r in info:
            print(f"  {r['id']} checked={r['checked']} parent='{r['parentCls']}'")
            print(f"    style: {r['style'][:80]}")
    browser.close()

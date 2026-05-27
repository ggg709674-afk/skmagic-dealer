# -*- coding: utf-8 -*-
"""file:// 로 상세페이지 열어 색상 chip 개수 + 카드 dot 개수 확인."""
from playwright.sync_api import sync_playwright
import os, pathlib

INDEX = pathlib.Path(r"C:\Users\777\Desktop\skmagic-dealer\web\index.html").as_uri()
TARGETS = [
    ("G000068401", "원코크 얼음물 정수기 - 화이트 (4색 기대)"),
    ("G000069641", "원코크 얼음물 정수기 - 소프트핑크"),
    ("G000069311", "필세기 플렉스 정수기 (3색 기대 PSG 포함)"),
    ("G000067189", "16평 슈퍼 공기청정기 (2색 기대)"),
    ("G000069846", "MEGA ICE 정수기 (2색 기대)"),
    ("G000069527", "초소형 라이트 직수 (3색 기대 WPUJAC125+WPUIAC506)"),
    ("G000069531", "초소형 라이트 직수 베이지 (같은 3색)"),
    ("G000069382", "PSG 초소형 플러스 직수 정수기 - benefits 보충 확인"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width": 1280, "height": 900})
    page = ctx.new_page()
    for gid, label in TARGETS:
        url = f"{INDEX}?id={gid}"
        page.goto(url, wait_until="domcontentloaded")
        page.wait_for_timeout(1500)
        info = page.evaluate(r"""
            () => {
                const chips = [...document.querySelectorAll('#p-color-picker .cp-chip')];
                const chipCount = chips.length;
                const dots = [...document.querySelectorAll('.product-card .cp-dot, .cp-dot')].length;
                return {
                    chipCount,
                    dots,
                    title: document.title,
                    chipsText: chips.slice(0,5).map(c => (c.title || c.getAttribute('aria-label') || c.innerText || '').trim()),
                    chipStyles: chips.map(c => {
                        const d = c.querySelector('.cp-dot');
                        return d ? (d.getAttribute('style') || '').slice(0, 120) : '';
                    }),
                    tags: [...document.querySelectorAll('#p-tags span')].map(s => s.textContent),
                };
            }
        """)
        print(f"[{gid}] {label}")
        print(f"   chips: {info['chipCount']}  dots: {info['dots']}")
        print(f"   tags : {info.get('tags', [])}")
        print(f"   names: {info['chipsText']}")
        for st in info.get('chipStyles', []):
            print(f"     style: {st}")
        print(f"   title: {info['title'][:80]}")
        print()
    browser.close()

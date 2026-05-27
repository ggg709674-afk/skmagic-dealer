# -*- coding: utf-8 -*-
"""옵션 UI(약정/관리유형) 동작 검증."""
from playwright.sync_api import sync_playwright
import pathlib

INDEX = pathlib.Path(r"C:\Users\777\Desktop\skmagic-dealer\web\index.html").as_uri()

TARGETS = [
    ("G000069382", "PSG 약정 4개"),
    ("G000068401", "원코크 약정 3개"),
    ("G000067189", "16평 슈퍼 - 셀프/방문 모두"),
    ("G000020622", "옵션 없는 케이스"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={"width":1280,"height":900})
    page = ctx.new_page()
    for gid, label in TARGETS:
        page.goto(f"{INDEX}?id={gid}", wait_until="domcontentloaded")
        page.wait_for_timeout(1300)
        info = page.evaluate(r"""
            () => {
                const block = document.getElementById('p-options');
                const blockVisible = block && !block.hidden;
                const careTabs = [...document.querySelectorAll('#p-care-tabs .op-tab')].map(t => t.textContent.trim() + (t.classList.contains('on') ? '*' : ''));
                const contractTabs = [...document.querySelectorAll('#p-contract-tabs .op-tab')].map(t => t.textContent.trim() + (t.classList.contains('on') ? '*' : ''));
                const info = [...document.querySelectorAll('#p-option-info span')].map(s => s.textContent.trim());
                return { blockVisible, careTabs, contractTabs, info };
            }
        """)
        print(f"[{gid}] {label}")
        print(f"   visible: {info['blockVisible']}")
        print(f"   care   : {info['careTabs']}")
        print(f"   contract: {info['contractTabs']}")
        print(f"   info   : {info['info']}")
        print()
    browser.close()

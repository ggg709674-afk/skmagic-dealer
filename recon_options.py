# -*- coding: utf-8 -*-
"""본사 상세 페이지의 약정기간/관리유형/가격 옵션 DOM 정찰."""
from playwright.sync_api import sync_playwright
import json

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"
BASE = "https://www.skmagic.com"

TARGETS = ["G000069382", "G000068401", "G000069527", "G000067189"]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(user_agent=UA, viewport={"width":1440,"height":900})
    page = ctx.new_page()
    for gid in TARGETS:
        print(f"\n========= {gid} =========")
        page.goto(f"{BASE}/goods/indexGoodsDetail?goodsId={gid}", wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(2800)
        data = page.evaluate(r"""
            () => {
                const txt = el => (el ? (el.innerText || '').replace(/\s+/g, ' ').trim() : '');
                // 약정기간 영역 — '의무약정기간' 라벨 찾고 그 옆/아래 buttons
                const findByLabel = (label) => {
                    const all = [...document.querySelectorAll('th, dt, .tit, .label, div')];
                    return all.find(el => txt(el) === label || txt(el).startsWith(label));
                };
                const contractLabel = findByLabel('의무약정기간') || findByLabel('약정기간');
                let contractArea = contractLabel ? contractLabel.parentElement : null;
                while (contractArea && contractArea.children.length < 2 && contractArea.parentElement) {
                    contractArea = contractArea.parentElement;
                    if (contractArea.tagName === 'BODY') { contractArea = null; break; }
                }
                const contractInfo = contractArea ? {
                    cls: contractArea.className,
                    inner: contractArea.outerHTML.slice(0, 2500),
                } : '(약정기간 라벨 없음)';

                // 관리유형 — '관리유형', '셀프관리', '방문관리'
                const careLabel = findByLabel('관리유형');
                let careArea = careLabel ? careLabel.parentElement : null;
                while (careArea && careArea.children.length < 2 && careArea.parentElement) {
                    careArea = careArea.parentElement;
                    if (careArea.tagName === 'BODY') { careArea = null; break; }
                }
                const careInfo = careArea ? {
                    cls: careArea.className,
                    inner: careArea.outerHTML.slice(0, 1500),
                } : '(관리유형 라벨 없음)';

                // 가격 — 기준구독료/기본할인가/최종할인가
                const priceLabels = ['기준 구독료', '기본 할인가', '최종 할인가'];
                const prices = priceLabels.map(label => {
                    const el = findByLabel(label);
                    return { label, value: el && el.parentElement ? txt(el.parentElement) : '(none)' };
                });

                // 방문주기/필터주기/의무사용
                const visitText = txt(document.querySelector('.visitInfo, .filterInfo, .careInfo'));

                // 약정·반값 테이블 (위 사진의 빨간 표)
                const tableEl = document.querySelector('.discountTable, .benefit-table, table');
                const tableSample = tableEl ? tableEl.outerHTML.slice(0, 1500) : '(table not found)';

                return { contractInfo, careInfo, prices, visitText, tableSample };
            }
        """)
        print(json.dumps(data, ensure_ascii=False, indent=2)[:5000])
    browser.close()

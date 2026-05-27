# -*- coding: utf-8 -*-
"""단일 goodsId 상세 1건만 재크롤.
사용: python crawl_one.py G000062320
"""
import sys
from playwright.sync_api import sync_playwright
from crawl_details import process_one, UA

def main():
    if len(sys.argv) < 2:
        print("usage: python crawl_one.py <goodsId>")
        sys.exit(1)
    gid = sys.argv[1].strip()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=UA, viewport={"width":1440,"height":900})
        page = ctx.new_page()
        process_one(page, {"goodsId": gid}, force=True)
        browser.close()

if __name__ == "__main__":
    main()

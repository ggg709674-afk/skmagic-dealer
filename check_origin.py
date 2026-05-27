"""실제 페이지를 로드해서 본사 도메인 요청이 발생하는지 추적."""
import asyncio, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).parent.resolve()
EXTERNAL_HOSTS = ("static.skmagic.com", "web-image.useinsider.com", "skmagic.com")

# 형이 본 G000069309 + 다른 샘플 몇 개
SAMPLES = ["G000069309", "G000020604", "G000020622", "G000057638"]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900})
        for gid in SAMPLES:
            url = f"file:///{(ROOT/'web'/'detail.html').as_posix()}?id={gid}"
            page = await ctx.new_page()
            ext_hits = []
            local_404 = []

            def on_request(req):
                u = req.url
                for h in EXTERNAL_HOSTS:
                    if h in u:
                        ext_hits.append(u)
                        return
            def on_response(res):
                if res.url.startswith("file://") and res.status >= 400:
                    local_404.append(res.url)

            page.on("request", on_request)
            page.on("response", on_response)

            await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            # 페이지 스크롤로 lazy 이미지 다 트리거
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await page.wait_for_timeout(3500)
            await page.evaluate("window.scrollTo(0, 0)")
            await page.wait_for_timeout(1000)

            print(f"=== {gid} ===")
            print(f"  외부 요청 (본사): {len(ext_hits)}건")
            for u in ext_hits[:8]:
                print(f"    - {u[:90]}")
            if len(ext_hits) > 8: print(f"    ... +{len(ext_hits)-8}")
            print(f"  로컬 404: {len(local_404)}건")
            for u in local_404[:5]:
                print(f"    - ...{u[-80:]}")
            if len(local_404) > 5: print(f"    ... +{len(local_404)-5}")
            print()
            await page.close()
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())

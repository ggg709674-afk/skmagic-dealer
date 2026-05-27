"""상세 페이지 인포그래픽 필터 + 이미지 폭 검증."""
import asyncio, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).parent.resolve()
OUT = ROOT / "recon" / "after_recolor"
OUT.mkdir(parents=True, exist_ok=True)

SAMPLES = ["G000069309", "G000020604", "G000020622", "G000057638"]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for vp_name, vw in [("dt", 1400), ("mo", 414)]:
            ctx = await browser.new_context(viewport={"width": vw, "height": 900})
            for gid in SAMPLES:
                url = f"file:///{(ROOT/'web'/'detail.html').as_posix()}?id={gid}"
                page = await ctx.new_page()
                await page.goto(url, wait_until="domcontentloaded", timeout=45000)
                await page.wait_for_timeout(2500)
                # 인포그래픽 이미지 개수 확인
                count = await page.evaluate(
                    "()=>document.querySelectorAll('.infoimgs img').length"
                )
                width = await page.evaluate(
                    "()=>{const img=document.querySelector('.infoimgs img');"
                    "return img ? Math.round(img.getBoundingClientRect().width) : 0;}"
                )
                print(f"  {gid} [{vp_name}] infoimgs={count}장, 첫이미지폭={width}px")
                shot = OUT / f"detail_{gid}_{vp_name}.png"
                await page.screenshot(path=str(shot), full_page=True, timeout=90000)
                await page.close()
            await ctx.close()
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())

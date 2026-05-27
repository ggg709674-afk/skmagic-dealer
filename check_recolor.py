"""리컬러·로고·사업자정보·반응형 검증. 데스크탑+모바일 양쪽 스크린샷."""
import asyncio, pathlib
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).parent.resolve()
OUT = ROOT / "recon" / "after_recolor"
OUT.mkdir(parents=True, exist_ok=True)

PAGES = [
    ("index",    f"file:///{(ROOT/'web'/'index.html').as_posix()}"),
    ("category", f"file:///{(ROOT/'web'/'category.html').as_posix()}?cls=100000005"),
]

VIEWPORTS = [
    ("dt", 1400, 900),   # desktop
    ("mo", 414, 900),    # mobile (iPhone 11 width)
]

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        for vp_name, vw, vh in VIEWPORTS:
            ctx = await browser.new_context(viewport={"width": vw, "height": vh})
            for name, url in PAGES:
                page = await ctx.new_page()
                await page.goto(url, wait_until="domcontentloaded", timeout=45000)
                await page.wait_for_timeout(2500)
                # 풀페이지 (timeout 늘림 — 폰트 CDN + 긴 페이지 대비)
                shot = OUT / f"{name}_{vp_name}.png"
                await page.screenshot(path=str(shot), full_page=True, timeout=90000)
                # 헤더만 (잘 보이게)
                header_clip = await page.evaluate(
                    "()=>{const el=document.querySelector('.site-header');"
                    "const r=el.getBoundingClientRect();"
                    "return {x:0,y:0,width:Math.round(r.width),height:Math.round(r.bottom)+8};}"
                )
                if header_clip:
                    await page.screenshot(
                        path=str(OUT / f"{name}_{vp_name}_header.png"),
                        clip=header_clip,
                    )
                # 푸터만
                footer_clip = await page.evaluate(
                    "()=>{const el=document.querySelector('.site-footer');"
                    "if(!el)return null;"
                    "const r=el.getBoundingClientRect();"
                    "el.scrollIntoView({block:'end'});"
                    "return null;}"
                )
                # scroll-to-footer 후 클립 다시 측정
                await page.wait_for_timeout(400)
                fc = await page.evaluate(
                    "()=>{const el=document.querySelector('.site-footer');"
                    "if(!el)return null;"
                    "const r=el.getBoundingClientRect();"
                    "return {x:0,y:Math.max(0,Math.round(r.top)),"
                    "width:Math.round(r.width),height:Math.round(r.height)};}"
                )
                if fc and fc["height"] > 0:
                    await page.screenshot(
                        path=str(OUT / f"{name}_{vp_name}_footer.png"),
                        clip=fc,
                    )
                print(f"  -> {name}_{vp_name}  full+header+footer")
                await page.close()
            await ctx.close()
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())

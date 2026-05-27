"""
SK매직 본사 사이트의 실제 사용 컬러를 Playwright로 추출.
- 메인 페이지, 카테고리, 상세 한 곳씩 방문
- 모든 element의 computed background/color/border 색상 카운트
- 가장 많이 등장하는 색상 + 강조 색상 후보 출력
"""
import asyncio
from collections import Counter
from playwright.async_api import async_playwright

URLS = [
    "https://www.skmagic.com/",
    "https://www.skmagic.com/product/category/list?cateCd1=A",  # 정수기
]

SCRIPT = r"""
() => {
  const out = { bg: {}, color: {}, border: {}, font: {} };
  const all = document.querySelectorAll('*');
  all.forEach(el => {
    const cs = getComputedStyle(el);
    const bg = cs.backgroundColor;
    const fg = cs.color;
    const bd = cs.borderTopColor;
    const ff = cs.fontFamily;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') out.bg[bg] = (out.bg[bg]||0)+1;
    if (fg) out.color[fg] = (out.color[fg]||0)+1;
    if (bd && bd !== 'rgba(0, 0, 0, 0)') out.border[bd] = (out.border[bd]||0)+1;
    if (ff) out.font[ff] = (out.font[ff]||0)+1;
  });
  // 헤더, 버튼, 로고 등 의미 있는 요소의 컬러
  const meaningful = [];
  ['header','.gnb','button','.btn','a.btn','[class*=primary]','[class*=red]','[class*=cta]','.logo'].forEach(sel=>{
    document.querySelectorAll(sel).forEach(el=>{
      const cs = getComputedStyle(el);
      meaningful.push({sel, bg: cs.backgroundColor, color: cs.color, border: cs.borderColor, text: (el.innerText||'').slice(0,30)});
    });
  });
  return { out, meaningful: meaningful.slice(0,40) };
}
"""

def rgb_to_hex(rgb):
    # "rgb(234, 0, 44)" or "rgba(234,0,44,1)"
    import re
    m = re.search(r'(\d+)\D+(\d+)\D+(\d+)', rgb)
    if not m: return rgb
    r,g,b = (int(m.group(i)) for i in (1,2,3))
    return "#{:02X}{:02X}{:02X}".format(r,g,b)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900})
        for url in URLS:
            page = await ctx.new_page()
            print("="*70)
            print("URL:", url)
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(2500)
                data = await page.evaluate(SCRIPT)
            except Exception as e:
                print("  ERR:", e)
                await page.close()
                continue
            print("-- 상위 배경색 --")
            for c,n in Counter(data["out"]["bg"]).most_common(15):
                print(f"  {n:5d}  {rgb_to_hex(c):>8}  {c}")
            print("-- 상위 텍스트색 --")
            for c,n in Counter(data["out"]["color"]).most_common(10):
                print(f"  {n:5d}  {rgb_to_hex(c):>8}  {c}")
            print("-- 상위 보더색 --")
            for c,n in Counter(data["out"]["border"]).most_common(10):
                print(f"  {n:5d}  {rgb_to_hex(c):>8}  {c}")
            print("-- 폰트 --")
            for f,n in Counter(data["out"]["font"]).most_common(5):
                print(f"  {n:5d}  {f}")
            print("-- 의미 있는 요소 --")
            for m in data["meaningful"]:
                if m["bg"] != 'rgba(0, 0, 0, 0)' or 'red' in (m.get('color') or '').lower():
                    print(f"  [{m['sel']}] bg={rgb_to_hex(m['bg'])} fg={rgb_to_hex(m['color'])} text={m['text']!r}")
            await page.close()
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())

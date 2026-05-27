"""본사 상세 페이지의 '제품사양' 탭 구조 정찰.
G000069282 페이지를 띄우고 제품사양 탭 콘텐츠가 어디에 있는지 (같은 HTML / AJAX) 확인."""
import asyncio
from playwright.async_api import async_playwright

URL = "https://www.skmagic.com/goods/indexGoodsDetail?goodsId=G000069282"
SHOW_DETAIL = True  # spec 테이블 상세 구조 출력

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900})
        page = await ctx.new_page()
        # 네트워크 요청 추적
        ajax_calls = []
        page.on("request", lambda req: ajax_calls.append(req.url) if "spec" in req.url.lower() or "info" in req.url.lower() else None)

        await page.goto(URL, wait_until="domcontentloaded", timeout=45000)
        await page.wait_for_timeout(3500)

        # 탭바 구조 탐색
        tabs = await page.evaluate("""()=>{
          const out = [];
          // 다양한 탭 셀렉터 시도
          ['.tab-menu li','.tabs li','.tab-list li','[class*=tab] [class*=item]','a[href*=tab]'].forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
              const txt = el.textContent.trim().slice(0,30);
              if (txt) out.push({sel, text: txt, html: el.outerHTML.slice(0,200)});
            });
          });
          return out.slice(0, 30);
        }""")
        print("=== 후보 탭 요소 ===")
        for t in tabs:
            print(f"  [{t['sel']}] {t['text']}")

        # "제품사양" 또는 "사양" 들어간 요소 찾기
        spec_tab = await page.evaluate("""()=>{
          const els = Array.from(document.querySelectorAll('*'));
          return els.filter(el => {
            const t = (el.textContent || '').trim();
            return (t === '제품사양' || t === '상세사양' || t === '제품 사양') && t.length < 20;
          }).slice(0, 5).map(el => ({
            tag: el.tagName, cls: el.className, id: el.id,
            text: el.textContent.trim().slice(0, 30),
            parent_tag: el.parentElement?.tagName,
            parent_cls: el.parentElement?.className,
          }));
        }""")
        print()
        print("=== '제품사양' 요소 ===")
        for s in spec_tab:
            print(f"  <{s['tag']} class='{s['cls']}' id='{s['id']}'> -> parent <{s['parent_tag']} class='{s['parent_cls']}'>")

        # 페이지에 spec 관련 정보가 같은 HTML에 있는지 — 키워드 검색
        same_html = await page.evaluate("""()=>{
          const html = document.documentElement.outerHTML;
          const keywords = ['정격전압', '소비전력', '정수방식', '모델명', '제품크기', '무게', '인증번호', '냉수탱크용량'];
          return keywords.map(k => ({k, count: (html.match(new RegExp(k, 'g'))||[]).length}));
        }""")
        print()
        print("=== 키워드 등장 횟수 (같은 HTML 안) ===")
        for k in same_html:
            print(f"  {k['k']}: {k['count']}")

        # AJAX 호출 확인
        print()
        print("=== spec/info 관련 네트워크 요청 ===")
        for u in set(ajax_calls):
            print(f"  {u[:120]}")

        # 제품사양 탭 클릭 시도
        clicked = False
        try:
            spec_link = await page.query_selector("text=제품사양")
            if spec_link:
                await spec_link.click()
                clicked = True
                await page.wait_for_timeout(2000)
        except Exception as e:
            print(f"  탭 클릭 실패: {e}")

        # 클릭 후 다시 스펙 키워드 검색
        if clicked:
            after_html = await page.evaluate("""()=>{
              const html = document.documentElement.outerHTML;
              const keywords = ['정격전압', '소비전력', '정수방식', '모델명', '제품크기', '무게'];
              return keywords.map(k => ({k, count: (html.match(new RegExp(k, 'g'))||[]).length}));
            }""")
            print()
            print("=== 탭 클릭 후 키워드 등장 횟수 ===")
            for k in after_html:
                print(f"  {k['k']}: {k['count']}")
            # 스펙 테이블 찾기
            spec_table = await page.evaluate("""()=>{
              // table or dl 형태로 spec 보여줄 가능성
              const candidates = document.querySelectorAll('table, dl, .spec-list, [class*=spec]');
              return Array.from(candidates).slice(0,5).map(el => ({
                tag: el.tagName, cls: el.className,
                txt: el.textContent.trim().slice(0,200),
              }));
            }""")
            print()
            print("=== 스펙 테이블 후보 ===")
            for c in spec_table:
                print(f"  <{c['tag']} class='{c['cls']}'> txt: {c['txt'][:80]}")

        if SHOW_DETAIL:
            # tblCont.type2 안 실제 tr 구조 출력
            spec_rows = await page.evaluate("""()=>{
              const tables = document.querySelectorAll('table.tblCont.type2');
              const out = [];
              tables.forEach((t, ti) => {
                // caption 또는 앞 h3 찾기
                let title = '';
                const prev = t.previousElementSibling;
                if (prev) title = prev.textContent.trim().slice(0, 30);
                const cap = t.querySelector('caption');
                if (cap) title = cap.textContent.trim().slice(0, 30);
                const rows = [];
                t.querySelectorAll('tr').forEach(tr => {
                  const cells = Array.from(tr.children).map(c => c.textContent.replace(/\\s+/g,' ').trim());
                  if (cells.length >= 2) rows.push(cells);
                });
                out.push({i: ti, title, rows: rows.slice(0, 6)});
              });
              return out;
            }""")
            print()
            print("=== tblCont.type2 테이블 상세 ===")
            for t in spec_rows:
                print(f"  [Table {t['i']}] title='{t['title']}'")
                for r in t['rows']:
                    print(f"    {r}")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())

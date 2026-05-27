"""본사 상품 페이지의 '제품사양' 탭(tblCont.type2 테이블들) 추출 → 각 상품 meta.json에 specs 필드 추가.

기존 meta.json 데이터는 보존. specs 키만 갱신.
재실행 시 이미 specs 있으면 skip 옵션 있음 (--force로 덮어쓰기).

사용:
  python crawl_specs.py             # 모든 상품
  python crawl_specs.py G000069282  # 특정 상품만
  python crawl_specs.py --force     # 이미 specs 있어도 다시 크롤
"""
import asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).parent
PRODUCTS_JSON = ROOT / 'data' / 'products.json'
BASE_URL = "https://www.skmagic.com/goods/indexGoodsDetail?goodsId={gid}"

# 본사 정보 row는 제외 (우리 카탈로그의 사업자정보와 충돌 + 영업상 불필요)
EXCLUDE_LABELS = {'공급자', '대표자', '등록번호', '주소', '전화', 'FAX', '팩스'}

EXTRACT_JS = """()=>{
  const tables = document.querySelectorAll('table.tblCont.type2');
  const out = [];
  tables.forEach(t => {
    t.querySelectorAll('tr').forEach(tr => {
      const cells = Array.from(tr.children).map(c => c.textContent.replace(/\\s+/g,' ').trim());
      if (cells.length >= 4) {
        if (cells[0] && cells[1]) out.push({label: cells[0], value: cells[1]});
        if (cells[2] && cells[3]) out.push({label: cells[2], value: cells[3]});
      } else if (cells.length === 2 && cells[0] && cells[1]) {
        out.push({label: cells[0], value: cells[1]});
      }
    });
  });
  return out;
}"""

async def crawl_one(page, gid):
    url = BASE_URL.format(gid=gid)
    await page.goto(url, wait_until="domcontentloaded", timeout=45000)
    await page.wait_for_timeout(2200)
    raw = await page.evaluate(EXTRACT_JS)
    filtered = [s for s in raw if s['label'] not in EXCLUDE_LABELS]
    return filtered

async def main():
    args = sys.argv[1:]
    force = '--force' in args
    args = [a for a in args if not a.startswith('--')]
    only_gid = args[0] if args else None

    products = json.loads(PRODUCTS_JSON.read_text(encoding='utf-8'))['products']
    if only_gid:
        products = [p for p in products if p['goodsId'] == only_gid]

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1400, "height": 900})
        page = await ctx.new_page()
        ok, skipped, failed = 0, 0, 0
        for prod in products:
            gid = prod['goodsId']
            meta_path = ROOT / 'products' / gid / 'meta.json'
            if not meta_path.exists():
                print(f"  skip (no meta): {gid}")
                skipped += 1
                continue
            meta = json.loads(meta_path.read_text(encoding='utf-8'))
            if not force and meta.get('specs') and len(meta['specs']) > 0:
                print(f"  skip (has specs): {gid} ({len(meta['specs'])} rows)")
                skipped += 1
                continue
            try:
                specs = await crawl_one(page, gid)
                meta['specs'] = specs
                meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
                print(f"  OK {gid}: {len(specs)} specs")
                ok += 1
            except Exception as e:
                print(f"  FAIL {gid}: {e}")
                failed += 1
        await browser.close()
        print(f"\nDONE - ok={ok} skipped={skipped} failed={failed}")

if __name__ == "__main__":
    asyncio.run(main())

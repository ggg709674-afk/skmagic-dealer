# -*- coding: utf-8 -*-
"""매트리스 상품의 사이즈 옵션별 제품사양을 크롤링.
각 사이즈 라디오 클릭 → 테이블 변화 추출 → meta.json에 specs_by_size 추가.

사용:
  python crawl_mattress_sizes.py            # 매트리스 5개 모두
  python crawl_mattress_sizes.py G000069405 # 특정 G코드만 (디버그)
"""
import asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).parent
PRODUCTS_JSON = ROOT / 'data' / 'products.json'
BASE_URL = "https://www.skmagic.com/goods/indexGoodsDetail?goodsId={gid}"
MATTRESS_GIDS = ['G000069405', 'G000069406', 'G000069421', 'G000069422', 'G000069429']

EXCLUDE_LABELS = {'공급자', '대표자', '등록번호', '주소', '전화', 'FAX', '팩스'}

# 매트리스 사이즈 라디오 — 본사가 colorHexaRental 이라는 name으로 사이즈 옵션 관리
FIND_SIZE_OPTIONS_JS = r"""()=>{
  const radios = document.querySelectorAll('input[name="colorHexaRental"]');
  return [...radios].map(r => {
    let labelEl = null;
    if (r.id) labelEl = document.querySelector(`label[for="${r.id}"]`);
    if (!labelEl) labelEl = r.closest('label');
    const labelText = labelEl ? (labelEl.textContent||'').replace(/\s+/g,' ').trim() : '';
    return {
      id: r.id, name: r.name, value: r.value,
      label: labelText, checked: r.checked, disabled: r.disabled,
    };
  });
}"""

EXTRACT_SPECS_JS = r"""()=>{
  const tables = document.querySelectorAll('table.tblCont.type2');
  const out = [];
  tables.forEach(t => {
    t.querySelectorAll('tr').forEach(tr => {
      const cells = Array.from(tr.children).map(c => c.textContent.replace(/\s+/g,' ').trim());
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
    print(f"\n=== {gid} ===")
    await page.goto(url, wait_until="domcontentloaded", timeout=45000)
    await page.wait_for_timeout(2500)

    # 사이즈 옵션 발견 (name=colorHexaRental)
    sizes = await page.evaluate(FIND_SIZE_OPTIONS_JS)
    print(f"  사이즈 라디오 {len(sizes)}개:")
    for s in sizes:
        print(f"    - id={s['id']!r} label={s['label']!r} checked={s['checked']} disabled={s['disabled']}")

    if not sizes:
        specs = await page.evaluate(EXTRACT_SPECS_JS)
        return {'_single': [s for s in specs if s['label'] not in EXCLUDE_LABELS]}

    # 각 사이즈 클릭하면서 spec 수집
    result = {}
    for s in sizes:
        if not s['id']:
            continue
        size_label = s['label'] or s['value'] or s['id']
        try:
            await page.evaluate(f"""()=>{{
                const el = document.querySelector('label[for="{s['id']}"]') || document.getElementById("{s['id']}");
                if (el) el.click();
            }}""")
            await page.wait_for_timeout(1500)  # 테이블 동적 변경 대기
        except Exception as e:
            print(f"    클릭 실패 {s['id']}: {e}")
            continue
        specs = await page.evaluate(EXTRACT_SPECS_JS)
        filtered = [sp for sp in specs if sp['label'] not in EXCLUDE_LABELS]
        result[size_label] = filtered
        # 사이즈 변화 감지 위한 핵심 spec(크기/중량) 1줄 출력
        size_spec = next((sp for sp in filtered if '크기' in sp['label']), None)
        weight = next((sp for sp in filtered if '중량' in sp['label']), None)
        print(f"  [{size_label}] {len(filtered)}개 | 크기={size_spec['value'] if size_spec else '?'} | 중량={weight['value'] if weight else '?'}")

    return result


async def main():
    args = sys.argv[1:]
    only_gid = args[0] if args else None
    targets = [only_gid] if only_gid else MATTRESS_GIDS

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1440, "height": 900})
        page = await ctx.new_page()

        for gid in targets:
            try:
                specs_by_size = await crawl_one(page, gid)
            except Exception as e:
                print(f"  [error] {e}")
                continue

            meta_path = ROOT / 'products' / gid / 'meta.json'
            if not meta_path.exists():
                print(f"  [skip] meta.json 없음")
                continue
            with open(meta_path, encoding='utf-8') as f:
                m = json.load(f)
            m['specs_by_size'] = specs_by_size
            with open(meta_path, 'w', encoding='utf-8') as f:
                json.dump(m, f, ensure_ascii=False, indent=2)
            print(f"  저장 완료 - {list(specs_by_size.keys())}")

        await browser.close()

    print("\n[done]")


if __name__ == "__main__":
    asyncio.run(main())

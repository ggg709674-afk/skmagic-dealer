"""본사 상품 상세 페이지의 약정 옵션 메타데이터(가격 제외)를 수집.

input[name=saleTp] (관리유형: 10=셀프, 20=방문) x input[name=rentalInfo] (약정기간)
매트릭스를 순회하면서 각 옵션의 data-* 속성을 긁어 meta.json에 options 필드로 저장.

가격 필드(data-rental-price 등)는 의도적으로 무시. 관리자 페이지에서 직접 입력.

사용:
  python crawl_options.py                # 모든 상품, 이미 options 있으면 skip
  python crawl_options.py G000067189     # 특정 상품만
  python crawl_options.py --force        # 이미 options 있어도 다시 크롤
"""
import asyncio, json, pathlib, sys
from playwright.async_api import async_playwright

ROOT = pathlib.Path(__file__).parent
PRODUCTS_JSON = ROOT / 'data' / 'products.json'
BASE_URL = "https://www.skmagic.com/goods/indexGoodsDetail?goodsId={gid}"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"

# 현재 DOM 상의 rentalInfo 라디오들에서 data-* 메타 + label 텍스트 추출.
# 가격 관련 필드는 의도적으로 제외.
EXTRACT_RENTAL_JS = r"""() => {
  const radios = document.querySelectorAll('input[name="rentalInfo"]');
  const out = [];
  radios.forEach(r => {
    // label 텍스트: for=id 매칭 -> 못 찾으면 부모 span 안의 label
    let labelEl = null;
    if (r.id) labelEl = document.querySelector('label[for="' + r.id + '"]');
    if (!labelEl) {
      const parent = r.closest('span, li, div');
      if (parent) labelEl = parent.querySelector('label');
    }
    const labelText = labelEl ? (labelEl.textContent || '').replace(/\s+/g,' ').trim() : '';

    const dutyStr = r.getAttribute('data-duty-use-prd') || '';
    const ownStr = r.getAttribute('data-own-get-prd') || '';
    const idxStr = r.getAttribute('data-index') || '';

    // "3년" / "5년" -> 3 / 5. 못 뽑으면 null.
    let years = null;
    const m = labelText.match(/(\d+)\s*년/);
    if (m) years = parseInt(m[1], 10);
    // 라벨에서 못 찾으면 duty / 12 도 시도.
    if (years === null && dutyStr) {
      const d = parseInt(dutyStr, 10);
      if (!isNaN(d) && d % 12 === 0) years = d / 12;
    }

    const toIntOrNull = s => {
      if (s === '' || s == null) return null;
      const n = parseInt(s, 10);
      return isNaN(n) ? null : n;
    };

    out.push({
      label: labelText,
      years: years,
      duty_use_months: toIntOrNull(dutyStr),
      own_get_months: toIntOrNull(ownStr),
      contract_type: r.getAttribute('data-cmpn-chng-tp-nm') || '',
      filter_period: r.getAttribute('data-filter-tp-nm') || '',
      visit_period: r.getAttribute('data-mc-filter-tp-nm') || '',
      index: toIntOrNull(idxStr),
      value: r.getAttribute('value') || '',
      id: r.id || '',
    });
  });
  return out;
}"""

CHECK_SALETP_JS = r"""() => {
  const radios = document.querySelectorAll('input[name="saleTp"]');
  const arr = [];
  radios.forEach(r => {
    let labelEl = null;
    if (r.id) labelEl = document.querySelector('label[for="' + r.id + '"]');
    if (!labelEl) {
      const parent = r.closest('span, li, div');
      if (parent) labelEl = parent.querySelector('label');
    }
    const labelText = labelEl ? (labelEl.textContent || '').replace(/\s+/g,' ').trim() : '';
    arr.push({id: r.id || '', value: r.getAttribute('value') || '', label: labelText});
  });
  return arr;
}"""


async def click_saletp(page, value):
    """saleTp 라디오 클릭. input이 hidden인 경우가 많아 label 클릭 + JS click 폴백."""
    try:
        # 1) label[for=saleTp{value}] 클릭
        lab = page.locator(f'label[for="saleTp{value}"]').first
        if await lab.count() > 0:
            try:
                await lab.click()
                await page.wait_for_timeout(1200)
                return True
            except Exception:
                pass
        # 2) JS로 input.click() 강제 호출 (hidden input도 click 이벤트는 발화)
        clicked = await page.evaluate(
            "(v) => { const inp = document.querySelector('#saleTp'+v) || document.querySelector('input[name=saleTp][value=\"'+v+'\"]'); if (!inp) return false; inp.click(); return true; }",
            value
        )
        if clicked:
            await page.wait_for_timeout(1200)
            return True
        return False
    except Exception as e:
        print(f"    saletp click fail value={value}: {e}", flush=True)
        return False


async def collect_rental(page):
    """현재 DOM 상태의 rentalInfo 옵션들을 수집."""
    return await page.evaluate(EXTRACT_RENTAL_JS)


async def crawl_one(page, gid):
    url = BASE_URL.format(gid=gid)
    await page.goto(url, wait_until="domcontentloaded", timeout=45000)
    await page.wait_for_timeout(2500)

    saletp_list = await page.evaluate(CHECK_SALETP_JS)

    care_types = []

    if not saletp_list:
        # saleTp 없는 모델: 현재 rentalInfo만 수집
        contracts = await collect_rental(page)
        if not contracts:
            return None  # 옵션 자체가 없음 -> options: null
        care_types.append({
            "id": "",
            "name": "기본",
            "contracts": contracts,
        })
        return {"care_types": care_types}

    # saleTp 있음: 각각 클릭하면서 rentalInfo 수집
    for st in saletp_list:
        val = st.get("value") or ""
        name = st.get("label") or ""
        if not val:
            continue
        clicked = await click_saletp(page, val)
        if not clicked:
            continue
        contracts = await collect_rental(page)
        care_types.append({
            "id": val,
            "name": name,
            "contracts": contracts,
        })

    if not care_types:
        return None
    # 모든 care_type의 contracts가 비어있으면 null 처리
    if all(len(ct["contracts"]) == 0 for ct in care_types):
        return None
    return {"care_types": care_types}


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
        ctx = await browser.new_context(user_agent=UA, viewport={"width": 1400, "height": 900})
        page = await ctx.new_page()
        ok, skipped, failed, null_cnt = 0, 0, 0, 0
        total = len(products)
        for i, prod in enumerate(products, 1):
            gid = prod['goodsId']
            meta_path = ROOT / 'products' / gid / 'meta.json'
            if not meta_path.exists():
                print(f"  [{i}/{total}] skip (no meta): {gid}", flush=True)
                skipped += 1
                continue
            meta = json.loads(meta_path.read_text(encoding='utf-8'))
            if not force and 'options' in meta:
                cur = meta.get('options')
                tag = "null" if cur is None else f"{len(cur.get('care_types', []))} care_types"
                print(f"  [{i}/{total}] skip (has options): {gid} ({tag})", flush=True)
                skipped += 1
                continue
            try:
                options = await crawl_one(page, gid)
                meta['options'] = options
                meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding='utf-8')
                if options is None:
                    print(f"  [{i}/{total}] OK {gid}: options=null", flush=True)
                    null_cnt += 1
                else:
                    summary = ", ".join(
                        f"{ct['name']}({len(ct['contracts'])})" for ct in options['care_types']
                    )
                    print(f"  [{i}/{total}] OK {gid}: {summary}", flush=True)
                ok += 1
            except Exception as e:
                print(f"  [{i}/{total}] FAIL {gid}: {e}", flush=True)
                failed += 1
        await browser.close()
        print(f"\nDONE - ok={ok} (null={null_cnt}) skipped={skipped} failed={failed}", flush=True)


if __name__ == "__main__":
    asyncio.run(main())

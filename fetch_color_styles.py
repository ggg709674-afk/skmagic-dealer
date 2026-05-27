# -*- coding: utf-8 -*-
"""
본사 상세 페이지에서 각 상품이 어떤 색깔로 표시되는지 정확히 수집.
- input.checked 인 라디오의 label background style을 그대로 _colorStyle 필드에 저장.
- 같은 _colorGroup의 sibling 한 번 본사 상세 로드하면 라디오 클릭으로 다 매핑 가능.

이전에 모델 코드 끝 글자(SOW/SSP 등)로 색상 추정했는데, 같은 SNW 코드가 모델마다
다른 실제 색이라 부정확. 본사 라디오 데이터가 진실.

또한 prices 가 4개 이상인 카드(상세에서 가져온 비정상)는 첫 1개로 정규화 →
sibling 간 가격행 수 일치.
"""
from playwright.sync_api import sync_playwright
import json, os, re, time

ROOT = os.path.dirname(os.path.abspath(__file__))
PJ = os.path.join(ROOT, "data", "products.json")
BASE = "https://www.skmagic.com"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"


def log(*a):
    print(*a, flush=True)


def extract_bg(style):
    """label style 문자열에서 background 값만 뽑음. e.g. 'background:#EEDAD1; border-radius:50%; ...' → '#EEDAD1'"""
    if not style:
        return None
    m = re.search(r"background\s*:\s*([^;]+)", style)
    if not m:
        return None
    return m.group(1).strip()


def collect_styles_for_group(page, base_id):
    """base_id 본사 페이지의 라디오 클릭 → 각 변형 goodsId → background 매핑.
    자기 자신(base_id)은 page 로드 직후 :checked 라디오에서."""
    url = f"{BASE}/goods/indexGoodsDetail?goodsId={base_id}"
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(2200)
        page.evaluate("() => { const el = document.querySelector('.item-color'); if (el) el.scrollIntoView({block:'center'}); }")
        page.wait_for_timeout(400)
    except Exception as e:
        log(f"  [colors] goto fail {base_id}: {e}")
        return {}
    # base 자기 자신
    self_style = page.evaluate(r"""
        () => {
            const checked = document.querySelector('.item-color input:checked');
            if (!checked) return '';
            const lab = document.querySelector(`label[for=${checked.id}]`);
            return lab ? (lab.getAttribute('style') || '') : '';
        }
    """)
    mapping = {base_id: extract_bg(self_style)}
    # 모든 라디오
    radios = page.evaluate(r"""
        () => [...document.querySelectorAll('.item-color input[name=colorPick]')].map(inp => {
            const lab = document.querySelector(`label[for=${inp.id}]`);
            return { id: inp.id, checked: inp.checked, style: lab ? (lab.getAttribute('style') || '') : '' };
        })
    """)
    if len(radios) <= 1:
        return mapping
    for r in radios:
        if r["checked"]:
            continue
        cid = r["id"]
        bg = extract_bg(r["style"])
        try:
            page.evaluate("(cid) => { const el = document.querySelector(`label[for=${cid}]`); if (el) el.click(); }", cid)
            page.wait_for_load_state("domcontentloaded", timeout=10000)
            page.wait_for_timeout(700)
            m = re.search(r"goodsId=(G\d+)", page.url)
            if m:
                mapping[m.group(1)] = bg
            page.goto(url, wait_until="domcontentloaded", timeout=20000)
            page.wait_for_timeout(900)
            page.evaluate("() => { const el = document.querySelector('.item-color'); if (el) el.scrollIntoView({block:'center'}); }")
            page.wait_for_timeout(300)
        except Exception:
            continue
    return mapping


def main():
    with open(PJ, encoding="utf-8") as f:
        db = json.load(f)
    products = db["products"]
    by_id = {p["goodsId"]: p for p in products}

    # 1) 가격 정규화 — prices > 3 이면 첫 1개만 (sibling 일관성)
    fixed_prices = 0
    for p in products:
        if len(p.get("prices", [])) > 3:
            p["prices"] = p["prices"][:1]
            fixed_prices += 1
    log(f"[prices] 정규화 {fixed_prices}개 상품")

    # 2) _colorGroup별 sample 1개씩 본사 라디오 정찰 → _colorStyle 매핑
    groups = {}  # cg -> list of gids
    for p in products:
        cg = p.get("_colorGroup")
        if cg:
            groups.setdefault(cg, []).append(p["goodsId"])
    log(f"[colors] {len(groups)}개 그룹 처리 시작")

    style_map = {}  # gid -> bg
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=UA, viewport={"width": 1440, "height": 900})
        page = ctx.new_page()
        for cg, gids in groups.items():
            seed = gids[0]
            log(f"  [{cg}] seed={seed}")
            mp = collect_styles_for_group(page, seed)
            log(f"     -> {mp}")
            style_map.update(mp)
        browser.close()

    # 3) _colorStyle 필드 저장
    assigned = 0
    for gid, bg in style_map.items():
        if gid in by_id and bg:
            by_id[gid]["_colorStyle"] = bg
            assigned += 1
    log(f"[colors] _colorStyle 부여 {assigned}개 상품")

    with open(PJ, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    log("[done] data/products.json 업데이트")


if __name__ == "__main__":
    main()

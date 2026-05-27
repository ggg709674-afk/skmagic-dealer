# -*- coding: utf-8 -*-
"""
products.json의 thumb URL을 자체 호스팅용으로 다운로드.
각 상품 폴더에 thumb.<ext> 로 저장.
"""
import json, os, urllib.request, urllib.parse, time

ROOT = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(ROOT, "data", "products.json")
PRODUCTS = os.path.join(ROOT, "products")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"


def main():
    db = json.load(open(DATA, encoding="utf-8"))
    ok, fail, skip = 0, 0, 0
    for p in db["products"]:
        gid = p["goodsId"]
        url = p.get("thumb", "")
        if not url:
            print(f"  [skip] {gid} no thumb"); skip += 1; continue
        ext = os.path.splitext(urllib.parse.urlparse(url).path)[1] or ".png"
        out = os.path.join(PRODUCTS, gid, f"thumb{ext}")
        if os.path.exists(out) and os.path.getsize(out) > 100:
            skip += 1; continue
        os.makedirs(os.path.dirname(out), exist_ok=True)
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Referer": "https://www.skmagic.com/"})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                data = r.read()
            with open(out, "wb") as f: f.write(data)
            ok += 1
            print(f"  [ok] {gid} -> thumb{ext} ({len(data)/1024:.1f}KB)")
        except Exception as e:
            fail += 1
            print(f"  [fail] {gid}: {e}")
    print(f"\n[done] ok={ok} skip={skip} fail={fail}")

    # products.json에 thumb_ext 정보 추가
    for p in db["products"]:
        gid = p["goodsId"]
        url = p.get("thumb", "")
        ext = os.path.splitext(urllib.parse.urlparse(url).path)[1] or ".png"
        p["thumb_ext"] = ext
    with open(DATA, "w", encoding="utf-8") as f:
        json.dump(db, f, ensure_ascii=False, indent=2)
    print("[done] products.json에 thumb_ext 필드 추가")


if __name__ == "__main__":
    main()

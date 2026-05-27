"""
SK매직 본사 데이터의 중복 main_images 정리.

문제: 본사 main_images 배열에 같은 사진이 다른 파일명(_10, _11 등)으로 중복 박혀있음.
방법: 각 G코드 폴더의 main_*.png를 md5 해시로 비교 → 중복 발견 시 meta.json의 main_images 배열에서 제거.
파일 자체는 남겨둠 (다른 용도로 쓰일 수 있음). 갤러리 표시 목록(meta.json)만 정리.

실행: python dedupe_images.py
"""
import json, hashlib
from pathlib import Path

PRODUCTS_DIR = Path(__file__).parent / 'products'
total_removed = 0
files_changed = 0
gids_changed = []

for gid_dir in sorted(PRODUCTS_DIR.iterdir()):
    if not gid_dir.is_dir():
        continue
    meta_path = gid_dir / 'meta.json'
    if not meta_path.exists():
        continue

    with open(meta_path, encoding='utf-8') as f:
        meta = json.load(f)

    main_images = meta.get('main_images', [])
    if not main_images or len(main_images) < 2:
        continue

    seen_hashes = {}      # md5 -> 첫 URL
    new_images = []
    removed_this_gid = 0

    for url in main_images:
        fn = url.split('/')[-1]
        local = gid_dir / 'images' / f'main_{fn}'
        if not local.exists():
            new_images.append(url)  # 파일 없으면 그냥 유지 (네트워크 fallback용)
            continue

        with open(local, 'rb') as f:
            h = hashlib.md5(f.read()).hexdigest()

        if h in seen_hashes:
            removed_this_gid += 1
            total_removed += 1
        else:
            seen_hashes[h] = fn
            new_images.append(url)

    if removed_this_gid > 0:
        meta['main_images'] = new_images
        with open(meta_path, 'w', encoding='utf-8') as f:
            json.dump(meta, f, ensure_ascii=False, indent=2)
        files_changed += 1
        gids_changed.append(f"{gid_dir.name} ({removed_this_gid}장)")

print(f"\n중복 이미지 제거 완료")
print(f"  처리된 G코드: {files_changed}개")
print(f"  총 제거된 중복: {total_removed}장")
if gids_changed:
    print(f"\n변경 G코드:")
    for line in gids_changed[:30]:
        print(f"  - {line}")
    if len(gids_changed) > 30:
        print(f"  ... 외 {len(gids_changed)-30}개")

"""
brand 디렉토리에 다음 산출물 생성:
- logo_skmagic_white.png  : 푸터(다크배경)용 흰색 변환
- favicon-32.png, favicon-16.png : 브라우저 탭용 (빨간 나비 심볼만 잘라서)
- apple-touch-icon.png (180x180) : iOS 홈 추가
- favicon.ico : 호환용

GIF 원본을 분석해서:
1) 비투명/비백 픽셀을 흰색으로 강제 → 화이트 로고
2) 좌측 빨간 심볼 영역만 crop → favicon 베이스
"""
import pathlib
from PIL import Image, ImageOps

BRAND = pathlib.Path(__file__).parent / "web" / "assets" / "brand"
# 로고용 원본 (헤더·푸터)
SRC = BRAND / "logo.png"
# 파비콘 전용 원본 — 따로 두고 싶으면 favicon-src.png. 없으면 로고 사용 (자동 fallback).
SRC_FAVICON = (BRAND / "favicon-src.png") if (BRAND / "favicon-src.png").exists() else SRC

def to_rgba(im):
    """GIF(팔레트, 투명도 인덱스) → RGBA 정규화."""
    return im.convert("RGBA")

def make_white_logo():
    im = to_rgba(Image.open(SRC))
    px = im.load()
    w, h = im.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0:
                px[x, y] = (255, 255, 255, a)
    out = BRAND / "logo_white.png"
    im.save(out, "PNG")
    print(f"  -> {out}  ({im.size})")
    return im

def make_favicons():
    """원본이 심볼만이면 그대로, 워드마크 포함이면 좌측 45% 만 잘라서 사용.
    SRC_FAVICON 가 따로 있으면 그걸 사용 (favicon-src.png)."""
    im = to_rgba(Image.open(SRC_FAVICON))
    w, h = im.size
    # 가로:세로 비율로 판단 — 정사각(±20%)에 가까우면 심볼만, 가로형이면 워드마크 포함
    ratio = w / h if h else 1
    if ratio < 1.4:
        # 심볼만 — 그대로 사용
        sym = im
        print(f"  symbol-only original size={sym.size}")
    else:
        # 워드마크 포함 — 좌측 45% 자름
        end_x = int(w * 0.45)
        sym = im.crop((0, 0, end_x, h))
        print(f"  symbol crop end_x={end_x} size={sym.size}")
    # 정사각형으로 패딩 (투명 배경) — 가로 우선이라 위아래 최소 패딩만.
    # 추가 마진은 작게 (2%) — 16x16 favicon에서 심볼이 잘 보이도록.
    side = max(sym.width, sym.height)
    pad_x = (side - sym.width) // 2
    pad_y = (side - sym.height) // 2
    square = Image.new("RGBA", (side, side), (255, 255, 255, 0))
    square.paste(sym, (pad_x, pad_y), sym)
    margin = int(side * 0.02)  # 8% → 2% 축소
    final_side = side + margin * 2
    bg = Image.new("RGBA", (final_side, final_side), (255, 255, 255, 0))
    bg.paste(square, (margin, margin), square)

    for sz in (16, 32, 48, 64, 180):
        ico = bg.resize((sz, sz), Image.LANCZOS)
        out = BRAND / f"favicon-{sz}.png"
        ico.save(out, "PNG")
        print(f"  -> {out}")
    # apple-touch-icon: 180x180 흰배경 + 빨간 심볼
    apple = Image.new("RGBA", (180, 180), (255, 255, 255, 255))
    apple_sym = bg.resize((140, 140), Image.LANCZOS)
    apple.paste(apple_sym, (20, 20), apple_sym)
    apple.save(BRAND / "apple-touch-icon.png", "PNG")
    print(f"  -> {BRAND / 'apple-touch-icon.png'}")
    # favicon.ico 멀티사이즈
    ico_sizes = [(16,16),(32,32),(48,48),(64,64)]
    bg.resize(ico_sizes[-1], Image.LANCZOS).save(BRAND / "favicon.ico", sizes=ico_sizes)
    print(f"  -> {BRAND / 'favicon.ico'}")

if __name__ == "__main__":
    print("== 화이트 로고 ==")
    make_white_logo()
    print("== favicon 세트 ==")
    make_favicons()
    print("DONE")

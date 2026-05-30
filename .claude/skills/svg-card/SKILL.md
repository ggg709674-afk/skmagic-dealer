---
name: svg-card
description: >
  프로모션 배너·카드 안내 섹션에 들어갈 신용카드/체크카드/제휴카드 비주얼을 인라인 SVG로 직접 그린다.
  카드 이미지가 필요할 때(제휴카드 배너, 카드 결합 할인 히어로, 카드 소개 카드형 그리드 등) AI 이미지
  생성기를 쓰지 말고 이 스킬을 사용한다 — AI 이미지는 카드 표면의 텍스트(특히 한글 브랜드명/카드번호)를
  깨뜨리고, 비율·각도·색을 통제하기 어렵고, 흰 배경 제거 같은 후처리가 필요하기 때문이다. SVG는 텍스트가
  정확하고, 색/각도/크기를 코드로 자유롭게 바꿀 수 있고, 투명·선명·경량이다. "카드 이미지 만들어줘",
  "제휴카드 배너", "카드 비주얼", "신용카드 일러스트", "skintellix 카드" 같은 요청이면 반드시 이 스킬을 쓴다.
---

# SVG 신용카드 비주얼

웹 배너·카드 소개에 쓰는 신용카드 그래픽을 **인라인 SVG**로 만든다.

## 왜 SVG인가 (AI 이미지 대신)

AI 이미지 생성기로 카드를 만들면 매번 이런 문제가 난다 — 직접 겪고 정리한 것:
- 카드 표면 **텍스트가 깨진다.** 한글("인텔릭스")은 거의 불가능, 영문("skintellix")도 들쭉날쭉한 가짜 글자가 박힌다.
- **비율·각도**가 통제 안 됨 (4:1 요청해도 정사각 나옴, 3D가 과하게 나옴).
- **흰 배경** 제거 등 후처리가 필요하고, 색을 바꾸려면 매번 다시 생성.

SVG는 이 모두를 해결한다: 텍스트는 `<text>`라 정확(한글 포함), 색·각도·크기는 속성/CSS로 즉시 변경, 투명 배경 기본, 무한 선명, 수 KB로 경량.

## 카드 SVG 템플릿

신용카드 실제 비율은 약 **1.586:1**. viewBox `400 × 252`를 기준으로 한다. 아래를 복사해 색·텍스트만 바꿔 쓴다.

```html
<svg viewBox="0 0 400 252" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="제휴 신용카드">
  <defs>
    <!-- 카드 메탈 그라데이션 -->
    <linearGradient id="cg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0"   stop-color="#f6f6f9"/>
      <stop offset=".48" stop-color="#dadae1"/>
      <stop offset="1"   stop-color="#bcbcc6"/>
    </linearGradient>
    <!-- 사선 광택 (흰색 투명) -->
    <linearGradient id="gloss" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <!-- 칩 (골드) -->
    <linearGradient id="chip" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ecd089"/>
      <stop offset="1" stop-color="#b8902f"/>
    </linearGradient>
  </defs>

  <rect x="2" y="2" width="396" height="248" rx="22" fill="url(#cg)" stroke="#fff" stroke-opacity=".5"/>
  <!-- 사선 광택: 카드 위쪽을 비스듬히 덮는다 -->
  <path d="M2 24 L210 2 L398 60 L398 150 L120 250 L2 250 Z" fill="url(#gloss)"/>
  <!-- 칩 + 격자 -->
  <rect x="38" y="98" width="54" height="42" rx="8" fill="url(#chip)"/>
  <path d="M65 98 v42 M38 112 h54 M38 126 h54" stroke="#9a7820" stroke-width="1.6" stroke-opacity=".55"/>
  <!-- 브랜드 (font-weight로 강약) -->
  <text x="38" y="62" font-family="Pretendard,sans-serif" font-size="26" font-weight="800" fill="#3b3b42">SK<tspan font-weight="600" fill="#86868f"> intellix</tspan></text>
  <!-- 카드번호 (letter-spacing으로 간격) -->
  <text x="38" y="186" font-family="Pretendard,sans-serif" font-size="20" font-weight="600" letter-spacing="3" fill="#5c5c64">0000  0000  0000  0000</text>
  <!-- 하단 좌/우 -->
  <text x="38" y="224" font-family="Pretendard,sans-serif" font-size="14" font-weight="700" letter-spacing="1" fill="#7c7c85">skintellix</text>
  <text x="362" y="226" text-anchor="end" font-family="Pretendard,sans-serif" font-size="14" font-weight="800" fill="#7c7c85">SK<tspan font-weight="600"> magic</tspan></text>
</svg>
```

핵심 의도:
- **텍스트는 항상 `<text>`/`<tspan>`** 으로 — 이게 SVG를 쓰는 이유다. 한글도 그대로 정확히 박힌다. 폰트는 사이트와 같은 `Pretendard`를 우선 지정해 톤을 맞춘다.
- **칩**은 `rect`(둥근 모서리) + 격자 `path` 두 줄이면 충분히 칩처럼 보인다.
- **사선 광택** `path`가 메탈 느낌의 핵심. 카드 좌상단→우중간을 비스듬히 덮는 흰색 투명 면.
- 카드번호를 빼고 싶으면 해당 `<text>`만 지운다. 디자인은 구성요소를 더하고 빼며 조절한다.

## 색 변형

카드 색은 `#cg` 그라데이션 stop 3개만 바꾸면 된다. 텍스트 `fill`도 배경 대비에 맞춰 조정한다.

| 카드 톤 | cg stops | 텍스트 fill |
|--------|----------|------------|
| 실버(기본) | `#f6f6f9 / #dadae1 / #bcbcc6` | 진회색 `#3b3b42` 계열 |
| 다크 | `#3a3d4a / #23252e / #15161c` | 흰색 `#fff` / 연회색 |
| 딥블루 | `#3b5a9a / #2b4170 / #1d2c4d` | 흰색 |
| 골드/샴페인 | `#f3e6c4 / #e3cd95 / #cbab66` | 진갈색 `#5a4620` |

다크/컬러 카드면 칩은 골드 유지가 잘 어울리고, 광택 `gloss`는 그대로 흰색 투명이면 된다.

## 배너에 얹기 (히어로 배너)

카드는 배너 우측에 **살짝 기울이고 그림자**를 줘 입체감을 낸다. 배경은 AI 말고 **CSS 그라데이션**으로 — 색을 CSS 변수로 빼면 톤 교체가 1초다.

```css
/* 배너 컨테이너 — 배경은 CSS 그라데이션 (요란한 도형 없이 깔끔하게) */
.card-hero{
  position:relative; overflow:hidden; border-radius:18px; height:320px;
  display:flex; align-items:center;
  background:
    radial-gradient(120% 150% at 86% 22%, var(--glow) 0%, transparent 52%),
    radial-gradient(90% 130% at 8% 95%, var(--glow2) 0%, transparent 60%),
    linear-gradient(115deg, var(--g1) 0%, var(--g2) 100%);
}
/* 우측 은은한 blob 하나로 깊이감 (선택) */
.card-hero::before{
  content:''; position:absolute; width:520px; height:520px; border-radius:50%;
  right:-60px; top:-160px; background:var(--blob); opacity:.5; filter:blur(8px);
}
/* SVG 카드 — 기울기 + 그림자 */
.ch-card-svg{ flex:0 0 auto; width:430px; transform:rotate(-8deg);
  filter:drop-shadow(0 20px 34px rgba(50,35,80,.3)); }
.ch-card-svg svg{ width:100%; height:auto; display:block; }
```

배경색은 배너 인라인 스타일의 변수로 교체한다 (여러 색 버전을 쉽게 만든다):
```html
<!-- 파스텔 퍼플 -->
<div class="card-hero" style="--g1:#ece6f8;--g2:#f6ebf3;--glow:rgba(255,190,225,.65);--glow2:rgba(190,195,250,.4);--blob:#e7d5f3">…</div>
<!-- 코랄 -->  style="--g1:#fdecea;--g2:#fef3ec;--glow:rgba(255,170,140,.55);--glow2:rgba(255,200,160,.4);--blob:#fbd9cf"
<!-- 민트 -->  style="--g1:#e2f3ef;--g2:#eef6f1;--glow:rgba(120,210,190,.5);--glow2:rgba(160,220,210,.4);--blob:#cfeae3"
<!-- 블루 -->  style="--g1:#e6eef9;--g2:#eef4fb;--glow:rgba(150,190,255,.5);--glow2:rgba(180,205,250,.4);--blob:#d3e2f7"
```

원칙: **카드(SVG) = 통제된 그래픽 + 정확한 텍스트, 배경 = CSS 그라데이션, 문구/해시태그 = HTML 텍스트.** 셋 다 코드라 색·문구·위치를 즉시 조정할 수 있다. 사용자가 "더 진하게/연하게, 글자 키워, 칩 위치 옮겨" 하면 해당 속성만 바꾼다.

## 작업 순서

1. 카드 SVG를 템플릿에서 시작해 브랜드/문구/색을 사용자 맥락에 맞춘다.
2. 배너에 얹어 기울기·그림자·배경 그라데이션을 준다.
3. 미리보기로 보여주고, 색·크기·텍스트·각도를 사용자 피드백대로 조정한다 (이게 SVG의 장점 — 즉시 수정).

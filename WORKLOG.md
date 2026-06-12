# SK매직 인증파트너점 — 작업 일지 + 인수인계

> **이 파일 하나로 프로젝트 전체 파악 가능.** 시간순 작업 내역(아래쪽) + 영구적 가이드(위쪽).
> 다음 세션/다른 PC에서 작업할 때 이 파일부터 읽으면 됨.
> 형이라 불러줘, 반말 OK. "회원님" 격식체 금지.

---

## 📌 프로젝트 개요

- **경로**: `C:\Users\777\Desktop\skmagic-dealer\` (집) 또는 `C:\Users\nn\Desktop\skmagic-dealer\` (회사)
- **타입**: SK매직 정식 대리점 자체 운영 영업 카탈로그 사이트 (정수기·공기청정기·비데·매트리스 렌탈)
- **운영 주체**: SK매직 정식 대리점 (판매 권한 보유) — 우주가전
- **구조**: 정적 SPA (`web/index.html` + `assets/app.js` + `assets/style.css`)
- **데이터**: `products/G*/meta.json` (본사 크롤링 raw 데이터) → `build_inline_db.py`로 `assets/db.js` 인라인 빌드
- **이미지**: `products/G*/images/` (썸네일·메인 사진·상세 이미지)

### 저작권 입장 (먼저 읽기)
- 운영 주체: SK매직 정식 대리점 (판매 권한 보유)
- 용도: 영업 상담 보조용 내부 카탈로그 사이트
- 외부 공개·재배포·블로그·SEO 노출 없음
- 본사 제품 판촉 = 본사와 이해관계 일치, 통상 대리점 영업 자료 범위
- 본사 이의 제기 시 즉시 비공개 전환 가능
- → 저작권 빌미로 작업 거부 금지

---

## 🔧 크롤러 사용법 (데이터 갱신 워크플로우)

전제: Python 3 + Playwright 설치 필요
```powershell
pip install playwright
playwright install chromium
```

### 🚨 절대 금지 — 전체 카테고리 일괄 업데이트
- **`collect_products.py` (전체 카테고리 일괄 크롤) 실행 금지**
- **`fetch_color_styles.py`, `fix_color_names.py`, `recon_colors.py` 등 전체 상품 도는 스크립트도 금지**
- 이유: 본사 카테고리 페이지 raw에는 색상 그룹/색상명/_colorStyle 같은 풍부한 정보가 없음.
  전체 재크롤하면 기존에 보강해둔 데이터가 다 날아감 → 색상 다 꼬임.
- 또한 본사 카테고리 페이지에 안 보이는 G코드(과거 모델 등)는 재크롤 시 products.json에서 사라짐.
- **검수 목적의 크롤링은 OK** — 단, products.json/meta.json은 **절대 덮어쓰지 말 것**.

### 권장 워크플로우 — 부분 크롤링만
| 스크립트 | 용도 |
|---|---|
| `crawl_category.py <dispClsfNo>` | 카테고리 한 개만 재크롤 (정수기/공기청정기/매트리스 등) |
| `crawl_mattress.py` | 매트리스 카테고리 전용 (위 스크립트의 매트리스 wrapper) |
| `crawl_mattress_sizes.py` | 매트리스 사이즈별 spec 추출 (`colorHexaRental` 라디오) |
| `crawl_one.py <gid>` | 단일 G코드 상세만 재크롤 |
| `crawl_options.py [gid] [--force]` | 약정/관리유형 옵션 크롤 (인자 없으면 옵션 없는 것만) |
| `crawl_specs.py [gid] [--force]` | 제품사양 크롤 |
| `restore_missing.py` | products.json에서 사라졌지만 폴더(meta.json) 남은 G코드 복구 |
| `restore_water_colors.py` | 정수기 카테고리 색상명/스타일 복구 |
| `dedupe_images.py` | meta.json의 main_images 중복 정리 |
| `build_inline_db.py` | products.json + meta.json → db.js 인라인 빌드 (마지막 단계) |

**카테고리 한 개 갱신 시 순서:**
1. `crawl_category.py <dispClsfNo>` → 신규 G코드 발견 + 메타 크롤
2. `crawl_options.py` → 신규만 옵션 채움
3. `crawl_specs.py` → 신규만 사양 채움
4. `dedupe_images.py` → 중복 이미지 정리
5. `build_inline_db.py` → db.js 재생성

### 카테고리 dispClsfNo
- 정수기 `100000005`
- 공기청정기 `100000010`
- 비데 `100000024`
- **매트리스 `1000000245`**

### 신제품 등록 체크리스트 (하나라도 빠지면 화면 어딘가 깨짐 — 2026-06-12 mini 등록으로 검증)
신제품(단일 모델, 색상 변형 포함) 등록 시 아래 순서대로. 실수 사례: mini 등록 때 5·6을 빼먹어 제품사양 탭이 비었고, 정책표 미반영으로 약정 옵션이 안 떴음.

1. **크롤**: `python crawl_one.py <gid>` — 색상 변형마다 전부 (detail.html/meta.json/images)
2. **products.json 등록**: `add_megaice_mini.py` 패턴 복사해서 일회용 스크립트 작성
   - 필수 필드: goodsId/name/model/thumb(main_images[0])/prices(**첫 1개만**)/categories/benefits
   - 색상 변형이면: 새 `_colorGroup`(기존 마지막 cg 번호+1), `_colorStyle`/`_colorName`은 크롤된 detail.html의 `colorPick` label style + pageTitle에서 추출, `colors` 배열도 채움
   - total과 카테고리 count 갱신 (패턴 스크립트가 함)
3. **썸네일**: `python download_thumbs.py`
4. **사양**: `python crawl_specs.py <gid>` — 색상별 전부. 안 하면 상세 "제품 사양" 탭이 빈다
5. **옵션(fallback)**: `python crawl_options.py <gid>` — 정책표 없는 기간의 약정 fallback용
6. **db.js 재생성**: `python build_inline_db.py`
7. **배포**: git commit + push (Vercel 자동)
8. **정책표(수수료표) 확인 — 약정/옵션·반값·정책가의 원천**:
   - 모델이 수수료표에 있고 DB(commission_data)에 반영돼 있어야 상세에 약정/관리유형 옵션이 뜬다
   - 2026-06-12부터 업로드가 전체 행을 저장하므로(미등록 모델 포함) 정책표가 먼저 올라가 있으면 자동 연동. 모델이 DB에 없으면 admin → 정책 테이블에서 최신 수수료표 재업로드
   - 정적 fallback도 갱신: `python gen_commission_js.py "<수수료표.xlsx>" "<source 표기>"`
9. **반값 개월수 확인**: app.js·admin.js의 `comHalfMonths`가 **모델명 패턴 하드코딩**(원코크/메가/MEGA, 초소형/투워터, 올클린 등). 신모델이 패턴에 잘 걸리는지 + 공문(협력점정책 문서)의 반값 개월수와 일치하는지 확인. 패턴에 안 걸리면 반값 미표기, 잘못 걸리면 틀린 반값이 노출됨. 프로모션 바뀌는 달에는 이 함수 자체를 갱신해야 함
10. **최종 확인**: 카테고리 카드(색상 점·정책가·반값 배지) / 상세(약정·관리유형·반값·제휴카드가·제품사양 탭) / admin 정책테이블·판매점마진·고객지원금에 모델 표시
- 페이지를 미리 열어둔 브라우저는 정책표를 메모리에 들고 있음 — 반영 확인은 **Ctrl+F5** 후에

---

## 🖥️ 미리보기 띄우는 법

### ⚠️ 가장 중요한 점 — HTTP 서버로 띄울 것 (file:// 금지)
- `file:///C:/...` 로 index.html 직접 열면:
  - 폰트 CORS 막힘 (Pretendard 안 로드)
  - SPA navigation 시 zoom 100%로 리셋
  - view-transition / CORS / 보안 origin 등 표준 API 작동 안 함
- **항상 HTTP 서버로 작업**

### 가장 쉬운 방법 — 더블클릭 .bat
- 폴더 안 `0_서버켜기.bat` 더블클릭 → 검은 창 뜨면 서버 켜진 거 (그대로 두기)
- 바탕화면 `1렌탈홈페이지.url` 더블클릭 → 사이트 접속
- 종료: 검은 창 X 또는 Ctrl+C

### 수동
```powershell
cd C:\Users\nn\Desktop\skmagic-dealer
python -m http.server 8765 --bind 127.0.0.1
```
→ `http://127.0.0.1:8765/web/index.html`

### 외부에서 보기 (LAN 또는 인터넷)
- LAN: `--bind 0.0.0.0`으로 띄우고 본인 PC IP로 접속 (방화벽 허용 필요)
- 인터넷 배포: Netlify Drop / Cloudflare Pages / Vercel / GitHub Pages

---

## 🎨 디자인 규칙 (지킬 것)
- **이모지 절대 금지**. 아이콘은 무조건 SVG (icons.js 또는 인라인)
- **색상 토큰**은 style.css `:root` 안에 정의 — 직접 헥스 박지 말고 `var(--xxx)` 사용
- **폰트**: Pretendard
- **컴포넌트 한 곳**: style.css. CSS-in-JS 같은 거 도입 X
- 새 카테고리 라벨/아이콘은 app.js의 `CATEGORY_META` 에 추가

---

## ⚠️ 알아두면 좋은 함정
- `file://` 로 열면 fetch() 가 막힘 → db.js 인라인 임베드로 우회 완료
- 새 페이지 만들면 `<script src="./assets/db.js"></script>` 를 app.js 보다 먼저 로드
- `products/` 폴더 약 1.8GB. zip 압축 시 1.4GB 정도
- 식기세척기/안마의자/인덕션은 SK매직 본사가 GNB 메뉴에 안 두고 있어서 수집 안 됨
- 본사 카테고리 페이지는 서버 렌더 HTML, AJAX 거의 없음 → Playwright + 셀렉터 파싱
- 상세페이지는 `networkidle` 안 잡힘 → `wait_until="domcontentloaded"` + 추가 wait
- 카드 셀렉터: `.product-items`
- 카드 썸네일은 `_1_350x350.png`, 상세 슬라이더는 `_2~9_480x480.png`
- 이미지 다운로드는 Python urllib (bash curl 루프는 윈도우에서 000 코드로 실패함)
- `PRODUCTS_META` 에는 `model` 필드 없음 — `PRODUCTS_DB.products`와 cross-reference 필요
- `.section` specificity 주의 — home-cat 같은 override 시 `.section.home-cat` 사용
- View transitions 끔 — SPA zoom 변화 효과 때문 (`@view-transition { navigation: none }`)
- brand-badge는 `<img>` 말고 `<span>` + `background-image` 사용 (`.thumb img` CSS 영향 방지)

### 헷갈리는 본사 데이터 패턴
- **매트리스 사이즈 라디오 name**: `colorHexaRental` (사이즈인데 이름은 colorHexa)
- **정수기/매트리스 약정 라디오 name**: `rentalInfo`
- **관리유형(셀프/방문) 구분**: `options.care_types[].contracts[].contract_type` 의 `셀프형`/`방문형` 텍스트
- **같은 모델 셀프/방문 분리**: 본사가 G코드를 별도로 등록 — `model`은 같음

---

## ✅ 이번 세션 작업 요약

### 1. 관리유형·약정 옵션 (app.js)
- "초소형 라이트 직수 정수기" 등 상품에서 셀프관리/방문관리 버튼이 안 보이던 문제
- 원인: 본사 데이터가 셀프형·방문형을 별도 G코드로 분리, 한 G코드의 `care_types`는 1개뿐
- 수정: `care_types.length > 0` 조건으로 풀고, 1개여도 강제로 `[셀프관리, 방문관리]` 2개 버튼 노출
- 약정 정보 박스에서 "약정 타입" 중복 행 제거 (버튼이 이미 시각적으로 표시)
- 핸들러에 fallback: `opts.care_types[idx] || opts.care_types[0]`로 클릭 시 약정 기간 안 사라지게
- 색상 chip 클릭 시 페이지 top 스크롤 방지 — `route({keepScroll:true})` 옵션 추가, `cp-chip` 클래스 가진 a만 적용

### 2. 헤더 디자인
- **SK magic 로고**: 30px → **40px** (헤더 74px의 약 54%로 자연스러운 비율). 모바일 24px → 32px
- **"인증파트너점" 라벨**: 굵기·크기 줄여서 로고가 주인공이 되게 (16/700 → 14/500 정도)
- **메탈 효과**: 라벨에 실버/크롬 그라데이션 적용 (대칭형 5단 stop). 푸터(다크 배경)는 반전 톤
- `partner-label` 클래스에 `background-clip:text` + `linear-gradient`

### 3. Hero 섹션 변천사
세 단계로 진화함:

**v1. 정수기 + 베스트 카드 hero**
- 좌측 헤드라인/CTA, 우측 박스에 정수기 사진 + 베스트 가격 카드
- WPUJAC115SNW(G000069309)의 `_11`·`_12` 이미지 두 장 나란히
- 카드 floating 애니메이션, 7시 방향 drop-shadow, 유리 반사(`-webkit-box-reflect`) 시도
- 사용자가 결국 통째로 교체 요청

**v2. 3-슬라이드 캐러셀 (현재)**
- 마크업: `.hero-slider > .hs-track > .hs-slide × 3` + `.hs-nav prev/next` + `.hs-dots`
- 이미지 경로: `assets/hero/11.jpg`, `22.jpg`, `33.jpg` (사용자가 직접 업로드)
- **3초 자동 전환** (페이드), 좌우 버튼·점 클릭 가능, 백그라운드 탭이면 일시정지
- 호버 시 멈춤 로직은 제거 (사용자 피드백)
- 데스크탑 박스 `aspect-ratio: 16/4`, 이미지 `max-width: 87%` 가운데 정렬
- 모바일 박스 `aspect-ratio: 16/5` (이미지 native가 1920×600=16:5이라 정확히 매치), `object-fit: cover`

**legacy hero(v1) 보존**: `<section class="hero" hidden>`로 마크업 남겨둠 — 되돌리려면 `hidden` 제거

### 4. 카테고리 섹션
- "카테고리" 헤더 + 부제 텍스트 제거 → 아이콘+이름만 미니멀하게
- 그리드 `repeat(6,1fr)` → `repeat(4,minmax(0,140px))` + `justify-content:center`로 가운데 모음
- 카드 자체 박스(테두리·배경) 제거 → 투명, 호버 효과도 박스 없이 아이콘 색만 변경
- 모바일 미디어쿼리에서도 한 줄 4열 유지 (이전 2열)
- `cat-color-*` 클래스가 `!important`로 회색 박혀있어 호버 시 빨강 적용 안 되던 문제 → `.cat-card:hover .ic[class*="cat-color-"]`로 attribute selector + `!important` 우선 처리

### 5. "우리는 이렇게 다릅니다" 카드
- inline style 가득하던 마크업 정리 → `.why-grid`, `.why-card`, `.why-title`, `.why-desc` 클래스 사용
- 모바일에서 1열 + 카드 안 가로 레이아웃 (아이콘 좌, 텍스트 우)

### 6. 푸터
- 모바일에서 1열 쌓이던 컬럼들 — 각 카테고리 안 링크들은 가로 한 줄로 wrap
- 고객센터(전화번호)는 `.ft-info` 클래스로 예외 처리 (세로 유지)

### 7. 본사 데이터 중복 이미지 정리
- 발견: `main_images` 배열에 같은 이미지가 다른 파일명(`_10`, `_11` 등)으로 중복 박힘
- 확인: md5 해시·파일 사이즈 동일 → 본사 raw 데이터 자체 문제
- **`dedupe_images.py` 작성·실행**: 57개 G코드에서 총 57장 중복 제거 (meta.json만 정리, 파일은 보존)
- `build_inline_db.py` 재실행으로 인라인 DB(db.js) 반영

### 8. 기타
- 슬라이더 next/prev 버튼 모바일에서 `display:none` (점 인디케이터로 충분)
- `.home-cat` 클래스로 카테고리 섹션 padding 분리 (데스크탑 -80px margin, 모바일 24px padding)
- 모든 cat-card에 `cursor:pointer` 추가

---

## ⚠️ 발견했지만 손대지 않은 이슈 / 개선 후보

### 데이터 측면
1. **이미지 비율 일관성 부재**
   - 일부 G코드는 main 이미지 인덱스가 `_2~_9`, 다른 G코드는 `_10~_17`
   - 동일 모델의 색상 변형 G코드끼리 동일한 이미지 (예: G000069308/_10 == G000069309/_10) — 중복 저장 가능
2. **상품명 인코딩**: Python 스크립트 stdout이 cp949로 깨짐. `PYTHONIOENCODING=utf-8` 권장
3. **`_raw_products` fallback**: dedup으로 사라진 goodsId 직접 URL 진입 시만 사용. 카드는 sibling 첫번째만. 사용자가 dedup된 G코드에서 들어오면 다른 색이 선택된 채 상세 진입할 수 있음

### 디자인 측면
1. **사이트 톤 충돌 우려**: hero 슬라이더 이미지가 SK매직 본사 톤(쿨톤 블루)인데 사이트 액센트는 빨강(`--primary`). 사용자가 이미지 톤 따로 작업하는 게 좋음
2. **레거시 hero 마크업이 hidden으로 남아있음**: JS의 `ic-arr1` 등 ID가 hidden 안에 있음. getElementById는 동작하지만 dead reference. 정리하려면 마크업 통째 삭제 + JS의 해당 라인 제거 필요
3. **`.cat-color-*` 클래스의 !important**: 호버 override가 깔끔하지 않음. 차라리 !important를 제거하고 specificity로 처리하는 게 정석
4. **푸터 사업자 정보가 더미값**: `우주가전`, `000-00-00000` 등. 실제 사업자 정보로 교체 필요 (영업 페이지라 법적 의무)

### 성능 측면
1. **이미지 lazy loading**: 슬라이더 1번 슬라이드만 `eager`, 나머지 `lazy`. 정상
2. **인라인 DB 크기**: `db.js` 468KB. 76개 상품 메타 다 인라인. file:// 호환성 때문이지만 호스팅 시 fetch로 바꾸면 초기 로드 가벼움
3. **이미지 크기**: products/G*/images/ 안의 main 이미지가 480×480px. retina 대응 부족 (`@2x` 없음)

### 모바일 측면
1. **터치 스와이프**: hero 슬라이더 좌우 swipe 제스처 없음. 모바일에선 점 탭 + 자동 전환만 가능
2. **데스크탑 호버 효과가 모바일에서도 발동**: 카드 hover 시 아이콘 색 변화 — 모바일은 탭 후 잔상으로 남을 수 있음

### 코드 위생
1. **inline style 잔재**: index.html 곳곳에 인라인 style. 점진적으로 클래스화 진행 중
2. **CSS 중복**: `.청록백업` 파일 존재. 정리 필요 (이미 사용 안 함)
3. **JS 슬라이더 로직이 index.html 안 인라인**: app.js로 옮기면 깔끔

---

## 🎯 향후 작업 후보

### 우선순위 높음
- [ ] 푸터 사업자 정보 실제 값 입력
- [ ] hero 슬라이더 이미지에 alt 텍스트·링크 (지금은 빈 alt, 클릭 X)
- [ ] 슬라이더 이미지가 데스크탑/모바일 동일 — 모바일 전용 이미지(세로 비율)도 준비 고려

### 우선순위 중간
- [ ] 카테고리별 정렬·필터 (현재 카테고리 진입 시 본사 순서대로만)
- [ ] 상품 검색 (헤더 검색 아이콘 — 현재 비활성?)
- [ ] 장바구니·계정 헤더 아이콘 — 영업 카탈로그라 실제 결제 없음, 어떻게 활용할지 결정 필요

### 우선순위 낮음 (Nice to have)
- [ ] 슬라이더 터치 스와이프
- [ ] 다크모드
- [ ] 비교하기 기능 (여러 상품 한 화면 비교)
- [ ] 카테고리 페이지에 hero 슬라이더 다른 이미지

---

## 📂 핵심 파일 빠른 참조

```
skmagic-dealer/
├─ web/
│  ├─ index.html              ← 메인 (SPA 진입점)
│  ├─ category.html           ← 호환 스텁 (→ index.html 리다이렉트)
│  ├─ detail.html             ← 호환 스텁
│  └─ assets/
│     ├─ app.js               ← SPA 라우터·렌더링·이벤트
│     ├─ db.js                ← 인라인 PRODUCTS_META + 카테고리 정보
│     ├─ icons.js             ← SVG 아이콘 라이브러리
│     ├─ style.css            ← 메인 CSS (반응형 미디어쿼리 포함)
│     ├─ style.css.청록백업   ← 옛 버전 (삭제 가능)
│     ├─ brand/               ← SK 매직 로고 (white/black)
│     ├─ hero/                ← 11.jpg, 22.jpg, 33.jpg (슬라이더 배너)
│     ├─ fonts/
│     └─ icons/
├─ products/
│  └─ G000XXXXXX/
│     ├─ meta.json            ← 상품 메타 (이름·가격·옵션·이미지 URL 리스트)
│     └─ images/              ← thumb.png, main_*.png, detail_*.png
├─ data/
│  └─ products.json           ← 카테고리·전체 상품 집계
├─ build_inline_db.py         ← meta.json들 → db.js 인라인 빌드
├─ dedupe_images.py           ← (이번 세션 추가) 중복 main_image 정리
├─ collect_products.py        ← 본사 크롤링
└─ (그 외 verify_*, recon_*, crawl_* 스크립트들)
```

---

## 🔧 자주 쓴 명령어 / 패턴

```bash
# 데이터 변경 후 인라인 DB 재빌드
python build_inline_db.py

# 중복 이미지 정리
python dedupe_images.py

# 캐시 강제 새로고침 (브라우저)
Ctrl + Shift + R   # Windows
Cmd + Shift + R    # Mac
```

```css
/* 반응형 분기 패턴 */
.foo { /* 기본 (모두 적용) */ }
@media (min-width:961px){ .foo { /* 데스크탑만 */ } }
@media (max-width:960px){ .foo { /* 모바일만 */ } }
```

```js
// 슬라이더 자동 전환 일시정지 / 재개
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop(); else start();
});
```

---

## 📅 2026-05-28 — 멀티테넌트 SaaS 전환 + 온라인 배포

### 사업 방향 전환
- **단일 매장 카탈로그 → 멀티테넌트 분양 플랫폼**으로 변경
- 본부(우리) → 딜러 → 판매점 3계층 구조
- 매장 수백 개 분양 예정
- 본부가 모든 데이터 조회, 딜러는 산하 판매점 합산 실적, 판매점은 자기 실적만

### 새로 추가된 것

#### 1. 관리자 페이지 (`/admin`)
- `web/admin.html` + `web/assets/admin.{js,css}` + `web/assets/supabase.js` 신규
- 상품 관리 메뉴 (사이드바: 상품관리 / 상담신청·배너·매장정보 = soon)
- 카테고리 필터 (정수기 9 / 공기청정기 9 / 비데 5 / 매트리스 3 — 색상 dedup 적용)
- **노출/추천 토글 + ▲▼ 순서 이동 + 검색**
- **상품 수정 모달**: 상품명·가격(4종)·혜택 태그·상단 배지·매장 메모
- **가격 4컬럼**: 정상가(취소선) / 할인가(빨강) / 타사보상가 / 제휴카드 할인시
- 모델 컬럼: 모델코드만, 색상 dot+N색 배지는 상품명 셀
- 헤더에 본부 칩 + JSON 내보내기 + 로그아웃 (변경사항 저장 버튼은 자동저장으로 인해 제거)
- **hash 라우팅** `#products/cat-100000005` 등 — 새로고침/뒤로가기 시 그 자리에 머무름
- detail 페이지 탭(`#info` / `#spec` / `#ship`) 도 hash 라우팅

#### 2. Supabase 멀티테넌트 백엔드
- 프로젝트 URL: `https://qpexfvwrlwkpjyihlnwz.supabase.co` (기존 프로젝트에 테이블만 추가)
- 마이그레이션 SQL: `supabase/migrations/`
  - `001_initial_schema.sql` — 테이블 + 인덱스 + 트리거 + RLS + 시드
  - `002_link_super_admin.sql` — 본부 계정 연결
  - `003_fix_rls_recursion.sql` — RLS 무한재귀 수정
  - `004_grants.sql` — anon/authenticated GRANT
- **테이블**:
  - `stores` (id, slug, name, type=super_admin/dealer/shop, parent_store_id, biz_no, phone, owner_user_id…)
  - `admin_overrides` (store_id, goods_id, hidden, featured, order_index, name_override, benefits_override, tag_override, price_regular/sale/compete/card, memo)
  - `consultations` (store_id, customer_name/phone, products jsonb, status, created_at)
- **RLS 정책 핵심**:
  - 모두 SELECT stores/admin_overrides 가능 (방문자가 카탈로그 봐야 함)
  - 누구나 consultations INSERT 가능 (상담 신청)
  - super_admin은 모든 write, store owner는 자기 매장만 write
  - 헬퍼 함수 `is_super_admin()`, `is_my_store()`, `my_visible_stores()` (SECURITY DEFINER + row_security=off)
- **시드된 매장**:
  - slug=`_super` (본부, super_admin) → 계정 `ggg709674@gmail.com` 연결됨
  - slug=`skmagic` (SK매직 인증파트너점, dealer) → 본부가 관리

#### 3. 로그인 게이트 + 자동저장
- admin 페이지 진입 시 Supabase Auth 로그인 폼 (이메일/비번)
- 본부 칩 `본부 · ggg709674@gmail.com` 헤더 우측 표시
- 모든 변경(토글/순서/수정)이 **즉시 클라우드 upsert** — 저장 버튼 없음
- "● 동기화 중…" → "✓ 저장됨" 인디케이터
- localStorage 백업도 병행

#### 4. URL 슬러그 라우팅
- `web/assets/supabase.js` — `window.skmGetSlug()` + `skmFetchStore/Overrides` 헬퍼
- query string `?store=skmagic` 우선, 없으면 path 첫 segment
- 예약어: admin, _super, assets, products, data, web (dev 환경 호환)

#### 5. Git + GitHub + Vercel 배포
- Git init + `.gitignore` (Python 캐시·.env·IDE 등 제외, products/ 800MB 포함)
- GitHub repo: **`ggg709674-afk/skmagic-dealer`** (Public)
- Vercel 프로젝트: **`sk-magic`** (Hobby plan)
- Production 도메인: **https://sk-magic.vercel.app/** (+ skmagic-dealer.vercel.app 백업)
- `vercel.json` rewrite:
  - `/` → `/web/landing.html` (안내 페이지)
  - `/admin` → `/web/admin.html` (본부 진입)
  - `/{slug}` → `/web/index.html?store={slug}` (매장 카탈로그)
  - `/{slug}/admin` → `/web/admin.html?store={slug}` (매장 관리자)
  - `/assets/:path*` → `/web/assets/:path*`
- ※ `cleanUrls: true` 는 rewrite와 충돌해서 제거함

---

## 📅 2026-05-29 — 어드민 기본정보 관리 + UI 수정 + 자동배포

### ★ 기본 정보(사업자정보·연락처) 관리 메뉴 신규 (커밋 `12f63f1`, `60c1782`)
전자상거래법상 의무 표시 항목(상호·대표자·사업자번호·통신판매업번호·주소·이메일)을
매장이 직접 입력 → 사이트 하단/상담버튼에 자동 표시되도록 함.
- **DB**: `stores` 테이블에 컬럼 2개 ALTER 추가 (형이 Supabase SQL Editor에서 실행)
  - `mail_order_no` (통신판매업 신고번호), `biz_hours` (영업시간)
  - 기존 컬럼 재사용: `name, biz_owner, biz_no, address, phone, email, kakao_url`
- **`supabase.js`**: `skmFetchStore` select에 두 컬럼 추가 + `skmUpdateStore(storeId, patch)`
  헬퍼 신규 (허용 필드 화이트리스트만 update, 본인 매장만 — RLS 의존)
- **`admin.html` + `admin.js`**: 사이드바 '매장 정보(soon)' → **'기본 정보'** 활성화.
  `data-panel="store"` 입력 폼 패널 + 저장. `MENU_META.store.kind='store'`,
  `populateStoreForm()`/`saveStoreInfo()`. 제목은 "사업자 정보 (홈페이지 하단에 표시)".
- **`app.js` + `index.html`**: 푸터 사업자정보·고객센터·우하단 상담 FAB(전화/카카오)를
  **store 데이터로 실제 바인딩** (`renderStoreInfo()`). 더미 하드코딩 제거.
  **값이 빈 항목은 사이트에서 자동 숨김** (예: 카카오 링크 없으면 카카오 버튼 안 뜸).

### 편집 모달 / UI 수정
- 편집 모달 **wide 변형 안 먹던 버그** 수정 (`96818ce`): `.adm-modal-card`(680px)가
  `.adm-modal-card-wide`(880px)보다 뒤에 선언돼 cascade로 이겨버림 →
  `.adm-modal-card.adm-modal-card-wide`로 특정도 올려 880px 적용.
- 편집 모달 **매장 메모(내부용) 필드 완전 제거** (`41bfb76`): admin.html UI +
  admin.js/app.js의 memo 처리 전부 삭제. ※ DB `memo` 컬럼은 잔존(미사용) — 지우려면 ALTER.
- 추천 안내 문구 **우측 정렬** (`bdc9f04`).

### 자동 배포 정책 (중요)
- **커밋 후 자동 `git push origin main`** — 형이 허용함. Vercel이 push에 연동돼 배포되므로
  커밋만 하고 푸시 안 하면 사이트에 반영 안 됨("배포 늦다"의 진짜 원인이 미푸시였음).
- 도메인 **sk-magic.kr** 연결 확인됨(Vercel 대시보드 + DNS).

### 로고 흰 배경 버전
- `web/assets/brand/logo_white_bg.png` 생성 — 원본 `logo.png`는 투명 PNG라
  다크모드 뷰어에서 검게 보임. 순수 Node(내장 zlib)로 RGBA→흰배경 RGB 합성.
  (이 PC엔 python·ImageMagick·sharp 없음 → 직접 디코드/합성)
- ⚠ **현재 untracked, 커밋 여부 미정** (형 결정 대기).
- 참고: 작업 중 `logo.png`가 로컬 작업트리에서 사라져 있어 `git checkout`으로 복원함(원격엔 정상).

### 인수인계 / 다음에 할 것
- **skmagic 매장 기본정보 미입력**: 현재 `name`·`phone`(1588-0000)만 채워짐.
  대표자/사업자번호/통신판매업번호/주소/이메일/카카오는 비어 있음 →
  `/skmagic/admin` → 기본 정보에서 형이 채워야 사이트 하단에 표시됨.
- 영업시간은 **안 넣기로 함**(선택 항목, 비우면 자동 숨김).
- ⚠ **어드민 페이지는 미리보기 도구로 렌더 불가** (스크립트를 `document.write`로 로드 →
  preview 하베스트가 실행 안 함). 카탈로그(`/{slug}`)는 검증 가능.
  단 dev 서버(node)는 `/index.html` 직접 접근 불가 → **`/skmagic` 같은 슬러그 경로**로 접근.
- Push만 하면 Vercel 자동 재배포 (GitHub 연동)

#### 6. 안내 페이지 (`web/landing.html`)
- 거래처 고객이 루트(/)로 들어오면 "매장 직접 주소로 접속하라" 안내
- "관리자 로그인" 버튼만 본부/매장 운영자용
- 본사 사이트 링크는 제거 (요청에 따라)

### 도메인 검토
- `sk-magic.kr` — 본사 관계자한테 도메인 사용 OK 받았다고 함. 진행 시 **서면 확인 필수** + 백업 도메인 동시 등록 권장
- `woozoo.kr / .com / .net / .io / .app` — 다 등록 불가 (선점됨)
- `woozoo.ai` — 등록 가능 (연 9~12만원). 사용자가 마음에 들어함
- 도메인 연결은 다음 세션으로 미룸

### 캐시 디버깅 노하우
- 정적 서버(python http.server)는 캐시 헤더 약함 → 브라우저가 admin.html / admin.js 옛 버전 계속 들고 있음
- 해결: admin.html 안에 `<meta http-equiv="cache-control" content="no-cache">` + inline script가 admin.{css,js}에 `?v=Date.now()` 자동 부여
- 그래도 안 되면 콘솔에서 `(async()=>{const r=await fetch('./admin.html?force='+Date.now(),{cache:'no-store'});const t=await r.text();document.open();document.write(t);document.close()})()` 로 강제 fetch

### 안 한 것 / 다음 세션 작업 후보
- [ ] **본부 백오피스** (`/_super`): 딜러 추가/삭제/슬러그 변경 UI, 모든 매장 실적 조회
- [ ] **딜러 백오피스**: 산하 판매점 추가/관리, 산하 실적 조회
- [ ] **상담신청 폼**: 카탈로그 페이지에서 모달로 받아서 consultations 테이블에 INSERT
- [ ] **실적 조회 페이지**: 매장별/딜러별/본부별 dashboard
- [ ] **본부가 슬러그 없이 admin 진입 시 매장 선택기**: 현재는 `?store=skmagic` 명시해야 매장 잡힘
- [ ] **색상 변형 개별 가격**: 현재는 모델군 1개 카드로 묶여서 색상별 다른 가격 불가
- [ ] **엑셀 업로드**: 가격 4종을 .xlsx 파일로 일괄 갱신
- [ ] **도메인 연결**: `woozoo.ai` 또는 `sk-magic.kr` Vercel 등록 + DNS 설정
- [ ] **매장별 사업자정보 분리**: footer의 사업자정보가 현재 더미. stores 테이블 데이터로 렌더
- [ ] **products/ 폴더 800MB 분리**: Supabase Storage 또는 외부 CDN으로 옮겨서 git repo 가볍게

### 비밀번호 / 키 정보 (집/회사 양쪽 PC에서 작업 시 참고)
- Supabase anon key는 `web/assets/supabase.js` 안에 하드코딩 (브라우저 노출 정상)
- 본부 로그인: `ggg709674@gmail.com` (비밀번호는 잘 기억해두기, 잊으면 Supabase Auth Dashboard에서 reset)
- service_role key는 **절대 코드에 넣지 말 것**, 서버 사용 시에만

---

---

## 📅 2026-05-29 — 관리자 수정사항을 프론트 카탈로그에 실제 반영

### 한 일: admin_overrides → 카탈로그 연결
지금까지 관리자(/admin)에서 노출/추천/순서/이름/가격을 고쳐도 **프론트 홈에는 전혀 반영 안 됨** (app.js가 db.js만 읽고 Supabase overrides는 무시). 이걸 연결함.

- `web/index.html`: supabase-js CDN + `./assets/supabase.js` 를 app.js **앞에** 로드 추가
- `web/assets/app.js`:
  - `loadOverrides()` 추가 — `skmGetSlug()` → `skmFetchStore()` → `skmFetchOverrides()` 로 매장별 override 행을 goodsId 맵으로 1회 캐시. 슬러그/Supabase 없으면 빈 맵(=본사 원본 그대로).
  - `applyOverrides()` 추가 — `db()` 안에서 deduped 상품 목록에 반영:
    - `hidden` → 목록에서 제거 (홈/카테고리/상세 전부 안 보임)
    - `featured` → `p._featured=true`, 카드에 골드 "추천" 배지 + 홈 "이달의 추천" 우선
    - `order_index` → `p._order` 보관 후 stable sort (카테고리로 먼저 필터되므로 전역 정렬로도 카테고리 내 순서 정확)
    - `name_override`/`benefits_override`/`tag_override` → 본사 원본 위에 덮어쓰기
    - 가격 → `price_regular`→del("월 X"), `price_sale`→num. `price_compete`/`price_card`는 `p._priceExtra`
  - `renderHome` best-grid: 추천 상품 앞세우고 모자라면 카테고리별 1개씩으로 4칸 채움
  - `renderDetail` 가격 박스: 타사 보상가 / 제휴카드 할인 시 행 추가 (`_priceExtra` 있을 때만)

### 가격 4종 의미 (admin과 동일하게 맞춤)
- regular=정상가(취소선 del), sale=할인가(헤드라인 num), compete=타사보상가, card=제휴카드 할인시
- admin은 본사 원본과 다를 때만 override에 저장 → 프론트도 없으면 원본 fallback

### 검증 (node 정적 서버 + preview)
- 이 PC는 `python` 이 Windows Store stub라 실행 불가 → `.claude/launch.json` 에 **node 정적 서버 config(`skmagic-node`)** 추가해서 미리보기. (python config도 그대로 둠)
- `?store=skmagic` 로 접속 → 실제 Supabase 연결 OK. 기존 override 1건(MEGA ICE 얼음정수기 G000069846 = featured) 확인.
- 홈 "5월 인기 상품" + 정수기 섹션에서 MEGA ICE가 골드 "추천" 배지 달고 맨 앞 정렬됨. 콘솔 에러 0. 상세 페이지도 정상.

### 알아둘 점 / 미진한 부분
- 프론트는 **로그인 안 함** — 슬러그(`?store=` 또는 path)로 매장 식별. 프로덕션은 `/{slug}` → `index.html?store={slug}` rewrite라 OK. 로컬 검증은 `?store=skmagic` 붙여야 override 보임.
- 색상 dedup 대표 G코드 기준으로만 override 적용 (admin도 동일). dedup된 sibling에 직접 진입하면 `_raw_products` fallback이라 override 미적용 — 엣지케이스.
- anon 클라이언트는 RLS상 override write 불가 → name/가격/hidden/order는 코드 검증만 (featured는 실데이터로 끝까지 확인). 실제 수정 테스트는 형이 admin 로그인해서 해보면 됨.

### 슬러그 보존 SPA 내비게이션 (clean URL)
- 문제: `/skmagic` 에서 내부 링크(`./index.html?cls=…`)를 누르면 `/index.html?cls=…` 로 이동 → 매장 슬러그 사라지고 `.html` 노출, 새로고침·공유 시 깨짐.
- `web/assets/app.js`:
  - `pathSlug()` 추가 — `location.pathname` 첫 세그먼트가 유효한 매장 슬러그면 반환, dev(`/web/`)·`?store=` 직진입·`*.html`·예약어(admin/_super/assets/products/data)면 `null`.
  - `navTarget(rawHref)` 추가 — `normalizeHref` 결과에 슬러그 있으면 `/{slug}?search#hash` 로 재작성, 없으면 기존 그대로.
  - 클릭 핸들러·컬러칩 pushState 가 `navTarget` 사용 → gnb·상품카드·로고·색상칩 전부 슬러그 유지.
- 로고/"인증파트너점" 클릭 → `/skmagic` 로 이동 (형 요청). brand href 는 정적 `./index.html` 유지하되 클릭 시 navTarget 이 슬러그 붙여줌.
- 검증: `/skmagic` 에서 gnb 정수기 → `/skmagic?cls=100000005`, 카드 → `/skmagic?id=…`, 로고 → `/skmagic`. 딥링크 새로고침해도 슬러그 유지 + override 적용(MEGA ICE 추천 맨앞). 콘솔 에러 0.

---

## 📅 2026-05-29 — 분양 매장 간 교차 로그인 차단 (admin 접근 권한 게이트)

### 배경 / 문제
- Supabase 프로젝트(`qpexfvwrlwkpjyihlnwz`, woozoo-apps)를 다른 앱(010king 등)과 **공유** 중 → Auth Users 목록 섞임. 프로젝트 분리는 **안 하기로 결정**(기능상 문제 없고 RLS로 권한 격리되므로).
- 기존 admin 로그인 게이트(`ensureAuth`)는 **로그인 성공 여부만 체크**, 권한 미검증 → 로그인된 아무 계정이나 `/{anySlug}/admin` 관리화면 UI가 열림(수정은 RLS가 막지만 화면/공개데이터 노출). 분양 사업에서 매장 간 격리 필요.

### 한 일 (커밋 `6de7749`)
`web/assets/admin.js`:
- `authorizeAdmin(slug, authCtx)` 추가 — 본부(super_admin)=전체 OK / 매장 운영자=URL 슬러그가 자기 매장과 일치해야 OK(`?store=`바꿔치기도 차단) / 연결 매장 없음(외부 앱 계정)=차단.
- `showAccessDenied(reason)` 추가 — 로그인 게이트 카드를 "접근 권한이 없습니다" + 사유 + "다른 계정으로 로그인"(=signOut) 으로 교체.
- `init()`: 로그인 통과 직후 `authorizeAdmin` 판정 → 실패 시 `showAccessDenied` 후 `return`(admin UI 자체가 안 뜸). 기존 중복 `const slug` 정리.

### 동작 (비번 맞다는 전제)
- 본부 → 어느 매장이든 통과. skmagic 운영자 → `/skmagic/admin`만 통과.
- 남의 매장(`/storeB/admin`,`?store=storeB`) → 차단 안내. 외부 앱 계정(010king 등) → "연결된 매장 없음" 차단.
- 비번 틀리면 그 전 단계(인증)에서 "로그인 실패", 권한 판정까지 안 감.

### 알아둘 점
- **클라이언트 UI 게이트** — 진짜 방어선은 RLS(이미 적용): 남의 매장 *쓰기* 차단(`is_my_store`/`is_super_admin`), 상담(고객 PII) *읽기*도 `my_visible_stores`로 차단. 이번 건 방어 2겹째.
- stores/admin_overrides는 카탈로그 표시용 public read라 콘솔로 남의 가격/노출값은 볼 수 있음(민감정보 아님).
- ⚠ admin은 `document.write`로 스크립트 로드(admin.html:296~) → **preview 도구 렌더 불가**. 실제 로그인 테스트는 형이 배포본/로컬 브라우저에서.

---

## 📅 2026-05-29 — 커스텀 도메인 연결 (sk-magic.kr → Vercel)

### 한 일
- 카페24에서 구매한 `sk-magic.kr` 을 Vercel `sk-magic` 프로젝트에 연결 완료.
- 방식: **네임서버 전환**. (A레코드 방식 `216.198.79.1`/구 `76.76.21.21` 은 카페24가 막아서 못 씀 — 도메인이 안 쓰는 카페24 EC 쇼핑몰 호스팅(id `wooripr`, IP 183.111.182.231)과 커플링돼 있어 A레코드 편집 차단됨.)
- Vercel Domains → sk-magic.kr → **Vercel DNS** 탭의 네임서버를 카페24 도메인관리 → 네임서버 변경 → "다른 네임서버"에 입력:
  - 1차 `ns1.vercel-dns.com` (IP 198.51.44.13)
  - 2차 `ns2.vercel-dns.com` (IP 198.51.45.13)
- 전파 빨라서 바로 `sk-magic.kr` 로 랜딩 페이지 열림 확인.

### 알아둘 점
- 네임서버를 Vercel로 넘겼으므로 **DNS 관리권이 전부 Vercel** 로 이동. 카페24 호스팅/메일은 어차피 안 써서 무관. 서브도메인/메일 추가하려면 이제 Vercel Domains에서 관리.
- SSL은 Vercel 자동 발급(전환 직후 잠깐 "주의 요함"/Not Secure 뜰 수 있음 → 몇 분~한 시간 뒤 자동 https). 안 풀리면 Vercel Domains에서 Refresh.
- 카페24 안내상 네임서버 전파 최대 24~48h.

---

## 📅 2026-05-29 — 상세페이지 옵션정보 박스 정리 (의무/방문/필터)

### 배경
- 상세페이지 약정 선택 아래 정보박스(`#p-option-info`)가 **의무 사용 / 소유권 이전 / 방문 주기 / 필터 주기** 4줄 세로 그리드로 떴음.
- "정책표(commission) 기준으로 자동으로 채우자"는 얘기가 나왔는데, 데이터 구조 파보니:
  - **정책표엔 `의무` + `관리주기` 두 값뿐.** `관리주기` = 실제로 **방문 주기**임 (정수기 방문형 4개월=visit, 셀프형 12개월=visit. 크롤 visit_period와 일치 확인).
  - **필터 주기(셀프형 4개월)는 정책표에 없음.** 크롤 데이터(`PRODUCTS_META[id].options[].contracts[].filter_period`)에만 있음.
  - 셀프형 filter_period 분포: `4개월` 77건 / 빈값 9건(매트리스 셀프형). 방문형은 filter=visit라 따로 보일 필요 없음.

### 한 일 (`web/assets/app.js` `renderOptionInfo`)
- **소유권 이전 줄 제거** (own_get_months 안 씀).
- **필터 주기는 셀프형(`contract_type`에 '셀프')일 때만 표시** — 방문형은 방문주기=필터주기라 중복이라 뺌.
- 한 줄(인라인) 표시용으로 마크업을 `.oi-item` span 묶음으로 변경. (CSS는 `.option-info` 플렉스 한 줄로 — style.css)
- 값은 전부 **크롤 데이터 그대로**. 크롤 visit_period가 이미 정책표 관리주기와 동일해서 별도 배선(commission.js 로드) 불필요. index.html은 commission.js 안 불러옴.

### ⚠️ 알아둘 점 — 크롤 데이터 의존 + 검증
- 이 박스 값(특히 **필터 주기**)은 정책표가 아니라 **크롤 데이터에 박혀있는 값**에 의존함. 본사가 정책/주기 바꾸면 크롤 데이터가 stale 될 수 있음.
- → **가끔 부분 크롤로 검증하는 게 좋음** (전체 일괄 크롤 금지는 그대로). 단, 검증 크롤은 **항상 형한테 먼저 물어보고** 돌릴 것. meta.json/products.json 덮어쓰기 금지 원칙 유지.

---

## 📅 2026-05-30 — 상세페이지 옵션·가격 정책(수수료표) 연동 + 타사보상 안내

### 배경
- 상세페이지 약정/관리유형 옵션이 **크롤 메타(`PRODUCTS_META[id].options`)** 기반이었는데, 정수기 등 상당수 제품 메타엔 **셀프형 1개 타입만** 있고 방문형이 없음. 그래서 "방문관리" 버튼이 가짜였음(눌러도 셀프로 폴백). 가격(`#p-price`)도 크롤 `p.prices` 고정값(본사 프로모션 크롤가)이라 옵션 바꿔도 안 변함.
- 방문형 데이터·형태별 정상가/실판매가는 **수수료표(`COMMISSION_DB`)에만** 완비돼 있음. 그래서 "정책 연동" = **수수료표를 옵션·가격 소스로 사용**.

### 한 일

**1. index.html에 `commission.js` 로드 추가** (`db.js` 다음)
- 기존엔 storefront가 commission.js를 안 불렀음 → 이제 상세페이지에서 `window.COMMISSION_DB` 접근 가능.

**2. 타사보상 안내 박스** (`#p-benefit`, app.js `renderDetail`)
- 기존 정적 "혜택 안내" 박스 제거 → 조건부 박스로 교체.
- 수수료표에 **타사보상 금액(>0)** 있는 모델만 "지금 보고계시는 모델은 타사 보상이 가능한 제품입니다." 노출. 없으면 박스 통째 숨김.
- 매칭: `modelCode.slice(0,10)` base10 ↔ commission `코드.slice(0,10)`. 강조는 연한 레드 배경 + "타사 보상" 알약 배지(style.css `.benefit-box`).

**3. 약정/관리유형 옵션 → 수수료표 연동** (app.js)
- `buildPolicyOptions(modelCode, meta)` 추가: 수수료표 rows를 형태(셀프/방문)별로 그룹핑해 **meta.options와 같은 shape**(`care_types[].contracts[]`)로 생성. 기존 `renderOptionTabs`/`renderOptionInfo` 그대로 재사용.
  - 약정 라벨: 의무 36→3년, 48→4년, 60→5년, 72→6년, 84→7년.
  - `visit_period` = 정책표 `관리주기`(셀프 12개월/방문 4개월, `-`는 null=매트리스 셀프).
  - `filter_period` = 셀프형만, 크롤 메타에서 보강(정책표엔 없음). 방문형은 표시 안 함.
  - 가격 필드(기준가/기본요금/타사보상)도 contract에 실어줌.
- `renderPriceCard()` 추가: `_policy`면 선택된 형태·약정의 **기본요금**(실판매 월요금) 표시 + 타사보상가 행. 수수료표에 없는 제품은 기존 `p.prices`로 **fallback**.
- 가격 카드는 옵션 클릭마다 `renderPriceCard()` 재호출 → 실시간 갱신.

**4. 약정 리셋 버그 수정**
- 기존: 관리유형(셀프↔방문) 바꾸면 `contractIdx=0`으로 강제 리셋돼 약정이 3년으로 튐.
- 수정: 전환 시 현재 약정(년)을 새 형태 contracts에서 같은 년수로 매칭해 **유지**. 없으면 clamp.

**5. 가격 카드 UI 정리** (요청 반영)
- 기준가(취소선) 제거 → "월 렌탈료" 단일 표시.
- 약정 옵션(크롤 태그) 줄은 **일단 유지**(나중에 정책 문구로 교체 검토).
- **장바구니 버튼 삭제**, 상담 신청 버튼 단독 풀폭(`.detail-cta .btn{flex:1}`이라 자동).

### ⚠️ 같은 실수 반복 방지 — 인라인 스크립트 throw로 라우터 사망
- 장바구니 버튼(`id="ic-check"`) 지웠는데 **index.html 인라인 스크립트에 `getElementById('ic-check').innerHTML = ICONS.cart()`가 남아** null 참조로 throw → 같은 `<script>` 블록 끝의 **`App.startRouter()`까지 실행 안 됨** → 본문 전체 빈 화면(헤더·푸터만).
- 교훈: **버튼/요소 지울 때 index.html 하단 인라인 아이콘 주입부(`ic-*`, `wh-*` 등)도 같이 확인.** 인라인 스크립트는 throw하면 그 아래 전부(라우터 시작 포함) 죽음.
- `App.renderDetail()`을 콘솔에서 수동 호출하면 멀쩡히 떠서 처음엔 supabase 지연으로 오진했음 → **빈 화면이면 인라인 스크립트 throw부터 의심**(콘솔 error 안 잡힐 수 있음, `App.startRouter` 도달 여부 확인).

### 데이터 매칭 메모
- 제품 모델코드(`p.model` 첫 줄) ↔ 수수료표 `코드`는 보통 정확히 일치하지만, 색상 변형 대응 위해 **base10(`slice(0,10)`) 매칭** 사용. 타사보상 박스·옵션·가격 모두 동일 기준.
- 수수료표엔 27개 모델만 있음(전체 81개 제품 중). 미등록 제품은 옵션 숨김 + 크롤가 fallback.

### 커밋
- `5cb2faf` 타사보상 박스 / `198fd8a` 옵션·가격 정책 연동 / `47984f0` 기준가·장바구니 제거 / `862894b` 라우터 시작 복구(핫픽스)

---

## 2026-05-30~31 — 정책테이블 고도화 · 반값할인 · 제휴카드 시스템 · SVG카드 스킬

### 정책 테이블 (admin 메뉴 '수수료 확인' → '정책 테이블'로 개명)
- **공급가액** 컬럼 추가(= 수수료합계 / 1.1, 반올림). **기본요금·타사보상·수수료합계 빨강 강조**(com-num-strong → --primary).
- **매트리스 사이즈(SS/Q/K) 누락 수정**: 제품코드 4번째 글자가 사이즈(MAT**S**/**Q**/**K**…). onHome 9자리 매칭 + 색상묶음 dedup이 사이즈를 뭉개 SS만 남던 것 → `comSize`/`comBaseCode`(사이즈 무관 매칭) + dedup 키에 사이즈 추가. (매트리스 15행 → 42행)
- 테이블·필터바를 데이터 폭으로 **좌측 정렬**(`.adm-com-table width:auto`, `.adm-table-wrap fit-content`, 패널별 max-width).

### 반값할인 — ★ 정책 = 상품 tag 아님, **프로모션 PDF '핵심품목 혜택' 표** 기준
- `comHalfMonths`(app.js·admin.js **양쪽 동일** 함수):
  - 정수기 5년=6 / **6·7년**: **원코크·메가 계열 → 방문 18 · 셀프 15** (형태별로 갈림!), **초소형·투워터 → 12**.
  - 공청 올클린(디아트 제외) 5·6·7년 = 6 / 비데 올클린케어 = 5년만 6.
  - 정책표에 없는 계열(스탠드형직수·탱크형 등) = 0(미표시).
- 타사보상 반값 `comCompeteHalfMonths` = 별첨 기준 **의무 5년↑ 3개월** (기본요금 반값과 별개).
- 상세 가격카드: 월 렌탈료 / 타사 보상가 각각 "처음 N개월 [반값금액]"을 현재 요금과 **가로** 표시.
- 카드/갤러리 배지 = 모델 **최대** 반값 개월수(`cardMaxHalfMonths`). (처음엔 상품 tag로 했다 부정확해서 정책표로 전환한 이력)

### 상세페이지 기타
- 기본 선택 = **셀프관리(없으면 방문) + 5년**. 상품 카드 가격도 동일 기준(`cardPolicyPrice`).
- 매트리스 **사이즈 탭 → 가격/상단 모델명/제품사양** 연동(`optionsForSize`, `sizeLetterOf`). 제품사양은 항목 최다 사이즈(슈퍼싱글) 베이스에 현재 사이즈 값 덮어쓰기 **병합**.
- 약정 6년 버튼 **중복** 버그(비데 풀스텐케어: 같은 의무 2행) → 형태별 의무 dedup.
- 탭(제품사양 등) 클릭 시 **맨 위로 점프** → `location.hash` 대신 `history.replaceState`.
- 갤러리 썸네일 **hover**로 메인 이미지 전환.
- '타사 보상 가능' 안내 박스 제거. 타사 보상가에 "(타 브랜드 이용중인 고객 대상)" 표기.

### ★ 공개 사이트 DB 연동
- app.js가 정적 `commission.js`만 읽던 것 → `startRouter`에서 `skmFetchCommission`으로 **DB 최신 수수료 우선 로드**. **admin 업로드가 공개 사이트에 반영됨.**

### svg-card 스킬 — ★ `OneDrive\claude-skills`에 저장 (= `~/.claude/skills` junction, 전역)
- 신용카드 비주얼을 AI 이미지 대신 **인라인 SVG**로(텍스트 안 깨짐). 색표/배너통합 가이드 포함. (형은 스킬을 OneDrive\claude-skills에 모음)

### 제휴카드 시스템
- **`/card-benefits`** 페이지(`web/card-benefits.html`): SVG 카드 히어로 배너 + 8개 카드 그리드(SVG카드·전월실적별 할인표·연락처·신청링크). 헤더/푸터(사업자정보 포함) 메인과 통일.
- **vercel.json**: `/card-benefits` rewrite를 `/:slug`보다 **위**에, `/card-benefits.html`→`/card-benefits` redirect. (★ 교훈: `.html` 직접 경로는 `/:slug` rewrite가 매장 슬러그로 오인 → admin처럼 경로 등록 필요)
- admin **'본부 전용' 그룹 > 제휴카드 관리**: 8개 카드 **이미지 업로드(Storage `card-assets`)** + 자세히보기 링크 입력 + 전체 저장.
- migration **`006_card_benefits.sql`** (★ Supabase SQL Editor에서 **실행 완료**): `card_benefits` 테이블 + `card-assets` 버킷 + RLS(super_admin write / public read).
- card-benefits는 `card_benefits` DB에 이미지/링크 있으면 적용, 없으면 **SVG 카드 + SK매직 공식 링크**로 fallback.
- 카드 데이터(이름·할인표·연락처)는 `card-benefits.html`의 `CARDS` 배열에 **코드 고정**, 이미지·링크만 DB 오버라이드. 카드 key: `hyundai/samsung/kb/shinhan/lotte/hana/woori/kj`.
- supabase.js 헬퍼: `skmFetchCardBenefits`/`skmSaveCardBenefits`/`skmUploadCardImage`.
- 푸터 문구 정리: '본사 홈페이지로 문의'(고객 유출)·'영업 카탈로그' 표현 제거 → 매장 문의 유도.

### 남은 일 / TODO
- **8개 카드 이미지를 admin에서 등록**(아직 SVG fallback). 카드사 이미지 URL 예: 광주 `imgs.kjbank.com/resource/img/fpm/card/skmagickj_card_5413.png`. 필요시 admin에 'URL 직접 입력' 방식 추가 검토(현재 파일 업로드만).
- 카드 SVG 색을 카드사 브랜드색에 맞출지(현재 tone 임의).
- 반값 개월수 정책표는 **26.6월 기준** — 매달 프로모션 바뀌면 `comHalfMonths` 갱신 필요(app.js + admin.js **양쪽**).

### 주요 커밋(이 구간 최신순 일부)
- `20c4919` 푸터 문구정리 / `6ce298f` 카드페이지 사업자정보 / `95bf0e5` 제휴카드 관리 메뉴 / `d353750` /card-benefits 라우팅 / `6187427` 반값 정책표 기준 / `76d681e` 매트리스 사이즈 가격연동·공개사이트 DB / `4e77022` 매트리스 사이즈 파싱

---

## 📅 2026-05-31 — 상담 FAB 아이콘 · why카드 카피 · 푸터 정리 · FAQ 시스템

### 상담 FAB 아이콘 (수화기 → 말풍선) `8900f77`
- 우하단 `#fab-consult`는 PC/모바일 공통 단일 버튼. 누르면 전화 아니라 팝업(전화+카카오) 토글이라 채팅 버블이 동작과 맞음.
- `icons.js`에 `ICONS.chat()` SVG 추가, index.html 주입부 `phone()`→`chat()`. (이모지 금지 규칙대로 SVG)

### '우리는 이렇게 다릅니다' 카드 사실관계 정정 `fe24d19`
- "정품 직배송 보증/신선한 박스" → **"SK매직 정품 보증"** (정수기는 식품 아님 + 기사 방문설치라 직배송 아님)
- "빠른 설치 일정/평균 2일 이내" → **"고객 일정 맞춤 설치"** (2일 보장 불가 = 클레임 빌미 제거)
- "빠른 설치" 표현 자체는 유지(메타/히어로) — 구체 약속 아니라 OK(형 결정).

### 푸터 '고객지원' → '안내' 정리 `d2d2b69`
- 상담신청/설치문의/A·S 제거(셋 다 `href="#"` 더미, 상담은 FAB가 대체).
- 제휴카드는 '지원' 아닌 '혜택' 성격 → 헤더 '안내'. 제휴카드 안내(/card-benefits) + 자주 묻는 질문만.
- ★ 본사도 푸터엔 고객지원 안 둠(회사소개/약관/개인정보 등 법적정보만). 우리 더미는 본사 따라한 것도 아니었음.

### ★ 자주 묻는 질문(FAQ) 시스템 `f46bf47`
제휴카드 시스템을 그대로 본떠 구축:
- **`web/faq.html`**: 아코디언 FAQ. 기본 8문항 코드 고정(`DEFAULT_FAQ`) + DB 오버라이드. 헤더/푸터/사업자정보 바인딩·하단 상담 CTA 메인과 통일. 답변에 `<a href>`만 안전 허용(`answerHTML`).
- **라우팅**: vercel.json `/faq` redirect(`.html`→clean) + rewrite(`/:slug` 위에). card-benefits와 동일 패턴(★ `.html` 직접경로는 `/:slug`가 슬러그로 오인하므로 경로 등록 필수).
- **링크**: 홈 util-bar(제휴카드 안내 옆) + 푸터에 자주 묻는 질문 → `/faq`. faq.html util-bar에도 2개.
- **admin FAQ 관리**(★ '사이트 설정' 그룹 — 기본정보 아래): `MENU_META.faq`, `initFaq/renderFaqAdmin/syncFaqFromDom/saveFaq`, `DEFAULT_FAQ`(faq.html과 **동일 유지 필수**). admin.css `.adm-faq-*`.
  - **UX**: 평소 행은 **읽기 전용 + [수정] 버튼**(실수 삭제 방지). [수정] → 그 행만 편집(입력칸+[저장]/[삭제]). **개별 저장** — 행마다 [저장] 누르면 그 즉시 DB upsert(`persistFaq`/`saveFaqOne`, 질문 비면 막음), 삭제도 `confirm` 후 즉시 반영. '+질문 추가'는 바로 편집모드. (전체저장 버튼·패널 힌트 제거, 이전 인라인 input+X즉시삭제 → 개편)
- **supabase.js**: `skmFetchFaq`/`skmSaveFaq`. **migration `007_faq.sql`**: `faq_data`(id=1 단일행 payload jsonb) + RLS(super_admin write/public read).
- ⚠️ **`007_faq.sql`은 형이 Supabase SQL Editor에서 실행해야 admin 저장이 동작**. 실행 전에도 공개 FAQ 페이지는 코드 기본값으로 정상 표시됨(읽기는 테이블 없으면 fallback).

### FAQ 기본 8문항 (리서치 기반 — 본사 FAQ + 렌탈 일반)
의무사용기간 / 약정만료 후 / 중도해지 위약금 / 설치비 / 셀프vs방문 관리 / 제휴카드 할인 / 이전설치 / 렌탈vs구매. 답변은 매장 톤(존댓말)·금액 단정 회피("상담 시 안내")로 클레임 방지.

### 남은 일
- ⚠️ **migration 007_faq.sql 실행** (위 참조) — 안 하면 admin에서 FAQ 저장 시 실패.
- FAQ 답변 문구는 형이 admin에서 매장 실제 정책에 맞게 다듬으면 됨(현재 일반론).
- `comHalfMonths` 반값 정책표 26.6월 기준 — 6월 프로모션 바뀌면 갱신(app.js+admin.js 양쪽).

---

## 📅 2026-05-31 (2) — 홈 배너/슬라이드 시스템 (DB 관리형)

### ★ 개요
홈 hero 슬라이더가 정적(`hero/11·22·33.jpg` 하드코딩)이던 것 → **admin 관리형 DB 배너**로 전환.
제휴카드/FAQ와 동일 패턴(단일행 payload + Storage 버킷 + RLS).

### DB / migration `008_banners.sql` (★ Supabase SQL Editor에서 실행 필요)
- `banner_data`(id=1 단일행 payload jsonb) + Storage 버킷 `banner-assets` + RLS(super_admin write/public read).
- payload = `{ mode:'auto'|'manual', interval:초, items:[{image,link,newTab,enabled}] }`. 순서=배열순서, 최대 10개.
- ⚠️ **실행 전에도 공개 홈은 정적 fallback(11/22/33.jpg)으로 정상**. 실행해야 admin 저장·공개 반영됨.

### supabase.js
- `skmFetchBanners`/`skmSaveBanners`/`skmUploadBannerImage`(파일명 매번 고유: `banners/{ts}_{rand}.ext`).

### admin '사이트 설정 > 배너/슬라이드' (soon → 활성화)
- 권장 사이즈 안내 **1920×600 (16:5)** — 다른 크기도 등록되되 그 비율 영역에 cover.
- 전환 방식 **자동/수동** 라디오, 자동이면 **간격(초)** 입력(수동이면 간격행 숨김).
- 배너 목록(세로): 썸네일(16:5 미리보기 340px) + **사용 토글** + **링크 입력** + **새 창 토글** + **▲▼ 순서** + 삭제.
- **+배너 이미지 추가**(Storage 업로드, 최대 10개) / **저장**(전체, 토스트 피드백).
- `initBanner/renderBanners/syncBannersFromDom/moveBanner/onBannerImage/saveBanners`. admin.css `.adm-bn-*`.

### 공개 홈 hero (index.html 인라인 슬라이더 재작성)
- `skmFetchBanners`로 enabled 배너 있으면 `.hs-track`/`.hs-dots` **동적 재구성**, 없거나 실패 시 **정적 fallback 유지**(인라인이라 try-catch로 throw 방지 — 라우터 사망 교훈).
- **자동**: interval초 전환 / **수동**: 화살표만(자동 안 함). **1개면 화살표·점 숨김 + 자동 없음**.
- 링크 있으면 `<a>`로 감싸고 newTab이면 `target=_blank rel=noopener`. 비율은 기존 `aspect-ratio:16/5` 유지(1920×600 기준).

### 남은 일 / 확인
- ⚠️ **`008_banners.sql` 실행** 후 admin에서 배너 등록·저장 가능.
- admin 썸네일 "2/3 미리보기"는 340px 폭으로 잡음 — 형이 크기 보고 조정 요청 가능.
- 모바일에서 수동(manual) 모드 시 화살표가 CSS상 숨겨질 수 있음(기존 모바일=자동+점 전제). 다배너 수동을 모바일에서도 조작하려면 별도 처리 필요.
- 배너 저장은 현재 전체 저장(개별 아님) — FAQ는 개별이었음. 필요 시 개별로 전환 검토.

---

## 📅 2026-05-31 (3) — admin 상품관리 가격을 정책테이블 기준으로 통일

### 배경 (가격 소스가 두 갈래였음)
- **공개 사이트**(카드·상세): `cardPolicyPrice()` = 정책테이블(COMMISSION_DB)에서 모델 base10 매칭 → **셀프형 우선(없으면 방문형) → 5년(의무60) 행** → `기준가`(정상가) `기본요금`(월 렌탈료).
- **admin 상품관리**: `priceOf()` = **본사 크롤(db.js) 정적값** → 정책과 무관 → 둘이 안 맞음(예 admin 할인가 25,950 vs 공개 월 51,900).

### 한 일 (admin.js — 공개와 동일 소스로)
- **`comPolicyRow(modelCode)`**: app.js `cardPolicyPrice`와 동일 로직(셀프 우선/없으면 방문, 5년) 이식.
- **`effectivePrices` 변경**: 우선순위 **매장 override > 정책테이블 > 본사크롤(fallback)**. 정상가=`기준가`, 할인가=`기본요금`, 타사보상=`타사보상`.
- **`ensureCommissionData()`**: 정책(수수료표) 최신 1회 로드. `init()`에서 `renderTable` 전에 호출(상품관리에서도 정책 필요). initCommission도 이걸 재사용.
- **편집 모달**: 비교 기준을 본사원본→**정책가**로. 입력값이 비었거나 정책가와 같으면 override 안 담음 → **모달 그대로 저장해도 정책 추종**(override 안 박힘), 비우면 정책가 자동 적용. 모달 힌트도 '정책 기준(5년·셀프/방문)'으로 표시.

### 결과
admin = 공개 = **정책테이블 단일 소스**. 매달 정책 엑셀만 갱신하면 양쪽 자동 일치. 정책표에 없는 모델만 본사크롤 fallback.
※ 크롤 무관(이미 로드된 데이터 소스 전환). app.js(공개)는 변경 없음.

### TODO (이어서)
- 제휴카드 적용가 표시(상품카드/상세 약정옵션 자리) + 제휴카드 할인액 admin 설정 메뉴 — **카테고리별 할인액**으로 가닥(미구현). 상세 제휴카드 안내는 팝업.

---

## 📅 2026-05-31 (4) — 카드할인금액 시스템 + 상세 신규/타사 선택 + 제휴카드 적용가

### ① admin '카드할인금액' (운영 그룹, 상품관리 복사 구조)
- 컬럼: 카테고리·상품명·[기본요금·카드할인·노출금액]·[타사보상·카드할인·노출금액]. 카드할인 입력→노출금액(현재가-카드할인) 자동계산.
- **저장**: `card_benefits.payload.discounts[gid]={sale,compete}` 통합(본부 공통, migration 불필요, 제휴카드 이미지/링크 보존). `skmSaveCardDiscounts`(fetch→merge→save).
- **엑셀 다운로드**(현재 목록+goodsId→xlsx) / **업로드**(goodsId 매칭 일괄적용). XLSX(SheetJS, 정책테이블이 쓰던 것 재사용).
- 기존 저장값 로드해 입력칸 채움 + 개별 수정.
- '상품 카드에는 기본요금 기준만 적용' 안내.

### ② 상세페이지 — 신규렌탈/타사보상 선택 + 제휴카드 적용가
- 관리유형 아래 **구분 토글 [신규 렌탈 / 타사 보상]** 추가(`p-mode-row`, `_optState.priceMode`). **정책 연동 + 현재 약정에 타사보상 있을 때만** 노출(없으면 신규 고정).
- 가격카드: **선택된 구분의 금액만** 표시(신규=기본요금 / 타사보상=타사보상가, 각각 반값 보조표기). 기존 '둘 다 표시'에서 변경.
- **약정옵션 자리 → '제휴카드 적용시 OO원'**(선택금액 − 카드할인[`_cardDiscounts[gid]`의 sale/compete]) + **'제휴카드 혜택 안내' 팝업**(card-modal, /card-benefits 연결). 카드할인 0이면 금액 생략하고 안내 링크만.
- `startRouter`에서 `skmFetchCardBenefits`로 `_cardDiscounts` 로드.

### 같이 한 것
- '할인가' → '기본요금' 용어 통일(상품관리·편집모달). 정책=월 렌탈료.
- 전체보기 카테고리 순 정렬(정수기→공청→비데→매트리스) + 순서 미조정 신상품 카테고리 최상단.
- admin 본부전용 '아이콘 시안' 갤러리(카테고리 아이콘 4스타일, 선택 대기). `_iconlab.html`은 검증용(untracked).
- 카드할인/배너 안내문구 콘텐츠 폭 우측정렬.

### 검증/남은 것
- 상세 토글·금액·팝업 preview(eval) 검증 완료. **카드할인 금액은 admin에서 저장해야 상세 '제휴카드 적용시'에 표시**(저장 전엔 안내 링크만).
- admin은 preview 렌더 불가 → 형이 배포본에서 확인.
- 매장 타입 분양형/단독형은 [[project-store-types]] 메모리 참조(분양 메뉴 추후).

---

## ✅ 해결 — admin 다른 메뉴에서 새로고침 시 '상품 관리'로 튐 (2026-05-31 6)

**진짜 원인 = FOUC(첫 페인트 깜빡임), JS 로직 아님.** 형의 "**잠깐 열렸다가** 온다"는 표현이 결정타.
- admin.js 는 CDN(supabase/xlsx) 뒤에 `document.write`+`?v=Date.now()` 로 **늦게** 로드됨.
- 그 지연 동안 화면엔 **HTML 하드코딩 기본값**이 떠 있음: 사이드바 `adm-nav-item on`(상품관리 파란 강조) + 헤더 `<h1>상품 관리</h1>`+설명. (본문 패널은 `.adm-panel[hidden]{display:none}` 라 안 보였고, **헤더 제목이 '상품 관리'라서** 상품관리 화면처럼 보였던 것.)
- admin.js 실행 → `applyMenuFromHash()` 가 carddiscount 로 정정 = "상품관리 번쩍 → 카드할인".
- **콘솔 로그로 안 잡힌 이유**: JS 로직(parseHash/패널토글)은 처음부터 정상. 순수 페인트 타이밍 문제.

**해결(commit 84c1d9f)**: `admin.html` 헤더 바로 뒤에 **즉시 실행 인라인 `<script>`** 추가 — hash 파싱해서 첫 페인트 전에 사이드바 `on` 강조 + 헤더 제목/설명을 맞춤. `TITLES` 객체는 admin.js `MENU_META` 와 **동기 유지 필요**(메뉴/문구 바뀌면 양쪽).
- 진단로그 `[admin][nav]`(commit 81f0afd)는 원인 확정됐으니 **다음에 제거 예정**(지금은 무해, 남겨둠).

---

### (이전 기록) 미해결이었을 때 — admin 새로고침 시 '상품 관리'로 튐

**증상**: carddiscount 등 다른 메뉴 보던 중 새로고침하면 화면이 '상품 관리'(맨 위 메뉴)로 튀었다 돌아옴(또는 그대로 상품관리). 해시(`#carddiscount`)는 URL에 있는데도.

**시도(효과 부족/실패)**:
1. 상품관리 패널에 `hidden` 추가(`admin.html` `data-panel="products" hidden`) → JS 로드 전 깜빡 방지 의도. 여전히 튐.
2. `init()` 끝(loadProducts 완료 후)에 `applyMenuFromHash()` 재호출 → carddiscount **데이터 안 뜨던 건 해결**됐으나, '상품관리로 튐'은 여전.
3. **(2026-05-31 5) `init()` 이중 호출은 오진 — 코드는 이미 정상**: 처음엔 부팅부가 `addEventListener('DOMContentLoaded', init); init();` 로 init 이 두 번 도는 줄 알았으나, 파일 맨 끝은 이미 `if(document.readyState==='loading'){…DOMContentLoaded…}else{init()}` **가드로 1회만 실행**됨(이중 init 아님). ※ commit 81f0afd 메시지('init() 이중 호출 제거')는 이 오진 탓 — 실제 변경은 진단로그 2줄뿐, 부팅 코드는 손 안 댐(정정 커밋 별도).
   - **실제 한 일**: 진단로그 2줄만 추가 — `applyMenuFromHash()`·`init()` 시작에 `console.debug('[admin][nav] …', {hash,menu,kind,ready})`. 라우팅 로직(parseHash→applyMenuFromHash→패널 hidden 토글)은 정적 분석상 carddiscount 로 정상 귀결돼서 '상품관리로 튐' 재현 경로를 코드만으론 못 찾음. **원인 미특정.**
   - ⚠️ **형이 배포본 admin 에서 #carddiscount 로 새로고침 후 콘솔(F12) 캡처** → `[admin][nav]` 로그 그대로 붙여줘. 볼 것: ① `init start` 몇 번 찍히는지 ② `apply` 의 `menu`/`kind` 가 products 로 뜨는 순간 있는지 ③ 그때 `hash`·`ready` 값. → 잔여 원인 특정 후 진단로그 제거.

**확인된 것**: `admin.html`은 `document.write`로 스크립트만 로드(hash 안 건드림). `parseHash()`는 `MENU_META[parts[0]] ? parts[0] : 'products'` (carddiscount 키 존재). `applyMenuFromHash()`(init 2060, loadProducts 전)가 패널 hidden 토글.

**다음 디버깅(콘솔에서)**:
- 새로고침 직후 `location.hash` 값 / `parseHash().menu` 값 확인 (carddiscount 나오는지)
- `applyMenuFromHash` 호출 시점에 실제 어느 패널이 보이는지(`document.querySelectorAll('.adm-panel:not([hidden])')`)
- init 중 products 패널 hidden 이 false 로 되는 지점 추적(혹시 renderTable/auth/store 흐름 어딘가)
- ※ admin 은 preview 도구로 렌더 불가 → 형이 콘솔 값 캡처해 주면 원인 특정 가능.

## 📅 2026-05-31 (7) — 주문/상담 시스템 + 판매점마진설정 + 약관 + 각종 fix

### 주문/상담 시스템 (consultations)
- **migration 009**: consultations 에 `kind`(consult/order)·`customer_birth`·`customer_address` 컬럼
- **migration 010**: `status` 6단계 — 신규접수(new)·주문확인(confirmed)·청약완료(subscribed)·개통완료(activated)·보류(hold)·취소(cancelled). 기본값 new
- 상세 '상담 신청' → **단계형 모달**(유형선택→폼→완료). 상담=이름·연락처 / 주문=+생년월일·주소
- 선택 상품·약정·관리유형·타사보상 스냅샷을 products 에 첨부, 개인정보 동의 필수+약관 링크
- supabase.js: `skmInsertConsultation` / `skmFetchConsultations` / `skmUpdateConsultation(id,{status,memo})`
- admin '상담 및 주문' 메뉴: 가로 테이블, 상태 드롭다운, 메모(blur 저장), 상태별 파스텔 행
- ⚠️ 모달 제출 시 `_store` 없으면 즉석 `skmFetchStore` fallback (loadOverrides 전 제출 대비)

### 판매점마진설정 (운영 그룹, 정책테이블 아래)
- **migration 011**: `stores.margins`(jsonb) — 키 `"코드|형태|의무"` → 마진금액(원, **VAT 포함**)
- 정책테이블과 동일 구조(.adm-table, 카테고리/형태 칩, 검색, comDisplay 표시명)
- 칼럼: 공급가액(=수수료합계/1.1)·수수료합계 + 마진입력·판매점공급가액·판매점수수료
- 계산: **판매점수수료 = 수수료합계 − 마진**, **판매점공급가액 = 판매점수수료 ÷ 1.1**
- 일괄입력(현재 필터된 행) + 엑셀 업로드/다운로드(헤더 범용 버튼)
- ⚠️ 마진 엑셀 업로드: 엑셀 제품코드가 표시용(comDisplay)이라 **정책 원본 행 역매칭**(코드·형태·의무) 후 mgKey 산출

### 약관·개인정보처리방침 (terms.html / privacy.html 신규)
- 본사 = **SK인텔릭스(주)** (구 SK매직㈜ — 사업자 104-86-48203, 종로 청계천로 85). 렌탈 계약 주체·제3자 제공받는 자
- 매장 식별정보(상호·대표·사업자번호·주소·연락처)는 `.v-*` 동적 바인딩 → **분양 시 매장별 자동** (본사·조항은 고정)
- 화면 브랜드(헤더·푸터·탭 제목)는 **SK매직 유지**, 약관 본문만 SK인텔릭스
- 푸터·상담모달에 약관 링크 + vercel `/terms`·`/privacy` rewrite(+/.html redirect)

### 각종 fix (★ 다른 작업 시 참고)
- **엑셀 다운로드 '가끔 안 먹힘'** = XLSX(900KB CDN) 늦은 로드. 클릭 시 미로드면 `ensureXLSX()`로 동적 로드 await 후 실행
- **다운로드 버튼이 엉뚱한 메뉴에 노출** = `.adm-com-dl{display:inline-flex}`가 HTML `hidden` 속성(display:none)을 덮어씀 → `.adm-com-dl[hidden]{display:none}` 추가. **(display 강제 클래스 + hidden 속성 = 토글 무효, 흔한 함정)**
- **상세 새로고침 '불러오는 중' 번쩍(FOUC)** = `p-name` 정적값이 app.js(맨 끝·모달코드로 커짐) 실행 전까지 보임 → **db.js 직후 인라인 부트**로 상품명 즉시 박기 (page-jitter-fix 원인6 사례)
- 헤더 다운로드 **범용화**(현재 메뉴 데이터), 정책 메뉴 진입 시 필터 초기화(다운로드 범위 누수 방지)
- 카드 적용가 **0원 표기**(할인>월요금이어도), 타사보상 선택 주문서·admin 표기
- 비데 `form()` 관리주기 기준(4개월=방문/12개월=셀프), 정책표 중복제거 **코드 base 기준**(모델명 같고 코드 다른 색상변형 누락 방지)
- admin 사이드바 메뉴 아이콘 유니코드 기호 → 라인 SVG

## 📅 2026-05-31 (8) — 분양 시스템 (권한 가시성 + 사이트분양 + 계층 조회)

### 매장 타입 = 권한 (stores.type / parent_store_id 그대로, SQL 변경 X)
- `super_admin` = 본부 / `dealer` = 분양형(산하 판매점 분양 가능, 그룹장) / `shop` = 단독형
- 계층: 본부 → 분양형(dealer) → 판매점(shop) / 본부 → 판매점(shop)

### 권한별 admin 메뉴 가시성 (`applyRoleVisibility`, init에서 authCtx 기반)
- nav 그룹에 `data-group` 부여: `super`(본부전용=제휴카드·아이콘), `deploy`(분양관리)
- **본부 전용 그룹** = 본부만 / **정책 엑셀 업로드(com-upload)** = 본부만(조회는 가능)
- **분양관리(사이트분양)** = 본부·분양형만, 단독형 숨김
- 숨긴 메뉴 선택 중이면 `#products`로 보정

### 사이트분양 (분양관리 메뉴)
- 산하 판매점 목록 + 새 매장 분양 폼(슬러그·상호·유형)
- 본부=분양형/단독형 선택(dp-type), 분양형=단독형(shop) 고정
- `skmFetchChildStores(parentId)` / `skmCreateChildStore(parentId,{slug,name,type})`
- 슬러그 검증(영문/숫자/-), `/슬러그`·`/슬러그/admin` 링크 제공

### 주문 계층 조회 (RLS `consult_visible_view` = `my_visible_stores()`)
- `skmFetchConsultations()` storeId 생략 → RLS가 계층 필터(본부=전체/분양형=자기+산하/판매점=자기)
- consultations 에 `store:stores(name,slug,type)` join → 상담목록에 **매장 컬럼** 추가

### 정산관리 설계 (★ 추후 구현 — 현재 soon)
- **개통완료(status='activated')** 신청을 정산 대상으로
- 매장별 지급액 = (정책 수수료합계 − `stores.margins` 마진) — 판매점마진설정과 동일 계산
- 계층은 주문과 동일: `my_visible_stores()` (본부=전체, 분양형=자기+산하, 판매점=자기)
- 정산 메뉴 열 때 위 로직 그대로 붙이면 됨

## 📅 2026-06-01 (9) — 미등록 매장 슬러그 차단

- `/:slug` 가 전부 index.html로 rewrite되는데 **매장 존재 검증이 없어**, 아무 슬러그(`/s213…`)나 본사 카탈로그가 떴음
- `loadOverrides`에서 `skmFetchStore` 실패 시 `_storeMissing = true` → `route()` 초반에 안내 페이지(`renderStoreNotFound`)로 분기, 카탈로그 차단
- 정상 매장(stores 등록분)은 그대로 노출 = **사이트분양으로 추가한 매장만 열림**
- 프리뷰 검증: 가짜 슬러그→안내 / `/skmagic`→상품 19개 정상

## 📅 2026-06-01 (10) — 상세 gif 이미지 404 (★ 진행중 · 미완)

### 증상
- 상품 상세페이지 콘솔에 `.gif` 404 무더기 (형이 캡처: G000069844 등에서 19개씩 빨갛게). 기능 영향은 없지만 콘솔 지저분.
- 같이 보인 `thumb.png` 404 1건(G000062320 등), `message channel closed` 에러(=브라우저 확장, 무관)도 있었음.
- (참고) 형이 물었던 '신청하기 일시적 오류'는 코드 버그 아님 = 환경차(캐시/확장/배포전파). 집 안 됨/사무실 됨 = 환경 문제로 결론.

### 원인 (확정)
- 상세설명 이미지 중 **본사가 .gif 로 주는 컷**을 과거 크롤이 안 받음 → 우리 repo `products/G*/images/` 에 png/jpg 는 있는데 **gif 만 빠짐** → 로컬 경로 요청이 404.
- 기존 `app.js` detailImagesHtml(약 1462~1480) 은 `onerror="this.src='본사원본URL'"` fallback 이라 **보이긴 했지만** 로컬 404 1회 찍고 본사(static.skmagic.com)로 대신 불러오던 상태 = 본사 의존 + 콘솔 404.
- ★ 형 결정: **본사 핫링크 X, 작업PC 로컬만 X → 빠진 gif 를 받아서 우리 repo/서버(sk-magic.kr)에 저장**해야 함. (png/jpg 처럼 git 커밋 → vercel 배포로 우리 서버서 서빙)

### 스캔 결과 (`_scan_missing.cjs` → `_missing_imgs.json`)
- detail_images 참조 3473개 중 **495개 누락 = 전부 .gif**, 61/81 제품. main_images 누락 0.
- 다운로드 도구: **크롤러(python/playwright) 불필요.** meta.json `detail_images` 에 본사 원본 URL 다 있음 → 단순 HTTP GET. 크롤 안전규칙 무관(meta.json/products.json 안 건드리고 이미지 파일만 추가).

### 현재 상태 (★ 미완 — 워킹트리 미커밋)
- `app.js` detailImagesHtml **임시로 gif는 본사 URL 직접 src** 로 바꿔둠(미커밋). → 다운로드 받으면 **로컬 경로만 쓰게 되돌려야 함**(본사 fallback 제거, 깨지면 숨김 정도).
- 다운로드 **미실행** (형이 진행 전 멈춤). 스크립트는 작성 완료: `_dl_missing.cjs` (동시8, redirect/timeout/재명명 처리, UA+Referer 헤더).
- untracked 임시파일: `_scan_missing.cjs` `_dl_missing.cjs` `_missing_imgs.json`.

### 다음 할 일 (순서)
1. `node _dl_missing.cjs` → 495개 gif 받아 `products/G*/images/detail_XX_*.gif` 저장. 실패분 `_dl_fails.json` 확인(본사 referer 차단 가능성 — 헤더 넣어둠).
2. `app.js` detailImagesHtml = **로컬 경로만** (gif 분기·본사 fallback 제거). 깨지면 `onerror` 로 숨김(`display:none`) 정도.
3. preview 검증: 상세페이지 콘솔 404 = 0.
4. 커밋·푸시 (gif 495개 + app.js). 용량 보고.
5. 임시파일 정리(`_scan_missing.cjs`/`_dl_missing.cjs`/`_missing_imgs.json` — 재사용 위해 보관할지 형 판단).

## 📅 2026-06-01 (11) — 상세 gif → MP4 변환 (★ 완료)

### (10)에서 이어짐 — 다운로드 후 드러난 진짜 문제 = 용량
- `_dl_missing.cjs` 실행 → **495개 gif 전부 다운로드 성공(실패 0)**. 본사 referer 차단 없었음.
- 재스캔(`_scan_missing.cjs`) → **누락 0/3473**. app.js detailImagesHtml = 로컬경로 전용으로 1차 수정(gif 분기·본사 fallback 제거, 깨지면 `display:none`).
- ★ **그런데 합계 1.5GB(495개, 평균 3MB, 최대 34MB)**. 전수 검사 결과 **전부 200~535프레임 진짜 애니메이션 gif**(정적 0개 → png 변환 불가). 이대로 git/Vercel 올리면 레포 영구 비대화 + 배포·대역폭 폭탄.

### 결정 = MP4 변환 (형 선택)
- **ffmpeg 설치**: `winget install Gyan.FFmpeg` (v8.1.1). 경로: `%LOCALAPPDATA%\Microsoft\WinGet\Packages\Gyan.FFmpeg_*\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe` (PATH는 새 셸부터 반영 → 풀경로로 호출함).
- **변환**: `-movflags +faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:v libx264 -crf 23 -an`. PS7 `ForEach-Object -Parallel -ThrottleLimit 6` 으로 495개 **55초**에 변환(실패 0).
- **결과: 1.5GB → 200MB (87% 감소, 평균 0.4MB).** 최대 34MB→1.5MB(95.6%). crf 23 = 인포그래픽 텍스트 가독성 유지.

### 코드 변경
- `app.js` detailImagesHtml: gif 참조면 같은 경로의 **`.mp4` 를 `<video autoplay loop muted playsinline preload="metadata">`** 로 렌더(`onerror` 시 숨김). png/jpg 는 그대로 `<img>` 로컬경로. **본사 핫링크 완전 제거.**
- `style.css`: `.detail-tabs .infoimgs img` 셀렉터에 `, .infoimgs video` 추가(동일 width:100% 스타일).

### 검증 (preview, /skmagic?id=G000069844)
- video 15 + img 12, **깨진 거 0, 콘솔 에러 0**. video `videoWidth=1200` 디코드 확인.
- ⚠️ preview(헤드리스 백그라운드 탭)에선 "video-only background media paused to save power"로 자동재생이 안 걸림 = **환경 한계**(코드 문제 아님). 실제 포그라운드 탭에선 muted+playsinline 자동재생 정상.
- ※ 로컬 node config 라우팅은 `detail.html`(확장자 경로)을 404 냄 → 검증은 **확장자 없는 `/skmagic?id=...`(=index.html SPA)** 로 들어가야 함. (다음에 상세 검증할 때 참고)

### 정리/커밋
- gif 원본 495개(1.5GB)는 **워킹트리에서 삭제**(커밋 X). **mp4 495개(200MB) + app.js + style.css 만 커밋·푸시.**
- 임시파일 `_scan_missing.cjs`/`_dl_missing.cjs`/`_dupcheck.cjs`/`_missing_imgs.json`(재스캔 때 빈배열로 덮임) = untracked 유지(재사용 위해 보관, 커밋 안 함).
- (※ 새 제품 추가 시 동일 절차: 스캔→다운로드→ffmpeg mp4 변환→gif 삭제→커밋.)

## 📅 2026-06-01 (12) — 상세 콘솔 잔여 정리 (thumb 404 + 폰트 preload 경고)

배포본 상세 콘솔에서 gif 404는 사라졌고(=11 mp4 전환 성공), 남은 2건 정리:

### thumb.png 404 (10개 제품)
- `thumbOf(p)` = p.thumb 있으면 `../products/<gid>/thumb.png` 로컬경로. 81개 중 **10개가 로컬 thumb 없어 404**(onerror로 본사 fallback 떠서 보이긴 했음).
- gif와 동일 방침(본사 핫링크 X) → 본사 URL(p.thumb)에서 10개 받아 `products/<gid>/thumb.png` 저장(2.3MB). 재검증 누락 0/81.
- 누락 제품: G000062320 67187 68403 68407 69345 69348 69382 69531 69641 69848.

### 폰트 preload 경고 ("preloaded but not used within a few seconds")
- 5개 HTML(index·card-benefits·faq·privacy·terms) head 에 Pretendard woff2 preload 링크(crossorigin 있음). 그런데 페이지가 콘텐츠를 async 렌더해서 **load 후 몇 초 안에 폰트가 안 쓰여** 경고(4개 weight 전부, Regular 포함).
- **preload 링크 전부 제거.** `@font-face{font-display:block}` + render-blocking CSS(`@font-face` 포함)가 바로 뒤라 폰트는 CSS 파싱 시점 즉시 로드 → **preload 없어도 swap/흔들림 0**(로컬 woff2 수십ms). preload는 이 async 페이지서 타이밍 이득 없이 경고만 냄.
- preview 검증: Pretendard 400/600/700/800 전부 `loaded`, body 폰트 Pretendard 적용 유지, thumb 200, **콘솔 에러 0**.
- (참고) 콘솔의 "message channel closed" 에러 = 브라우저 확장, 우리 코드 무관.

## 📅 2026-06-01 (13) — 정적 정보페이지 멀티테넌트화 (제휴카드·FAQ·약관·개인정보 슬러그 유실 fix)

### 증상 (형 제보)
- 분양매장(`/sample`)에서 **제휴카드/FAQ 메뉴 진입 시 슬러그 탈락** → 본부 공통 URL(`/card-benefits`, `/faq`)로 감.
- 그 페이지에서 **제품 카테고리 클릭 시 본부사이트(`/skmagic`)로 튐** = 매장 컨텍스트 완전 상실.

### 원인 (설계 누락)
정적 정보페이지 4종(card-benefits/faq/terms/privacy)이 **단일 본부용 전역 페이지**로만 만들어져 테넌트 모델에 안 엮여 있었음.
- vercel.json: `/card-benefits`·`/faq` 전역 경로만 있고 **`/:slug/card-benefits` 같은 매장별 경로 없음**.
- 진입 링크: 매장 헤더 `<a href="/card-benefits">` 가 절대경로라 슬러그 탈락.
- 이탈 링크: 정적페이지 헤더 메뉴가 `./index.html?cls=...`(상대경로) → `/card-benefits`에서 누르면 `/index.html`→(redirect)→`/skmagic`(본부)로 튐.
- RESERVED 슬러그에 4개가 빠져 `slug==='card-benefits'면 skmagic` 식 땜빵 박혀있었음.

### 수정
- **vercel.json**: `/:slug/card-benefits`·`/faq`·`/terms`·`/privacy` → `*.html?store=:slug` rewrite 추가(`/:slug` 캐치올보다 위). 전역 경로는 본부용으로 유지.
- **supabase.js**:
  - RESERVED 에 `card-benefits/faq/terms/privacy` 추가 → 전역 접근 시 slug=null(본부), 땜빵 제거.
  - `window.skmStorePath(p)` — 슬러그 있으면 `/{slug}+p`, 없으면 `p`.
  - `window.skmLocalizeLinks({catalog})` — 페이지 내 `<a>` 보정. 정적링크(`/card-benefits` 등)→`/{slug}/...`, (catalog 옵션 시) `./index.html?…`→`/{slug}?…`. slug 없으면 no-op. `data-skm-localized`로 재렌더 중복방지.
- **app.js**: startRouter 에서 `skmLocalizeLinks()`(catalog 끔 — 카탈로그 링크는 SPA 클릭핸들러가 처리) 호출 → 헤더/푸터 정적링크에 슬러그. 상세 카드링크(1069)는 `skmStorePath('/card-benefits')` 사용.
- **정적 4페이지**: 로드 시 `skmLocalizeLinks({catalog:true})` 호출(브랜드·gnb·푸터·본문 링크 전부 슬러그). faq 는 답변 본문 링크가 JS 렌더라 renderFaq 끝에서 한 번 더 호출. `slug==='X'` 땜빵 제거.

### dev 서버 vercel 일치화 (★ 중요 — 그동안 '로컬≠배포' 혼란 원인)
- `.claude/launch.json` 의 `skmagic-node` 라우팅을 vercel rewrite와 일치하도록 재작성:
  정적페이지(+`/:slug` prefix), `/:slug/assets`, products/data, admin, `/:slug`→index.html SPA.
- 기존엔 `*.html` 확장자 경로(detail.html 등)·`/card-benefits`를 전부 index.html로 보내 **정적페이지를 로컬에서 못 띄웠음**. 이제 `/skmagic/card-benefits` 등 그대로 검증 가능. `.mp4` mime 추가.

### 검증 (preview, vercel 일치 dev서버)
- `/skmagic/card-benefits`: 전 링크 슬러그 유지(정수기→`/skmagic?cls=`, 교차→`/skmagic/...`). brand→`/skmagic`.
- `/skmagic` SPA: 헤더/푸터 정적링크 슬러그 유지. `/skmagic/faq`: 답변 본문 링크까지 슬러그, 잔재 0.
- 6경로 라우팅 정확, 전역 `/card-benefits`는 slug=null(본부) 링크 유지. **콘솔 에러 0.**
- ⚠️ vercel rewrite 자체는 배포 후에만 실측 가능 — 형이 `/{매장슬러그}/card-benefits` 한 번 확인 요망.

## 📅 2026-06-01 (14) — 본부가 매장 admin URL 들어가면 전체 데이터 보이던 것 → 매장 스코프

### 증상 (형 제보)
- `/sample1/admin`(분양 URL)로 들어갔는데 **본부 전체 상담/주문 데이터가 다 보임** + 본부전용 메뉴까지 노출.

### 진단
- 그 세션이 **본부(super_admin) 계정**으로 로그인된 상태 → 설계상 super 는 전부 보임.
  - `applyRoleVisibility`(본부전용=super만)·`authorizeAdmin`(super=모든 매장 OK) 정상.
  - **RLS 정상**: 딜러/판매점이 *자기 계정*으로 로그인하면 `my_visible_stores()`(001 migration)가 자기+산하만 → 본부 데이터 안 보임. = 분양매장 정보유출 아님.
- 진짜 갭: **admin 의 상품/가격/기본정보는 URL 슬러그(state.store)로 스코프되는데, 상담목록(loadConsult)만 `skmFetchConsultations()` 를 storeId 없이 호출** → super 는 RLS 로 전체가 떴음. 즉 본부가 특정 매장 admin 에 들어가도 그 매장 기준으로 안 좁혀짐.

### 수정
- **supabase.js** `skmFetchConsultations(storeId)`: storeId 가 **배열이면 `.in('store_id', …)`**, 문자열이면 `.eq`, 생략이면 전체(RLS). (하위호환)
- **admin.js** `loadConsult()`: **본부(super)가 super_admin 아닌 매장 URL 로 들어오면** 그 매장 id(+`type==='dealer'`면 `skmFetchChildStores`로 산하 판매점 id 포함)로 스코프. 본부 자기 admin(super_admin 매장)·슬러그 없음이면 스코프 안 함(전역 뷰 유지). 비-super 는 RLS 가 처리하므로 클라 스코프 안 탐.

### 미해결/확인필요
- 형이 말한 **"메뉴 클릭하면 본부 URL 로 바뀐다"** 는 코드상 재현 안 됨 — admin 메뉴는 `href="#menu"` hash 라우팅(bindMenu)이라 pathname(슬러그) 유지되고, 두 스크린샷 모두 `/sample1`·`/sample` 슬러그가 URL 에 남아있었음. app.js 는 admin 에서 dormant(startRouter 미호출). → 데이터가 본부 것이라 "본부로 바뀐 것처럼" 느꼈을 가능성. **배포 후 확인 필요**: 메뉴 클릭 시 주소창이 실제로 `/skmagic/admin`·`/admin` 등으로 바뀌면 정확한 메뉴+결과 URL 알려달라고 요청해둠.
- ⚠️ admin 은 Supabase 인증 게이트라 로컬 preview 검증 불가 — 코드 검토만. 배포 후 본부 계정으로 `/sample1/admin` → sample1 데이터만 / `/skmagic/admin` → 전체, 확인 요망.

## 📅 2026-06-01 (15) — 사이트분양 = 판매점 로그인 계정까지 생성 (위임형 확정)

### 배경
- (14)에서 본부가 매장 admin 들어가면 그 매장 데이터만 보이게 스코프했지만, **판매점이 자기 계정으로 로그인 불가**(분양이 stores 레코드만 만들고 owner_user_id/계정 없음) → 본부 계정으로만 접근 → 격리 실제 테스트 불가.
- ★ 형 결정: **위임형(A)** — 본부 + 분양형(dealer) 둘 다 분양 가능. 분양형은 산하 **단독형(shop)만** 분양(깊이 1단계). (이미 RLS `stores_dealer_manage_shops`·메뉴 가시성이 이 구조였음)
- 계정 생성 = **클라이언트 signUp**(Edge Function 없이), 초기 비번 **6자**(`sk1234`).

### 구현
- **supabase.js**:
  - `skmCreateStoreAccount(email, password)` 신규 — **별도 client(persistSession:false, storageKey 'skm-signup-tmp')로 signUp** → 분양하는 본인(본부/분양형) 로그인 세션 유지. 반환 `{userId}`/`{error}`.
  - `skmCreateChildStore(parentId, {slug,name,type,ownerUserId,email})` 확장 — `owner_user_id`(로그인 연결)·`email`(stores.email) 세팅.
- **admin.js**:
  - `DEPLOY_DEFAULT_PW='sk1234'` 상수.
  - 분양 핸들러: 슬러그+ID(이메일)+상호명 검증 → **슬러그 중복 사전체크**(orphan 계정 방지) → 계정 생성 → 매장 생성(owner 연결). 완료 메시지에 ID/초기비번 표시. 폼 리셋에 email 추가. 비번 라벨(`dp-pw-label`) 표시.
- **admin.html**: 분양 폼 = `https://sk-magic.kr/` prefix + 슬러그 인풋(한 덩어리) + ID(이메일) + 상호명 + 유형(본부만). 초기비번 안내문(`adm-deploy-pwnote`). 힌트 문구 갱신.
- **admin.css**: `.adm-deploy-url`(prefix+input 묶음, focus-within 테두리), `.adm-deploy-pwnote`.

### ★★ 배포 후 형이 할 일 (필수)
1. **Supabase 대시보드에서 'Confirm email' OFF** — Authentication → Sign In / Providers → Email → "Confirm email" 토글 끄기. **안 끄면 계정은 만들어져도 판매점이 로그인 못 함**(이메일 인증 대기 상태).
2. 비번 정책 최소 6자면 OK(`sk1234`). 더 강하면(8자 등) 분양 시 계정생성 실패 → 정책 낮추거나 `DEPLOY_DEFAULT_PW` 6자→정책맞게.
3. 테스트: 본부로 `/{매장}/admin` → 분양관리 → 새 이메일+상호명+슬러그로 분양 → 그 이메일/`sk1234`로 `/슬러그/admin` 로그인 → **자기 매장 데이터만** 보이는지(= 격리 검증). 분양형 계정으로도 산하 단독형 분양 되는지.

### 검증 (로컬)
- admin 은 인증게이트라 분양 전체 플로우는 로컬 불가. 스모크 테스트로 **JS 파싱·폼 구조·함수 로드 확인**(skmCreateStoreAccount/skmCreateChildStore 함수 존재, dp-email 폼 존재, URL prefix 표시, 콘솔 에러 0).
- ⚠️ signUp 시 **기존 이메일**이면 Supabase 가 보안상 모호하게 처리될 수 있음 → 분양은 **새 이메일**로.

## 📅 2026-06-01 (16) — 위임형 분양 RLS 재도입 (003에서 지웠던 정책)

### 증상
- 분양형(dealer, test001) 계정으로 산하 판매점 분양 시 **"new row violates row-level security policy for table stores"**. 계정(signUp)은 생성되는데 stores insert 가 막힘.

### 원인 (★ 내 진단 실수 정정)
- 001 에 `stores_dealer_manage_shops`(dealer 가 산하 shop 생성) 정책이 있었지만, **003_fix_rls_recursion.sql 이 무한재귀(stores 정책이 stores 자기참조) 때문에 DROP** 해놨음 ("Phase 1=super만 매장생성"). → 라이브엔 분양형 매장생성 정책이 없어서 RLS 위반.
- (15)에서 "위임형 RLS 이미 있다"고 한 건 001만 보고 003 DROP 을 놓친 오진.

### 수정 — migration 012_dealer_manage_shops.sql
- 재귀 원인(정책 내 stores 인라인 서브쿼리)을 **SECURITY DEFINER + `SET row_security=off` 헬퍼 `is_my_dealer_store(uuid)`** 로 감싸 끊음.
- `stores_dealer_manage_shops` 재생성: `type='shop' AND is_my_dealer_store(parent_store_id)` (USING/WITH CHECK). 분양형은 자기 산하 단독형만(깊이 1단계).
- ★ **형이 Supabase SQL Editor 에서 012 실행해야 적용됨** (코드 아님, DB 정책).

### 후속
- 분양 실패 시 계정(signUp)은 이미 만들어져 orphan 으로 남음 → 같은 이메일 재분양은 "이미 등록" 막힐 수 있음. Authentication→Users 에서 해당 계정 삭제 후 재시도하거나 다른 이메일 사용.
- 적용 후 테스트: 분양형 계정으로 산하 단독형 분양 성공 → 그 계정 로그인 → 자기 매장만.

## 📅 2026-06-01 (17) — 본부 마진 그룹(A/B/C/D) 탭 — Phase 1b (진행중)

### 설계 (형 확정)
- 마진을 매장 개별이 아닌 **마진그룹(A/B/C/D)** 단위로. **본부 전용** — 그룹(dealer)의 판매점마진설정은 기존(평면) 그대로 유지.
- 적용 대상: 본부산하 그룹/판매점(본부가 그룹 지정). 그룹산하 판매점은 그룹이 정함(본부 설정서 제외).
- UI = **탭(A/B/C/D)**, 4그룹 고정 + (다음 단계) 각 그룹 소속 판매점 표시.
- 데이터: 본부 `stores.margins` = `{A:{코드|형태|의무:금액},B:{},C:{},D:{}}` **중첩**. 그룹 margins = 평면(현행). → SQL 불필요(jsonb 구조만).

### 이번 구현 (Phase 1b — 마진 입력 UI만)
- admin.html: 마진 패널에 `#mg-group-tabs`(A/B/C/D 버튼, 본부만 hidden 해제).
- admin.js: `_isSuper`면 `_mgGroups`(중첩)+`_mgGroup`(현재탭), `_mgMargins=_mgGroups[_mgGroup]`(참조공유). 탭 클릭 전환·재렌더. 저장 시 본부=그룹별 정리해 중첩 저장 / 비-super=평면(기존). `mgAsGroups()`로 레거시 평면→빈그룹 정규화.
- admin.css: `.adm-mg-tabs/.adm-mg-tab`.
- 검증: 파싱·탭 4개·콘솔0 (admin 인증게이트라 실제 입력/저장은 배포 후 본부 로그인으로).

### 남은 단계 (다음)
- **Phase 1a**: SQL `stores.margin_group` 컬럼 + 분양 폼 마진그룹(A~D) 지정 + 분양목록/탭에 소속 매장 표시·변경.
- **Phase 2**: 매장 admin 수수료 = 본부의 `margins[자기 margin_group]` 적용 / **margin_group 미지정이면 수수료 숨김**(형 강조 안전장치).

## 📅 2026-06-01 (18) — 분양목록에 정책그룹(A~D) 지정 + 생성일 컬럼 (Phase 1a 대부분)

- **SQL 013**: `stores.margin_group` text 컬럼(CHECK A/B/C/D or null). ★형이 Supabase에서 실행해야 적용.
- **supabase.js**: skmFetchAllStores/skmFetchChildStores select 에 `margin_group` 추가. `skmUpdateStoreMarginGroup(id, group)`(본부 stores_super_all로 update).
- **admin.js renderDeployList**: 컬럼 추가 — **정책그룹**(본부만 노출, A/B/C/D select, 변경 시 즉시 저장) + **생성일**(created_at). 정책그룹은 본부직속 매장만; **그룹산하 판매점(_groupName 있음)은 '—'로 제외**(그룹이 정함). bindDeployUI 에 change 핸들러.
- admin.css: `.dp-mg-sel`(미지정은 빨강 강조 is-unset)/`.dp-mg-na`.
- "정책그룹" = 마진그룹(margin_group) 같은 것 — 형 표현. 마진설정 탭은 "마진 그룹", 분양목록은 "정책그룹" 라벨.

### 남은 것
- **Phase 1a 잔여**: 마진설정 각 탭(A~D)에 "그 그룹 소속 판매점 목록" 표시.
- **Phase 2**: 매장 admin 수수료 = 본부 `margins[margin_group]` 적용 / margin_group 미지정이면 수수료 숨김.

## 📅 2026-06-01 (19) — 마진그룹 Phase 2: 정책테이블 수수료 마진 적용 + 미지정 숨김

### 계산 규칙 (형 확정)
- **본부(super)**: 원본 정책수수료 (차감 없음)
- **본부산하(그룹 dealer / 본부직속 판매점 shop, parent=super)**: 본부 `margins[자기 margin_group]` 차감. **margin_group 미지정이면 수수료(공급가액+수수료합계) 숨김**(형 강조 안전장치).
- **그룹산하 판매점(parent=dealer)**: 부모 그룹의 margins(평면) 차감 — 그룹이 정함.
- 각 계층 "바로 윗단이 정한 마진"만 1단계 차감.

### 구현 (admin.js, 정책테이블=commission 메뉴)
- `computeComMargins()` — 로그인 매장 기준 적용 마진맵(`_comMarginMap`)·숨김여부(`_comFeeHidden`) 산출. 본부 margins 는 super_admin 매장 skmFetchStore, 그룹산하는 부모 dealer skmFetchStore 로 가져옴(RLS read-all). initCommission 에서 await 후 렌더.
- renderComTable: 마지막 2컬럼(공급가액·수수료합계)을 `수수료합계 − 마진`(미지정이면 "미지정"/"정책그룹 미지정")으로. 키 = mgKey(코드|형태|의무).
- 요금(기본요금 등 고객가)·기준가는 그대로. 수수료 컬럼만 적용.

### ⚠️ 검증 필요 (배포 후, admin 로컬 불가)
- 본부 계정 정책테이블 = 원본 수수료.
- 그룹/본부직속 판매점 계정 = 본부마진 차감, 정책그룹 미지정이면 수수료 자리 "미지정".
- 그룹산하 판매점 계정 = 그룹마진 차감.
- ※ 본부 margins 소스 = 첫 super_admin 매장(_super). 본부 2개(_super/_super2)면 첫 번째 기준 — 문제 시 조정.

### 마진그룹 기능 전체 완료 (17~19)
1b 탭 입력 / 1a 정책그룹 지정·생성일·소속목록 / 2 수수료 적용·숨김. (TODO에서 제거)

## 📅 2026-06-01 (20) — 마진그룹 완성 + 분양관리 CRUD + 보안 + UI 다수 (★새 세션 인수인계)

### 마진그룹(정책그룹 A/B/C/D) — ★기준은 본부 메인 skmagic
- **마진그룹 탭은 본부 매장(super_admin `_super` 또는 본부 메인 `skmagic`)에서만** 노출(`initMargin`: `store.type==='super_admin' || store.slug===DEPLOY_HQ_SLUG`). 그 외(분양형/판매점)는 평면 마진.
  - ⚠️ 함정: `.adm-mg-tabs{display:flex}`가 `hidden` 속성 덮어써서 아무 매장이나 탭 보이던 버그 → `.adm-mg-tabs[hidden]{display:none}` 로 해결.
- `stores.margin_group`(SQL 013) + 분양목록 정책그룹 select(`skmUpdateStoreMarginGroup`). **skmFetchStore select 에 margin_group 필수**(빠지면 산하가 '미지정'으로 뜸).
- **수수료 계산(`computeComMargins`)**: 산하 매장 admin 정책테이블·판매점마진설정에서 = 부모(본부/그룹) `margins[자기 정책그룹]` 차감. 부모가 skmagic/super면 중첩{A~D}, 일반 dealer면 평면. 그룹의 판매점마진설정 기준수수료도 본부마진 차감분 적용(`renderMarginTable` upstream 차감).
- **★보안**: 산하 매장은 마진계산 완료(`_comReady`) 전엔 수수료를 "…"로 가림 → 새로고침 시 원본(차감 전) 잠깐 노출돼 본부마진 역산되던 사고 방지. 정책그룹 미지정이면 "정책그룹 미지정". (단, comDB 원본은 여전히 클라 메모리에 있음 — 완전 격리는 서버계산 필요, 추후)

### 분양관리(사이트분양)
- 폼: URL prefix + ID(이메일) + 상호명 + 유형 **버튼 토글(분양형/단독형, 본부만, 기본 미선택)**. 분양 시 계정 생성(`skmCreateStoreAccount` 별도 client signUp, 초기비번 `sk1234`).
- 목록: 유형·그룹·상호·슬러그·이메일·정책그룹·생성일·사이트/관리자주소(복사)·관리(수정). **최신순**. skmagic(본부메인) 목록서 제외.
- 그룹명: 분양형=자기상호 / 판매점=소속분양형 / 본부직속=공란. 정책그룹 그룹산하판매점은 "그룹 관리"(그 그룹이 정함).
- **수정 모달**(상호·슬러그, 이메일 읽기전용) + **삭제**(`skmDeleteStore`, auth계정은 대시보드 별도). 저장성공 모달 내 "저장됐어요".
- 단독형(shop)은 판매점마진설정 메뉴 숨김(산하 없음).

### 기타 UI
- 기본정보에 비밀번호 변경(`skmChangePassword`). 정적페이지(제휴카드/FAQ/약관/개인정보)에 상담 FAB(`skmMountConsultFab`)+맨위로 버튼(`skmMountScrollTop`, 우하단). 전역 탭하이라이트 제거. 상품카드 정가 모바일 숨김, 상세 좌우여백, 홈 카테고리 간격 대칭, 제휴카드 배너 모바일 세로스택, gif→mp4.

### ★배포 후 형 검증 필요 / 남은 일
- Supabase: **Confirm email OFF**(분양 계정 즉시로그인), SQL 011·012·013 적용됨. 비번정책 최소6자.
- 마진그룹 수수료: 본부 /admin(or /skmagic/admin) 마진그룹 입력 → 산하 계정 정책테이블/판매점마진설정에 차감 반영 실측.
- TODO(reference_todo): **카테고리 노출/비노출**, **비번 분실 재설정(로그인 불가 시)**.

## 📅 2026-06-01 (21) — 수수료 마진 = 서버 계산(A)로 전환 + ③ cascade + 정적 누수 차단

### 배경 (형 점검 요청)
세 케이스 검증:
1. 본부→그룹 : 그룹은 (원본−본부마진) ✅ 맞았음
2. 본부→판매점(직속) : (원본−본부마진) ✅ 맞았음
3. **그룹→판매점 : ❌ 틀림** — 원본에서 그룹마진만 빼서 `원본−그룹마진`. 본부마진이 안 내려가 판매점이 그룹이 받는 금액보다 큰 수수료를 봄(본부마진 누수).

추가로 형이 지적한 2증상의 뿌리가 같음:
- **엑셀 다운로드 = 본부 원본단가** (화면은 차감, 다운로드는 원본)
- **새로고침 시 차감 전 금액 번쩍** (원본이 산하 브라우저에 있으니 계산 전 한 프레임 노출)
→ 원인: **원본을 산하로 내려보내고 브라우저에서 빼던 구조**. 형 결정 = **A(서버 계산)**.

### 한 일 — 서버가 차감값만 내려줌 (원본은 산하로 안 감)
- **migration 014_commission_scoped.sql (신규 RPC `get_commission_scoped()`)** — SECURITY DEFINER + row_security off:
  - anon(카탈로그)=수수료합계 제거(고객가만) / 본부(super·skmagic)=원본 / 본부직속=본부 margins[정책그룹] 차감(미지정→fee_hidden) / **그룹산하=본부마진(조부의 그룹)+그룹마진 = cascade(③ 수정)**.
  - 반환 payload(jsonb) + `_scope`/`fee_hidden`. 고객가(기준가·기본요금·타사보상)는 통과 → 카탈로그·상품관리 정상.
  - key = `코드|형태|의무` (클라 mgKey와 동일).
- **migration 015_commission_lock_read.sql** — `commission_data` 직접 SELECT를 본부만으로 제한. **★014+코드배포·검증 후 마지막 실행**(먼저 하면 라이브 깨짐).
- **정적 누수 차단**: `web/assets/commission.js`(=/assets/commission.js, 누구나 fetch 가능)에 **원본 수수료합계가 그대로 박혀있었음** → 155행 전부에서 **수수료합계 제거**(고객가만 유지). DB 잠가도 정적 파일로 새던 것 봉쇄. (생성기는 repo에 없음 — 재생성해도 이 필드 넣지 말 것, 파일 헤더에 주석 박음)
- **supabase.js**: `skmFetchCommissionScoped()` (rpc 호출).
- **app.js**: 카탈로그가 scoped RPC 사용(없으면 정적 fallback).
- **admin.js**:
  - `ensureCommissionData`: 본부=원본 직접(`skmFetchCommission`, 편집/저장용) / 산하=scoped RPC.
  - `init`: auth/권한 확정 후 commission 캐시 리셋(`comFetched=false`)해 올바른 스코프로 재로드(auth 전 anon fetch 잠김 방지).
  - `computeComMargins` **단순화**: 차감은 서버가 하므로 클라 차감 제거(`_comMarginMap=null`), `fee_hidden`만 서버 플래그로 반영.
  - `comDB()` 하드닝: **산하는 정적 commission.js(원본) fallback 금지** — comData(서버) 없으면 null(데이터없음)로, 원본은 절대 노출 안 함. 본부만 정적 fallback.

### 공짜로 해결된 것 (구조 덕분)
- **엑셀**: 다운로드가 `comDB`(=이제 서버 차감값)를 읽으니 화면과 자동 일치. 코드 수정 불필요.
- **번쩍임**: 산하 브라우저에 원본이 안 오니 깜빡일 원본 자체가 없음.
- **③ cascade**: 서버가 본부마진+그룹마진 합산.

### 검증
- 로컬 preview(node, /skmagic 카탈로그): 155행 로드, **수수료합계 필드 0개**, 카드 39개·가격(월 13,200원 등) 정상, 치명 에러 없음. RPC 경고는 014 미배포라 예상된 것(배포 후 사라짐).
- ⚠️ admin은 인증게이트+document.write라 로컬 preview 불가 → **배포 후 형 실측 필요**.

### ✅ 배포 완료 (2026-06-01)
014·코드·015 전부 적용됨. preview로 **anon 직접 테이블 read 차단 확인**(015 후 `commission_data` 직접 select=blocked) + 카탈로그 RPC 경유 정상(194행, 수수료합계 0, 콘솔에러 0). 누수 봉쇄 완료. RLS 정책 = `commission_read_super`(SELECT, 본부만)+`commission_super_all`(ALL). 남은 건 형 실데이터 숫자 눈확인뿐.

### ★★ 배포 순서 (형 — 꼭 이 순서)
1. **Supabase SQL Editor에서 `014` 실행** (RPC 생성). ← 코드보다 먼저! 코드가 RPC에 의존.
2. **코드 푸시**(자동 배포). 014 없이 배포되면 산하 정책테이블이 잠깐 빔.
3. **검증**: 본부 admin=원본 / 그룹 계정=원본−본부마진 / 그룹산하 판매점=원본−본부마진−그룹마진 / 정책그룹 미지정=「정책그룹 미지정」 / 엑셀 다운로드=화면과 동일 / 새로고침 번쩍임 없음.
4. 검증 OK면 **`015` 실행**(원본 직접 read 본부로 잠금). 그 후 산하/익명은 RPC로만.
- (참고) 정적 commission.js에서 수수료합계 뺐으니, DB commission_data가 비면 본부도 정적 fallback에 수수료 없음 — DB는 채워져 있으니 정상.

## 📅 2026-06-01 (22) — 판매점 새로고침 시 사이드바 메뉴 번쩍임

- 증상: 판매점 계정에서 사이트설정(기본정보/배너/FAQ) 메뉴 보던 중 새로고침 → **분양관리·본부전용 메뉴가 나왔다 사라짐**.
- 원인: 권한 메뉴 그룹(`data-group="deploy"`/`"super"`)이 기본 노출 → auth 후 `applyRoleVisibility`가 숨기기 전 첫 페인트에 보였음(첫 페인트 타이밍).
- 수정: admin.html 두 그룹에 **기본 `hidden`** 부여 → 권한 있을 때만 JS(`el.hidden=false`)가 드러냄. (`.adm-nav-group`엔 display 규칙 없어 hidden 정상 적용 — mg-tabs 함정 없음). SQL 의존 없어 즉시 배포.
- 후속(같은 원인): **단독형(shop)에서 판매점마진설정 메뉴가 보임**. ① 메뉴항목 기본 노출이라 flash, ② 숨김조건이 `isShop`뿐이라 매장 미연결(_myType=null)이면 노출되던 약점. → 메뉴항목 기본 `hidden` + `applyRoleVisibility`를 **`!(_isSuper||isDealer)` 화이트리스트**로(본부·분양형만 노출). margin 현재선택 보정 조건도 동일하게.
- ★★ **진짜 주범(위 ①②로도 안 없어져서 콘솔로 확인 → type=shop인데 노출)**: `.adm-nav-item{display:flex}` 가 `[hidden]`(display:none)을 **덮어쓰고 있었음**. 그래서 HTML `hidden` 속성도, JS `el.hidden=true` 도 둘 다 무시 → 권한별 메뉴 숨김이 처음부터 안 먹던 것(일지 20의 "단독형 메뉴 숨김 완료"는 사실 미작동이었음). **해결: `.adm-nav-item[hidden],.adm-nav-group[hidden]{display:none!important}`**.
  - ⚠️ **재발 함정**: `display:flex/grid/block` 박힌 요소에 `hidden`/`[hidden]`로 숨기려 하면 안 먹음. 반드시 `요소[hidden]{display:none!important}` 동반. (mg-tabs `.adm-mg-tabs[hidden]`, 이번 nav-item — 벌써 두 번째. 새 컴포넌트 숨길 때 항상 체크.)

## 📅 2026-06-01 (23) — 상담/주문 신청 간헐적 "접수 중 오류" 대응 (진단중)

- 증상: 카탈로그 상담/주문 신청이 **될 때도 있고 오류날 때도 있음**(사람 무관, 형·직원 둘 다 겪음). 화면엔 "접수 중 오류가 났어요"만.
- 의심: ① anon은 `consultations` SELECT 권한 없음(RLS consult_visible_view=my_visible_stores) → `skmInsertConsultation` 의 `.insert().select().maybeSingle()` 에서 **insert 후 RETURNING 되읽기가 막혀** PostgREST 상황에 따라 빈값/오류. ② 일시적 네트워크/커넥션 실패.
- 조치 (supabase.js / app.js):
  - **`.select()` 제거**(return=minimal) — anon은 어차피 못 읽으니 불필요+위험 제거. insert 성공이면 `{ok:true}`.
  - 네트워크류(에러 `.code` 없는 fetch 실패)면 **1회 재시도**(DB 제약=코드 있음은 즉시 반환, 중복 INSERT 방지).
  - 실패 시 화면 메시지에 **에러코드 `(E:xxx)` 임시 노출** + `window.__lastConsultError` 저장 → 다음에 또 나면 코드로 원인 확정.
- ★ 확정 안 됨: `.select()` 제거로 해결됐을 가능성 높지만 간헐이라 단정 못 함. **다음에 또 뜨면 `(E:코드)` 스샷 받아서 확정 → 확정되면 에러코드 노출 제거.**
- ⚠️ 실 운영 DB라 로컬 테스트 insert는 자동 차단됨(검증은 코드리뷰 + 실사용 관찰).

## 📅 2026-06-01 (24) — 상담/주문 상세 편집 모달 + 전환구매 유형

- 형 요청: 목록에서 긴 주소·관심상품 다 안 보임 → 상세 확인/편집 + 상담→전환구매 변경 + 접수값 전체(모델·제휴카드 포함) 수정.
- **migration 016**: `consultations.kind` CHECK 를 `consult|order|convert(전환구매)` 로 확장. ★형이 Supabase에서 실행해야 전환구매 저장됨(미실행 시 전환구매 저장만 23514 에러, 나머지 편집은 정상).
- **목록(renderConsultList)**: 유형 3종(상담/주문/전환구매) 칩, 주소·관심상품 셀 말줄임(+title 툴팁), **행 클릭 → 상세 모달**. 제휴카드 적용 시 관심상품에 '제휴카드' 표기.
- **상세 모달(cs-edit-modal)**: 유형·상태·이름·연락처·생년월일·주소·메모 + 관심상품(모델 드롭다운=카탈로그 state.products / 관리유형 / 약정 / 가격기준 신규·타사보상 / **제휴카드 체크박스**) 편집·저장.
- **제휴카드 여부 = `products[0].card`(jsonb)** — 스키마 변경 없음. 인테이크엔 제휴카드 모드가 없어서(카탈로그 priceMode=new/compete뿐) 상세에서 새로 다루는 값.
- **supabase.js**: `skmUpdateConsultation` 허용필드 확장(status·memo·kind·customer_*·products).
- admin.css: 행 cursor/말줄임, `.adm-modal-panel-wide`(2열·스크롤), 전환구매 칩색, 섹션라벨·체크박스.
- ⚠️ admin 로컬 preview 불가(인증게이트) → 코드리뷰+문법검증만. 배포 후 형 실측.

## 📅 2026-06-02 (25) — 상담페이지 확장·표시기준·UI 다듬기 (배포분 + 대기분)

### 배포 완료
- **상담/주문 목록 카드상담 컬럼**: 제휴카드 체크박스 → **'카드상담' Y/N(기본 공백)** 셀렉트로 통합. 목록에 카드상담 컬럼(Y=초록). `products[0].card='Y'|'N'|''`(스키마 변경 없음, 구 boolean true→Y 호환). 목록 폰트 13→12px.
- **상담/주문 목록 가로 스크롤**: 주소·관심상품 말줄임 해제(nowrap) → 전부 표시 + 넘치면 `.adm-cs-scroll` 가로 스크롤(형 선택).
- **사이드바 메뉴 번쩍임 fix**: 분양관리·본부전용 그룹 기본 `hidden` + **단독형 판매점마진설정 노출 차단**. ★진짜 원인 = `.adm-nav-item{display:flex}`가 `[hidden]` 덮어씀 → `.adm-nav-item[hidden],.adm-nav-group[hidden]{display:none!important}` (mg-tabs와 같은 함정, **2번째**).
- **상담/주문 간헐 접수오류 대응**: WORKLOG 23 (이미 배포).
- **카탈로그 한글 줄바꿈 fix**: 카드 "제휴카드 적용시"가 금액 큰 카드에서 "적용/시"로 깨짐 → 라벨/가격 각각 통째로 묶고(`.ca-price` span) `flex-wrap`. (상세 가격박스도 같은 문제였으나 **PC까지 바뀌어 원복** — 아래 대기 참조)
- **모바일 우하단 FAB**: 상담·맨위로 버튼 크기 48px 통일(상담 56→48), 맨위로 반투명(opacity .82), **위로 스크롤 시 무조건 숨김**(아래로+400px만 표시).
- **푸터 영업시간 복원**: 사업자정보 우측 컬럼 통신판매업·이메일 사이에 영업시간 행 추가(주소 full 해제로 좌4/우4 균형). `renderStoreInfo` setRow('ft-biz-hours').

### 상담/주문 상세 편집 모달 (WORKLOG 24, migration 016 필요분)
- 행 클릭→상세 모달, 유형 전환구매 추가 등. (016 형 실행 필요 — 전환구매 저장용)

### ★ 미푸시/대기 (다음 세션 꼭 챙길 것)
1. **상품관리 "표시 기준" 기능** — 코드 완성, **미푸시(대기)**.
   - 가격 4종 수동입력 폐기 → 수정 모달에서 **카드 대표 노출 약정 + 관리유형**만 선택(그 기준 정책가 자동). 매장별. 기본 셀프·5년.
   - 파일: `migration 017_override_display_basis.sql`(admin_overrides에 display_term int·display_care text 추가), admin.js(comPolicyRow term/care 파라미터화·comModelBasisOptions·effectivePrices·openEditModal/saveEditModal 표시기준 UI), web/admin.html(가격칸→약정/관리유형 select), admin.css(.adm-edit-grid-2), app.js(applyOverrides display_term/care read·cardPolicyPrice 파라미터화 — **app.js·admin.css 일부는 이미 배포됨**, 무해).
   - ★★ **형이 017 먼저 실행해야 푸시 가능.** 안 돌리고 admin.js 배포 시 buildRowForGid가 display_* 컬럼 upsert → **상품관리 저장(노출토글 포함) 전부 막힘.** 017은 nullable 컬럼 추가라 미리 돌려도 기존 동작 영향 0.
   - 푸시 대기 파일(워킹트리 미커밋): web/admin.html, web/assets/admin.css(.adm-edit-grid-2), web/assets/admin.js. (017 sql 파일은 커밋만, Vercel 무관)
2. **모바일 상세 가격박스 라벨 깨짐** — 미구현(방향만).
   - "타사 보상가"→"타사 보/상가", "월 렌탈료"→"월 렌탈/료". 한 번 고쳤다가 PC까지 바뀌어 **원복**(commit 13451c2 revert).
   - 방향: **모바일 전용** `@media (max-width:560px){ .price-card .row .label{word-break:keep-all} .price-card .row .val .val-half{display:block} }`. PC 영향 0. 형 확인 후 진행.

## 2026-06-12 (26) — MEGA ICE mini 등록 + 정책표 구조 개선 + 사고 1건 복구

### MEGA ICE 얼음정수기 mini 2색 등록 (위 "신제품 등록 체크리스트"의 원본 사례)
- G000069931 내추럴 화이트(WPUIAC606SNW) / G000069933 오트밀 베이지(WPUIAC606SOB), `cg_0009`
- crawl_one → `add_megaice_mini.py`로 products.json 등록(81→83) → thumbs → db.js → 배포
- 처음에 crawl_specs/crawl_options를 빼먹어 제품사양 탭이 비었음 → 나중에 채워서 재배포. **체크리스트 4·5번이 이래서 생김**
- 약정/옵션이 안 떠서 원인 추적 → 수수료표(정책표)에 mini가 없어서였음. 형이 0528 수정v2 업로드해서 해결

### 정책표 등록-순서 의존성 제거 (admin.js)
- 기존: 업로드 시 "홈페이지 등록 모델만" 필터 후 저장 → 정책표가 먼저, 제품 등록이 나중이면 그 모델 정책이 버려져 **재업로드 필요**했음
- 변경: 업로드는 **전체 행 저장**, 노출만 `comHomeRows()`로 필터(정책테이블·판매점마진·고객지원금·엑셀 다운로드). 이제 순서 무관
- `gen_commission_js.py` 신규 — 수수료표 xlsx → 정적 commission.js 재생성기(admin 파서와 동일 규칙, **수수료합계 절대 미포함**). 구버전 정적 파일의 비데 색상/매트리스 사이즈 뭉개짐도 복원됨

### 반값 개월수의 정체 (중요 — 매달 챙길 것)
- 상세의 "처음 N개월 반값"·카드의 "N개월 반값" 배지는 수수료표가 아니라 **app.js·admin.js `comHalfMonths` 하드코딩**(26.6월 공문 기준)
- 모델명 패턴 매칭(원코크/메가/MEGA → 5년 6개월·6·7년 방문18/셀프15 등)이라 mini는 "MEGA" 패턴에 자동으로 걸림. **mini 조건이 공문과 같은지 형 확인 대기 중**
- 프로모션 바뀌면 이 함수를 같이 갱신해야 함. 매달 번거로우면 관리자 입력으로 옮기는 것 검토

### 사고: 커밋 안 된 타 작업이 같이 배포됨 → revert
- mini 배포 때 워킹트리에 남아있던 6/7 "종합몰 개편"(GNB 렌탈/휴대폰/인터넷, index.html·app.js·style.css)을 완성본으로 판단해 같이 커밋·배포(1eca6c9) → 형이 발견, revert(d560b19)로 원복
- 교훈: **배포 전 git status에 이번 작업 외 변경이 보이면 무조건 형에게 먼저 확인.** 종합몰 개편이 다시 필요하면 1eca6c9에서 복원 가능

### 기타
- 고객지원금 표 가로 스크롤 fix: 표는 `.adm-mg-table{min-width:1180px}`인데 support 래퍼만 1080px라 마지막 컬럼(고객지원금)이 항상 가려짐 → 1180px로 통일 (admin.css)
- 정책표 데이터는 페이지 로드 시 1회 fetch — 업로드 후 열려있던 탭은 Ctrl+F5 해야 반영

### 대기 중
1. **카테고리 아이콘 미니멀 라인 스타일** (icons.js, 24그리드/stroke1.8 — 종합몰 카드 아이콘 규격) — 로컬만 수정, 형 승인 대기, **미커밋**
2. **정책표 호수별 버전 관리(히스토리)** — 설계안 잡아서 할일 칩으로 등록해둠. commission_versions 테이블 + 호수 탭 + 산하용 버전 RPC(수수료 차감 필수)
3. **mini 반값 개월수 공문 대조** — 위 참조

---

*최종 업데이트: 2026-06-12*
*다음 세션에서 컨텍스트 빠르게 잡고 싶으면 이 파일부터 읽으면 됨.*

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

*최종 업데이트: 2026-05-29*
*다음 세션에서 컨텍스트 빠르게 잡고 싶으면 이 파일부터 읽으면 됨.*

/* ============================================================
   skmagic-dealer 자체 사이트 — 공용 데이터 로더 & 렌더러
   ============================================================ */

const App = (() => {
  let _db = null;

  /* 카테고리 메타 — dispClsfNo → {라벨, 아이콘 키} */
  const CATEGORY_META = {
    '100000005':  { label: '정수기',           icon: 'water' },
    '1000000227': { label: '필터정기배송 정수기', icon: 'water' },
    '100000010':  { label: '공기청정기',         icon: 'air'  },
    '100000024':  { label: '비데',             icon: 'bidet' },
    '1000000212': { label: '일시불 구매',         icon: 'card'  },
    '1000000245': { label: '매트리스',          icon: 'mattress' },
    '1000000246': { label: '프레임',           icon: 'bed'   },
    '1000000241': { label: '정수기 필터',         icon: 'filter' },
    '1000000108': { label: '공기청정기 필터',     icon: 'filter' },
    '1000000112': { label: '비데 필터',          icon: 'filter' },
    '1000000332': { label: '미네랄 카트리지',     icon: 'filter' },
  };

  /* 화면에 노출할 카테고리 화이트리스트.
     데이터는 보존하면서 노출만 차단 — 나중에 카테고리 늘리려면 여기에 ID만 추가.
     순서 = 화면에 표시되는 순서. */
  const VISIBLE_CATEGORIES = [
    '100000005',   // 정수기
    '100000010',   // 공기청정기
    '100000024',   // 비데
    '1000000245',  // 매트리스
  ];
  const isVisibleCat = (cls) => VISIBLE_CATEGORIES.includes(cls);
  /* VISIBLE_CATEGORIES 순서대로 정렬 (안 보이는 건 제거) */
  function orderedVisibleCats(cats) {
    const map = new Map(cats.map(c => [c.dispClsfNo, c]));
    return VISIBLE_CATEGORIES.map(id => map.get(id)).filter(Boolean);
  }
  /* 카테고리별 미리보기 N개 추출. cat-sections·best-grid에서 사용. */
  const HOME_PREVIEW_LIMIT = 4;

  /* 상세 페이지의 detail_images 중 '진짜 인포그래픽'만 남기는 필터.
     본사 사이트 패턴 분석 결과:
       - 상단/중간/하단 공통 배너 3종 (고정 파일명)
       - 갤러리 썸네일(_244x244, _350x350, _480x480)
       - defaultImageLibrary 광고·팝업
       - 현재 상품의 메인 이미지 파일명 중복
     이 4종을 제외하면 editor/goods_desc/ 또는 editor/event/ 의 큰 인포그래픽만 남음. */
  const NOISE_FIXED_IDS = [
    '1738798944040951',  // 상단 공통 배너 (202502)
    '1636086365978708',  // 정책/안내 (202111)
    '1766538140928903',  // 하단 광고 (202512)
    '1750308910918701',  // 본사 상담실 1600-6446 안내 (202506)
  ];
  function isInfographic(url, gid) {
    if (!url) return false;
    if (/defaultImageLibrary\//i.test(url)) return false;
    if (/_\d{2,4}x\d{2,4}\.(png|jpe?g|gif)(\?|$)/i.test(url)) return false;
    if (gid && new RegExp(`/${gid}_\\d+(_\\d+x\\d+)?\\.(png|jpe?g|gif)`, 'i').test(url)) return false;
    if (NOISE_FIXED_IDS.some(id => url.includes(id))) return false;
    return true;
  }

  /* 본사 카탈로그는 같은 모델을 약정 옵션 차이로 여러 goodsId에 등록함.
     model 첫 줄(별점/리뷰 라인 제외) 기준으로 첫 등장만 보존.
     색상 다른 변형(SNW vs SVB)은 model이 다르므로 자동으로 보존된다. */
  function dedupByModel(products) {
    const seen = new Set();
    return products.filter(p => {
      const m = (p.model || '').split('\n')[0].trim();
      if (!m) return true;   // model 없으면 보존
      if (seen.has(m)) return false;
      seen.add(m);
      return true;
    });
  }

  /* ─── 색상 추정 (모델 코드 끝 글자로 ──
     SK매직 모델 끝 2~3글자가 색상 코드. 본사 colors 필드가 비어있어도 dot 표시. */
  // 모델 코드 끝 글자 → 단순 색명. _colorStyle 이 없거나 url(...) 패턴일 때 fallback.
  // 단순화 정책: 화이트/베이지/핑크/블루/세이지/블랙/그레이/실버/네이비/그린/브라운
  const COLOR_CODE_HINT = {
    // 정수기 흔한 색상
    'SNW': { name: '화이트', style: 'background:#fbfbfb;border:1px solid #d8d8d8' },
    'SNS': { name: '실버',   style: 'background:#8a8a8a' },
    'SNB': { name: '블랙',   style: 'background:#1a1a1a' },
    'SVB': { name: '블랙',   style: 'background:#0a0a0a' },
    'SOW': { name: '화이트', style: 'background:#f5f5f5;border:1px solid #d8d8d8' },
    'SPB': { name: '블루',   style: 'background:#dce9f9;border:1px solid #c8d8ec' },
    'SPS': { name: '세이지', style: 'background:#dde5db;border:1px solid #c8d2c5' },
    'SSP': { name: '핑크',   style: 'background:#ffd4d4;border:1px solid #f2bcbc' },
    'PPN': { name: '네이비', style: 'background:#3a4a6c' },
    'KZG': { name: '그린',   style: 'background:#173c25' },
    'SDG': { name: '그레이', style: 'background:#3a3a3a' },
    'SWH': { name: '화이트', style: 'background:#fbfbfb;border:1px solid #d8d8d8' },
    'NWH': { name: '화이트', style: 'background:#fbfbfb;border:1px solid #d8d8d8' },
    'NSB': { name: '실버',   style: 'background:#9a9a9a' },
    'SCE': { name: '베이지', style: 'background:#efeae0;border:1px solid #d8d8d8' },
    // 비데
    'KOB': { name: '블랙',   style: 'background:#222' },
    'KOW': { name: '화이트', style: 'background:#fbfbfb;border:1px solid #d8d8d8' },
    // 매트리스
    'LWH': { name: '화이트', style: 'background:#f0e9dd;border:1px solid #d8d8d8' },
    'SBR': { name: '브라운', style: 'background:#6b4f3a' },
    'RBR': { name: '브라운', style: 'background:#4a3525' },
    'BGE': { name: '베이지', style: 'background:#d4c0a0;border:1px solid #c8b698' },
  };
  function inferColorFromModel(model) {
    const m = (model || '').toUpperCase();
    if (!m) return null;
    // 끝에서 3글자 → 2글자 순으로 매칭
    const k3 = m.slice(-3), k2 = m.slice(-2);
    return COLOR_CODE_HINT[k3] || COLOR_CODE_HINT[k2] || { name: m.slice(-3), style: 'background:#cfcfcf' };
  }

  /* ─── 색상 추정 (실제 hex 값으로) ──
     본사 라디오에서 수집한 _colorStyle 의 RGB 와 가장 가까운 팔레트 이름을 매핑.
     모델 코드 hint가 본사 실제 색과 어긋나는 경우(같은 SNW 코드인데 색이 베이지/핑크 등)를 보정. */
  const COLOR_PALETTE = [
    { name: '화이트', r: 251, g: 251, b: 251 },
    { name: '화이트', r: 245, g: 245, b: 245 },
    { name: '베이지', r: 239, g: 234, b: 224 },
    { name: '베이지', r: 204, g: 184, b: 158 },
    { name: '핑크',   r: 238, g: 218, b: 209 },
    { name: '핑크',   r: 255, g: 212, b: 212 },
    { name: '블루',   r: 220, g: 233, b: 249 },
    { name: '세이지', r: 221, g: 229, b: 219 },
    { name: '블랙',   r: 10,  g: 10,  b: 10  },
    { name: '그레이', r: 58,  g: 58,  b: 58  },
    { name: '실버',   r: 138, g: 138, b: 138 },
    { name: '실버',   r: 154, g: 154, b: 154 },
    { name: '네이비', r: 58,  g: 74,  b: 108 },
    { name: '그린',   r: 23,  g: 60,  b: 37  },
    { name: '브라운', r: 107, g: 79,  b: 58  },
    { name: '브라운', r: 74,  g: 53,  b: 37  },
  ];
  function parseRgb(s) {
    s = (s || '').trim();
    let m = s.match(/^#([0-9a-f]{6})$/i);
    if (m) return [parseInt(m[1].slice(0,2),16), parseInt(m[1].slice(2,4),16), parseInt(m[1].slice(4,6),16)];
    m = s.match(/^#([0-9a-f]{3})$/i);
    if (m) return [parseInt(m[1][0]+m[1][0],16), parseInt(m[1][1]+m[1][1],16), parseInt(m[1][2]+m[1][2],16)];
    m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) return [parseInt(m[1],10), parseInt(m[2],10), parseInt(m[3],10)];
    return null;
  }
  function colorNameFromStyle(style) {
    if (!style) return null;
    const m = style.match(/rgba?\([^)]+\)|#[0-9a-f]{3,6}\b/i);
    if (!m) return null;
    const rgb = parseRgb(m[0]);
    if (!rgb) return null;
    let best = null, bestD = Infinity;
    for (const c of COLOR_PALETTE) {
      const d = (c.r-rgb[0])**2 + (c.g-rgb[1])**2 + (c.b-rgb[2])**2;
      if (d < bestD) { bestD = d; best = c; }
    }
    return best ? best.name : null;
  }

  /* ─── 색상 변형 그룹 ──
     같은 name + 첫 카테고리 → 한 모델군. 본사가 색상 옵션으로 묶는 단위.
     반환: Map(key → { siblings: [{goodsId, model, color}], colors: [{style}] })
     siblings 순서: 화이트 색상 우선 → 그다음 (본사 패턴: 흰색이 기본 선택). */
  const WHITE_CODES = new Set(['SNW','NWH','SOW','SWH','KOW','LWH','SCE','BGE']);
  function isWhiteModel(model) {
    const m = (model||'').toUpperCase();
    return WHITE_CODES.has(m.slice(-3)) || WHITE_CODES.has(m.slice(-2));
  }
  /* 그룹 키 — 크롤러가 부여한 _colorGroup 이 있으면 그것을 우선 사용 (가장 정확).
     없으면 fallback: name + 첫 카테고리. */
  function groupKeyOf(p) {
    if (p._colorGroup) return `cg:${p._colorGroup}`;
    const cat0 = (p.categories || [])[0] || '';
    return `${p.name}|${cat0}`;
  }
  function buildColorGroups(rawProducts) {
    const groups = new Map();
    // 1) 그룹 만들고 siblings 누적
    for (const p of rawProducts) {
      const key = groupKeyOf(p);
      if (!groups.has(key)) groups.set(key, {
        siblings: [], colors: [],
        _seenModels: new Set(), _officialColors: [],
      });
      const g = groups.get(key);
      const modelFirst = (p.model || '').split('\n')[0].trim();
      // 같은 모델은 한 번만 (다른 약정 옵션 = 같은 색상)
      if (g._seenModels.has(modelFirst)) {
        // 같은 모델이라도 다른 약정 옵션 카드에 본사 colors가 더 풍부할 수 있음 → 합치기
        for (const c of (p.colors || [])) {
          if (!g._officialColors.some(x => x.style === c.style)) g._officialColors.push(c);
        }
        continue;
      }
      g._seenModels.add(modelFirst);
      const colorHint = inferColorFromModel(modelFirst);
      // 본사 라디오에서 직접 수집한 정확한 색깔(_colorStyle)이 있으면 우선 사용.
      // url(...) 패턴(PSG 네이비 이미지 등)은 background shorthand 가 background-position/size 를
      // reset하므로 inline 스타일에 직접 같이 명시 — 본사 본문 처리와 동일.
      let color;
      // 색명 결정 우선순위:
      //   1) p._colorName (본사 pageTitle 에서 추출한 정식 명칭) — 가장 정확
      //   2) _colorStyle 의 hex → COLOR_PALETTE 거리 매칭 (정식 명칭)
      //   3) 모델 코드 끝 글자 → COLOR_CODE_HINT 명칭
      if (p._colorStyle) {
        const isUrl = /^url\(/.test(p._colorStyle);
        const extra = isUrl ? ';background-position:center;background-size:contain;background-repeat:no-repeat' : '';
        const nameFromHex = isUrl ? null : colorNameFromStyle(p._colorStyle);
        color = {
          name: p._colorName || nameFromHex || colorHint.name,
          style: `background:${p._colorStyle};border:1px solid rgba(0,0,0,0.08)${extra}`,
        };
      } else {
        color = p._colorName ? { name: p._colorName, style: colorHint.style } : colorHint;
      }
      g.siblings.push({
        goodsId: p.goodsId,
        model: modelFirst,
        color,
        isWhite: isWhiteModel(modelFirst),
      });
      for (const c of (p.colors || [])) {
        if (!g._officialColors.some(x => x.style === c.style)) g._officialColors.push(c);
      }
    }
    // 2) siblings 정렬(화이트 우선) + colors 결정
    // 카드 dot과 상세 chip 모두 sibling.color 기반으로 통일 — _colorStyle(본사 라디오 정확)을 우선 사용한 결과.
    for (const g of groups.values()) {
      g.siblings.sort((a, b) => (b.isWhite ? 1 : 0) - (a.isWhite ? 1 : 0));
      g.colors = g.siblings.map(s => ({ color: s.model, style: s.color.style }));
      delete g._seenModels;
      delete g._officialColors;
    }
    return groups;
  }
  /* 카테고리별 count를 dedup 결과 기준으로 재계산 */
  function recomputeCategoryCounts(rawData) {
    const counts = {};
    rawData.products.forEach(p => {
      (p.categories || []).forEach(c => { counts[c] = (counts[c] || 0) + 1; });
    });
    rawData.categories = (rawData.categories || []).map(c => ({
      ...c,
      count: counts[c.dispClsfNo] || 0,
    }));
    rawData.total = rawData.products.length;
    return rawData;
  }

  /* ===== 멀티테넌트 매장별 admin_overrides 로드 (본부 상속) =====
     슬러그 → store → admin_overrides 행들을 goodsId 맵으로 캐시.
     상속: 본부(_super) 값을 base 로 깔고, 매장 자체 행이 있으면 그 상품만 덮어씀.
       - 매장이 안 건드린 상품 → 본부값 그대로 노출 (자동 상속)
       - 매장이 건드린 상품(행 존재) → 매장값 우선 (이후엔 매장이 알아서)
     슬러그/Supabase 없으면 빈 맵 (= 본사 원본 그대로 노출). */
  const SUPER_SLUG = '_super';
  let _overrides = null;
  async function loadOverrides() {
    if (_overrides) return _overrides;
    _overrides = new Map();
    try {
      if (!window.sb || typeof window.skmGetSlug !== 'function') return _overrides;
      const slug = window.skmGetSlug();
      if (!slug) return _overrides;
      const store = await window.skmFetchStore(slug);
      if (!store) return _overrides;

      // 1) 본부(_super) 값을 base 레이어로 (매장 자신이 본부가 아니면)
      if (slug !== SUPER_SLUG) {
        try {
          const superStore = await window.skmFetchStore(SUPER_SLUG);
          if (superStore && superStore.id !== store.id) {
            const baseRows = await window.skmFetchOverrides(superStore.id);
            for (const r of baseRows) _overrides.set(r.goods_id, r);
          }
        } catch (e) { console.warn('[loadOverrides] 본부 base 로드 실패', e); }
      }

      // 2) 매장 자체 행으로 덮어쓰기 (행 단위)
      const rows = await window.skmFetchOverrides(store.id);
      for (const r of rows) _overrides.set(r.goods_id, r);
    } catch (e) {
      console.warn('[loadOverrides]', e);
    }
    return _overrides;
  }

  /* admin_overrides 를 deduped 상품 목록에 반영 (mutate).
     - hidden:   목록에서 제거
     - featured: p._featured = true (이달의 추천 섹션 우선)
     - order_index: p._order 로 보관 후 카테고리별 정렬에 사용
     - name/benefits/tag: 본사 원본 위에 덮어쓰기
     - prices: 정상가(del)·할인가(num) 재구성 + 타사보상가/제휴카드는 p._priceExtra */
  function applyOverrides(dbObj, ovs) {
    const stripUnit = (s) => String(s || '').replace(/^[^\d]*월?\s*/, '').replace(/\s*원\s*$/, '').trim();
    const kept = [];
    for (const p of dbObj.products) {
      const r = ovs.get(p.goodsId);
      if (r) {
        if (r.hidden) continue;
        if (r.name_override) p.name = r.name_override;
        if (Array.isArray(r.benefits_override) && r.benefits_override.length) p.benefits = r.benefits_override;
        if (r.tag_override != null && r.tag_override !== '') p.tag = r.tag_override;
        p._featured = !!r.featured;
        p._order = (r.order_index != null) ? r.order_index : null;
        if (r.price_regular || r.price_sale || r.price_compete || r.price_card) {
          const orig = (p.prices && p.prices[0]) || {};
          const regular = r.price_regular || stripUnit(orig.del);
          const sale = r.price_sale || stripUnit(orig.num);
          p.prices = [{
            title: orig.title || '구독',
            del: regular ? `월 ${regular}` : '',
            num: sale,
          }];
          const extra = {};
          if (r.price_compete) extra.compete = r.price_compete;
          if (r.price_card) extra.card = r.price_card;
          if (Object.keys(extra).length) p._priceExtra = extra;
        }
      }
      kept.push(p);
    }
    // order_index 우선 정렬 (지정 안 된 건 원래 순서 유지 — stable sort).
    // 카테고리별로 분배된 인덱스지만, 표시 시 항상 카테고리로 먼저 필터링되므로
    // 전역 stable sort 로도 각 카테고리 내 순서가 올바르게 유지됨.
    kept.sort((a, b) => {
      const ao = a._order == null ? Infinity : a._order;
      const bo = b._order == null ? Infinity : b._order;
      return ao - bo;
    });
    dbObj.products = kept;
  }

  async function db() {
    if (_db) return _db;
    let raw = null;
    // 1) file:// 호환 — db.js가 미리 로드됐으면 그걸 사용
    if (window.PRODUCTS_DB) {
      raw = window.PRODUCTS_DB;
    } else {
      // 2) http://에서는 fetch fallback
      try {
        const res = await fetch('../data/products.json');
        raw = await res.json();
      } catch (e) {
        console.error('[db] 데이터 로드 실패. file:// 로 열었다면 build_inline_db.py 를 먼저 돌려서 db.js 를 생성해줘.', e);
        _db = { products: [], categories: [], total: 0 };
        return _db;
      }
    }
    // 1) 색상 그룹 빌드 (raw 기준 — 모든 색상 변형 보존)
    const colorGroups = buildColorGroups(raw.products || []);

    // 2) name+카테고리 그룹 1개당 대표 모델 1개만 남기는 dedup.
    //    그룹 대표 = 본사 패턴 따라 화이트 색상 우선 (siblings[0]).
    //    같은 모델군의 색상 변형은 카드 1개로 통합 → 색상 dot로 표시.
    const seenGroups = new Set();
    const groupDeduped = [];
    // raw 순서대로 순회하되, 각 그룹의 대표는 colorGroups의 siblings[0] (화이트 우선)
    for (const p of (raw.products || [])) {
      const key = groupKeyOf(p);
      if (seenGroups.has(key)) continue;
      const g = colorGroups.get(key);
      // 그룹의 대표 goodsId — 화이트 색상 우선
      const repId = g && g.siblings.length ? g.siblings[0].goodsId : p.goodsId;
      const repProduct = (raw.products || []).find(x => x.goodsId === repId) || p;
      seenGroups.add(key);
      const enriched = { ...repProduct };
      if (g) {
        enriched.colors = g.colors;
        enriched._siblings = g.siblings;
        enriched._groupKey = key;
      }
      groupDeduped.push(enriched);
    }

    const cleaned = {
      ...raw,
      products: groupDeduped,
      categories: [...(raw.categories || [])],
      _colorGroups: colorGroups,
      _raw_products: raw.products,  // 상세 페이지가 dedup으로 사라진 goodsId 직접 진입할 때 fallback
    };
    // 매장별 admin_overrides 반영 (노출/추천/순서/이름/가격 등)
    const ovs = await loadOverrides();
    if (ovs && ovs.size) applyOverrides(cleaned, ovs);
    _db = recomputeCategoryCounts(cleaned);
    return _db;
  }

  function pricesOf(p) {
    if (!p.prices || !p.prices.length) return null;
    return p.prices[0];
  }

  function thumbOf(p) {
    /* download_thumbs.py 로 떨궈둔 ../products/<gid>/thumb.<ext> 우선 사용 */
    if (!p.thumb) return '';
    const ext = p.thumb_ext || '.png';
    return `../products/${p.goodsId}/thumb${ext}`;
  }
  function thumbFallback(p) {
    return p.thumb || '';
  }

  function productCard(p) {
    const pr = pricesOf(p);
    const benefits = (p.benefits || []).slice(0, 3).map(b => `<span class="bft">${escape(b)}</span>`).join('');
    const colorsHTML = (p.colors || []).slice(0, 5).map(c => `<span class="dot" style="${escape(c.style || '')}"></span>`).join('');
    const tag = p._featured ? '<span class="badge b-best">추천</span>' : '';
    // 본사 model 필드는 "코드\n별점N (수)" 형식 — 모델코드만 추출
    const modelCode = (p.model || '').split('\n')[0].trim();
    // 매트리스(1000000245) 카테고리면 워커힐 브랜드 배지 표시
    const isMattress = (p.categories || []).includes('1000000245');
    const brandBadge = isMattress ? '<span class="brand-badge" style="background-image:url(./assets/brand/walkerhill.png)" aria-label="워커힐"></span>' : '';
    return `
      <a class="product-card${isMattress ? ' has-brand' : ''}" href="./detail.html?id=${encodeURIComponent(p.goodsId)}">
        ${brandBadge}
        <div class="thumb">
          <div class="badges">${tag}</div>
          <img loading="lazy" decoding="async" src="${escape(thumbOf(p))}" alt="${escape(p.name || '')}" data-fb="${escape(thumbFallback(p))}" onerror="if(this.dataset.fb&&this.src!==this.dataset.fb){this.src=this.dataset.fb}else{this.style.opacity=.3}">
        </div>
        <div class="body">
          <div class="model">
            <span>${escape(modelCode)}</span>
            ${colorsHTML ? `<div class="colors">${colorsHTML}</div>` : ''}
          </div>
          <div class="name">${escape(p.name || '')}</div>
          <div class="benefits">${benefits}</div>
          ${pr ? `
            <div class="price-row">
              ${pr.del ? `<div class="del">${escape(pr.del)}</div>` : ''}
              <div class="now"><small>${escape(pr.title || '구독')}</small> 월 <strong>${escape(pr.num || '-')}</strong>원</div>
            </div>` : ''}
        </div>
      </a>
    `;
  }

  function escape(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function categoryName(dispClsfNo) {
    return (CATEGORY_META[dispClsfNo] || { label: '기타' }).label;
  }
  function categoryIcon(dispClsfNo) {
    const key = (CATEGORY_META[dispClsfNo] || { icon: 'box' }).icon;
    return (window.ICONS && ICONS[key]) ? ICONS[key]() : ICONS.box();
  }
  function categoryColorClass(dispClsfNo) {
    const key = (CATEGORY_META[dispClsfNo] || { icon: 'box' }).icon;
    return 'cat-color-' + key;
  }

  /* ================== Home ================== */
  async function renderHome() {
    const data = await db();
    const visibleCats = orderedVisibleCats(data.categories);

    // hero visual — WPUJAC115SNW 모델 (G000069309): _12 + _11
    const hv = document.getElementById('hero-visual-img');
    if (hv) {
      const heroId = 'G000069309';
      const imgBase = `../products/${heroId}/images`;
      hv.innerHTML = `
        <img class="hv-img-front" src="${imgBase}/main_${heroId}_12_480x480.png" alt="WPUJAC115SNW">
        <img class="hv-img-side"  src="${imgBase}/main_${heroId}_11_480x480.png" alt="WPUJAC115SNW">
      `;
    }

    // category grid — VISIBLE_CATEGORIES 순서대로 4개만
    const grid = document.getElementById('cat-grid');
    if (grid) {
      grid.innerHTML = visibleCats.map(c => `
        <a class="cat-card" href="./index.html?cls=${c.dispClsfNo}">
          <div class="ic ${categoryColorClass(c.dispClsfNo)}">${categoryIcon(c.dispClsfNo)}</div>
          <div class="cat-text">
            <div class="nm">${escape(CATEGORY_META[c.dispClsfNo]?.label || c.name || '기타')}</div>
            <div class="cnt">${c.count}개 상품</div>
          </div>
        </a>
      `).join('');
    }

    // best section title — 현재 월 자동 반영
    const monthEl = document.getElementById('best-month');
    if (monthEl) monthEl.textContent = new Date().getMonth() + 1;

    // best products — 매장이 '추천' 지정한 상품만, 카테고리 순서(정수기→공기청정기→비데→매트리스)로.
    // 추천이 하나도 없으면 카테고리별 1개씩(다양성)으로 채움.
    const best = document.getElementById('best-grid');
    if (best) {
      // 상품의 카테고리 중 VISIBLE_CATEGORIES 에서 가장 앞선 순위 (정렬 키)
      const catRank = (p) => {
        let r = Infinity;
        for (const c of (p.categories || [])) {
          const i = VISIBLE_CATEGORIES.indexOf(c);
          if (i !== -1 && i < r) r = i;
        }
        return r;
      };
      const featured = data.products.filter(p => p._featured && (p.categories || []).some(isVisibleCat));
      let picks;
      if (featured.length) {
        // 추천 켠 상품만 — 카테고리 순서, 같은 카테고리 내에선 정렬값(_order) 순
        picks = featured.slice().sort((a, b) =>
          (catRank(a) - catRank(b)) ||
          ((a._order == null ? Infinity : a._order) - (b._order == null ? Infinity : b._order))
        );
      } else {
        // 추천 없음 → 카테고리별 1개씩 다양성 미리보기
        picks = [];
        const seen = new Set();
        for (const c of visibleCats) {
          if (picks.length >= HOME_PREVIEW_LIMIT) break;
          const pick = data.products.find(p => (p.categories || []).includes(c.dispClsfNo) && !seen.has(p.goodsId));
          if (pick) { picks.push(pick); seen.add(pick.goodsId); }
        }
      }
      best.innerHTML = picks.map(productCard).join('');
    }

    // 카테고리별 섹션 — VISIBLE만, 각 4개씩 미리보기 + 전체보기 링크
    const sections = document.getElementById('cat-sections');
    if (sections) {
      sections.innerHTML = visibleCats.map(c => {
        const all = data.products.filter(p => (p.categories || []).includes(c.dispClsfNo));
        if (!all.length) return '';
        const preview = all.slice(0, HOME_PREVIEW_LIMIT);
        const label = CATEGORY_META[c.dispClsfNo]?.label || c.name;
        return `
          <section class="cat-section">
            <div class="section-head">
              <div style="display:flex;align-items:center;gap:14px">
                <div class="sec-ic ${categoryColorClass(c.dispClsfNo)}">${categoryIcon(c.dispClsfNo)}</div>
                <div>
                  <h2>${escape(label)}</h2>
                  <p class="sub">${all.length}개 상품 · 월 구독료 기준</p>
                </div>
              </div>
              <a class="more" href="./index.html?cls=${c.dispClsfNo}">전체보기 ${ICONS.arrow()}</a>
            </div>
            <div class="product-grid">
              ${preview.map(productCard).join('')}
            </div>
          </section>
        `;
      }).join('');
    }
  }

  /* ================== Category ================== */
  async function renderCategory() {
    const params = new URLSearchParams(location.search);
    const cls = params.get('cls');
    const data = await db();
    const title = document.getElementById('cat-title');
    const meta = CATEGORY_META[cls];
    const headIcon = document.getElementById('cat-icon');
    if (headIcon && meta) {
      headIcon.innerHTML = categoryIcon(cls);
      headIcon.className = 'cat-page-icon ' + categoryColorClass(cls);
    } else if (headIcon) {
      // '전체' 또는 unknown cls — 박스 아이콘으로 리셋 (이전 아이콘 잔재 방지)
      headIcon.innerHTML = ICONS.box ? ICONS.box() : '';
      headIcon.className = 'cat-page-icon cat-color-box';
    }
    if (title) title.textContent = meta ? meta.label : '전체 상품';

    // filter chips — VISIBLE 카테고리만 + '전체'
    // '전체'는 cls 없이도 category view에 머물러야 함 → ?view=category 명시
    const bar = document.getElementById('filter-bar');
    if (bar) {
      const visible = orderedVisibleCats(data.categories);
      const chips = [`<a class="chip ${!cls ? 'on':''}" href="./index.html?view=category">전체</a>`]
        .concat(visible.map(c => `
          <a class="chip ${cls === c.dispClsfNo ? 'on' : ''}" href="./index.html?cls=${c.dispClsfNo}">
            ${escape(CATEGORY_META[c.dispClsfNo]?.label || c.name)}
          </a>`));
      bar.innerHTML = chips.join('');
    }

    // products — cls 지정시 해당 카테고리, '전체'면 VISIBLE 4종 합집합만
    const list = cls
      ? data.products.filter(p => (p.categories || []).includes(cls))
      : data.products.filter(p => (p.categories || []).some(isVisibleCat));
    const cnt = document.getElementById('cat-count');
    if (cnt) cnt.textContent = list.length + '개';

    const grid = document.getElementById('cat-products');
    if (grid) {
      if (!list.length) {
        grid.innerHTML = `<div class="empty">해당 카테고리에 상품이 없습니다.</div>`;
      } else {
        grid.innerHTML = list.map(productCard).join('');
      }
    }
  }

  /* ================== Option UI (약정/관리유형) ================== */
  // 페이지 내 상태 — 현재 선택된 care_type idx, contract idx. detail 페이지마다 reset.
  const _optState = { careIdx: 0, contractIdx: 0, sizeKey: null, lastOpts: null, lastP: null, lastMeta: null };

  function renderOptionsUI(opts, p, meta) {
    _optState.lastOpts = opts;
    _optState.lastP = p || null;
    _optState.lastMeta = meta || null;
    _optState.careIdx = 0;
    _optState.contractIdx = 0;
    // 매트리스 사이즈 — specs_by_size 키 첫 번째를 기본값
    const sbs = meta?.specs_by_size;
    const sizeKeys = sbs ? Object.keys(sbs).filter(k => k !== '_single') : [];
    _optState.sizeKey = sizeKeys.length > 1 ? sizeKeys[0] : null;
    renderOptionTabs();
    renderOptionInfo();
    renderSpecTableForCurrentSize();
    attachOptionHandlers();
  }

  function renderSpecTableForCurrentSize() {
    // 옵션 영역의 사이즈 변경 시 제품사양 테이블도 같이 갱신
    const meta = _optState.lastMeta;
    const sbs = meta?.specs_by_size;
    const sz = _optState.sizeKey;
    if (!sbs || !sz) return;
    const specWrap = document.getElementById('p-spec-wrap');
    const tableWrap = specWrap?.querySelector('.spec-table-wrap');
    if (!tableWrap) return;
    const arr = sbs[sz] || [];
    let rows = '';
    for (let i = 0; i < arr.length; i += 2) {
      const a = arr[i], b = arr[i + 1];
      rows += '<tr>';
      rows += `<th>${escape(a.label)}</th><td>${escape(a.value)}</td>`;
      if (b) rows += `<th>${escape(b.label)}</th><td>${escape(b.value)}</td>`;
      else   rows += `<th></th><td></td>`;
      rows += '</tr>';
    }
    tableWrap.innerHTML = `<table class="spec-table">${rows}</table>`;
    // 제품사양 탭의 active 동기화
    specWrap.querySelectorAll('.size-tab').forEach(b => {
      b.classList.toggle('on', b.dataset.size === sz);
    });
  }

  function renderOptionTabs() {
    const opts = _optState.lastOpts;
    if (!opts) return;
    // 사이즈 탭 — meta.specs_by_size 가 있을 때만 (매트리스 전용)
    const sizeRow = document.getElementById('p-size-row');
    const sizeTabs = document.getElementById('p-size-tabs');
    const meta = _optState.lastMeta;
    const sbs = meta?.specs_by_size;
    const sizeKeys = sbs ? Object.keys(sbs).filter(k => k !== '_single') : [];
    if (sizeKeys.length > 1 && sizeRow && sizeTabs) {
      sizeRow.hidden = false;
      sizeTabs.innerHTML = sizeKeys.map(k =>
        `<button type="button" class="op-tab ${k === _optState.sizeKey ? 'on' : ''}" data-size="${escape(k)}">${escape(k)}</button>`
      ).join('');
    } else if (sizeRow) {
      sizeRow.hidden = true;
    }
    // 관리유형 탭 — 1개라도 버튼 표시 (현재 선택값을 시각적으로 보여주기 위해)
    const careRow = document.getElementById('p-care-row');
    const careTabs = document.getElementById('p-care-tabs');
    if (opts.care_types.length > 0 && careRow && careTabs) {
      careRow.hidden = false;
      // 본인의 contract_type (셀프형/방문형) 추출
      const TYPE_TO_NAME = { '셀프형': '셀프관리', '방문형': '방문관리' };
      const myType = (opts.care_types[0]?.contracts?.[0]?.contract_type || '').trim();
      let careNames;
      if (opts.care_types.length >= 2) {
        careNames = opts.care_types.map((ct, i) => ct.name || ('타입 ' + (i+1)));
      } else {
        // care_types 1개 — 매트리스 카테고리에 한해서만 페어 여부 정밀 판단
        // (정수기 등 다른 카테고리는 기존대로 [셀프/방문] 강제 노출 유지)
        const p = _optState.lastP;
        const isMattress = ((p && p.categories) || []).includes('1000000245');
        if (!isMattress) {
          careNames = ['셀프관리', '방문관리'];
        } else {
          // 매트리스: PRODUCTS_DB.products에서 같은 model 가진 G코드 찾고,
          // 각 G코드의 PRODUCTS_META[gid].options에서 contract_type 모으기
          const myModel = ((p && p.model) || '').split('\n')[0].trim();
          const allTypes = new Set();
          if (myType) allTypes.add(myType);
          const allProds = window.PRODUCTS_DB?.products || [];
          if (myModel && window.PRODUCTS_META) {
            for (const sib of allProds) {
              const sibModel = ((sib && sib.model) || '').split('\n')[0].trim();
              if (sibModel !== myModel) continue;
              const sibMeta = window.PRODUCTS_META[sib.goodsId];
              const sibType = sibMeta?.options?.care_types?.[0]?.contracts?.[0]?.contract_type;
              if (sibType) allTypes.add(sibType.trim());
            }
          }
          if (allTypes.size >= 2) {
            // 페어 (워커힐 클라우드/스위트) — 셀프/방문 둘 다
            careNames = ['셀프관리', '방문관리'];
          } else {
            // 단독 (워커힐 스탠다드) — 본인 타입만
            careNames = [TYPE_TO_NAME[myType] || (opts.care_types[0].name || '관리')];
          }
        }
      }
      careTabs.innerHTML = careNames.map((nm, i) =>
        `<button type="button" class="op-tab ${i === _optState.careIdx ? 'on' : ''}" data-care="${i}">${escape(nm)}</button>`
      ).join('');
    } else if (careRow) {
      careRow.hidden = true;
    }
    // 약정기간 탭 — care_types에 idx가 없으면 첫번째 데이터 fallback (셀프/방문 강제 노출 케이스)
    const contractRow = document.getElementById('p-contract-row');
    const contractTabs = document.getElementById('p-contract-tabs');
    const cur = opts.care_types[_optState.careIdx] || opts.care_types[0];
    const contracts = (cur && cur.contracts) || [];
    if (contracts.length > 0 && contractRow && contractTabs) {
      contractRow.hidden = false;
      // 선택된 idx가 contracts 범위 밖이면 0으로 reset
      if (_optState.contractIdx >= contracts.length) _optState.contractIdx = 0;
      contractTabs.innerHTML = contracts.map((c, i) => {
        const lbl = c.label || (c.years ? `${c.years}년` : '약정');
        return `<button type="button" class="op-tab ${i === _optState.contractIdx ? 'on' : ''}" data-contract="${i}">${escape(lbl)}</button>`;
      }).join('');
    } else if (contractRow) {
      contractRow.hidden = true;
    }
  }

  function renderOptionInfo() {
    const opts = _optState.lastOpts;
    const infoEl = document.getElementById('p-option-info');
    if (!opts || !infoEl) return;
    const cur = opts.care_types[_optState.careIdx] || opts.care_types[0];
    const c = cur && cur.contracts && cur.contracts[_optState.contractIdx];
    if (!c) { infoEl.innerHTML = ''; return; }
    const rows = [];
    if (c.duty_use_months) rows.push(['의무 사용', `${c.duty_use_months}개월`]);
    if (c.own_get_months)  rows.push(['소유권 이전', `${c.own_get_months}개월`]);
    if (c.visit_period)    rows.push(['방문 주기', c.visit_period]);
    if (c.filter_period)   rows.push(['필터 주기', c.filter_period]);
    // '약정 타입'은 관리 유형 버튼이 시각적으로 보여주므로 정보 박스에서 제외 (중복 방지)
    infoEl.innerHTML = rows.map(([k, v]) =>
      `<span class="k">${escape(k)}</span><span class="v">${escape(v)}</span>`
    ).join('');
  }

  function attachOptionHandlers() {
    const block = document.getElementById('p-options');
    if (!block || block.dataset.handlerAttached) return;
    block.dataset.handlerAttached = '1';
    block.addEventListener('click', (e) => {
      const tab = e.target.closest('.op-tab');
      if (!tab) return;
      if (tab.dataset.care !== undefined) {
        const idx = parseInt(tab.dataset.care, 10);
        if (idx === _optState.careIdx) return;
        _optState.careIdx = idx;
        _optState.contractIdx = 0;  // 관리유형 바뀌면 약정 reset
        renderOptionTabs();
        renderOptionInfo();
      } else if (tab.dataset.contract !== undefined) {
        const idx = parseInt(tab.dataset.contract, 10);
        if (idx === _optState.contractIdx) return;
        _optState.contractIdx = idx;
        renderOptionTabs();
        renderOptionInfo();
      } else if (tab.dataset.size !== undefined) {
        const sz = tab.dataset.size;
        if (sz === _optState.sizeKey) return;
        _optState.sizeKey = sz;
        renderOptionTabs();
        renderSpecTableForCurrentSize();
      }
    });
  }

  /* ================== Detail ================== */
  async function renderDetail() {
    const params = new URLSearchParams(location.search);
    const id = params.get('id');
    const data = await db();
    // dedup으로 카드에서 사라진 goodsId도 직접 URL 진입 가능해야 함 → _raw_products fallback
    const p = data.products.find(x => x.goodsId === id)
           || (data._raw_products || []).find(x => x.goodsId === id);
    if (!p) {
      document.getElementById('detail-main').innerHTML =
        `<div class="empty">상품을 찾을 수 없습니다.<br><br><a class="btn btn-ghost" href="./index.html">홈으로</a></div>`;
      return;
    }
    // 그룹 정보 (색상 선택 UI용)
    const groupKey = groupKeyOf(p);
    const group = data._colorGroups && data._colorGroups.get(groupKey);

    // meta — file:// 호환: 인라인 PRODUCTS_META 우선, 실패 시 fetch
    let meta = null;
    if (window.PRODUCTS_META && window.PRODUCTS_META[id]) {
      meta = window.PRODUCTS_META[id];
    } else {
      try {
        const r = await fetch(`../products/${encodeURIComponent(id)}/meta.json`);
        if (r.ok) meta = await r.json();
      } catch {}
    }

    // breadcrumb
    const cls = (p.categories || [])[0];
    document.getElementById('crumb').innerHTML = `
      <a href="./index.html">홈</a> &nbsp;›&nbsp;
      <a href="./category.html?cls=${cls}">${escape(categoryName(cls))}</a> &nbsp;›&nbsp;
      <span>${escape(p.name)}</span>`;

    // gallery
    let mainImgs = (meta && meta.main_images) ? meta.main_images : [p.thumb];
    // 자체 호스팅 경로로 교체
    const localMainImgs = mainImgs.map(u => {
      const fn = u.split('/').pop();
      return `../products/${id}/images/main_${fn}`;
    });

    const galleryMain = document.getElementById('gallery-main');
    const galleryThumbs = document.getElementById('gallery-thumbs');
    // 워커힐 브랜드 배지 — 매트리스 카테고리만
    const galleryEl = document.querySelector('.gallery');
    if (galleryEl) {
      const old = galleryEl.querySelector(':scope > .brand-badge');
      if (old) old.remove();
      const isMattress = (p.categories || []).includes('1000000245');
      if (isMattress) {
        const badge = document.createElement('span');
        badge.className = 'brand-badge';
        badge.style.backgroundImage = "url('./assets/brand/walkerhill.png')";
        badge.setAttribute('aria-label', '워커힐');
        galleryEl.prepend(badge);
      }
    }
    if (galleryMain) galleryMain.innerHTML = `<img src="${escape(localMainImgs[0])}" alt="${escape(p.name)}" onerror="this.src='${escape(mainImgs[0]||'')}'">`;
    if (galleryThumbs) {
      galleryThumbs.innerHTML = localMainImgs.map((u, i) => `
        <div class="t ${i===0?'on':''}" data-idx="${i}" data-src="${escape(u)}" data-fallback="${escape(mainImgs[i]||'')}">
          <img src="${escape(u)}" onerror="this.src='${escape(mainImgs[i]||'')}'">
        </div>`).join('');
      galleryThumbs.querySelectorAll('.t').forEach(el => {
        el.addEventListener('click', () => {
          galleryThumbs.querySelectorAll('.t').forEach(x => x.classList.remove('on'));
          el.classList.add('on');
          const src = el.dataset.src;
          const fb = el.dataset.fallback;
          galleryMain.innerHTML = `<img src="${escape(src)}" onerror="this.src='${escape(fb)}'">`;
        });
      });
    }

    // info
    // 본사 model 필드는 "WPUIAC506SNW\n별점5.0 (24)" 형식이라 첫 줄(모델코드)만 사용
    const modelCode = (p.model || '').split('\n')[0].trim();
    document.getElementById('p-model').textContent = modelCode;
    document.getElementById('p-name').textContent = p.name || '';
    // 상품명 우측 색상명 — p._colorName 우선, 없으면 모델 코드 hint fallback
    // 비데(100000024)는 다 흰색 단품이라 색상명 생략.
    const colorNameEl = document.getElementById('p-color-name');
    if (colorNameEl) {
      const skipCats = new Set(['100000024']); // 비데
      const skip = (p.categories || []).some(c => skipCats.has(c));
      const cname = skip ? '' : (p._colorName || (inferColorFromModel(modelCode) || {}).name || '');
      // hint fallback이 모델 코드 자체(매칭 실패시 끝 3글자 반환)면 안 보여줌
      const isCodeFallback = cname && /^[A-Z]{2,4}$/.test(cname);
      if (cname && !isCodeFallback) {
        colorNameEl.textContent = cname;
        colorNameEl.hidden = false;
      } else {
        colorNameEl.textContent = '';
        colorNameEl.hidden = true;
      }
    }
    const tagsEl = document.getElementById('p-tags');
    // benefits — sibling 간 데이터 불균형 보정. 빈 경우 같은 색상 그룹(_colorGroup) 또는
    // 같은 (name+카테고리) 의 다른 sibling에서 보충. PSG 같은 마케팅 prefix가 다른 name 케이스
    // 위해 _colorGroup 우선 매칭.
    let benefits = p.benefits || [];
    if (!benefits.length && data._raw_products) {
      const cat0 = (p.categories || [])[0] || '';
      const myCg = p._colorGroup;
      for (const x of data._raw_products) {
        const same = (myCg && x._colorGroup === myCg) ||
                     (x.name === p.name && ((x.categories || [])[0] || '') === cat0);
        if (same && x.benefits && x.benefits.length) {
          benefits = x.benefits;
          break;
        }
      }
    }
    if (tagsEl) tagsEl.innerHTML = benefits.map(b => `<span>${escape(b)}</span>`).join('');

    // 색상 박스 — 색상 변형이 2개 이상이면 "색상 선택"(전부 표시),
    // 1개뿐이면 "색상"(현재 색상만 표시, 클릭 비활성)
    const picker = document.getElementById('p-color-picker');
    const myModel = (p.model || '').split('\n')[0].trim();
    const siblings = (group && group.siblings) ? group.siblings : [];
    const multi = siblings.length > 1;
    // 1개일 때: 본인 색상만 보여줘야 함. siblings가 비어있으면 현재 상품 정보로 fallback.
    const showList = multi ? siblings : (siblings.length === 1 ? siblings : [{
      goodsId: p.goodsId,
      model: myModel,
      color: {
        name: inferColorFromModel(myModel).name,
        style: (p.colors && p.colors[0] && p.colors[0].style) || inferColorFromModel(myModel).style,
      },
    }]);
    if (picker) {
      picker.hidden = false;
      picker.innerHTML = `
        <span class="cp-label">${multi ? '색상 선택' : '색상'}</span>
        <div class="cp-chips">
          ${showList.map(s => {
            const sModelCode = (s.model || '').split('\n')[0].trim();
            const isOn = s.model === myModel;
            return `
            <a class="cp-chip ${isOn ? 'on' : ''}"
               href="./detail.html?id=${encodeURIComponent(s.goodsId)}"
               title="${escape(s.color.name)} · ${escape(sModelCode)}">
              <span class="cp-dot" style="${escape(s.color.style)}"></span>
            </a>
          `;}).join('')}
        </div>
      `;
      // 색상 chip 클릭 — 페이지 리로드 없이 SPA-방식으로 swap.
      // 페이지 전체 새로 받으면 깜빡임 + 버튼 위치 점프 발생 → URL만 갱신 + 다시 렌더.
      if (!picker.dataset.spaAttached) {
        picker.dataset.spaAttached = '1';
        picker.addEventListener('click', (e) => {
          const chip = e.target.closest('.cp-chip');
          if (!chip) return;
          e.preventDefault();
          if (chip.classList.contains('on')) return;
          const href = navTarget(chip.getAttribute('href')) || chip.getAttribute('href');
          history.pushState({}, '', href);
          // View Transitions API로 cross-fade — 깜빡임 없이 부드럽게
          if (document.startViewTransition) {
            document.startViewTransition(() => renderDetail());
          } else {
            renderDetail();
          }
        });
      }
    } else if (picker) {
      picker.hidden = true;
      picker.innerHTML = '';
    }

    // === 약정/관리유형 옵션 ===
    // meta.options: { care_types: [{ id, name, contracts: [{label, years, duty_use_months, filter_period, visit_period, ...}] }] }
    // care_types > 1 이면 관리유형 탭. contracts > 0 이면 약정기간 탭. 선택값 변경 시 옵션 정보 동적 갱신.
    const optBlock = document.getElementById('p-options');
    const opts = meta && meta.options;
    if (optBlock) {
      if (opts && Array.isArray(opts.care_types) && opts.care_types.length > 0
          && opts.care_types.some(ct => (ct.contracts || []).length > 0)) {
        optBlock.hidden = false;
        renderOptionsUI(opts, p, meta);
      } else {
        optBlock.hidden = true;
      }
    }

    // price card
    const priceEl = document.getElementById('p-price');
    if (priceEl) {
      const rows = (p.prices || []).map(pr => `
        <div class="row">
          <span class="label">${escape(pr.title || '월 렌탈료')}</span>
          <span class="val">
            ${pr.del ? `<span class="del">${escape(pr.del)}</span>` : ''}
            <small>월</small>${escape(pr.num || '-')}<small>원</small>
          </span>
        </div>
      `).join('');
      // 매장 지정 추가 가격 — 타사 보상가 / 제휴카드 할인 시
      const ex = p._priceExtra || {};
      const extraRows = [
        ex.compete ? ['타사 보상가', ex.compete] : null,
        ex.card ? ['제휴카드 할인 시', ex.card] : null,
      ].filter(Boolean).map(([k, v]) => `
        <div class="row">
          <span class="label">${escape(k)}</span>
          <span class="val"><small>월</small>${escape(v)}<small>원</small></span>
        </div>
      `).join('');
      // 약정 옵션 행 — 색상 변형 간 카드 사이즈 통일을 위해 tag 비어있어도 기본 문구 표시
      const tagText = p.tag || '상담 시 약정 옵션·할인 안내';
      const tag = `<div class="row" style="border-top:1px solid var(--line);padding-top:14px"><span class="label" style="font-weight:600">약정 옵션</span><span style="font-size:13px;color:var(--ink-3);text-align:right;max-width:240px">${escape(tagText)}</span></div>`;
      priceEl.innerHTML = rows + extraRows + tag;
    }

    // 제품 사양 — specs_by_size(매트리스 사이즈별) 우선, 없으면 specs
    const specWrap = document.getElementById('p-spec-wrap');
    if (specWrap) {
      const sbs = meta && meta.specs_by_size && typeof meta.specs_by_size === 'object' ? meta.specs_by_size : null;
      const specs = (meta && Array.isArray(meta.specs)) ? meta.specs : [];

      function renderSpecTable(arr) {
        if (!arr || !arr.length) return '<div class="empty" style="padding:40px 0">제품 사양 정보 없음</div>';
        let rows = '';
        for (let i = 0; i < arr.length; i += 2) {
          const a = arr[i], b = arr[i + 1];
          rows += '<tr>';
          rows += `<th>${escape(a.label)}</th><td>${escape(a.value)}</td>`;
          if (b) rows += `<th>${escape(b.label)}</th><td>${escape(b.value)}</td>`;
          else   rows += `<th></th><td></td>`;
          rows += '</tr>';
        }
        return `<table class="spec-table">${rows}</table>`;
      }

      const sizeKeys = sbs ? Object.keys(sbs).filter(k => k !== '_single') : [];
      if (sizeKeys.length > 1) {
        // 사이즈별 spec — 탭 + 동적 테이블
        const tabsHtml = sizeKeys.map((sz, i) =>
          `<button type="button" class="size-tab${i === 0 ? ' on' : ''}" data-size="${escape(sz)}">${escape(sz)}</button>`
        ).join('');
        specWrap.innerHTML = `
          <div class="size-tabs">${tabsHtml}</div>
          <div class="spec-table-wrap">${renderSpecTable(sbs[sizeKeys[0]])}</div>
        `;
        const tableWrap = specWrap.querySelector('.spec-table-wrap');
        specWrap.querySelectorAll('.size-tab').forEach(btn => {
          btn.addEventListener('click', () => {
            const sz = btn.dataset.size;
            specWrap.querySelectorAll('.size-tab').forEach(b => b.classList.remove('on'));
            btn.classList.add('on');
            tableWrap.innerHTML = renderSpecTable(sbs[sz]);
          });
        });
      } else if (specs.length) {
        specWrap.innerHTML = renderSpecTable(specs);
      } else if (sizeKeys.length === 1) {
        specWrap.innerHTML = renderSpecTable(sbs[sizeKeys[0]]);
      } else {
        specWrap.innerHTML = '<div class="empty" style="padding:40px 0">제품 사양 정보가 준비되면 표시됩니다.</div>';
      }
    }

    // detail infographic — 공통 배너·썸네일·광고 자동 필터링
    const info = document.getElementById('p-info-imgs');
    if (info && meta && meta.detail_images && meta.detail_images.length) {
      // 원본 인덱스 보존(로컬 파일이 detail_00, detail_01... 인덱스로 저장돼있음)
      const filtered = meta.detail_images
        .map((u, i) => ({ u, i }))
        .filter(({ u }) => isInfographic(u, id));
      if (filtered.length) {
        info.innerHTML = filtered.map(({ u, i }) => {
          const fn = u.split('/').pop();
          const local = `../products/${id}/images/detail_${String(i).padStart(2,'0')}_${fn}`;
          return `<img loading="lazy" decoding="async" src="${escape(local)}" alt="" onerror="this.src='${escape(u)}'">`;
        }).join('');
      } else {
        info.innerHTML = '<div class="empty">상세 정보 이미지가 준비 중입니다.</div>';
      }
    } else if (info) {
      info.innerHTML = '<div class="empty">상세 정보 이미지가 준비 중입니다.</div>';
    }

    // 페이지 타이틀
    document.title = `${p.name} | SK매직 인증파트너점`;
  }

  /* ================== SPA Router ==================
     index.html 단일 페이지 안에 home/category/detail 3 view 섹션 토글.
     URL params로 view 결정:
       - ?id=X       → detail
       - ?cls=X      → category
       - 없음          → home
     모든 a[href] 클릭은 가로채서 history.pushState + route 호출 → 페이지 reload 없음. */

  function getViewFromUrl() {
    const params = new URLSearchParams(location.search);
    if (params.get('id')) return 'detail';
    if (params.get('cls') || params.get('view') === 'category') return 'category';
    return 'home';
  }

  const VIEW_TITLES = {
    home:     'SK매직 인증파트너점 | 정수기·공기청정기·비데·매트리스',
    category: '카테고리 | SK매직 인증파트너점',
    detail:   '상품 상세 | SK매직 인증파트너점',
  };

  function updateGnbActive() {
    const params = new URLSearchParams(location.search);
    const cls = params.get('cls');
    document.querySelectorAll('.gnb a').forEach(a => {
      const aCls = new URL(a.href, location.href).searchParams.get('cls');
      a.classList.toggle('active', !!cls && aCls === cls);
    });
  }

  async function route(opts) {
    const view = getViewFromUrl();
    // 모든 view 숨김 → 해당 view만 표시
    document.querySelectorAll('[data-view]').forEach(el => { el.hidden = (el.dataset.view !== view); });
    // title은 렌더 전에 미리 — detail은 renderDetail 안에서 상품명으로 다시 override됨
    if (view !== 'detail') document.title = VIEW_TITLES[view] || VIEW_TITLES.home;
    // 렌더
    if (view === 'home')          await renderHome();
    else if (view === 'category') await renderCategory();
    else if (view === 'detail')   await renderDetail();
    // 부수효과
    updateGnbActive();
    // 색상 chip 클릭 등 같은 상품군 내 이동은 스크롤 유지 (UX: 사용자가 보고있던 위치 보존)
    if (!opts || !opts.keepScroll) window.scrollTo(0, 0);
  }

  /* 클릭 가로채기 — index.html / category.html / detail.html 링크는 SPA 처리 */
  function normalizeHref(href) {
    // category.html?X, detail.html?X, index.html?X 모두 ./index.html?X 로 통일
    if (!href) return null;
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return null;
    try {
      const url = new URL(href, location.href);
      // 같은 origin (file:// 또는 http://) 만 SPA 처리
      if (url.origin !== location.origin) return null;
      const path = url.pathname;
      // *.html 만 처리
      if (!/(?:index|category|detail)\.html$/i.test(path)) return null;
      // index.html 로 통일
      const base = path.replace(/(?:category|detail)\.html$/i, 'index.html');
      return base + url.search + url.hash;
    } catch { return null; }
  }

  /* 프로덕션 멀티테넌트 경로(/{slug})에서 현재 매장 슬러그.
     dev(/web/index.html), ?store= 쿼리, /index.html 직진입 시엔 null → 기존 링크 그대로. */
  function pathSlug() {
    const segs = (location.pathname || '/').split('/').filter(Boolean);
    const seg = segs[0];
    if (!seg || seg === 'web') return null;
    if (/\.html?$/i.test(seg)) return null;
    if (['admin', '_super', 'assets', 'products', 'data'].includes(seg)) return null;
    return seg;
  }

  /* 내부 링크를 SPA 이동 대상 URL로 변환.
     매장 슬러그가 path에 있으면 /{slug}?cls=…|?id=… 로 유지 (슬러그·깨끗한 URL 보존),
     아니면 normalizeHref 결과(/index.html?…) 그대로. */
  function navTarget(rawHref) {
    const norm = normalizeHref(rawHref);
    if (!norm) return null;
    const slug = pathSlug();
    if (!slug) return norm;
    const u = new URL(norm, location.origin);
    return '/' + slug + u.search + u.hash;
  }

  function attachClickHandler() {
    document.addEventListener('click', (e) => {
      // 수정 키(Ctrl/Cmd/Shift) + 클릭은 새 탭 등 브라우저 기본 동작 유지
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const a = e.target.closest('a[href]');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const norm = navTarget(a.getAttribute('href'));
      if (!norm) return;
      // 같은 URL이면 무시 (스크롤만 위로 가는 거 방지)
      if (norm === location.pathname + location.search + location.hash) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      history.pushState({}, '', norm);
      // 색상 chip 클릭은 같은 상품군 내 이동 → 스크롤 위치 유지
      const keepScroll = a.classList.contains('cp-chip');
      if (document.startViewTransition) {
        document.startViewTransition(() => route({ keepScroll }));
      } else {
        route({ keepScroll });
      }
    });
  }

  /* 외부에서 호출하는 진입점 */
  async function startRouter() {
    attachClickHandler();
    window.addEventListener('popstate', () => {
      if (document.startViewTransition) {
        document.startViewTransition(() => route());
      } else {
        route();
      }
    });
    await route();
  }

  return {
    renderHome, renderCategory, renderDetail,
    db, productCard,
    startRouter, route,
  };
})();

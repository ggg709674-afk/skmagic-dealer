/* ============================================================
   admin.js — 관리자 상품 관리 로직
   - PRODUCTS_DB(자동 생성) 는 그대로 두고, 매장 자체 오버라이드는
     localStorage('skm_admin_overrides_v1') 에 저장.
   - 추후 백엔드 붙으면 같은 JSON 스키마로 API 호출만 갈아끼우면 됨.
   ============================================================ */

(() => {

  /* ─── 카테고리 메타 (실제 사이트에 노출되는 4종만) ─── */
  const CATEGORY_META = {
    '100000005':  { label: '정수기' },
    '100000010':  { label: '공기청정기' },
    '100000024':  { label: '비데' },
    '1000000245': { label: '매트리스' },
  };
  const VISIBLE_CATS = Object.keys(CATEGORY_META);

  /* ─── 상태 ──────────────────────────────────────── */
  const STORAGE_KEY = 'skm_admin_overrides_v1';
  const state = {
    products: [],             // App.db()의 dedup된 products 중 VISIBLE_CATS 소속만
    filterCat: '',
    filterSearch: '',
    filterShowHidden: false,
    filterFeaturedOnly: false,
    overrides: emptyOverrides(),
    dirty: false,
    store: null,              // 현재 매장 (Supabase stores 행)
  };

  /* ─── overrides 스키마 ───────────────────────────
     {
       hidden:   { [goodsId]: true },
       featured: { [goodsId]: true },
       featuredRank: { [goodsId]: number },   // 추천 켠 순서 (작을수록 먼저)
       order:    { [dispClsfNo]: [goodsId, goodsId, ...] },
       edits:    { [goodsId]: { name, price:{title,del,num}, benefits:[], tag } },
       updated_at: ISO 문자열
     }
  ─────────────────────────────────────────────────── */
  function emptyOverrides(){
    return { hidden:{}, featured:{}, featuredRank:{}, order:{}, edits:{}, updated_at:null };
  }
  /* 다음 추천 순번 = 현재 최대 + 1 (없으면 0) */
  function nextFeaturedRank(ov){
    const vals = Object.values(ov.featuredRank || {}).filter(v => typeof v === 'number');
    return vals.length ? Math.max(...vals) + 1 : 0;
  }

  /* localStorage 폴백(오프라인/매장 미지정 모드) */
  function loadOverridesLocal(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyOverrides();
      const o = JSON.parse(raw);
      return {
        hidden:   o.hidden   || {},
        featured: o.featured || {},
        featuredRank: o.featuredRank || {},
        order:    o.order    || {},
        edits:    o.edits    || {},
        updated_at: o.updated_at || null,
      };
    } catch(e){ return emptyOverrides(); }
  }

  /* Supabase rows → state.overrides 변환 */
  function rowsToOverrides(rows, products){
    const ov = emptyOverrides();
    const orderByCat = {};  // dispClsfNo → [{gid, order_index}]
    rows.forEach(r => {
      const gid = r.goods_id;
      if (r.hidden)   ov.hidden[gid]   = true;
      if (r.featured) {
        ov.featured[gid] = true;
        if (r.featured_rank != null) ov.featuredRank[gid] = r.featured_rank;
      }
      // edits
      const ed = {};
      if (r.name_override)               ed.name = r.name_override;
      if (r.benefits_override?.length)   ed.benefits = r.benefits_override;
      if (r.tag_override != null)        ed.tag = r.tag_override;
      const hasPrice = r.price_regular || r.price_sale || r.price_compete || r.price_card;
      if (hasPrice){
        ed.price = {
          regular: r.price_regular || '',
          sale:    r.price_sale    || '',
          compete: r.price_compete || '',
          card:    r.price_card    || '',
        };
      }
      if (Object.keys(ed).length) ov.edits[gid] = ed;
      // order_index → 카테고리별 분배 (product에서 primary cat 알아내야 함)
      if (r.order_index != null){
        const p = products.find(x => x.goodsId === gid);
        if (p){
          const cat = (p.categories || []).find(c => VISIBLE_CATS.includes(c)) || (p.categories || [])[0];
          if (cat){
            (orderByCat[cat] = orderByCat[cat] || []).push({ gid, idx: r.order_index });
          }
        }
      }
    });
    Object.entries(orderByCat).forEach(([cat, list]) => {
      list.sort((a, b) => a.idx - b.idx);
      ov.order[cat] = list.map(x => x.gid);
    });
    return ov;
  }

  /* ─── 단일 gid 의 row 빌드 / 비어있는지 판별 ─────── */
  function buildRowForGid(storeId, products, ov, gid){
    const p = products.find(x => x.goodsId === gid);
    let order_index = null;
    if (p){
      const cat = (p.categories || []).find(c => VISIBLE_CATS.includes(c)) || (p.categories || [])[0];
      const arr = (cat && ov.order[cat]) || [];
      const idx = arr.indexOf(gid);
      if (idx >= 0) order_index = idx;
    }
    const ed = ov.edits[gid] || {};
    return {
      store_id: storeId,
      goods_id: gid,
      hidden:   !!ov.hidden[gid],
      featured: !!ov.featured[gid],
      featured_rank: ov.featured[gid] ? (ov.featuredRank[gid] ?? 0) : null,
      order_index,
      name_override:     ed.name || null,
      benefits_override: ed.benefits || null,
      tag_override:      ed.tag != null ? ed.tag : null,
      price_regular: ed.price?.regular || null,
      price_sale:    ed.price?.sale    || null,
      price_compete: ed.price?.compete || null,
      price_card:    ed.price?.card    || null,
    };
  }
  function rowIsEmpty(r){
    return !r.hidden && !r.featured && r.order_index == null
      && !r.name_override && (!r.benefits_override || r.benefits_override.length === 0) && !r.tag_override
      && !r.price_regular && !r.price_sale && !r.price_compete && !r.price_card;
  }

  /* ─── 즉시 클라우드 동기화 (auto-save) ──────────── */
  let _syncPending = 0;
  function setSyncStatus(text, kind){
    const el = document.getElementById('adm-dirty');
    if (!el) return;
    if (!text){ el.hidden = true; return; }
    el.hidden = false;
    el.textContent = text;
    el.style.color = kind === 'error' ? '#fff' : 'var(--primary)';
    el.style.background = kind === 'error' ? 'var(--primary)' : 'var(--primary-soft)';
  }

  async function persistOne(gid){
    if (!state.store?.id || !window.sb || !gid) return;
    const row = buildRowForGid(state.store.id, state.products, state.overrides, gid);
    _syncPending++;
    setSyncStatus('● 동기화 중…');
    try {
      if (rowIsEmpty(row)){
        await window.sb.from('admin_overrides').delete()
          .eq('store_id', row.store_id)
          .eq('goods_id', gid);
      } else {
        const { error } = await window.sb.from('admin_overrides')
          .upsert(row, { onConflict: 'store_id,goods_id' });
        if (error) throw error;
      }
      // localStorage 백업
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.overrides));
    } catch(e){
      console.error('[admin] persistOne 실패', e);
      setSyncStatus('⚠ 동기화 실패', 'error');
      _syncPending = 0;
      return;
    }
    _syncPending--;
    if (_syncPending === 0) setSyncStatus('✓ 저장됨');
    setTimeout(() => { if (_syncPending === 0) setSyncStatus(''); }, 1200);
  }

  /* state.overrides → Supabase upsert rows (변경된 gid 들의 행) */
  function overridesToRows(storeId, products, ov){
    // hidden/featured/edits 에 한 번이라도 등장한 gid + order 에 들어간 gid
    const gids = new Set();
    Object.keys(ov.hidden).forEach(g => gids.add(g));
    Object.keys(ov.featured).forEach(g => gids.add(g));
    Object.keys(ov.edits).forEach(g => gids.add(g));
    Object.values(ov.order).forEach(arr => (arr || []).forEach(g => gids.add(g)));

    const rows = [];
    for (const gid of gids){
      const p = products.find(x => x.goodsId === gid);
      let order_index = null;
      if (p){
        const cat = (p.categories || []).find(c => VISIBLE_CATS.includes(c)) || (p.categories || [])[0];
        const arr = (cat && ov.order[cat]) || [];
        const idx = arr.indexOf(gid);
        if (idx >= 0) order_index = idx;
      }
      const ed = ov.edits[gid] || {};
      rows.push({
        store_id: storeId,
        goods_id: gid,
        hidden:   !!ov.hidden[gid],
        featured: !!ov.featured[gid],
        featured_rank: ov.featured[gid] ? (ov.featuredRank[gid] ?? 0) : null,
        order_index,
        name_override:     ed.name || null,
        benefits_override: ed.benefits || null,
        tag_override:      ed.tag != null ? ed.tag : null,
        price_regular: ed.price?.regular || null,
        price_sale:    ed.price?.sale    || null,
        price_compete: ed.price?.compete || null,
        price_card:    ed.price?.card    || null,
      });
    }
    return rows;
  }

  /* 저장: Supabase upsert + localStorage 백업 */
  async function saveOverrides(){
    state.overrides.updated_at = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.overrides));

    if (!state.store?.id){
      // 매장 미지정 모드 — 로컬만
      state.dirty = false;
      updateDirtyFlag();
      toast('로컬에 저장되었어요 (매장 미지정 모드)');
      return;
    }

    try {
      const rows = overridesToRows(state.store.id, state.products, state.overrides);
      if (rows.length){
        const { error } = await window.sb
          .from('admin_overrides')
          .upsert(rows, { onConflict: 'store_id,goods_id' });
        if (error) throw error;
      }
      state.dirty = false;
      updateDirtyFlag();
      toast(`클라우드에 저장됨 (${rows.length}건)`);
    } catch(e){
      console.error('[admin] cloud save 실패', e);
      toast('⚠️ 클라우드 저장 실패 — 로컬엔 백업됨');
    }
  }
  function markDirty(){
    state.dirty = true;
    updateDirtyFlag();
  }
  function updateDirtyFlag(){
    const f = document.getElementById('adm-dirty');
    if (f) f.hidden = !state.dirty;
  }

  /* ─── 유틸 ──────────────────────────────────────── */
  const escape = (s) => String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');

  function modelCode(p){
    return (p.model || '').split('\n')[0].trim();
  }
  function thumbUrl(p){
    if (!p.thumb) return '';
    const ext = p.thumb_ext || '.png';
    return `../products/${p.goodsId}/thumb${ext}`;
  }
  function thumbFallback(p){
    return p.thumb || '';
  }
  function priceOf(p){
    return (p.prices && p.prices[0]) || null;
  }

  /* 상품 가격 기준 정책 행 — 공개사이트 app.js cardPolicyPrice 와 동일 로직.
     모델코드 base10 매칭 → 셀프형 우선(없으면 방문형) → 5년(의무60) 행. */
  function comPolicyRow(mc){
    const db = comDB();
    const rows = (db && db.rows) || [];
    const base = (mc || '').slice(0, 10);
    if (!base) return null;
    const mine = rows.filter(r => (r.코드 || '').slice(0, 10) === base);
    if (!mine.length) return null;
    let pool = mine.filter(r => r.형태 === '셀프형');
    if (!pool.length) pool = mine.filter(r => r.형태 === '방문형');
    if (!pool.length) pool = mine;
    let row = pool.find(r => r.의무 === 60);
    if (!row) row = pool.slice().sort((a, b) => Math.abs((a.의무 || 0) - 60) - Math.abs((b.의무 || 0) - 60))[0];
    return row || null;
  }

  /* 가격 4종 — 원본 + edits 를 합쳐 표시용으로 반환
     반환: { regular, sale, compete, card }   (모두 숫자 문자열, 단위 ₩ 없이 "13,200" 형태)
     우선순위: 매장 수동 override > 정책테이블(5년+셀프/방문) > 본사 크롤(fallback). */
  function effectivePrices(p){
    const ed = state.overrides.edits[p.goodsId]?.price || {};
    const pol = comPolicyRow(modelCode(p));
    const polReg  = (pol && pol.기준가   != null) ? String(pol.기준가)   : '';
    const polSale = (pol && pol.기본요금 != null) ? String(pol.기본요금) : '';
    const polComp = (pol && typeof pol.타사보상 === 'number' && pol.타사보상 > 0) ? String(pol.타사보상) : '';
    // 본사 크롤 fallback (정책표에 없는 모델용): del=정상가, num=할인가
    const orig = priceOf(p) || {};
    const stripUnit = (s) => String(s || '').replace(/^[^\d]*월?\s*/,'').replace(/\s*원\s*$/,'').trim();
    return {
      regular: ed.regular != null && ed.regular !== '' ? ed.regular : (polReg  || stripUnit(orig.del)),
      sale:    ed.sale    != null && ed.sale    !== '' ? ed.sale    : (polSale || stripUnit(orig.num)),
      compete: ed.compete != null && ed.compete !== '' ? ed.compete : polComp,
      card:    ed.card    != null ? ed.card    : '',
    };
  }

  /* 원본 product + edits override 를 합쳐 표시용 product 반환 */
  function effective(p){
    const ed = state.overrides.edits[p.goodsId];
    if (!ed) return p;
    const merged = { ...p };
    if (ed.name != null && ed.name !== '') merged.name = ed.name;
    if (ed.tag != null) merged.tag = ed.tag;
    if (Array.isArray(ed.benefits)) merged.benefits = ed.benefits;
    // prices는 4가격 모델로 갈아탔으므로 effectivePrices() 별도 사용
    return merged;
  }

  /* 모델 코드 끝 글자 → 색상명 매핑 (app.js의 inferColorFromModel 재사용) */
  function colorLabelFromModel(p){
    // 우선순위: 본사 _colorName > 모델 코드 hint
    if (p._colorName) return p._colorName;
    if (typeof App !== 'undefined' && typeof App.productCard === 'function'){
      // App 내부 inferColorFromModel은 노출되지 않았으므로 직접 매핑
    }
    const m = (modelCode(p) || '').toUpperCase();
    if (!m) return '';
    const HINT = {
      'SNW':'화이트','SOW':'화이트','SWH':'화이트','NWH':'화이트','KOW':'화이트','LWH':'화이트',
      'SNS':'실버',  'NSB':'실버',
      'SNB':'블랙',  'SVB':'블랙',  'KOB':'블랙',
      'SPB':'블루',
      'SPS':'세이지',
      'SSP':'핑크',
      'PPN':'네이비','PSG':'네이비',
      'KZG':'그린',
      'SDG':'그레이',
      'SCE':'베이지','BGE':'베이지',
      'SBR':'브라운','RBR':'브라운',
    };
    return HINT[m.slice(-3)] || HINT[m.slice(-2)] || '';
  }
  function isEdited(gid){
    const ed = state.overrides.edits[gid];
    if (!ed) return false;
    return Object.keys(ed).some(k => {
      const v = ed[k];
      if (v == null) return false;
      if (typeof v === 'string') return v !== '';
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'object') return Object.values(v).some(x => x != null && x !== '');
      return false;
    });
  }
  function categoriesOf(p){
    return (p.categories || []).filter(c => CATEGORY_META[c]);
  }
  function primaryCat(p){
    const cs = categoriesOf(p);
    // VISIBLE_CATS 우선
    return cs.find(c => VISIBLE_CATS.includes(c)) || cs[0] || '';
  }
  function renderColorInfo(p){
    // 색상 dot + "N색" 배지만 표시 (한글 색상명은 제거 — 모델 컬럼 끝글자로 식별)
    const sibs = p._siblings || [];
    const dots = (p.colors || []).slice(0, 5)
      .map(c => `<span class="col-dot" style="${escape(c.style || '')}"></span>`)
      .join('');
    const extra = sibs.length > 1 ? `<span class="col-count">${sibs.length}색</span>` : '';
    if (!dots && !extra) return '';
    return `<span class="nm-sub">${dots}${extra}</span>`;
  }

  /* ─── 로딩 ──────────────────────────────────────── */
  async function loadProducts(){
    // App.db() — app.js와 동일한 색상 dedup 결과 사용 (홈 카운트와 일치).
    //   같은 모델군의 여러 색상 변형 → 화이트 색상 대표 1개로 합쳐짐.
    //   대표 product에 _siblings(나머지 색상의 goodsId/model/color) 포함됨.
    if (typeof App === 'undefined' || typeof App.db !== 'function'){
      document.getElementById('products-tbody').innerHTML =
        `<tr><td colspan="9" class="adm-empty">app.js 가 로드되지 않았습니다.</td></tr>`;
      return;
    }
    try {
      const data = await App.db();
      // 4개 노출 카테고리(정수기/공기청정기/비데/매트리스)에 속한 상품만.
      state.products = (data.products || []).filter(p =>
        (p.categories || []).some(c => VISIBLE_CATS.includes(c))
      );
    } catch(e){
      console.error('[admin] App.db() 실패', e);
      document.getElementById('products-tbody').innerHTML =
        `<tr><td colspan="9" class="adm-empty">상품 데이터 로드 실패. 콘솔을 확인하세요.</td></tr>`;
    }
  }

  /* ─── 필터 + 정렬 결과 산출 ─────────────────────── */
  function visibleList(){
    let list = state.products.slice();

    // 카테고리 필터 — '' = 전체, 또는 특정 dispClsfNo
    if (state.filterCat){
      list = list.filter(p => (p.categories || []).includes(state.filterCat));
    }

    // 숨김 토글
    if (!state.filterShowHidden){
      list = list.filter(p => !state.overrides.hidden[p.goodsId]);
    }

    // 추천만
    if (state.filterFeaturedOnly){
      list = list.filter(p => state.overrides.featured[p.goodsId]);
    }

    // 검색
    const q = state.filterSearch.trim().toLowerCase();
    if (q){
      list = list.filter(p => {
        return (p.name || '').toLowerCase().includes(q)
            || modelCode(p).toLowerCase().includes(q)
            || (p.goodsId || '').toLowerCase().includes(q);
      });
    }

    // 정렬
    const CAT_KEYS = Object.keys(CATEGORY_META);   // 정수기→공기청정기→비데→매트리스
    const raw = new Map(list.map((p, i) => [p.goodsId, i]));
    if (state.filterCat){
      // 단일 카테고리 — 수동 order 순서대로 (없으면 raw)
      const orderArr = state.overrides.order[state.filterCat] || [];
      if (orderArr.length){
        const orderIdx = new Map(orderArr.map((id, i) => [id, i]));
        list.sort((a, b) => {
          const ai = orderIdx.has(a.goodsId) ? orderIdx.get(a.goodsId) : Infinity;
          const bi = orderIdx.has(b.goodsId) ? orderIdx.get(b.goodsId) : Infinity;
          if (ai !== bi) return ai - bi;
          return raw.get(a.goodsId) - raw.get(b.goodsId);
        });
      }
    } else {
      // 전체보기 — 카테고리 순 + 카테고리 내(수동 order 순, 순서 미조정한 신상품은 최상단)
      const catRank = (p) => { const i = CAT_KEYS.indexOf(primaryCat(p)); return i < 0 ? 99 : i; };
      const orderMaps = {};
      CAT_KEYS.forEach(c => { orderMaps[c] = new Map((state.overrides.order[c] || []).map((id, i) => [id, i])); });
      list.sort((a, b) => {
        const ra = catRank(a), rb = catRank(b);
        if (ra !== rb) return ra - rb;                     // 카테고리 순
        const m = orderMaps[primaryCat(a)] || new Map();
        const ia = m.has(a.goodsId) ? m.get(a.goodsId) : -1;   // order 없는 신상품 = 최상단
        const ib = m.has(b.goodsId) ? m.get(b.goodsId) : -1;
        if (ia !== ib) return ia - ib;
        return raw.get(a.goodsId) - raw.get(b.goodsId);    // stable
      });
    }

    return list;
  }

  /* ─── 렌더 ──────────────────────────────────────── */
  function renderChips(){
    const wrap = document.getElementById('cat-chips');
    if (!wrap) return;

    // 카테고리별 카운트 (숨김 미반영 — 원본 수)
    const counts = {};
    state.products.forEach(p => {
      (p.categories || []).forEach(c => {
        if (VISIBLE_CATS.includes(c)) counts[c] = (counts[c] || 0) + 1;
      });
    });

    const chips = [chipHTML('', '전체', state.products.length)];
    VISIBLE_CATS.forEach(c => {
      chips.push(chipHTML(c, CATEGORY_META[c]?.label || c, counts[c] || 0));
    });

    wrap.innerHTML = chips.join('');
    wrap.querySelectorAll('.adm-chip').forEach(el => {
      el.addEventListener('click', () => {
        const next = el.dataset.cat;
        const target = buildHash('products', next);
        if (location.hash === target){
          // 같은 hash 면 hashchange 이벤트가 안 뜸 — 직접 반영
          state.filterCat = next;
          renderChips();
          renderTable();
        } else {
          // hashchange → applyMenuFromHash 가 state.filterCat 동기화 후 재렌더
          location.hash = target;
        }
      });
    });
  }
  function chipHTML(cat, label, cnt){
    const on = state.filterCat === cat;
    return `<button class="adm-chip ${on ? 'on':''}" data-cat="${escape(cat)}">
      ${escape(label)} <span class="chip-cnt">${cnt}</span>
    </button>`;
  }

  function renderTable(){
    const tbody = document.getElementById('products-tbody');
    const cntEl = document.getElementById('list-count');
    const list = visibleList();
    if (cntEl) cntEl.innerHTML = `<strong>${list.length}</strong>개 표시 중 / 전체 ${state.products.length}개`;

    if (!list.length){
      tbody.innerHTML = `<tr><td colspan="13" class="adm-empty">조건에 맞는 상품이 없어요.</td></tr>`;
      return;
    }

    const singleCat = !!state.filterCat;

    tbody.innerHTML = list.map((rawP, i) => {
      const p = effective(rawP);
      const gid = p.goodsId;
      const hidden = !!state.overrides.hidden[gid];
      const featured = !!state.overrides.featured[gid];
      const edited = isEdited(gid);
      const prices = effectivePrices(p);
      const cat = primaryCat(p);
      const catLabel = CATEGORY_META[cat]?.label || '—';
      const mcode = modelCode(p);
      const colorLbl = colorLabelFromModel(p);

      const priceCell = (v) => v ? `<strong>${escape(v)}</strong>` : `<span class="price-empty">—</span>`;

      return `
        <tr data-gid="${escape(gid)}" class="${hidden ? 'is-hidden':''} ${featured ? 'is-featured':''} ${edited ? 'is-edited':''}">
          <td class="col-order">${i + 1}</td>
          <td class="col-cat">
            <span class="cat-tag">${escape(catLabel)}</span>
          </td>
          <td class="col-thumb">
            <img loading="lazy" decoding="async"
                 src="${escape(thumbUrl(p))}"
                 alt=""
                 data-fb="${escape(thumbFallback(p))}"
                 onerror="if(this.dataset.fb&&this.src!==this.dataset.fb){this.src=this.dataset.fb}else{this.style.opacity=.2}">
          </td>
          <td class="col-model">
            <span class="model-code">${escape(mcode || '—')}</span>
          </td>
          <td class="col-name">
            <span class="nm">${escape(p.name || '')}</span>
            ${renderColorInfo(p)}
          </td>
          <td class="col-price col-price-regular">${prices.regular ? `<s>${escape(prices.regular)}</s>` : priceCell('')}</td>
          <td class="col-price col-price-sale">${priceCell(prices.sale)}</td>
          <td class="col-price col-price-compete">${priceCell(prices.compete)}</td>
          <td class="col-price col-price-card">${priceCell(prices.card)}</td>
          <td class="col-toggle">
            <label class="adm-switch">
              <input type="checkbox" data-act="visible" ${hidden ? '' : 'checked'}>
              <span class="adm-switch-slider"></span>
            </label>
          </td>
          <td class="col-toggle">
            <label class="adm-switch feat">
              <input type="checkbox" data-act="featured" ${featured ? 'checked' : ''}>
              <span class="adm-switch-slider"></span>
            </label>
          </td>
          <td class="col-actions">
            <button class="adm-arrow" data-act="up" ${i === 0 || !singleCat ? 'disabled' : ''} title="${singleCat ? '위로' : '단일 카테고리에서만 정렬 가능'}">▲</button>
            <button class="adm-arrow" data-act="down" ${i === list.length - 1 || !singleCat ? 'disabled' : ''} title="${singleCat ? '아래로' : '단일 카테고리에서만 정렬 가능'}">▼</button>
          </td>
          <td class="col-edit">
            <button class="adm-row-edit" data-act="edit">✎ 수정</button>
          </td>
        </tr>
      `;
    }).join('');

    // 이벤트 위임
    tbody.querySelectorAll('input[type=checkbox]').forEach(input => {
      input.addEventListener('change', onToggle);
    });
    tbody.querySelectorAll('.adm-arrow').forEach(btn => {
      btn.addEventListener('click', onArrow);
    });
    tbody.querySelectorAll('.adm-row-edit').forEach(btn => {
      btn.addEventListener('click', onEditClick);
    });
  }

  /* ─── 이벤트 핸들러 ─────────────────────────────── */
  function onToggle(e){
    const tr = e.target.closest('tr');
    const gid = tr?.dataset.gid;
    if (!gid) return;
    const act = e.target.dataset.act;
    if (act === 'visible'){
      if (e.target.checked) delete state.overrides.hidden[gid];
      else state.overrides.hidden[gid] = true;
      tr.classList.toggle('is-hidden', !e.target.checked);
    } else if (act === 'featured'){
      if (e.target.checked) {
        state.overrides.featured[gid] = true;
        state.overrides.featuredRank[gid] = nextFeaturedRank(state.overrides);
      } else {
        delete state.overrides.featured[gid];
        delete state.overrides.featuredRank[gid];
      }
      tr.classList.toggle('is-featured', e.target.checked);
    }
    persistOne(gid);
  }

  function onArrow(e){
    const tr = e.target.closest('tr');
    const gid = tr?.dataset.gid;
    if (!gid) return;
    const cat = state.filterCat;
    if (!cat) return;
    const dir = e.target.dataset.act === 'up' ? -1 : +1;

    // 현재 카테고리의 표시 순서 배열 확보 (없으면 현재 visibleList에서 추출)
    let arr = state.overrides.order[cat];
    if (!arr || !arr.length){
      arr = visibleList().map(p => p.goodsId);
    }
    const idx = arr.indexOf(gid);
    if (idx < 0){
      // visibleList에 있지만 order 배열에 없으면 추가 후 swap
      arr.push(gid);
    }
    const cur = arr.indexOf(gid);
    const next = cur + dir;
    if (next < 0 || next >= arr.length) return;
    const otherGid = arr[next];
    [arr[cur], arr[next]] = [arr[next], arr[cur]];
    state.overrides.order[cat] = arr;
    renderTable();
    // swap된 두 gid 모두 동기화
    persistOne(gid);
    persistOne(otherGid);
  }

  /* ─── 편집 모달 ─────────────────────────────────── */
  let _editingGid = null;
  function findProduct(gid){
    return state.products.find(p => p.goodsId === gid);
  }
  function onEditClick(e){
    const tr = e.target.closest('tr');
    const gid = tr?.dataset.gid;
    if (!gid) return;
    openEditModal(gid);
  }
  function openEditModal(gid){
    const p = findProduct(gid);
    if (!p){ console.warn('product not found', gid); return; }
    _editingGid = gid;
    const orig = p;                       // 원본
    const cur  = effective(p);            // 오버라이드 반영본

    // 좌측 메타
    const thumbWrap = document.getElementById('edit-thumb');
    thumbWrap.innerHTML = `<img src="${escape(thumbUrl(orig))}" alt="" data-fb="${escape(thumbFallback(orig))}" onerror="if(this.dataset.fb&&this.src!==this.dataset.fb){this.src=this.dataset.fb}">`;
    document.getElementById('edit-model').textContent = modelCode(orig) || '—';
    document.getElementById('edit-gid').textContent   = gid;
    document.getElementById('edit-cat').textContent   = CATEGORY_META[primaryCat(orig)]?.label || '—';
    const sibs = orig._siblings || [];
    document.getElementById('edit-siblings').textContent = sibs.length > 1 ? `${sibs.length}색` : '단일';

    // 우측 폼 — 현재 적용값으로 채움 (effective)
    const pr = effectivePrices(orig);
    document.getElementById('edit-name').value          = cur.name || '';
    document.getElementById('edit-price-regular').value = pr.regular || '';
    document.getElementById('edit-price-sale').value    = pr.sale || '';
    document.getElementById('edit-price-compete').value = pr.compete || '';
    document.getElementById('edit-price-card').value    = pr.card || '';
    document.getElementById('edit-benefits').value      = (cur.benefits || []).join(', ');
    document.getElementById('edit-tag').value           = cur.tag || '';

    // 원본값 힌트 (정상가/할인가만 — 본사 데이터 기준)
    const op = priceOf(orig) || {};
    const stripUnit = (s) => String(s || '').replace(/^[^\d]*월?\s*/,'').replace(/\s*원\s*$/,'').trim();
    document.getElementById('edit-name-orig').innerHTML     = `원본: <code>${escape(orig.name || '—')}</code>`;
    const polH = comPolicyRow(modelCode(orig));
    const fmtH = n => (n == null ? '' : Number(n).toLocaleString('ko-KR'));
    document.getElementById('edit-price-orig').innerHTML    = (polH && (polH.기준가 != null || polH.기본요금 != null))
      ? `정책 기준(5년·셀프/방문): <code>정상가 ${escape(fmtH(polH.기준가) || '—')} / 월 ${escape(fmtH(polH.기본요금) || '—')}</code> · 비우면 정책가 자동 적용`
      : `본사 원본: <code>정상가 ${escape(stripUnit(op.del) || '—')} / 할인가 ${escape(stripUnit(op.num) || '—')}</code>`;
    document.getElementById('edit-benefits-orig').innerHTML = `원본: <code>${escape((orig.benefits || []).join(', ') || '—')}</code>`;
    document.getElementById('edit-tag-orig').innerHTML      = `원본: <code>${escape(orig.tag || '—')}</code>`;

    document.getElementById('edit-modal').hidden = false;
    setTimeout(() => document.getElementById('edit-name').focus(), 50);
  }
  function closeEditModal(){
    document.getElementById('edit-modal').hidden = true;
    _editingGid = null;
  }
  function saveEditModal(){
    if (!_editingGid) return;
    const orig = findProduct(_editingGid);
    if (!orig) return;

    const name  = document.getElementById('edit-name').value.trim();
    const preg  = document.getElementById('edit-price-regular').value.trim();
    const psal  = document.getElementById('edit-price-sale').value.trim();
    const pcom  = document.getElementById('edit-price-compete').value.trim();
    const pcrd  = document.getElementById('edit-price-card').value.trim();
    const bRaw  = document.getElementById('edit-benefits').value.trim();
    const tag   = document.getElementById('edit-tag').value.trim();

    // 정책가(5년+셀프/방문)와 비교 → 같으면 override에 안 담음(정책 그대로 추종)
    const pol = comPolicyRow(modelCode(orig));
    const op = priceOf(orig) || {};
    const stripUnit = (s) => String(s || '').replace(/^[^\d]*월?\s*/,'').replace(/\s*원\s*$/,'').trim();
    const baseRegular = (pol && pol.기준가   != null) ? String(pol.기준가)   : stripUnit(op.del);
    const baseSale    = (pol && pol.기본요금 != null) ? String(pol.기본요금) : stripUnit(op.num);
    const baseComp    = (pol && typeof pol.타사보상 === 'number' && pol.타사보상 > 0) ? String(pol.타사보상) : '';

    const ed = {};
    if (name && name !== (orig.name || '')) ed.name = name;
    if (tag !== (orig.tag || '')) ed.tag = tag;

    const benefits = bRaw ? bRaw.split(/[,、]/).map(s => s.trim()).filter(Boolean).slice(0, 5) : [];
    const origBenefits = (orig.benefits || []).slice();
    if (benefits.join('|') !== origBenefits.join('|')) ed.benefits = benefits;

    // 입력값이 비었거나 정책 기준과 같으면 override 안 담음 → 정책 그대로 따름
    const price = {};
    if (preg && preg !== baseRegular) price.regular = preg;
    if (psal && psal !== baseSale)    price.sale    = psal;
    if (pcom && pcom !== baseComp)    price.compete = pcom;
    if (pcrd) price.card    = pcrd;
    if (Object.keys(price).length) ed.price = price;

    if (Object.keys(ed).length === 0){
      delete state.overrides.edits[_editingGid];
    } else {
      state.overrides.edits[_editingGid] = ed;
    }
    const gid = _editingGid;
    closeEditModal();
    renderTable();
    persistOne(gid);
  }
  function revertEditModal(){
    if (!_editingGid) return;
    if (!confirm('이 상품의 수정 내용을 모두 삭제하고 원본값으로 되돌립니다.')) return;
    delete state.overrides.edits[_editingGid];
    const gid = _editingGid;
    closeEditModal();
    renderTable();
    persistOne(gid);
  }

  /* ─── 헤더 액션 ─────────────────────────────────── */
  function onSave(){ saveOverrides(); }
  function onReset(){
    if (!confirm('모든 변경사항(노출/추천/순서)을 초기화하시겠어요? 저장된 데이터도 함께 삭제됩니다.')) return;
    state.overrides = emptyOverrides();
    localStorage.removeItem(STORAGE_KEY);
    state.dirty = false;
    updateDirtyFlag();
    renderChips();
    renderTable();
    toast('초기화 완료');
  }
  /* ─── 사이드바 메뉴 (hash 기반 라우팅) ───────────────
     URL: ./admin.html#<menu>
       products | consult | banner | store
     hash 없으면 products 로 기본 진입.
     새로고침/뒤로가기 시 동일한 화면이 복원됨.
  ─────────────────────────────────────────────────── */
  const MENU_META = {
    products: { title: '상품 관리', sub: '노출 여부 · 추천 배지 · 표시 순서 · 매장 자체 가격/이름 수정.', kind: 'products' },
    commission: { title: '정책 테이블', sub: '홈페이지 등록 모델의 약정·관리방식별 정책 테이블입니다.', kind: 'commission' },
    carddiscount: { title: '제휴카드 할인금액 설정', sub: '상품별 제휴카드 할인액을 설정합니다. 상품 카드에는 기본요금 기준만 적용됩니다.', kind: 'carddiscount' },
    cards:    { title: '제휴카드 관리', sub: '카드 이미지와 자세히보기 링크를 등록합니다. 제휴카드 안내 페이지에 반영됩니다.', kind: 'cards' },
    iconlab:  { title: '아이콘 시안', sub: '홈 카테고리 아이콘 디자인 시안입니다. 마음에 드는 스타일을 골라 주세요.', kind: 'iconlab' },
    faq:      { title: 'FAQ 관리', sub: '자주 묻는 질문의 질문·답변을 추가·수정·삭제합니다. 자주 묻는 질문 페이지에 반영됩니다.', kind: 'faq' },
    consult:  { title: '상담 신청',     sub: '준비 중인 메뉴예요.', kind: 'soon' },
    banner:   { title: '배너/슬라이드', sub: '홈 화면 상단 배너 이미지와 슬라이드 동작을 관리합니다. 홈 페이지에 반영됩니다.', kind: 'banner' },
    store:    { title: '기본 정보',     sub: '사업자정보 · 연락처를 관리합니다. 사이트 하단에 표시됩니다.', kind: 'store' },
  };
  /* hash 형식: #menu  또는  #products/cat-<dispClsfNo>
     첫 segment = 메뉴, 두번째 segment = 메뉴별 상세상태(상품관리는 카테고리) */
  function parseHash(){
    const raw = (location.hash || '').replace(/^#/, '');
    const parts = raw.split('/').filter(Boolean);
    const menu = MENU_META[parts[0]] ? parts[0] : 'products';
    const sub = parts[1] || '';
    let cat = '';
    if (menu === 'products' && sub.startsWith('cat-')){
      const c = sub.slice(4);
      if (VISIBLE_CATS.includes(c)) cat = c;
    }
    return { menu, cat };
  }
  function currentMenuFromHash(){ return parseHash().menu; }
  function buildHash(menu, cat){
    let h = '#' + menu;
    if (menu === 'products' && cat) h += '/cat-' + cat;
    return h;
  }
  function bindMenu(){
    document.querySelectorAll('.adm-nav-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const menu = el.dataset.menu;
        if (!menu) return;
        // hash 변경만 — applyMenuFromHash가 hashchange 이벤트로 자동 반영
        if (location.hash !== '#' + menu){
          location.hash = '#' + menu;
        } else {
          // 같은 hash 다시 클릭 시 강제 재적용
          applyMenuFromHash();
        }
      });
    });
    window.addEventListener('hashchange', applyMenuFromHash);
  }
  function applyMenuFromHash(){
    const { menu, cat } = parseHash();
    const meta = MENU_META[menu];

    // 사이드바 active 표시
    document.querySelectorAll('.adm-nav-item').forEach(x => {
      x.classList.toggle('on', x.dataset.menu === menu);
    });

    // 패널 전환
    document.querySelector('[data-panel="products"]').hidden   = (meta.kind !== 'products');
    document.querySelector('[data-panel="commission"]').hidden = (meta.kind !== 'commission');
    document.querySelector('[data-panel="carddiscount"]').hidden = (meta.kind !== 'carddiscount');
    document.querySelector('[data-panel="cards"]').hidden      = (meta.kind !== 'cards');
    document.querySelector('[data-panel="iconlab"]').hidden    = (meta.kind !== 'iconlab');
    document.querySelector('[data-panel="faq"]').hidden        = (meta.kind !== 'faq');
    document.querySelector('[data-panel="banner"]').hidden     = (meta.kind !== 'banner');
    document.querySelector('[data-panel="store"]').hidden      = (meta.kind !== 'store');
    document.querySelector('[data-panel="soon"]').hidden       = (meta.kind !== 'soon');

    // 수수료표 업로드 드롭존은 수수료 메뉴에서만 헤더에 노출
    const comUp = document.getElementById('com-upload');
    if (comUp) comUp.hidden = (meta.kind !== 'commission');
    const cdUp = document.getElementById('cd-upload');
    if (cdUp) cdUp.hidden = (meta.kind !== 'carddiscount');
    const cdDl = document.getElementById('cd-download');
    if (cdDl) cdDl.hidden = (meta.kind !== 'carddiscount');

    document.getElementById('adm-page-title').textContent = meta.title;
    document.getElementById('adm-page-sub').textContent   = meta.sub;

    if (meta.kind === 'store') populateStoreForm();
    if (meta.kind === 'commission') initCommission();
    if (meta.kind === 'carddiscount') initCardDiscount();
    if (meta.kind === 'cards') initCards();
    if (meta.kind === 'faq') initFaq();
    if (meta.kind === 'banner') initBanner();
    if (meta.kind === 'iconlab') initIconLab();

    // 상품관리 패널의 카테고리 필터도 hash 와 동기화
    if (meta.kind === 'products' && state.filterCat !== cat){
      state.filterCat = cat;
      // chips/table 이미 렌더링됐을 때만 갱신 (초기 init 흐름은 별도)
      if (state.products.length){
        renderChips();
        renderTable();
      }
    }
  }

  /* ─── 수수료 확인 ───────────────────────────────
     데이터: window.COMMISSION_DB (commission.js, 수수료표에서 생성)
     홈페이지 등록 모델만 / 색상은 묶음(요금·수수료 색상무관) */
  let comInited = false;
  let comUploadBound = false;
  let comData = null; // 업로드/Supabase 로 받은 데이터 (window.COMMISSION_DB 보다 우선)
  const comState = { cat: 'all', form: 'all', q: '' };
  function comDB(){ return comData || window.COMMISSION_DB || null; }
  // 정책(수수료표) 최신 1회 로드 — 상품 가격이 정책테이블 기준이라 상품관리에서도 필요
  let comFetched = false;
  async function ensureCommissionData(){
    if (comFetched) return;
    comFetched = true;
    if (window.skmFetchCommission){
      try { const r = await window.skmFetchCommission(); if (r && r.payload && Array.isArray(r.payload.rows) && r.payload.rows.length) comData = r.payload; } catch(_){}
    }
  }
  const comFmt = (v) => (v == null || v === '') ? '<span class="price-empty">—</span>' : Number(v).toLocaleString('ko-KR');

  /* ─── 제휴카드 관리 ─────────────────────────────────
     8개 카드(코드 고정)별로 이미지 업로드 + 자세히보기 링크 저장.
     데이터: card_benefits(payload.cards[key]={image,link}), 이미지: Storage card-assets. */
  const CARD_DEFS = [
    { key:'hyundai', name:'SK인텔릭스 현대카드' },
    { key:'samsung', name:'SK인텔릭스 삼성카드' },
    { key:'kb',      name:'KB국민 SK인텔릭스 올림' },
    { key:'shinhan', name:'SK인텔릭스 신한카드' },
    { key:'lotte',   name:'롯데 SK인텔릭스 X LOCA' },
    { key:'hana',    name:'SK인텔릭스 플러스 하나카드' },
    { key:'woori',   name:'SK인텔릭스 우리카드' },
    { key:'kj',      name:'SK인텔릭스 KJ카드' },
  ];
  let cardData = {};
  let cardsInited = false;

  async function initCards(){
    const wrap = document.getElementById('adm-cards-list');
    if (!wrap) return;
    if (!cardsInited){
      cardsInited = true;
      if (window.skmFetchCardBenefits){
        try { const r = await window.skmFetchCardBenefits(); if (r && r.payload && r.payload.cards) cardData = r.payload.cards; } catch(_){}
      }
    }
    renderCards();
  }
  function renderCards(){
    const wrap = document.getElementById('adm-cards-list');
    if (!wrap) return;
    wrap.innerHTML = CARD_DEFS.map(c => {
      const d = cardData[c.key] || {};
      return `<div class="adm-card-row" data-key="${c.key}">
        <div class="adm-card-thumb">${d.image ? `<img src="${escape(d.image)}" alt="">` : '<span>이미지 없음</span>'}</div>
        <div class="adm-card-body">
          <div class="adm-card-name">${escape(c.name)}</div>
          <div class="adm-card-fields">
            <label class="adm-card-file-btn">이미지 등록<input type="file" accept="image/*" class="adm-card-file" data-key="${c.key}" hidden></label>
            <input type="url" class="adm-input adm-card-link" data-key="${c.key}" value="${escape(d.link||'')}" placeholder="자세히 보기 링크 (https://...)">
          </div>
          <div class="adm-card-status" data-key="${c.key}"></div>
        </div>
      </div>`;
    }).join('') + `<div class="adm-cards-save"><button class="adm-btn adm-btn-primary" id="cards-save">전체 저장</button></div>`;
    wrap.querySelectorAll('.adm-card-file').forEach(inp => inp.addEventListener('change', onCardImage));
    const saveBtn = document.getElementById('cards-save');
    if (saveBtn) saveBtn.addEventListener('click', saveCards);
  }
  async function onCardImage(e){
    const key = e.target.dataset.key;
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const st = document.querySelector(`.adm-card-status[data-key="${key}"]`);
    if (st) st.textContent = '업로드 중…';
    if (!window.skmUploadCardImage){ if (st) st.textContent = '업로드 기능을 불러오지 못했어요.'; return; }
    const { url, error } = await window.skmUploadCardImage(key, file);
    if (error){ if (st) st.textContent = '업로드 실패: ' + (error.message || '권한 또는 네트워크 오류'); return; }
    cardData[key] = Object.assign({}, cardData[key], { image: url });
    if (st) st.textContent = '이미지 업로드됨 — 전체 저장을 눌러 반영하세요.';
    const row = e.target.closest('.adm-card-row');
    const thumb = row && row.querySelector('.adm-card-thumb');
    if (thumb) thumb.innerHTML = `<img src="${escape(url)}" alt="">`;
    e.target.value = '';
  }
  async function saveCards(){
    document.querySelectorAll('.adm-card-link').forEach(inp => {
      const key = inp.dataset.key;
      cardData[key] = Object.assign({}, cardData[key], { link: inp.value.trim() });
    });
    const btn = document.getElementById('cards-save');
    if (btn){ btn.disabled = true; btn.textContent = '저장 중…'; }
    let error = null;
    if (window.skmSaveCardBenefits){ const r = await window.skmSaveCardBenefits({ cards: cardData }); error = r.error; }
    if (btn){ btn.disabled = false; btn.textContent = '전체 저장'; }
    alert(error ? ('저장 실패: ' + (error.message || '권한 또는 네트워크 오류')) : '저장됐어요. 제휴카드 안내 페이지에 반영됩니다.');
  }

  /* ─── FAQ 관리 ─────────────────────────────────────
     질문/답변 목록을 추가·수정·삭제 후 전체 저장.
     데이터: faq_data(payload.items=[{q,a}]). DB 비었으면 DEFAULT_FAQ 로 시작.
     ※ DEFAULT_FAQ 는 프런트(faq.html)의 DEFAULT_FAQ 와 동일하게 유지할 것. */
  const DEFAULT_FAQ = [
    { q:'의무 사용 기간이 뭐예요?', a:'렌탈 계약 시 정한 기간으로, 이 기간 안에 해지하면 위약금이 발생해요. 의무 사용 기간이 지난 뒤에는 위약금 없이 해지하거나, 약정 만료 시 제품 소유권을 이전받을 수 있어요. 약정 기간은 제품과 관리 방식에 따라 다르니 상담 시 안내해 드려요.' },
    { q:'약정이 끝나면 어떻게 되나요?', a:'계약 기간이 만료되면 보통 ① 제품 소유권을 무상으로 이전받거나, ② 새 제품으로 다시 렌탈하거나, ③ 반납·해지하는 것 중에서 선택하실 수 있어요. 제품·약정에 따라 조건이 달라서 만료 전에 미리 상담받으시는 걸 추천드려요.' },
    { q:'중간에 해지하면 위약금이 얼마인가요?', a:'의무 사용 기간이 남아 있을 때 해지하면 남은 기간에 따라 위약금이 발생해요. 사용 기간이 길수록 부담이 줄어드는 구조라서, 정확한 금액은 가입하신 약정과 사용 기간 기준으로 상담 시 안내해 드려요.' },
    { q:'설치비가 따로 드나요?', a:'기본 설치는 무료로 진행돼요. 다만 추가 배관 작업이나 특수 타공 등 현장 사정에 따라 추가 비용이 생길 수 있어요. 설치 전에 기사님이 확인 후 안내해 드리니 걱정하지 않으셔도 돼요.' },
    { q:'셀프 관리랑 방문 관리는 뭐가 달라요?', a:'방문 관리는 전문 매니저가 정기적으로 방문해 필터 교체·점검을 해드리는 방식이고, 셀프 관리는 고객님이 직접 필터를 교체하시는 대신 월 요금이 더 저렴해요. 생활 패턴에 맞춰 자유롭게 고르실 수 있고, 상세 페이지에서 두 방식의 월 요금을 비교해 보실 수 있어요.' },
    { q:'제휴카드 할인은 어떻게 받나요?', a:'SK인텔릭스 제휴 신용카드를 발급받아 월 렌탈료를 그 카드로 자동 납부 등록하시면, 카드사·전월 실적에 따라 매월 청구 할인을 받을 수 있어요. 카드사별 할인 금액은 <a href="/card-benefits">제휴카드 안내</a> 페이지에서 확인하실 수 있어요.' },
    { q:'이사 가면 제품은 어떻게 하나요?', a:'이전 설치 서비스를 신청하시면 전문 기사가 새 집으로 방문해 다시 설치해 드려요. 이사 일정이 정해지면 미리 연락 주시면 일정에 맞춰 안내해 드릴게요.' },
    { q:'렌탈이 구매보다 나은가요?', a:'렌탈은 초기 비용 부담이 적고, 정기 점검·필터 교체·A/S가 요금에 포함돼 관리가 편한 게 장점이에요. 사용 기간과 관리 방식에 따라 유불리가 달라지니, 상담 때 사용 환경에 맞는 방식을 함께 따져보고 안내해 드려요.' },
  ];
  let faqItems = null;   // [{q,a}] — 편집 중 상태
  let faqInited = false;

  async function initFaq(){
    if (!document.getElementById('adm-faq-list')) return;
    if (!faqInited){
      faqInited = true;
      if (window.skmFetchFaq){
        try { const r = await window.skmFetchFaq(); if (r && r.payload && Array.isArray(r.payload.items) && r.payload.items.length) faqItems = r.payload.items.map(x => ({ q:x.q||'', a:x.a||'' })); } catch(_){}
      }
      if (!faqItems) faqItems = DEFAULT_FAQ.map(x => ({ q:x.q, a:x.a }));
      const addBtn = document.getElementById('faq-add');
      if (addBtn) addBtn.addEventListener('click', () => { syncFaqFromDom(); faqItems.push({ q:'', a:'', _editing:true }); renderFaqAdmin(); });
    }
    renderFaqAdmin();
  }
  function renderFaqAdmin(){
    const wrap = document.getElementById('adm-faq-list');
    if (!wrap) return;
    wrap.innerHTML = faqItems.map((it,i) => {
      if (it._editing){
        // 편집 모드 — 입력칸 + 완료/삭제
        return `<div class="adm-faq-row editing" data-idx="${i}">
          <div class="adm-faq-num">${i+1}</div>
          <div class="adm-faq-body">
            <input type="text" class="adm-input adm-faq-q" data-idx="${i}" value="${escape(it.q)}" placeholder="질문을 입력하세요">
            <textarea class="adm-input adm-faq-a" data-idx="${i}" rows="3" placeholder="답변을 입력하세요">${escape(it.a)}</textarea>
          </div>
          <div class="adm-faq-row-actions">
            <button class="adm-btn adm-btn-primary adm-faq-save-one" data-idx="${i}" type="button">저장</button>
            <button class="adm-btn adm-btn-danger adm-faq-del" data-idx="${i}" type="button">삭제</button>
          </div>
        </div>`;
      }
      // 보기 모드 — 읽기 전용 + 수정 버튼 (실수 삭제 방지)
      const qHtml = it.q ? escape(it.q) : '<span class="adm-faq-empty">(질문 없음)</span>';
      const aHtml = it.a ? escape(it.a) : '<span class="adm-faq-empty">(답변 없음)</span>';
      return `<div class="adm-faq-row" data-idx="${i}">
        <div class="adm-faq-num">${i+1}</div>
        <div class="adm-faq-body">
          <div class="adm-faq-view-q">${qHtml}</div>
          <div class="adm-faq-view-a">${aHtml}</div>
        </div>
        <div class="adm-faq-row-actions">
          <button class="adm-btn adm-btn-ghost adm-faq-edit" data-idx="${i}" type="button">수정</button>
        </div>
      </div>`;
    }).join('') || '<p class="adm-empty">질문이 없어요. 아래 ‘질문 추가’를 눌러 추가하세요.</p>';

    // 수정 — 그 행을 편집 모드로
    wrap.querySelectorAll('.adm-faq-edit').forEach(btn => btn.addEventListener('click', () => {
      syncFaqFromDom();
      faqItems[Number(btn.dataset.idx)]._editing = true;
      renderFaqAdmin();
    }));
    // 저장 — 이 항목만 즉시 저장(개별)
    wrap.querySelectorAll('.adm-faq-save-one').forEach(btn => btn.addEventListener('click', () => saveFaqOne(Number(btn.dataset.idx), btn)));
    // 삭제 — 확인 후 즉시 반영
    wrap.querySelectorAll('.adm-faq-del').forEach(btn => btn.addEventListener('click', async () => {
      const i = Number(btn.dataset.idx);
      if (!confirm('이 질문을 삭제할까요?')) return;
      syncFaqFromDom();
      faqItems.splice(i, 1);
      const err = await persistFaq();
      renderFaqAdmin();
      if (err) alert('삭제 저장 실패: ' + (err.message || '권한 또는 네트워크 오류'));
      else admToast('삭제됐어요');
    }));
  }
  // DOM의 현재 입력값을 faqItems에 반영 (재렌더/저장 전 호출)
  function syncFaqFromDom(){
    document.querySelectorAll('.adm-faq-q').forEach(inp => { const i = Number(inp.dataset.idx); if (faqItems[i]) faqItems[i].q = inp.value; });
    document.querySelectorAll('.adm-faq-a').forEach(inp => { const i = Number(inp.dataset.idx); if (faqItems[i]) faqItems[i].a = inp.value; });
  }
  // 가벼운 토스트 — alert 없이 잠깐 떴다 사라지는 저장 피드백.
  // 매번 새 엘리먼트로 띄워 transition 이 항상 재생되게 한다(재사용 시 안 뜨던 문제).
  function admToast(msg){
    const old = document.getElementById('adm-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.id = 'adm-toast'; el.className = 'adm-toast'; el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('show')));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 350); }, 1600);
  }

  // 현재 faqItems 전체를 DB에 저장 (단일행 payload). 반환: error|null
  async function persistFaq(){
    syncFaqFromDom();
    const items = faqItems.map(it => ({ q:(it.q||'').trim(), a:(it.a||'').trim() })).filter(it => it.q || it.a);
    if (!window.skmSaveFaq) return null;
    const { error } = await window.skmSaveFaq({ items });
    return error || null;
  }
  // 이 항목만 저장 — 질문 비었으면 막고, 성공하면 보기 모드로
  async function saveFaqOne(i, btn){
    syncFaqFromDom();
    if (!(faqItems[i] && (faqItems[i].q || '').trim())){ alert('질문을 입력해 주세요.'); return; }
    if (btn){ btn.disabled = true; }   // 텍스트는 그대로 — 폭 변동(흔들림) 방지
    const err = await persistFaq();
    if (err){ if (btn){ btn.disabled = false; } alert('저장 실패: ' + (err.message || '권한 또는 네트워크 오류')); return; }
    delete faqItems[i]._editing;
    renderFaqAdmin();
    admToast('저장됐어요');
  }

  /* ─── 배너/슬라이드 관리 ───────────────────────────
     이미지(업로드)·링크·새창·사용토글·순서 + 자동/수동·간격.
     데이터: banner_data(payload={mode,interval,items:[{image,link,newTab,enabled}]}), 이미지: Storage banner-assets. */
  const BN_MAX = 10;
  let bnData = null;       // 편집 중 상태
  let bnInited = false;

  async function initBanner(){
    if (!document.getElementById('adm-bn-list')) return;
    if (!bnInited){
      bnInited = true;
      if (window.skmFetchBanners){
        try { const r = await window.skmFetchBanners(); if (r && r.payload && Array.isArray(r.payload.items)) bnData = r.payload; } catch(_){}
      }
      if (!bnData) bnData = { mode:'auto', interval:3, items:[] };
      if (!Array.isArray(bnData.items)) bnData.items = [];
      bnData.mode = (bnData.mode === 'manual') ? 'manual' : 'auto';
      if (!(bnData.interval > 0)) bnData.interval = 5;
      // 전환 방식 라디오
      document.querySelectorAll('input[name="bn-mode"]').forEach(r => {
        r.checked = (r.value === bnData.mode);
        r.addEventListener('change', () => { if (r.checked){ bnData.mode = r.value; updateBnIntervalRow(); } });
      });
      // 간격
      const iv = document.getElementById('bn-interval');
      if (iv){ iv.value = bnData.interval; iv.addEventListener('input', () => { bnData.interval = Math.max(1, Math.min(60, parseInt(iv.value,10)||5)); }); }
      updateBnIntervalRow();
      // 이미지 추가
      const file = document.getElementById('bn-file');
      if (file) file.addEventListener('change', onBannerImage);
      // 저장 (위·아래 버튼 둘 다)
      ['bn-save', 'bn-save-top'].forEach(id => {
        const b = document.getElementById(id);
        if (b) b.addEventListener('click', saveBanners);
      });
    }
    renderBanners();
  }
  function updateBnIntervalRow(){
    const row = document.getElementById('bn-interval-row');
    if (row) row.style.display = (bnData.mode === 'auto') ? '' : 'none';
  }
  function renderBanners(){
    const wrap = document.getElementById('adm-bn-list');
    if (!wrap) return;
    if (!bnData.items.length){
      wrap.innerHTML = '<p class="adm-empty">등록된 배너가 없어요. 아래 ‘배너 이미지 추가’를 눌러 등록하세요.</p>';
    } else {
      wrap.innerHTML = bnData.items.map((it,i) => `
        <div class="adm-bn-row" data-idx="${i}">
          <div class="adm-bn-order">
            <button class="adm-bn-up" data-idx="${i}" type="button" title="위로" ${i===0?'disabled':''}>▲</button>
            <span class="adm-bn-num">${i+1}</span>
            <button class="adm-bn-down" data-idx="${i}" type="button" title="아래로" ${i===bnData.items.length-1?'disabled':''}>▼</button>
          </div>
          <div class="adm-bn-thumb${it.enabled===false?' off':''}"><img src="${escape(it.image)}" alt=""></div>
          <div class="adm-bn-body">
            <label class="adm-bn-check"><input type="checkbox" class="adm-bn-enabled" data-idx="${i}" ${it.enabled!==false?'checked':''}> 이 배너 사용</label>
            <input type="url" class="adm-input adm-bn-link" data-idx="${i}" value="${escape(it.link||'')}" placeholder="클릭 시 이동할 링크 (비우면 클릭 안 됨)">
            <label class="adm-bn-check"><input type="checkbox" class="adm-bn-newtab" data-idx="${i}" ${it.newTab?'checked':''}> 새 창으로 열기</label>
          </div>
          <button class="adm-btn adm-btn-danger adm-bn-del" data-idx="${i}" type="button">삭제</button>
        </div>`).join('');
    }
    wrap.querySelectorAll('.adm-bn-up').forEach(b => b.addEventListener('click', () => moveBanner(Number(b.dataset.idx), -1)));
    wrap.querySelectorAll('.adm-bn-down').forEach(b => b.addEventListener('click', () => moveBanner(Number(b.dataset.idx), 1)));
    wrap.querySelectorAll('.adm-bn-del').forEach(b => b.addEventListener('click', () => {
      if (!confirm('이 배너를 삭제할까요?')) return;
      syncBannersFromDom();
      bnData.items.splice(Number(b.dataset.idx), 1);
      renderBanners();
    }));
  }
  // DOM 입력값(토글/링크)을 bnData 에 반영 (재렌더/저장/이동 전 호출)
  function syncBannersFromDom(){
    document.querySelectorAll('.adm-bn-enabled').forEach(c => { const i=Number(c.dataset.idx); if (bnData.items[i]) bnData.items[i].enabled = c.checked; });
    document.querySelectorAll('.adm-bn-newtab').forEach(c => { const i=Number(c.dataset.idx); if (bnData.items[i]) bnData.items[i].newTab = c.checked; });
    document.querySelectorAll('.adm-bn-link').forEach(c => { const i=Number(c.dataset.idx); if (bnData.items[i]) bnData.items[i].link = c.value.trim(); });
  }
  function moveBanner(i, dir){
    syncBannersFromDom();
    const j = i + dir;
    if (j < 0 || j >= bnData.items.length) return;
    const t = bnData.items[i]; bnData.items[i] = bnData.items[j]; bnData.items[j] = t;
    renderBanners();
  }
  async function onBannerImage(e){
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (bnData.items.length >= BN_MAX){ alert(`배너는 최대 ${BN_MAX}개까지 등록할 수 있어요.`); return; }
    if (!window.skmUploadBannerImage){ alert('업로드 기능을 불러오지 못했어요.'); return; }
    admToast('업로드 중…');
    const { url, error } = await window.skmUploadBannerImage(file);
    if (error){ alert('업로드 실패: ' + (error.message || '권한 또는 네트워크 오류')); return; }
    syncBannersFromDom();
    bnData.items.push({ image: url, link:'', newTab:false, enabled:true });
    renderBanners();
    admToast('배너가 추가됐어요. 저장을 눌러 반영하세요.');
  }
  async function saveBanners(){
    syncBannersFromDom();
    const payload = {
      mode: bnData.mode === 'manual' ? 'manual' : 'auto',
      interval: Math.max(1, Math.min(60, parseInt(bnData.interval,10)||5)),
      items: bnData.items
        .map(it => ({ image: it.image, link:(it.link||'').trim(), newTab: !!it.newTab, enabled: it.enabled !== false }))
        .filter(it => it.image),
    };
    const btns = ['bn-save', 'bn-save-top'].map(id => document.getElementById(id)).filter(Boolean);
    btns.forEach(b => b.disabled = true);
    let error = null;
    if (window.skmSaveBanners){ const r = await window.skmSaveBanners(payload); error = r.error; }
    btns.forEach(b => b.disabled = false);
    if (!error){ bnData = payload; renderBanners(); admToast('저장됐어요. 홈 배너에 반영됩니다.'); }
    else alert('저장 실패: ' + (error.message || '권한 또는 네트워크 오류'));
  }

  /* ─── 카테고리 아이콘 시안 갤러리 (본부 전용) ───────── */
  let iconLabInited = false;
  function initIconLab(){
    const wrap = document.getElementById('adm-iconlab');
    if (!wrap || iconLabInited) return;
    iconLabInited = true;
    const CATS = [
      { key:'water', nm:'정수기', cnt:'9개 상품' },
      { key:'air', nm:'공기청정기', cnt:'9개 상품' },
      { key:'bidet', nm:'비데', cnt:'5개 상품' },
      { key:'mattress', nm:'매트리스', cnt:'3개 상품' },
    ];
    // A — 그라데이션 글래스
    const A = {
      water:`<svg viewBox="0 0 48 48"><defs><linearGradient id="la_awg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#62bdff"/><stop offset="1" stop-color="#2a7dff"/></linearGradient></defs><circle cx="24" cy="24" r="22" fill="url(#la_awg)"/><path d="M24 11.5C19.8 19 15.5 23.2 15.5 28a8.5 8.5 0 0 0 17 0C32.5 23.2 28.2 19 24 11.5Z" fill="#fff"/><path d="M20 29a4.2 4.2 0 0 1 2.2-3.7" stroke="#2a7dff" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".55"/><ellipse cx="28" cy="20" rx="2.4" ry="3.4" fill="#fff" opacity=".45" transform="rotate(28 28 20)"/></svg>`,
      air:`<svg viewBox="0 0 48 48"><defs><linearGradient id="la_aag" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#67e0c0"/><stop offset="1" stop-color="#22b58e"/></linearGradient></defs><circle cx="24" cy="24" r="22" fill="url(#la_aag)"/><rect x="16" y="11" width="16" height="26" rx="4" fill="#fff"/><circle cx="24" cy="19" r="3.4" fill="none" stroke="#22b58e" stroke-width="1.5"/><path d="M19 27h10M19 30h10M19 33h10" stroke="#22b58e" stroke-width="1.4" stroke-linecap="round" opacity=".5"/></svg>`,
      bidet:`<svg viewBox="0 0 48 48"><defs><linearGradient id="la_abg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#b69bff"/><stop offset="1" stop-color="#7c5cf0"/></linearGradient></defs><circle cx="24" cy="24" r="22" fill="url(#la_abg)"/><path d="M14 24q0-4.5 4.5-4.5H29q4.5 0 4.5 4.5v1.5q0 4-4 4H18q-4 0-4-4Z" fill="#fff"/><path d="M31 19.5V16q0-2.5-2.5-2.5H19Q16.5 13.5 16.5 16v3.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><rect x="28.5" y="14.5" width="4.6" height="2.6" rx=".9" fill="#fff" opacity=".7"/></svg>`,
      mattress:`<svg viewBox="0 0 48 48"><defs><linearGradient id="la_amg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffce6e"/><stop offset="1" stop-color="#f0a528"/></linearGradient></defs><circle cx="24" cy="24" r="22" fill="url(#la_amg)"/><rect x="11" y="18.5" width="26" height="12" rx="3.5" fill="#fff"/><path d="M11 24.5h26" stroke="#f0a528" stroke-width="1.4" opacity=".5"/><path d="M17 25l1.6 2.6M24 25l1.6 2.6M31 25l1.6 2.6" stroke="#f0a528" stroke-width="1.3" stroke-linecap="round" opacity=".45"/><path d="M14 30.5v2.5M34 30.5v2.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`,
    };
    // B — 컬러 듀오톤
    const B = {
      water:`<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#e9f3ff"/><path d="M24 12.5C20 19.5 16.2 23.4 16.2 28a7.8 7.8 0 0 0 15.6 0C31.8 23.4 28 19.5 24 12.5Z" fill="#bcdcff"/><path d="M24 12.5C20 19.5 16.2 23.4 16.2 28a7.8 7.8 0 0 0 15.6 0C31.8 23.4 28 19.5 24 12.5Z" fill="none" stroke="#2a7dff" stroke-width="1.8" stroke-linejoin="round"/><path d="M20.5 28.5a3.6 3.6 0 0 1 2-3.2" stroke="#2a7dff" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`,
      air:`<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#e6faf3"/><rect x="16.5" y="12" width="15" height="24" rx="3.6" fill="#c5f0e1"/><rect x="16.5" y="12" width="15" height="24" rx="3.6" fill="none" stroke="#1faa83" stroke-width="1.8"/><circle cx="24" cy="19" r="3.2" fill="#fff" stroke="#1faa83" stroke-width="1.6"/><path d="M20 27.5h8M20 30.5h8" stroke="#1faa83" stroke-width="1.5" stroke-linecap="round"/></svg>`,
      bidet:`<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#f0ebff"/><path d="M14.5 24.5q0-4 4-4H29q4 0 4 4v1.4q0 3.7-3.7 3.7H18.2q-3.7 0-3.7-3.7Z" fill="#ddd2ff"/><path d="M14.5 24.5q0-4 4-4H29q4 0 4 4v1.4q0 3.7-3.7 3.7H18.2q-3.7 0-3.7-3.7Z" fill="none" stroke="#6c4bd8" stroke-width="1.8" stroke-linejoin="round"/><path d="M30.5 20.5V16.5q0-2.4-2.4-2.4h-8.2q-2.4 0-2.4 2.4v4" fill="none" stroke="#6c4bd8" stroke-width="1.8" stroke-linecap="round"/></svg>`,
      mattress:`<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#fff3df"/><rect x="11.5" y="19" width="25" height="11.5" rx="3.2" fill="#ffe3b0"/><rect x="11.5" y="19" width="25" height="11.5" rx="3.2" fill="none" stroke="#e09422" stroke-width="1.8"/><path d="M11.5 24.5h25" stroke="#e09422" stroke-width="1.5"/><path d="M18 25l1.4 2.4M24 25l1.4 2.4M30 25l1.4 2.4" stroke="#e09422" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    };
    // C — 모노 고급
    const C = {
      water:`<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#f4f5f7"/><path d="M24 12.5C20 19.5 16.2 23.4 16.2 28a7.8 7.8 0 0 0 15.6 0C31.8 23.4 28 19.5 24 12.5Z" fill="#2c2f36"/><path d="M20.5 28a3.4 3.4 0 0 1 1.9-3" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".6"/></svg>`,
      air:`<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#f4f5f7"/><rect x="16.5" y="12" width="15" height="24" rx="3.6" fill="#2c2f36"/><circle cx="24" cy="19" r="3.2" fill="none" stroke="#fff" stroke-width="1.5" opacity=".85"/><path d="M20 27.5h8M20 30.5h8" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity=".5"/></svg>`,
      bidet:`<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#f4f5f7"/><path d="M14.5 24.5q0-4 4-4H29q4 0 4 4v1.4q0 3.7-3.7 3.7H18.2q-3.7 0-3.7-3.7Z" fill="#2c2f36"/><path d="M30.5 20.3V16.5q0-2.4-2.4-2.4h-8.2q-2.4 0-2.4 2.4v3.8" fill="none" stroke="#2c2f36" stroke-width="2.2" stroke-linecap="round"/></svg>`,
      mattress:`<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="22" fill="#f4f5f7"/><rect x="11.5" y="19" width="25" height="11.5" rx="3.2" fill="#2c2f36"/><path d="M11.5 24.5h25" stroke="#fff" stroke-width="1.3" opacity=".4"/><path d="M18 25l1.4 2.4M24 25l1.4 2.4M30 25l1.4 2.4" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity=".35"/></svg>`,
    };
    // D — 정교 라인 (배경 회색 원)
    const D = {
      water:`<svg viewBox="0 0 48 48" fill="none" stroke="#3a3d44" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M24 11C19 19 14.5 23.5 14.5 28.5a9.5 9.5 0 0 0 19 0C33.5 23.5 29 19 24 11Z"/><path d="M19.5 29a4.6 4.6 0 0 1 2.5-4.1" opacity=".5"/></svg>`,
      air:`<svg viewBox="0 0 48 48" fill="none" stroke="#3a3d44" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="15" y="9" width="18" height="30" rx="4.5"/><circle cx="24" cy="18" r="4"/><path d="M24 16.2v3.6M22.2 18h3.6" opacity=".55"/><path d="M18.5 27h11M18.5 30.5h11M18.5 34h11" opacity=".4"/></svg>`,
      bidet:`<svg viewBox="0 0 48 48" fill="none" stroke="#3a3d44" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 25q0-5 5-5h12q5 0 5 5v2q0 4.5-4.5 4.5h-13Q13 31.5 13 27Z"/><path d="M31 20v-4q0-3-3-3H20q-3 0-3 3v4"/><rect x="29" y="13.5" width="5" height="3" rx="1" opacity=".55"/></svg>`,
      mattress:`<svg viewBox="0 0 48 48" fill="none" stroke="#3a3d44" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="17" width="30" height="14" rx="4"/><path d="M9 23h30" opacity=".5"/><path d="M16 24l2 3M24 24l2 3M32 24l2 3" opacity=".4"/><path d="M13 31v3.5M35 31v3.5" opacity=".6"/></svg>`,
    };
    const STYLES = [
      { name:'A · 그라데이션 글래스', desc:'카테고리별 컬러 원 + 화이트 실루엣 + 광택. 화사하고 모던.', bg:'bg-none', icons:A },
      { name:'B · 컬러 듀오톤', desc:'연한 배경 원 + 카테고리 컬러 제품(면+라인). 정돈되고 깔끔.', bg:'bg-none', icons:B },
      { name:'C · 모노 고급', desc:'톤온톤 단색 실루엣. 차분하고 고급스러운 무채색.', bg:'bg-none', icons:C },
      { name:'D · 정교 라인', desc:'가는 모노라인 + 디테일. 현재 톤 유지하며 정밀하게.', bg:'bg-plain', icons:D },
    ];
    wrap.innerHTML = STYLES.map(s => `
      <div class="adm-iconlab-style">
        <h3>${escape(s.name)}</h3>
        <div class="desc">${escape(s.desc)}</div>
        <div class="adm-iconlab-row">
          ${CATS.map(c => `<div class="adm-iconlab-item"><div class="adm-iconlab-ic ${s.bg}">${s.icons[c.key]}</div><div><div class="adm-iconlab-nm">${escape(c.nm)}</div><div class="adm-iconlab-cnt">${escape(c.cnt)}</div></div></div>`).join('')}
        </div>
      </div>`).join('');
  }

  /* ─── 카드할인금액 (상품별 제휴카드 할인) ───────────
     기본요금/타사보상에 카드할인(빼는 금액) 입력 → 노출금액 자동계산.
     저장: card_benefits.payload.discounts[gid]={sale,compete} (본부 공통).
     엑셀 다운/업로드로 일괄 적용 + 페이지 개별 수정 둘 다 지원. */
  const cdNum = s => parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0;
  let cdDiscounts = {};   // { gid: {sale, compete} } — 편집 중 상태
  let cdInited = false;
  const cdFilter = { cat: '', q: '' };   // 카드할인 전용 필터(상품관리와 별개)
  function cdBaseList(){ return state.products.filter(p => !state.overrides.hidden[p.goodsId]); }
  async function initCardDiscount(){
    await ensureCommissionData();   // 가격(정책)이 있어야 기본요금/타사보상 표시
    if (!cdInited){
      cdInited = true;
      if (window.skmFetchCardBenefits){
        try { const r = await window.skmFetchCardBenefits(); if (r && r.payload && r.payload.discounts) cdDiscounts = r.payload.discounts; } catch(_){}
      }
      const sv = document.getElementById('cd-save'); if (sv) sv.addEventListener('click', saveCardDiscounts);
      const dl = document.getElementById('cd-download'); if (dl) dl.addEventListener('click', downloadCardDiscountXlsx);
      bindCdUpload();
      const sr = document.getElementById('cd-search'); if (sr) sr.addEventListener('input', () => { cdFilter.q = sr.value; renderCardDiscount(); });
    }
    renderCdChips();
    renderCardDiscount();
  }
  function renderCdChips(){
    const wrap = document.getElementById('cd-cat-chips');
    if (!wrap) return;
    const base = cdBaseList();
    const counts = {};
    base.forEach(p => { const c = primaryCat(p); counts[c] = (counts[c] || 0) + 1; });
    const cats = [['', '전체', base.length], ...Object.entries(CATEGORY_META).map(([k, v]) => [k, v.label, counts[k] || 0])];
    wrap.innerHTML = cats.map(([k, label, cnt]) =>
      `<button class="adm-chip ${cdFilter.cat === k ? 'on' : ''}" data-cd-cat="${escape(k)}">${escape(label)} <span class="chip-cnt">${cnt}</span></button>`
    ).join('');
    wrap.querySelectorAll('[data-cd-cat]').forEach(b => b.addEventListener('click', () => {
      cdFilter.cat = b.dataset.cdCat; renderCdChips(); renderCardDiscount();
    }));
  }
  function cdVisibleList(){
    let list = cdBaseList();
    if (cdFilter.cat) list = list.filter(p => (p.categories || []).includes(cdFilter.cat));
    const q = (cdFilter.q || '').trim().toLowerCase();
    if (q) list = list.filter(p => (p.name || '').toLowerCase().includes(q) || modelCode(p).toLowerCase().includes(q) || (p.goodsId || '').toLowerCase().includes(q));
    // 카테고리 순 정렬 (상품관리 전체보기와 동일: 정수기→공청→비데→매트리스, 신상품 최상단)
    const CAT_KEYS = Object.keys(CATEGORY_META);
    const raw = new Map(list.map((p, i) => [p.goodsId, i]));
    const catRank = p => { const i = CAT_KEYS.indexOf(primaryCat(p)); return i < 0 ? 99 : i; };
    const orderMaps = {};
    CAT_KEYS.forEach(c => { orderMaps[c] = new Map((state.overrides.order[c] || []).map((id, i) => [id, i])); });
    list.sort((a, b) => {
      const ra = catRank(a), rb = catRank(b);
      if (ra !== rb) return ra - rb;
      const m = orderMaps[primaryCat(a)] || new Map();
      const ia = m.has(a.goodsId) ? m.get(a.goodsId) : -1, ib = m.has(b.goodsId) ? m.get(b.goodsId) : -1;
      if (ia !== ib) return ia - ib;
      return raw.get(a.goodsId) - raw.get(b.goodsId);
    });
    return list;
  }
  function cdResultHTML(base, disc){
    const b = cdNum(base), d = cdNum(disc);
    return (d > 0 && b > 0) ? `<strong>${Math.max(0, b - d).toLocaleString('ko-KR')}</strong>` : '<span class="price-empty">—</span>';
  }
  function renderCardDiscount(){
    const tbody = document.getElementById('carddiscount-tbody');
    if (!tbody) return;
    const list = cdVisibleList();
    const cntEl = document.getElementById('cd-count');
    if (cntEl) cntEl.innerHTML = `<strong>${list.length}</strong>개 표시 / 전체 ${cdBaseList().length}개`;
    if (!list.length){ tbody.innerHTML = `<tr><td colspan="8" class="adm-empty">조건에 맞는 상품이 없어요.</td></tr>`; return; }
    const cell = (v) => v ? `<strong>${escape(v)}</strong>` : '<span class="price-empty">—</span>';
    const inputCell = (gid, type, base, val) => `<input type="text" class="adm-input cd-input" data-type="${type}" data-gid="${escape(gid)}" data-base="${escape(base || '')}" value="${val ? escape(String(val)) : ''}" placeholder="0"${base ? '' : ' disabled'}>`;
    tbody.innerHTML = list.map(rawP => {
      const p = effective(rawP);
      const gid = p.goodsId;
      const prices = effectivePrices(p);
      const cat = CATEGORY_META[primaryCat(p)]?.label || '—';
      const d = cdDiscounts[gid] || {};
      return `<tr data-gid="${escape(gid)}">
        <td class="col-cat"><span class="cat-tag">${escape(cat)}</span></td>
        <td class="col-name"><span class="nm">${escape(p.name || '')}</span></td>
        <td class="col-price">${cell(prices.sale)}</td>
        <td class="col-price">${inputCell(gid, 'sale', prices.sale, d.sale)}</td>
        <td class="col-price cd-result" data-type="sale" data-gid="${escape(gid)}">${cdResultHTML(prices.sale, d.sale)}</td>
        <td class="col-price col-cd-sep">${cell(prices.compete)}</td>
        <td class="col-price">${inputCell(gid, 'compete', prices.compete, d.compete)}</td>
        <td class="col-price cd-result" data-type="compete" data-gid="${escape(gid)}">${cdResultHTML(prices.compete, d.compete)}</td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('.cd-input').forEach(inp => inp.addEventListener('input', onCardDiscountInput));
  }
  function onCardDiscountInput(e){
    const inp = e.target;
    const gid = inp.dataset.gid, type = inp.dataset.type;
    const disc = cdNum(inp.value);
    // 상태 반영
    if (!cdDiscounts[gid]) cdDiscounts[gid] = {};
    if (disc > 0) cdDiscounts[gid][type] = disc; else delete cdDiscounts[gid][type];
    if (!Object.keys(cdDiscounts[gid]).length) delete cdDiscounts[gid];
    // 노출금액 갱신
    const result = document.querySelector(`.cd-result[data-type="${type}"][data-gid="${gid}"]`);
    if (result) result.innerHTML = cdResultHTML(inp.dataset.base, inp.value);
  }
  // 빈 항목 정리한 깨끗한 discounts 맵
  function cdClean(){
    const clean = {};
    Object.keys(cdDiscounts).forEach(gid => {
      const d = cdDiscounts[gid] || {}; const o = {};
      if (cdNum(d.sale) > 0) o.sale = cdNum(d.sale);
      if (cdNum(d.compete) > 0) o.compete = cdNum(d.compete);
      if (Object.keys(o).length) clean[gid] = o;
    });
    return clean;
  }
  async function saveCardDiscounts(){
    const clean = cdClean();
    const btn = document.getElementById('cd-save');
    if (btn) btn.disabled = true;
    let error = null;
    if (window.skmSaveCardDiscounts){ const r = await window.skmSaveCardDiscounts(clean); error = r.error; }
    if (btn) btn.disabled = false;
    if (!error){ cdDiscounts = clean; admToast('저장됐어요. 공개 사이트에 반영됩니다.'); }
    else alert('저장 실패: ' + (error.message || '권한 또는 네트워크 오류'));
  }
  function downloadCardDiscountXlsx(){
    if (typeof XLSX === 'undefined'){ alert('엑셀 기능을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.'); return; }
    const list = cdVisibleList();
    const header = ['카테고리', '상품명', '모델코드', 'goodsId', '기본요금', '카드할인(기본요금)', '타사보상', '카드할인(타사보상)'];
    const rows = list.map(rawP => {
      const p = effective(rawP);
      const gid = p.goodsId;
      const prices = effectivePrices(p);
      const cat = CATEGORY_META[primaryCat(p)]?.label || '';
      const d = cdDiscounts[gid] || {};
      return [cat, p.name || '', modelCode(p), gid, cdNum(prices.sale) || '', d.sale || '', cdNum(prices.compete) || '', d.compete || ''];
    });
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '카드할인금액');
    XLSX.writeFile(wb, '카드할인금액.xlsx');
  }
  let cdUploadBound = false;
  function bindCdUpload(){
    if (cdUploadBound) return;
    const zone = document.getElementById('cd-upload');
    const input = document.getElementById('cd-file');
    if (!zone || !input) return;
    cdUploadBound = true;
    input.addEventListener('change', e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (f) processCdFile(f); });
    zone.addEventListener('click', () => input.click());
    ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.remove('drag'); }));
    zone.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) processCdFile(f); });
  }
  async function processCdFile(file){
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)){ alert('xlsx 파일만 올릴 수 있어요.'); return; }
    if (typeof XLSX === 'undefined'){ alert('엑셀 파서를 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.'); return; }
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      const head = (rows[0] || []).map(h => String(h || ''));
      const gidCol = head.findIndex(h => /goodsId/i.test(h));
      const saleCol = head.findIndex(h => /카드할인.*기본/.test(h));
      const compCol = head.findIndex(h => /카드할인.*타사/.test(h));
      if (gidCol < 0 || (saleCol < 0 && compCol < 0)){
        alert('엑셀 형식을 확인해 주세요.\n다운로드한 양식(goodsId · 카드할인 컬럼)을 채워서 올려 주세요.');
        return;
      }
      let applied = 0;
      for (let i = 1; i < rows.length; i++){
        const row = rows[i]; if (!row) continue;
        const gid = String(row[gidCol] || '').trim(); if (!gid) continue;
        const o = cdDiscounts[gid] ? Object.assign({}, cdDiscounts[gid]) : {};
        if (saleCol >= 0){ const v = cdNum(row[saleCol]); if (v > 0) o.sale = v; else delete o.sale; }
        if (compCol >= 0){ const v = cdNum(row[compCol]); if (v > 0) o.compete = v; else delete o.compete; }
        if (Object.keys(o).length) cdDiscounts[gid] = o; else delete cdDiscounts[gid];
        applied++;
      }
      renderCardDiscount();
      admToast(`${applied}개 행 적용됐어요. 저장을 눌러 반영하세요.`);
    } catch(err){
      alert('엑셀 읽기 실패: ' + (err && err.message ? err.message : err));
    }
  }

  async function initCommission(){
    bindComUpload();
    const tbody = document.getElementById('commission-tbody');
    if (!comInited){
      comInited = true;
      const search = document.getElementById('com-search');
      if (search) search.addEventListener('input', () => { comState.q = search.value.trim(); renderComTable(); });
      const dl = document.getElementById('com-download');
      if (dl) dl.addEventListener('click', downloadCommissionXlsx);
      // Supabase 에 저장된 최신 수수료표 (init 에서 이미 로드됐으면 재사용)
      await ensureCommissionData();
    }
    const db = comDB();
    if (!db){
      if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="adm-empty">수수료 데이터가 없어요. 헤더의 업로드 영역에 엑셀(.xlsx)을 올려 주세요.</td></tr>`;
      return;
    }
    updateComSourceHint();
    renderComCatChips();
    renderComFormChips();
    renderComTable();
  }

  function updateComSourceHint(){
    const hint = document.getElementById('com-source-hint');
    const db = comDB();
    if (!hint || !db) return;
    const models = new Set(db.rows.map(r=>r.모델)).size;
    const when = db.built_at ? ` · 갱신 ${escape(db.built_at)}` : '';
    hint.innerHTML = `기준: <strong>${escape(db.source || '')}</strong>${when} · 홈페이지 등록 모델 ${models}종 · 색상은 묶어서 표시(요금·수수료 동일)`;
  }

  /* ─── 엑셀 업로드 (드래그앤드랍 / 클릭) ───────────── */
  function bindComUpload(){
    if (comUploadBound) return;
    const zone = document.getElementById('com-upload');
    const input = document.getElementById('com-file');
    if (!zone || !input) return;
    comUploadBound = true;
    zone.addEventListener('click', (e) => {
      if (e.target.closest('.com-upload-status')) return;
      input.click();
    });
    input.addEventListener('change', () => {
      if (input.files && input.files[0]) handleCommissionFile(input.files[0]);
      input.value = '';
    });
    ['dragenter','dragover'].forEach(ev => zone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation(); zone.classList.add('drag');
    }));
    ['dragleave','dragend'].forEach(ev => zone.addEventListener(ev, (e) => {
      e.preventDefault(); e.stopPropagation(); zone.classList.remove('drag');
    }));
    zone.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation(); zone.classList.remove('drag');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleCommissionFile(f);
    });
  }

  function setComUploadStatus(msg, kind){
    const el = document.getElementById('com-upload-status');
    if (!el) return;
    el.hidden = !msg;
    el.textContent = msg || '';
    el.className = 'com-upload-status' + (kind ? ' ' + kind : '');
  }

  async function handleCommissionFile(file){
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)){
      setComUploadStatus('xlsx 파일만 올릴 수 있어요.', 'err');
      return;
    }
    setComUploadStatus('파일 분석 중…', '');
    try {
      if (typeof XLSX === 'undefined') throw new Error('엑셀 파서(XLSX)가 로드되지 않았어요. 새로고침 후 다시 시도해 줘.');
      const buf = await file.arrayBuffer();
      const payload = parseCommissionWorkbook(buf, file.name);
      if (!payload.rows.length) throw new Error('홈페이지 등록 모델과 매칭되는 행이 없어요. 수수료표 양식을 확인해 줘.');
      const models = new Set(payload.rows.map(r=>r.모델)).size;
      setComUploadStatus(`분석 완료 — ${payload.rows.length}행 / ${models}종. 저장 중…`, '');
      if (window.skmSaveCommission){
        const { error } = await window.skmSaveCommission(payload);
        if (error){
          setComUploadStatus('저장 실패: ' + (error.message || '권한 또는 네트워크 오류'), 'err');
          return;
        }
      }
      comData = payload;
      updateComSourceHint();
      renderComCatChips();
      renderComFormChips();
      renderComTable();
      setComUploadStatus(`완료 — ${payload.rows.length}행 / ${models}종 갱신됐어요.`, 'ok');
    } catch(err){
      setComUploadStatus('실패: ' + (err.message || err), 'err');
    }
  }

  /* ─── 매트리스 사이즈 헬퍼 ─────────────────────────────
     매트리스 제품코드 4번째 글자 = 사이즈(S/Q/K). 가격이 사이즈마다 달라
     색상처럼 묶으면 안 됨. 단, 홈페이지엔 한 사이즈만 등록돼 있어 매칭은
     사이즈를 뺀 베이스로 해야 모든 사이즈가 같은 모델로 인식된다. */
  const MAT_SIZE = { S: 'SS', Q: 'Q', K: 'K' };
  function comSize(code){
    const s = String(code || '');
    return /^MAT[SQK]/.test(s) ? (MAT_SIZE[s[3]] || s[3]) : '';
  }
  function comBaseCode(code){  // 사이즈 글자 제거 → 사이즈 무관 매칭용
    const s = String(code || '');
    return /^MAT[SQK]/.test(s) ? s.slice(0, 3) + s.slice(4) : s;
  }

  /* ─── 반값할인 개월수 — 26.6월 프로모션 정책표 기준 (공개 사이트 app.js와 동일) ──
     ① 기본요금 반값(comHalfMonths):
        정수기 5년=6 / 6·7년: 원코크·메가 계열 방문18·셀프15, 초소형 계열·투워터 12
        공청 올클린(디아트 제외) 5·6·7년 6 / 비데 올클린케어 5년만 6
     ② 타사보상 반값(comCompeteHalfMonths): 별첨 기준 의무 5년 이상 3개월 (변경 없음) */
  function comHalfMonths(r){
    const m = String(r.모델 || '');
    const dur = r.의무;
    const self = /셀프/.test(r.형태 || '');
    if (r.품목 === '정수기'){
      const wonMega = /원코크|메가|MEGA/i.test(m);
      const choso = /초소형|투워터/.test(m);
      if (!wonMega && !choso) return 0;               // 정책표에 없는 계열(스탠드/탱크형 등)
      if (dur < 60) return 0;
      if (dur === 60) return 6;                       // 5년
      return wonMega ? (self ? 15 : 18) : 12;         // 6·7년
    }
    if (r.품목 === '공기청정기'){
      if (/올클린/.test(m) && !/디아트/.test(m)) return dur >= 60 ? 6 : 0;
      return 0;
    }
    if (r.품목 === '비데'){
      if (/올클린케어/.test(m)) return dur === 60 ? 6 : 0;        // 비데 5년 한정
      return 0;
    }
    return 0;
  }
  function comCompeteHalfMonths(r){
    if (r.타사보상 == null) return 0;        // 타사보상 없는 모델은 대상 아님
    return (r.의무 >= 60) ? 3 : 0;            // 별첨 타사보상 반값: 의무 5년 이상 3개월
  }

  /* build_data.js 의 파싱 로직을 브라우저(SheetJS)로 포팅.
     색상 묶음 + 방문/셀프 분리 + 의무기간별 행 + 홈페이지 모델만. */
  function parseCommissionWorkbook(buf, fileName){
    const wb = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames.find(n => /수수료/.test(n)) || wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    if (!ws || !ws['!ref']) throw new Error('시트를 읽을 수 없어요.');
    const range = XLSX.utils.decode_range(ws['!ref']);

    // 셀 값을 grid[row][col] (둘 다 0-index) 에 적재
    const grid = {};
    for (let r = range.s.r; r <= range.e.r; r++){
      for (let c = range.s.c; c <= range.e.c; c++){
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.v != null && cell.v !== ''){
          (grid[r] || (grid[r] = {}))[c] = cell.v;
        }
      }
    }
    // 병합 셀: 좌상단 값을 전체 범위로 전파
    (ws['!merges'] || []).forEach(mg => {
      const v = grid[mg.s.r] && grid[mg.s.r][mg.s.c];
      if (v === undefined) return;
      for (let r = mg.s.r; r <= mg.e.r; r++){
        if (!grid[r]) grid[r] = {};
        for (let c = mg.s.c; c <= mg.e.c; c++){
          if (grid[r][c] === undefined) grid[r][c] = v;
        }
      }
    });

    const g = (r, c) => { const v = grid[r] && grid[r][c]; return v === undefined ? '' : String(v); };
    const num = (s) => { s = String(s).replace(/[, ]/g, ''); return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null; };
    const form = (e) => /셀프형/.test(e) ? '셀프형' : '방문형';

    // 컬럼(0-index): B=1 품목, C=2 모델, D=3 코드, E=4 컬러/형태, F=5 의무,
    //   H=7 관리주기, I=8 기준가, J=9 운영가/기본할인, K=10 전사할인, L=11 타사보상, R=17 수수료합계
    const CB=1, CC=2, CD=3, CE=4, CF=5, CH=7, CI=8, CJ=9, CK=10, CL=11, CR=17;
    const rows = [];
    let lastB = '';
    for (let r = 12; r <= range.e.r; r++){ // 엑셀 13행부터 데이터
      const b=g(r,CB), c=g(r,CC), d=g(r,CD), e=g(r,CE), f=g(r,CF), h=g(r,CH), i=g(r,CI), j=g(r,CJ), k=g(r,CK), l=g(r,CL), R=g(r,CR);
      if (!c && !d) continue;
      const 의무 = num(f), 기준가 = num(i), 합계 = num(R);
      if (의무 === null && 기준가 === null && 합계 === null) continue;
      const 품목 = b || lastB;
      if (b) lastB = b;
      const 전사 = num(k), 운영 = num(j);
      // 전사할인이 양수면 그 값, 없거나 0("-" 회계서식)이면 운영가(기본할인) 사용
      const 기본요금 = (전사 !== null && 전사 > 0) ? 전사 : 운영;
      rows.push({
        품목: 품목.replace('메트리스', '매트리스'),
        모델: c.replace(/\s+/g, ' ').trim(),
        코드: d,
        사이즈: comSize(d),
        형태: form(e),
        의무: 의무,
        관리주기: h,
        기준가: 기준가,
        기본요금: 기본요금,
        타사보상: num(l),
        수수료합계: 합계,
      });
    }

    // 홈페이지 등록 모델만 (제품코드 앞 9자리 기준)
    const MAIN = ['100000005','100000010','100000024','100000245','1000000245'];
    const products = (window.PRODUCTS_DB && window.PRODUCTS_DB.products) || [];
    const homeBase = new Set(products
      .filter(p => p.model && p.categories && p.categories.some(cat => MAIN.includes(cat)))
      .map(p => comBaseCode(p.model).slice(0, 9)));
    const onHome = (code) => code && homeBase.has(comBaseCode(code).slice(0, 9));

    // 색상 묶음: 품목|모델|형태|의무(+매트리스는 사이즈) 1행만
    const seen = {}, out = [];
    for (const x of rows){
      if (!onHome(x.코드)) continue;
      const key = x.품목 + '|' + x.모델 + '|' + x.형태 + '|' + x.의무 + '|' + (x.사이즈 || '');
      if (seen[key]) continue;
      seen[key] = 1;
      out.push(x);
    }
    const 품목순 = [...new Set(out.map(x => x.품목))];
    return {
      source: (fileName || '').replace(/\.xlsx$/i, '') || '수수료표 업로드',
      built_at: new Date().toISOString().slice(0, 10),
      품목순,
      rows: out,
    };
  }

  function comChipHTML(val, label, cnt, active, attr){
    return `<button class="adm-chip ${active ? 'on':''}" data-${attr}="${escape(val)}">${escape(label)}${cnt!=null?` <span class="chip-cnt">${cnt}</span>`:''}</button>`;
  }
  function renderComCatChips(){
    const wrap = document.getElementById('com-cat-chips');
    const db = comDB(); if (!wrap || !db) return;
    const counts = {};
    db.rows.forEach(r => { counts[r.품목] = (counts[r.품목]||0)+1; });
    const chips = [comChipHTML('all','전체',db.rows.length,comState.cat==='all','cat')];
    db.품목순.filter(c=>counts[c]).forEach(c => chips.push(comChipHTML(c,c,counts[c],comState.cat===c,'cat')));
    wrap.innerHTML = chips.join('');
    wrap.querySelectorAll('.adm-chip').forEach(el => el.addEventListener('click', () => {
      comState.cat = el.dataset.cat; renderComCatChips(); renderComTable();
    }));
  }
  function renderComFormChips(){
    const wrap = document.getElementById('com-form-chips');
    if (!wrap) return;
    const forms = [['all','전체'],['방문형','방문형'],['셀프형','셀프형']];
    wrap.innerHTML = forms.map(([v,l]) => comChipHTML(v,l,null,comState.form===v,'form')).join('');
    wrap.querySelectorAll('.adm-chip').forEach(el => el.addEventListener('click', () => {
      comState.form = el.dataset.form; renderComFormChips(); renderComTable();
    }));
  }
  function comFiltered(){
    const db = comDB(); if (!db) return [];
    const q = comState.q.toLowerCase();
    return db.rows.filter(r => {
      if (comState.cat !== 'all' && r.품목 !== comState.cat) return false;
      if (comState.form !== 'all' && r.형태 !== comState.form) return false;
      if (q){
        const d = comDisplay(r);
        if (!(`${d.name} ${d.code} ${r.모델} ${r.코드||''}`.toLowerCase().includes(q))) return false;
      }
      return true;
    });
  }
  function renderComTable(){
    const tbody = document.getElementById('commission-tbody');
    const cntEl = document.getElementById('com-count');
    const db = comDB(); if (!tbody || !db) return;
    const list = comFiltered();
    if (cntEl) cntEl.innerHTML = `<strong>${list.length}</strong>행 표시 / 전체 ${db.rows.length}행`;
    if (!list.length){
      tbody.innerHTML = `<tr><td colspan="12" class="adm-empty">조건에 맞는 항목이 없어요.</td></tr>`;
      return;
    }
    let prevKey = null;
    tbody.innerHTML = list.map(r => {
      const { name, code } = comDisplay(r);
      const key = code || name;
      const newModel = (key !== prevKey);
      prevKey = key;
      return `<tr class="${newModel ? 'com-model-start':''}">
        <td>${escape(r.품목)}</td>
        <td class="col-com-model">${escape(name)}</td>
        <td class="col-com-code">${code ? escape(code) : '<span class="price-empty">—</span>'}</td>
        <td><span class="com-form com-form-${r.형태==='셀프형'?'self':'visit'}">${escape(r.형태)}</span></td>
        <td class="col-com-num">${r.의무!=null?escape(r.의무)+'개월':'<span class="price-empty">—</span>'}</td>
        <td>${escape(r.관리주기||'—')}</td>
        <td class="col-com-num">${comFmt(r.기준가)}</td>
        <td class="col-com-num com-num-strong">${comFmt(r.기본요금)}</td>
        ${(() => {
          const mo = comHalfMonths(r);
          const half = (mo && r.기본요금 != null) ? comFmt(Math.round(r.기본요금/2)) : '<span class="price-empty">—</span>';
          return `<td class="col-com-half">${half}</td><td class="col-com-half">${mo ? mo+'개월' : '<span class="price-empty">—</span>'}</td>`;
        })()}
        <td class="col-com-num com-num-strong">${comFmt(r.타사보상)}</td>
        ${(() => {
          const mo = comCompeteHalfMonths(r);
          const half = (mo && r.타사보상 != null) ? comFmt(Math.round(r.타사보상/2)) : '<span class="price-empty">—</span>';
          return `<td class="col-com-half">${half}</td><td class="col-com-half">${mo ? mo+'개월' : '<span class="price-empty">—</span>'}</td>`;
        })()}
        <td class="col-com-num">${r.수수료합계!=null ? comFmt(Math.round(r.수수료합계/1.1)) : '<span class="price-empty">—</span>'}</td>
        <td class="col-com-num com-fee">${comFmt(r.수수료합계)}</td>
      </tr>`;
    }).join('');
  }

  /* 모델 문자열을 이름 + 제품코드요약으로 분리.
     예: "초소형플러스 WPUJAC115S" → {name:"초소형플러스", code:"WPUJAC115S"}
         "위커힐 스탠다드(MAT-730)" → {name:"위커힐 스탠다드", code:"MAT-730"}
         "MAT*M430R" (이름 없는 순수 코드) → {name:"MAT*M430R", code:""} */
  function comSplitModel(model){
    const m = String(model || '').trim();
    if (!m) return { name: '', code: '' };
    // 1) 끝에 괄호로 코드: "위커힐 스탠다드(MAT-730)"
    const paren = m.match(/^(.+?)\s*\(([A-Za-z0-9][A-Za-z0-9*\-]*)\)$/);
    if (paren) return { name: paren[1].trim(), code: paren[2] };
    // 2) 이름 + 마지막 토큰이 코드형(영문/숫자/-/*, 숫자 1개 이상)
    const parts = m.split(/\s+/);
    const last = parts[parts.length - 1];
    if (parts.length > 1 && /\d/.test(last) && /^[A-Z0-9][A-Z0-9*\-]*$/.test(last)){
      return { name: parts.slice(0, -1).join(' '), code: last };
    }
    // 3) 분리 불가(순수 코드 등) — 전체를 모델명으로
    return { name: m, code: '' };
  }

  /* 수수료표 행을 홈페이지(PRODUCTS_DB) 기준으로 매칭.
     제품코드 앞 10자리(=베이스+등급 S/P)로 lookup → 홈페이지 제품명·모델코드 사용.
     이렇게 해야 정책표 표기("스탠드형직수얼음")가 아니라 홈페이지 표기
     ("FS직수 얼음 정수기 프리스탠딩")로 보이고, PSG 콜라보(…P)도 분리된다. */
  let _comHomeMap = null;
  function comHomeMap(){
    if (_comHomeMap) return _comHomeMap;
    const m = {};
    const prods = (window.PRODUCTS_DB && window.PRODUCTS_DB.products) || [];
    prods.forEach(p => {
      if (!p.model) return;
      const b = comBaseCode(p.model).slice(0, 10);
      if (!m[b]) m[b] = { name: p.name, model: p.model, tag: p.tag };
    });
    _comHomeMap = m;
    return m;
  }
  function comHomeMatch(code){
    if (!code) return null;
    return comHomeMap()[comBaseCode(code).slice(0, 10)] || null;
  }
  /* 표시용 모델명/제품코드 — 홈페이지 매칭 우선, 실패 시 정책표 파싱값.
     매트리스는 사이즈(SS/Q/K)를 모델명 뒤에 붙이고 제품코드는 사이즈별 실제 코드 사용. */
  function comDisplay(r){
    const sz = r.사이즈 ? ` (${r.사이즈})` : '';
    const home = comHomeMatch(r.코드);
    if (home) return { name: home.name + sz, code: r.사이즈 ? (r.코드 || home.model) : home.model };
    const { name } = comSplitModel(r.모델);
    return { name: name + sz, code: r.코드 || '' };
  }

  /* 현재 필터된 행을 엑셀(.xlsx)로 다운로드 (SheetJS). */
  function downloadCommissionXlsx(){
    const db = comDB();
    if (!db || typeof XLSX === 'undefined') return;
    const list = comFiltered();
    if (!list.length) return;
    const aoa = [['품목','모델','제품코드','형태','의무기간','관리주기','기준가','기본요금','타사보상','수수료합계']];
    list.forEach(r => {
      const { name, code } = comDisplay(r);
      aoa.push([
        r.품목, name, code, r.형태,
        r.의무 != null ? r.의무 + '개월' : '',
        r.관리주기 || '',
        r.기준가, r.기본요금, r.타사보상, r.수수료합계,
      ]);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{wch:8},{wch:22},{wch:16},{wch:8},{wch:10},{wch:10},{wch:10},{wch:10},{wch:10},{wch:12}];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '수수료표');
    const tag = (db.built_at || new Date().toISOString().slice(0,10));
    XLSX.writeFile(wb, `수수료표_${tag}.xlsx`);
  }

  /* ─── 기본 정보(매장) 폼 ───────────────────────── */
  const STORE_FIELDS = {
    'store-name':      'name',
    'store-owner':     'biz_owner',
    'store-bizno':     'biz_no',
    'store-mailorder': 'mail_order_no',
    'store-address':   'address',
    'store-phone':     'phone',
    'store-email':     'email',
    'store-hours':     'biz_hours',
    'store-kakao':     'kakao_url',
  };
  function populateStoreForm(){
    const s = state.store || {};
    for (const [id, key] of Object.entries(STORE_FIELDS)){
      const el = document.getElementById(id);
      if (el) el.value = s[key] || '';
    }
    setStoreStatus('', '');
    const btn = document.getElementById('store-save');
    if (btn) btn.disabled = !(state.store?.id && window.skmUpdateStore);
    if (btn && btn.disabled) setStoreStatus('매장이 지정되지 않아 저장할 수 없어요.', 'err');
  }
  function setStoreStatus(msg, kind){
    const el = document.getElementById('store-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'adm-store-status' + (kind ? ' ' + kind : '');
  }
  async function saveStoreInfo(){
    if (!state.store?.id || !window.skmUpdateStore){
      setStoreStatus('매장이 지정되지 않아 저장할 수 없어요.', 'err');
      return;
    }
    const patch = {};
    for (const [id, key] of Object.entries(STORE_FIELDS)){
      const v = (document.getElementById(id)?.value || '').trim();
      patch[key] = v || null;
    }
    const btn = document.getElementById('store-save');
    if (btn) btn.disabled = true;
    setStoreStatus('저장 중…', '');
    const { data, error } = await window.skmUpdateStore(state.store.id, patch);
    if (btn) btn.disabled = false;
    if (error){
      setStoreStatus('저장 실패: ' + (error.message || '권한 또는 네트워크 오류'), 'err');
      return;
    }
    state.store = data ? { ...state.store, ...data } : { ...state.store, ...patch };
    setStoreStatus('저장됐어요. 사이트에 바로 반영됩니다.', 'ok');
    toast('기본 정보 저장 완료');
  }
  function bindStoreForm(){
    const btn = document.getElementById('store-save');
    if (btn) btn.addEventListener('click', saveStoreInfo);
  }

  /* ─── Toast ─────────────────────────────────────── */
  let _toastTimer = null;
  function toast(msg){
    const el = document.getElementById('adm-toast');
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  /* ─── 검색 input debounce ───────────────────────── */
  let _searchTimer = null;
  function bindSearch(){
    const input = document.getElementById('search-input');
    input.addEventListener('input', () => {
      if (_searchTimer) clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => {
        state.filterSearch = input.value;
        renderTable();
      }, 150);
    });
  }
  function bindFilterToggles(){
    document.getElementById('filter-hidden').addEventListener('change', (e) => {
      state.filterShowHidden = e.target.checked;
      renderTable();
    });
    document.getElementById('filter-featured').addEventListener('change', (e) => {
      state.filterFeaturedOnly = e.target.checked;
      renderTable();
    });
  }

  function bindHeader(){
    document.getElementById('btn-save')?.addEventListener('click', onSave);
    document.getElementById('btn-reset')?.addEventListener('click', onReset);
    const btnOut = document.getElementById('btn-signout');
    if (btnOut) btnOut.addEventListener('click', () => {
      if (confirm('로그아웃하시겠어요?')) signOut();
    });

    // 편집 모달
    document.getElementById('edit-close').addEventListener('click', closeEditModal);
    document.getElementById('edit-cancel').addEventListener('click', closeEditModal);
    document.getElementById('edit-save').addEventListener('click', saveEditModal);
    document.getElementById('edit-revert').addEventListener('click', revertEditModal);
    // ESC 닫기
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape'){
        if (!document.getElementById('edit-modal').hidden) closeEditModal();
      }
    });

    // 페이지 떠나기 전 경고
    window.addEventListener('beforeunload', (e) => {
      if (state.dirty){
        e.preventDefault();
        e.returnValue = '';
      }
    });
  }

  /* ─── 로그인 게이트 ────────────────────────────── */
  async function ensureAuth(){
    if (!window.sb) return false;
    const gate = document.getElementById('adm-auth-gate');
    // 이미 로그인됐는지 확인
    const { data: { user } } = await window.sb.auth.getUser();
    if (user){
      if (gate) gate.hidden = true;
      return true;
    }

    // 로그인 폼 표시 + Promise 로 결과 대기
    return new Promise((resolve) => {
      const form = document.getElementById('adm-auth-form');
      const msg  = document.getElementById('auth-msg');
      const submitBtn = document.getElementById('auth-submit');
      gate.hidden = false;

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        msg.hidden = true;
        submitBtn.disabled = true;
        submitBtn.textContent = '로그인 중…';
        const email = document.getElementById('auth-email').value.trim();
        const password = document.getElementById('auth-password').value;
        try {
          const { data, error } = await window.sb.auth.signInWithPassword({ email, password });
          if (error) throw error;
          gate.hidden = true;
          resolve(true);
        } catch(err){
          msg.textContent = '로그인 실패: ' + (err.message || '알 수 없는 오류');
          msg.hidden = false;
          submitBtn.disabled = false;
          submitBtn.textContent = '로그인';
        }
      });
    });
  }

  async function signOut(){
    if (!window.sb) return;
    await window.sb.auth.signOut();
    location.reload();
  }

  /* ─── 매장 접근 권한 판정 ──────────────────────────
     분양형 — 매장 운영자는 자기 매장 admin 에만 접근 가능.
     - 본부(super_admin): 모든 매장 OK
     - 매장 운영자: URL 슬러그가 자기 매장과 일치해야 OK
       (?store=다른매장 으로 바꿔치기 해도 차단)
     - 연결된 매장 없음(외부 앱 계정 등): 차단 */
  function authorizeAdmin(slug, authCtx){
    if (!authCtx || !authCtx.user) return { ok:false, reason:'로그인이 필요합니다.' };
    if (authCtx.isSuperAdmin) return { ok:true };
    if (!authCtx.store){
      return { ok:false, reason:'이 계정에 연결된 매장이 없습니다. 매장 운영자 계정으로 로그인하세요.' };
    }
    if (slug && slug !== authCtx.store.slug){
      return { ok:false, reason:`이 매장(${slug}) 의 관리 권한이 없습니다.` };
    }
    return { ok:true };
  }

  /* 권한 거부 화면 — 로그인 게이트를 재활용해 안내 + 재로그인 */
  function showAccessDenied(reason){
    const gate = document.getElementById('adm-auth-gate');
    const card = gate && gate.querySelector('.adm-auth-card');
    if (!gate || !card) return;
    card.innerHTML =
      '<div class="adm-auth-brand">' +
        '<img src="./assets/brand/logo.png" alt="SK magic" style="height:28px;width:auto">' +
        '<div>' +
          '<div class="adm-auth-title">접근 권한이 없습니다</div>' +
          '<div class="adm-auth-sub">' + escape(reason || '') + '</div>' +
        '</div>' +
      '</div>' +
      '<button class="adm-btn adm-btn-primary" id="denied-signout" type="button">다른 계정으로 로그인</button>' +
      '<div class="adm-auth-foot"><a href="./index.html" data-back-site>← 사이트로 돌아가기</a></div>';
    gate.hidden = false;
    const btn = document.getElementById('denied-signout');
    if (btn) btn.addEventListener('click', signOut);
    renderBackToSite();
  }

  function renderAuthChip(authCtx){
    const chip = document.getElementById('adm-user-chip');
    const btnOut = document.getElementById('btn-signout');
    if (!chip) return;
    if (authCtx?.user){
      const roleLbl = authCtx.isSuperAdmin ? '본부' : (authCtx.store?.type === 'dealer' ? '딜러' : authCtx.store?.type === 'shop' ? '판매점' : '게스트');
      chip.innerHTML = `<strong>${escape(roleLbl)}</strong> · ${escape(authCtx.user.email)}`;
      chip.hidden = false;
      btnOut.hidden = false;
    }
  }

  /* ─── Init ──────────────────────────────────────── */
  async function init(){
    bindMenu();
    bindHeader();
    bindSearch();
    bindFilterToggles();
    bindStoreForm();
    state.filterCat = parseHash().cat;
    applyMenuFromHash();
    renderBackToSite();
    await loadProducts();

    // ── 로그인 게이트 (auth 통과해야 다음 진행) ──
    if (window.sb){
      const ok = await ensureAuth();
      if (!ok) return;
    }
    const authCtx = (typeof window.skmAuthContext === 'function') ? await window.skmAuthContext() : null;

    // 매장 컨텍스트 로드 (URL 슬러그 우선, 없으면 로그인 user 의 매장)
    const slug = (typeof window.skmGetSlug === 'function') ? window.skmGetSlug() : null;

    // ── 접근 권한 게이트 (분양 매장 간 교차 접근 차단) ──
    if (window.sb && authCtx){
      const verdict = authorizeAdmin(slug, authCtx);
      if (!verdict.ok){ showAccessDenied(verdict.reason); return; }
    }

    renderAuthChip(authCtx);

    if (slug && window.skmFetchStore){
      try {
        state.store = await window.skmFetchStore(slug);
      } catch(e){ console.warn('[admin] store fetch 실패', e); }
    }
    if (!state.store && authCtx?.store) state.store = authCtx.store;

    if (state.store?.id && window.skmFetchOverrides){
      try {
        const rows = await window.skmFetchOverrides(state.store.id);
        state.overrides = rowsToOverrides(rows, state.products);
      } catch(e){
        console.warn('[admin] cloud overrides fetch 실패 → 로컬 폴백', e);
        state.overrides = loadOverridesLocal();
      }
    } else {
      // 슬러그 없거나 매장 못 찾음 → localStorage 사용
      state.overrides = loadOverridesLocal();
    }
    renderStoreLabel();
    renderBackToSite();
    renderChips();
    await ensureCommissionData();   // 상품 가격이 정책테이블 기준 → 테이블 렌더 전 로드
    renderTable();
    populateStoreForm();
    updateDirtyFlag();
    // 데이터(state.products) 로드 완료 후 현재 메뉴 재적용 —
    // 초기 applyMenuFromHash 는 loadProducts 전이라 carddiscount 등 state.products 의존
    // 패널이 빈 데이터로 렌더됐음. 여기서 다시 적용해 패널·데이터를 확정.
    applyMenuFromHash();
  }

  /* "사이트로 돌아가기" 링크를 매장 슬러그 기준 clean URL 로.
     URL 슬러그 우선(로그인 전에도 동작), 없으면 로드된 매장,
     본부(_super)·미지정이면 메인 카탈로그 /skmagic 로. */
  function renderBackToSite(){
    const urlSlug = (typeof window.skmGetSlug === 'function') ? window.skmGetSlug() : null;
    const slug = urlSlug || state.store?.slug;
    const target = (slug && slug !== '_super') ? '/' + slug : '/skmagic';
    document.querySelectorAll('a[data-back-site]').forEach(a => { a.href = target; });
  }

  /* 사이드바에 현재 매장(상호) 표시 — 사이트로 돌아가기 위 */
  function renderStoreLabel(){
    const el = document.getElementById('adm-side-store');
    if (!el) return;
    el.hidden = false;
    if (state.store){
      el.innerHTML = `<span class="adm-side-store-name">${escape(state.store.name)}</span>`;
    } else {
      el.innerHTML = `<span class="adm-side-store-warn">⚠ 매장 미지정 (로컬 모드)</span>`;
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

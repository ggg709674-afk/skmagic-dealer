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

  /* 가격 4종 — 원본 + edits 를 합쳐 표시용으로 반환
     반환: { regular, sale, compete, card }   (모두 숫자 문자열, 단위 ₩ 없이 "13,200" 형태) */
  function effectivePrices(p){
    const ed = state.overrides.edits[p.goodsId]?.price || {};
    const orig = priceOf(p) || {};
    // 본사 원본: del = 정상가 "월 70,900", num = 할인가 "25,950"
    // 라벨/단위 제거하고 숫자/콤마만 남기는 정리.
    const stripUnit = (s) => String(s || '').replace(/^[^\d]*월?\s*/,'').replace(/\s*원\s*$/,'').trim();
    return {
      regular: ed.regular != null && ed.regular !== '' ? ed.regular : stripUnit(orig.del),
      sale:    ed.sale    != null && ed.sale    !== '' ? ed.sale    : stripUnit(orig.num),
      compete: ed.compete != null ? ed.compete : '',
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

    // 정렬 — 카테고리별 수동 order 있으면 그 순서대로 위로 끌어올림.
    // 단일 카테고리 선택 시만 의미가 있어서 '전체' 모드에서는 raw 순서 유지.
    if (state.filterCat){
      const orderArr = state.overrides.order[state.filterCat] || [];
      if (orderArr.length){
        const orderIdx = new Map(orderArr.map((id, i) => [id, i]));
        list.sort((a, b) => {
          const ai = orderIdx.has(a.goodsId) ? orderIdx.get(a.goodsId) : Infinity;
          const bi = orderIdx.has(b.goodsId) ? orderIdx.get(b.goodsId) : Infinity;
          return ai - bi;
        });
      }
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
    document.getElementById('edit-price-orig').innerHTML    = `본사 원본: <code>정상가 ${escape(stripUnit(op.del) || '—')} / 할인가 ${escape(stripUnit(op.num) || '—')}</code>`;
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

    // 본사 원본 정상가/할인가와 비교 → 같으면 override에 안 담음
    const op = priceOf(orig) || {};
    const stripUnit = (s) => String(s || '').replace(/^[^\d]*월?\s*/,'').replace(/\s*원\s*$/,'').trim();
    const origRegular = stripUnit(op.del);
    const origSale    = stripUnit(op.num);

    const ed = {};
    if (name && name !== (orig.name || '')) ed.name = name;
    if (tag !== (orig.tag || '')) ed.tag = tag;

    const benefits = bRaw ? bRaw.split(/[,、]/).map(s => s.trim()).filter(Boolean).slice(0, 5) : [];
    const origBenefits = (orig.benefits || []).slice();
    if (benefits.join('|') !== origBenefits.join('|')) ed.benefits = benefits;

    const price = {};
    if (preg !== origRegular) price.regular = preg;
    if (psal !== origSale)    price.sale    = psal;
    if (pcom) price.compete = pcom;   // 원본에 없는 값
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
    commission: { title: '수수료 확인', sub: '홈페이지 등록 모델의 약정·관리방식별 수수료표입니다.', kind: 'commission' },
    consult:  { title: '상담 신청',     sub: '준비 중인 메뉴예요.', kind: 'soon' },
    banner:   { title: '배너/슬라이드', sub: '준비 중인 메뉴예요.', kind: 'soon' },
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
    document.querySelector('[data-panel="store"]').hidden      = (meta.kind !== 'store');
    document.querySelector('[data-panel="soon"]').hidden       = (meta.kind !== 'soon');

    document.getElementById('adm-page-title').textContent = meta.title;
    document.getElementById('adm-page-sub').textContent   = meta.sub;

    if (meta.kind === 'store') populateStoreForm();
    if (meta.kind === 'commission') initCommission();

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
  const comState = { cat: 'all', form: 'all', q: '' };
  function comDB(){ return window.COMMISSION_DB || null; }
  const comFmt = (v) => (v == null || v === '') ? '<span class="price-empty">—</span>' : Number(v).toLocaleString('ko-KR');

  function initCommission(){
    const db = comDB();
    const tbody = document.getElementById('commission-tbody');
    if (!db){
      if (tbody) tbody.innerHTML = `<tr><td colspan="9" class="adm-empty">수수료 데이터를 불러오지 못했어요.</td></tr>`;
      return;
    }
    if (!comInited){
      comInited = true;
      const hint = document.getElementById('com-source-hint');
      if (hint) hint.innerHTML = `기준: <strong>${escape(db.source || '')}</strong> · 홈페이지 등록 모델 ${new Set(db.rows.map(r=>r.모델)).size}종 · 색상은 묶어서 표시(요금·수수료 동일).`;
      const search = document.getElementById('com-search');
      if (search) search.addEventListener('input', () => { comState.q = search.value.trim(); renderComTable(); });
    }
    renderComCatChips();
    renderComFormChips();
    renderComTable();
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
      if (q && !(`${r.모델} ${r.코드||''}`.toLowerCase().includes(q))) return false;
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
      tbody.innerHTML = `<tr><td colspan="9" class="adm-empty">조건에 맞는 항목이 없어요.</td></tr>`;
      return;
    }
    let prevModel = null;
    tbody.innerHTML = list.map(r => {
      const newModel = (r.모델 !== prevModel);
      prevModel = r.모델;
      return `<tr class="${newModel ? 'com-model-start':''}">
        <td>${escape(r.품목)}</td>
        <td class="col-com-model">${escape(r.모델)}</td>
        <td><span class="com-form com-form-${r.형태==='셀프형'?'self':'visit'}">${escape(r.형태)}</span></td>
        <td class="col-com-num">${r.의무!=null?escape(r.의무)+'개월':'<span class="price-empty">—</span>'}</td>
        <td>${escape(r.관리주기||'—')}</td>
        <td class="col-com-num">${comFmt(r.기준가)}</td>
        <td class="col-com-num com-num-strong">${comFmt(r.기본요금)}</td>
        <td class="col-com-num">${comFmt(r.타사보상)}</td>
        <td class="col-com-num com-fee">${comFmt(r.수수료합계)}</td>
      </tr>`;
    }).join('');
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
        toast(`${state.store.name} 데이터 로드`);
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
    renderTable();
    populateStoreForm();
    updateDirtyFlag();
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

  /* 헤더에 현재 매장 표시 */
  function renderStoreLabel(){
    const subEl = document.getElementById('adm-page-sub');
    if (!subEl) return;
    const base = '노출 여부 · 추천 배지 · 표시 순서 · 매장 자체 가격/이름 수정.';
    if (state.store){
      subEl.innerHTML = `<strong style="color:var(--primary)">${escape(state.store.name)}</strong> · ${base}`;
    } else {
      subEl.innerHTML = `<span style="color:var(--ink-4)">⚠ 매장 미지정 (로컬 모드)</span> · ${base}`;
    }
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

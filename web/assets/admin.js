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
    filterCat: '',            // '' = 전체, 또는 dispClsfNo
    filterSearch: '',
    filterShowHidden: false,
    filterFeaturedOnly: false,
    overrides: loadOverrides(),
    dirty: false,
  };

  /* ─── overrides 스키마 ───────────────────────────
     {
       hidden:   { [goodsId]: true },
       featured: { [goodsId]: true },
       order:    { [dispClsfNo]: [goodsId, goodsId, ...] },
       edits:    { [goodsId]: { name, price:{title,del,num}, benefits:[], tag, memo } },
       updated_at: ISO 문자열
     }
  ─────────────────────────────────────────────────── */
  function loadOverrides(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return emptyOverrides();
      const o = JSON.parse(raw);
      return {
        hidden:   o.hidden   || {},
        featured: o.featured || {},
        order:    o.order    || {},
        edits:    o.edits    || {},
        updated_at: o.updated_at || null,
      };
    } catch(e){
      console.warn('[admin] overrides 로드 실패', e);
      return emptyOverrides();
    }
  }
  function emptyOverrides(){
    return { hidden:{}, featured:{}, order:{}, edits:{}, updated_at:null };
  }
  function saveOverrides(){
    state.overrides.updated_at = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.overrides));
    state.dirty = false;
    updateDirtyFlag();
    toast('저장되었어요');
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
      if (k === 'memo') return false;
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
      // 체크됨 = 노출, 체크 해제 = 숨김
      if (e.target.checked) delete state.overrides.hidden[gid];
      else state.overrides.hidden[gid] = true;
      tr.classList.toggle('is-hidden', !e.target.checked);
    } else if (act === 'featured'){
      if (e.target.checked) state.overrides.featured[gid] = true;
      else delete state.overrides.featured[gid];
      tr.classList.toggle('is-featured', e.target.checked);
    }
    markDirty();
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
    [arr[cur], arr[next]] = [arr[next], arr[cur]];
    state.overrides.order[cat] = arr;
    markDirty();
    renderTable();
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
    const ed   = state.overrides.edits[gid] || {};

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
    document.getElementById('edit-memo').value          = ed.memo || '';

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
    const memo  = document.getElementById('edit-memo').value.trim();

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

    if (memo) ed.memo = memo;

    if (Object.keys(ed).length === 0){
      delete state.overrides.edits[_editingGid];
    } else {
      state.overrides.edits[_editingGid] = ed;
    }
    markDirty();
    closeEditModal();
    renderTable();
    toast('수정 적용됨 (저장 버튼으로 확정)');
  }
  function revertEditModal(){
    if (!_editingGid) return;
    if (!confirm('이 상품의 수정 내용을 모두 삭제하고 원본값으로 되돌립니다.')) return;
    delete state.overrides.edits[_editingGid];
    markDirty();
    closeEditModal();
    renderTable();
    toast('원본값으로 복원됨');
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
  function onExport(){
    const text = JSON.stringify({
      ...state.overrides,
      _meta: {
        exported_at: new Date().toISOString(),
        product_count: state.products.length,
        version: 1,
      }
    }, null, 2);
    document.getElementById('export-text').value = text;
    document.getElementById('export-modal').hidden = false;
  }
  function onExportClose(){
    document.getElementById('export-modal').hidden = true;
  }
  function onExportCopy(){
    const ta = document.getElementById('export-text');
    ta.select();
    document.execCommand('copy');
    toast('클립보드에 복사됨');
  }
  function onExportDownload(){
    const text = document.getElementById('export-text').value;
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skm-admin-overrides-${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('파일로 저장됨');
  }

  /* ─── 사이드바 메뉴 (hash 기반 라우팅) ───────────────
     URL: ./admin.html#<menu>
       products | consult | banner | store
     hash 없으면 products 로 기본 진입.
     새로고침/뒤로가기 시 동일한 화면이 복원됨.
  ─────────────────────────────────────────────────── */
  const MENU_META = {
    products: { title: '상품 관리', sub: '노출 여부 · 추천 배지 · 표시 순서 · 매장 자체 가격/이름 수정.', kind: 'products' },
    consult:  { title: '상담 신청',     sub: '준비 중인 메뉴예요.', kind: 'soon' },
    banner:   { title: '배너/슬라이드', sub: '준비 중인 메뉴예요.', kind: 'soon' },
    store:    { title: '매장 정보',     sub: '준비 중인 메뉴예요.', kind: 'soon' },
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
    document.querySelector('[data-panel="products"]').hidden = (meta.kind !== 'products');
    document.querySelector('[data-panel="soon"]').hidden     = (meta.kind !== 'soon');

    document.getElementById('adm-page-title').textContent = meta.title;
    document.getElementById('adm-page-sub').textContent   = meta.sub;

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
    document.getElementById('btn-save').addEventListener('click', onSave);
    document.getElementById('btn-reset').addEventListener('click', onReset);
    document.getElementById('btn-export').addEventListener('click', onExport);
    document.getElementById('export-close').addEventListener('click', onExportClose);
    document.getElementById('export-copy').addEventListener('click', onExportCopy);
    document.getElementById('export-download').addEventListener('click', onExportDownload);

    // 편집 모달
    document.getElementById('edit-close').addEventListener('click', closeEditModal);
    document.getElementById('edit-cancel').addEventListener('click', closeEditModal);
    document.getElementById('edit-save').addEventListener('click', saveEditModal);
    document.getElementById('edit-revert').addEventListener('click', revertEditModal);
    // ESC 닫기
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape'){
        if (!document.getElementById('edit-modal').hidden) closeEditModal();
        else if (!document.getElementById('export-modal').hidden) onExportClose();
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

  /* ─── Init ──────────────────────────────────────── */
  async function init(){
    bindMenu();
    bindHeader();
    bindSearch();
    bindFilterToggles();
    // 초기 hash 읽기 — state.filterCat 만 먼저 세팅하고, 패널/렌더는 데이터 로드 후
    state.filterCat = parseHash().cat;
    applyMenuFromHash();
    await loadProducts();
    renderChips();
    renderTable();
    updateDirtyFlag();
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

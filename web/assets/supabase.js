/* ============================================================
   supabase.js — Supabase 클라이언트 초기화 + 공통 헬퍼
   - CDN의 supabase-js v2 글로벌 사용 (window.supabase)
   - 슬러그 파싱: URL ?store= 우선, 없으면 path /{slug}/...
   ============================================================ */

(function(){
  const SUPABASE_URL  = 'https://qpexfvwrlwkpjyihlnwz.supabase.co';
  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFwZXhmdndybHdrcGp5aWhsbnd6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4OTAwMTIsImV4cCI6MjA5MzQ2NjAxMn0.Aq1b2i5UpQ2Y48nWlnygkkxrw-h8GufAkl8L8K8e0kY';

  if (typeof window.supabase === 'undefined' || !window.supabase.createClient){
    console.error('[supabase] supabase-js CDN 이 로드되지 않았습니다. <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script> 가 먼저 와야 합니다.');
    return;
  }

  // 글로벌 클라이언트 — 모든 페이지에서 공용
  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: 'skm-auth',
    },
  });

  /* ─── 슬러그 파싱 ─────────────────────────────────
     우선순위:
       1) ?store=xxx  (query string — 개발/테스트 편의)
       2) /xxx/...    (pathname 첫 segment)
       3) null        (루트 또는 매장 슬러그 없음)
     예약 슬러그: _super (본부), admin (단일 매장 admin 직진입)
  ─────────────────────────────────────────────────── */
  const RESERVED = new Set(['admin', '_super', 'assets', 'products', 'data', 'web', 'card-benefits', 'faq', 'terms', 'privacy']);

  window.skmGetSlug = function(){
    try {
      const params = new URLSearchParams(location.search);
      const fromQuery = params.get('store');
      if (fromQuery) return fromQuery.trim();
    } catch(_){}
    // dev 환경: /web/admin.html → 'web' segment 건너뛰기
    const segs = (location.pathname || '/').split('/').filter(Boolean);
    let seg = segs[0];
    if (seg === 'web') seg = segs[1];
    if (!seg) return null;
    if (RESERVED.has(seg)) return null;
    if (/\.html?$/i.test(seg)) return null;
    return seg;
  };

  /* ─── 매장 경로 헬퍼 ───────────────────────────────
     매장 컨텍스트(슬러그)가 있으면 path 앞에 /{slug} 를 붙이고,
     없으면(본부/루트) 그대로 둔다. 멀티테넌트 정적페이지 링크 생성용.
     예) skmStorePath('/card-benefits') → '/sample/card-benefits' (매장) | '/card-benefits' (본부)
  ─────────────────────────────────────────────────── */
  window.skmStorePath = function(p){
    const s = window.skmGetSlug();
    if (!s) return p;                       // 본부/매장없음 → 전역 경로 그대로
    return '/' + s + (p.charAt(0) === '/' ? p : '/' + p);
  };

  /* ─── 페이지 내 링크에 매장 슬러그 주입 ─────────────
     정적 정보페이지(card-benefits/faq/terms/privacy)와 SPA 헤더에서,
     매장 슬러그가 있을 때 내부 링크가 슬러그를 잃지 않게 보정한다.
       - 정적페이지 링크  /card-benefits 등        → /{slug}/card-benefits
       - (opts.catalog) 카탈로그 링크 ./index.html?… → /{slug}?…  (정적페이지에서만)
     본부/매장없음이면 아무것도 안 함(전역 링크 유지). 외부·앵커·tel/mailto 링크는 건드리지 않음.
  ─────────────────────────────────────────────────── */
  window.skmLocalizeLinks = function(opts){
    opts = opts || {};
    const s = window.skmGetSlug();
    if (!s) return;                         // 본부 → 전역 링크 그대로 둔다
    const prefix = '/' + s;
    const STATIC = /^\/(?:card-benefits|faq|terms|privacy)(?=$|[/?#])/;
    const CATALOG = /^\.?\/?(?:index|category|detail)\.html(\?[^#]*)?(#.*)?$/i;
    document.querySelectorAll('a[href]').forEach(function(a){
      const raw = a.getAttribute('href');
      if (!raw || /^(?:#|mailto:|tel:|javascript:|https?:|\/\/)/i.test(raw)) return;
      if (a.dataset.skmLocalized) return;   // 중복 보정 방지(재렌더 대비)
      if (STATIC.test(raw)) { a.setAttribute('href', prefix + raw); a.dataset.skmLocalized = '1'; return; }
      if (opts.catalog) {
        const m = raw.match(CATALOG);
        if (m) { a.setAttribute('href', prefix + (m[1] || '') + (m[2] || '')); a.dataset.skmLocalized = '1'; return; }
      }
    });
  };

  /* ─── 상담 신청 FAB 마운트 (정적 정보페이지 공용) ────────
     메인 카탈로그의 우하단 '상담 신청' 플로팅 버튼 + 전화/카카오 팝업을,
     card-benefits/faq/terms/privacy 같은 정적 페이지에도 동일하게 띄운다.
     CSS(.fab-consult/.fab-popup)는 style.css 공용. store 없으면 라벨만(전화/카카오 생략). */
  window.skmMountConsultFab = function(store){
    if (document.getElementById('fab-consult')) return;   // 이미 있으면(메인 등) 스킵
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
    store = store || {};
    const tel   = (store.phone || '').trim();
    const kakao = (store.kakao_url || '').trim();
    const hours = (store.biz_hours || '').trim();
    const chat  = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    const fab = document.createElement('a');
    fab.className = 'fab-consult'; fab.href = '#'; fab.id = 'fab-consult'; fab.setAttribute('aria-label', '상담 신청 열기');
    fab.innerHTML = chat + '<span class="fab-label">상담 신청</span>';
    const popup = document.createElement('div');
    popup.className = 'fab-popup'; popup.id = 'fab-popup'; popup.hidden = true;
    popup.innerHTML =
      '<p class="pop-label">지금 바로 상담 가능</p>' +
      (tel   ? `<a class="pop-tel" href="tel:${esc(tel.replace(/[^0-9+]/g,''))}">${esc(tel)}</a>` : '') +
      (hours ? `<div class="pop-hours">${esc(hours)}</div>` : '') +
      (kakao ? `<a class="pop-kakao" href="${esc(kakao)}" target="_blank" rel="noopener">카카오톡 상담</a>` : '');
    document.body.appendChild(fab);
    document.body.appendChild(popup);
    fab.addEventListener('click', e => { e.preventDefault(); popup.hidden = !popup.hidden; });
    document.addEventListener('click', e => {
      if (popup.hidden) return;
      if (e.target.closest('.fab-consult') || e.target.closest('.fab-popup')) return;
      popup.hidden = true;
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !popup.hidden) popup.hidden = true; });
    if (window.skmMountScrollTop) window.skmMountScrollTop();   // 정적페이지에도 맨위로 버튼 같이
  };

  /* ─── 맨 위로 버튼 (스크롤 내려가면 좌하단에 노출) ──────── */
  window.skmMountScrollTop = function(){
    if (document.getElementById('scroll-top')) return;
    const btn = document.createElement('button');
    btn.id = 'scroll-top'; btn.className = 'scroll-top'; btn.type = 'button'; btn.setAttribute('aria-label', '맨 위로');
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
    document.body.appendChild(btn);
    btn.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); btn.blur(); });
    const onScroll = () => btn.classList.toggle('show', window.scrollY > 400);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  };

  /* ─── 매장 정보 조회 ───────────────────────────── */
  window.skmFetchStore = async function(slug){
    if (!slug) return null;
    const { data, error } = await window.sb
      .from('stores')
      .select('id, slug, name, type, parent_store_id, margin_group, biz_no, biz_owner, mail_order_no, address, phone, email, biz_hours, kakao_url, theme_color, logo_url, margins')
      .eq('slug', slug)
      .maybeSingle();
    if (error){
      console.warn('[skmFetchStore]', error);
      return null;
    }
    return data;
  };

  /* ─── 매장 기본정보 수정 (인증된 본인 매장만 — RLS 의존) ─
     허용 필드만 화이트리스트로 추려서 update. */
  window.skmUpdateStore = async function(storeId, patch){
    if (!storeId) return { error: new Error('storeId 필요') };
    const ALLOWED = ['name','biz_owner','biz_no','mail_order_no','address','phone','email','biz_hours','kakao_url'];
    const row = {};
    for (const k of ALLOWED){
      if (Object.prototype.hasOwnProperty.call(patch, k)) row[k] = patch[k];
    }
    const { data, error } = await window.sb
      .from('stores')
      .update(row)
      .eq('id', storeId)
      .select()
      .maybeSingle();
    if (error) console.warn('[skmUpdateStore]', error);
    return { data, error };
  };

  /* ─── 판매점 마진 저장 (매장 owner — RLS stores update) ─
     margins = { "<코드>|<형태>|<의무>": 마진금액(원), ... } */
  window.skmSaveMargins = async function(storeId, margins){
    if (!storeId) return { error: new Error('storeId 필요') };
    const { data, error } = await window.sb
      .from('stores')
      .update({ margins: margins || {} })
      .eq('id', storeId)
      .select('margins')
      .maybeSingle();
    if (error) console.warn('[skmSaveMargins]', error);
    return { data, error };
  };

  /* ─── 산하 매장(판매점) 목록 조회 (분양관리 — RLS stores_read_all) ─ */
  window.skmFetchChildStores = async function(parentId){
    if (!parentId) return [];
    const { data, error } = await window.sb
      .from('stores')
      .select('id, slug, name, type, email, margin_group, biz_owner, phone, created_at')
      .eq('parent_store_id', parentId)
      .order('created_at', { ascending: true });
    if (error){ console.warn('[skmFetchChildStores]', error); return []; }
    return data || [];
  };

  /* ─── 전체 매장 조회 (본부 사이트분양 목록 — 모든 계층) ─
     RLS stores_read_all(USING true) 라 전체 조회 가능. 본부가 산하·손자까지
     다 보고 소속 그룹(부모 dealer) 표시하는 데 사용. */
  window.skmFetchAllStores = async function(){
    const { data, error } = await window.sb
      .from('stores')
      .select('id, slug, name, type, email, parent_store_id, margin_group, biz_owner, phone, created_at')
      .order('created_at', { ascending: true });
    if (error){ console.warn('[skmFetchAllStores]', error); return []; }
    return data || [];
  };

  /* ─── 판매점 로그인 계정 생성 (분양 시) ──────────────────
     본부/분양형이 분양할 때 산하 매장 운영자 계정(이메일/비번)을 만든다.
     ★ 별도 client(persistSession:false)로 signUp → 분양하는 본인(본부/분양형) 로그인 세션은 유지됨.
     ★ 새 계정이 즉시 로그인되려면 Supabase 대시보드의 Email 'Confirm email' 이 OFF 여야 함.
     반환: { userId } 또는 { error } */
  let _signupClient = null;
  window.skmCreateStoreAccount = async function(email, password){
    email = (email || '').trim();
    if (!email) return { error: new Error('ID(이메일)가 필요해요.') };
    if (!password || password.length < 6) return { error: new Error('초기 비밀번호는 6자 이상이어야 해요.') };
    if (!_signupClient){
      _signupClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
        auth: { persistSession: false, autoRefreshToken: false, storageKey: 'skm-signup-tmp' }
      });
    }
    const { data, error } = await _signupClient.auth.signUp({ email, password });
    if (error){ console.warn('[skmCreateStoreAccount]', error); return { error }; }
    const userId = data && data.user && data.user.id;
    if (!userId) return { error: new Error('계정 생성에 실패했어요(유저 ID 없음).') };
    return { userId };
  };

  /* ─── 매장 삭제 (본부=모든 매장 / 분양형=자기 산하 shop — RLS) ───
     stores 삭제 → admin_overrides·consultations cascade 삭제.
     ※ 로그인 계정(auth.users)은 클라에서 못 지움 → Supabase 대시보드 Users 에서 별도 삭제. */
  window.skmDeleteStore = async function(storeId){
    if (!storeId) return { error: new Error('storeId 필요') };
    const { error } = await window.sb.from('stores').delete().eq('id', storeId);
    if (error) console.warn('[skmDeleteStore]', error);
    return { error };
  };

  /* ─── 로그인 비밀번호 변경 (본인 계정 — 기본정보 메뉴) ───
     Supabase 세션 기반. 최소 6자(프로젝트 정책). */
  window.skmChangePassword = async function(newPw){
    if (!newPw || newPw.length < 6) return { error: new Error('비밀번호는 6자 이상이어야 해요.') };
    const { error } = await window.sb.auth.updateUser({ password: newPw });
    if (error) console.warn('[skmChangePassword]', error);
    return { error };
  };

  /* ─── 매장 정책그룹(margin_group) 지정/변경 (본부 전용 — RLS stores_super_all) ─
     group: 'A'|'B'|'C'|'D' 또는 빈값/그외 → null(미지정) */
  window.skmUpdateStoreMarginGroup = async function(storeId, group){
    if (!storeId) return { error: new Error('storeId 필요') };
    const val = ['A','B','C','D'].includes(group) ? group : null;
    const { error } = await window.sb.from('stores').update({ margin_group: val }).eq('id', storeId);
    if (error) console.warn('[skmUpdateStoreMarginGroup]', error);
    return { error };
  };

  /* ─── 새 매장 분양 (super=dealer/shop, dealer=shop만 — RLS stores write) ─
     opts = { slug, name, type:'shop'|'dealer', ownerUserId, email }
       - ownerUserId: skmCreateStoreAccount 로 만든 운영자 계정 → stores.owner_user_id 연결(로그인 권한)
       - email: 로그인 ID 겸 매장 연락 이메일(stores.email) */
  window.skmCreateChildStore = async function(parentId, opts){
    if (!parentId) return { error: new Error('parentId 필요') };
    const slug = ((opts && opts.slug) || '').trim();
    if (!slug) return { error: new Error('슬러그가 필요해요.') };
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return { error: new Error('슬러그는 영문/숫자/하이픈만 가능해요.') };
    const type = (opts && opts.type === 'dealer') ? 'dealer' : 'shop';
    const row = { slug, name: ((opts.name) || '').trim() || slug, type, parent_store_id: parentId };
    if (opts && opts.ownerUserId) row.owner_user_id = opts.ownerUserId;
    if (opts && opts.email) row.email = String(opts.email).trim();
    const { data, error } = await window.sb
      .from('stores')
      .insert(row)
      .select()
      .maybeSingle();
    if (error) console.warn('[skmCreateChildStore]', error);
    return { data, error };
  };

  /* ─── 상담/주문 신청 INSERT (방문자 누구나 — RLS consult_insert_public) ─
     payload = { storeId, kind:'consult'|'order', name, phone, birth, address, email, products, memo }
       - consult: 이름·연락처만 / order: 생년월일·주소까지
       - products: [{goodsId, name, careType, contract, ...}] 선택 상품·옵션 스냅샷 */
  window.skmInsertConsultation = async function(payload){
    const storeId = payload && payload.storeId;
    if (!storeId) return { error: new Error('storeId 필요') };
    const kind = payload.kind === 'order' ? 'order' : 'consult';
    const trim = v => (v == null ? '' : String(v)).trim();
    const row = {
      store_id: storeId,
      kind,
      customer_name:  trim(payload.name),
      customer_phone: trim(payload.phone),
      customer_email: trim(payload.email) || null,
      // 주문일 때만 생년월일·주소 저장
      customer_birth:   kind === 'order' ? (trim(payload.birth)   || null) : null,
      customer_address: kind === 'order' ? (trim(payload.address) || null) : null,
      products: Array.isArray(payload.products) ? payload.products : [],
      memo: trim(payload.memo) || null,
    };
    const { data, error } = await window.sb
      .from('consultations')
      .insert(row)
      .select()
      .maybeSingle();
    if (error) console.warn('[skmInsertConsultation]', error);
    return { data, error };
  };

  /* ─── 상담/주문 신청 목록 조회 (계층 — RLS consult_visible_view = my_visible_stores) ─
     storeId: 문자열=그 매장만 / 배열=그 매장들만(.in) / 생략=RLS 가 보이는 매장 전체
     (본부=전체 / 분양형=자기+산하 / 판매점=자기). 매장명 표시용으로 stores 조인. */
  window.skmFetchConsultations = async function(storeId){
    let q = window.sb
      .from('consultations')
      .select('*, store:stores(name, slug, type)')
      .order('created_at', { ascending: false });
    if (Array.isArray(storeId)){
      if (!storeId.length) return [];
      q = q.in('store_id', storeId);
    } else if (storeId){
      q = q.eq('store_id', storeId);
    }
    const { data, error } = await q;
    if (error){ console.warn('[skmFetchConsultations]', error); return []; }
    return data || [];
  };

  /* ─── 신청 상태·메모 변경 (매장 owner — RLS consult_visible_update) ─
     patch = { status, memo } 중 허용 키만 update */
  window.skmUpdateConsultation = async function(id, patch){
    if (!id) return { error: new Error('id 필요') };
    const ALLOWED = ['status', 'memo'];
    const row = { updated_at: new Date().toISOString() };
    for (const k of ALLOWED){
      if (patch && Object.prototype.hasOwnProperty.call(patch, k)) row[k] = patch[k];
    }
    const { data, error } = await window.sb
      .from('consultations')
      .update(row)
      .eq('id', id)
      .select()
      .maybeSingle();
    if (error) console.warn('[skmUpdateConsultation]', error);
    return { data, error };
  };

  /* ─── 매장의 admin_overrides 일괄 조회 ───────── */
  window.skmFetchOverrides = async function(storeId){
    if (!storeId) return [];
    const { data, error } = await window.sb
      .from('admin_overrides')
      .select('*')
      .eq('store_id', storeId);
    if (error){
      console.warn('[skmFetchOverrides]', error);
      return [];
    }
    return data || [];
  };

  /* ─── overrides 한 행 upsert ─────────────────── */
  window.skmUpsertOverride = async function(storeId, goodsId, patch){
    if (!storeId || !goodsId) return { error: new Error('storeId/goodsId 필요') };
    const row = {
      store_id: storeId,
      goods_id: goodsId,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await window.sb
      .from('admin_overrides')
      .upsert(row, { onConflict: 'store_id,goods_id' })
      .select()
      .maybeSingle();
    if (error) console.warn('[skmUpsertOverride]', error);
    return { data, error };
  };

  /* ─── overrides 행 삭제 (해당 상품 수정 전체 해제) ─ */
  window.skmDeleteOverride = async function(storeId, goodsId){
    const { error } = await window.sb
      .from('admin_overrides')
      .delete()
      .eq('store_id', storeId)
      .eq('goods_id', goodsId);
    if (error) console.warn('[skmDeleteOverride]', error);
    return { error };
  };

  /* ─── 수수료표 조회 (본부 공통 단일행) ───────────
     commission_data 테이블의 id=1 한 행에 전체 payload(jsonb) 저장. */
  window.skmFetchCommission = async function(){
    const { data, error } = await window.sb
      .from('commission_data')
      .select('payload, source, built_at, updated_at')
      .eq('id', 1)
      .maybeSingle();
    if (error){
      console.warn('[skmFetchCommission]', error);
      return null;
    }
    return data;
  };

  /* ─── 수수료표 저장 (로그인 필요 — RLS 의존) ─────
     payload = { source, built_at, 품목순, rows } */
  window.skmSaveCommission = async function(payload){
    const row = {
      id: 1,
      payload,
      source: payload?.source || null,
      built_at: payload?.built_at || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await window.sb
      .from('commission_data')
      .upsert(row, { onConflict: 'id' })
      .select()
      .maybeSingle();
    if (error) console.warn('[skmSaveCommission]', error);
    return { data, error };
  };

  /* ─── 제휴카드 데이터 조회 (카드별 이미지·링크, 단일행 id=1) ─── */
  window.skmFetchCardBenefits = async function(){
    const { data, error } = await window.sb
      .from('card_benefits')
      .select('payload, updated_at')
      .eq('id', 1)
      .maybeSingle();
    if (error){ console.warn('[skmFetchCardBenefits]', error); return null; }
    return data;
  };

  /* ─── 제휴카드 데이터 저장 (super_admin — RLS 의존) ───
     payload = { cards: { "<key>": { image, link }, ... } } */
  window.skmSaveCardBenefits = async function(payload){
    const { data, error } = await window.sb
      .from('card_benefits')
      .upsert({ id: 1, payload, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .select()
      .maybeSingle();
    if (error) console.warn('[skmSaveCardBenefits]', error);
    return { data, error };
  };

  /* ─── 카드할인금액 저장 (card_benefits.payload.discounts 통합, 본부 공통) ───
     discounts = { "<goodsId>": { sale: 13000, compete: 3000 }, ... } (할인액).
     기존 payload(cards 등)는 보존하고 discounts 만 교체. */
  window.skmSaveCardDiscounts = async function(discounts){
    let cur = null;
    try { cur = await window.skmFetchCardBenefits(); } catch(_){}
    const payload = Object.assign({}, (cur && cur.payload) || {}, { discounts: discounts || {} });
    return window.skmSaveCardBenefits(payload);
  };

  /* ─── 카드 이미지 업로드 (Storage card-assets 버킷) → public URL 반환 ─── */
  window.skmUploadCardImage = async function(key, file){
    if (!key || !file) return { error: new Error('key/file 필요') };
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const path = `cards/${key}.${ext}`;
    const { error: upErr } = await window.sb.storage
      .from('card-assets')
      .upload(path, file, { upsert: true, contentType: file.type || 'image/png' });
    if (upErr){ console.warn('[skmUploadCardImage]', upErr); return { error: upErr }; }
    const { data } = window.sb.storage.from('card-assets').getPublicUrl(path);
    // 캐시 무력화용 쿼리 부착 (같은 경로 덮어쓰기 시 갱신)
    const url = data?.publicUrl ? `${data.publicUrl}?t=${Date.now()}` : null;
    return { url };
  };

  /* ─── 자주 묻는 질문(FAQ) 조회 (본부 공통 단일행 id=1) ───
     payload = { items: [ { q, a }, ... ] }. 없으면 프런트 기본 FAQ 사용. */
  window.skmFetchFaq = async function(){
    const { data, error } = await window.sb
      .from('faq_data')
      .select('payload, updated_at')
      .eq('id', 1)
      .maybeSingle();
    if (error){ console.warn('[skmFetchFaq]', error); return null; }
    return data;
  };

  /* ─── FAQ 저장 (super_admin — RLS 의존) ───
     payload = { items: [ { q, a }, ... ] } */
  window.skmSaveFaq = async function(payload){
    const { data, error } = await window.sb
      .from('faq_data')
      .upsert({ id: 1, payload, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .select()
      .maybeSingle();
    if (error) console.warn('[skmSaveFaq]', error);
    return { data, error };
  };

  /* ─── 홈 배너/슬라이드 조회 (본부 공통 단일행 id=1) ───
     payload = { mode, interval, items:[{image,link,newTab,enabled}] }. 없으면 프런트 기본 배너. */
  window.skmFetchBanners = async function(){
    const { data, error } = await window.sb
      .from('banner_data')
      .select('payload, updated_at')
      .eq('id', 1)
      .maybeSingle();
    if (error){ console.warn('[skmFetchBanners]', error); return null; }
    return data;
  };

  /* ─── 배너 저장 (super_admin — RLS 의존) ─── */
  window.skmSaveBanners = async function(payload){
    const { data, error } = await window.sb
      .from('banner_data')
      .upsert({ id: 1, payload, updated_at: new Date().toISOString() }, { onConflict: 'id' })
      .select()
      .maybeSingle();
    if (error) console.warn('[skmSaveBanners]', error);
    return { data, error };
  };

  /* ─── 배너 이미지 업로드 (Storage banner-assets) → public URL ───
     배너는 여러 개라 파일명을 매번 고유하게 생성. */
  window.skmUploadBannerImage = async function(file){
    if (!file) return { error: new Error('file 필요') };
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `banners/${Date.now()}_${rand}.${ext}`;
    const { error: upErr } = await window.sb.storage
      .from('banner-assets')
      .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
    if (upErr){ console.warn('[skmUploadBannerImage]', upErr); return { error: upErr }; }
    const { data } = window.sb.storage.from('banner-assets').getPublicUrl(path);
    return { url: data?.publicUrl || null };
  };

  /* ─── 현재 로그인된 사용자 + 매장 컨텍스트 ─────── */
  window.skmAuthContext = async function(){
    const { data: { user } } = await window.sb.auth.getUser();
    if (!user) return { user: null, store: null, isSuperAdmin: false };
    const { data: store } = await window.sb
      .from('stores')
      .select('id, slug, name, type, parent_store_id')
      .eq('owner_user_id', user.id)
      .maybeSingle();
    return {
      user,
      store: store || null,
      isSuperAdmin: store?.type === 'super_admin',
    };
  };

})();

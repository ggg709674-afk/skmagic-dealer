-- ============================================================
-- skmagic-dealer 멀티테넌트 초기 스키마
-- 실행 위치: Supabase Dashboard → SQL Editor → New query → 통째로 붙여넣고 Run
-- ============================================================

-- ─── 1. 테이블 ─────────────────────────────────────────────

-- stores : 매장 (super_admin / dealer / shop)
CREATE TABLE IF NOT EXISTS public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('super_admin', 'dealer', 'shop')),
  parent_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,

  -- 사업자 정보
  biz_no text,
  biz_owner text,
  address text,

  -- 연락처
  phone text,
  email text,
  kakao_url text,

  -- 디자인 커스텀
  theme_color text,
  logo_url text,

  -- Auth 연결 (Supabase Auth user id)
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- 제약: shop 은 반드시 parent(dealer) 가 있어야 함
  CONSTRAINT shop_must_have_dealer CHECK (
    type <> 'shop' OR parent_store_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_stores_slug   ON public.stores(slug);
CREATE INDEX IF NOT EXISTS idx_stores_parent ON public.stores(parent_store_id);
CREATE INDEX IF NOT EXISTS idx_stores_owner  ON public.stores(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_stores_type   ON public.stores(type);


-- admin_overrides : 매장별 카탈로그 수정 (노출/추천/순서/가격/이름)
CREATE TABLE IF NOT EXISTS public.admin_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  goods_id text NOT NULL,

  hidden      boolean DEFAULT false,
  featured    boolean DEFAULT false,
  order_index integer,

  -- 텍스트 오버라이드
  name_override     text,
  benefits_override text[],
  tag_override      text,

  -- 가격 4종 (월 구독료, 콤마 포함 문자열 — 예: "13,200")
  price_regular text,
  price_sale    text,
  price_compete text,
  price_card    text,

  memo text,

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  UNIQUE (store_id, goods_id)
);

CREATE INDEX IF NOT EXISTS idx_overrides_store ON public.admin_overrides(store_id);


-- consultations : 주문(상담신청)
CREATE TABLE IF NOT EXISTS public.consultations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,

  customer_name  text NOT NULL,
  customer_phone text NOT NULL,
  customer_email text,

  -- 관심 상품 [{goodsId, name, ...}]
  products jsonb NOT NULL DEFAULT '[]'::jsonb,

  memo   text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),

  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consult_store   ON public.consultations(store_id);
CREATE INDEX IF NOT EXISTS idx_consult_status  ON public.consultations(status);
CREATE INDEX IF NOT EXISTS idx_consult_created ON public.consultations(created_at DESC);


-- ─── 2. updated_at 자동 갱신 트리거 ────────────────────────

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stores_updated    ON public.stores;
DROP TRIGGER IF EXISTS trg_overrides_updated ON public.admin_overrides;
DROP TRIGGER IF EXISTS trg_consult_updated   ON public.consultations;

CREATE TRIGGER trg_stores_updated    BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_overrides_updated BEFORE UPDATE ON public.admin_overrides
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_consult_updated   BEFORE UPDATE ON public.consultations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ─── 3. RLS 헬퍼 함수 ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
    WHERE owner_user_id = auth.uid() AND type = 'super_admin'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_my_store(p_store_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id AND owner_user_id = auth.uid()
  );
$$;

-- 딜러 입장: 자기 매장 + 자기 산하 shop들의 store_id 목록
CREATE OR REPLACE FUNCTION public.my_visible_stores()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT id FROM public.stores WHERE owner_user_id = auth.uid()
  UNION
  SELECT s.id FROM public.stores s
  JOIN public.stores d ON s.parent_store_id = d.id
  WHERE d.owner_user_id = auth.uid() AND d.type = 'dealer';
$$;


-- ─── 4. RLS 정책 ────────────────────────────────────────────

ALTER TABLE public.stores            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_overrides   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consultations     ENABLE ROW LEVEL SECURITY;

-- 기존 정책 모두 삭제 (재실행 안전)
DROP POLICY IF EXISTS stores_read_all              ON public.stores;
DROP POLICY IF EXISTS stores_super_all             ON public.stores;
DROP POLICY IF EXISTS stores_dealer_manage_shops   ON public.stores;
DROP POLICY IF EXISTS stores_own_update            ON public.stores;
DROP POLICY IF EXISTS overrides_read_all           ON public.admin_overrides;
DROP POLICY IF EXISTS overrides_super_all          ON public.admin_overrides;
DROP POLICY IF EXISTS overrides_own_write          ON public.admin_overrides;
DROP POLICY IF EXISTS consult_insert_public        ON public.consultations;
DROP POLICY IF EXISTS consult_super_all            ON public.consultations;
DROP POLICY IF EXISTS consult_visible_view         ON public.consultations;
DROP POLICY IF EXISTS consult_visible_update       ON public.consultations;

-- ━━━ stores ━━━
-- 모두 read 가능 (방문자가 슬러그로 매장 정보 가져올 때 필요)
CREATE POLICY stores_read_all ON public.stores
  FOR SELECT USING (true);

-- super_admin 은 모두 write
CREATE POLICY stores_super_all ON public.stores
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- dealer 는 자기 산하 shop 추가/수정/삭제 가능
CREATE POLICY stores_dealer_manage_shops ON public.stores
  FOR ALL USING (
    type = 'shop' AND parent_store_id IN (
      SELECT id FROM public.stores
      WHERE owner_user_id = auth.uid() AND type = 'dealer'
    )
  )
  WITH CHECK (
    type = 'shop' AND parent_store_id IN (
      SELECT id FROM public.stores
      WHERE owner_user_id = auth.uid() AND type = 'dealer'
    )
  );

-- 매장주는 자기 매장 정보 수정 (사업자정보·연락처·로고 등)
CREATE POLICY stores_own_update ON public.stores
  FOR UPDATE USING (owner_user_id = auth.uid())
  WITH CHECK (owner_user_id = auth.uid());

-- ━━━ admin_overrides ━━━
-- 모두 read (방문자가 매장 카탈로그 볼 때 가격/노출 정보 필요)
CREATE POLICY overrides_read_all ON public.admin_overrides
  FOR SELECT USING (true);

-- super_admin 은 모두 write
CREATE POLICY overrides_super_all ON public.admin_overrides
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 매장주는 자기 매장 overrides 만 write
CREATE POLICY overrides_own_write ON public.admin_overrides
  FOR ALL USING (public.is_my_store(store_id))
  WITH CHECK (public.is_my_store(store_id));

-- ━━━ consultations ━━━
-- 누구나 INSERT 가능 (방문자가 상담 신청)
CREATE POLICY consult_insert_public ON public.consultations
  FOR INSERT WITH CHECK (true);

-- super_admin 은 모두
CREATE POLICY consult_super_all ON public.consultations
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 보이는 store_id 의 consultations 만 read/update/delete
CREATE POLICY consult_visible_view ON public.consultations
  FOR SELECT USING (store_id IN (SELECT public.my_visible_stores()));
CREATE POLICY consult_visible_update ON public.consultations
  FOR UPDATE USING (store_id IN (SELECT public.my_visible_stores()))
  WITH CHECK (store_id IN (SELECT public.my_visible_stores()));


-- ─── 5. 시드 (본부 + 첫 딜러 매장) ───────────────────────────

-- 본부 매장 (실제 사이트는 X, 권한 부여용)
INSERT INTO public.stores (slug, name, type)
VALUES ('_super', '본부', 'super_admin')
ON CONFLICT (slug) DO NOTHING;

-- 첫 딜러 매장
INSERT INTO public.stores (slug, name, type, biz_no, phone, address)
VALUES (
  'skmagic',
  'SK매직 인증파트너점',
  'dealer',
  '000-00-00000',
  '1588-0000',
  '서울특별시'
)
ON CONFLICT (slug) DO NOTHING;

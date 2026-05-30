-- ============================================================
-- 006_card_benefits — 제휴카드 관리
--   · card_benefits: 카드별 이미지 URL + 자세히보기 링크 (본부 공통 단일행, id=1)
--     payload(jsonb) = { cards: { "<key>": { image, link } , ... } }
--     카드명·할인표·연락처는 프런트(card-benefits.html)에 코드 고정, 여기선 이미지/링크만 오버라이드.
--   · storage 버킷 card-assets: 카드 이미지 파일 (public read, super_admin write)
--   read: 누구나 / write: super_admin(본부)
-- ============================================================

-- ─── 데이터 테이블 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.card_benefits (
  id          integer PRIMARY KEY,            -- 항상 1
  payload     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.card_benefits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS card_benefits_read_all  ON public.card_benefits;
DROP POLICY IF EXISTS card_benefits_super_all ON public.card_benefits;

CREATE POLICY card_benefits_read_all ON public.card_benefits
  FOR SELECT USING (true);
CREATE POLICY card_benefits_super_all ON public.card_benefits
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

GRANT SELECT ON public.card_benefits TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.card_benefits TO authenticated;

-- ─── Storage 버킷 (카드 이미지) ──────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('card-assets', 'card-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 버킷 정책: 누구나 읽기, super_admin(본부)만 업로드/수정/삭제
DROP POLICY IF EXISTS card_assets_read   ON storage.objects;
DROP POLICY IF EXISTS card_assets_write  ON storage.objects;
DROP POLICY IF EXISTS card_assets_update ON storage.objects;
DROP POLICY IF EXISTS card_assets_delete ON storage.objects;

CREATE POLICY card_assets_read ON storage.objects
  FOR SELECT USING (bucket_id = 'card-assets');
CREATE POLICY card_assets_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'card-assets' AND public.is_super_admin());
CREATE POLICY card_assets_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'card-assets' AND public.is_super_admin());
CREATE POLICY card_assets_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'card-assets' AND public.is_super_admin());

-- ─── 확인 ────────────────────────────────────────────────
SELECT 'card_benefits table + card-assets bucket ready' AS status;

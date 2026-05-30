-- ============================================================
-- 008_banners — 홈 히어로 배너/슬라이드 관리
--   · banner_data: 배너 목록 + 슬라이드 설정 (본부 공통 단일행, id=1)
--     payload(jsonb) = {
--       mode: 'auto' | 'manual',          -- 자동 전환 / 수동(화살표)
--       interval: 5,                       -- 자동 전환 간격(초)
--       items: [ { image, link, newTab, enabled }, ... ]  -- 순서 = 배열 순서, 최대 10개
--     }
--   · storage 버킷 banner-assets: 배너 이미지 (public read, super_admin write)
--   read: 누구나 / write: super_admin(본부)
-- ============================================================

-- ─── 데이터 테이블 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.banner_data (
  id          integer PRIMARY KEY,            -- 항상 1
  payload     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.banner_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS banner_data_read_all  ON public.banner_data;
DROP POLICY IF EXISTS banner_data_super_all ON public.banner_data;

CREATE POLICY banner_data_read_all ON public.banner_data
  FOR SELECT USING (true);
CREATE POLICY banner_data_super_all ON public.banner_data
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

GRANT SELECT ON public.banner_data TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.banner_data TO authenticated;

-- ─── Storage 버킷 (배너 이미지) ──────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('banner-assets', 'banner-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS banner_assets_read   ON storage.objects;
DROP POLICY IF EXISTS banner_assets_write  ON storage.objects;
DROP POLICY IF EXISTS banner_assets_update ON storage.objects;
DROP POLICY IF EXISTS banner_assets_delete ON storage.objects;

CREATE POLICY banner_assets_read ON storage.objects
  FOR SELECT USING (bucket_id = 'banner-assets');
CREATE POLICY banner_assets_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'banner-assets' AND public.is_super_admin());
CREATE POLICY banner_assets_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'banner-assets' AND public.is_super_admin());
CREATE POLICY banner_assets_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'banner-assets' AND public.is_super_admin());

-- ─── 확인 ────────────────────────────────────────────────
SELECT 'banner_data table + banner-assets bucket ready' AS status;

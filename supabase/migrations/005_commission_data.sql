-- ============================================================
-- commission_data — 수수료표(본부 공통 단일행, id=1)
--   엑셀 업로드로 파싱한 payload(jsonb) 전체를 한 행에 저장.
--   read: 누구나 (홈페이지/관리자에서 표시)
--   write: super_admin (본부) 만 — 수수료표는 본부가 관리
-- ============================================================

CREATE TABLE IF NOT EXISTS public.commission_data (
  id          integer PRIMARY KEY,            -- 항상 1
  payload     jsonb   NOT NULL,               -- { source, built_at, 품목순, rows }
  source      text,                           -- 표기용 출처(파일명/표 이름)
  built_at    text,                           -- 생성 기준일(YYYY-MM-DD)
  updated_at  timestamptz DEFAULT now()
);

-- ─── RLS ─────────────────────────────────────────────────
ALTER TABLE public.commission_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commission_read_all  ON public.commission_data;
DROP POLICY IF EXISTS commission_super_all ON public.commission_data;

-- 모두 read 가능 (비로그인 방문자 포함)
CREATE POLICY commission_read_all ON public.commission_data
  FOR SELECT USING (true);

-- super_admin(본부) 만 write
CREATE POLICY commission_super_all ON public.commission_data
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- ─── GRANT (테이블 단위 접근권 — RLS 가 행 단위 차단) ───────
GRANT SELECT ON public.commission_data TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.commission_data TO authenticated;

-- ─── 확인 ────────────────────────────────────────────────
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'commission_data'
ORDER BY policyname;

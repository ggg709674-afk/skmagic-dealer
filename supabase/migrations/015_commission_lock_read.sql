-- ============================================================
-- 015: commission_data 직접 read 를 본부(super_admin)로 제한
--   ★★ 반드시 014 + 클라이언트 코드(scoped RPC 사용)를 배포·검증한 "다음에" 실행할 것.
--      먼저 실행하면 라이브 카탈로그/산하 admin 이 원본 수수료를 못 읽어 잠깐 깨진다.
--
--   배경: 005 에서 commission_data 를 USING(true) 로 누구나 read 가능하게 둠
--         → 산하 매장/익명이 본부 원본 수수료표를 그대로 가져갈 수 있었음(역산 위험).
--   조치: 직접 SELECT 는 본부만. 그 외(카탈로그·산하 admin)는 get_commission_scoped() RPC 로만.
-- ============================================================

DROP POLICY IF EXISTS commission_read_all  ON public.commission_data;
DROP POLICY IF EXISTS commission_read_super ON public.commission_data;

-- 본부(super_admin)만 원본 직접 read (업로드/편집용)
CREATE POLICY commission_read_super ON public.commission_data
  FOR SELECT USING (public.is_super_admin());

-- write 정책(commission_super_all)은 005 그대로 유지.

-- ─── 확인 ────────────────────────────────────────────────
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'commission_data'
ORDER BY policyname;

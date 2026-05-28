-- ============================================================
-- RLS 무한 재귀 수정
-- 원인: stores 정책이 stores 를 자기참조 → 정책 평가 시 무한 루프
-- 해결: 헬퍼 함수에 row_security=off 강제 + 재귀 유발 정책은 제거(단순화)
-- ============================================================

-- ─── 1. 헬퍼 함수에 row_security 무력화 ──────────
ALTER FUNCTION public.is_super_admin()      SET row_security = off;
ALTER FUNCTION public.is_my_store(uuid)     SET row_security = off;
ALTER FUNCTION public.my_visible_stores()   SET row_security = off;

-- ─── 2. 재귀 유발 정책 삭제 ──────────────────────
-- (dealer 가 산하 shop 만들기 정책 — Phase 1 에선 super_admin 만 매장 생성)
DROP POLICY IF EXISTS stores_dealer_manage_shops ON public.stores;

-- ─── 3. 확인: 정책 목록 ──────────────────────────
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename IN ('stores','admin_overrides','consultations')
ORDER BY tablename, policyname;

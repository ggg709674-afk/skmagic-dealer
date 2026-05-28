-- ============================================================
-- anon / authenticated 역할에 테이블 접근 권한 부여
-- (RLS 로 행 단위 제어하더라도, 테이블 자체에 GRANT 필요)
-- ============================================================

-- 모든 페이지(비로그인 포함)에서 매장 정보·카탈로그 read 가능
GRANT SELECT ON public.stores            TO anon, authenticated;
GRANT SELECT ON public.admin_overrides   TO anon, authenticated;
GRANT SELECT ON public.consultations     TO authenticated;

-- 매장주/본부는 로그인 후 수정 가능 (RLS 가 행 단위 차단)
GRANT INSERT, UPDATE, DELETE ON public.stores          TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.admin_overrides TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.consultations   TO authenticated;

-- 상담 신청은 누구나 (비로그인 방문자도) 가능해야 함
GRANT INSERT ON public.consultations TO anon;

-- 시퀀스 (uuid 기본값이라 시퀀스 없지만 안전장치)
-- (gen_random_uuid 사용중이라 별도 grant 불필요)

-- 확인
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('stores','admin_overrides','consultations')
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;

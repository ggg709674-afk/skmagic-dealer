-- ============================================================
-- 012: 위임형 분양 — dealer(분양형)가 산하 shop(단독형) 생성/관리 재도입
-- ------------------------------------------------------------
-- 배경: 001 에 있던 stores_dealer_manage_shops 정책을 003 에서 "무한 재귀"
--       (stores 정책이 stores 를 인라인 서브쿼리로 자기참조) 때문에 DROP 했음.
--       → 그 뒤로 분양형이 산하 매장 분양 시 RLS 위반("violates row-level
--          security policy for table stores")으로 막혔다.
-- 해결: 자기참조 서브쿼리를 SECURITY DEFINER + row_security=off 헬퍼 함수로
--       감싸 재귀를 끊고, 정책을 다시 만든다. (깊이 1단계 — dealer 는 shop 만)
-- ============================================================

-- 내가 owner 이고 type='dealer' 인 매장인지 (정책 평가 중 stores RLS 재진입 방지)
CREATE OR REPLACE FUNCTION public.is_my_dealer_store(p_store_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET row_security = off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.stores
    WHERE id = p_store_id
      AND owner_user_id = auth.uid()
      AND type = 'dealer'
  );
$$;

-- 분양형(dealer)은 자기 산하 단독형(shop)만 생성/수정/삭제 가능
DROP POLICY IF EXISTS stores_dealer_manage_shops ON public.stores;
CREATE POLICY stores_dealer_manage_shops ON public.stores
  FOR ALL
  USING      (type = 'shop' AND public.is_my_dealer_store(parent_store_id))
  WITH CHECK (type = 'shop' AND public.is_my_dealer_store(parent_store_id));

-- 확인용
SELECT policyname, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'stores'
ORDER BY policyname;

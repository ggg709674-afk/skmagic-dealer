-- ============================================================
-- 013: 매장 정책(마진)그룹 컬럼
-- 본부가 본부산하 그룹/판매점에 정책그룹 A/B/C/D 를 지정 → 그 그룹 마진으로 수수료 산출.
-- 그룹산하 판매점은 그룹이 정하므로 본부는 지정 안 함(앱 레벨에서 제외).
-- ============================================================

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS margin_group text
  CHECK (margin_group IS NULL OR margin_group IN ('A','B','C','D'));

-- 본부(super_admin)는 stores_super_all 정책으로 모든 매장의 margin_group update 가능.
-- (별도 정책 불필요)

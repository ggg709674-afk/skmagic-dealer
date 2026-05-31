-- ============================================================
-- 011_store_margins.sql
--   판매점 마진 설정 저장용 — stores 에 margins(jsonb) 컬럼 추가.
--
--   margins 구조: { "<제품코드>|<형태>|<의무>": <마진금액(원)>, ... }
--     예) { "WPUJAC115SNW|방문형|36": 50000, ... }
--   정책테이블(수수료합계)에서 행별 마진을 차감해 판매점 공급가액·수수료를 산출.
--
--   ※ Supabase 대시보드 → SQL Editor 에서 실행할 것.
-- ============================================================

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS margins jsonb NOT NULL DEFAULT '{}'::jsonb;

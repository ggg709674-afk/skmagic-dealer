-- ============================================================
-- 019_store_customer_support.sql
--   고객지원금설정 — 매장별 고객지원금(손님 카드에 표시).
--   customer_support = { "<코드>|<형태>|<의무>": 금액(원), ... }  (평면, 마진 key와 동일)
--   매장별 독립(본부 상속 없음). 0/미설정 행은 저장 안 함.
--   ※ Supabase 대시보드 → SQL Editor 에 붙여넣어 실행. (먼저 실행해야 저장 가능)
-- ============================================================

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS customer_support jsonb NOT NULL DEFAULT '{}'::jsonb;

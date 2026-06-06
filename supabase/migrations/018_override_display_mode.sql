-- ============================================================
-- 018_override_display_mode.sql
--   상품관리 '카드 표시 기준'에 구분(신규렌탈/타사보상) 추가.
--   display_mode : 'new'(신규 렌탈) | 'compete'(타사 보상). null = 기본 'new'.
--   017(display_term/display_care)과 같은 매장별 표시기준 — 본부 base 상속 없음.
--   ※ Supabase 대시보드 → SQL Editor 에 붙여넣어 실행. (먼저 실행해야 admin 저장 가능)
-- ============================================================

ALTER TABLE public.admin_overrides
  ADD COLUMN IF NOT EXISTS display_mode text
    CHECK (display_mode IS NULL OR display_mode IN ('new', 'compete'));

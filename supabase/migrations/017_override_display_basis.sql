-- ============================================================
-- 017_override_display_basis.sql
--   상품관리 '표시 기준' — 카드(홈·카탈로그)에 대표로 노출할 약정·관리유형.
--   가격을 매장이 손으로 입력(price_regular 등)하던 방식을 폐기하고,
--   "어떤 약정(의무개월)·관리유형(셀프/방문) 기준으로 정책표 가격을 보여줄지"만 매장별로 선택.
--   → 가격은 항상 정책테이블에서 자동(정책·마진 일관성 유지). 임의 가격 입력 제거.
--
--   display_term : 의무개월(36/60/72/84 …). null = 기본 60(5년)
--   display_care : '셀프형' | '방문형'.        null = 기본 '셀프형'
--   ※ 기존 price_* 컬럼은 잔존(레거시 호환). 신규 입력 UI는 표시기준만.
--   ※ Supabase 대시보드 → SQL Editor 에 붙여넣어 실행할 것.
-- ============================================================

ALTER TABLE public.admin_overrides
  ADD COLUMN IF NOT EXISTS display_term integer,
  ADD COLUMN IF NOT EXISTS display_care text
    CHECK (display_care IS NULL OR display_care IN ('셀프형', '방문형'));

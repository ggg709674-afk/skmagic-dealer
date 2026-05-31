-- ============================================================
-- 010_consultation_status.sql
--   상담/주문 신청 상태(status)를 6단계로 확장.
--
--   신규접수(new) → 주문확인(confirmed) → 청약완료(subscribed) → 개통완료(activated)
--   + 보류(hold) / 취소(cancelled)
--
--   ※ 기존 값 매핑: pending→new, completed→activated (confirmed·cancelled 유지)
--   ※ Supabase 대시보드 → SQL Editor 에 붙여넣어 실행할 것.
-- ============================================================

-- 기존 CHECK 제약 제거 (4단계 제한)
ALTER TABLE public.consultations DROP CONSTRAINT IF EXISTS consultations_status_check;

-- 기존 데이터 매핑
UPDATE public.consultations SET status = 'new'       WHERE status = 'pending';
UPDATE public.consultations SET status = 'activated' WHERE status = 'completed';

-- 기본값 변경 (신규 신청 = 신규접수)
ALTER TABLE public.consultations ALTER COLUMN status SET DEFAULT 'new';

-- 새 6단계 CHECK 제약
ALTER TABLE public.consultations ADD CONSTRAINT consultations_status_check
  CHECK (status IN ('new', 'confirmed', 'subscribed', 'activated', 'hold', 'cancelled'));

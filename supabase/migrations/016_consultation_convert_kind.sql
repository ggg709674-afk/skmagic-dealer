-- ============================================================
-- 016_consultation_convert_kind.sql
--   상담/주문 신청 유형(kind)에 '전환구매(convert)' 추가.
--   상담(consult)으로 들어온 건이 실제 구매로 이어지면 상세에서 '전환구매'로 변경.
--
--   kind: 'consult'(상담) / 'order'(주문) / 'convert'(전환구매)
--   ※ 009 에서 kind 컬럼을 인라인 CHECK(consult|order)로 추가했음 → 그 제약을 교체.
--   ※ Supabase 대시보드 → SQL Editor 에 붙여넣어 실행할 것.
-- ============================================================

-- 009 의 인라인 CHECK 제거(자동명 consultations_kind_check) 후 3종으로 재생성
ALTER TABLE public.consultations DROP CONSTRAINT IF EXISTS consultations_kind_check;

ALTER TABLE public.consultations
  ADD CONSTRAINT consultations_kind_check
  CHECK (kind IN ('consult', 'order', 'convert'));

-- ─── 확인 ────────────────────────────────────────────────
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.consultations'::regclass AND conname = 'consultations_kind_check';

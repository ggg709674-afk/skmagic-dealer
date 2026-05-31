-- ============================================================
-- 009_consultation_fields.sql
--   consultations 테이블에 신청 유형(kind) + 주문용 추가정보 컬럼.
--
--   - kind             : 'consult'(상담 — 이름·연락처만) / 'order'(주문 — 전체정보)
--   - customer_birth   : 생년월일 (주문 kind='order' 일 때만 채움)
--   - customer_address : 주소     (주문 kind='order' 일 때만 채움)
--
--   ※ 기존 행은 기본값 'consult' 로 간주된다.
--   ※ Supabase 대시보드 → SQL Editor 에 붙여넣어 실행할 것.
-- ============================================================

ALTER TABLE public.consultations
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'consult'
    CHECK (kind IN ('consult', 'order')),
  ADD COLUMN IF NOT EXISTS customer_birth   text,
  ADD COLUMN IF NOT EXISTS customer_address text;

-- 유형별 조회 빈도 대비 인덱스(선택)
CREATE INDEX IF NOT EXISTS idx_consult_kind ON public.consultations(kind);

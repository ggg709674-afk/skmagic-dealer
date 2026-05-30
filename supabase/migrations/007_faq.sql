-- ============================================================
-- 007_faq — 자주 묻는 질문(FAQ) 관리
--   · faq_data: 질문/답변 목록 (본부 공통 단일행, id=1)
--     payload(jsonb) = { items: [ { q, a }, ... ] }
--     질문/답변 텍스트 자체를 admin(FAQ 관리)에서 추가·삭제·편집.
--     DB가 비어 있으면 프런트(faq.html)·admin 양쪽 코드의 기본 FAQ를 사용.
--   read: 누구나 / write: super_admin(본부)
-- ============================================================

-- ─── 데이터 테이블 ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.faq_data (
  id          integer PRIMARY KEY,            -- 항상 1
  payload     jsonb   NOT NULL DEFAULT '{}'::jsonb,
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.faq_data ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS faq_data_read_all  ON public.faq_data;
DROP POLICY IF EXISTS faq_data_super_all ON public.faq_data;

CREATE POLICY faq_data_read_all ON public.faq_data
  FOR SELECT USING (true);
CREATE POLICY faq_data_super_all ON public.faq_data
  FOR ALL USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

GRANT SELECT ON public.faq_data TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.faq_data TO authenticated;

-- ─── 확인 ────────────────────────────────────────────────
SELECT 'faq_data table ready' AS status;

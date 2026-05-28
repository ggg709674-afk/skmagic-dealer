-- ============================================================
-- 본부 계정(super_admin) 을 stores._super 행에 연결
-- 선행조건: Supabase Authentication → Users 에 ggg709674@gmail.com 가입 완료
-- ============================================================

UPDATE public.stores
SET owner_user_id = (
  SELECT id FROM auth.users WHERE email = 'ggg709674@gmail.com' LIMIT 1
)
WHERE slug = '_super';

-- 확인 — 연결됐는지
SELECT slug, name, type, owner_user_id IS NOT NULL AS linked
FROM public.stores
WHERE slug IN ('_super', 'skmagic');

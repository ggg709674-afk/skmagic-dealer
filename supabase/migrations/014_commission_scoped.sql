-- ============================================================
-- 014: 수수료표 서버측 스코프 계산 RPC
--   목적: 산하 매장 브라우저로 "본부 원본 수수료"가 절대 내려가지 않게 한다.
--         원본을 클라가 받아서 빼던 구조(번쩍임·엑셀 원본노출·콘솔 역산)를 폐기하고,
--         서버가 호출자(auth.uid)에 맞춰 "이미 차감된 수수료합계"만 돌려준다.
--
--   반환: commission_data.payload 와 같은 모양(jsonb) + _scope / fee_hidden 추가.
--         rows[].수수료합계 는 호출자 기준으로 차감(또는 제거)된 값.
--         고객가(기준가·기본요금·타사보상 등)는 그대로 통과 → 카탈로그/상품관리 정상.
--
--   호출자별 동작:
--     - 비로그인(anon, 카탈로그)        : 수수료합계 제거(고객가만)
--     - 본부(super_admin / 본부메인 skmagic) : 원본 그대로
--     - 본부직속(부모가 본부)            : 정책그룹 미지정 → 숨김(fee_hidden),
--                                          지정 → 본부 margins[그 그룹] 차감
--     - 그룹산하 판매점(부모가 dealer)    : 본부마진(조부의 그룹) + 그룹마진 = cascade
--                                          ("그룹이 받는 금액 − 그룹마진" 과 일치)
--
--   SECURITY DEFINER + row_security off → commission_data·stores 를 RLS 우회해 읽음.
--   (012/003 헬퍼와 같은 패턴)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_commission_scoped()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET row_security = off
AS $$
DECLARE
  v_payload  jsonb;
  v_uid      uuid := auth.uid();
  v_store    public.stores%ROWTYPE;
  v_parent   public.stores%ROWTYPE;
  v_grand    public.stores%ROWTYPE;
  v_hq       jsonb;
  v_margins  jsonb := '{}'::jsonb;   -- key("코드|형태|의무") → 차감금액(원)
  v_hidden   boolean := false;
  v_scope    text;
  v_rows     jsonb := '[]'::jsonb;
  r          jsonb;
  k          text;
  v_key      text;
  v_fee      numeric;
  v_ded      numeric;
BEGIN
  SELECT payload INTO v_payload FROM public.commission_data WHERE id = 1;
  IF v_payload IS NULL THEN
    RETURN NULL;
  END IF;

  -- 1) 비로그인 카탈로그 → 수수료 제거
  IF v_uid IS NULL THEN
    v_scope := 'anon';

  -- 2) 본부(super_admin) → 원본 그대로(신뢰)
  ELSIF public.is_super_admin() THEN
    RETURN v_payload || jsonb_build_object('_scope', 'original', 'fee_hidden', false);

  ELSE
    SELECT * INTO v_store FROM public.stores WHERE owner_user_id = v_uid LIMIT 1;

    IF v_store.id IS NULL THEN
      -- 연결된 매장 없는 외부 앱 계정 → 수수료 제거
      v_scope := 'anon';

    -- 본부 메인(skmagic) 도 본부 취급 → 원본
    ELSIF v_store.type = 'super_admin' OR v_store.slug = 'skmagic' THEN
      RETURN v_payload || jsonb_build_object('_scope', 'original', 'fee_hidden', false);

    ELSE
      SELECT * INTO v_parent FROM public.stores WHERE id = v_store.parent_store_id;

      IF v_parent.id IS NOT NULL
         AND (v_parent.type = 'super_admin' OR v_parent.slug = 'skmagic') THEN
        -- 본부직속(그룹 dealer / 본부직속 shop)
        IF v_store.margin_group IS NULL THEN
          v_hidden := true; v_scope := 'hidden';
        ELSE
          v_margins := COALESCE(v_parent.margins -> v_store.margin_group, '{}'::jsonb);
          v_scope   := 'deducted';
        END IF;

      ELSE
        -- 그룹산하 판매점(부모가 일반 dealer) → 본부마진 + 그룹마진(cascade)
        v_scope := 'deducted';
        IF v_parent.id IS NOT NULL THEN
          v_margins := COALESCE(v_parent.margins, '{}'::jsonb);   -- 그룹 자기 마진(평면)
          SELECT * INTO v_grand FROM public.stores WHERE id = v_parent.parent_store_id;
          IF v_grand.id IS NOT NULL AND v_parent.margin_group IS NOT NULL THEN
            v_hq := COALESCE(v_grand.margins -> v_parent.margin_group, '{}'::jsonb);  -- 본부마진(그룹의 정책그룹)
            FOR k IN SELECT jsonb_object_keys(v_hq) LOOP
              v_margins := jsonb_set(
                v_margins, ARRAY[k],
                to_jsonb( COALESCE((v_margins ->> k)::numeric, 0) + COALESCE((v_hq ->> k)::numeric, 0) )
              );
            END LOOP;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  -- 3) rows 재구성
  FOR r IN SELECT * FROM jsonb_array_elements(v_payload -> 'rows') LOOP
    IF v_scope = 'anon' OR v_hidden THEN
      r := r - '수수료합계';                 -- 제거(공급가액은 payload에 없음 → 클라가 /1.1)
    ELSIF v_scope = 'deducted' THEN
      v_key := COALESCE(r ->> '코드','') || '|' || COALESCE(r ->> '형태','') || '|' || COALESCE(r ->> '의무','null');
      v_fee := NULLIF(r ->> '수수료합계', '')::numeric;
      IF v_fee IS NOT NULL THEN
        v_ded := COALESCE((v_margins ->> v_key)::numeric, 0);
        r := jsonb_set(r, ARRAY['수수료합계'], to_jsonb( GREATEST(0, v_fee - v_ded) ));
      END IF;
    END IF;
    v_rows := v_rows || jsonb_build_array(r);
  END LOOP;

  RETURN jsonb_set(v_payload, ARRAY['rows'], v_rows)
         || jsonb_build_object('_scope', v_scope, 'fee_hidden', v_hidden);
END;
$$;

-- 누구나(카탈로그 포함) 호출 가능 — 함수 내부에서 호출자별로 스코프
GRANT EXECUTE ON FUNCTION public.get_commission_scoped() TO anon, authenticated;

-- ─── 확인 ────────────────────────────────────────────────
-- SELECT (public.get_commission_scoped() -> '_scope');

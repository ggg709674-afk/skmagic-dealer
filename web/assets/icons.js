/* SVG 아이콘 모음 — 모든 아이콘은 currentColor 사용
   사용법: ICONS.water() 처럼 호출 → SVG 문자열 반환 */

const ICONS = {
  // 브랜드 마크 (물방울 + 매직 별)
  logo: () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 L7 9 a6 6 0 1 0 10 0 Z" fill="currentColor" opacity=".25"/><path d="M12 2 L7 9 a6 6 0 1 0 10 0 Z"/><path d="M16 14 l1 2 2 .5 -2 .5 -1 2 -1 -2 -2 -.5 2 -.5 z" fill="currentColor"/></svg>`,
  // 검색
  search: () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`,
  // 카트
  cart: () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.7 12.4a2 2 0 0 0 2 1.6h7.6a2 2 0 0 0 2-1.6L21 7H6"/></svg>`,
  // 사용자
  user: () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 5-6 8-6s6.5 2 8 6"/></svg>`,
  // 메뉴
  menu: () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  // 전화
  phone: () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.4 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z"/></svg>`,
  // 채팅 말풍선 (상담)
  chat: () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>`,
  // 화살표
  arrow: () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 5l7 7-7 7"/></svg>`,
  // 체크
  check: () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`,

  // ===== 카테고리 아이콘 =====
  // 정수기 — 물방울 (viewBox 안에서 약간 작게 그려서 다른 아이콘과 시각 크기 일치)
  water: () => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M16 7 C 13 13, 10 16.5, 10 19.5 a 6 6 0 0 0 12 0 C 22 16.5, 19 13, 16 7 Z"/>
    <path d="M13 20 a 3 3 0 0 1 1.5 -3" opacity=".55"/>
  </svg>`,
  // 공기청정기 — 타워형 + 그릴 + 인디케이터
  air: () => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="8" y="3" width="16" height="26" rx="3.5"/>
    <circle cx="16" cy="11" r="3.5"/>
    <path d="M16 9.5 v3 M14.7 11 h2.6" opacity=".55"/>
    <path d="M11 19h10 M11 22h10 M11 25h10" opacity=".45"/>
    <circle cx="20" cy="6" r=".8" fill="currentColor" opacity=".7"/>
  </svg>`,
  // 비데 — 옆모습 (탱크 + 시트 + 컨트롤 패널)
  bidet: () => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 16 q0 -4 4 -4 h10 q4 0 4 4 v2 q0 3.5 -3.5 3.5 h-11 q-3.5 0 -3.5 -3.5 z"/>
    <path d="M22 12 v-3 q0 -2 -2 -2 h-8 q-2 0 -2 2 v3"/>
    <rect x="20.5" y="7.5" width="4" height="2.5" rx=".8" opacity=".55"/>
    <circle cx="22" cy="8.7" r=".5" fill="currentColor"/>
    <path d="M10 21.5 v3 M22 21.5 v3" opacity=".6"/>
  </svg>`,
  // 매트리스 — 베개 + 본체 + 퀼팅 라인
  mattress: () => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4" y="9" width="9" height="4" rx="1.5" opacity=".7"/>
    <rect x="3" y="13" width="26" height="11" rx="3"/>
    <path d="M3 17.5 h26" opacity=".5"/>
    <path d="M9 18 l1.5 2.5 M16 18 l1.5 2.5 M23 18 l1.5 2.5" opacity=".4"/>
    <path d="M5 24 v3 M27 24 v3" opacity=".7"/>
  </svg>`,
  // 프레임 — 침대
  bed: () => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M3 25v-9a3 3 0 0 1 3-3h13v6h10v6"/>
    <path d="M3 21h26"/>
    <circle cx="11" cy="16" r="2.5" opacity=".7"/>
  </svg>`,
  // 필터
  filter: () => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <rect x="11" y="4" width="10" height="6" rx="1.5"/>
    <path d="M9 10h14l-2 16a3 3 0 0 1-3 2.5h-4a3 3 0 0 1-3-2.5L9 10Z"/>
    <path d="M12 14h8M12 18h8M12 22h8" opacity=".5"/>
  </svg>`,
  // 일시불 — 카드
  card: () => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="7" width="26" height="18" rx="3"/>
    <path d="M3 13h26"/>
    <path d="M7 20h6" opacity=".7"/>
  </svg>`,
  // 일반 박스 (fallback)
  box: () => `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
    <path d="M4 10l12-6 12 6v12l-12 6-12-6V10Z"/>
    <path d="M4 10l12 6 12-6M16 16v12" opacity=".6"/>
  </svg>`,

  // ===== 히어로 작은 아이콘들 =====
  spark: () => `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2 13 9 20 10 13 11 12 18 11 11 4 10 11 9 Z"/></svg>`,
  shield: () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4Z"/><path d="m9 12 2 2 4-4"/></svg>`,
  truck: () => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7h12v10H2zM14 11h4l3 3v3h-7"/><circle cx="6.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/></svg>`,
};

window.ICONS = ICONS;

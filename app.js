// =========================================================
// 다이어리 - 바이브 코딩 실습
//
// 앱의 진입점(Entry Point)입니다.
// 각 모듈의 초기화 및 이벤트 배선만 담당합니다.
// =========================================================

import { initEditor } from "./entries.js";
import { initProfileHandlers } from "./profile.js";
import { initNotices } from "./notice.js";
import { initNotify } from "./notify.js";
import { initDday } from "./dday.js";
import { initSearchFilter } from "./render.js";
import { initCalendar } from "./calendar.js";
import { initChangelog } from "./changelog.js";
import { initAuth } from "./auth.js";

// ---------------------------------------------------------
// 앱 초기화 및 이벤트 배선
// ---------------------------------------------------------

// 1. 에디터, 사진 첨부 및 그림판 툴바 이벤트 배선
initEditor();

// 2. 프로필 변경 버튼 이벤트 배선
initProfileHandlers();

// 3. 상단 공지사항 모듈 초기화 및 실시간 구독
initNotices();

// 4. 실시간 알림 모듈 초기화 (브라우저 알림 & 토스트)
initNotify();

// 5. 디데이(D-Day) 기념일 모듈 초기화
initDday();

// 6. 실시간 키워드 검색 및 필터링 초기화
initSearchFilter();

// 7. 캘린더(달력) 뷰 모드 초기화
initCalendar();

// 8. 업데이트 내역 모달 초기화
initChangelog();

// 9. 인증 배선 및 로그인 상태 감시 시작
// initAuth()는 반드시 마지막에 호출한다. onAuthStateChanged 콜백이
// DOM 이벤트 배선보다 먼저 발동하면 안 되기 때문이다. 순서를 바꾸지 말 것.
initAuth();

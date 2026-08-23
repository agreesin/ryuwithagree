// =========================================================
// 다이어리 - 바이브 코딩 실습
//
// 앱의 진입점(Entry Point)입니다.
// 각 모듈의 초기화 및 이벤트 배선만 담당합니다.
// =========================================================

import { initEditor } from "./entries.js";
import { initProfileHandlers } from "./profile.js";
import { initNotices } from "./notice.js";
import { initAuth } from "./auth.js";

// ---------------------------------------------------------
// 앱 초기화 및 이벤트 배선
// ---------------------------------------------------------

// 1. 에디터 및 그림판 툴바 이벤트 배선
initEditor();

// 2. 프로필 변경 버튼 이벤트 배선
initProfileHandlers();

// 3. 상단 공지사항 모듈 초기화 및 실시간 구독
initNotices();

// 4. 인증 배선 및 로그인 상태 감시 시작
// initAuth()는 반드시 마지막에 호출한다. onAuthStateChanged 콜백이
// DOM 이벤트 배선보다 먼저 발동하면 안 되기 때문이다. 순서를 바꾸지 말 것.
initAuth();

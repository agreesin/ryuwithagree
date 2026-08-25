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
import { initSearchFilter, render } from "./render.js";
import { initCalendar } from "./calendar.js";
import { initChangelog } from "./changelog.js";
import { initAuth } from "./auth.js";

/**
 * 상단 '류이어리' 타이틀 클릭 시 홈 뷰 복귀, 검색/필터 초기화 및 최상단 스크롤
 */
function initHeaderHome() {
  const headerHomeBtn = document.getElementById("header-home-btn");
  if (!headerHomeBtn) return;

  headerHomeBtn.addEventListener("click", () => {
    // 1. 피드 보기 모드로 복귀
    const viewTabFeed = document.getElementById("view-tab-feed");
    const viewTabCal = document.getElementById("view-tab-cal");
    const feedViewSection = document.getElementById("feed-view-section");
    const calViewSection = document.getElementById("calendar-view-section");

    if (viewTabFeed && viewTabCal) {
      viewTabFeed.classList.add("active");
      viewTabCal.classList.remove("active");
    }
    if (feedViewSection) feedViewSection.hidden = false;
    if (calViewSection) calViewSection.hidden = true;

    // 2. 검색창 및 필터 초기화
    const searchInput = document.getElementById("search-input");
    const searchClearBtn = document.getElementById("search-clear-btn");
    if (searchInput) searchInput.value = "";
    if (searchClearBtn) searchClearBtn.hidden = true;

    const filterMoodBtns = document.querySelectorAll(".filter-mood-btn");
    filterMoodBtns.forEach((b) => {
      if (b.dataset.mood === "all") b.classList.add("active");
      else b.classList.remove("active");
    });

    const filterAuthorBtns = document.querySelectorAll(".filter-author-btn");
    filterAuthorBtns.forEach((b) => {
      if (b.dataset.author === "all") b.classList.add("active");
      else b.classList.remove("active");
    });

    // 3. 목록 다시 렌더링
    render();

    // 4. 화면 최상단으로 부드럽게 스크롤
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

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

// 9. 헤더 홈 이동/새로고침 배선
initHeaderHome();

// 10. 인증 배선 및 로그인 상태 감시 시작
// initAuth()는 반드시 마지막에 호출한다. onAuthStateChanged 콜백이
// DOM 이벤트 배선보다 먼저 발동하면 안 되기 때문이다. 순서를 바꾸지 말 것.
initAuth();

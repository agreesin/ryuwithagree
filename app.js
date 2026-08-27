// =========================================================
// 다이어리 - 바이브 코딩 실습
//
// 앱의 진입점(Entry Point)입니다.
// 각 모듈의 초기화 및 이벤트 배선만 담당합니다.
// =========================================================

import { initEditor } from "./entries.js?v=3.0.5";
import { initProfileHandlers } from "./profile.js?v=3.0.5";
import { initNotices } from "./notice.js?v=3.0.5";
import { initNotify } from "./notify.js?v=3.0.5";
import { initDday } from "./dday.js?v=3.0.5";
import { initSearchFilter, render } from "./render.js?v=3.0.5";
import { initCalendar } from "./calendar.js?v=3.0.5";
import { initChangelog } from "./changelog.js?v=3.0.5";
import { initAuth } from "./auth.js?v=3.0.5";

/** 개별 격리 실행: 하나의 모듈에서 오류가 나도 다른 모듈은 정상 실행 */
function safe(name, fn) {
  try {
    fn();
  } catch (err) {
    console.warn(`[app] ${name} 초기화 경고:`, err);
  }
}

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
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  });
}

function boot() {
  // 1. 인증 및 로그인 상태 감시 최우선 실행
  safe("initAuth", initAuth);

  // 2. 각 UI 및 보조 모듈 초기화
  safe("initHeaderHome", initHeaderHome);
  safe("initEditor", initEditor);
  safe("initProfileHandlers", initProfileHandlers);
  safe("initNotices", initNotices);
  safe("initNotify", initNotify);
  safe("initDday", initDday);
  safe("initSearchFilter", initSearchFilter);
  safe("initCalendar", initCalendar);
  safe("initChangelog", initChangelog);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}




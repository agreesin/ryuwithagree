// =========================================================
// 다이어리 - 바이브 코딩 실습
//
// 앱의 진입점(Entry Point)입니다.
// 각 모듈의 초기화 및 이벤트 배선만 담당합니다.
// =========================================================

// [중요] 모든 내부 import에서 ?v= 쿼리를 제거했습니다 (중복 인스턴스 방지).
// 캐시 무효화는 index.html의 app.js?v=... 로만 처리합니다.
import { initEditor } from "./entries.js";
import { initProfileHandlers } from "./profile.js";
import { initNotices } from "./notice.js";
import { initNotify } from "./notify.js";
import { initDday } from "./dday.js";
import { initSearchFilter, render } from "./render.js";
import { initCalendar } from "./calendar.js";
import { initChangelog } from "./changelog.js";
import { initAuth } from "./auth.js";

const BOOT_WATCHDOG_MS = 7000;

function reportBootError(name, err) {
  console.error(`[app] ${name} 실패:`, err);
  const box = document.getElementById("boot-error");
  if (box) {
    box.style.display = "block";
    box.textContent += `[init:${name}] ${(err && (err.stack || err.message)) || err}\n`;
  }
}

/** 개별 격리 실행: 하나가 실패해도 나머지는 계속 진행 */
function safe(name, fn) {
  try {
    fn();
  } catch (err) {
    reportBootError(name, err);
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

/** 7초 후에도 아무 화면도 안 떠 있으면 강제로 로그인 화면 노출 */
function startWatchdog() {
  setTimeout(() => {
    const login = document.getElementById("login-area");
    const app = document.getElementById("app-area");
    const pass = document.getElementById("passcode-modal");
    const nothingVisible =
      (!login || login.hidden) && (!app || app.hidden) && (!pass || pass.hidden);
    if (nothingVisible) {
      if (login) login.hidden = false;
      reportBootError(
        "watchdog",
        "인증 상태를 확인하지 못했습니다. 네트워크 또는 Firebase Auth 초기화 실패 가능성."
      );
    }
  }, BOOT_WATCHDOG_MS);
}

function boot() {
  startWatchdog();

  // [핵심] 인증을 가장 먼저 실행. 다른 모듈 실패가 화면 렌더를 막지 못하게 함.
  safe("initAuth", initAuth);

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

// readyState 가드 (문서 로딩 상태 안전 체크)
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

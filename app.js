// =========================================================
// app.js - 앱 진입점(Entry Point)
// 각 모듈의 초기화 및 이벤트 배선만 담당합니다.
// =========================================================

import { initEditor } from "./entries.js";
import { initProfileHandlers } from "./profile.js";
import { initNotices } from "./notice.js";
import { initNotify } from "./notify.js";
import { initDday } from "./dday.js";
import { initSearchFilter, resetFilters } from "./render.js";
import { initCalendar, switchViewTab } from "./calendar.js";
import { initChangelog } from "./changelog.js";
import { initAuth } from "./auth.js";
import { initReport } from "./report.js";
import { initModalAccessibility, initTheme } from "./ui.js";
import { initDailyQuestion } from "./daily-question.js";
import { initNudge } from "./nudge.js";
import { initGestures } from "./gestures.js";

/** 개별 격리 실행: 하나의 모듈에서 오류가 나도 다른 모듈은 정상 실행 */
function safe(name, fn) {
  try {
    fn();
  } catch (err) {
    console.warn(`[app] ${name} 초기화 경고:`, err);
  }
}

/**
 * 상단 '류이어리' 로고 클릭 시 홈 뷰 복귀, 검색/필터 상태 완전 초기화 및 최상단 스크롤
 */
function initHeaderHome() {
  const headerHomeBtn = document.getElementById("header-home-btn");
  if (!headerHomeBtn) return;

  headerHomeBtn.addEventListener("click", () => {
    switchViewTab("feed");
    resetFilters();
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  });
}

function boot() {
  // 0. 테마(라이트/다크) 최우선 적용 (깜빡임 최소화)
  safe("initTheme", initTheme);

  // 1. 인증 및 로그인 상태 감시 실행
  safe("initAuth", initAuth);

  // 2. 각 UI 및 보조 모듈 초기화
  safe("initHeaderHome", initHeaderHome);
  safe("initEditor", initEditor);
  safe("initProfileHandlers", initProfileHandlers);
  safe("initNotices", initNotices);
  safe("initNotify", initNotify);
  safe("initDday", initDday);
  safe("initDailyQuestion", initDailyQuestion);
  safe("initNudge", initNudge);
  safe("initSearchFilter", initSearchFilter);
  safe("initCalendar", initCalendar);
  safe("initChangelog", initChangelog);
  safe("initReport", initReport);
  safe("initModalAccessibility", initModalAccessibility);
  safe("initGestures", initGestures);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}

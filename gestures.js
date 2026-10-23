// =========================================================
// gestures.js - 모바일 터치 제스처 & Pull-to-refresh & 오프라인 상태 관리 모듈
//
// 1. 피드 / 달력 / 오늘의 질문 3단 탭 간 실시간 터치 드래그 & 좌우 스와이프 전환 애니메이션
// 2. iOS PWA / 모바일 최상단 당겨서 새로고침 (Pull-to-refresh)
// 3. 오프라인 네트워크 감지 및 낙관적 UI 안내 배너
// =========================================================

import { switchViewTab, getCurrentViewTab, renderCalendar } from "./calendar.js";
import { showToastNotification } from "./notify.js";
import { render } from "./render.js";
import { renderCurrentDateQuestion } from "./daily-question.js";

const TAB_KEYS = ["feed", "cal", "question"];

/**
 * 현재 활성화된 섹션 DOM 요소를 반환합니다.
 */
function getActiveSection(tabKey = getCurrentViewTab()) {
  if (tabKey === "feed") return document.getElementById("feed-view-section");
  if (tabKey === "cal") return document.getElementById("calendar-view-section");
  if (tabKey === "question") return document.getElementById("question-view-section");
  return null;
}

/**
 * 섹션 요소의 인라인 변형 스타일을 안전하게 초기화합니다.
 */
function resetSectionStyle(sec) {
  if (!sec) return;
  sec.style.transform = "";
  sec.style.transition = "";
  sec.style.opacity = "";
}

/**
 * 3단 탭 간 모바일 실시간 터치 드래그 및 좌우 스와이프 전환 애니메이션을 초기화합니다.
 */
function initSwipeTabs() {
  const appArea = document.getElementById("app-area");
  if (!appArea) return;

  let startX = 0;
  let startY = 0;
  let startTime = 0;
  let isSwipeCandidate = false;
  let isDragging = false;
  let activeSection = null;

  appArea.addEventListener(
    "touchstart",
    (e) => {
      if (e.touches.length !== 1) {
        isSwipeCandidate = false;
        isDragging = false;
        return;
      }

      const target = e.target;
      // 터치 무시 요소 필터링: 캔버스, 모달, 폼 입력, 캐러셀 트랙, 가로 스크롤 영역
      if (
        target.closest("#drawing-canvas") ||
        target.closest("#drawing-container") ||
        target.closest(".canvas-wrapper") ||
        target.closest(".entry-carousel") ||
        target.closest(".entry-carousel-track") ||
        target.closest(".mood-options") ||
        target.closest(".filter-chips") ||
        target.closest(".dq-chat-messages") ||
        target.closest(".dq-history-list") ||
        target.closest(".modal-overlay") ||
        target.closest("input") ||
        target.closest("textarea") ||
        target.closest("button") ||
        target.closest("select")
      ) {
        isSwipeCandidate = false;
        isDragging = false;
        return;
      }

      const touch = e.touches[0];
      startX = touch.clientX;
      startY = touch.clientY;
      startTime = Date.now();
      isSwipeCandidate = true;
      isDragging = false;
      activeSection = getActiveSection();
      if (activeSection) {
        activeSection.style.transition = "none";
      }
    },
    { passive: true }
  );

  appArea.addEventListener(
    "touchmove",
    (e) => {
      if (!isSwipeCandidate || !activeSection) return;
      if (e.touches.length !== 1) return;

      const touch = e.touches[0];
      const diffX = touch.clientX - startX;
      const diffY = touch.clientY - startY;

      // 사용자가 수직으로 스크롤 중이면 스와이프 후보에서 즉시 제외 (자연스러운 본문 스크롤 보장)
      if (!isDragging && Math.abs(diffY) > Math.abs(diffX) && Math.abs(diffY) > 8) {
        isSwipeCandidate = false;
        resetSectionStyle(activeSection);
        return;
      }

      // 수평 스와이프 의도가 명확해지면 실시간 반응형 드래그 애니메이션 시작
      if (Math.abs(diffX) > 10 && Math.abs(diffX) > Math.abs(diffY) * 1.2) {
        isDragging = true;
        const currentTab = getCurrentViewTab();
        const currentIndex = TAB_KEYS.indexOf(currentTab);

        // 첫 번째 탭에서 오른쪽으로 당기거나, 마지막 탭에서 왼쪽으로 당길 때는 쫀득한 고무줄 저항감 부여
        let moveX;
        if ((currentIndex === 0 && diffX > 0) || (currentIndex === TAB_KEYS.length - 1 && diffX < 0)) {
          moveX = diffX * 0.25;
        } else {
          moveX = diffX * 0.72;
        }

        // 최대 드래그 이동폭 제한 (-90px ~ 90px)
        moveX = Math.max(-90, Math.min(90, moveX));

        activeSection.style.transform = `translate3d(${moveX}px, 0, 0)`;
        activeSection.style.opacity = String(1 - Math.min(Math.abs(moveX) / 320, 0.35));
      }
    },
    { passive: true }
  );

  appArea.addEventListener(
    "touchend",
    (e) => {
      if (!isSwipeCandidate || !activeSection) return;
      isSwipeCandidate = false;

      const currentTab = getCurrentViewTab();
      const currentIndex = TAB_KEYS.indexOf(currentTab);

      if (!e.changedTouches || e.changedTouches.length === 0) {
        resetSectionStyle(activeSection);
        return;
      }

      const touch = e.changedTouches[0];
      const diffX = touch.clientX - startX;
      const diffY = touch.clientY - startY;
      const elapsed = Date.now() - startTime;

      // 빠른 플릭(속도) 또는 충분한 드래그 거리(50px) 판정
      const isQuickFlick = elapsed < 320 && Math.abs(diffX) > 38 && Math.abs(diffX) > Math.abs(diffY) * 1.5;
      const isLongSwipe = Math.abs(diffX) >= 55 && Math.abs(diffX) > Math.abs(diffY) * 1.35;

      if ((isQuickFlick || isLongSwipe) && currentIndex !== -1) {
        if (diffX < 0 && currentIndex < TAB_KEYS.length - 1) {
          // 왼쪽으로 스와이프 (손가락: 오른쪽 ➔ 왼쪽) ➔ 다음 탭 이동
          const nextTab = TAB_KEYS[currentIndex + 1];
          activeSection.style.transition = "transform 0.16s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.16s ease";
          activeSection.style.transform = "translate3d(-60px, 0, 0)";
          activeSection.style.opacity = "0.2";

          setTimeout(() => {
            resetSectionStyle(activeSection);
            switchViewTab(nextTab, "left");
            if (navigator.vibrate) navigator.vibrate(12);
          }, 90);
          return;
        } else if (diffX > 0 && currentIndex > 0) {
          // 오른쪽으로 스와이프 (손가락: 왼쪽 ➔ 오른쪽) ➔ 이전 탭 이동
          const prevTab = TAB_KEYS[currentIndex - 1];
          activeSection.style.transition = "transform 0.16s cubic-bezier(0.2, 0.9, 0.3, 1), opacity 0.16s ease";
          activeSection.style.transform = "translate3d(60px, 0, 0)";
          activeSection.style.opacity = "0.2";

          setTimeout(() => {
            resetSectionStyle(activeSection);
            switchViewTab(prevTab, "right");
            if (navigator.vibrate) navigator.vibrate(12);
          }, 90);
          return;
        }
      }

      // 전환 임계치에 도달하지 못한 경우 부드러운 스프링 원위치 복귀
      if (isDragging) {
        activeSection.style.transition = "transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.25s ease";
        activeSection.style.transform = "translate3d(0, 0, 0)";
        activeSection.style.opacity = "1";
        setTimeout(() => {
          resetSectionStyle(activeSection);
        }, 260);
      } else {
        resetSectionStyle(activeSection);
      }
    },
    { passive: true }
  );

  appArea.addEventListener(
    "touchcancel",
    () => {
      isSwipeCandidate = false;
      isDragging = false;
      if (activeSection) {
        resetSectionStyle(activeSection);
      }
    },
    { passive: true }
  );
}

/**
 * iOS PWA 및 모바일 환경을 위한 당겨서 새로고침(Pull-to-refresh)을 초기화합니다.
 */
function initPullToRefresh() {
  const ptrIndicator = document.getElementById("ptr-indicator");
  const ptrIcon = document.getElementById("ptr-icon");
  const ptrText = document.getElementById("ptr-text");
  if (!ptrIndicator) return;

  let startY = 0;
  let startX = 0;
  let isPulling = false;
  let isRefreshing = false;

  window.addEventListener(
    "touchstart",
    (e) => {
      if (isRefreshing) return;
      if (e.touches.length !== 1) return;

      // 최상단 스크롤 위치에서만 PTR 허용
      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      if (scrollTop > 2) {
        isPulling = false;
        return;
      }

      const target = e.target;
      // 그림판이나 모달 내부에서는 PTR 비활성화
      if (
        target.closest("#drawing-canvas") ||
        target.closest("#drawing-container") ||
        target.closest(".modal-overlay")
      ) {
        isPulling = false;
        return;
      }

      const touch = e.touches[0];
      startY = touch.clientY;
      startX = touch.clientX;
      isPulling = true;
    },
    { passive: true }
  );

  window.addEventListener(
    "touchmove",
    (e) => {
      if (!isPulling || isRefreshing) return;
      const touch = e.touches[0];
      const diffY = touch.clientY - startY;
      const diffX = touch.clientX - startX;

      const scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
      if (scrollTop > 2 || diffY <= 0) {
        ptrIndicator.style.transform = "translateY(0px)";
        ptrIndicator.style.opacity = "0";
        return;
      }

      // 수직 당김이 수평 이동보다 1.5배 이상 클 때만 반응
      if (Math.abs(diffY) > Math.abs(diffX) * 1.5) {
        // 탄성 댐핑 효과
        const pullDistance = Math.min(Math.pow(diffY, 0.82) * 1.8, 80);
        ptrIndicator.style.transform = `translateY(${pullDistance}px)`;
        ptrIndicator.style.opacity = String(Math.min(pullDistance / 45, 1));

        if (pullDistance >= 58) {
          if (ptrText) ptrText.textContent = "손을 놓으면 새로고침 ✨";
          if (ptrIcon) ptrIcon.classList.add("ready");
        } else {
          if (ptrText) ptrText.textContent = "당겨서 새로고침";
          if (ptrIcon) ptrIcon.classList.remove("ready");
        }
      }
    },
    { passive: true }
  );

  window.addEventListener(
    "touchend",
    () => {
      if (!isPulling || isRefreshing) return;
      isPulling = false;

      const currentTransform = ptrIndicator.style.transform;
      const match = currentTransform.match(/translateY\(([\d.]+)px\)/);
      const currentDist = match ? parseFloat(match[1]) : 0;

      if (currentDist >= 58) {
        // 새로고침 실행
        isRefreshing = true;
        ptrIndicator.style.transition = "transform 0.25s ease";
        ptrIndicator.style.transform = "translateY(52px)";
        if (ptrText) ptrText.textContent = "최신 소식 동기화 중...";
        if (ptrIcon) {
          ptrIcon.classList.remove("ready");
          ptrIcon.classList.add("spinning");
        }
        if (navigator.vibrate) navigator.vibrate(20);

        setTimeout(() => {
          // 화면 최신 데이터 소프트 리프레시
          try {
            render();
            const currentTab = getCurrentViewTab();
            if (currentTab === "cal") renderCalendar();
            else if (currentTab === "question") renderCurrentDateQuestion();
          } catch (err) {
            console.warn("[PTR] 새로고침 중 경고:", err);
          }

          showToastNotification("최신 이야기가 동기화되었습니다! ✨", "🔄");

          // 복귀 애니메이션
          setTimeout(() => {
            ptrIndicator.style.transition = "transform 0.3s ease, opacity 0.3s ease";
            ptrIndicator.style.transform = "translateY(0px)";
            ptrIndicator.style.opacity = "0";

            setTimeout(() => {
              ptrIndicator.style.transition = "";
              if (ptrIcon) ptrIcon.classList.remove("spinning");
              if (ptrText) ptrText.textContent = "당겨서 새로고침";
              isRefreshing = false;
            }, 300);
          }, 400);
        }, 550);
      } else {
        // 원위치 복귀
        ptrIndicator.style.transition = "transform 0.2s ease, opacity 0.2s ease";
        ptrIndicator.style.transform = "translateY(0px)";
        ptrIndicator.style.opacity = "0";
        setTimeout(() => {
          ptrIndicator.style.transition = "";
          if (ptrIcon) ptrIcon.classList.remove("ready");
        }, 200);
      }
    },
    { passive: true }
  );
}

/**
 * 오프라인 상태 감지 및 사용자 피드백을 초기화합니다.
 */
function initOfflineResilience() {
  const offlineBanner = document.getElementById("offline-banner");

  function updateStatus(isOnline) {
    if (!isOnline) {
      if (offlineBanner) offlineBanner.hidden = false;
      showToastNotification(
        "오프라인 상태입니다. 작성한 내용은 기기에 안전하게 보관됩니다.",
        "☁️"
      );
    } else {
      if (offlineBanner && !offlineBanner.hidden) {
        offlineBanner.hidden = true;
        showToastNotification(
          "인터넷이 다시 연결되어 모든 내용이 실시간 동기화되었습니다! ✨",
          "🌐"
        );
      }
    }
  }

  window.addEventListener("online", () => updateStatus(true));
  window.addEventListener("offline", () => updateStatus(false));

  // 시작 시 오프라인 여부 확인
  if (!navigator.onLine && offlineBanner) {
    offlineBanner.hidden = false;
  }
}

/**
 * 전체 모바일 제스처 및 상태 리스너 초기화
 */
export function initGestures() {
  initSwipeTabs();
  initPullToRefresh();
  initOfflineResilience();
}

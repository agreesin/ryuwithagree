// =========================================================
// render.js - 일기 목록 렌더링, 실시간 검색 및 필터링 모듈 (통합 타임라인 피드)
// =========================================================

import { hideError } from "./ui.js";
import { createEntryCard } from "./entry-card.js";
import { getCurrentUser } from "./state.js";
import { updateCalendarEntries } from "./calendar.js";

const emptyMessage = document.getElementById("empty-message");
const timelineList = document.getElementById("timeline-entry-list");
const timelineTotalCount = document.getElementById("timeline-total-count");
const loadMoreContainer = document.getElementById("load-more-container");
const loadMoreBtn = document.getElementById("load-more-btn");
const loadMoreCount = document.getElementById("load-more-count");

// 검색 & 필터 화면 요소
const searchInput = document.getElementById("search-input");
const searchClearBtn = document.getElementById("search-clear-btn");
const filterMoodBtns = document.querySelectorAll(".filter-mood-btn");
const filterAuthorBtns = document.querySelectorAll(".filter-author-btn");
const searchResultCount = document.getElementById("search-result-count");

// 페이지네이션 및 상태
const PAGE_SIZE = 6; // 한 번에 표시할 일기 수
let visibleCount = PAGE_SIZE;
let cachedRawEntries = [];
let currentKeyword = "";
let currentMood = "all";
let currentAuthor = "all";

/**
 * 현재 설정된 검색어/필터 조건에 맞게 일기 목록을 필터링합니다.
 */
function getFilteredEntries() {
  const currentUser = getCurrentUser();

  return cachedRawEntries.filter((entry) => {
    // 1. 키워드 검색 (제목 또는 본문)
    if (currentKeyword) {
      const q = currentKeyword.toLowerCase();
      const title = (entry.title || "").toLowerCase();
      const body = (entry.body || "").toLowerCase();
      if (!title.includes(q) && !body.includes(q)) {
        return false;
      }
    }

    // 2. 기분 이모지 필터
    if (currentMood !== "all") {
      if (entry.mood !== currentMood) {
        return false;
      }
    }

    // 3. 작성자 필터
    if (currentAuthor !== "all") {
      const isMyEntry = currentUser && (
        (entry.uid && entry.uid === currentUser.uid) ||
        (entry.author && currentUser.displayName && entry.author === currentUser.displayName)
      );

      if (currentAuthor === "my" && !isMyEntry) return false;
      if (currentAuthor === "other" && isMyEntry) return false;
    }

    return true;
  });
}

/**
 * 일기 목록을 통합 타임라인 피드로 렌더링합니다.
 * @param {Array<Object>} entries - Firestore 일기 문서 목록
 */
export function render(entries = cachedRawEntries) {
  if (entries !== cachedRawEntries) {
    cachedRawEntries = entries;
    // 캘린더 모듈에도 최신 일기 데이터 동기화
    updateCalendarEntries(entries);
  }

  hideError();

  const filtered = getFilteredEntries();

  if (timelineList) {
    timelineList.innerHTML = "";

    // 현재 표시할 개수만큼만 슬라이스하여 렌더링 (스크롤 단축)
    const displayedEntries = filtered.slice(0, visibleCount);

    for (const entry of displayedEntries) {
      const card = createEntryCard(entry);
      timelineList.appendChild(card);
    }
  }

  // 전체 카운트 표시
  if (timelineTotalCount) {
    timelineTotalCount.textContent = String(filtered.length);
  }

  // 빈 피드 메시지 처리
  if (emptyMessage) {
    emptyMessage.hidden = filtered.length > 0;
  }

  // 검색 결과 카운트 갱신
  if (searchResultCount) {
    const isFiltered = currentKeyword !== "" || currentMood !== "all" || currentAuthor !== "all";
    if (isFiltered) {
      searchResultCount.textContent = `검색 결과: ${filtered.length}개`;
      searchResultCount.hidden = false;
    } else {
      searchResultCount.hidden = true;
    }
  }

  // 더보기 버튼 제어
  if (loadMoreContainer && loadMoreBtn) {
    const remaining = filtered.length - visibleCount;
    if (remaining > 0) {
      loadMoreContainer.hidden = false;
      if (loadMoreCount) {
        loadMoreCount.textContent = `(${remaining}개 더보기 ⬇️)`;
      }
    } else {
      loadMoreContainer.hidden = true;
    }
  }
}

/**
 * 검색 및 필터 UI 이벤트 리스너 초기화
 */
export function initSearchFilter() {
  // [더보기] 버튼 클릭 핸들러
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      visibleCount += PAGE_SIZE;
      render();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentKeyword = e.target.value.trim();
      visibleCount = PAGE_SIZE; // 검색 시 첫 페이지부터
      if (searchClearBtn) {
        searchClearBtn.hidden = currentKeyword === "";
      }
      render();
    });
  }

  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", () => {
      if (searchInput) searchInput.value = "";
      currentKeyword = "";
      visibleCount = PAGE_SIZE;
      searchClearBtn.hidden = true;
      render();
    });
  }

  // 기분 필터 버튼들
  filterMoodBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mood = btn.dataset.mood;
      currentMood = mood;
      visibleCount = PAGE_SIZE;
      filterMoodBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      render();
    });
  });

  // 작성자 필터 버튼들
  filterAuthorBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const authorType = btn.dataset.author;
      currentAuthor = authorType;
      visibleCount = PAGE_SIZE;
      filterAuthorBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      render();
    });
  });
}




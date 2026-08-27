// =========================================================
// render.js - 일기 목록 렌더링, 실시간 검색 및 필터링 모듈 (좌우 2분할)
// =========================================================

import { hideError } from "./ui.js";
import { createEntryCard } from "./entry-card.js";
import { getCurrentUser } from "./state.js";
import { updateCalendarEntries } from "./calendar.js";

const emptyMessage = document.getElementById("empty-message");
const othersList = document.getElementById("others-entry-list");
const myList = document.getElementById("my-entry-list");
const othersEmpty = document.getElementById("others-empty");
const myEmpty = document.getElementById("my-empty");
const othersCount = document.getElementById("others-count");
const myCount = document.getElementById("my-count");

// 검색 & 필터 화면 요소
const searchInput = document.getElementById("search-input");
const searchClearBtn = document.getElementById("search-clear-btn");
const filterMoodBtns = document.querySelectorAll(".filter-mood-btn");
const filterAuthorBtns = document.querySelectorAll(".filter-author-btn");
const searchResultCount = document.getElementById("search-result-count");

// 내부 상태
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
 * 일기 목록을 화면에 렌더링합니다.
 * @param {Array<Object>} entries - Firestore 일기 문서 목록
 */
export function render(entries = cachedRawEntries) {
  if (entries !== cachedRawEntries) {
    cachedRawEntries = entries;
    // 캘린더 모듈에도 최신 일기 데이터 동기화
    updateCalendarEntries(entries);
  }

  hideError();

  if (othersList) othersList.innerHTML = "";
  if (myList) myList.innerHTML = "";

  const currentUser = getCurrentUser();
  const filtered = getFilteredEntries();

  let othersCountNum = 0;
  let myCountNum = 0;

  for (const entry of filtered) {
    const isMyEntry = currentUser && (
      (entry.uid && entry.uid === currentUser.uid) ||
      (entry.author && currentUser.displayName && entry.author === currentUser.displayName)
    );

    const card = createEntryCard(entry);

    if (isMyEntry) {
      if (myList) myList.appendChild(card);
      myCountNum++;
    } else {
      if (othersList) othersList.appendChild(card);
      othersCountNum++;
    }
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

  // 전체 및 컬럼별 상태 갱신
  if (emptyMessage) emptyMessage.hidden = filtered.length > 0;
  if (othersCount) othersCount.textContent = String(othersCountNum);
  if (myCount) myCount.textContent = String(myCountNum);
  if (othersEmpty) othersEmpty.hidden = othersCountNum > 0;
  if (myEmpty) myEmpty.hidden = myCountNum > 0;
}

/**
 * 검색 및 필터 UI 이벤트 리스너 초기화
 */
export function initSearchFilter() {
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentKeyword = e.target.value.trim();
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
      searchClearBtn.hidden = true;
      render();
    });
  }

  // 기분 필터 버튼들
  filterMoodBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mood = btn.dataset.mood;
      currentMood = mood;
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
      filterAuthorBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      render();
    });
  });
}




// =========================================================
// render.js - 일기 목록 렌더링, 실시간 검색 및 필터링 모듈 (통합 타임라인 피드)
// - 카드별 시그니처 diff 캐싱으로 스냅샷 갱신 시 작성 중 댓글/타임랩스 유실 방지
// - 검색/필터 토글, 필터 리셋(resetFilters), 알림/레포트용 일기 자동 펼침(diary:reveal-entry)
// =========================================================

import { hideError, normalizeMood } from "./ui.js";
import { createEntryCard } from "./entry-card.js";
import { isMyContent, getCurrentProfiles, getCurrentProfilePhotos } from "./state.js";
import { updateCalendarEntries } from "./calendar.js";
import { updateReportEntries } from "./report.js";
import { updateDiaryNudgeStatus } from "./nudge.js";

const emptyMessage = document.getElementById("empty-message");
const emptySearchWrap = document.getElementById("empty-search-wrap");
const emptyResetFilterBtn = document.getElementById("empty-reset-filter-btn");
const timelineList = document.getElementById("timeline-entry-list");
const timelineTotalCount = document.getElementById("timeline-total-count");
const loadMoreContainer = document.getElementById("load-more-container");
const loadMoreBtn = document.getElementById("load-more-btn");
const loadMoreCount = document.getElementById("load-more-count");

// 검색 & 필터 화면 요소
const searchFilterToggleBtn = document.getElementById("search-filter-toggle-btn");
const searchFilterBody = document.getElementById("search-filter-body");
const searchActiveBadge = document.getElementById("search-active-badge");
const searchInput = document.getElementById("search-input");
const searchClearBtn = document.getElementById("search-clear-btn");
const filterMoodBtns = document.querySelectorAll(".filter-mood-btn");
const filterAuthorBtns = document.querySelectorAll(".filter-author-btn");
const searchResultCount = document.getElementById("search-result-count");

const PAGE_SIZE = 6;
let visibleCount = PAGE_SIZE;
let cachedRawEntries = [];
let currentKeyword = "";
let currentMood = "all";
let currentAuthor = "all";

// 카드 DOM diff 캐시: entryId -> { sig, el }
const renderedCardCache = new Map();

function buildEntrySignature(entry) {
  const profiles = getCurrentProfiles();
  const photos = getCurrentProfilePhotos();
  const commentSig = (entry.comments || []).map((c) => ({
    id: c.id,
    t: c.text,
    u: c.updatedAt || 0,
    p: c.parentId || "",
    n: profiles[c.uid] || c.author || "",
    ph: photos[c.uid] || "",
  }));

  return JSON.stringify({
    t: entry.title || "",
    b: entry.body || "",
    m: entry.mood || "",
    u: entry.updatedAt || 0,
    an: profiles[entry.uid] || entry.author || "",
    ap: photos[entry.uid] || "",
    ic: Array.isArray(entry.images) ? entry.images.length : entry.image ? 1 : 0,
    i0: entry.image ? entry.image.slice(0, 48) + ":" + entry.image.length : "",
    dc: Array.isArray(entry.drawingData) ? entry.drawingData.length : 0,
    r: entry.reactions || {},
    c: commentSig,
  });
}

function captureDraftsInsideCard(cardEl) {
  const drafts = new Map();
  const openReplies = new Set();
  let focusedDraftKey = null;
  let selectionStart = null;
  let selectionEnd = null;

  if (!cardEl) return { drafts, openReplies, focusedDraftKey, selectionStart, selectionEnd };

  cardEl.querySelectorAll("[data-draft-key]").forEach((input) => {
    const key = input.dataset.draftKey;
    if (key && input.value) {
      drafts.set(key, input.value);
    }
    if (document.activeElement === input) {
      focusedDraftKey = key;
      try {
        selectionStart = input.selectionStart;
        selectionEnd = input.selectionEnd;
      } catch {
        // 무시
      }
    }
  });

  cardEl.querySelectorAll(".reply-form:not([hidden])").forEach((form) => {
    if (form.dataset.replyFormKey) {
      openReplies.add(form.dataset.replyFormKey);
    }
  });

  return { drafts, openReplies, focusedDraftKey, selectionStart, selectionEnd };
}

function restoreDraftsInsideCard(cardEl, snapshot) {
  if (!cardEl || !snapshot) return;

  snapshot.openReplies.forEach((key) => {
    const form = cardEl.querySelector(`.reply-form[data-reply-form-key="${CSS.escape(key)}"]`);
    if (form) form.hidden = false;
  });

  snapshot.drafts.forEach((val, key) => {
    const input = cardEl.querySelector(`[data-draft-key="${CSS.escape(key)}"]`);
    if (input) {
      input.value = val;
      if (key.startsWith("edit:")) {
        const editForm = input.closest(".comment-inline-edit-form");
        const commentItem = input.closest("li");
        if (editForm) editForm.hidden = false;
        const textP = commentItem?.querySelector(":scope > .comment-text");
        if (textP) textP.hidden = true;
      }
    }
  });

  if (snapshot.focusedDraftKey) {
    const target = cardEl.querySelector(
      `[data-draft-key="${CSS.escape(snapshot.focusedDraftKey)}"]`
    );
    if (target instanceof HTMLElement) {
      target.focus({ preventScroll: true });
      if (
        typeof snapshot.selectionStart === "number" &&
        typeof target.setSelectionRange === "function"
      ) {
        try {
          target.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
        } catch {
          // 무시
        }
      }
    }
  }
}

function isAnyFilterActive() {
  return currentKeyword !== "" || currentMood !== "all" || currentAuthor !== "all";
}

function syncFilterToggleBadge() {
  const activeCount =
    (currentKeyword !== "" ? 1 : 0) +
    (currentMood !== "all" ? 1 : 0) +
    (currentAuthor !== "all" ? 1 : 0);

  if (searchActiveBadge) {
    searchActiveBadge.textContent = String(activeCount);
    searchActiveBadge.hidden = activeCount === 0;
  }
  if (searchFilterToggleBtn) {
    searchFilterToggleBtn.classList.toggle("has-active-filter", activeCount > 0);
  }
}

function getFilteredEntries() {
  return cachedRawEntries.filter((entry) => {
    if (currentKeyword) {
      const q = currentKeyword.toLowerCase();
      const title = (entry.title || "").toLowerCase();
      const body = (entry.body || "").toLowerCase();
      if (!title.includes(q) && !body.includes(q)) {
        return false;
      }
    }

    if (currentMood !== "all") {
      if (normalizeMood(entry.mood) !== normalizeMood(currentMood)) {
        return false;
      }
    }

    if (currentAuthor !== "all") {
      const isMyEntry = isMyContent(entry);
      if (currentAuthor === "my" && !isMyEntry) return false;
      if (currentAuthor === "other" && isMyEntry) return false;
    }

    return true;
  });
}

/**
 * 검색어·기분·작성자 필터와 페이징을 모두 초기화하고 화면을 재렌더링합니다.
 */
export function resetFilters() {
  currentKeyword = "";
  currentMood = "all";
  currentAuthor = "all";
  visibleCount = PAGE_SIZE;

  if (searchInput) searchInput.value = "";
  if (searchClearBtn) searchClearBtn.hidden = true;

  filterMoodBtns.forEach((b) => {
    b.classList.toggle("active", b.dataset.mood === "all");
  });
  filterAuthorBtns.forEach((b) => {
    b.classList.toggle("active", b.dataset.author === "all");
  });

  syncFilterToggleBadge();
  render();
}

/**
 * 특정 일기 ID가 화면에 보이도록(필요 시 필터 해제 및 페이징 확장) 보장한 뒤 스크롤·강조합니다.
 */
function revealAndHighlightEntry(entryId, targetId = null) {
  if (!entryId) return false;

  let filtered = getFilteredEntries();
  let idx = filtered.findIndex((e) => e.id === entryId);

  if (idx === -1 && isAnyFilterActive()) {
    // 현재 필터에 가려져 있었다면 필터를 해제해 전체 목록에서 탐색
    resetFilters();
    filtered = getFilteredEntries();
    idx = filtered.findIndex((e) => e.id === entryId);
  }

  if (idx === -1) return false;

  if (idx >= visibleCount) {
    visibleCount = idx + 1;
    render();
  }

  const targetEl =
    (targetId && document.getElementById(targetId)) ||
    document.getElementById(`entry-${entryId}`);

  if (!targetEl) return false;

  targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
  targetEl.classList.remove("highlight-flash");
  void targetEl.offsetWidth;
  targetEl.classList.add("highlight-flash");
  setTimeout(() => targetEl.classList.remove("highlight-flash"), 1800);
  return true;
}

/**
 * 일기 목록을 통합 타임라인 피드로 스마트 diff 렌더링합니다.
 */
export function render(entries = cachedRawEntries) {
  if (entries !== cachedRawEntries) {
    cachedRawEntries = Array.isArray(entries) ? entries : [];
    updateCalendarEntries(cachedRawEntries);
    updateReportEntries(cachedRawEntries);
    updateDiaryNudgeStatus(cachedRawEntries);
  }

  hideError();
  syncFilterToggleBadge();

  const filtered = getFilteredEntries();
  const isFiltered = isAnyFilterActive();

  if (timelineList) {
    const displayedEntries = filtered.slice(0, visibleCount);
    const nextIds = new Set(displayedEntries.map((e) => e.id));

    // 더 이상 표시되지 않는 캐시 노드 제거
    for (const [id, cached] of renderedCardCache.entries()) {
      if (!nextIds.has(id)) {
        cached.el.remove();
        renderedCardCache.delete(id);
      }
    }

    // 순서대로 비교하여 변경된 카드만 교체 (작성 중 댓글·타임랩스·캐러셀 보존)
    displayedEntries.forEach((entry, index) => {
      try {
        const sig = buildEntrySignature(entry);
        const existing = renderedCardCache.get(entry.id);
        let cardEl;

        if (existing && existing.sig === sig) {
          cardEl = existing.el;
        } else {
          const draftSnapshot = existing ? captureDraftsInsideCard(existing.el) : null;
          cardEl = createEntryCard(entry);
          if (draftSnapshot) {
            restoreDraftsInsideCard(cardEl, draftSnapshot);
          }
          if (existing && existing.el.parentNode === timelineList) {
            timelineList.replaceChild(cardEl, existing.el);
          }
          renderedCardCache.set(entry.id, { sig, el: cardEl });
        }

        const currentChildAtIndex = timelineList.children[index];
        if (currentChildAtIndex !== cardEl) {
          timelineList.insertBefore(cardEl, currentChildAtIndex || null);
        }
      } catch (err) {
        console.error("[render] 일기 카드 렌더링 중 오류 건너뜀:", entry.id, err);
      }
    });
  }

  if (timelineTotalCount) {
    timelineTotalCount.textContent = String(filtered.length);
  }

  // 빈 상태 분기: 진짜 일기 0건 vs 검색/필터 결과 0건
  const hasAnyRaw = cachedRawEntries.length > 0;
  if (emptyMessage) {
    emptyMessage.hidden = filtered.length > 0 || (hasAnyRaw && isFiltered);
  }
  if (emptySearchWrap) {
    emptySearchWrap.hidden = !(hasAnyRaw && isFiltered && filtered.length === 0);
  }

  if (searchResultCount) {
    if (isFiltered) {
      searchResultCount.textContent = `검색 결과: ${filtered.length}개`;
      searchResultCount.hidden = false;
    } else {
      searchResultCount.hidden = true;
    }
  }

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

export function initSearchFilter() {
  // 검색·필터 접이식 토글
  if (searchFilterToggleBtn && searchFilterBody) {
    searchFilterToggleBtn.addEventListener("click", () => {
      const willOpen = searchFilterBody.hidden;
      searchFilterBody.hidden = !willOpen;
      searchFilterToggleBtn.setAttribute("aria-expanded", String(willOpen));
      if (willOpen && searchInput) {
        setTimeout(() => searchInput.focus(), 60);
      }
    });
  }

  if (emptyResetFilterBtn) {
    emptyResetFilterBtn.addEventListener("click", () => {
      resetFilters();
    });
  }

  if (loadMoreBtn) {
    loadMoreBtn.addEventListener("click", () => {
      visibleCount += PAGE_SIZE;
      render();
    });
  }

  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      currentKeyword = e.target.value.trim();
      visibleCount = PAGE_SIZE;
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

  filterMoodBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentMood = btn.dataset.mood;
      visibleCount = PAGE_SIZE;
      filterMoodBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      render();
    });
  });

  filterAuthorBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      currentAuthor = btn.dataset.author;
      visibleCount = PAGE_SIZE;
      filterAuthorBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      render();
    });
  });

  // 알림/월간 레포트 등에서 특정 일기 카드 이동 요청 수신 (순환 참조 없음)
  window.addEventListener("diary:reveal-entry", (e) => {
    const { entryId, targetId, onNotFound } = e.detail || {};
    const found = revealAndHighlightEntry(entryId, targetId);
    if (!found && typeof onNotFound === "function") {
      onNotFound();
    }
  });
}

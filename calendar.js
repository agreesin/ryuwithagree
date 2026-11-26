// =========================================================
// calendar.js - 캘린더(달력) 뷰 모드 및 날짜별 일기/기념일 감상 모듈
// - 0ms 즉시 날짜 선택 & 동일 날짜 더블클릭 일정 추가
// - 인접 월 날짜 클릭 이동, 펼친 일기 카드 상태 유지, 키보드 접근성 및 하단 탭바 동기화
// =========================================================

import { createEntryCard } from "./entry-card.js";
import {
  getDdayItems,
  calculateDdayInfo,
  onDdayChange,
  getMilestonesForDate,
  openDdayModalWithDate,
} from "./dday.js";
import { getCurrentProfiles } from "./state.js";
import { formatDateString, escapeHtml, normalizeMood } from "./ui.js";
import { renderCurrentDateQuestion } from "./daily-question.js";

// 화면 요소
const viewTabFeed = document.getElementById("view-tab-feed");
const viewTabCal = document.getElementById("view-tab-cal");
const viewTabQuestion = document.getElementById("view-tab-question");
const bottomNavBtns = document.querySelectorAll(".bottom-nav-btn");
const feedViewSection = document.getElementById("feed-view-section");
const calViewSection = document.getElementById("calendar-view-section");
const questionViewSection = document.getElementById("question-view-section");

const calMonthTitle = document.getElementById("cal-month-title");
const calPrevBtn = document.getElementById("cal-prev-btn");
const calNextBtn = document.getElementById("cal-next-btn");
const calTodayBtn = document.getElementById("cal-today-btn");
const calDaysGrid = document.getElementById("cal-days-grid");
const calSelectedDateTitle = document.getElementById("cal-selected-date-title");
const calAddEventBtn = document.getElementById("cal-add-event-btn");
const calSelectedEventsWrap = document.getElementById("cal-selected-events-wrap");
const calSelectedEntriesList = document.getElementById("cal-selected-entries-list");
const calSelectedEmpty = document.getElementById("cal-selected-empty");
const calSelectedEmptyWrap = document.getElementById("cal-selected-empty-wrap");
const calEmptyAddEventBtn = document.getElementById("cal-empty-add-event-btn");

let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-11
let selectedDateStr = null;
let cachedEntries = [];
const expandedEntryIds = new Set(); // 리렌더 시 펼친 일기 카드 유지

export function updateCalendarEntries(entries) {
  cachedEntries = Array.isArray(entries) ? entries : [];
  if (calViewSection && !calViewSection.hidden) {
    renderCalendar();
  }
}

function getEventsForDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const allItems = getDdayItems();
  const matchingEvents = [];

  for (const item of allItems) {
    if (!item.date) continue;
    const [itemY, itemM, itemD] = item.date.split("-").map(Number);
    const type = item.type || "count_up";

    if (type === "birthday") {
      if (m === itemM && d === itemD) {
        matchingEvents.push({ ...item, isBirthday: true });
      }
    } else if (type === "event") {
      if (y === itemY && m === itemM && d === itemD) {
        matchingEvents.push({ ...item, isEvent: true });
      }
    } else if (type === "count_up") {
      if (y === itemY && m === itemM && d === itemD) {
        matchingEvents.push({ ...item, isAnniversary: true, title: item.title });
      }
    }
  }

  const milestones = getMilestonesForDate(dateStr);
  milestones.forEach((ms) => {
    matchingEvents.push(ms);
  });

  return matchingEvents;
}

export function renderCalendar() {
  if (!calMonthTitle || !calDaysGrid) return;

  calMonthTitle.textContent = `${currentYear}년 ${currentMonth + 1}월`;
  calDaysGrid.innerHTML = "";

  const entriesByDate = {};
  for (const entry of cachedEntries) {
    if (entry.createdAt) {
      const dateKey = formatDateString(entry.createdAt);
      if (!entriesByDate[dateKey]) entriesByDate[dateKey] = [];
      entriesByDate[dateKey].push(entry);
    }
  }

  const todayStr = formatDateString(Date.now());
  if (!selectedDateStr) {
    selectedDateStr = todayStr;
  }

  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
  const prevLastDate = new Date(currentYear, currentMonth, 0).getDate();

  const prevMonthDate = new Date(currentYear, currentMonth - 1, 1);
  const prevY = prevMonthDate.getFullYear();
  const prevM = prevMonthDate.getMonth() + 1;

  const nextMonthDate = new Date(currentYear, currentMonth + 1, 1);
  const nextY = nextMonthDate.getFullYear();
  const nextM = nextMonthDate.getMonth() + 1;

  const fragment = document.createDocumentFragment();

  // 1. 이전 달 날짜 (클릭 시 이전 달로 이동하며 선택)
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevLastDate - i;
    const otherDateKey = `${prevY}-${String(prevM).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    const cell = document.createElement("div");
    cell.className = "cal-day-cell other-month";
    cell.dataset.date = otherDateKey;
    cell.dataset.otherMonth = "prev";
    cell.setAttribute("role", "button");
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("aria-label", `${prevY}년 ${prevM}월 ${dayNum}일로 이동`);
    cell.innerHTML = `<span class="cal-day-num">${dayNum}</span>`;
    fragment.appendChild(cell);
  }

  // 2. 이번 달 날짜들
  for (let date = 1; date <= lastDate; date++) {
    const mStr = String(currentMonth + 1).padStart(2, "0");
    const dStr = String(date).padStart(2, "0");
    const dateKey = `${currentYear}-${mStr}-${dStr}`;

    const dateEntries = entriesByDate[dateKey] || [];
    const dateEvents = getEventsForDate(dateKey);
    const isToday = dateKey === todayStr;
    const isSelected = dateKey === selectedDateStr;

    const cell = document.createElement("div");
    cell.className = `cal-day-cell current-month ${isToday ? "today" : ""} ${isSelected ? "selected" : ""} ${dateEntries.length > 0 ? "has-entry" : ""} ${dateEvents.length > 0 ? "has-event" : ""}`;
    cell.setAttribute("role", "button");
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("aria-pressed", String(isSelected));
    cell.setAttribute(
      "aria-label",
      `${currentYear}년 ${currentMonth + 1}월 ${date}일, 일기 ${dateEntries.length}편, 일정 ${dateEvents.length}건`
    );

    const numSpan = document.createElement("span");
    numSpan.className = "cal-day-num";
    numSpan.textContent = String(date);
    cell.appendChild(numSpan);

    const itemsWrap = document.createElement("div");
    itemsWrap.className = "cal-day-items";

    dateEvents.forEach((ev) => {
      const evItem = document.createElement("div");
      evItem.className = `cal-event-chip ${ev.type || "count_up"}`;
      const icon = ev.icon || (ev.type === "birthday" ? "🎂" : ev.type === "event" ? "🌟" : "💖");

      const iconSpan = document.createElement("span");
      iconSpan.className = "cal-event-chip-icon";
      iconSpan.textContent = icon;

      const titleSpan = document.createElement("span");
      titleSpan.className = "cal-event-chip-title";
      titleSpan.textContent = ev.title;

      evItem.appendChild(iconSpan);
      evItem.appendChild(titleSpan);
      evItem.title = `[${ev.title}]`;
      itemsWrap.appendChild(evItem);
    });

    if (dateEntries.length > 0) {
      const moodWrap = document.createElement("div");
      moodWrap.className = "cal-mood-wrap";
      dateEntries.forEach((e) => {
        const badge = document.createElement("span");
        badge.className = "cal-mood-chip";
        const displayMood = e.mood ? normalizeMood(e.mood) : "📖";
        badge.textContent = displayMood;
        badge.title = e.title || "일기";
        moodWrap.appendChild(badge);
      });
      itemsWrap.appendChild(moodWrap);
    }

    if (itemsWrap.children.length > 0) {
      cell.appendChild(itemsWrap);
    }

    cell.title = `${dateKey} (클릭: 상세 조회 / 같은 날 더블클릭: 일정 추가 ➕)`;
    cell.dataset.date = dateKey;
    fragment.appendChild(cell);
  }

  // 3. 다음 달 날짜 (클릭 시 다음 달로 이동하며 선택)
  const totalCells = firstDayIndex + lastDate;
  const remainingCells = (totalCells > 35 ? 42 : 35) - totalCells;
  for (let i = 1; i <= remainingCells; i++) {
    const otherDateKey = `${nextY}-${String(nextM).padStart(2, "0")}-${String(i).padStart(2, "0")}`;
    const cell = document.createElement("div");
    cell.className = "cal-day-cell other-month";
    cell.dataset.date = otherDateKey;
    cell.dataset.otherMonth = "next";
    cell.setAttribute("role", "button");
    cell.setAttribute("tabindex", "0");
    cell.setAttribute("aria-label", `${nextY}년 ${nextM}월 ${i}일로 이동`);
    cell.innerHTML = `<span class="cal-day-num">${i}</span>`;
    fragment.appendChild(cell);
  }

  calDaysGrid.appendChild(fragment);

  renderSelectedDateEntries(
    selectedDateStr,
    entriesByDate[selectedDateStr] || [],
    getEventsForDate(selectedDateStr)
  );
}

function renderSelectedDateEntries(dateKey, entries, events = []) {
  if (!calSelectedDateTitle || !calSelectedEntriesList || !calSelectedEmpty) return;

  const [y, m, d] = dateKey.split("-").map(Number);
  calSelectedDateTitle.textContent = `📅 ${y}년 ${m}월 ${d}일의 기록 (${entries.length}편)`;

  if (calSelectedEventsWrap) {
    calSelectedEventsWrap.innerHTML = "";
    if (events.length > 0) {
      calSelectedEventsWrap.hidden = false;
      events.forEach((ev) => {
        let calcText = "";
        if (ev.isMilestone) {
          const now = new Date();
          const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
          const [ey, em, ed] = dateKey.split("-").map(Number);
          const evUtc = Date.UTC(ey, em - 1, ed);
          const diff = Math.round((evUtc - todayUtc) / (1000 * 60 * 60 * 24));
          if (diff === 0) calcText = "오늘 🎉";
          else if (diff > 0) calcText = `D-${diff}`;
          else calcText = `${ev.milestoneText}`;
        } else {
          const { ddayText } = calculateDdayInfo(ev);
          calcText = ddayText;
        }

        const banner = document.createElement("div");
        banner.className = `cal-date-event-card ${ev.type || "count_up"}`;
        const icon = ev.icon || (ev.type === "birthday" ? "🎂" : ev.type === "event" ? "🌟" : "💖");

        banner.innerHTML = `
          <span class="cal-event-card-icon">${escapeHtml(icon)}</span>
          <div class="cal-event-card-body">
            <span class="cal-event-card-title">${escapeHtml(ev.title)}</span>
            <span class="cal-event-card-calc">${escapeHtml(calcText)}</span>
          </div>
        `;
        calSelectedEventsWrap.appendChild(banner);
      });
    } else {
      calSelectedEventsWrap.hidden = true;
    }
  }

  calSelectedEntriesList.innerHTML = "";

  const hasContent = entries.length > 0 || events.length > 0;
  if (calSelectedEmptyWrap) calSelectedEmptyWrap.hidden = hasContent;
  if (calSelectedEmpty) calSelectedEmpty.hidden = hasContent;
  if (!hasContent) return;

  const profiles = getCurrentProfiles();

  for (const entry of entries) {
    const li = document.createElement("li");
    li.className = "cal-entry-title-item";

    const titleRow = document.createElement("button");
    titleRow.type = "button";
    titleRow.className = "cal-entry-title-btn";

    const moodSpan = document.createElement("span");
    moodSpan.className = "cal-entry-title-mood";
    moodSpan.textContent = entry.mood ? normalizeMood(entry.mood) : "📖";

    const titleText = document.createElement("span");
    titleText.className = "cal-entry-title-text";
    titleText.textContent = entry.title || "(제목 없음)";

    const authorSpan = document.createElement("span");
    authorSpan.className = "cal-entry-title-author";
    const authorName = entry.uid && profiles[entry.uid] ? profiles[entry.uid] : entry.author;
    authorSpan.textContent = authorName || "";

    const arrowSpan = document.createElement("span");
    arrowSpan.className = "cal-entry-title-arrow";

    titleRow.appendChild(moodSpan);
    titleRow.appendChild(titleText);
    titleRow.appendChild(authorSpan);
    titleRow.appendChild(arrowSpan);

    const detailWrap = document.createElement("div");
    detailWrap.className = "cal-entry-detail";

    const shouldBeOpen = expandedEntryIds.has(entry.id);
    detailWrap.hidden = !shouldBeOpen;
    arrowSpan.textContent = shouldBeOpen ? "▾" : "▸";
    titleRow.setAttribute("aria-expanded", String(shouldBeOpen));
    if (shouldBeOpen) {
      li.classList.add("expanded");
      detailWrap.appendChild(createEntryCard(entry, "cal-entry-"));
    }

    titleRow.addEventListener("click", () => {
      const isOpen = !detailWrap.hidden;
      if (isOpen) {
        expandedEntryIds.delete(entry.id);
        detailWrap.hidden = true;
        arrowSpan.textContent = "▸";
        titleRow.setAttribute("aria-expanded", "false");
        li.classList.remove("expanded");
      } else {
        expandedEntryIds.add(entry.id);
        if (detailWrap.children.length === 0) {
          detailWrap.appendChild(createEntryCard(entry, "cal-entry-"));
        }
        detailWrap.hidden = false;
        arrowSpan.textContent = "▾";
        titleRow.setAttribute("aria-expanded", "true");
        li.classList.add("expanded");
      }
    });

    li.appendChild(titleRow);
    li.appendChild(detailWrap);
    calSelectedEntriesList.appendChild(li);
  }
}

// 현재 활성화된 뷰 모드 탭 ('feed' | 'cal' | 'question')
let currentViewTab = "feed";
const TAB_KEYS_ORDER = ["feed", "cal", "question"];

export function getCurrentViewTab() {
  return currentViewTab;
}

export function switchViewTab(mode = "feed", direction = "auto") {
  const prevTab = currentViewTab;
  currentViewTab = mode;

  let slideDir = direction;
  if (slideDir === "auto") {
    const prevIdx = TAB_KEYS_ORDER.indexOf(prevTab);
    const newIdx = TAB_KEYS_ORDER.indexOf(mode);
    if (newIdx > prevIdx) slideDir = "left";
    else if (newIdx < prevIdx) slideDir = "right";
    else slideDir = "none";
  }

  const tabs = [
    { key: "feed", btn: viewTabFeed, section: feedViewSection },
    { key: "cal", btn: viewTabCal, section: calViewSection, onActive: renderCalendar },
    { key: "question", btn: viewTabQuestion, section: questionViewSection, onActive: renderCurrentDateQuestion },
  ];

  tabs.forEach((t) => {
    const isActive = t.key === mode;
    if (t.btn) {
      t.btn.classList.toggle("active", isActive);
      t.btn.setAttribute("aria-selected", String(isActive));
    }
    if (t.section) {
      t.section.hidden = !isActive;
      if (isActive) {
        t.section.style.transform = "";
        t.section.style.transition = "";
        t.section.style.opacity = "";

        t.section.classList.remove("tab-slide-enter", "tab-slide-left", "tab-slide-right");
        void t.section.offsetWidth;
        if (slideDir === "left") t.section.classList.add("tab-slide-left");
        else if (slideDir === "right") t.section.classList.add("tab-slide-right");
        else t.section.classList.add("tab-slide-enter");
      } else {
        t.section.classList.remove("tab-slide-enter", "tab-slide-left", "tab-slide-right");
        t.section.style.transform = "";
        t.section.style.transition = "";
        t.section.style.opacity = "";
      }
    }
    if (isActive && typeof t.onActive === "function") {
      t.onActive();
    }
  });

  // 모바일 하단 고정 네비게이션 바 동기화
  bottomNavBtns.forEach((btn) => {
    const active = btn.dataset.tab === mode;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  });
}

export function initCalendar() {
  if (viewTabFeed) viewTabFeed.addEventListener("click", () => switchViewTab("feed"));
  if (viewTabCal) viewTabCal.addEventListener("click", () => switchViewTab("cal"));
  if (viewTabQuestion) viewTabQuestion.addEventListener("click", () => switchViewTab("question"));

  bottomNavBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.dataset.tab;
      if (targetTab) {
        switchViewTab(targetTab);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });

  if (calPrevBtn) {
    calPrevBtn.addEventListener("click", () => {
      currentMonth--;
      if (currentMonth < 0) {
        currentMonth = 11;
        currentYear--;
      }
      renderCalendar();
    });
  }

  if (calNextBtn) {
    calNextBtn.addEventListener("click", () => {
      currentMonth++;
      if (currentMonth > 11) {
        currentMonth = 0;
        currentYear++;
      }
      renderCalendar();
    });
  }

  if (calTodayBtn) {
    calTodayBtn.addEventListener("click", () => {
      const now = new Date();
      currentYear = now.getFullYear();
      currentMonth = now.getMonth();
      selectedDateStr = formatDateString(now.getTime());
      renderCalendar();
    });
  }

  if (calDaysGrid) {
    let lastClickTime = 0;
    let lastClickedDate = null;

    const handleCellActivate = (cell, { allowDoubleClick = true } = {}) => {
      if (!cell || !cell.dataset.date) return;
      const dateKey = cell.dataset.date;

      // 인접 월 날짜 클릭 시 해당 월로 이동 후 선택
      if (cell.classList.contains("other-month")) {
        const [y, m] = dateKey.split("-").map(Number);
        currentYear = y;
        currentMonth = m - 1;
        selectedDateStr = dateKey;
        lastClickedDate = null;
        lastClickTime = 0;
        renderCalendar();
        return;
      }

      const now = Date.now();
      // 동일 날짜를 320ms 내에 두 번 클릭했을 때만 일정 등록 모달 오픈 (0ms 지연 선택!)
      if (allowDoubleClick && lastClickedDate === dateKey && now - lastClickTime < 320) {
        lastClickTime = 0;
        lastClickedDate = null;
        selectedDateStr = dateKey;
        openDdayModalWithDate(dateKey);
        return;
      }

      lastClickTime = now;
      lastClickedDate = dateKey;
      selectedDateStr = dateKey;
      renderCalendar();
    };

    calDaysGrid.addEventListener("click", (e) => {
      const cell = e.target.closest(".cal-day-cell");
      handleCellActivate(cell, { allowDoubleClick: true });
    });

    calDaysGrid.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        const cell = e.target.closest(".cal-day-cell");
        if (cell) {
          e.preventDefault();
          handleCellActivate(cell, { allowDoubleClick: false });
        }
      }
    });
  }

  onDdayChange(() => {
    if (calViewSection && !calViewSection.hidden) {
      renderCalendar();
    }
  });

  if (calAddEventBtn) {
    calAddEventBtn.addEventListener("click", () => {
      openDdayModalWithDate(selectedDateStr || formatDateString(Date.now()));
    });
  }
  if (calEmptyAddEventBtn) {
    calEmptyAddEventBtn.addEventListener("click", () => {
      openDdayModalWithDate(selectedDateStr || formatDateString(Date.now()));
    });
  }

  // 다른 모듈에서 순환 참조 없이 탭 전환 요청 수신
  window.addEventListener("diary:switch-tab", (e) => {
    const mode = e.detail?.mode;
    if (mode) switchViewTab(mode);
  });
}

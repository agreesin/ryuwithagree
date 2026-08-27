// =========================================================
// calendar.js - 캘린더(달력) 뷰 모드 및 날짜별 일기/기념일(생일·여행) 감상 모듈
// =========================================================

import { createEntryCard } from "./entry-card.js?v=2.8.0";
import { getDdayItems, calculateDdayInfo } from "./dday.js?v=2.8.0";

// 화면 요소
const viewTabFeed = document.getElementById("view-tab-feed");
const viewTabCal = document.getElementById("view-tab-cal");
const feedViewSection = document.getElementById("feed-view-section");
const calViewSection = document.getElementById("calendar-view-section");

const calMonthTitle = document.getElementById("cal-month-title");
const calPrevBtn = document.getElementById("cal-prev-btn");
const calNextBtn = document.getElementById("cal-next-btn");
const calTodayBtn = document.getElementById("cal-today-btn");
const calDaysGrid = document.getElementById("cal-days-grid");
const calSelectedDateTitle = document.getElementById("cal-selected-date-title");
const calSelectedEventsWrap = document.getElementById("cal-selected-events-wrap");
const calSelectedEntriesList = document.getElementById("cal-selected-entries-list");
const calSelectedEmpty = document.getElementById("cal-selected-empty");

// 내부 상태
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-11
let selectedDateStr = null; // "YYYY-MM-DD"
let cachedEntries = [];

/**
 * 타임스탬프를 "YYYY-MM-DD" 문자열로 변환합니다.
 */
function toDateString(timestamp) {
  if (!timestamp) return "";
  const d = new Date(timestamp);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 외부에서 최신 일기 데이터를 전달받아 갱신합니다.
 */
export function updateCalendarEntries(entries) {
  cachedEntries = entries;
  if (calViewSection && !calViewSection.hidden) {
    renderCalendar();
  }
}

/**
 * 기념일 설정 변경 시 캘린더를 갱신합니다.
 */
export function notifyCalendarDdayChange() {
  if (calViewSection && !calViewSection.hidden) {
    renderCalendar();
  }
}

/**
 * 특정 날짜(YYYY-MM-DD)에 해당하는 기념일/생일/여행 일정 목록을 반환합니다.
 */
function getEventsForDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const allItems = getDdayItems();
  const matchingEvents = [];

  for (const item of allItems) {
    if (!item.date) continue;
    const [itemY, itemM, itemD] = item.date.split("-").map(Number);
    const type = item.type || "count_up";

    if (type === "birthday") {
      // 매년 반복 생일: 월, 일이 같으면 매칭
      if (m === itemM && d === itemD) {
        matchingEvents.push({ ...item, isBirthday: true });
      }
    } else if (type === "event") {
      // 여행/일정: 년, 월, 일이 정확히 같으면 매칭
      if (y === itemY && m === itemM && d === itemD) {
        matchingEvents.push({ ...item, isEvent: true });
      }
    } else if (type === "count_up") {
      // 함께한 날 시작일
      if (y === itemY && m === itemM && d === itemD) {
        matchingEvents.push({ ...item, isAnniversary: true });
      }
    }
  }

  return matchingEvents;
}

/**
 * 캘린더 그리드를 렌더링합니다.
 */
export function renderCalendar() {
  if (!calMonthTitle || !calDaysGrid) return;

  calMonthTitle.textContent = `${currentYear}년 ${currentMonth + 1}월`;
  calDaysGrid.innerHTML = "";

  // 일기들을 날짜별로 맵핑: { "2026-08-25": [entry1, entry2], ... }
  const entriesByDate = {};
  for (const entry of cachedEntries) {
    if (entry.createdAt) {
      const dateKey = toDateString(entry.createdAt);
      if (!entriesByDate[dateKey]) entriesByDate[dateKey] = [];
      entriesByDate[dateKey].push(entry);
    }
  }

  const todayStr = toDateString(Date.now());

  // 이번 달 1일의 요일 (0: 일요일 ~ 6: 토요일)
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay();
  // 이번 달 마지막 날짜
  const lastDate = new Date(currentYear, currentMonth + 1, 0).getDate();
  // 지난 달 마지막 날짜
  const prevLastDate = new Date(currentYear, currentMonth, 0).getDate();

  // 1. 이전 달 날짜들 (흐리게 채우기)
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const dayNum = prevLastDate - i;
    const cell = document.createElement("div");
    cell.className = "cal-day-cell other-month";
    cell.innerHTML = `<span class="cal-day-num">${dayNum}</span>`;
    calDaysGrid.appendChild(cell);
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

    // 상단 날짜 번호
    const numSpan = document.createElement("span");
    numSpan.className = "cal-day-num";
    numSpan.textContent = String(date);
    cell.appendChild(numSpan);

    // 뱃지 표시 영역 (기념일/생일/여행 뱃지 + 일기 기분 이모지)
    const badgesWrap = document.createElement("div");
    badgesWrap.className = "cal-entry-badges";

    // 1) 기념일/일정 뱃지 우선 표시 (사용자가 지정한 아이콘)
    dateEvents.forEach((ev) => {
      const evSpan = document.createElement("span");
      evSpan.className = "cal-event-dot";
      const icon = ev.icon || (ev.isBirthday ? "🎂" : ev.isEvent ? "🌟" : "💖");
      evSpan.textContent = icon;
      evSpan.title = `[${ev.title}]`;
      badgesWrap.appendChild(evSpan);
    });

    // 2) 일기 기분 이모지 표시
    dateEntries.slice(0, 2).forEach((e) => {
      const badge = document.createElement("span");
      badge.className = "cal-mood-dot";
      badge.textContent = e.mood || "📖";
      badgesWrap.appendChild(badge);
    });

    if (dateEntries.length + dateEvents.length > 3) {
      const moreSpan = document.createElement("span");
      moreSpan.className = "cal-more-dot";
      moreSpan.textContent = "+";
      badgesWrap.appendChild(moreSpan);
    }

    if (badgesWrap.children.length > 0) {
      cell.appendChild(badgesWrap);
    }

    // 날짜 클릭 이벤트
    cell.addEventListener("click", () => {
      selectedDateStr = dateKey;
      renderCalendar();
      renderSelectedDateEntries(dateKey, dateEntries, dateEvents);
    });

    calDaysGrid.appendChild(cell);
  }

  // 3. 다음 달 날짜들로 채우기
  const totalCells = firstDayIndex + lastDate;
  const remainingCells = (totalCells > 35 ? 42 : 35) - totalCells;
  for (let i = 1; i <= remainingCells; i++) {
    const cell = document.createElement("div");
    cell.className = "cal-day-cell other-month";
    cell.innerHTML = `<span class="cal-day-num">${i}</span>`;
    calDaysGrid.appendChild(cell);
  }

  // 선택된 날짜 일기 & 기념일 렌더링
  if (selectedDateStr) {
    renderSelectedDateEntries(
      selectedDateStr,
      entriesByDate[selectedDateStr] || [],
      getEventsForDate(selectedDateStr)
    );
  } else {
    selectedDateStr = todayStr;
    renderSelectedDateEntries(
      todayStr,
      entriesByDate[todayStr] || [],
      getEventsForDate(todayStr)
    );
  }
}

/**
 * 선택된 날짜의 일기 및 기념일/여행 일정을 하단에 렌더링합니다.
 */
function renderSelectedDateEntries(dateKey, entries, events = []) {
  if (!calSelectedDateTitle || !calSelectedEntriesList || !calSelectedEmpty) return;

  const [y, m, d] = dateKey.split("-").map(Number);
  calSelectedDateTitle.textContent = `📅 ${y}년 ${m}월 ${d}일의 기록 (${entries.length}편)`;

  // 1. 기념일 / 생일 / 여행 배너 렌더링
  if (calSelectedEventsWrap) {
    calSelectedEventsWrap.innerHTML = "";
    if (events.length > 0) {
      calSelectedEventsWrap.hidden = false;
      events.forEach((ev) => {
        const { ddayText } = calculateDdayInfo(ev);
        const banner = document.createElement("div");
        banner.className = `cal-date-event-card ${ev.type || "count_up"}`;

        const icon = ev.icon || (ev.type === "birthday" ? "🎂" : ev.type === "event" ? "🌟" : "💖");

        banner.innerHTML = `
          <span class="cal-event-card-icon">${icon}</span>
          <div class="cal-event-card-body">
            <span class="cal-event-card-title">${ev.title}</span>
            <span class="cal-event-card-calc">${ddayText}</span>
          </div>
        `;
        calSelectedEventsWrap.appendChild(banner);
      });
    } else {
      calSelectedEventsWrap.hidden = true;
    }
  }

  // 2. 일기 카드 렌더링
  calSelectedEntriesList.innerHTML = "";

  if (entries.length === 0 && events.length === 0) {
    calSelectedEmpty.hidden = false;
    return;
  }

  calSelectedEmpty.hidden = entries.length > 0;
  for (const entry of entries) {
    const card = createEntryCard(entry);
    calSelectedEntriesList.appendChild(card);
  }
}

/**
 * 캘린더 모듈 초기화
 */
export function initCalendar() {
  // 1. 뷰 모드 전환 탭
  if (viewTabFeed && viewTabCal) {
    viewTabFeed.addEventListener("click", () => {
      viewTabFeed.classList.add("active");
      viewTabCal.classList.remove("active");
      if (feedViewSection) feedViewSection.hidden = false;
      if (calViewSection) calViewSection.hidden = true;
    });

    viewTabCal.addEventListener("click", () => {
      viewTabCal.classList.add("active");
      viewTabFeed.classList.remove("active");
      if (feedViewSection) feedViewSection.hidden = true;
      if (calViewSection) {
        calViewSection.hidden = false;
        renderCalendar();
      }
    });
  }

  // 2. 월 이동 버튼
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
      selectedDateStr = toDateString(now.getTime());
      renderCalendar();
    });
  }
}

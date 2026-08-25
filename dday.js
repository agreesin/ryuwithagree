// =========================================================
// dday.js - 다중 기념일, 매년 반복 생일 및 여행/일정 D-Day 관리 모듈
// =========================================================

import { subscribeDday, saveDdayConfig } from "./store.js";
import { notifyCalendarDdayChange } from "./calendar.js";

// 화면 요소
const ddayBadgeBtn = document.getElementById("dday-badge-btn");
const ddayBadgeText = document.getElementById("dday-badge-text");

// 기념일 모달 요소
const ddayModal = document.getElementById("dday-modal");
const ddayCloseBtn = document.getElementById("dday-close-btn");
const ddayList = document.getElementById("dday-list");
const ddayEmptyText = document.getElementById("dday-empty-text");

// 새 기념일 추가 폼 요소
const ddayAddForm = document.getElementById("dday-add-form");
const ddayTitleInput = document.getElementById("dday-title-input");
const ddayDateInput = document.getElementById("dday-date-input");
const ddayTypeSelect = document.getElementById("dday-type-select");
const ddaySubmitBtn = document.getElementById("dday-submit-btn");

// 내부 상태: { mainId: string, items: Array<DdayItem> }
let currentDdayConfig = { mainId: null, items: [] };

/**
 * 기념일 항목에 대한 D-Day 계산
 * @param {Object} item - { id, title, date, type }
 * @returns {Object} - { ddayText, tagLabel, tagClass, sortDiff }
 */
export function calculateDdayInfo(item) {
  if (!item || !item.date) {
    return { ddayText: "", tagLabel: "기념일", tagClass: "count_up", sortDiff: 99999 };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const [y, m, d] = item.date.split("-").map(Number);
  const oneDayMs = 1000 * 60 * 60 * 24;

  const type = item.type || "count_up";

  if (type === "count_up") {
    // 1. 함께한 날 (D+)
    const targetDate = new Date(y, m - 1, d).getTime();
    const diffDays = Math.floor((today - targetDate) / oneDayMs);
    const count = diffDays >= 0 ? diffDays + 1 : diffDays;
    return {
      ddayText: count >= 0 ? `D+${count}` : `D${count}`,
      tagLabel: "💖 함께한 날",
      tagClass: "count_up",
      sortDiff: count,
    };
  } else if (type === "birthday") {
    // 2. 매년 반복 생일/기념일
    let thisYearBirthday = new Date(now.getFullYear(), m - 1, d).getTime();
    if (thisYearBirthday < today) {
      // 올해 생일이 이미 지났으면 내년 생일로 계산
      thisYearBirthday = new Date(now.getFullYear() + 1, m - 1, d).getTime();
    }
    const diffDays = Math.round((thisYearBirthday - today) / oneDayMs);

    let ddayText = "";
    if (diffDays === 0) {
      ddayText = "🎂 오늘 생일!";
    } else {
      ddayText = `D-${diffDays}`;
    }

    return {
      ddayText,
      tagLabel: "🎂 매년 생일",
      tagClass: "birthday",
      sortDiff: diffDays,
    };
  } else {
    // 3. 여행 / 예정된 일정 (D-)
    const targetDate = new Date(y, m - 1, d).getTime();
    const diffDays = Math.round((targetDate - today) / oneDayMs);

    let ddayText = "";
    if (diffDays === 0) {
      ddayText = "✈️ D-DAY 오늘!";
    } else if (diffDays > 0) {
      ddayText = `D-${diffDays}`;
    } else {
      ddayText = `D+${Math.abs(diffDays)} 지남`;
    }

    return {
      ddayText,
      tagLabel: "✈️ 여행/일정",
      tagClass: "event",
      sortDiff: diffDays,
    };
  }
}

/**
 * 현재 등록된 기념일 목록을 반환합니다 (캘린더 연동용).
 */
export function getDdayItems() {
  return currentDdayConfig && currentDdayConfig.items ? currentDdayConfig.items : [];
}

/**
 * 헤더 상단 D-Day 뱃지 갱신
 */
function updateHeaderBadge() {
  if (!ddayBadgeBtn || !ddayBadgeText) return;

  const items = getDdayItems();
  if (items.length === 0) {
    ddayBadgeText.textContent = "기념일 설정";
    ddayBadgeBtn.title = "클릭하여 기념일 또는 일정을 등록하세요";
    return;
  }

  // 대표 항목 찾기 (없으면 첫 번째 항목)
  let mainItem = items.find((it) => it.id === currentDdayConfig.mainId);
  if (!mainItem) {
    mainItem = items[0];
  }

  const { ddayText } = calculateDdayInfo(mainItem);
  ddayBadgeText.textContent = `${mainItem.title} ${ddayText}`;
  ddayBadgeBtn.title = `${mainItem.title} (${mainItem.date}) ${ddayText} - 클릭하여 전체 목록 보기`;
}

/**
 * 기념일 모달 목록 UI 렌더링
 */
function renderDdayList() {
  if (!ddayList) return;
  ddayList.innerHTML = "";

  const items = getDdayItems();
  if (items.length === 0) {
    if (ddayEmptyText) ddayEmptyText.hidden = false;
    return;
  }

  if (ddayEmptyText) ddayEmptyText.hidden = true;

  items.forEach((item) => {
    const isMain = item.id === currentDdayConfig.mainId || (items.length === 1 && !currentDdayConfig.mainId);
    const { ddayText, tagLabel, tagClass } = calculateDdayInfo(item);

    const card = document.createElement("div");
    card.className = `dday-card-item ${isMain ? "main-item" : ""}`;

    card.innerHTML = `
      <div class="dday-card-left">
        <div class="dday-card-header">
          <span class="dday-type-tag ${tagClass}">${tagLabel}</span>
          ${isMain ? '<span class="dday-main-badge">★ 대표</span>' : ""}
          <span class="dday-card-date">${item.date}</span>
        </div>
        <h4 class="dday-card-title">${item.title}</h4>
      </div>
      <div class="dday-card-right">
        <span class="dday-card-calc ${tagClass}">${ddayText}</span>
        <div class="dday-card-actions">
          ${!isMain ? `<button type="button" class="dday-action-btn set-main-btn" data-id="${item.id}" title="상단 대표 뱃지로 지정">대표설정</button>` : ""}
          <button type="button" class="dday-action-btn delete-dday-btn" data-id="${item.id}" title="기념일 삭제">삭제</button>
        </div>
      </div>
    `;

    // 대표 설정 버튼
    const setMainBtn = card.querySelector(".set-main-btn");
    if (setMainBtn) {
      setMainBtn.addEventListener("click", async () => {
        currentDdayConfig.mainId = item.id;
        await saveDdayConfig(currentDdayConfig);
        renderDdayList();
        updateHeaderBadge();
      });
    }

    // 삭제 버튼
    const deleteBtn = card.querySelector(".delete-dday-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (!confirm(`"${item.title}" 기념일을 삭제하시겠습니까?`)) return;
        currentDdayConfig.items = currentDdayConfig.items.filter((it) => it.id !== item.id);
        if (currentDdayConfig.mainId === item.id) {
          currentDdayConfig.mainId = currentDdayConfig.items[0]?.id || null;
        }
        await saveDdayConfig(currentDdayConfig);
        renderDdayList();
        updateHeaderBadge();
        notifyCalendarDdayChange();
      });
    }

    ddayList.appendChild(card);
  });
}

/**
 * 기념일 설정 모달 열기
 */
function openDdayModal() {
  if (!ddayModal) return;
  renderDdayList();
  if (ddayDateInput && !ddayDateInput.value) {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    ddayDateInput.value = `${y}-${m}-${d}`;
  }
  ddayModal.hidden = false;
}

/**
 * 기념일 모달 닫기
 */
function closeDdayModal() {
  if (ddayModal) ddayModal.hidden = true;
}

/**
 * 디데이 모듈 초기화
 */
export function initDday() {
  // 1. 헤더 뱃지 클릭 시 모달 열기
  if (ddayBadgeBtn) {
    ddayBadgeBtn.addEventListener("click", openDdayModal);
  }

  // 2. 모달 닫기 버튼
  if (ddayCloseBtn) {
    ddayCloseBtn.addEventListener("click", closeDdayModal);
  }

  // 모달 배경 클릭 시 닫기
  if (ddayModal) {
    ddayModal.addEventListener("click", (e) => {
      if (e.target === ddayModal) closeDdayModal();
    });
  }

  // 3. 새 기념일 추가 폼 제출
  if (ddayAddForm) {
    ddayAddForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = ddayTitleInput.value.trim();
      const date = ddayDateInput.value;
      const type = ddayTypeSelect ? ddayTypeSelect.value : "count_up";

      if (!title || !date) {
        alert("기념일 제목과 날짜를 입력해 주세요!");
        return;
      }

      if (ddaySubmitBtn) ddaySubmitBtn.disabled = true;

      try {
        const newItem = {
          id: "dday_" + Date.now(),
          title,
          date,
          type,
        };

        if (!currentDdayConfig.items) currentDdayConfig.items = [];
        currentDdayConfig.items.push(newItem);

        // 첫 번째 항목이면 자동으로 대표 설정
        if (!currentDdayConfig.mainId) {
          currentDdayConfig.mainId = newItem.id;
        }

        await saveDdayConfig(currentDdayConfig);

        // 폼 초기화
        ddayTitleInput.value = "";
        renderDdayList();
        updateHeaderBadge();
        notifyCalendarDdayChange();
      } catch (err) {
        console.error("기념일 저장 실패:", err);
        alert("기념일을 저장하지 못했습니다. 다시 시도해 주세요.");
      } finally {
        if (ddaySubmitBtn) ddaySubmitBtn.disabled = false;
      }
    });
  }

  // 4. Firestore 실시간 구독
  subscribeDday((config) => {
    if (config) {
      // 기존 단일 dday 구조와의 하위 호환성 처리
      if (!config.items && config.startDate) {
        currentDdayConfig = {
          mainId: "dday_legacy",
          items: [
            {
              id: "dday_legacy",
              title: config.title || "함께한 지",
              date: config.startDate,
              type: "count_up",
            },
          ],
        };
      } else {
        currentDdayConfig = {
          mainId: config.mainId || (config.items && config.items[0]?.id) || null,
          items: config.items || [],
        };
      }
    } else {
      currentDdayConfig = { mainId: null, items: [] };
    }

    updateHeaderBadge();
    if (ddayModal && !ddayModal.hidden) {
      renderDdayList();
    }
    notifyCalendarDdayChange();
  });
}

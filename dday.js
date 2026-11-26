// =========================================================
// dday.js - 다중 기념일, 매년 반복 생일 및 맞춤 데이트/일정 D-Day 관리 모듈
// =========================================================

import { subscribeDday, saveDdayConfig } from "./store.js";
import {
  openModal,
  closeModal,
  formatDateString,
  escapeHtml,
  showError,
  showConfirmDialog,
} from "./ui.js";

const ddayChangeListeners = new Set();

export function onDdayChange(listener) {
  if (typeof listener === "function") {
    ddayChangeListeners.add(listener);
    return () => ddayChangeListeners.delete(listener);
  }
  return () => {};
}

function notifyDdayChange() {
  ddayChangeListeners.forEach((fn) => {
    try {
      fn(currentDdayConfig.items);
    } catch (err) {
      console.warn("[dday] 리스너 호출 오류:", err);
    }
  });
}

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
const ddayIconBtns = document.querySelectorAll(".dday-icon-btn");

let currentDdayConfig = { mainId: null, items: [] };
let selectedIcon = "💖";
let editingDdayId = null;

export function getCurrentDdayItems() {
  return currentDdayConfig.items || [];
}

function setActiveIcon(icon) {
  selectedIcon = icon;
  ddayIconBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.icon === icon);
  });
}

function resetDdayFormState() {
  editingDdayId = null;
  if (ddaySubmitBtn) ddaySubmitBtn.textContent = "기념일 추가하기";
  const formTitle = document.querySelector(".dday-form-title");
  if (formTitle) formTitle.textContent = "+ 새 기념일 / 일정 추가";
  if (ddayTitleInput) ddayTitleInput.value = "";
}

/**
 * 기념일 항목에 대한 D-Day 계산 및 오늘 시점 기준 정렬 스코어 산출 (UTC 기준 DST 오차 방지)
 */
export function calculateDdayInfo(item) {
  if (!item || !item.date) {
    return {
      ddayText: "",
      tagLabel: "기념일",
      tagClass: "count_up",
      tagIcon: "💖",
      sortScore: 99999,
      milestoneHint: "",
      isToday: false,
      diffDays: 99999,
    };
  }

  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const [y, m, d] = item.date.split("-").map(Number);
  const oneDayMs = 1000 * 60 * 60 * 24;

  const type = item.type || "count_up";
  const icon = item.icon || (type === "birthday" ? "🎂" : type === "event" ? "🌟" : "💖");

  if (type === "count_up") {
    const targetUtc = Date.UTC(y, m - 1, d);
    const diffDays = Math.round((todayUtc - targetUtc) / oneDayMs);
    const count = diffDays >= 0 ? diffDays + 1 : diffDays;

    const isFirstYear = count <= 365;
    let nextMilestoneCount;
    if (count <= 0) {
      nextMilestoneCount = 1;
    } else if (isFirstYear) {
      nextMilestoneCount = Math.ceil(count / 50) * 50;
      if (nextMilestoneCount < count) nextMilestoneCount += 50;
    } else {
      nextMilestoneCount = Math.ceil(count / 100) * 100;
      if (nextMilestoneCount < count) nextMilestoneCount += 100;
    }
    const daysToDayCount = count > 0 ? nextMilestoneCount - count : Math.abs(count);

    let nextAnnivUtc = Date.UTC(now.getFullYear(), m - 1, d);
    let annivYears = now.getFullYear() - y;
    if (nextAnnivUtc < todayUtc) {
      nextAnnivUtc = Date.UTC(now.getFullYear() + 1, m - 1, d);
      annivYears += 1;
    }
    const daysToAnniv = Math.round((nextAnnivUtc - todayUtc) / oneDayMs);

    let milestoneHint = "";
    let sortScore = 0;
    let isToday = false;

    if (daysToDayCount === 0) {
      milestoneHint = `${count}일 당일입니다! 💕`;
      sortScore = 0;
      isToday = true;
    } else if (daysToAnniv === 0 && annivYears > 0) {
      milestoneHint = `${annivYears}주년 당일입니다! 🎉`;
      sortScore = 0;
      isToday = true;
    } else if (daysToDayCount <= daysToAnniv) {
      milestoneHint = `다음 ${nextMilestoneCount}일까지 D-${daysToDayCount}`;
      sortScore = daysToDayCount;
    } else {
      milestoneHint = `다음 ${annivYears}주년까지 D-${daysToAnniv}`;
      sortScore = daysToAnniv;
    }

    return {
      ddayText: count >= 0 ? `D+${count}` : `D${count}`,
      tagLabel: `${icon} 함께한 날`,
      tagClass: "count_up",
      tagIcon: icon,
      sortScore,
      milestoneHint,
      isToday,
      diffDays,
    };
  } else if (type === "birthday") {
    let thisYearBdayUtc = Date.UTC(now.getFullYear(), m - 1, d);
    if (thisYearBdayUtc < todayUtc) {
      thisYearBdayUtc = Date.UTC(now.getFullYear() + 1, m - 1, d);
    }
    const diffDays = Math.round((thisYearBdayUtc - todayUtc) / oneDayMs);

    const isToday = diffDays === 0;
    let ddayText = "";
    let milestoneHint = "";

    if (isToday) {
      ddayText = `${icon} 오늘 생일!`;
      milestoneHint = "오늘 생일을 진심으로 축하해요! 🎂";
    } else if (diffDays === 1) {
      ddayText = "D-1";
      milestoneHint = "내일이 생일입니다! 🎁";
    } else {
      ddayText = `D-${diffDays}`;
      milestoneHint = `다음 생일까지 D-${diffDays}`;
    }

    return {
      ddayText,
      tagLabel: `${icon} 매년 생일`,
      tagClass: "birthday",
      tagIcon: icon,
      sortScore: diffDays,
      milestoneHint,
      isToday,
      diffDays,
    };
  } else {
    const targetUtc = Date.UTC(y, m - 1, d);
    const diffDays = Math.round((targetUtc - todayUtc) / oneDayMs);

    let ddayText = "";
    let sortScore = 0;
    let milestoneHint = "";
    const isToday = diffDays === 0;

    if (isToday) {
      ddayText = `${icon} 오늘 일정!`;
      sortScore = 0;
      milestoneHint = "오늘 예정된 일정/데이트 당일입니다! ✨";
    } else if (diffDays > 0) {
      ddayText = `D-${diffDays}`;
      sortScore = diffDays;
      milestoneHint = diffDays === 1 ? "내일 예정된 일정입니다!" : `${diffDays}일 남았습니다.`;
    } else {
      const pastDays = Math.abs(diffDays);
      ddayText = `D+${pastDays} 지남`;
      sortScore = 100000 + pastDays;
      milestoneHint = `${pastDays}일 전에 종료된 일정입니다.`;
    }

    return {
      ddayText,
      tagLabel: `${icon} 일정/데이트`,
      tagClass: "event",
      tagIcon: icon,
      sortScore,
      milestoneHint,
      isToday,
      diffDays,
    };
  }
}

export function sortDdayItems(items, mainId) {
  if (!Array.isArray(items) || items.length === 0) return [];

  const effectiveMainId =
    mainId ||
    (items.length === 1
      ? items[0].id
      : (items.find((it) => (it.type || "count_up") === "count_up") || items[0]).id);

  const mainItem = items.find((it) => it.id === effectiveMainId);
  const otherItems = items.filter((it) => it.id !== effectiveMainId);

  const scoreMap = new Map();
  for (const item of otherItems) {
    scoreMap.set(item.id, calculateDdayInfo(item).sortScore);
  }

  otherItems.sort((a, b) => scoreMap.get(a.id) - scoreMap.get(b.id));

  return mainItem ? [mainItem, ...otherItems] : otherItems;
}

export function getDdayItems() {
  return currentDdayConfig && currentDdayConfig.items ? currentDdayConfig.items : [];
}

export function getMainDdayItem() {
  if (!currentDdayConfig || !currentDdayConfig.items || currentDdayConfig.items.length === 0) {
    return null;
  }
  let mainItem = currentDdayConfig.items.find((it) => it.id === currentDdayConfig.mainId);
  if (!mainItem) {
    mainItem =
      currentDdayConfig.items.find((it) => (it.type || "count_up") === "count_up") ||
      currentDdayConfig.items[0];
  }
  return mainItem;
}

export function getMilestonesForDate(dateStr) {
  const mainItem = getMainDdayItem();
  if (!mainItem || !mainItem.date || (mainItem.type && mainItem.type !== "count_up")) {
    return [];
  }

  const [startY, startM, startD] = mainItem.date.split("-").map(Number);
  const [targetY, targetM, targetD] = dateStr.split("-").map(Number);

  if (targetY > 2099) {
    return [];
  }

  const startUtc = Date.UTC(startY, startM - 1, startD);
  const targetUtc = Date.UTC(targetY, targetM - 1, targetD);

  const oneDayMs = 1000 * 60 * 60 * 24;
  const diffDays = Math.round((targetUtc - startUtc) / oneDayMs);
  const count = diffDays + 1;

  const milestones = [];

  const isFirstYear = count <= 365;
  const isDayMilestone = count > 0 && (isFirstYear ? count % 50 === 0 : count % 100 === 0);

  if (isDayMilestone) {
    milestones.push({
      id: `milestone_${count}`,
      title: `${mainItem.title} ${count}일`,
      icon: mainItem.icon || "💖",
      date: dateStr,
      type: "count_up",
      isMilestone: true,
      milestoneText: `${count}일`,
    });
  }

  if (targetY > startY && targetM === startM && targetD === startD) {
    const years = targetY - startY;
    milestones.push({
      id: `milestone_${years}y`,
      title: `${mainItem.title} ${years}주년`,
      icon: "🎉",
      date: dateStr,
      type: "count_up",
      isMilestone: true,
      milestoneText: `${years}주년`,
    });
  }

  return milestones;
}

function updateHeaderBadge() {
  if (!ddayBadgeBtn || !ddayBadgeText) return;

  const items = getDdayItems();
  if (items.length === 0) {
    ddayBadgeText.textContent = "기념일 설정";
    ddayBadgeBtn.title = "클릭하여 기념일 또는 일정을 등록하세요";
    return;
  }

  let mainItem = items.find((it) => it.id === currentDdayConfig.mainId);
  if (!mainItem) {
    mainItem = items[0];
  }

  const { ddayText } = calculateDdayInfo(mainItem);
  const icon =
    mainItem.icon || (mainItem.type === "birthday" ? "🎂" : mainItem.type === "event" ? "🌟" : "💖");

  if (mainItem.type === "count_up") {
    ddayBadgeText.textContent = `${icon} ${ddayText}`;
  } else {
    ddayBadgeText.textContent = `${icon} ${mainItem.title} ${ddayText}`;
  }
  ddayBadgeBtn.title = `${mainItem.title} (${mainItem.date}) ${ddayText} - 클릭하여 전체 목록 보기`;
}

function renderDdayList() {
  if (!ddayList) return;
  ddayList.innerHTML = "";

  const items = getDdayItems();
  if (items.length === 0) {
    if (ddayEmptyText) ddayEmptyText.hidden = false;
    return;
  }

  if (ddayEmptyText) ddayEmptyText.hidden = true;

  const sortedItems = sortDdayItems(items, currentDdayConfig.mainId);

  sortedItems.forEach((item) => {
    const isMain =
      item.id === currentDdayConfig.mainId || (items.length === 1 && !currentDdayConfig.mainId);
    const { ddayText, tagLabel, tagClass, milestoneHint, isToday } = calculateDdayInfo(item);

    const card = document.createElement("div");
    card.className = `dday-card-item ${isMain ? "main-item" : ""} ${isToday ? "today-item" : ""}`;

    const safeTitle = escapeHtml(item.title);
    const safeDate = escapeHtml(item.date);
    const safeTagLabel = escapeHtml(tagLabel);
    const safeHint = escapeHtml(milestoneHint);
    const safeDdayText = escapeHtml(ddayText);
    const safeId = escapeHtml(item.id);

    card.innerHTML = `
      <div class="dday-card-left">
        <div class="dday-card-header">
          <span class="dday-type-tag ${tagClass}">${safeTagLabel}</span>
          ${isMain ? '<span class="dday-main-badge">★ 대표</span>' : ""}
          ${isToday && !isMain ? '<span class="dday-today-badge">🔥 오늘</span>' : ""}
          <span class="dday-card-date">${safeDate}</span>
        </div>
        <h4 class="dday-card-title">${safeTitle}</h4>
        ${safeHint ? `<span class="dday-card-hint">${safeHint}</span>` : ""}
      </div>
      <div class="dday-card-right">
        <span class="dday-card-calc ${tagClass} ${isToday ? "today-calc" : ""}">${safeDdayText}</span>
        <div class="dday-card-actions">
          ${!isMain ? `<button type="button" class="dday-action-btn set-main-btn" data-id="${safeId}" title="상단 대표 뱃지로 지정">대표설정</button>` : ""}
          <button type="button" class="dday-action-btn edit-dday-btn" data-id="${safeId}" title="기념일 수정">수정</button>
          <button type="button" class="dday-action-btn delete-dday-btn" data-id="${safeId}" title="기념일 삭제">삭제</button>
        </div>
      </div>
    `;

    const setMainBtn = card.querySelector(".set-main-btn");
    if (setMainBtn) {
      setMainBtn.addEventListener("click", async () => {
        try {
          currentDdayConfig.mainId = item.id;
          await saveDdayConfig(currentDdayConfig);
          renderDdayList();
          updateHeaderBadge();
          notifyDdayChange();
        } catch (err) {
          console.error("[dday] 대표 기념일 설정 실패:", err);
          showError("대표 기념일을 설정하지 못했습니다: " + err.message);
        }
      });
    }

    const editBtn = card.querySelector(".edit-dday-btn");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        editingDdayId = item.id;
        if (ddayTitleInput) ddayTitleInput.value = item.title || "";
        if (ddayDateInput) ddayDateInput.value = item.date || "";
        if (ddayTypeSelect) ddayTypeSelect.value = item.type || "count_up";
        setActiveIcon(
          item.icon || (item.type === "birthday" ? "🎂" : item.type === "event" ? "🌟" : "💖")
        );
        if (ddaySubmitBtn) ddaySubmitBtn.textContent = "기념일 수정 완료";
        const formTitle = document.querySelector(".dday-form-title");
        if (formTitle) formTitle.textContent = "✏️ 기념일 / 일정 수정";
        if (ddayTitleInput) {
          ddayTitleInput.scrollIntoView({ behavior: "smooth", block: "nearest" });
          ddayTitleInput.focus({ preventScroll: true });
        }
      });
    }

    const deleteBtn = card.querySelector(".delete-dday-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        const ok = await showConfirmDialog({
          title: "일정 삭제",
          message: `"${item.title}" 일정을 삭제하시겠습니까?`,
          confirmText: "삭제",
          danger: true,
        });
        if (!ok) return;
        try {
          currentDdayConfig.items = currentDdayConfig.items.filter((it) => it.id !== item.id);
          if (currentDdayConfig.mainId === item.id) {
            currentDdayConfig.mainId = currentDdayConfig.items[0]?.id || null;
          }
          if (editingDdayId === item.id) {
            resetDdayFormState();
          }
          await saveDdayConfig(currentDdayConfig);
          renderDdayList();
          updateHeaderBadge();
          notifyDdayChange();
        } catch (err) {
          console.error("[dday] 일정 삭제 실패:", err);
          showError("일정을 삭제하지 못했습니다: " + err.message);
        }
      });
    }

    ddayList.appendChild(card);
  });
}

export function openDdayModal() {
  if (!ddayModal) return;
  resetDdayFormState();
  renderDdayList();
  if (ddayDateInput && !ddayDateInput.value) {
    ddayDateInput.value = formatDateString();
  }
  openModal(ddayModal);
}

export function openDdayModalWithDate(dateStr, type = "event") {
  if (!ddayModal) return;
  resetDdayFormState();
  renderDdayList();
  if (ddayDateInput && dateStr) {
    ddayDateInput.value = dateStr;
  }
  if (ddayTypeSelect) {
    ddayTypeSelect.value = type;
    setActiveIcon(type === "birthday" ? "🎂" : type === "event" ? "🌟" : "💖");
  }
  openModal(ddayModal);
  setTimeout(() => {
    if (ddayTitleInput) {
      ddayTitleInput.focus();
    }
  }, 100);
}

function closeDdayModal() {
  resetDdayFormState();
  closeModal(ddayModal);
}

export function initDday() {
  if (ddayBadgeBtn) {
    ddayBadgeBtn.addEventListener("click", openDdayModal);
  }

  if (ddayCloseBtn) {
    ddayCloseBtn.addEventListener("click", closeDdayModal);
  }
  const ddayCancelBtn = document.getElementById("dday-cancel-btn");
  if (ddayCancelBtn) {
    ddayCancelBtn.addEventListener("click", closeDdayModal);
  }

  // ESC 키나 오버레이 클릭으로 닫혀도 수정 상태 초기화
  if (ddayModal) {
    ddayModal.addEventListener("modal:closed", () => {
      resetDdayFormState();
    });
  }

  if (ddayTitleInput) {
    ddayTitleInput.addEventListener("blur", () => {
      window.scrollTo({ top: window.scrollY, left: 0, behavior: "instant" });
    });
  }

  ddayIconBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      setActiveIcon(btn.dataset.icon);
    });
  });

  if (ddayTypeSelect) {
    ddayTypeSelect.addEventListener("change", (e) => {
      const type = e.target.value;
      if (type === "birthday") {
        setActiveIcon("🎂");
      } else if (type === "event") {
        setActiveIcon("🍿");
      } else {
        setActiveIcon("💖");
      }
    });
  }

  if (ddayAddForm) {
    ddayAddForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const title = ddayTitleInput.value.trim();
      const date = ddayDateInput.value;
      const type = ddayTypeSelect ? ddayTypeSelect.value : "count_up";
      const icon = selectedIcon || "💖";

      if (!title || !date) {
        showError("일정 제목과 날짜를 입력해 주세요!");
        return;
      }

      if (ddaySubmitBtn) ddaySubmitBtn.disabled = true;

      try {
        if (editingDdayId) {
          const targetItem = (currentDdayConfig.items || []).find((it) => it.id === editingDdayId);
          if (targetItem) {
            targetItem.title = title;
            targetItem.date = date;
            targetItem.type = type;
            targetItem.icon = icon;
          }
          resetDdayFormState();
        } else {
          const newItem = {
            id: "dday_" + Date.now(),
            title,
            date,
            type,
            icon,
          };

          if (!currentDdayConfig.items) currentDdayConfig.items = [];
          currentDdayConfig.items.push(newItem);

          if (!currentDdayConfig.mainId) {
            currentDdayConfig.mainId = newItem.id;
          }
          ddayTitleInput.value = "";
        }

        await saveDdayConfig(currentDdayConfig);

        renderDdayList();
        updateHeaderBadge();
        notifyDdayChange();
      } catch (err) {
        console.error("[dday] 기념일 저장 실패:", err);
        showError("기념일을 저장하지 못했습니다. 다시 시도해 주세요.");
      } finally {
        if (ddaySubmitBtn) ddaySubmitBtn.disabled = false;
      }
    });
  }
}

let unsubscribeDday = null;

export function startDdaySubscription() {
  if (unsubscribeDday) return;
  try {
    unsubscribeDday = subscribeDday((config) => {
      if (config) {
        if (!config.items && config.startDate) {
          currentDdayConfig = {
            mainId: "dday_legacy",
            items: [
              {
                id: "dday_legacy",
                title: config.title || "함께한 날",
                date: config.startDate,
                type: "count_up",
                icon: "💖",
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
      notifyDdayChange();
    });
  } catch (err) {
    console.warn("[dday] D-Day 구독 오류:", err);
  }
}

export function stopDdaySubscription() {
  if (unsubscribeDday) {
    unsubscribeDday();
    unsubscribeDday = null;
  }
}

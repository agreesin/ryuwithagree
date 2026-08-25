// =========================================================
// dday.js - 디데이(D-Day) 뱃지 및 기념일 설정 모듈
// =========================================================

import { subscribeDday, saveDdayConfig } from "./store.js";
import { showToastNotification } from "./notify.js";

const ddayBadgeBtn = document.getElementById("dday-badge-btn");
const ddayBadgeText = document.getElementById("dday-badge-text");
const ddayModal = document.getElementById("dday-modal");
const ddayForm = document.getElementById("dday-form");
const ddayDateInput = document.getElementById("dday-date-input");
const ddayTitleInput = document.getElementById("dday-title-input");
const ddayCloseBtn = document.getElementById("dday-close-btn");

let currentDdayConfig = null;

/**
 * 시작일 기준으로 오늘 며칠째인지 계산합니다 (당일 = D+1).
 */
export function calculateDday(startDateStr) {
  if (!startDateStr) return null;

  const [y, m, d] = startDateStr.split("-").map(Number);
  const start = new Date(y, m - 1, d, 0, 0, 0);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

  const diffMs = today.getTime() - start.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays >= 0) {
    return `D+${diffDays + 1}`;
  } else {
    return `D${diffDays}`;
  }
}

/**
 * 디데이 뱃지 UI를 갱신합니다.
 */
function updateDdayUI(config) {
  currentDdayConfig = config;
  if (!ddayBadgeBtn || !ddayBadgeText) return;

  if (config && config.startDate) {
    const ddayStr = calculateDday(config.startDate);
    const title = config.title || "함께한 지";
    ddayBadgeText.textContent = `${title} ${ddayStr}`;
    ddayBadgeBtn.title = `${config.startDate} 시작 (${title} ${ddayStr}) - 클릭하여 수정`;
  } else {
    ddayBadgeText.textContent = "기념일 설정";
    ddayBadgeBtn.title = "클릭하여 시작일(기념일)을 설정하세요";
  }
}

/**
 * 디데이 설정 모달 열기
 */
function openDdayModal() {
  if (!ddayModal) return;

  if (currentDdayConfig) {
    if (ddayDateInput) ddayDateInput.value = currentDdayConfig.startDate || "";
    if (ddayTitleInput) ddayTitleInput.value = currentDdayConfig.title || "함께한 지";
  } else {
    if (ddayDateInput) ddayDateInput.value = "";
    if (ddayTitleInput) ddayTitleInput.value = "함께한 지";
  }

  ddayModal.hidden = false;
}

/**
 * 디데이 설정 모달 닫기
 */
function closeDdayModal() {
  if (ddayModal) ddayModal.hidden = true;
}

/**
 * 디데이 모듈 초기화
 */
export function initDday() {
  // 실시간 디데이 설정 구독
  subscribeDday((config) => {
    updateDdayUI(config);
  });

  if (ddayBadgeBtn) {
    ddayBadgeBtn.addEventListener("click", () => {
      openDdayModal();
    });
  }

  if (ddayCloseBtn) {
    ddayCloseBtn.addEventListener("click", () => {
      closeDdayModal();
    });
  }

  if (ddayForm) {
    ddayForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const startDate = ddayDateInput.value.trim();
      const title = ddayTitleInput.value.trim() || "함께한 지";

      if (!startDate) {
        alert("시작 날짜를 선택해주세요!");
        return;
      }

      try {
        await saveDdayConfig({ startDate, title });
        closeDdayModal();
        showToastNotification("기념일이 저장되었습니다! 💖", "🎉");
      } catch (err) {
        console.error(err);
        alert("기념일을 저장하지 못했습니다.");
      }
    });
  }
}

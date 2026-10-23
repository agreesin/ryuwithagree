// =========================================================
// ui.js - 공통 UI 헬퍼 모듈
// 에러 배너, 모달 통합 제어(ESC/스크롤 락) 및 날짜 공통 포맷팅을 담당합니다.
// =========================================================

const errorBanner = document.getElementById("error-banner");

/**
 * 상단 에러 배너에 메시지를 표시합니다.
 * @param {string} message 
 */
export function showError(message) {
  if (errorBanner) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
  }
}

/**
 * 상단 에러 배너를 숨깁니다.
 */
export function hideError() {
  if (errorBanner) {
    errorBanner.hidden = true;
  }
}

// ---------------------------------------------------------
// 모달 공통 관리 및 모바일 스크롤 락 / ESC 키 지원
// ---------------------------------------------------------

/**
 * 모달 요소를 화면에 표시하고 배경 스크롤을 잠급니다.
 * @param {HTMLElement} modalElement - .modal-overlay 요소
 */
export function openModal(modalElement) {
  if (!modalElement) return;
  modalElement.hidden = false;
  document.body.classList.add("modal-open");
}

/**
 * 모달 요소를 숨기고, 열려있는 다른 모달이 없을 경우 배경 스크롤 잠금을 해제합니다.
 * @param {HTMLElement} modalElement - .modal-overlay 요소
 */
export function closeModal(modalElement) {
  if (!modalElement) return;
  modalElement.hidden = true;

  const anyOpen = document.querySelector(".modal-overlay:not([hidden])");
  if (!anyOpen) {
    document.body.classList.remove("modal-open");
  }
}

/**
 * 화면에 열려 있는 모든 모달을 닫고 배경 스크롤 잠금을 해제합니다.
 * (로그아웃, 세션 만료 시 호출)
 */
export function closeAllModals() {
  const openModals = document.querySelectorAll(".modal-overlay:not([hidden])");
  openModals.forEach((m) => {
    m.hidden = true;
  });
  document.body.classList.remove("modal-open");
}

/**
 * 전역 ESC 키 및 모달 배경 클릭 이벤트를 초기화합니다.
 */
export function initModalAccessibility() {
  // ESC 키로 최상단 모달 닫기
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" || e.key === "Esc") {
      const openModals = Array.from(document.querySelectorAll(".modal-overlay:not([hidden])"));
      if (openModals.length > 0) {
        // 가장 마지막(최상단) 열린 모달 닫기
        const topModal = openModals[openModals.length - 1];
        closeModal(topModal);
      }
    }
  });

  // 모달 오버레이(배경) 클릭 시 닫기
  document.addEventListener("click", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("modal-overlay")) {
      closeModal(e.target);
    }
  });
}

// ---------------------------------------------------------
// 공통 날짜 포맷팅 유틸리티
// ---------------------------------------------------------

/**
 * 주어진 날짜/타임스탬프를 'YYYY-MM-DD' 형식의 문자열로 반환합니다.
 * @param {Date|number|string} [dateOrTimestamp=Date.now()]
 * @returns {string} 예: "2026-09-09"
 */
export function formatDateString(dateOrTimestamp = Date.now()) {
  const d = dateOrTimestamp instanceof Date ? dateOrTimestamp : new Date(dateOrTimestamp);
  if (isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 일기 카드 및 댓글에 표시할 한국어 표준 일시 문자열을 반환합니다.
 * @param {Date|number|string} dateOrTimestamp
 * @returns {string} 예: "2026년 9월 9일 20:30"
 */
export function formatDateTime(dateOrTimestamp) {
  if (!dateOrTimestamp) return "";
  const d = dateOrTimestamp instanceof Date ? dateOrTimestamp : new Date(dateOrTimestamp);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 타임스탬프를 기준으로 상대 시간(방금 전, N분 전, N시간 전, 어제, N일 전 등)을 반환합니다.
 * @param {number} timestamp
 * @returns {string}
 */
export function formatRelativeTime(timestamp) {
  if (!timestamp) return "";
  const now = Date.now();
  const diff = now - timestamp;
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hour = Math.floor(min / 60);
  const day = Math.floor(hour / 24);

  if (sec < 60) return "방금 전";
  if (min < 60) return `${min}분 전`;
  if (hour < 24) return `${hour}시간 전`;
  if (day === 1) return "어제";
  if (day < 7) return `${day}일 전`;

  const d = new Date(timestamp);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${m}.${dd}`;
}

/**
 * 채팅/한마디 메시지 작성 시간을 친근한 형식(방금 전, n분 전, HH:mm, M/D HH:mm)으로 반환합니다.
 * @param {Date|number|string} dateOrTimestamp
 * @returns {string}
 */
export function formatChatTime(dateOrTimestamp) {
  if (!dateOrTimestamp) return "";
  const d = dateOrTimestamp instanceof Date ? dateOrTimestamp : new Date(dateOrTimestamp);
  if (isNaN(d.getTime())) return "";
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diffSec < 60) return "방금 전";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;

  const m = d.getMonth() + 1;
  const day = d.getDate();
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");

  const isSameDay = d.toDateString() === now.toDateString();
  if (isSameDay) {
    return `${hours}:${minutes}`;
  }
  return `${m}/${day} ${hours}:${minutes}`;
}

export const formatCommentTime = formatChatTime;


// ---------------------------------------------------------
// 보안 및 텍스트 이스케이프 유틸리티
// ---------------------------------------------------------

/**
 * XSS 공격 방지를 위해 텍스트를 안전한 HTML 엔티티로 변환합니다.
 * @param {string|null|undefined} text
 * @returns {string}
 */
export function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  const str = String(text);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

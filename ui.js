// =========================================================
// ui.js - 공통 UI 헬퍼 모듈
// 에러 배너, 모달 통합 제어(ESC/스크롤 락/포커스 복귀), 커스텀 확인 모달,
// 사진 라이트박스, 다크 모드 테마 제어, 날짜 포맷팅 및 XSS 이스케이프 담당
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
// 모달 공통 관리 (스크롤 락, ESC/배경 닫기, 포커스 관리, 잠금 모달 보호)
// ---------------------------------------------------------

const modalFocusReturnMap = new WeakMap();

const FOCUSABLE_SELECTOR =
  'button:not([disabled]):not([hidden]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isModalLocked(modalElement) {
  return Boolean(modalElement && modalElement.dataset && modalElement.dataset.lockedModal === "true");
}

function getTopOpenModal() {
  const openModals = Array.from(document.querySelectorAll(".modal-overlay:not([hidden])"));
  return openModals.length > 0 ? openModals[openModals.length - 1] : null;
}

/**
 * 모달 요소를 화면에 표시하고 배경 스크롤을 잠급니다.
 * @param {HTMLElement} modalElement - .modal-overlay 요소
 */
export function openModal(modalElement) {
  if (!modalElement) return;
  const activeEl = document.activeElement;
  if (activeEl instanceof HTMLElement && !modalElement.contains(activeEl)) {
    modalFocusReturnMap.set(modalElement, activeEl);
  }
  modalElement.hidden = false;
  document.body.classList.add("modal-open");

  requestAnimationFrame(() => {
    const focusables = modalElement.querySelectorAll(FOCUSABLE_SELECTOR);
    if (focusables.length > 0 && !modalElement.contains(document.activeElement)) {
      const first = focusables[0];
      if (first instanceof HTMLElement) {
        first.focus({ preventScroll: true });
      }
    }
  });
}

/**
 * 모달 요소를 숨기고, 열려있는 다른 모달이 없을 경우 배경 스크롤 잠금을 해제합니다.
 * @param {HTMLElement} modalElement - .modal-overlay 요소
 */
export function closeModal(modalElement) {
  if (!modalElement) return;
  const wasOpen = !modalElement.hidden;
  modalElement.hidden = true;

  const anyOpen = document.querySelector(".modal-overlay:not([hidden])");
  if (!anyOpen) {
    document.body.classList.remove("modal-open");
  }

  if (wasOpen) {
    modalElement.dispatchEvent(
      new CustomEvent("modal:closed", { bubbles: true, detail: { modal: modalElement } })
    );
    const returnEl = modalFocusReturnMap.get(modalElement);
    modalFocusReturnMap.delete(modalElement);
    if (returnEl && returnEl.isConnected && !returnEl.hidden) {
      try {
        returnEl.focus({ preventScroll: true });
      } catch {
        // 포커스 복구 실패 안전 무시
      }
    }
  }
}

/**
 * 화면에 열려 있는 모든 모달을 닫고 배경 스크롤 잠금을 해제합니다.
 * (로그아웃, 세션 만료 시 호출)
 */
export function closeAllModals() {
  const openModals = document.querySelectorAll(".modal-overlay:not([hidden])");
  openModals.forEach((m) => {
    closeModal(m);
  });
  document.body.classList.remove("modal-open");
}

/**
 * 전역 ESC 키, 포커스 트랩(Tab), 모달 배경 클릭 이벤트를 초기화합니다.
 */
export function initModalAccessibility() {
  window.addEventListener("keydown", (e) => {
    const topModal = getTopOpenModal();
    if (!topModal) return;

    if (e.key === "Escape" || e.key === "Esc") {
      if (isModalLocked(topModal)) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      closeModal(topModal);
      return;
    }

    if (e.key === "Tab") {
      const focusables = Array.from(topModal.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
        (el) => el instanceof HTMLElement && el.offsetParent !== null
      );
      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  // 모달 오버레이(배경) 클릭 시 닫기 (잠금 모달 제외)
  document.addEventListener("click", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("modal-overlay")) {
      if (isModalLocked(e.target)) return;
      closeModal(e.target);
    }
  });
}

// ---------------------------------------------------------
// 공통 커스텀 확인 다이얼로그 (네이티브 confirm 대체)
// ---------------------------------------------------------

let activeConfirmResolve = null;
let confirmDialogInitialized = false;

function ensureConfirmDialogBound() {
  if (confirmDialogInitialized) return;
  const modal = document.getElementById("confirm-modal");
  const okBtn = document.getElementById("confirm-modal-ok");
  const cancelBtn = document.getElementById("confirm-modal-cancel");
  if (!modal || !okBtn || !cancelBtn) return;

  confirmDialogInitialized = true;

  const finish = (result) => {
    const resolver = activeConfirmResolve;
    activeConfirmResolve = null;
    closeModal(modal);
    if (resolver) resolver(result);
  };

  okBtn.addEventListener("click", () => finish(true));
  cancelBtn.addEventListener("click", () => finish(false));
  modal.addEventListener("modal:closed", () => {
    if (activeConfirmResolve) {
      const resolver = activeConfirmResolve;
      activeConfirmResolve = null;
      resolver(false);
    }
  });
}

/**
 * 감성 커스텀 확인 모달을 열고 사용자 응답(boolean)을 Promise로 반환합니다.
 * @param {string|Object} options
 * @returns {Promise<boolean>}
 */
export function showConfirmDialog(options) {
  const config =
    typeof options === "string"
      ? { message: options }
      : options || {};

  const modal = document.getElementById("confirm-modal");
  const iconEl = document.getElementById("confirm-modal-icon");
  const titleEl = document.getElementById("confirm-modal-title");
  const msgEl = document.getElementById("confirm-modal-message");
  const okBtn = document.getElementById("confirm-modal-ok");
  const cancelBtn = document.getElementById("confirm-modal-cancel");

  if (!modal || !msgEl || !okBtn || !cancelBtn) {
    return Promise.resolve(window.confirm(config.message || "진행하시겠습니까?"));
  }

  ensureConfirmDialogBound();

  if (activeConfirmResolve) {
    const prev = activeConfirmResolve;
    activeConfirmResolve = null;
    prev(false);
  }

  if (iconEl) iconEl.textContent = config.icon || (config.danger ? "🗑️" : "💌");
  if (titleEl) titleEl.textContent = config.title || "한 번 더 확인해 주세요";
  msgEl.textContent = config.message || "";
  okBtn.textContent = config.confirmText || (config.danger ? "삭제하기" : "확인");
  cancelBtn.textContent = config.cancelText || "취소";
  okBtn.classList.toggle("danger", Boolean(config.danger));

  openModal(modal);

  return new Promise((resolve) => {
    activeConfirmResolve = resolve;
  });
}

// ---------------------------------------------------------
// 사진 전체화면 라이트박스 (Lightbox)
// ---------------------------------------------------------

let lightboxImages = [];
let lightboxIndex = 0;
let lightboxZoomed = false;
let lightboxBound = false;

function renderLightboxState() {
  const imgEl = document.getElementById("lightbox-img");
  const counterEl = document.getElementById("lightbox-counter");
  const captionEl = document.getElementById("lightbox-caption");
  const prevBtn = document.getElementById("lightbox-prev");
  const nextBtn = document.getElementById("lightbox-next");
  const downloadBtn = document.getElementById("lightbox-download");

  if (!imgEl || lightboxImages.length === 0) return;

  const src = lightboxImages[lightboxIndex];
  imgEl.src = src;
  imgEl.classList.toggle("zoomed", lightboxZoomed);

  if (counterEl) {
    counterEl.textContent = `${lightboxIndex + 1} / ${lightboxImages.length}`;
    counterEl.hidden = lightboxImages.length <= 1;
  }
  if (prevBtn) {
    prevBtn.hidden = lightboxImages.length <= 1;
    prevBtn.disabled = lightboxIndex === 0;
  }
  if (nextBtn) {
    nextBtn.hidden = lightboxImages.length <= 1;
    nextBtn.disabled = lightboxIndex >= lightboxImages.length - 1;
  }
  if (downloadBtn) {
    downloadBtn.href = src;
    downloadBtn.download = `ryudiary-photo-${lightboxIndex + 1}.webp`;
  }
  if (captionEl) {
    captionEl.hidden = !captionEl.textContent;
  }
}

function bindLightboxEvents() {
  if (lightboxBound) return;
  const modal = document.getElementById("lightbox-modal");
  const closeBtn = document.getElementById("lightbox-close");
  const prevBtn = document.getElementById("lightbox-prev");
  const nextBtn = document.getElementById("lightbox-next");
  const zoomBtn = document.getElementById("lightbox-zoom");
  const imgEl = document.getElementById("lightbox-img");
  const stageEl = document.getElementById("lightbox-stage");
  if (!modal || !imgEl) return;

  lightboxBound = true;

  const step = (delta) => {
    const next = lightboxIndex + delta;
    if (next >= 0 && next < lightboxImages.length) {
      lightboxIndex = next;
      lightboxZoomed = false;
      renderLightboxState();
    }
  };

  if (closeBtn) closeBtn.addEventListener("click", () => closeModal(modal));
  if (prevBtn) prevBtn.addEventListener("click", (e) => { e.stopPropagation(); step(-1); });
  if (nextBtn) nextBtn.addEventListener("click", (e) => { e.stopPropagation(); step(1); });

  const toggleZoom = (e) => {
    e.stopPropagation();
    lightboxZoomed = !lightboxZoomed;
    renderLightboxState();
  };

  if (zoomBtn) zoomBtn.addEventListener("click", toggleZoom);
  imgEl.addEventListener("click", toggleZoom);

  // 키보드 좌우 화살표 지원
  window.addEventListener("keydown", (e) => {
    if (modal.hidden) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    }
  });

  // 모바일 좌우 스와이프 전환
  if (stageEl) {
    let sx = 0;
    let sy = 0;
    stageEl.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1 || lightboxZoomed) return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    }, { passive: true });
    stageEl.addEventListener("touchend", (e) => {
      if (!sx || lightboxZoomed || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      sx = 0;
      sy = 0;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        if (dx < 0) step(1);
        else step(-1);
      }
    }, { passive: true });
  }
}

/**
 * 전체화면 사진 라이트박스 뷰어를 엽니다.
 * @param {Array<string>} images - 이미지 URL/DataURL 배열
 * @param {number} [startIndex=0]
 * @param {string} [caption=""]
 */
export function openLightbox(images, startIndex = 0, caption = "") {
  const modal = document.getElementById("lightbox-modal");
  const captionEl = document.getElementById("lightbox-caption");
  if (!modal || !Array.isArray(images) || images.length === 0) return;

  bindLightboxEvents();
  lightboxImages = images;
  lightboxIndex = Math.max(0, Math.min(startIndex, images.length - 1));
  lightboxZoomed = false;

  if (captionEl) {
    captionEl.textContent = caption || "";
  }

  renderLightboxState();
  openModal(modal);
}

// ---------------------------------------------------------
// 다크 모드 테마 관리 (라이트 / 다크 / 시스템 연동)
// ---------------------------------------------------------

const STORAGE_KEY_THEME = "diary_theme_pref";

function applyResolvedTheme(pref) {
  const prefersDark =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const resolved = pref === "dark" || pref === "light" ? pref : (prefersDark ? "dark" : "light");
  document.documentElement.setAttribute("data-theme", resolved);

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute("content", resolved === "dark" ? "#1c1519" : "#e66d7b");
  }

  const toggleBtn = document.getElementById("theme-toggle-btn");
  const toggleIcon = document.getElementById("theme-toggle-icon");
  if (toggleBtn) {
    const nextLabel = resolved === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환";
    toggleBtn.title = nextLabel;
    toggleBtn.setAttribute("aria-label", nextLabel);
    toggleBtn.setAttribute("aria-pressed", String(resolved === "dark"));
  }
  if (toggleIcon) {
    toggleIcon.textContent = resolved === "dark" ? "☀️" : "🌙";
  }
}

/**
 * 다크 모드 테마를 초기화하고 토글 버튼 이벤트를 바인딩합니다.
 */
export function initTheme() {
  let savedPref = "system";
  try {
    savedPref = localStorage.getItem(STORAGE_KEY_THEME) || "system";
  } catch {
    savedPref = "system";
  }

  applyResolvedTheme(savedPref);

  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onSystemChange = () => {
      let pref = "system";
      try {
        pref = localStorage.getItem(STORAGE_KEY_THEME) || "system";
      } catch {
        pref = "system";
      }
      if (pref === "system") {
        applyResolvedTheme("system");
      }
    };
    if (mq.addEventListener) mq.addEventListener("change", onSystemChange);
    else if (mq.addListener) mq.addListener(onSystemChange);
  }

  const toggleBtn = document.getElementById("theme-toggle-btn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY_THEME, next);
      } catch {
        // 스토리지 제한 안전 무시
      }
      applyResolvedTheme(next);
    });
  }
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
  const diff = Math.max(0, now - timestamp);
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
// 보안 및 텍스트/URL 이스케이프 유틸리티
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

/**
 * 이미지 src에 안전한 URL 프로토콜(https, http, data:image/*)만 허용합니다.
 * @param {string|null|undefined} url
 * @returns {string}
 */
export function sanitizeImageUrl(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("data:image/")
  ) {
    return trimmed;
  }
  return "";
}

/**
 * 구버전 기분 이모지를 최신 표준 이모지로 정규화합니다.
 * @param {string|null|undefined} mood
 * @returns {string}
 */
export function normalizeMood(mood) {
  if (!mood) return "";
  return mood === "🫪" ? "🤯" : mood;
}

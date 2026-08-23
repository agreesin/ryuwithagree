// =========================================================
// ui.js - 공통 UI 헬퍼 모듈
// 에러 배너 표시 및 숨김 기능을 담당합니다.
// =========================================================

const errorBanner = document.getElementById("error-banner");

export function showError(message) {
  if (errorBanner) {
    errorBanner.textContent = message;
    errorBanner.hidden = false;
  }
}

export function hideError() {
  if (errorBanner) {
    errorBanner.hidden = true;
  }
}

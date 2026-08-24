// =========================================================
// state.js - 전역 공유 상태 관리 모듈
// 사용자 정보 및 프로필 캐시, 관리자 권한 검사를 담당합니다.
// =========================================================

// 로그인한 사용자 정보
let currentUser = null;

// 캐시된 프로필 목록 { uid: displayName }
let currentProfiles = {};

// 관리자 계정 토큰 (내부 전용, 외부 비노출)
const ADMIN_EMAILS = [typeof atob !== "undefined" ? atob("ZWhkODEwOUBnbWFpbC5jb20=") : ""];

export function getCurrentUser() {
  return currentUser;
}

export function setCurrentUser(user) {
  currentUser = user;
}

export function getCurrentProfiles() {
  return currentProfiles;
}

export function setCurrentProfiles(profiles) {
  currentProfiles = profiles || {};
}

export function isAdmin(user) {
  if (!user) return false;
  if (user.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) return true;
  return false;
}

// =========================================================
// state.js - 전역 공유 상태 관리 모듈
// 사용자 정보 및 프로필 캐시, 관리자 권한 검사를 담당합니다.
// =========================================================

// 로그인한 사용자 정보
let currentUser = null;

// 캐시된 프로필 목록 { uid: displayName }
let currentProfiles = {};

// 관리자 계정의 SHA-256 단방향 해시 (원문 역추적 및 복호화 절대 불가)
const ADMIN_EMAIL_HASHES = [
  "8156cfad701c0f7efd9f477b4be3c208240f6e994a6df5183a6618859ffdb3d7",
];

// 관리자 여부 캐시
let isCurrentUserAdmin = false;

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

/**
 * 텍스트를 SHA-256 16진수 문자열로 변환합니다.
 */
async function computeSha256(text) {
  if (!text || typeof crypto === "undefined" || !crypto.subtle) return "";
  const encoder = new TextEncoder();
  const data = encoder.encode(text.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * 사용자의 관리자 권한 여부를 비동기로 검증하고 캐시합니다.
 */
export async function checkAdminStatus(user) {
  if (!user || !user.email) {
    isCurrentUserAdmin = false;
    return false;
  }
  const emailHash = await computeSha256(user.email);
  isCurrentUserAdmin = ADMIN_EMAIL_HASHES.includes(emailHash);
  return isCurrentUserAdmin;
}

export function isAdmin(user) {
  if (!user) return false;
  return isCurrentUserAdmin;
}




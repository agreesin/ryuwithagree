// =========================================================
// state.js - 전역 공유 상태 관리 모듈
// 사용자 정보 및 프로필 캐시, 관리자 권한 검사를 담당합니다.
// =========================================================

import { escapeHtml, sanitizeImageUrl } from "./ui.js";

// 프로필 컬렉션 내부에 공존하는 시스템 메타 문서 ID 목록 (실제 사용자에서 제외)
export const RESERVED_PROFILE_IDS = new Set(["app_meta_dday"]);

/**
 * 실제 사용자 프로필 문서 ID인지 판별합니다.
 * @param {string|null|undefined} uid
 * @returns {boolean}
 */
export function isUserProfileId(uid) {
  return Boolean(uid && !RESERVED_PROFILE_IDS.has(uid));
}

// 로그인한 사용자 정보
let currentUser = null;

// 캐시된 프로필 목록 { uid: displayName }
let currentProfiles = {};

// 캐시된 프로필 사진 목록 { uid: photoURL }
let currentProfilePhotos = {};

// 관리자 계정의 SHA-256 단방향 해시
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
  const filtered = {};
  if (profiles && typeof profiles === "object") {
    for (const [uid, name] of Object.entries(profiles)) {
      if (isUserProfileId(uid)) {
        filtered[uid] = name;
      }
    }
  }
  currentProfiles = filtered;
}

export function getCurrentProfilePhotos() {
  return currentProfilePhotos;
}

export function setCurrentProfilePhotos(photos) {
  const filtered = {};
  if (photos && typeof photos === "object") {
    for (const [uid, url] of Object.entries(photos)) {
      if (isUserProfileId(uid)) {
        filtered[uid] = url;
      }
    }
  }
  currentProfilePhotos = filtered;
}

export function getProfilePhoto(uid) {
  if (!isUserProfileId(uid)) return null;
  return currentProfilePhotos[uid] || null;
}

/**
 * 이름의 첫 글자(이니셜)를 추출합니다.
 */
export function getUserInitial(name) {
  if (!name || typeof name !== "string") return "?";
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0) : "?";
}

/**
 * 프로필 아바타의 내부 HTML 문자열을 안전하게 이스케이프하여 반환합니다.
 * @param {string|null} uid
 * @param {string} [name="?"]
 * @returns {string}
 */
export function getAvatarHtml(uid, name = "?") {
  const safePhoto = sanitizeImageUrl(getProfilePhoto(uid));
  const safeName = escapeHtml(name);
  if (safePhoto) {
    return `<img src="${escapeHtml(safePhoto)}" alt="${safeName} 프로필" loading="lazy" decoding="async" />`;
  }
  return `<span>${escapeHtml(getUserInitial(name))}</span>`;
}

/**
 * 프로필 아바타를 대상 컨테이너 요소 내부에 렌더링합니다.
 * @param {HTMLElement} container
 * @param {string|null} uid
 * @param {string} [name="?"]
 */
export function renderAvatar(container, uid, name = "?") {
  if (!container) return;
  container.innerHTML = getAvatarHtml(uid, name);
}

/**
 * 프로필 아바타 span 엘리먼트를 생성하여 반환합니다.
 * @param {string|null} uid
 * @param {string} [name="?"]
 * @param {string} [className=""]
 * @returns {HTMLSpanElement}
 */
export function createAvatarElement(uid, name = "?", className = "") {
  const span = document.createElement("span");
  if (className) span.className = className;
  renderAvatar(span, uid, name);
  return span;
}

/**
 * UID를 기반으로 캐시된 최신 닉네임을 반환합니다.
 * @param {string|null} uid
 * @param {string} [fallback="이름 없음"]
 * @returns {string}
 */
export function getUserDisplayName(uid, fallback = "이름 없음") {
  if (isUserProfileId(uid) && currentProfiles && currentProfiles[uid]) {
    return currentProfiles[uid];
  }
  return fallback;
}

/**
 * 상대방의 UID와 닉네임을 구합니다. (시스템 메타 문서 제외)
 */
export function getPartnerInfo() {
  if (!currentUser || !currentProfiles) return { uid: null, name: "상대방" };

  const partnerUid = Object.keys(currentProfiles).find(
    (uid) => isUserProfileId(uid) && uid !== currentUser.uid
  );
  const partnerName = getUserDisplayName(partnerUid, "상대방");

  return { uid: partnerUid || null, name: partnerName };
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

/**
 * 주어진 일기 또는 댓글 객체가 현재 로그인한 사용자가 작성한 것인지 확인합니다.
 * @param {Object|null} item - entry 또는 comment 객체 (uid, authorUid, author 필드 참조)
 * @returns {boolean}
 */
export function isMyContent(item) {
  if (!currentUser || !item) return false;
  const itemUid = item.uid || item.authorUid;
  if (itemUid && itemUid === currentUser.uid) return true;
  if (item.author && currentUser.displayName && item.author === currentUser.displayName) return true;
  return false;
}

// =========================================================
// profile.js - 사용자 프로필(닉네임 및 프로필 사진) 통합 관리 모듈
// 상단 원-터치 프로필 버튼 및 통합 설정 모달을 담당합니다.
// =========================================================

import { setUserDisplayName, setUserProfilePhoto } from "./store.js";
import {
  getCurrentUser,
  getCurrentProfiles,
  getProfilePhoto,
  getUserInitial,
  isAdmin,
  isUserProfileId,
} from "./state.js";
import { showError, openModal, closeModal, escapeHtml, sanitizeImageUrl } from "./ui.js";
import { render } from "./render.js";
import { showToastNotification } from "./notify.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

// DOM 화면 요소
const whoAmI = document.getElementById("who-am-i");
const whoAmIAvatar = document.getElementById("who-am-i-avatar");
const whoAmIProfileBtn = document.getElementById("who-am-i-profile-btn");

// 통합 프로필 설정 모달 요소
const profilePhotoModal = document.getElementById("profile-photo-modal");
const profilePhotoCloseBtn = document.getElementById("profile-photo-close-btn");
const profileTargetTabs = document.getElementById("profile-target-tabs");
const profileTabSelf = document.getElementById("profile-tab-self");
const profileTabPartner = document.getElementById("profile-tab-partner");
const profilePhotoTargetWrap = document.getElementById("profile-photo-target-wrap");
const profilePhotoTargetSelect = document.getElementById("profile-photo-target-select");
const profilePhotoPreviewWrap = document.getElementById("profile-photo-preview-wrap");
const profilePhotoPreviewImg = document.getElementById("profile-photo-preview-img");
const profilePhotoPreviewFallback = document.getElementById("profile-photo-preview-fallback");
const profilePhotoUserDesc = document.getElementById("profile-photo-user-desc");
const profileNameInput = document.getElementById("profile-name-input");
const profilePhotoFileInput = document.getElementById("profile-photo-file-input");
const profilePhotoUploadBtn = document.getElementById("profile-photo-upload-btn");
const profilePhotoGoogleBtn = document.getElementById("profile-photo-google-btn");
const profilePhotoDeleteBtn = document.getElementById("profile-photo-delete-btn");
const profilePhotoCancelBtn = document.getElementById("profile-photo-cancel-btn");
const profilePhotoSaveBtn = document.getElementById("profile-photo-save-btn");
const profileEmojiBtns = document.querySelectorAll(".profile-emoji-btn");

let currentModalTargetUid = null;
let pendingPhotoData = null;
let originalName = "";
let originalPhotoData = null;

function getOtherUserUids(currentUser) {
  const currentProfiles = getCurrentProfiles();
  return Object.keys(currentProfiles).filter(
    (uid) => isUserProfileId(uid) && uid !== currentUser.uid
  );
}

/**
 * 상단 헤더의 내 프로필 아바타를 갱신합니다.
 */
export function updateHeaderAvatar() {
  if (!whoAmIAvatar) return;

  const currentUser = getCurrentUser();
  if (!currentUser) {
    whoAmIAvatar.textContent = "👤";
    return;
  }

  const safePhoto = sanitizeImageUrl(getProfilePhoto(currentUser.uid));
  const profiles = getCurrentProfiles();
  const displayName = profiles[currentUser.uid] || currentUser.displayName || "이름 없음";

  if (safePhoto) {
    whoAmIAvatar.innerHTML = `<img src="${escapeHtml(safePhoto)}" alt="내 프로필 사진" />`;
  } else {
    whoAmIAvatar.textContent = getUserInitial(displayName);
  }
}

export function updateProfileButtonsVisibility() {
  updateHeaderAvatar();
}

function compressProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      reject(new Error("이미지 파일만 선택할 수 있습니다."));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const TARGET_SIZE = 160;
        const canvas = document.createElement("canvas");
        canvas.width = TARGET_SIZE;
        canvas.height = TARGET_SIZE;
        const ctx = canvas.getContext("2d");

        const minSide = Math.min(img.width, img.height);
        const startX = (img.width - minSide) / 2;
        const startY = (img.height - minSide) / 2;

        ctx.drawImage(
          img,
          startX,
          startY,
          minSide,
          minSide,
          0,
          0,
          TARGET_SIZE,
          TARGET_SIZE
        );

        let dataUrl = canvas.toDataURL("image/webp", 0.8);
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        }

        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("이미지를 읽는 중 오류가 발생했습니다."));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("파일을 읽을 수 없습니다."));
    reader.readAsDataURL(file);
  });
}

/**
 * 이모지를 1:1 정방형 벡터 SVG Data URL로 변환합니다.
 * (#fff0f3 원문을 encodeURIComponent에 전달해 이중 인코딩 버그 방지)
 */
function createEmojiAvatarDataUrl(emoji) {
  const safeEmoji = escapeHtml(emoji);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="#fff0f3"/><text x="50" y="68" font-size="54" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, sans-serif">${safeEmoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function updateModalPreview() {
  if (!currentModalTargetUid) return;

  const currentProfiles = getCurrentProfiles();
  const targetName =
    (profileNameInput && profileNameInput.value.trim()) ||
    currentProfiles[currentModalTargetUid] ||
    "참여자";

  if (profilePhotoUserDesc) {
    const isSelf = currentModalTargetUid === getCurrentUser()?.uid;
    profilePhotoUserDesc.textContent = isSelf
      ? `내 프로필 (${targetName})`
      : `${targetName}님의 프로필`;
  }

  const safePhoto = sanitizeImageUrl(pendingPhotoData);
  if (safePhoto) {
    if (profilePhotoPreviewImg) {
      profilePhotoPreviewImg.src = safePhoto;
      profilePhotoPreviewImg.hidden = false;
    }
    if (profilePhotoPreviewFallback) {
      profilePhotoPreviewFallback.hidden = true;
    }
  } else {
    if (profilePhotoPreviewImg) {
      profilePhotoPreviewImg.hidden = true;
      profilePhotoPreviewImg.src = "";
    }
    if (profilePhotoPreviewFallback) {
      profilePhotoPreviewFallback.hidden = false;
      profilePhotoPreviewFallback.textContent = getUserInitial(targetName);
    }
  }
}

function switchTargetUser(targetUid) {
  const currentUser = getCurrentUser();
  if (!currentUser || !isUserProfileId(targetUid)) return;

  currentModalTargetUid = targetUid;
  const currentProfiles = getCurrentProfiles();

  originalName =
    currentProfiles[targetUid] ||
    (targetUid === currentUser.uid ? currentUser.displayName : "") ||
    "";
  originalPhotoData = getProfilePhoto(targetUid);
  pendingPhotoData = originalPhotoData;

  if (profileNameInput) {
    profileNameInput.value = originalName;
  }

  const isSelf = targetUid === currentUser.uid;
  if (profileTabSelf) profileTabSelf.classList.toggle("active", isSelf);
  if (profileTabPartner) profileTabPartner.classList.toggle("active", !isSelf);

  if (profilePhotoTargetWrap) {
    const otherUids = getOtherUserUids(currentUser);
    profilePhotoTargetWrap.hidden = isSelf || otherUids.length <= 1;
  }

  if (profilePhotoGoogleBtn) {
    profilePhotoGoogleBtn.hidden = !isSelf || !currentUser.photoURL;
  }

  updateModalPreview();
}

export function openProfileModal(defaultTargetUid = null) {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    showToastNotification("로그인이 필요합니다.", "🔒");
    return;
  }

  const adminUser = isAdmin(currentUser);
  const currentProfiles = getCurrentProfiles();
  const otherUids = getOtherUserUids(currentUser);

  if (profileTargetTabs) {
    profileTargetTabs.hidden = !adminUser || otherUids.length === 0;
  }

  if (profilePhotoTargetSelect) {
    profilePhotoTargetSelect.innerHTML = "";
    if (adminUser && otherUids.length > 1) {
      otherUids.forEach((uid) => {
        const opt = document.createElement("option");
        opt.value = uid;
        opt.textContent = `👥 ${currentProfiles[uid] || "상대방"}`;
        profilePhotoTargetSelect.appendChild(opt);
      });
    }
  }

  const initialTarget = defaultTargetUid || currentUser.uid;
  switchTargetUser(initialTarget);

  openModal(profilePhotoModal);
}

export function initProfileHandlers() {
  if (whoAmIProfileBtn) {
    whoAmIProfileBtn.addEventListener("click", () => {
      openProfileModal();
    });
  }

  if (profileTabSelf) {
    profileTabSelf.addEventListener("click", () => {
      const currentUser = getCurrentUser();
      if (currentUser) {
        switchTargetUser(currentUser.uid);
      }
    });
  }

  if (profileTabPartner) {
    profileTabPartner.addEventListener("click", () => {
      const currentUser = getCurrentUser();
      if (!currentUser) return;

      const otherUids = getOtherUserUids(currentUser);
      if (otherUids.length === 0) {
        showToastNotification("아직 등록된 다른 참여자가 없습니다.", "👥");
        return;
      }

      if (profilePhotoTargetSelect && otherUids.length > 1) {
        profilePhotoTargetSelect.value = otherUids[0];
      }

      switchTargetUser(otherUids[0]);
    });
  }

  if (profilePhotoTargetSelect) {
    profilePhotoTargetSelect.addEventListener("change", (e) => {
      switchTargetUser(e.target.value);
    });
  }

  if (profileNameInput) {
    profileNameInput.addEventListener("input", () => {
      updateModalPreview();
    });
  }

  const triggerPhotoUpload = () => {
    if (profilePhotoFileInput) {
      profilePhotoFileInput.value = "";
      profilePhotoFileInput.click();
    }
  };

  if (profilePhotoPreviewWrap) {
    profilePhotoPreviewWrap.addEventListener("click", triggerPhotoUpload);
  }

  if (profilePhotoUploadBtn) {
    profilePhotoUploadBtn.addEventListener("click", triggerPhotoUpload);
  }

  if (profilePhotoFileInput) {
    profilePhotoFileInput.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      try {
        const compressedData = await compressProfilePhoto(file);
        pendingPhotoData = compressedData;
        updateModalPreview();
      } catch (err) {
        console.error(err);
        showError("사진 처리 실패: " + err.message);
      }
    });
  }

  if (profilePhotoGoogleBtn) {
    profilePhotoGoogleBtn.addEventListener("click", () => {
      const currentUser = getCurrentUser();
      if (currentUser && currentUser.photoURL) {
        pendingPhotoData = currentUser.photoURL;
        updateModalPreview();
      }
    });
  }

  profileEmojiBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const emoji = btn.dataset.emoji;
      if (emoji) {
        pendingPhotoData = createEmojiAvatarDataUrl(emoji);
        updateModalPreview();
      }
    });
  });

  if (profilePhotoDeleteBtn) {
    profilePhotoDeleteBtn.addEventListener("click", () => {
      pendingPhotoData = null;
      updateModalPreview();
    });
  }

  if (profilePhotoCloseBtn) {
    profilePhotoCloseBtn.addEventListener("click", () => {
      closeModal(profilePhotoModal);
    });
  }

  if (profilePhotoCancelBtn) {
    profilePhotoCancelBtn.addEventListener("click", () => {
      closeModal(profilePhotoModal);
    });
  }

  if (profilePhotoSaveBtn) {
    profilePhotoSaveBtn.addEventListener("click", async () => {
      if (!currentModalTargetUid) return;

      const newName = profileNameInput ? profileNameInput.value.trim() : "";
      if (!newName) {
        showToastNotification("이름은 빈 칸으로 둘 수 없습니다.", "✏️");
        if (profileNameInput) profileNameInput.focus();
        return;
      }

      const currentUser = getCurrentUser();
      const isSelf = currentModalTargetUid === currentUser?.uid;

      try {
        profilePhotoSaveBtn.disabled = true;
        profilePhotoSaveBtn.textContent = "저장 중...";

        if (newName !== originalName) {
          await setUserDisplayName(currentModalTargetUid, newName);
          if (isSelf && currentUser) {
            try {
              await updateProfile(currentUser, { displayName: newName });
            } catch {
              // Auth 프로필 동기화 실패 시 Firestore 값 유지
            }
            if (whoAmI) whoAmI.textContent = newName;
          }
        }

        if (pendingPhotoData !== originalPhotoData) {
          await setUserProfilePhoto(currentModalTargetUid, pendingPhotoData);
        }

        updateHeaderAvatar();
        render();
        closeModal(profilePhotoModal);

        showToastNotification("프로필이 저장되었습니다! ✨", "👤");
      } catch (err) {
        console.error(err);
        showError("프로필 저장 실패: " + err.message);
      } finally {
        profilePhotoSaveBtn.disabled = false;
        profilePhotoSaveBtn.textContent = "저장 완료";
      }
    });
  }
}

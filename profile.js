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
} from "./state.js";
import { showError, openModal, closeModal } from "./ui.js";
import { render } from "./render.js";
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

// 모달 내부 상태
let currentModalTargetUid = null;
let pendingPhotoData = null; // 저장 대기 중인 사진 데이터 (Data URL, URL, 또는 null)
let originalName = "";
let originalPhotoData = null;

/**
 * 상단 헤더의 내 프로필 아바타를 갱신합니다.
 */
export function updateHeaderAvatar() {
  if (!whoAmIAvatar) return;

  const currentUser = getCurrentUser();
  if (!currentUser) {
    whoAmIAvatar.innerHTML = "👤";
    return;
  }

  const photo = getProfilePhoto(currentUser.uid);
  const profiles = getCurrentProfiles();
  const displayName = profiles[currentUser.uid] || currentUser.displayName || "이름 없음";

  if (photo) {
    whoAmIAvatar.innerHTML = `<img src="${photo}" alt="내 프로필 사진" />`;
  } else {
    const initial = getUserInitial(displayName);
    whoAmIAvatar.textContent = initial;
  }
}

/**
 * 사용자 권한 및 로그인 상태에 따라 프로필 UI를 갱신합니다.
 */
export function updateProfileButtonsVisibility(user) {
  updateHeaderAvatar();
}

/**
 * 이미지를 1:1 정방형 160x160 픽셀로 중앙 크롭 및 고압축(WebP/JPEG 0.8)합니다.
 * @param {File} file
 * @returns {Promise<string>} Data URL
 */
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

        // 1:1 정방형 중앙 크롭 (Center crop)
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

        const compSizeKb = Math.round((dataUrl.length * 0.75) / 1024);
        console.log(`[ProfilePhoto] 프로필 사진 압축 완료: ${compSizeKb}KB (160x160)`);

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
 */
function createEmojiAvatarDataUrl(emoji) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="%23fff0f3"/><text x="50" y="68" font-size="54" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, sans-serif">${emoji}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * 모달 내부의 아바타 미리보기를 갱신합니다.
 */
function updateModalPreview() {
  if (!currentModalTargetUid) return;

  const currentProfiles = getCurrentProfiles();
  const targetName = (profileNameInput && profileNameInput.value.trim()) || currentProfiles[currentModalTargetUid] || "참여자";

  if (profilePhotoUserDesc) {
    const isSelf = currentModalTargetUid === getCurrentUser()?.uid;
    profilePhotoUserDesc.textContent = isSelf ? `내 프로필 (${targetName})` : `${targetName}님의 프로필`;
  }

  if (pendingPhotoData) {
    if (profilePhotoPreviewImg) {
      profilePhotoPreviewImg.src = pendingPhotoData;
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

/**
 * 모달의 대상을 변경하고 폼을 해당 사용자의 데이터로 채웁니다.
 * @param {string} targetUid
 */
function switchTargetUser(targetUid) {
  const currentUser = getCurrentUser();
  if (!currentUser || !targetUid) return;

  currentModalTargetUid = targetUid;
  const currentProfiles = getCurrentProfiles();

  originalName = currentProfiles[targetUid] || (targetUid === currentUser.uid ? currentUser.displayName : "") || "";
  originalPhotoData = getProfilePhoto(targetUid);
  pendingPhotoData = originalPhotoData;

  if (profileNameInput) {
    profileNameInput.value = originalName;
  }

  // 탭 active 스타일 동기화
  const isSelf = targetUid === currentUser.uid;
  if (profileTabSelf) profileTabSelf.classList.toggle("active", isSelf);
  if (profileTabPartner) profileTabPartner.classList.toggle("active", !isSelf);

  // 구글 사진 연동 버튼: 본인 대상 + 구글 photoURL 존재 시만 노출
  if (profilePhotoGoogleBtn) {
    profilePhotoGoogleBtn.hidden = !isSelf || !currentUser.photoURL;
  }

  updateModalPreview();
}

/**
 * 통합 프로필 설정 모달을 엽니다.
 * @param {string|null} defaultTargetUid
 */
export function openProfileModal(defaultTargetUid = null) {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    alert("로그인이 필요합니다.");
    return;
  }

  const adminUser = isAdmin(currentUser);
  const currentProfiles = getCurrentProfiles();
  const otherUids = Object.keys(currentProfiles).filter((uid) => uid !== currentUser.uid);

  // 관리자 권한 시 탭 노출 (상대방이 1명 이상 있을 때)
  if (profileTargetTabs) {
    profileTargetTabs.hidden = !adminUser || otherUids.length === 0;
  }

  // 드롭다운 셀렉트 박스 세팅 (상대방이 2명 이상일 때)
  if (profilePhotoTargetSelect && profilePhotoTargetWrap) {
    if (adminUser && otherUids.length > 1) {
      profilePhotoTargetWrap.hidden = false;
      profilePhotoTargetSelect.innerHTML = "";
      otherUids.forEach((uid) => {
        const opt = document.createElement("option");
        opt.value = uid;
        opt.textContent = `👥 ${currentProfiles[uid] || "상대방"}`;
        profilePhotoTargetSelect.appendChild(opt);
      });
    } else {
      profilePhotoTargetWrap.hidden = true;
    }
  }

  // 기본 타겟 설정 (인자가 없으면 본인)
  const initialTarget = defaultTargetUid || currentUser.uid;
  switchTargetUser(initialTarget);

  openModal(profilePhotoModal);
}

/**
 * 프로필 관리 이벤트 리스너를 초기화합니다.
 */
export function initProfileHandlers() {
  // ---------------------------------------------------------
  // 1. 상단 내 정보 영역 터치 시 통합 모달 오픈
  // ---------------------------------------------------------
  if (whoAmIProfileBtn) {
    whoAmIProfileBtn.addEventListener("click", () => {
      openProfileModal();
    });
  }

  // ---------------------------------------------------------
  // 2. 관리자용 대상 전환 탭
  // ---------------------------------------------------------
  if (profileTabSelf) {
    profileTabSelf.addEventListener("click", () => {
      const currentUser = getCurrentUser();
      if (currentUser) {
        if (profilePhotoTargetWrap) profilePhotoTargetWrap.hidden = true;
        switchTargetUser(currentUser.uid);
      }
    });
  }

  if (profileTabPartner) {
    profileTabPartner.addEventListener("click", () => {
      const currentUser = getCurrentUser();
      if (!currentUser) return;

      const currentProfiles = getCurrentProfiles();
      const otherUids = Object.keys(currentProfiles).filter((uid) => uid !== currentUser.uid);

      if (otherUids.length === 0) {
        alert("아직 등록된 다른 참여자가 없습니다.");
        return;
      }

      if (otherUids.length > 1 && profilePhotoTargetWrap) {
        profilePhotoTargetWrap.hidden = false;
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

  // 이름 실시간 입력 시 미리보기 폴백(이니셜) 갱신
  if (profileNameInput) {
    profileNameInput.addEventListener("input", () => {
      updateModalPreview();
    });
  }

  // ---------------------------------------------------------
  // 3. 사진 변경 옵션 핸들러
  // ---------------------------------------------------------
  // 원형 미리보기 박스 또는 사진 선택 버튼 클릭
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

  // 구글 계정 사진 적용
  if (profilePhotoGoogleBtn) {
    profilePhotoGoogleBtn.addEventListener("click", () => {
      const currentUser = getCurrentUser();
      if (currentUser && currentUser.photoURL) {
        pendingPhotoData = currentUser.photoURL;
        updateModalPreview();
      }
    });
  }

  // 감성 이모지 프리셋
  profileEmojiBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const emoji = btn.dataset.emoji;
      if (emoji) {
        pendingPhotoData = createEmojiAvatarDataUrl(emoji);
        updateModalPreview();
      }
    });
  });

  // 사진 삭제
  if (profilePhotoDeleteBtn) {
    profilePhotoDeleteBtn.addEventListener("click", () => {
      pendingPhotoData = null;
      updateModalPreview();
    });
  }

  // ---------------------------------------------------------
  // 4. 모달 닫기 및 취소
  // ---------------------------------------------------------
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

  // ---------------------------------------------------------
  // 5. 저장 완료 버튼 (이름 + 사진 동시 저장)
  // ---------------------------------------------------------
  if (profilePhotoSaveBtn) {
    profilePhotoSaveBtn.addEventListener("click", async () => {
      if (!currentModalTargetUid) return;

      const newName = profileNameInput ? profileNameInput.value.trim() : "";
      if (!newName) {
        alert("이름은 빈 칸으로 둘 수 없습니다.");
        if (profileNameInput) profileNameInput.focus();
        return;
      }

      const currentUser = getCurrentUser();
      const isSelf = currentModalTargetUid === currentUser?.uid;

      try {
        profilePhotoSaveBtn.disabled = true;
        profilePhotoSaveBtn.textContent = "저장 중...";

        // 1) 이름 변경 처리
        if (newName !== originalName) {
          await setUserDisplayName(currentModalTargetUid, newName);
          if (isSelf && currentUser) {
            try {
              await updateProfile(currentUser, { displayName: newName });
            } catch (e) {}
            if (whoAmI) whoAmI.textContent = newName;
          }
        }

        // 2) 프로필 사진 변경 처리
        if (pendingPhotoData !== originalPhotoData) {
          await setUserProfilePhoto(currentModalTargetUid, pendingPhotoData);
        }

        updateHeaderAvatar();
        render(); // 타임라인 즉각 갱신
        closeModal(profilePhotoModal);

        alert(`프로필이 성공적으로 저장되었습니다!`);
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




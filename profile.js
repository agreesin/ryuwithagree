// =========================================================
// profile.js - 사용자 프로필(닉네임 및 프로필 사진) 관리 모듈
// 내 사진/이름 변경 및 관리자 전용 상대방 사진/이름 변경 기능을 담당합니다.
// =========================================================

import { setUserDisplayName, setUserProfilePhoto } from "./store.js";
import {
  getCurrentUser,
  getCurrentProfiles,
  getCurrentProfilePhotos,
  getProfilePhoto,
  getUserInitial,
  isAdmin,
} from "./state.js";
import { showError, openModal, closeModal } from "./ui.js";
import { render } from "./render.js";
import { updateProfile } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

// DOM 화면 요소
const changeNameButton = document.getElementById("change-name-button");
const changePhotoButton = document.getElementById("change-photo-button");
const manageUsersButton = document.getElementById("manage-users-button");
const manageUserPhotoButton = document.getElementById("manage-user-photo-button");
const whoAmI = document.getElementById("who-am-i");
const whoAmIAvatar = document.getElementById("who-am-i-avatar");
const whoAmIAvatarBtn = document.getElementById("who-am-i-avatar-btn");

// 프로필 사진 설정 모달 요소
const profilePhotoModal = document.getElementById("profile-photo-modal");
const profilePhotoCloseBtn = document.getElementById("profile-photo-close-btn");
const profilePhotoTargetWrap = document.getElementById("profile-photo-target-wrap");
const profilePhotoTargetSelect = document.getElementById("profile-photo-target-select");
const profilePhotoPreviewImg = document.getElementById("profile-photo-preview-img");
const profilePhotoPreviewFallback = document.getElementById("profile-photo-preview-fallback");
const profilePhotoUserDesc = document.getElementById("profile-photo-user-desc");
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

/**
 * 상단 헤더의 내 프로필 아바타를 갱신합니다.
 */
export function updateHeaderAvatar() {
  if (!whoAmIAvatar) return;

  const currentUser = getCurrentUser();
  if (!currentUser) {
    whoAmIAvatar.innerHTML = "?";
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
 * 관리자 권한에 따라 프로필 변경 버튼들의 표시 여부를 갱신합니다.
 */
export function updateProfileButtonsVisibility(user) {
  const adminUser = isAdmin(user);
  if (changeNameButton) changeNameButton.hidden = !adminUser;
  if (manageUsersButton) manageUsersButton.hidden = !adminUser;
  if (manageUserPhotoButton) manageUserPhotoButton.hidden = !adminUser;
  if (changePhotoButton) changePhotoButton.hidden = false;
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
  const targetName = currentProfiles[currentModalTargetUid] || "참여자";

  if (profilePhotoUserDesc) {
    profilePhotoUserDesc.textContent = `${targetName}님의 프로필 사진`;
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
 * 프로필 사진 설정 모달을 엽니다.
 * @param {string|null} defaultTargetUid - 대상 사용자 UID (기본값: 현재 로그인 사용자)
 */
export function openProfilePhotoModal(defaultTargetUid = null) {
  const currentUser = getCurrentUser();
  if (!currentUser) {
    alert("로그인이 필요합니다.");
    return;
  }

  const adminUser = isAdmin(currentUser);
  const currentProfiles = getCurrentProfiles();

  // 대상 UID 결정
  currentModalTargetUid = defaultTargetUid || currentUser.uid;
  pendingPhotoData = getProfilePhoto(currentModalTargetUid);

  // 대상 선택 셀렉트 박스 세팅
  if (profilePhotoTargetSelect && profilePhotoTargetWrap) {
    if (adminUser) {
      profilePhotoTargetWrap.hidden = false;
      profilePhotoTargetSelect.innerHTML = "";

      // 본인 추가
      const myName = currentProfiles[currentUser.uid] || currentUser.displayName || "나";
      const myOpt = document.createElement("option");
      myOpt.value = currentUser.uid;
      myOpt.textContent = `🙋 ${myName} (내 프로필)`;
      profilePhotoTargetSelect.appendChild(myOpt);

      // 상대방 목록 추가
      Object.keys(currentProfiles)
        .filter((uid) => uid !== currentUser.uid)
        .forEach((uid) => {
          const otherName = currentProfiles[uid] || "상대방";
          const opt = document.createElement("option");
          opt.value = uid;
          opt.textContent = `👥 ${otherName} (상대방)`;
          profilePhotoTargetSelect.appendChild(opt);
        });

      profilePhotoTargetSelect.value = currentModalTargetUid;
    } else {
      profilePhotoTargetWrap.hidden = true;
    }
  }

  // 구글 계정 사진 연동 버튼 표시 제어
  if (profilePhotoGoogleBtn) {
    const isMyself = currentModalTargetUid === currentUser.uid;
    profilePhotoGoogleBtn.hidden = !isMyself || !currentUser.photoURL;
  }

  updateModalPreview();
  openModal(profilePhotoModal);
}

/**
 * 프로필 관리 이벤트 리스너를 초기화합니다.
 */
export function initProfileHandlers() {
  // ---------------------------------------------------------
  // 1. 헤더 아바타 및 내 사진 변경 버튼
  // ---------------------------------------------------------
  if (whoAmIAvatarBtn) {
    whoAmIAvatarBtn.addEventListener("click", () => {
      openProfilePhotoModal();
    });
  }

  if (changePhotoButton) {
    changePhotoButton.addEventListener("click", () => {
      openProfilePhotoModal();
    });
  }

  // ---------------------------------------------------------
  // 2. 👥 친구 사진 변경 버튼 (관리자 전용)
  // ---------------------------------------------------------
  if (manageUserPhotoButton) {
    manageUserPhotoButton.addEventListener("click", () => {
      const currentUser = getCurrentUser();
      if (!currentUser || !isAdmin(currentUser)) {
        alert("상대방 프로필 사진 변경 권한이 없습니다. (관리자 전용 기능)");
        return;
      }

      const currentProfiles = getCurrentProfiles();
      const otherUids = Object.keys(currentProfiles).filter((uid) => uid !== currentUser.uid);

      if (otherUids.length === 0) {
        alert("아직 등록된 다른 참여자가 없습니다.");
        return;
      }

      // 첫 번째 상대방을 기본 선택하여 모달 오픈
      openProfilePhotoModal(otherUids[0]);
    });
  }

  // ---------------------------------------------------------
  // 3. 모달 내부 이벤트 핸들러
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

  // 대상 셀렉트 변경 시
  if (profilePhotoTargetSelect) {
    profilePhotoTargetSelect.addEventListener("change", (e) => {
      currentModalTargetUid = e.target.value;
      pendingPhotoData = getProfilePhoto(currentModalTargetUid);

      const currentUser = getCurrentUser();
      if (profilePhotoGoogleBtn && currentUser) {
        const isMyself = currentModalTargetUid === currentUser.uid;
        profilePhotoGoogleBtn.hidden = !isMyself || !currentUser.photoURL;
      }

      updateModalPreview();
    });
  }

  // 앨범에서 사진 선택 버튼 클릭
  if (profilePhotoUploadBtn && profilePhotoFileInput) {
    profilePhotoUploadBtn.addEventListener("click", () => {
      profilePhotoFileInput.value = "";
      profilePhotoFileInput.click();
    });

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

  // 구글 계정 사진 적용 버튼
  if (profilePhotoGoogleBtn) {
    profilePhotoGoogleBtn.addEventListener("click", () => {
      const currentUser = getCurrentUser();
      if (currentUser && currentUser.photoURL) {
        pendingPhotoData = currentUser.photoURL;
        updateModalPreview();
      }
    });
  }

  // 감성 이모지 프리셋 버튼들
  profileEmojiBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const emoji = btn.dataset.emoji;
      if (emoji) {
        pendingPhotoData = createEmojiAvatarDataUrl(emoji);
        updateModalPreview();
      }
    });
  });

  // 사진 삭제 버튼 (이니셜 배지로 복원)
  if (profilePhotoDeleteBtn) {
    profilePhotoDeleteBtn.addEventListener("click", () => {
      pendingPhotoData = null;
      updateModalPreview();
    });
  }

  // 저장 완료 버튼
  if (profilePhotoSaveBtn) {
    profilePhotoSaveBtn.addEventListener("click", async () => {
      if (!currentModalTargetUid) return;

      const currentProfiles = getCurrentProfiles();
      const targetName = currentProfiles[currentModalTargetUid] || "참여자";

      try {
        profilePhotoSaveBtn.disabled = true;
        profilePhotoSaveBtn.textContent = "저장 중...";

        await setUserProfilePhoto(currentModalTargetUid, pendingPhotoData);

        updateHeaderAvatar();
        render(); // 타임라인 피드 즉시 갱신
        closeModal(profilePhotoModal);

        alert(`${targetName}님의 프로필 사진이 성공적으로 저장되었습니다!`);
      } catch (err) {
        console.error(err);
        showError("프로필 사진 저장 실패: " + err.message);
      } finally {
        profilePhotoSaveBtn.disabled = false;
        profilePhotoSaveBtn.textContent = "저장 완료";
      }
    });
  }

  // ---------------------------------------------------------
  // 4. 내 이름 변경 버튼 (기존 기능 유지)
  // ---------------------------------------------------------
  if (changeNameButton) {
    changeNameButton.addEventListener("click", async () => {
      const currentUser = getCurrentUser();
      if (!currentUser || !isAdmin(currentUser)) {
        alert("이름 변경 권한이 없습니다. (관리자 전용 기능)");
        return;
      }

      const currentProfiles = getCurrentProfiles();
      const currentName = currentProfiles[currentUser.uid] || currentUser.displayName || "";
      const newName = prompt("변경할 내 닉네임(이름)을 입력하세요:", currentName);

      if (newName === null) return;
      const trimmed = newName.trim();
      if (trimmed === "") {
        alert("이름은 빈 칸으로 둘 수 없습니다.");
        return;
      }

      try {
        await setUserDisplayName(currentUser.uid, trimmed);
        try {
          await updateProfile(currentUser, { displayName: trimmed });
        } catch (e) {
          // updateProfile 실패 시에도 Firestore 프로필 우선 적용
        }
        if (whoAmI) whoAmI.textContent = trimmed;
        updateHeaderAvatar();
        alert(`내 이름이 '${trimmed}'(으)로 변경되었습니다! 모든 글과 화면에 적용됩니다.`);
      } catch (error) {
        console.error(error);
        showError("이름을 변경하지 못했습니다: " + error.message);
      }
    });
  }

  // ---------------------------------------------------------
  // 5. 👥 친구 이름 변경 버튼 (기존 기능 유지)
  // ---------------------------------------------------------
  if (manageUsersButton) {
    manageUsersButton.addEventListener("click", async () => {
      const currentUser = getCurrentUser();
      if (!currentUser || !isAdmin(currentUser)) {
        alert("상대방 이름 변경 권한이 없습니다. (관리자 전용 기능)");
        return;
      }

      const currentProfiles = getCurrentProfiles();
      const otherUids = Object.keys(currentProfiles).filter((uid) => uid !== currentUser.uid);
      if (otherUids.length === 0) {
        alert("아직 등록된 다른 참여자가 없습니다. 글이나 댓글의 ✏️ 버튼을 눌러 변경할 수도 있습니다.");
        return;
      }

      let menu = "이름을 변경할 대상을 선택하세요:\n";
      otherUids.forEach((uid, idx) => {
        menu += `${idx + 1}. ${currentProfiles[uid]}\n`;
      });

      const choice = prompt(menu + "\n번호를 입력하세요:");
      if (choice === null) return;

      const index = parseInt(choice, 10) - 1;
      if (isNaN(index) || index < 0 || index >= otherUids.length) {
        alert("올바른 번호를 입력해주세요.");
        return;
      }

      const targetUid = otherUids[index];
      const oldName = currentProfiles[targetUid];
      const newName = prompt(`'${oldName}'님의 새 이름을 입력하세요:\n(상대방의 화면과 모든 글에 즉시 적용됩니다)`, oldName);
      if (newName === null) return;

      const trimmed = newName.trim();
      if (!trimmed) {
        alert("이름을 입력해주세요.");
        return;
      }

      try {
        await setUserDisplayName(targetUid, trimmed);
        alert(`'${oldName}'님의 이름이 '${trimmed}'(으)로 성공적으로 변경되었습니다!`);
      } catch (err) {
        console.error(err);
        showError("상대방 이름 변경 실패: " + err.message);
      }
    });
  }
}




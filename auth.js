// =========================================================
// auth.js - 구글 로그인 및 세션/구독 관리 모듈
// 로그인/로그아웃 처리, 화면 전환, 실시간 데이터 구독을 담당합니다.
// =========================================================

import {
  login,
  logout,
  watchLogin,
  subscribeProfiles,
  subscribeEntries,
} from "./store.js";
import {
  setCurrentUser,
  setCurrentProfiles,
  getCurrentUser,
  getCurrentProfiles,
} from "./state.js";
import { showError, hideError } from "./ui.js";
import { updateProfileButtonsVisibility } from "./profile.js";
import { render } from "./render.js";
import { updateNoticeAuth } from "./notice.js";
import {
  checkNewUpdates,
  requestNotificationPermission,
  syncUserWithOneSignal,
} from "./notify.js";

// 화면 요소
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const loginArea = document.getElementById("login-area");
const appArea = document.getElementById("app-area");
const whoAmI = document.getElementById("who-am-i");
const othersList = document.getElementById("others-entry-list");
const myList = document.getElementById("my-entry-list");

// 암호 모달 화면 요소
const passcodeModal = document.getElementById("passcode-modal");
const passcodeForm = document.getElementById("passcode-form");
const passcodeInput = document.getElementById("passcode-input");
const passcodeError = document.getElementById("passcode-error");
const passcodeCancelBtn = document.getElementById("passcode-cancel-btn");

// 암호 인코딩 토큰 (깃허브 소스코드에서 평문 암호 노출 방지)
const PASSCODE_TOKEN = "7Iug7KeE64yA7IKs";

function verifyPasscode(input) {
  try {
    return btoa(unescape(encodeURIComponent(input.trim()))) === PASSCODE_TOKEN;
  } catch {
    return false;
  }
}

// 모듈 스코프 변수 (실시간 구독 해제 손잡이)
let stopWatchingEntries = null;
let stopWatchingProfiles = null;

/**
 * 암호 검증 완료 후 다이어리 진입 및 실시간 데이터 구독을 시작합니다.
 */
function grantAccess(user) {
  if (passcodeModal) passcodeModal.hidden = true;
  if (loginArea) loginArea.hidden = true;
  if (appArea) appArea.hidden = false;
  if (whoAmI) whoAmI.textContent = getCurrentProfiles()[user.uid] || user.displayName || "이름 없음";

  // 관리자 권한에 따른 이름 변경 버튼 표시 갱신
  updateProfileButtonsVisibility(user);
  // 공지사항 편집 권한 갱신 (로그인 사용자에게 편집 버튼 노출)
  updateNoticeAuth(user);

  // 알림 권한 자동 요청 및 OneSignal 기기 연결
  requestNotificationPermission();
  syncUserWithOneSignal(user);

  if (!stopWatchingProfiles) {
    stopWatchingProfiles = subscribeProfiles((profiles) => {
      setCurrentProfiles(profiles);
      const curUser = getCurrentUser();
      if (curUser && whoAmI) {
        whoAmI.textContent = profiles[curUser.uid] || curUser.displayName || "이름 없음";
      }
    });
  }

  if (!stopWatchingEntries) {
    stopWatchingEntries = subscribeEntries((entries) => {
      render(entries);
      checkNewUpdates(entries);
    }, () => {
      showError("목록을 불러오지 못했습니다. 접근 권한을 확인하세요.");
    });
  }
}

/**
 * 암호 입력 팝업 모달을 표시합니다.
 */
function promptPasscode() {
  if (loginArea) loginArea.hidden = true;
  if (appArea) appArea.hidden = true;
  if (passcodeModal) passcodeModal.hidden = false;
  if (passcodeError) {
    passcodeError.hidden = true;
    passcodeError.textContent = "";
  }
  if (passcodeInput) {
    passcodeInput.value = "";
    passcodeInput.classList.remove("shake");
    setTimeout(() => passcodeInput.focus(), 100);
  }
}

/**
 * 로그인/로그아웃 이벤트 리스너를 등록하고 로그인 상태 감시를 시작합니다.
 */
export function initAuth() {
  if (loginButton) {
    loginButton.addEventListener("click", async () => {
      try {
        await login();
      } catch (error) {
        console.error(error);
        showError("로그인하지 못했습니다. 팝업이 차단되지 않았는지 확인하세요.");
      }
    });
  }

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      const curUser = getCurrentUser();
      if (curUser) {
        sessionStorage.removeItem(`diary_passcode_${curUser.uid}`);
      }
      logout();
    });
  }

  // 암호 모달 이벤트 배선
  if (passcodeForm) {
    passcodeForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const entered = passcodeInput.value.trim();
      const curUser = getCurrentUser();

      if (verifyPasscode(entered)) {
        if (curUser) {
          sessionStorage.setItem(`diary_passcode_${curUser.uid}`, "verified");
          grantAccess(curUser);
        }
      } else {
        if (passcodeError) {
          passcodeError.textContent = "암호가 올바르지 않습니다. 너 누구냐?";
          passcodeError.hidden = false;
        }
        if (passcodeInput) {
          passcodeInput.classList.remove("shake");
          void passcodeInput.offsetWidth; // CSS 애니메이션 재시작 트릭
          passcodeInput.classList.add("shake");
          passcodeInput.value = "";
          passcodeInput.focus();
        }
      }
    });
  }

  if (passcodeCancelBtn) {
    passcodeCancelBtn.addEventListener("click", () => {
      const curUser = getCurrentUser();
      if (curUser) {
        sessionStorage.removeItem(`diary_passcode_${curUser.uid}`);
      }
      if (passcodeModal) passcodeModal.hidden = true;
      logout();
    });
  }

  // ---------------------------------------------------------
  // 로그인 상태가 바뀔 때마다 실행됨
  // ---------------------------------------------------------
  watchLogin((user) => {
    setCurrentUser(user);
    if (user) {
      // 로그인됨 -> 2차 암호 검증 확인
      const isVerified = sessionStorage.getItem(`diary_passcode_${user.uid}`) === "verified";
      if (isVerified) {
        grantAccess(user);
      } else {
        promptPasscode();
      }
    } else {
      // 로그아웃됨
      if (passcodeModal) passcodeModal.hidden = true;
      if (stopWatchingEntries) {
        stopWatchingEntries();
        stopWatchingEntries = null;
      }
      if (stopWatchingProfiles) {
        stopWatchingProfiles();
        stopWatchingProfiles = null;
      }
      if (loginArea) loginArea.hidden = false;
      if (appArea) appArea.hidden = true;
      if (othersList) othersList.innerHTML = "";
      if (myList) myList.innerHTML = "";
      updateNoticeAuth(null);
      hideError();
    }
  });
}

// =========================================================
// auth.js - 구글 로그인, 2단계 보안 및 세션/구독 관리 모듈
// 로그인/로그아웃 처리, 화면 전환, SHA-256 단방향 암호 검증 및 실시간 데이터 구독을 담당합니다.
// =========================================================

import {
  loginWithGoogle,
  login,
  logout,
  watchLogin,
  subscribeProfiles,
  subscribeEntries,
  consumeRedirectResult,
} from "./store.js";
import {
  setCurrentUser,
  setCurrentProfiles,
  getCurrentUser,
  getCurrentProfiles,
  checkAdminStatus,
} from "./state.js";
import { showError, hideError } from "./ui.js";
import { updateProfileButtonsVisibility } from "./profile.js";
import { render } from "./render.js";
import { updateNoticeAuth } from "./notice.js";
import {
  checkNewUpdates,
  syncUserFcm,
} from "./notify.js";
import { startDdaySubscription, stopDdaySubscription } from "./dday.js";

// 화면 요소
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const loginArea = document.getElementById("login-area");
const appArea = document.getElementById("app-area");
const whoAmI = document.getElementById("who-am-i");
const othersList = document.getElementById("others-entry-list");
const myList = document.getElementById("my-entry-list");

// 보호 대상 요소들 (로그인 사용자 전용)
const ddayBadgeBtn = document.getElementById("dday-badge-btn");
const ddayModal = document.getElementById("dday-modal");
const appFooter = document.getElementById("app-footer");
const changelogModal = document.getElementById("changelog-modal");

// 암호 모달 화면 요소
const passcodeModal = document.getElementById("passcode-modal");
const passcodeForm = document.getElementById("passcode-form");
const passcodeInput = document.getElementById("passcode-input");
const passcodeError = document.getElementById("passcode-error");
const passcodeCancelBtn = document.getElementById("passcode-cancel-btn");

// 2차 암호 SHA-256 단방향 해시 ('신진대사', 원문 역추적 및 복호화 절대 불가)
const PASSCODE_HASH = "f4b440c146ce37b3aba11158aa3d7157c0f9a2fd4f33de0145d9dd3c0f6f83fc";

/**
 * 사용자가 입력한 암호의 SHA-256 해시를 검증합니다.
 */
async function verifyPasscode(input) {
  try {
    if (!input || typeof crypto === "undefined" || !crypto.subtle) return false;
    const encoder = new TextEncoder();
    const data = encoder.encode(input.trim());
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return hashHex === PASSCODE_HASH;
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
async function grantAccess(user) {
  if (passcodeModal) passcodeModal.hidden = true;
  if (loginArea) loginArea.hidden = true;
  if (appArea) appArea.hidden = false;
  if (whoAmI) whoAmI.textContent = getCurrentProfiles()[user.uid] || user.displayName || "이름 없음";

  // 인증 완료 사용자에게만 기념일 뱃지 및 업데이트 내역 버튼 표시
  if (ddayBadgeBtn) ddayBadgeBtn.hidden = false;
  if (appFooter) appFooter.hidden = false;

  // 각 부가 기능 개별 격리 실행 (오류가 발생해도 메인 화면 표시는 유지)
  try {
    await checkAdminStatus(user);
    updateProfileButtonsVisibility(user);
  } catch (e) {
    console.warn("[auth] 관리자 권한 확인 경고:", e);
  }

  try {
    updateNoticeAuth(user);
  } catch (e) {
    console.warn("[auth] 공지사항 권한 갱신 경고:", e);
  }

  try {
    syncUserFcm(user);
  } catch (e) {
    console.warn("[auth] FCM 동기화 경고:", e);
  }

  try {
    startDdaySubscription();
  } catch (e) {
    console.warn("[auth] D-Day 구독 경고:", e);
  }

  try {
    if (!stopWatchingProfiles) {
      stopWatchingProfiles = subscribeProfiles((profiles) => {
        setCurrentProfiles(profiles);
        const curUser = getCurrentUser();
        if (curUser && whoAmI) {
          whoAmI.textContent = profiles[curUser.uid] || curUser.displayName || "이름 없음";
        }
      });
    }
  } catch (e) {
    console.warn("[auth] 프로필 구독 경고:", e);
  }

  try {
    if (!stopWatchingEntries) {
      stopWatchingEntries = subscribeEntries((entries) => {
        render(entries);
        checkNewUpdates(entries);
      }, () => {
        showError("목록을 불러오지 못했습니다. 접근 권한을 확인하세요.");
      });
    }
  } catch (e) {
    console.warn("[auth] 일기 구독 경고:", e);
  }
}

/**
 * 암호 입력 팝업 모달을 표시합니다.
 */
function promptPasscode() {
  if (loginArea) loginArea.hidden = true;
  if (appArea) appArea.hidden = true;
  if (passcodeModal) passcodeModal.hidden = false;
  if (ddayBadgeBtn) ddayBadgeBtn.hidden = true;
  if (appFooter) appFooter.hidden = true;
  if (ddayModal) ddayModal.hidden = true;
  if (changelogModal) changelogModal.hidden = true;

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

const authStatus = document.getElementById("auth-status");

function showAuthError(err) {
  console.error("[auth]", err);
  const msg = err?.message || err?.code || String(err || "알 수 없는 오류");
  if (authStatus) {
    authStatus.style.display = "block";
    authStatus.textContent = `로그인 오류: ${err?.code ? `[${err.code}] ` : ""}${msg}`;
  }
  showError(`로그인 실패: ${msg}`);
}

function hideAuthError() {
  if (authStatus) {
    authStatus.style.display = "none";
    authStatus.textContent = "";
  }
  hideError();
}

function readPasscodeFlag(uid) {
  try {
    return sessionStorage.getItem(`diary_passcode_${uid}`) === "verified";
  } catch (e) {
    console.warn("[auth] sessionStorage 접근 불가:", e);
    return false; // 실패 시 암호 입력 화면으로 폴백 (blank 방지)
  }
}

/**
 * 로그인/로그아웃 이벤트 리스너를 등록하고 로그인 상태 감시를 시작합니다.
 * [중요] 동기 함수로 유지하여 Promise rejection이 상위 에러 처리를 우회하지 않도록 합니다.
 */
export function initAuth() {
  // ── 1) watchLogin 리스너를 "가장 먼저" 등록. 이후 어떤 실패도 화면을 막지 못합니다.
  watchLogin(async (user) => {
    try {
      setCurrentUser(user);
      if (user) {
        hideAuthError();
        if (readPasscodeFlag(user.uid)) {
          await grantAccess(user);
        } else {
          promptPasscode();
        }
        if (loginArea) loginArea.hidden = true;
      } else {
        // 완전 로그아웃된 상태 -> 구글 로그인 버튼 표시 및 보안 대상 은닉
        if (passcodeModal) passcodeModal.hidden = true;
        if (ddayBadgeBtn) ddayBadgeBtn.hidden = true;
        if (appFooter) appFooter.hidden = true;
        if (ddayModal) ddayModal.hidden = true;
        if (changelogModal) changelogModal.hidden = true;

        stopDdaySubscription();

        if (stopWatchingEntries) {
          stopWatchingEntries();
          stopWatchingEntries = null;
        }
        if (stopWatchingProfiles) {
          stopWatchingProfiles();
          stopWatchingProfiles = null;
        }
        if (appArea) appArea.hidden = true;
        if (loginArea) loginArea.hidden = false;
        if (othersList) othersList.innerHTML = "";
        if (myList) myList.innerHTML = "";
        updateNoticeAuth(null);
      }
    } catch (err) {
      console.error("[auth] watchLogin 처리 실패:", err);
      showAuthError(err);
      if (loginArea) loginArea.hidden = false;
    }
  });

  // ── 2) 리다이렉트 복귀 확인은 fire-and-forget. 에러 확인용으로만 사용하며 렌더는 하지 않습니다.
  consumeRedirectResult().then(({ ok, error }) => {
    if (!ok && error) {
      showAuthError(error);
    }
  });

  // ── 3) 로그인 버튼 이벤트 배선
  if (loginButton) {
    loginButton.addEventListener("click", async () => {
      hideAuthError();
      loginButton.disabled = true;
      loginButton.textContent = "로그인 중...";

      try {
        await loginWithGoogle();
      } catch (error) {
        if (error.code !== "auth/popup-closed-by-user" && error.code !== "auth/cancelled-popup-request") {
          showAuthError(error);
        }
      } finally {
        if (loginButton) {
          loginButton.disabled = false;
          loginButton.textContent = "구글 계정으로 로그인";
        }
      }
    });
  }

  // ── 4) 로그아웃 버튼 이벤트 배선
  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      const curUser = getCurrentUser();
      if (curUser) {
        try {
          sessionStorage.removeItem(`diary_passcode_${curUser.uid}`);
        } catch (e) {
          console.warn("[auth] sessionStorage 접근 실패:", e);
        }
      }
      logout();
    });
  }

  // ── 5) 암호 모달 이벤트 배선
  if (passcodeForm) {
    passcodeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const entered = passcodeInput.value.trim();
      const curUser = getCurrentUser();

      const isValid = await verifyPasscode(entered);
      if (isValid) {
        if (curUser) {
          try {
            sessionStorage.setItem(`diary_passcode_${curUser.uid}`, "verified");
          } catch (e) {
            console.warn("[auth] sessionStorage 저장 실패:", e);
          }
          await grantAccess(curUser);
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
        try {
          sessionStorage.removeItem(`diary_passcode_${curUser.uid}`);
        } catch (e) {
          console.warn("[auth] sessionStorage 접근 실패:", e);
        }
      }
      if (passcodeModal) passcodeModal.hidden = true;
      logout();
    });
  }
}




// =========================================================
// auth.js - 구글 로그인, 2단계 보안 및 세션/구독 관리 모듈
// 로그인/로그아웃 처리, 화면 전환, SHA-256 단방향 암호 검증 및 실시간 구독 생명주기 관리
// =========================================================

import {
  loginWithGoogle,
  logout,
  watchLogin,
  subscribeProfiles,
  subscribeEntries,
  subscribeAllDailyQuestions,
  consumeRedirectResult,
} from "./store.js";
import {
  setCurrentUser,
  setCurrentProfiles,
  setCurrentProfilePhotos,
  getCurrentUser,
  getCurrentProfiles,
  checkAdminStatus,
} from "./state.js";
import { showError, hideError, openModal, closeModal, closeAllModals } from "./ui.js";
import { updateProfileButtonsVisibility, updateHeaderAvatar } from "./profile.js";
import { render } from "./render.js";
import {
  updateNoticeAuth,
  startNoticeSubscription,
  stopNoticeSubscription,
} from "./notice.js";
import {
  checkNewUpdates,
  updateQuestionNotifications,
  syncUserFcm,
  resetNotifyState,
  checkTodayMilestoneNotifications,
} from "./notify.js";
import { startDdaySubscription, stopDdaySubscription } from "./dday.js";
import {
  refreshQuestionView,
  startDailyQuestionSubscription,
  stopDailyQuestionSubscription,
} from "./daily-question.js";
import { startNudgeSubscription, stopNudgeSubscription } from "./nudge.js";
import { checkMonthlyReportNotification } from "./report.js";

// 화면 요소
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const loginArea = document.getElementById("login-area");
const appArea = document.getElementById("app-area");
const whoAmI = document.getElementById("who-am-i");
const timelineList = document.getElementById("timeline-entry-list");

// 보호 대상 요소들 (인증 완료 사용자 전용)
const monthlyReportBtn = document.getElementById("monthly-report-btn");
const ddayBadgeBtn = document.getElementById("dday-badge-btn");
const notifWrapper = document.getElementById("notif-wrapper");
const mobileBottomNav = document.getElementById("mobile-bottom-nav");
const fabWriteBtn = document.getElementById("fab-write-btn");
const appFooter = document.getElementById("app-footer");

// 암호 모달 화면 요소
const passcodeModal = document.getElementById("passcode-modal");
const passcodeForm = document.getElementById("passcode-form");
const passcodeInput = document.getElementById("passcode-input");
const passcodeError = document.getElementById("passcode-error");
const passcodeCancelBtn = document.getElementById("passcode-cancel-btn");

// 2차 암호 SHA-256 단방향 해시
const PASSCODE_HASH = "f4b440c146ce37b3aba11158aa3d7157c0f9a2fd4f33de0145d9dd3c0f6f83fc";

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

let stopWatchingEntries = null;
let stopWatchingProfiles = null;
let stopWatchingQuestions = null;

function setProtectedChromeVisible(visible) {
  if (monthlyReportBtn) monthlyReportBtn.hidden = !visible;
  if (ddayBadgeBtn) ddayBadgeBtn.hidden = !visible;
  if (notifWrapper) notifWrapper.hidden = !visible;
  if (mobileBottomNav) mobileBottomNav.hidden = !visible;
  if (fabWriteBtn) {
    const editorOpen = document.getElementById("editor-section")?.hidden === false;
    fabWriteBtn.hidden = !visible || editorOpen;
  }
  if (appFooter) appFooter.hidden = !visible;
}

/**
 * 암호 검증 완료 후 다이어리 진입 및 실시간 데이터 구독을 시작합니다.
 */
async function grantAccess(user) {
  closeModal(passcodeModal);
  if (loginArea) loginArea.hidden = true;
  if (appArea) appArea.hidden = false;
  if (whoAmI) whoAmI.textContent = getCurrentProfiles()[user.uid] || user.displayName || "이름 없음";
  updateHeaderAvatar();

  setProtectedChromeVisible(true);

  try {
    await checkAdminStatus(user);
    updateProfileButtonsVisibility(user);
  } catch (e) {
    console.warn("[auth] 관리자 권한 확인 경고:", e);
  }

  try {
    updateNoticeAuth(user);
    startNoticeSubscription();
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
    startDailyQuestionSubscription();
  } catch (e) {
    console.warn("[auth] 문답 구독 경고:", e);
  }

  try {
    startNudgeSubscription();
  } catch (e) {
    console.warn("[auth] 콕 찌르기 구독 경고:", e);
  }

  try {
    if (!stopWatchingProfiles) {
      stopWatchingProfiles = subscribeProfiles((profiles, profilePhotos) => {
        setCurrentProfiles(profiles);
        if (profilePhotos) {
          setCurrentProfilePhotos(profilePhotos);
        }
        const curUser = getCurrentUser();
        if (curUser && whoAmI) {
          whoAmI.textContent = profiles[curUser.uid] || curUser.displayName || "이름 없음";
        }
        updateHeaderAvatar();
        render();
        refreshQuestionView();
      });
    }
  } catch (e) {
    console.warn("[auth] 프로필 구독 경고:", e);
  }

  try {
    if (!stopWatchingEntries) {
      stopWatchingEntries = subscribeEntries(
        (entries) => {
          render(entries);
          checkNewUpdates(entries);
        },
        () => {
          showError("목록을 불러오지 못했습니다. 접근 권한을 확인하세요.");
        }
      );
    }
  } catch (e) {
    console.warn("[auth] 일기 구독 경고:", e);
  }

  try {
    if (!stopWatchingQuestions) {
      stopWatchingQuestions = subscribeAllDailyQuestions((qDocs) => {
        updateQuestionNotifications(qDocs);
      });
    }
  } catch (e) {
    console.warn("[auth] 문답 알림 구독 경고:", e);
  }

  // 로그인 완료 후 월간 레포트 알림 및 당일 기념일 알림 확인
  try {
    checkMonthlyReportNotification();
    checkTodayMilestoneNotifications();
  } catch (e) {
    console.warn("[auth] 주기 알림 검사 경고:", e);
  }
}

function promptPasscode() {
  closeAllModals();
  if (loginArea) loginArea.hidden = true;
  if (appArea) appArea.hidden = true;
  setProtectedChromeVisible(false);

  if (passcodeError) {
    passcodeError.hidden = true;
    passcodeError.textContent = "";
  }
  if (passcodeInput) {
    passcodeInput.value = "";
    passcodeInput.classList.remove("shake");
  }

  openModal(passcodeModal);
  setTimeout(() => passcodeInput?.focus(), 100);
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
    return false;
  }
}

export function initAuth() {
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
        closeAllModals();
        setProtectedChromeVisible(false);

        stopDdaySubscription();
        stopDailyQuestionSubscription();
        stopNudgeSubscription();
        stopNoticeSubscription();
        resetNotifyState();

        if (stopWatchingEntries) {
          stopWatchingEntries();
          stopWatchingEntries = null;
        }
        if (stopWatchingProfiles) {
          stopWatchingProfiles();
          stopWatchingProfiles = null;
        }
        if (stopWatchingQuestions) {
          stopWatchingQuestions();
          stopWatchingQuestions = null;
        }
        if (appArea) appArea.hidden = true;
        if (loginArea) loginArea.hidden = false;
        if (timelineList) timelineList.innerHTML = "";
        updateNoticeAuth(null);
      }
    } catch (err) {
      console.error("[auth] watchLogin 처리 실패:", err);
      showAuthError(err);
      if (loginArea) loginArea.hidden = false;
    }
  });

  consumeRedirectResult().then(({ ok, error }) => {
    if (!ok && error) {
      console.warn("[auth] 이전 리다이렉트 로그인 결과 (안전 무시):", error);
    }
  });

  if (loginButton) {
    loginButton.addEventListener("click", () => {
      hideAuthError();
      loginButton.textContent = "로그인 요청 중...";

      loginWithGoogle()
        .then(() => {})
        .catch((error) => {
          console.error("[auth] 로그인 오류:", error);
          if (loginButton) {
            loginButton.disabled = false;
            loginButton.textContent = "구글 계정으로 로그인";
          }
          if (error.code === "auth/popup-blocked") {
            showAuthError(
              new Error(
                "브라우저 팝업이 차단되었습니다. 브라우저 설정에서 '팝업 차단'을 해제하거나 팝업 허용을 눌러주세요."
              )
            );
          } else if (
            error.code !== "auth/popup-closed-by-user" &&
            error.code !== "auth/cancelled-popup-request"
          ) {
            showAuthError(error);
          }
        })
        .finally(() => {
          if (loginButton && !getCurrentUser()) {
            loginButton.disabled = false;
            loginButton.textContent = "구글 계정으로 로그인";
          }
        });

      setTimeout(() => {
        if (loginButton && loginButton.textContent === "로그인 요청 중..." && !getCurrentUser()) {
          loginButton.disabled = true;
        }
      }, 500);
    });
  }

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
          void passcodeInput.offsetWidth;
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
      closeModal(passcodeModal);
      logout();
    });
  }
}

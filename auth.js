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

// 화면 요소
const loginButton = document.getElementById("login-button");
const logoutButton = document.getElementById("logout-button");
const loginArea = document.getElementById("login-area");
const appArea = document.getElementById("app-area");
const whoAmI = document.getElementById("who-am-i");
const listElement = document.getElementById("entry-list");

// 모듈 스코프 변수 (실시간 구독 해제 손잡이)
let stopWatchingEntries = null;
let stopWatchingProfiles = null;

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
    logoutButton.addEventListener("click", () => logout());
  }

  // ---------------------------------------------------------
  // 로그인 상태가 바뀔 때마다 실행됨
  // ---------------------------------------------------------
  watchLogin((user) => {
    setCurrentUser(user);
    if (user) {
      // 로그인됨
      if (loginArea) loginArea.hidden = true;
      if (appArea) appArea.hidden = false;
      if (whoAmI) whoAmI.textContent = getCurrentProfiles()[user.uid] || user.displayName || "이름 없음";

      // 관리자 권한에 따른 이름 변경 버튼 표시 갱신
      updateProfileButtonsVisibility(user);

      stopWatchingProfiles = subscribeProfiles((profiles) => {
        setCurrentProfiles(profiles);
        const curUser = getCurrentUser();
        if (curUser && whoAmI) {
          whoAmI.textContent = profiles[curUser.uid] || curUser.displayName || "이름 없음";
        }
      });

      stopWatchingEntries = subscribeEntries(render, () => {
        showError("목록을 불러오지 못했습니다. 접근 권한을 확인하세요.");
      });
    } else {
      // 로그아웃됨
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
      if (listElement) listElement.innerHTML = "";
      hideError();
    }
  });
}
